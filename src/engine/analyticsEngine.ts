import {
  CoachAnalysis,
  DailyGoal,
  DailyIncomeEntry,
  DayMetrics,
  GoalSettings,
  IncomeMetrics,
  IncomeRecord,
  LanguageCode,
  LeakageInsight,
  NumberFormatMode,
  OutsidePeriod,
  OutsideReason,
  TimeSession,
} from "../types/domain";
import {
  addDaysToDhakaDate,
  formatCurrencyBDT,
  formatDurationCompact,
  formatNumber,
  getDhakaDateParts,
  splitIntervalByDhakaDate,
} from "../utils/dhakaTime";

function parseHhMmToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

export function doesReasonCountAsBusiness(
  reason: OutsideReason | undefined,
  goalSettings: GoalSettings
): boolean {
  if (!reason) return false;
  if (reason.id === "lunch") return goalSettings.countLunchAsWork;
  if (reason.id === "rest") return goalSettings.countRestAsWork;
  if (reason.categoryType === "BUSINESS") return true;
  return reason.countsAsBusinessTime;
}

export function computeDayMetricsMap(params: {
  sessions: TimeSession[];
  outsidePeriods: OutsidePeriod[];
  reasons: OutsideReason[];
  dailyGoals: DailyGoal[];
  goalSettings: GoalSettings;
  nowMs?: number;
}): Map<string, DayMetrics> {
  const nowMs = params.nowMs ?? Date.now();
  const reasonMap = new Map(params.reasons.map((r) => [r.id, r]));
  const goalMap = new Map(params.dailyGoals.map((g) => [g.date, g]));
  const map = new Map<string, DayMetrics>();

  const ensureDay = (date: string): DayMetrics => {
    const existing = map.get(date);
    if (existing) return existing;
    const savedGoal = goalMap.get(date);
    const targetMinutes = savedGoal ? savedGoal.targetMinutes : params.goalSettings.dailyMinutes;
    const dayOfWeek = getDhakaDateParts(
      Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        Number(date.slice(8, 10)),
        6,
        0,
        0
      )
    ).dayOfWeek;
    const isRestDay = savedGoal
      ? savedGoal.isRestDay
      : params.goalSettings.weeklyRestDays.includes(dayOfWeek);

    const created: DayMetrics = {
      date,
      presenceMinutes: 0,
      businessOutsideMinutes: 0,
      personalOutsideMinutes: 0,
      totalBusinessMinutes: 0,
      targetMinutes,
      completionPct: 0,
      goalAchieved: false,
      isRestDay,
      entryCount: 0,
      exitCount: 0,
      firstCheckIn: null,
      lastCheckOut: null,
      arrivalDelayMinutes: null,
      earlyDepartureMinutes: null,
      productivityScore: null,
    };
    map.set(date, created);
    return created;
  };

  for (const s of params.sessions) {
    if (s.status === "NEEDS_REVIEW" && s.checkOut === null) {
      // Do not fabricate missing checkout times for interrupted/recovered sessions
      const checkInDate = getDhakaDateParts(s.checkIn).dateStr;
      const d = ensureDay(checkInDate);
      d.entryCount += 1;
      if (d.firstCheckIn === null || s.checkIn < d.firstCheckIn) d.firstCheckIn = s.checkIn;
      continue;
    }
    const endMs = s.checkOut ?? nowMs;
    const segments = splitIntervalByDhakaDate(s.checkIn, endMs);
    for (const seg of segments) {
      const d = ensureDay(seg.date);
      d.presenceMinutes += seg.minutes;
      if (seg.startMs === s.checkIn) {
        d.entryCount += 1;
        if (d.firstCheckIn === null || s.checkIn < d.firstCheckIn) d.firstCheckIn = s.checkIn;
      }
      if (s.checkOut !== null && seg.endMs === s.checkOut) {
        d.exitCount += 1;
        if (d.lastCheckOut === null || s.checkOut > d.lastCheckOut) d.lastCheckOut = s.checkOut;
      }
    }
  }

  for (const o of params.outsidePeriods) {
    // Only bound open outside period up to now if it belongs to today; never inflate multi-day forgotten exits
    const startParts = getDhakaDateParts(o.exitTime);
    const todayStr = getDhakaDateParts(nowMs).dateStr;
    if (o.returnTime === null && startParts.dateStr !== todayStr) {
      continue;
    }
    const endMs = o.returnTime ?? nowMs;
    const reason = reasonMap.get(o.reasonId);
    const isBusiness = doesReasonCountAsBusiness(reason, params.goalSettings);
    const segments = splitIntervalByDhakaDate(o.exitTime, endMs);
    for (const seg of segments) {
      const d = ensureDay(seg.date);
      if (isBusiness) {
        d.businessOutsideMinutes += seg.minutes;
      } else {
        d.personalOutsideMinutes += seg.minutes;
      }
    }
  }

  for (const [date, d] of map.entries()) {
    d.totalBusinessMinutes = d.presenceMinutes + d.businessOutsideMinutes;
    d.completionPct =
      d.targetMinutes > 0
        ? Math.min(100, Math.round((d.totalBusinessMinutes / d.targetMinutes) * 100))
        : 0;
    d.goalAchieved = !d.isRestDay && d.targetMinutes > 0 && d.totalBusinessMinutes >= d.targetMinutes;

    const savedGoal = goalMap.get(date);
    const prefStartMin = parseHhMmToMinutes(
      savedGoal?.preferredStart ?? params.goalSettings.preferredStart
    );
    const prefEndMin = parseHhMmToMinutes(
      savedGoal?.preferredEnd ?? params.goalSettings.preferredEnd
    );

    if (d.firstCheckIn !== null) {
      const p = getDhakaDateParts(d.firstCheckIn);
      const actualStartMin = p.hour * 60 + p.minute;
      d.arrivalDelayMinutes = actualStartMin - prefStartMin;
    }
    if (d.lastCheckOut !== null) {
      const p = getDhakaDateParts(d.lastCheckOut);
      const actualEndMin = p.hour * 60 + p.minute;
      d.earlyDepartureMinutes = prefEndMin - actualEndMin;
    }

    // Transparent formula for Productivity Score (0-100) only if at least 1 session exists
    if (d.entryCount > 0 || d.presenceMinutes > 0) {
      const targetPart = Math.min(60, (d.totalBusinessMinutes / Math.max(1, d.targetMinutes)) * 60);
      const delayPenalty =
        d.arrivalDelayMinutes && d.arrivalDelayMinutes > 15
          ? Math.min(20, (d.arrivalDelayMinutes - 15) * 0.4)
          : 0;
      const arrivalPart = 20 - delayPenalty;
      const totalTracked = d.totalBusinessMinutes + d.personalOutsideMinutes;
      const leakageRatio = totalTracked > 0 ? d.personalOutsideMinutes / totalTracked : 0;
      const disciplinePart = Math.max(0, 20 * (1 - leakageRatio * 1.5));
      d.productivityScore = Math.round(Math.min(100, Math.max(0, targetPart + arrivalPart + disciplinePart)));
    }
  }

  return map;
}

export function computeCurrentStreak(
  dayMap: Map<string, DayMetrics>,
  goalSettings: GoalSettings,
  todayStr: string
): { currentStreak: number; missedDaysLast30: number } {
  let streak = 0;
  // Check backwards from today (if today achieved, include today; otherwise start checking from yesterday)
  const todayMetrics = dayMap.get(todayStr);
  let cursor = todayMetrics?.goalAchieved ? todayStr : addDaysToDhakaDate(todayStr, -1);

  for (let i = 0; i < 365; i++) {
    const m = dayMap.get(cursor);
    const dow = getDhakaDateParts(
      Date.UTC(
        Number(cursor.slice(0, 4)),
        Number(cursor.slice(5, 7)) - 1,
        Number(cursor.slice(8, 10)),
        6,
        0,
        0
      )
    ).dayOfWeek;
    const isRest = m?.isRestDay ?? goalSettings.weeklyRestDays.includes(dow);
    if (isRest) {
      cursor = addDaysToDhakaDate(cursor, -1);
      continue;
    }
    if (m && m.goalAchieved) {
      streak += 1;
      cursor = addDaysToDhakaDate(cursor, -1);
    } else {
      break;
    }
  }

  let missedDaysLast30 = 0;
  for (let i = 1; i <= 30; i++) {
    const dStr = addDaysToDhakaDate(todayStr, -i);
    const m = dayMap.get(dStr);
    const dow = getDhakaDateParts(
      Date.UTC(
        Number(dStr.slice(0, 4)),
        Number(dStr.slice(5, 7)) - 1,
        Number(dStr.slice(8, 10)),
        6,
        0,
        0
      )
    ).dayOfWeek;
    const isRest = m?.isRestDay ?? goalSettings.weeklyRestDays.includes(dow);
    if (!isRest && (!m || !m.goalAchieved)) {
      if (m && m.entryCount > 0) {
        missedDaysLast30 += 1;
      }
    }
  }

  return { currentStreak: streak, missedDaysLast30 };
}

export function computeIncomeMetricsForMonth(params: {
  monthStr: string;
  dayMap: Map<string, DayMetrics>;
  incomeRecords: IncomeRecord[];
  dailyIncomeEntries: DailyIncomeEntry[];
}): IncomeMetrics {
  let physicalMin = 0;
  let businessMin = 0;
  for (const [date, m] of params.dayMap.entries()) {
    if (date.startsWith(params.monthStr)) {
      physicalMin += m.presenceMinutes;
      businessMin += m.totalBusinessMinutes;
    }
  }

  const physicalHours = physicalMin / 60;
  const businessHours = businessMin / 60;

  const monthlyRec = params.incomeRecords.find((r) => r.month === params.monthStr);
  const dailyForMonth = params.dailyIncomeEntries.filter((d) => d.date.startsWith(params.monthStr));

  let totalRevenue = 0;
  let totalExpenses = 0;
  let netProfit = 0;
  let isConfirmed = false;

  if (monthlyRec) {
    totalRevenue = monthlyRec.revenue;
    totalExpenses = monthlyRec.expenses + monthlyRec.costOfGoods + monthlyRec.otherCosts;
    netProfit = monthlyRec.netProfit;
    isConfirmed = monthlyRec.isConfirmed;
  } else if (dailyForMonth.length > 0) {
    totalRevenue = dailyForMonth.reduce((acc, x) => acc + x.revenue, 0);
    totalExpenses = dailyForMonth.reduce((acc, x) => acc + x.expenses, 0);
    netProfit = totalRevenue - totalExpenses;
    isConfirmed = false;
  }

  // Zero-division protection
  const revenuePerPhysicalHour = physicalHours > 0 ? totalRevenue / physicalHours : 0;
  const profitPerPhysicalHour = physicalHours > 0 ? netProfit / physicalHours : 0;
  const revenuePerBusinessHour = businessHours > 0 ? totalRevenue / businessHours : 0;
  const profitPerBusinessHour = businessHours > 0 ? netProfit / businessHours : 0;

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    isConfirmed,
    physicalHours,
    businessHours,
    revenuePerPhysicalHour,
    profitPerPhysicalHour,
    revenuePerBusinessHour,
    profitPerBusinessHour,
  };
}

export function analyzeTimeLeakage(params: {
  dayMap: Map<string, DayMetrics>;
  outsidePeriods: OutsidePeriod[];
  reasons: OutsideReason[];
  goalSettings: GoalSettings;
  todayStr: string;
  numberFormat: NumberFormatMode;
}): LeakageInsight[] {
  const insights: LeakageInsight[] = [];
  const last7Dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    last7Dates.push(addDaysToDhakaDate(params.todayStr, -i));
  }
  const prev7Dates: string[] = [];
  for (let i = 7; i < 14; i++) {
    prev7Dates.push(addDaysToDhakaDate(params.todayStr, -i));
  }

  const activeLast7 = last7Dates
    .map((d) => params.dayMap.get(d))
    .filter((m): m is DayMetrics => Boolean(m && (m.entryCount > 0 || m.presenceMinutes > 0)));

  // Require sufficient actual records (at least 2 active days)
  if (activeLast7.length < 2) {
    return [];
  }

  const personalMins7 = activeLast7.reduce((s, d) => s + d.personalOutsideMinutes, 0);
  const totalExits7 = activeLast7.reduce((s, d) => s + d.exitCount, 0);
  const presence7 = activeLast7.reduce((s, d) => s + d.presenceMinutes, 0);

  if (personalMins7 >= 120) {
    const hrsTextBn = formatDurationCompact(personalMins7, "bn", params.numberFormat);
    const hrsTextEn = formatDurationCompact(personalMins7, "en", params.numberFormat);
    insights.push({
      id: "leak_personal",
      type: "LONG_PERSONAL_BREAK",
      severity: "warning",
      titleBn: "ব্যক্তিগত কাজে অতিরিক্ত বাইরে সময়",
      titleEn: "High Personal Time Outside Shop",
      detailBn: `গত ৭ দিনে ব্যক্তিগত কারণে দোকানের বাইরে ${hrsTextBn} ব্যয় হয়েছে।`,
      detailEn: `You spent ${hrsTextEn} outside for personal reasons over the last 7 days.`,
      recommendationBn: "দুপুরের বিরতি ও ব্যক্তিগত কাজের জন্য প্রতিদিন নির্দিষ্ট ৬০ মিনিট সীমা নির্ধারণ করুন।",
      recommendationEn: "Consider setting a fixed 60-minute daily cap for lunch and personal errands.",
    });
  }

  const arrivalDelays = activeLast7
    .map((d) => d.arrivalDelayMinutes)
    .filter((v): v is number => v !== null);
  if (arrivalDelays.length >= 2) {
    const avgDelay = Math.round(arrivalDelays.reduce((a, b) => a + b, 0) / arrivalDelays.length);
    if (avgDelay >= 20) {
      const mBn = formatNumber(avgDelay, params.numberFormat);
      insights.push({
        id: "leak_late",
        type: "LATE_ARRIVAL",
        severity: "warning",
        titleBn: "দোকানে দেরিতে প্রবেশের প্রবণতা",
        titleEn: "Late Shop Arrival Pattern",
        detailBn: `আপনার গড় প্রবেশ সময় নির্ধারিত সময়ের (${params.goalSettings.preferredStart}) চেয়ে ${mBn} মিনিট দেরিতে।`,
        detailEn: `Your average arrival is ${mBn} minutes later than your preferred opening time (${params.goalSettings.preferredStart}).`,
        recommendationBn: "দোকান খোলার ১৫ মিনিট আগে রিমাইন্ডার চালু রাখুন এবং সকালের কাজ আগের রাতে গুছিয়ে রাখুন।",
        recommendationEn: "Keep an opening reminder 15 minutes early and prepare morning tasks the evening before.",
      });
    }
  }

  const earlyDepartures = activeLast7
    .map((d) => d.earlyDepartureMinutes)
    .filter((v): v is number => v !== null);
  if (earlyDepartures.length >= 2) {
    const avgEarly = Math.round(
      earlyDepartures.reduce((a, b) => a + b, 0) / earlyDepartures.length
    );
    if (avgEarly >= 25) {
      const mBn = formatNumber(avgEarly, params.numberFormat);
      insights.push({
        id: "leak_early",
        type: "EARLY_DEPARTURE",
        severity: "info",
        titleBn: "নির্ধারিত সময়ের আগে দোকান বন্ধ",
        titleEn: "Earlier Than Planned Closing",
        detailBn: `গত সপ্তাহে গড়ে নির্ধারিত সময়ের ${mBn} মিনিট আগে দোকান ছেড়েছেন।`,
        detailEn: `You departed on average ${mBn} minutes earlier than your target closing time.`,
        recommendationBn: "সন্ধ্যার শেষ ১ ঘণ্টা হিসাব ও পরের দিনের পরিকল্পনায় ব্যবহার করলে লক্ষ্য পূর্ণ হবে।",
        recommendationEn: "Using the final hour for daily closing accounts and next-day planning can close the gap.",
      });
    }
  }

  if (totalExits7 / activeLast7.length >= 3.5) {
    const avgExits = formatNumber(Number((totalExits7 / activeLast7.length).toFixed(1)), params.numberFormat, 1);
    insights.push({
      id: "leak_frequent_exits",
      type: "FREQUENT_EXITS",
      severity: "warning",
      titleBn: "ঘন ঘন দোকান থেকে বের হওয়া",
      titleEn: "Frequent Daily Exits",
      detailBn: `প্রতিদিন গড়ে ${avgExits} বার দোকান থেকে বাইরে যাচ্ছেন, যা কাজের মনোযোগ নষ্ট করতে পারে।`,
      detailEn: `You average ${avgExits} exits per active day, which fragments focused shop work.`,
      recommendationBn: "ব্যাংক, বাজার ও ছোট কাজগুলো দিনের একটি নির্দিষ্ট সময়ে একসাথে সেরে ফেলুন।",
      recommendationEn: "Batch banking, errands, and short trips into one scheduled window per day.",
    });
  }

  // Repeated short trips (<15 min)
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const shortTrips = params.outsidePeriods.filter(
    (o) =>
      o.exitTime >= sevenDaysAgoMs &&
      o.returnTime !== null &&
      (o.returnTime - o.exitTime) / 60000 <= 15
  );
  if (shortTrips.length >= 4) {
    const cnt = formatNumber(shortTrips.length, params.numberFormat);
    insights.push({
      id: "leak_short_trips",
      type: "REPEATED_SHORT_TRIPS",
      severity: "info",
      titleBn: "একাধিক ছোট বিরতি / যাতায়াত",
      titleEn: "Repeated Short Outside Trips",
      detailBn: `গত ৭ দিনে ১৫ মিনিটের কম সময়ের ${cnt}টি সংক্ষিপ্ত বিরতি রেকর্ড হয়েছে।`,
      detailEn: `${cnt} short outside trips under 15 minutes were logged in the past 7 days.`,
      recommendationBn: "ছোটখাটো প্রয়োজনীয় সামগ্রী দোকানেই আগে থেকে মজুত রাখলে বারবার বের হতে হবে না।",
      recommendationEn: "Keep everyday essentials stocked at the shop to avoid repeated 10–15 minute trips.",
    });
  }

  // Week-over-week comparison
  const activePrev7 = prev7Dates
    .map((d) => params.dayMap.get(d))
    .filter((m): m is DayMetrics => Boolean(m && m.presenceMinutes > 0));
  if (activePrev7.length >= 2) {
    const prevPresence = activePrev7.reduce((s, d) => s + d.presenceMinutes, 0);
    if (prevPresence > 0) {
      const pctChange = Math.round(((presence7 - prevPresence) / prevPresence) * 100);
      if (pctChange >= 8) {
        const pctStr = formatNumber(pctChange, params.numberFormat);
        insights.push({
          id: "leak_positive_wow",
          type: "POSITIVE_PROGRESS",
          severity: "positive",
          titleBn: "দোকানে উপস্থিতির ধারাবাহিক উন্নতি",
          titleEn: "Improved Shop Presence Consistency",
          detailBn: `পূর্ববর্তী সপ্তাহের তুলনায় আপনার দোকানে উপস্থিতি ${pctStr}% বৃদ্ধি পেয়েছে।`,
          detailEn: `Your shop presence increased by ${pctStr}% compared to the previous 7 days.`,
          recommendationBn: "এই ছন্দ ধরে রাখুন এবং সপ্তাহান্তে একটি বিশ্রামের দিন অবশ্যই পালন করুন।",
          recommendationEn: "Maintain this rhythm while protecting your scheduled weekly rest day.",
        });
      }
    }
  }

  return insights;
}

export function buildLocalProductivityCoach(params: {
  dayMap: Map<string, DayMetrics>;
  leakage: LeakageInsight[];
  goalSettings: GoalSettings;
  incomeMetrics: IncomeMetrics;
  todayStr: string;
  lang: LanguageCode;
  numberFormat: NumberFormatMode;
}): CoachAnalysis {
  const last7: DayMetrics[] = [];
  for (let i = 0; i < 7; i++) {
    const m = params.dayMap.get(addDaysToDhakaDate(params.todayStr, -i));
    if (m) last7.push(m);
  }

  const activeDays = last7.filter((d) => d.entryCount > 0 || d.presenceMinutes > 0);
  if (activeDays.length === 0) {
    return {
      source: "LOCAL",
      observations: [
        params.lang === "bn"
          ? "গত ৭ দিনে পর্যাপ্ত সেশন রেকর্ড না থাকায় বিস্তারিত বিশ্লেষণ তৈরি হয়নি।"
          : "No time sessions recorded in the past 7 days yet.",
      ],
      suggestions: [
        params.lang === "bn"
          ? "আজ প্রথম Check In করে ট্র্যাকিং শুরু করুন — ৩ দিন পরেই ব্যক্তিগত পরামর্শ পাবেন।"
          : "Record your first Check In today — tailored coaching insights unlock after 2–3 tracked days.",
      ],
      weeklyChallenge:
        params.lang === "bn"
          ? "আগামী ৩ দিন নিয়মিত দোকানে প্রবেশ ও প্রস্থানের সময় রেকর্ড করুন।"
          : "Log every Check In and Check Out consistently for the next 3 days.",
    };
  }

  const totalPresenceMin = activeDays.reduce((s, d) => s + d.presenceMinutes, 0);
  const totalBusinessMin = activeDays.reduce((s, d) => s + d.totalBusinessMinutes, 0);
  const totalPersonalMin = activeDays.reduce((s, d) => s + d.personalOutsideMinutes, 0);
  const weeklyTargetMin = params.goalSettings.weeklyMinutes;
  const diffMin = weeklyTargetMin - totalBusinessMin;

  const observations: string[] = [];
  const suggestions: string[] = [];

  if (params.lang === "bn") {
    observations.push(
      `গত ৭ দিনে ${formatNumber(activeDays.length, params.numberFormat)} দিন সক্রিয় ছিলেন এবং দোকানে মোট ${formatDurationCompact(totalPresenceMin, "bn", params.numberFormat)} অবস্থান করেছেন।`
    );
    if (diffMin > 60) {
      observations.push(
        `সাপ্তাহিক লক্ষ্যের তুলনায় ${formatDurationCompact(diffMin, "bn", params.numberFormat)} কম কাজ হয়েছে (ব্যক্তিগত বাইরে ব্যয়: ${formatDurationCompact(totalPersonalMin, "bn", params.numberFormat)})।`
      );
    } else {
      observations.push(`আপনি সাপ্তাহিক কর্মঘণ্টার লক্ষ্যের কাছাকাছি বা উপরে অবস্থান করছেন।`);
    }
    if (params.incomeMetrics.businessHours > 0 && params.incomeMetrics.totalRevenue > 0) {
      observations.push(
        `চলতি মাসে প্রতি কর্মঘণ্টায় গড় আয় ${formatCurrencyBDT(params.incomeMetrics.revenuePerBusinessHour, params.numberFormat)} এবং নিট লাভ ${formatCurrencyBDT(params.incomeMetrics.profitPerBusinessHour, params.numberFormat)}।`
      );
    }
  } else {
    observations.push(
      `You tracked ${activeDays.length} active days in the past 7 days with ${formatDurationCompact(totalPresenceMin, "en", params.numberFormat)} inside the shop.`
    );
    if (diffMin > 60) {
      observations.push(
        `You are ${formatDurationCompact(diffMin, "en", params.numberFormat)} behind your weekly target (personal outside time: ${formatDurationCompact(totalPersonalMin, "en", params.numberFormat)}).`
      );
    } else {
      observations.push(`You are on pace or ahead of your weekly business hours goal.`);
    }
    if (params.incomeMetrics.businessHours > 0 && params.incomeMetrics.totalRevenue > 0) {
      observations.push(
        `This month averages ${formatCurrencyBDT(params.incomeMetrics.revenuePerBusinessHour, params.numberFormat)}/hr revenue and ${formatCurrencyBDT(params.incomeMetrics.profitPerBusinessHour, params.numberFormat)}/hr net profit.`
      );
    }
  }

  for (const l of params.leakage.slice(0, 2)) {
    suggestions.push(params.lang === "bn" ? l.recommendationBn : l.recommendationEn);
  }
  if (suggestions.length === 0) {
    suggestions.push(
      params.lang === "bn"
        ? "দৈনিক বিরতির সময় ৬০ মিনিটের মধ্যে রাখুন এবং সপ্তাহের প্রতিটি দিনে নির্ধারিত সময়ে দোকান খুলুন।"
        : "Keep daily breaks within 60 minutes and open at your preferred opening time."
    );
  }

  const weeklyChallenge =
    params.lang === "bn"
      ? `আগামী ৭ দিন প্রতিদিন অন্তত ${formatDurationCompact(params.goalSettings.dailyMinutes, "bn", params.numberFormat)} ব্যবসায়িক সময় পূর্ণ করার চ্যালেঞ্জ নিন।`
      : `Challenge: Achieve at least ${formatDurationCompact(params.goalSettings.dailyMinutes, "en", params.numberFormat)} of business time on every scheduled workday this week.`;

  return {
    source: "LOCAL",
    observations,
    suggestions,
    weeklyChallenge,
  };
}
