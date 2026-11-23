import React, { useMemo, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  Download,
  FileSpreadsheet,
  Printer,
  Target,
  Wallet,
} from "lucide-react";
import { putItem, uid } from "../db/indexedDb";
import {
  analyzeTimeLeakage,
  buildLocalProductivityCoach,
  computeIncomeMetricsForMonth,
} from "../engine/analyticsEngine";
import {
  downloadTextFile,
  generateCsvContent,
  generatePrintableBengaliReportHtml,
} from "../engine/exporter";
import {
  AppPreferences,
  CoachAnalysis,
  DailyIncomeEntry,
  DayMetrics,
  GoalSettings,
  IncomeRecord,
  OutsidePeriod,
  OutsideReason,
  Shop,
  TimeSession,
} from "../types/domain";
import {
  addDaysToDhakaDate,
  formatCurrencyBDT,
  formatDurationCompact,
  formatNumber,
} from "../utils/dhakaTime";
import {
  DailyHoursBarChart,
  OutsideReasonPieChart,
  RevenueProfitChart,
  TrendLineChart,
} from "./Charts";

export const AnalyticsView: React.FC<{
  todayStr: string;
  shop: Shop | null;
  prefs: AppPreferences;
  sessions: TimeSession[];
  outsidePeriods: OutsidePeriod[];
  reasons: OutsideReason[];
  dayMap: Map<string, DayMetrics>;
  goalSettings: GoalSettings;
  incomeRecords: IncomeRecord[];
  dailyIncomeEntries: DailyIncomeEntry[];
  currentStreak: number;
  onRefresh: () => Promise<void>;
}> = ({
  todayStr,
  shop,
  prefs,
  sessions,
  outsidePeriods,
  reasons,
  dayMap,
  goalSettings,
  incomeRecords,
  dailyIncomeEntries,
  currentStreak,
  onRefresh,
}) => {
  const lang = prefs.language;
  const nf = prefs.numberFormat;

  const [subTab, setSubTab] = useState<"REPORTS" | "INCOME" | "GOALS" | "COACH" | "EXPORT">(
    "REPORTS"
  );
  const [reportPeriod, setReportPeriod] = useState<"DAILY" | "WEEKLY" | "MONTHLY" | "ANNUAL" | "CUSTOM">("WEEKLY");
  const [customStart, setCustomStart] = useState(addDaysToDhakaDate(todayStr, -13));
  const [customEnd, setCustomEnd] = useState(todayStr);

  // Income form state
  const currentMonthStr = todayStr.slice(0, 7);
  const [incMonth, setIncMonth] = useState(currentMonthStr);
  const existingInc = incomeRecords.find((r) => r.month === incMonth);
  const [revenue, setRevenue] = useState(existingInc ? String(existingInc.revenue) : "");
  const [expenses, setExpenses] = useState(existingInc ? String(existingInc.expenses) : "");
  const [cogs, setCogs] = useState(existingInc ? String(existingInc.costOfGoods) : "");
  const [otherCosts, setOtherCosts] = useState(existingInc ? String(existingInc.otherCosts) : "");
  const [isConfirmed, setIsConfirmed] = useState(existingInc?.isConfirmed ?? false);
  const [incSavedMsg, setIncSavedMsg] = useState("");

  // Daily optional income
  const [dailyRev, setDailyRev] = useState("");
  const [dailyExp, setDailyExp] = useState("");

  // Goals state
  const [dailyHrs, setDailyHrs] = useState(String(Math.round(goalSettings.dailyMinutes / 60)));
  const [weeklyHrs, setWeeklyHrs] = useState(String(Math.round(goalSettings.weeklyMinutes / 60)));
  const [monthlyHrs, setMonthlyHrs] = useState(String(Math.round(goalSettings.monthlyMinutes / 60)));
  const [prefStart, setPrefStart] = useState(goalSettings.preferredStart);
  const [prefEnd, setPrefEnd] = useState(goalSettings.preferredEnd);
  const [breakMin, setBreakMin] = useState(String(goalSettings.breakMinutes));
  const [restDays, setRestDays] = useState<number[]>(goalSettings.weeklyRestDays);
  const [countLunch, setCountLunch] = useState(goalSettings.countLunchAsWork);
  const [countRest, setCountRest] = useState(goalSettings.countRestAsWork);
  const [goalSavedMsg, setGoalSavedMsg] = useState("");

  // AI Coach state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiCoachResult, setAiCoachResult] = useState<CoachAnalysis | null>(null);

  const rangeDays = useMemo(() => {
    const dates: string[] = [];
    if (reportPeriod === "DAILY") {
      dates.push(todayStr);
    } else if (reportPeriod === "WEEKLY") {
      for (let i = 6; i >= 0; i--) dates.push(addDaysToDhakaDate(todayStr, -i));
    } else if (reportPeriod === "MONTHLY") {
      for (let i = 29; i >= 0; i--) dates.push(addDaysToDhakaDate(todayStr, -i));
    } else if (reportPeriod === "ANNUAL") {
      for (let i = 364; i >= 0; i--) dates.push(addDaysToDhakaDate(todayStr, -i));
    } else {
      let cur = customStart;
      for (let i = 0; i < 366 && cur <= customEnd; i++) {
        dates.push(cur);
        cur = addDaysToDhakaDate(cur, 1);
      }
    }
    return dates.map((d) => {
      const m = dayMap.get(d);
      return (
        m ?? {
          date: d,
          presenceMinutes: 0,
          businessOutsideMinutes: 0,
          personalOutsideMinutes: 0,
          totalBusinessMinutes: 0,
          targetMinutes: goalSettings.dailyMinutes,
          completionPct: 0,
          goalAchieved: false,
          isRestDay: false,
          entryCount: 0,
          exitCount: 0,
          firstCheckIn: null,
          lastCheckOut: null,
          arrivalDelayMinutes: null,
          earlyDepartureMinutes: null,
          productivityScore: null,
        }
      );
    });
  }, [reportPeriod, customStart, customEnd, todayStr, dayMap, goalSettings.dailyMinutes]);

  const incomeMetrics = useMemo(
    () =>
      computeIncomeMetricsForMonth({
        monthStr: incMonth,
        dayMap,
        incomeRecords,
        dailyIncomeEntries,
      }),
    [incMonth, dayMap, incomeRecords, dailyIncomeEntries]
  );

  const leakageInsights = useMemo(
    () =>
      analyzeTimeLeakage({
        dayMap,
        outsidePeriods,
        reasons,
        goalSettings,
        todayStr,
        numberFormat: nf,
      }),
    [dayMap, outsidePeriods, reasons, goalSettings, todayStr, nf]
  );

  const localCoach = useMemo(
    () =>
      buildLocalProductivityCoach({
        dayMap,
        leakage: leakageInsights,
        goalSettings,
        incomeMetrics,
        todayStr,
        lang,
        numberFormat: nf,
      }),
    [dayMap, leakageInsights, goalSettings, incomeMetrics, todayStr, lang, nf]
  );

  const totalPresenceMin = rangeDays.reduce((s, d) => s + d.presenceMinutes, 0);
  const totalBusOutMin = rangeDays.reduce((s, d) => s + d.businessOutsideMinutes, 0);
  const totalPerOutMin = rangeDays.reduce((s, d) => s + d.personalOutsideMinutes, 0);
  const totalBusinessMin = totalPresenceMin + totalBusOutMin;
  const activeCount = rangeDays.filter((d) => d.entryCount > 0 || d.presenceMinutes > 0).length;
  const goalHitCount = rangeDays.filter((d) => d.goalAchieved).length;

  const outsideSlices = useMemo(() => {
    const startDate = rangeDays[0]?.date ?? todayStr;
    const endDate = rangeDays[rangeDays.length - 1]?.date ?? todayStr;
    const reasonMap = new Map(reasons.map((r) => [r.id, r]));
    const totals = new Map<string, { label: string; minutes: number; isBusiness: boolean }>();

    for (const o of outsidePeriods) {
      if (!o.returnTime) continue;
      const dStr = new Date(o.exitTime + 6 * 3600 * 1000).toISOString().slice(0, 10);
      if (dStr < startDate || dStr > endDate) continue;
      const r = reasonMap.get(o.reasonId);
      const label = lang === "bn" ? r?.nameBn ?? o.reasonId : r?.nameEn ?? o.reasonId;
      const mins = Math.max(0, (o.returnTime - o.exitTime) / 60000);
      const prev = totals.get(o.reasonId);
      totals.set(o.reasonId, {
        label,
        minutes: (prev?.minutes ?? 0) + mins,
        isBusiness: Boolean(r?.categoryType === "BUSINESS" || r?.countsAsBusinessTime),
      });
    }
    return Array.from(totals.values()).sort((a, b) => b.minutes - a.minutes);
  }, [outsidePeriods, reasons, rangeDays, todayStr, lang]);

  const barData = useMemo(() => {
    const slice = reportPeriod === "ANNUAL" ? rangeDays.slice(-14) : rangeDays.slice(-10);
    return slice.map((d) => ({
      label: d.date.slice(5),
      presenceHours: Number((d.presenceMinutes / 60).toFixed(2)),
      businessOutsideHours: Number((d.businessOutsideMinutes / 60).toFixed(2)),
      targetHours: Number((d.targetMinutes / 60).toFixed(2)),
    }));
  }, [rangeDays, reportPeriod]);

  const prodPoints = useMemo(() => {
    return rangeDays
      .filter((d) => d.productivityScore !== null)
      .slice(-10)
      .map((d) => ({
        label: d.date.slice(5),
        value: d.productivityScore ?? 0,
      }));
  }, [rangeDays]);

  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const rev = Number(revenue) || 0;
    const exp = Number(expenses) || 0;
    const cg = Number(cogs) || 0;
    const oc = Number(otherCosts) || 0;
    const net = rev - (exp + cg + oc);
    const rec: IncomeRecord = {
      id: existingInc?.id ?? incMonth,
      month: incMonth,
      revenue: rev,
      expenses: exp,
      costOfGoods: cg,
      otherCosts: oc,
      netProfit: net,
      isConfirmed,
      notes: "",
      updatedAt: Date.now(),
    };
    await putItem("incomeRecords", rec);
    await onRefresh();
    setIncSavedMsg(lang === "bn" ? "মাসিক আয়-ব্যয় সংরক্ষিত হয়েছে।" : "Monthly income saved.");
  };

  const handleSaveDailyIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const rev = Number(dailyRev) || 0;
    const exp = Number(dailyExp) || 0;
    if (rev === 0 && exp === 0) return;
    const item: DailyIncomeEntry = {
      id: uid("dinc"),
      date: todayStr,
      revenue: rev,
      expenses: exp,
      notes: "",
      createdAt: Date.now(),
    };
    await putItem("dailyIncomeEntries", item);
    setDailyRev("");
    setDailyExp("");
    await onRefresh();
  };

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: GoalSettings = {
      ...goalSettings,
      dailyMinutes: Math.max(60, (Number(dailyHrs) || 10) * 60),
      weeklyMinutes: Math.max(60, (Number(weeklyHrs) || 60) * 60),
      monthlyMinutes: Math.max(60, (Number(monthlyHrs) || 260) * 60),
      preferredStart: prefStart,
      preferredEnd: prefEnd,
      breakMinutes: Math.max(0, Number(breakMin) || 60),
      weeklyRestDays: restDays,
      countLunchAsWork: countLunch,
      countRestAsWork: countRest,
    };
    await putItem("goalSettings", updated);
    await onRefresh();
    setGoalSavedMsg(lang === "bn" ? "লক্ষ্য ও সময়সূচি সংরক্ষিত হয়েছে।" : "Goals updated.");
  };

  const handleAskGeminiCoach = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const last7 = [];
      for (let i = 0; i < 7; i++) {
        const m = dayMap.get(addDaysToDhakaDate(todayStr, -i));
        if (m) last7.push(m);
      }
      const delays = last7.map((d) => d.arrivalDelayMinutes).filter((v): v is number => v !== null);
      const avgDelay = delays.length > 0 ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;

      const res = await fetch("/api/coach/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: lang,
          summary: {
            periodDaysAnalyzed: last7.filter((d) => d.entryCount > 0).length,
            totalShopHours: Number((last7.reduce((s, d) => s + d.presenceMinutes, 0) / 60).toFixed(1)),
            totalBusinessOutsideHours: Number((last7.reduce((s, d) => s + d.businessOutsideMinutes, 0) / 60).toFixed(1)),
            totalPersonalOutsideHours: Number((last7.reduce((s, d) => s + d.personalOutsideMinutes, 0) / 60).toFixed(1)),
            dailyTargetHours: Number((goalSettings.dailyMinutes / 60).toFixed(1)),
            goalAchievementRatePct:
              last7.length > 0 ? Math.round((last7.filter((d) => d.goalAchieved).length / last7.length) * 100) : 0,
            avgArrivalDelayMinutes: avgDelay,
            exitCount: last7.reduce((s, d) => s + d.exitCount, 0),
            revenuePerHourBdt: Math.round(incomeMetrics.revenuePerBusinessHour),
            profitPerHourBdt: Math.round(incomeMetrics.profitPerBusinessHour),
            currentStreakDays: currentStreak,
            topLeakageReasons: leakageInsights.map((l) => (lang === "bn" ? l.titleBn : l.titleEn)),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to contact Gemini coach");
      }
      setAiCoachResult({
        observations: data.observations ?? [],
        suggestions: data.suggestions ?? [],
        weeklyChallenge: data.weeklyChallenge ?? "",
        source: "GEMINI",
      });
    } catch (err) {
      setAiError(
        err instanceof Error
          ? err.message
          : lang === "bn"
            ? "এআই বিশ্লেষণ পাওয়া যায়নি (অফলাইন কোচ চালু আছে)।"
            : "AI analysis unavailable (local coach remains active)."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handlePrintPdf = () => {
    const html = generatePrintableBengaliReportHtml({
      shop,
      title: lang === "bn" ? "ব্যবসায়িক সময় ও আয় প্রতিবেদন" : "Business Time & Income Report",
      rangeLabel: `${rangeDays[0]?.date ?? todayStr} → ${rangeDays[rangeDays.length - 1]?.date ?? todayStr}`,
      days: rangeDays,
      sessions,
      outsidePeriods,
      reasons,
      incomeMetrics,
      lang,
      numberFormat: nf,
    });
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 1500);
      }, 400);
    }
  };

  const activeCoach = aiCoachResult ?? localCoach;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {lang === "bn" ? "স্মার্ট বিশ্লেষণ ও আয় ব্যবস্থাপনা" : "Smart Analytics & Income"}
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {lang === "bn"
            ? "প্রকৃত ডাটাবেস রেকর্ডের উপর ভিত্তি করে কর্মঘণ্টা, সময়ের অপচয় ও লাভের হিসাব।"
            : "All charts, leakage insights, and hourly earnings computed from verified records."}
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900 overflow-x-auto">
        {(
          [
            ["REPORTS", lang === "bn" ? "রিপোর্ট ও চার্ট" : "Reports & Charts", BarChart3],
            ["INCOME", lang === "bn" ? "আয়-ব্যয় (৳)" : "Income Manager", Wallet],
            ["GOALS", lang === "bn" ? "লক্ষ্য ও সময়" : "Goals", Target],
            ["COACH", lang === "bn" ? "স্মার্ট কোচ" : "Smart Coach", BrainCircuit],
            ["EXPORT", lang === "bn" ? "এক্সপোর্ট" : "Export", Download],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              subTab === key
                ? "bg-white dark:bg-[#111714] text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {subTab === "REPORTS" && (
        <div className="space-y-5">
          {/* Period Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {(["DAILY", "WEEKLY", "MONTHLY", "ANNUAL", "CUSTOM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setReportPeriod(p)}
                className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium transition-colors ${
                  reportPeriod === p
                    ? "bg-emerald-600 text-white"
                    : "border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {p === "DAILY"
                  ? lang === "bn"
                    ? "দৈনিক"
                    : "Daily"
                  : p === "WEEKLY"
                    ? lang === "bn"
                      ? "সাপ্তাহিক"
                      : "Weekly"
                    : p === "MONTHLY"
                      ? lang === "bn"
                        ? "মাসিক"
                        : "Monthly"
                      : p === "ANNUAL"
                        ? lang === "bn"
                          ? "বার্ষিক"
                          : "Annual"
                        : lang === "bn"
                          ? "কাস্টম"
                          : "Custom"}
              </button>
            ))}
            {reportPeriod === "CUSTOM" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111714] text-xs font-mono-tabular"
                />
                <span className="text-xs text-zinc-500">→</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-9 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111714] text-xs font-mono-tabular"
                />
              </div>
            )}
          </div>

          {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-4">
              <div className="text-xs text-zinc-500">{lang === "bn" ? "দোকানে উপস্থিতি" : "Shop Presence"}</div>
              <div className="text-xl font-bold font-mono-tabular mt-1">
                {formatDurationCompact(totalPresenceMin, lang, nf)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-4">
              <div className="text-xs text-zinc-500">{lang === "bn" ? "মোট ব্যবসায়িক সময়" : "Business Hours"}</div>
              <div className="text-xl font-bold font-mono-tabular text-emerald-500 mt-1">
                {formatDurationCompact(totalBusinessMin, lang, nf)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-4">
              <div className="text-xs text-zinc-500">{lang === "bn" ? "ব্যক্তিগত বাইরে" : "Personal Outside"}</div>
              <div className="text-xl font-bold font-mono-tabular text-amber-500 mt-1">
                {formatDurationCompact(totalPerOutMin, lang, nf)}
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-4">
              <div className="text-xs text-zinc-500">{lang === "bn" ? "লক্ষ্য অর্জন দিন" : "Goals Hit"}</div>
              <div className="text-xl font-bold font-mono-tabular mt-1">
                {formatNumber(goalHitCount, nf)} / {formatNumber(activeCount, nf)}
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-3">
              <h3 className="text-sm font-semibold">
                {lang === "bn" ? "দৈনিক কর্মঘণ্টা ও লক্ষ্য" : "Daily Working Hours vs Target"}
              </h3>
              <DailyHoursBarChart data={barData} lang={lang} numberFormat={nf} />
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-3">
              <h3 className="text-sm font-semibold">
                {lang === "bn" ? "বাইরে কাটানো সময়ের কারণ" : "Outside Time by Reason"}
              </h3>
              <OutsideReasonPieChart slices={outsideSlices} lang={lang} numberFormat={nf} />
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-3">
              <h3 className="text-sm font-semibold">
                {lang === "bn" ? "উৎপাদনশীলতা স্কোর প্রবণতা" : "Productivity Score Trend"}
              </h3>
              <TrendLineChart points={prodPoints} numberFormat={nf} />
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-3">
              <h3 className="text-sm font-semibold">
                {lang === "bn" ? "মাসিক বিক্রয় বনাম নিট লাভ (৳)" : "Monthly Revenue vs Net Profit (৳)"}
              </h3>
              <RevenueProfitChart
                data={incomeRecords
                  .slice()
                  .sort((a, b) => a.month.localeCompare(b.month))
                  .slice(-6)
                  .map((r) => ({
                    label: r.month,
                    revenue: r.revenue,
                    netProfit: r.netProfit,
                  }))}
                numberFormat={nf}
                lang={lang}
              />
            </div>
          </div>
        </div>
      )}

      {subTab === "INCOME" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <form
            onSubmit={handleSaveIncome}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {lang === "bn" ? "মাসিক আয় ও নিট লাভ" : "Monthly Revenue & Profit"}
              </h2>
              <input
                type="month"
                value={incMonth}
                onChange={(e) => {
                  const m = e.target.value;
                  setIncMonth(m);
                  const found = incomeRecords.find((r) => r.month === m);
                  setRevenue(found ? String(found.revenue) : "");
                  setExpenses(found ? String(found.expenses) : "");
                  setCogs(found ? String(found.costOfGoods) : "");
                  setOtherCosts(found ? String(found.otherCosts) : "");
                  setIsConfirmed(found?.isConfirmed ?? false);
                  setIncSavedMsg("");
                }}
                className="h-9 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">
                  {lang === "bn" ? "মোট বিক্রয় / আয় (৳)" : "Total Sales / Revenue (৳)"}
                </label>
                <input
                  type="number"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">
                  {lang === "bn" ? "পণ্য ক্রয় খরচ / COGS (৳)" : "Cost of Goods Sold (৳)"}
                </label>
                <input
                  type="number"
                  value={cogs}
                  onChange={(e) => setCogs(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">
                  {lang === "bn" ? "দোকান পরিচালন ব্যয় (৳)" : "Business Expenses (৳)"}
                </label>
                <input
                  type="number"
                  value={expenses}
                  onChange={(e) => setExpenses(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">
                  {lang === "bn" ? "অন্যান্য খরচ (৳)" : "Other Costs (৳)"}
                </label>
                <input
                  type="number"
                  value={otherCosts}
                  onChange={(e) => setOtherCosts(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
              {lang === "bn"
                ? "এটি নিশ্চিত নিট লাভ (অন্যথায় আনুমানিক হিসেবে দেখাবে)"
                : "Mark as confirmed net profit (otherwise shown as estimated)"}
            </label>

            {incSavedMsg && <p className="text-xs text-emerald-500">{incSavedMsg}</p>}
            <button
              type="submit"
              className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
            >
              {lang === "bn" ? "মাসিক হিসাব সংরক্ষণ করুন" : "Save Monthly Record"}
            </button>

            {/* Optional Daily Income Entry */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="text-xs font-medium text-zinc-500">
                {lang === "bn" ? "ঐচ্ছিক: আজকের দৈনিক বিক্রি ও খরচ যোগ করুন" : "Optional: Log Today's Daily Sales"}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={dailyRev}
                  onChange={(e) => setDailyRev(e.target.value)}
                  placeholder={lang === "bn" ? "আজকের বিক্রি ৳" : "Sales ৳"}
                  className="flex-1 h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
                />
                <input
                  type="number"
                  value={dailyExp}
                  onChange={(e) => setDailyExp(e.target.value)}
                  placeholder={lang === "bn" ? "খরচ ৳" : "Expense ৳"}
                  className="flex-1 h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
                />
                <button
                  type="button"
                  onClick={handleSaveDailyIncome}
                  className="px-4 h-10 rounded-xl border border-emerald-500/40 text-emerald-500 text-xs font-semibold"
                >
                  {lang === "bn" ? "যোগ" : "Add"}
                </button>
              </div>
            </div>
          </form>

          {/* Calculated Hourly Value Card */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {lang === "bn" ? "ঘণ্টাপ্রতি আয় ও লাভ বিশ্লেষণ" : "Hourly Revenue & Profit Breakdown"}
              </h2>
              <span className="text-xs text-zinc-500">
                {incomeMetrics.isConfirmed
                  ? lang === "bn"
                    ? "নিশ্চিত লাভ"
                    : "Confirmed"
                  : lang === "bn"
                    ? "আনুমানিক"
                    : "Estimated"}
              </span>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500">{lang === "bn" ? "মোট বিক্রয়" : "Total Revenue"}</span>
                <span className="font-mono-tabular font-semibold">
                  {formatCurrencyBDT(incomeMetrics.totalRevenue, nf)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500">{lang === "bn" ? "মোট খরচ" : "Total Costs"}</span>
                <span className="font-mono-tabular font-semibold text-rose-500">
                  {formatCurrencyBDT(incomeMetrics.totalExpenses, nf)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500">{lang === "bn" ? "নিট লাভ" : "Net Profit"}</span>
                <span className="font-mono-tabular font-bold text-emerald-500">
                  {formatCurrencyBDT(incomeMetrics.netProfit, nf)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500">
                  {lang === "bn" ? "দোকানে উপস্থিতির প্রতি ঘণ্টায় আয়" : "Revenue / Physical Hour"}
                </span>
                <span className="font-mono-tabular font-semibold">
                  {incomeMetrics.physicalHours > 0
                    ? formatCurrencyBDT(incomeMetrics.revenuePerPhysicalHour, nf, 1)
                    : "—"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500">
                  {lang === "bn" ? "দোকানে উপস্থিতির প্রতি ঘণ্টায় লাভ" : "Profit / Physical Hour"}
                </span>
                <span className="font-mono-tabular font-semibold text-emerald-500">
                  {incomeMetrics.physicalHours > 0
                    ? formatCurrencyBDT(incomeMetrics.profitPerPhysicalHour, nf, 1)
                    : "—"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500">
                  {lang === "bn" ? "ব্যবসায়িক কর্মঘণ্টাপ্রতি আয়" : "Revenue / Business Hour"}
                </span>
                <span className="font-mono-tabular font-semibold">
                  {incomeMetrics.businessHours > 0
                    ? formatCurrencyBDT(incomeMetrics.revenuePerBusinessHour, nf, 1)
                    : "—"}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-zinc-500">
                  {lang === "bn" ? "ব্যবসায়িক কর্মঘণ্টাপ্রতি লাভ" : "Profit / Business Hour"}
                </span>
                <span className="font-mono-tabular font-semibold text-emerald-500">
                  {incomeMetrics.businessHours > 0
                    ? formatCurrencyBDT(incomeMetrics.profitPerBusinessHour, nf, 1)
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === "GOALS" && (
        <form
          onSubmit={handleSaveGoals}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-5 max-w-2xl"
        >
          <h2 className="text-base font-bold">
            {lang === "bn" ? "দৈনিক, সাপ্তাহিক ও মাসিক লক্ষ্য নির্ধারণ" : "Custom Business Goals"}
          </h2>
          <p className="text-xs text-zinc-500">
            {lang === "bn"
              ? "লক্ষ্য পরিবর্তন করলেও পূর্ববর্তী দিনগুলোর সংরক্ষিত লক্ষ্য অপরিবর্তিত থাকবে।"
              : "Editing targets preserves historical daily goal snapshots for past reports."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "দৈনিক (ঘণ্টা)" : "Daily (hours)"}</label>
              <input
                type="number"
                min={1}
                max={20}
                value={dailyHrs}
                onChange={(e) => setDailyHrs(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "সাপ্তাহিক (ঘণ্টা)" : "Weekly (hours)"}</label>
              <input
                type="number"
                min={1}
                max={140}
                value={weeklyHrs}
                onChange={(e) => setWeeklyHrs(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "মাসিক (ঘণ্টা)" : "Monthly (hours)"}</label>
              <input
                type="number"
                min={1}
                max={600}
                value={monthlyHrs}
                onChange={(e) => setMonthlyHrs(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "দোকান খোলার সময়" : "Opening Time"}</label>
              <input
                type="time"
                value={prefStart}
                onChange={(e) => setPrefStart(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "দোকান বন্ধের সময়" : "Closing Time"}</label>
              <input
                type="time"
                value={prefEnd}
                onChange={(e) => setPrefEnd(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "বিরতির সীমা (মি.)" : "Break Limit (min)"}</label>
              <input
                type="number"
                min={0}
                max={240}
                value={breakMin}
                onChange={(e) => setBreakMin(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-zinc-500">{lang === "bn" ? "সাপ্তাহিক ছুটির দিন" : "Weekly Rest Days"}</div>
            <div className="flex flex-wrap gap-2">
              {(lang === "bn"
                ? ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"]
                : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
              ).map((lbl, idx) => {
                const active = restDays.includes(idx);
                return (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() =>
                      setRestDays((prev) =>
                        prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]
                      )
                    }
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-medium border transition-colors ${
                      active
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                        : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                    }`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={countLunch}
                onChange={(e) => setCountLunch(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
              {lang === "bn"
                ? "দুপুরের খাবারের বিরতি কর্মঘণ্টায় গণনা করুন"
                : "Count Lunch break toward working time"}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={countRest}
                onChange={(e) => setCountRest(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
              {lang === "bn"
                ? "বিশ্রামের সময় কর্মঘণ্টায় গণনা করুন"
                : "Count Rest break toward working time"}
            </label>
          </div>

          {goalSavedMsg && <p className="text-xs text-emerald-500">{goalSavedMsg}</p>}
          <button
            type="submit"
            className="min-h-[48px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
          >
            {lang === "bn" ? "লক্ষ্য সংরক্ষণ করুন" : "Save Goals"}
          </button>
        </form>
      )}

      {subTab === "COACH" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Smart Productivity Coach */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">
                  {lang === "bn" ? "স্মার্ট প্রোডাক্টিভিটি কোচ" : "Smart Productivity Coach"}
                </h2>
                <p className="text-[11px] text-zinc-500">
                  {activeCoach.source === "GEMINI"
                    ? "Gemini AI (Aggregated Metrics Only)"
                    : lang === "bn"
                      ? "অফলাইন লোকাল বিশ্লেষণ ইঞ্জিন"
                      : "Offline Rule-Based Engine"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAskGeminiCoach}
                disabled={aiLoading}
                className="min-h-[38px] px-3.5 rounded-lg border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-xs font-semibold disabled:opacity-50"
              >
                {aiLoading
                  ? lang === "bn"
                    ? "বিশ্লেষণ চলছে..."
                    : "Analyzing..."
                  : lang === "bn"
                    ? "ঐচ্ছিক AI পরামর্শ"
                    : "Ask AI Coach"}
              </button>
            </div>

            {aiError && <p className="text-xs text-amber-500">{aiError}</p>}

            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-1.5">
                  {lang === "bn" ? "পর্যবেক্ষণ (প্রকৃত তথ্য)" : "Observations (From Real Data)"}
                </div>
                <ul className="space-y-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                  {activeCoach.observations.map((obs, idx) => (
                    <li key={idx} className="leading-relaxed">
                      • {obs}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="text-xs font-semibold text-zinc-500 mb-1.5">
                  {lang === "bn" ? "অভ্যাস উন্নতির পরামর্শ" : "Actionable Suggestions"}
                </div>
                <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  {activeCoach.suggestions.map((sug, idx) => (
                    <li key={idx} className="leading-relaxed">
                      • {sug}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5">
                <div className="text-xs font-semibold text-emerald-500">
                  {lang === "bn" ? "সাপ্তাহিক চ্যালেঞ্জ" : "Weekly Challenge"}
                </div>
                <p className="text-sm text-zinc-900 dark:text-zinc-100 mt-1">
                  {activeCoach.weeklyChallenge}
                </p>
              </div>
            </div>
          </div>

          {/* Time Leakage Analysis */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
            <h2 className="text-sm font-semibold">
              {lang === "bn" ? "সময়ের অপচয় বিশ্লেষণ (Time Leakage)" : "Time Leakage Analysis"}
            </h2>
            {leakageInsights.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6">
                {lang === "bn"
                  ? "সময়ের অপচয় শনাক্ত করার জন্য অন্তত ২ দিনের সক্রিয় রেকর্ড প্রয়োজন।"
                  : "At least 2 active tracked days are needed to generate reliable leakage insights."}
              </p>
            ) : (
              <div className="space-y-3">
                {leakageInsights.map((ins) => (
                  <div
                    key={ins.id}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1.5"
                  >
                    <div
                      className={`text-sm font-semibold ${
                        ins.severity === "positive"
                          ? "text-emerald-500"
                          : ins.severity === "warning"
                            ? "text-amber-500"
                            : "text-sky-500"
                      }`}
                    >
                      {lang === "bn" ? ins.titleBn : ins.titleEn}
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">
                      {lang === "bn" ? ins.detailBn : ins.detailEn}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {lang === "bn" ? ins.recommendationBn : ins.recommendationEn}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === "EXPORT" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-5 max-w-2xl">
          <div>
            <h2 className="text-base font-bold">
              {lang === "bn" ? "রিপোর্ট ও ডেটা এক্সপোর্ট" : "Reports & Data Export"}
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              {lang === "bn"
                ? "বর্তমান নির্বাচিত সময়সীমার রিপোর্ট PDF, CSV বা Excel-উপযোগী CSV ফরম্যাটে নামিয়ে নিন।"
                : "Export the currently selected report range to Bengali-compatible PDF, CSV, or Excel-compatible CSV."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="min-h-[52px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span>{lang === "bn" ? "PDF প্রিন্ট / সেভ" : "PDF Report"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const csv = generateCsvContent({
                  days: rangeDays,
                  incomeMetrics,
                  lang,
                  excelBom: false,
                });
                downloadTextFile(`shop-time-report-${todayStr}.csv`, csv, "text/csv;charset=utf-8");
              }}
              className="min-h-[52px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const csv = generateCsvContent({
                  days: rangeDays,
                  incomeMetrics,
                  lang,
                  excelBom: true,
                });
                downloadTextFile(
                  `shop-time-excel-${todayStr}.csv`,
                  csv,
                  "text/csv;charset=utf-8"
                );
              }}
              className="min-h-[52px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel CSV (UTF-8)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
