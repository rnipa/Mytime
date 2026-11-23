import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Download,
  LogIn,
  LogOut,
  Plus,
  Smartphone,
  Target,
  TrendingUp,
} from "lucide-react";
import { t } from "../i18n/translations";
import {
  AppPreferences,
  DayMetrics,
  GoalSettings,
  IncomeMetrics,
  LocationEvent,
  OutsidePeriod,
  Shop,
  TimeSession,
} from "../types/domain";
import {
  formatClockWithSeconds,
  formatCurrencyBDT,
  formatDateDhaka,
  formatDurationCompact,
  formatElapsedTimer,
  formatNumber,
  getGreeting,
} from "../utils/dhakaTime";

export const DashboardView: React.FC<{
  nowMs: number;
  todayStr: string;
  shop: Shop | null;
  prefs: AppPreferences;
  activeSession: TimeSession | null;
  activeOutside: OutsidePeriod | null;
  todayMetrics: DayMetrics | undefined;
  weeklyBusinessMinutes: number;
  monthBusinessMinutes: number;
  incomeMetrics: IncomeMetrics;
  currentStreak: number;
  goalSettings: GoalSettings;
  pendingEventsCount: number;
  recoverySessionsCount: number;
  hasAnySessions: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onStepOutside: () => void;
  onReturnToShop: () => void;
  onOpenManualEntry: () => void;
  onNavigateTrackerReview: () => void;
}> = ({
  nowMs,
  todayStr,
  shop,
  prefs,
  activeSession,
  activeOutside,
  todayMetrics,
  weeklyBusinessMinutes,
  monthBusinessMinutes,
  incomeMetrics,
  currentStreak,
  goalSettings,
  pendingEventsCount,
  recoverySessionsCount,
  hasAnySessions,
  onCheckIn,
  onCheckOut,
  onStepOutside,
  onReturnToShop,
  onOpenManualEntry,
  onNavigateTrackerReview,
}) => {
  const dict = t(prefs.language);
  const nf = prefs.numberFormat;
  const lang = prefs.language;

  const [apkInfo, setApkInfo] = useState<{
    available: boolean;
    sizeBytes: number;
    filename: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/android-project/apk-info")
      .then((r) => r.json())
      .then((d) => setApkInfo(d))
      .catch(() => {});
  }, []);

  const presenceMin = todayMetrics?.presenceMinutes ?? 0;
  const busOutMin = todayMetrics?.businessOutsideMinutes ?? 0;
  const perOutMin = todayMetrics?.personalOutsideMinutes ?? 0;
  const totalBusMin = todayMetrics?.totalBusinessMinutes ?? 0;
  const targetMin = todayMetrics?.targetMinutes ?? goalSettings.dailyMinutes;
  const remainingMin = Math.max(0, targetMin - totalBusMin);
  const completionPct =
    targetMin > 0 ? Math.min(100, Math.round((totalBusMin / targetMin) * 100)) : 0;

  const weeklyPct =
    goalSettings.weeklyMinutes > 0
      ? Math.min(100, Math.round((weeklyBusinessMinutes / goalSettings.weeklyMinutes) * 100))
      : 0;

  const todayEstEarnings =
    incomeMetrics.profitPerBusinessHour > 0
      ? (totalBusMin / 60) * incomeMetrics.profitPerBusinessHour
      : 0;

  const statusText = activeSession
    ? dict.statusInside
    : activeOutside
      ? dict.statusOutside
      : dict.statusNotTracking;

  const statusTextColor = activeSession
    ? "text-emerald-500"
    : activeOutside
      ? "text-amber-500"
      : "text-zinc-500 dark:text-zinc-400";

  const liveElapsedMs = activeSession
    ? Math.max(0, nowMs - activeSession.checkIn)
    : activeOutside
      ? Math.max(0, nowMs - activeOutside.exitTime)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {getGreeting(lang, nowMs)} · {formatDateDhaka(todayStr, lang, nf)} ·{" "}
            <span className="font-mono-tabular">{formatClockWithSeconds(nowMs, lang, nf)}</span>
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mt-1">
            {shop?.name ?? dict.appName}
          </h1>
        </div>
        <div className="text-sm font-semibold flex items-center gap-2">
          <span className={statusTextColor}>{statusText}</span>
          <span className="text-zinc-400" aria-hidden="true">·</span>
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {prefs.gpsEnabled
              ? prefs.gpsPaused
                ? dict.gpsPaused
                : dict.gpsActive
              : dict.gpsDisabled}
          </span>
        </div>
      </div>

      {/* Pending Review / Recovery Alert */}
      {(pendingEventsCount > 0 || recoverySessionsCount > 0) && (
        <button
          type="button"
          onClick={onNavigateTrackerReview}
          className="w-full text-left rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-center justify-between gap-4 hover:bg-amber-500/15 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {lang === "bn"
                  ? "অমীমাংসিত জিপিএস / সেশন রিকভারি অপেক্ষমাণ"
                  : "Pending GPS / Session Recovery Review"}
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {lang === "bn"
                  ? `${formatNumber(pendingEventsCount + recoverySessionsCount, nf)}টি ইভেন্ট আপনার নিশ্চিতকরণের অপেক্ষায় আছে`
                  : `${pendingEventsCount + recoverySessionsCount} event(s) require your confirmation`}
              </div>
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-500 whitespace-nowrap shrink-0">
            {lang === "bn" ? "পর্যালোচনা করুন" : "Review"}
          </span>
        </button>
      )}

      {/* Main Focal Card + Primary Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {dict.todayPresence}
              </p>
              <div className="text-3xl sm:text-4xl font-bold font-mono-tabular text-zinc-900 dark:text-zinc-100 mt-1">
                {formatDurationCompact(presenceMin, lang, nf)}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {activeOutside
                  ? lang === "bn"
                    ? "বাইরে চলমান সময়"
                    : "Outside Elapsed"
                  : dict.liveElapsed}
              </p>
              <div
                className={`text-2xl sm:text-3xl font-bold font-mono-tabular mt-1 ${
                  activeSession
                    ? "text-emerald-500"
                    : activeOutside
                      ? "text-amber-500"
                      : "text-zinc-400 dark:text-zinc-600"
                }`}
              >
                {formatElapsedTimer(liveElapsedMs, nf)}
              </div>
            </div>
          </div>

          {/* Target Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                {dict.dailyTargetProgress} ({formatDurationCompact(totalBusMin, lang, nf)} /{" "}
                {formatDurationCompact(targetMin, lang, nf)})
              </span>
              <span className="font-mono-tabular font-semibold text-emerald-500">
                {formatNumber(completionPct, nf)}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${completionPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                {remainingMin > 0
                  ? `${dict.remainingTarget}: ${formatDurationCompact(remainingMin, lang, nf)}`
                  : dict.targetAchieved}
              </span>
              {activeSession && (
                <span className="font-mono-tabular">
                  {activeSession.source} · {lang === "bn" ? "সক্রিয় সেশন" : "Active Session"}
                </span>
              )}
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {!activeSession ? (
              <button
                type="button"
                onClick={activeOutside ? onReturnToShop : onCheckIn}
                className="min-h-[54px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold text-sm inline-flex items-center justify-center gap-2.5 transition-all"
              >
                <LogIn className="w-5 h-5" />
                <span>{activeOutside ? dict.returnShopBtn : dict.checkInBtn}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onCheckOut}
                className="min-h-[54px] px-5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-semibold text-sm inline-flex items-center justify-center gap-2.5 transition-all"
              >
                <LogOut className="w-5 h-5" />
                <span>{dict.checkOutBtn}</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              {activeSession ? (
                <button
                  type="button"
                  onClick={onStepOutside}
                  className="min-h-[54px] px-3 rounded-xl border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4 shrink-0" />
                  <span className="truncate">{dict.stepOutsideBtn}</span>
                </button>
              ) : (
                <div className="min-h-[54px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-xs text-zinc-500">
                  {activeOutside
                    ? lang === "bn"
                      ? "দোকানের বাইরে"
                      : "Outside"
                    : lang === "bn"
                      ? "অপেক্ষমাণ"
                      : "Idle"}
                </div>
              )}
              <button
                type="button"
                onClick={onOpenManualEntry}
                className="min-h-[54px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="truncate">{dict.addManualEntry}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Today Quick Statistics */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 flex flex-col justify-between space-y-4">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {lang === "bn" ? "আজকের দ্রুত পরিসংখ্যান" : "Today's Quick Stats"}
          </h2>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">{dict.totalShopHoursToday}</span>
              <span className="font-mono-tabular font-semibold">
                {formatDurationCompact(presenceMin, lang, nf)}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">{dict.businessOutsideToday}</span>
              <span className="font-mono-tabular font-semibold text-sky-500">
                {formatDurationCompact(busOutMin, lang, nf)}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">{dict.personalOutsideToday}</span>
              <span className="font-mono-tabular font-semibold text-amber-500">
                {formatDurationCompact(perOutMin, lang, nf)}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">
                {dict.entriesCount} / {dict.exitsCount}
              </span>
              <span className="font-mono-tabular font-semibold flex items-center gap-2">
                <span className="inline-flex items-center gap-0.5 text-emerald-500">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                  {formatNumber(todayMetrics?.entryCount ?? 0, nf)}
                </span>
                <span className="text-zinc-400">/</span>
                <span className="inline-flex items-center gap-0.5 text-rose-500">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  {formatNumber(todayMetrics?.exitCount ?? 0, nf)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State Banner for Brand-New Users */}
      {!hasAnySessions && (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center space-y-2">
          <Clock className="w-7 h-7 text-emerald-500 mx-auto" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {dict.emptyDashboardTitle}
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-lg mx-auto">
            {dict.emptyDashboardDesc}
          </p>
        </div>
      )}

      {/* Secondary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-5 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>{dict.productivityScore}</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-zinc-900 dark:text-zinc-100">
            {todayMetrics?.productivityScore !== null && todayMetrics?.productivityScore !== undefined
              ? `${formatNumber(todayMetrics.productivityScore, nf)} / ${formatNumber(100, nf)}`
              : "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-5 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{dict.estimatedEarningsToday}</div>
          <div className="text-2xl font-bold font-mono-tabular text-emerald-500">
            {todayEstEarnings > 0 ? formatCurrencyBDT(todayEstEarnings, nf) : "—"}
          </div>
          <p className="text-[11px] text-zinc-500">
            {incomeMetrics.totalRevenue > 0
              ? incomeMetrics.isConfirmed
                ? lang === "bn"
                  ? "নিশ্চিত মাসিক লাভের ভিত্তিতে"
                  : "Based on confirmed net profit"
                : lang === "bn"
                  ? "আনুমানিক হারের ভিত্তিতে"
                  : "Estimated rate"
              : lang === "bn"
                ? "আয় যোগ করলে হিসাব দেখাবে"
                : "Add income record to calculate"}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-5 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{dict.monthWorkingHours}</div>
          <div className="text-2xl font-bold font-mono-tabular">
            {formatDurationCompact(monthBusinessMinutes, lang, nf)}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-5 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {dict.monthlyEarningsPerHour}
          </div>
          <div className="text-2xl font-bold font-mono-tabular text-emerald-500">
            {incomeMetrics.businessHours > 0 && incomeMetrics.totalRevenue > 0
              ? `${formatCurrencyBDT(incomeMetrics.profitPerBusinessHour, nf)}${dict.perHourUnit}`
              : "—"}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-5 space-y-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{dict.currentStreak}</div>
          <div className="text-2xl font-bold font-mono-tabular">
            {formatNumber(currentStreak, nf)} {dict.daysUnit}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-5 space-y-2">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>{dict.weeklyTargetProgress}</span>
            <Target className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono-tabular">
            {formatNumber(weeklyPct, nf)}%
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${weeklyPct}%` }} />
          </div>
        </div>
      </div>

      {apkInfo?.available && (
        <div className="rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#111714] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {lang === "bn"
                  ? "অ্যান্ড্রয়েড নেটিভ Debug APK প্রস্তুত"
                  : "Android Native Debug APK Ready"}
              </div>
              <div className="text-xs text-zinc-500 font-mono-tabular">
                {apkInfo.filename} · {(apkInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          </div>
          <a
            href="/api/android-project/apk"
            download="SHOP-TIME-MASTER-v1.0.0-debug.apk"
            className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>{lang === "bn" ? "APK ডাউনলোড করুন" : "Download APK"}</span>
          </a>
        </div>
      )}
    </div>
  );
};
