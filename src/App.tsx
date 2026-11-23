import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock,
  History,
  Home,
  Settings,
  Store,
} from "lucide-react";
import { DashboardView } from "./components/DashboardView";
import { AnalyticsView } from "./components/AnalyticsView";
import { HistoryView, ManualEntryModal } from "./components/HistoryView";
import { OnboardingFlow, PinLockScreen } from "./components/OnboardingFlow";
import { SettingsView } from "./components/SettingsView";
import { ExitReasonModal, TrackerView } from "./components/TrackerView";
import {
  DEFAULT_GOAL_SETTINGS,
  DEFAULT_PREFERENCES,
  ensureSeededDefaults,
  getAll,
  performCheckIn,
  performCheckOut,
  putItem,
} from "./db/indexedDb";
import {
  computeCurrentStreak,
  computeDayMetricsMap,
  computeIncomeMetricsForMonth,
} from "./engine/analyticsEngine";
import { sendBrowserNotification, useGeofenceTracker } from "./hooks/useGeofenceTracker";
import { t } from "./i18n/translations";
import {
  AppPreferences,
  AuditLog,
  DailyGoal,
  DailyIncomeEntry,
  DailyJournal,
  GoalSettings,
  IncomeRecord,
  LocationEvent,
  NotificationSetting,
  OutsidePeriod,
  OutsideReason,
  Shop,
  TimeSession,
} from "./types/domain";
import { addDaysToDhakaDate, getDhakaDateParts } from "./utils/dhakaTime";

type MainTab = "HOME" | "TRACKER" | "HISTORY" | "ANALYTICS" | "SETTINGS";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>("HOME");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [shops, setShops] = useState<Shop[]>([]);
  const [sessions, setSessions] = useState<TimeSession[]>([]);
  const [outsidePeriods, setOutsidePeriods] = useState<OutsidePeriod[]>([]);
  const [reasons, setReasons] = useState<OutsideReason[]>([]);
  const [dailyGoals, setDailyGoals] = useState<DailyGoal[]>([]);
  const [goalSettings, setGoalSettings] = useState<GoalSettings>(DEFAULT_GOAL_SETTINGS);
  const [incomeRecords, setIncomeRecords] = useState<IncomeRecord[]>([]);
  const [dailyIncomeEntries, setDailyIncomeEntries] = useState<DailyIncomeEntry[]>([]);
  const [journals, setJournals] = useState<DailyJournal[]>([]);
  const [locationEvents, setLocationEvents] = useState<LocationEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);

  const [exitModalMode, setExitModalMode] = useState<"CHECKOUT" | "STEP_OUTSIDE" | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadAllData = useCallback(async () => {
    await ensureSeededDefaults();
    const [
      sh,
      sess,
      out,
      rsn,
      dg,
      gs,
      inc,
      dInc,
      jrn,
      locEv,
      aud,
      notif,
      pr,
    ] = await Promise.all([
      getAll<Shop>("shops"),
      getAll<TimeSession>("timeSessions"),
      getAll<OutsidePeriod>("outsidePeriods"),
      getAll<OutsideReason>("outsideReasons"),
      getAll<DailyGoal>("dailyGoals"),
      getAll<GoalSettings>("goalSettings"),
      getAll<IncomeRecord>("incomeRecords"),
      getAll<DailyIncomeEntry>("dailyIncomeEntries"),
      getAll<DailyJournal>("dailyJournals"),
      getAll<LocationEvent>("locationEvents"),
      getAll<AuditLog>("auditLogs"),
      getAll<NotificationSetting>("notificationSettings"),
      getAll<AppPreferences>("preferences"),
    ]);

    const currentPrefs = pr[0] ?? DEFAULT_PREFERENCES;

    // Session Recovery: If an active session started >16 hours ago or from an earlier date when app was closed >6h, mark NEEDS_REVIEW without inventing exit timestamp
    const now = Date.now();
    const lastBeat = currentPrefs.lastHeartbeatAt ?? now;
    const staleGap = now - lastBeat > 6 * 3600 * 1000;
    let recoveredAny = false;
    for (const s of sess) {
      if (s.status === "ACTIVE" && s.checkOut === null) {
        const ageHours = (now - s.checkIn) / 3600000;
        if (ageHours > 16 || (staleGap && getDhakaDateParts(s.checkIn).dateStr !== getDhakaDateParts(now).dateStr)) {
          await putItem("timeSessions", { ...s, status: "NEEDS_REVIEW" });
          recoveredAny = true;
        }
      }
    }

    const finalSessions = recoveredAny ? await getAll<TimeSession>("timeSessions") : sess;

    setShops(sh);
    setSessions(finalSessions);
    setOutsidePeriods(out);
    setReasons(rsn);
    setDailyGoals(dg);
    setGoalSettings(gs[0] ?? DEFAULT_GOAL_SETTINGS);
    setIncomeRecords(inc);
    setDailyIncomeEntries(dInc);
    setJournals(jrn);
    setLocationEvents(locEv);
    setAuditLogs(aud);
    setNotifications(notif);
    setPrefs(currentPrefs);
  }, []);

  // Initial load + brief splash + heartbeat
  useEffect(() => {
    let mounted = true;
    loadAllData().then(() => {
      setTimeout(() => {
        if (mounted) setBooting(false);
      }, 450);
    });
    return () => {
      mounted = false;
    };
  }, [loadAllData]);

  // 1-second live clock + 30-second heartbeat
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    const beat = window.setInterval(() => {
      putItem("preferences", { ...prefs, lastHeartbeatAt: Date.now() }).catch(() => {});
    }, 30000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(beat);
    };
  }, [prefs]);

  // Sync theme & html lang
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.lang = prefs.language;
  }, [prefs.theme, prefs.language]);

  const shop = shops[0] ?? null;
  const activeSession = useMemo(
    () => sessions.find((s) => s.status === "ACTIVE" && s.checkOut === null) ?? null,
    [sessions]
  );
  const recoverySessions = useMemo(
    () => sessions.filter((s) => s.status === "NEEDS_REVIEW" && s.checkOut === null),
    [sessions]
  );
  const activeOutside = useMemo(() => {
    if (activeSession) return null;
    const todayStr = getDhakaDateParts(nowMs).dateStr;
    return (
      outsidePeriods.find(
        (o) => o.returnTime === null && getDhakaDateParts(o.exitTime).dateStr === todayStr
      ) ?? null
    );
  }, [outsidePeriods, activeSession, nowMs]);

  const todayStr = getDhakaDateParts(nowMs).dateStr;
  const currentMonthStr = todayStr.slice(0, 7);

  const dayMap = useMemo(
    () =>
      computeDayMetricsMap({
        sessions,
        outsidePeriods,
        reasons,
        dailyGoals,
        goalSettings,
        nowMs,
      }),
    [sessions, outsidePeriods, reasons, dailyGoals, goalSettings, nowMs]
  );

  const todayMetrics = dayMap.get(todayStr);

  const weeklyBusinessMinutes = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const m = dayMap.get(addDaysToDhakaDate(todayStr, -i));
      if (m) sum += m.totalBusinessMinutes;
    }
    return sum;
  }, [dayMap, todayStr]);

  const monthBusinessMinutes = useMemo(() => {
    let sum = 0;
    for (const [date, m] of dayMap.entries()) {
      if (date.startsWith(currentMonthStr)) sum += m.totalBusinessMinutes;
    }
    return sum;
  }, [dayMap, currentMonthStr]);

  const incomeMetrics = useMemo(
    () =>
      computeIncomeMetricsForMonth({
        monthStr: currentMonthStr,
        dayMap,
        incomeRecords,
        dailyIncomeEntries,
      }),
    [currentMonthStr, dayMap, incomeRecords, dailyIncomeEntries]
  );

  const { currentStreak } = useMemo(
    () => computeCurrentStreak(dayMap, goalSettings, todayStr),
    [dayMap, goalSettings, todayStr]
  );

  const geofenceState = useGeofenceTracker({
    shop,
    prefs,
    activeSession,
    notificationSettings: notifications,
    onTriggerAutoCheckIn: async () => {
      try {
        await performCheckIn({
          shopId: shop?.id ?? "default_shop",
          source: "GPS",
          confidence: 0.9,
        });
        await loadAllData();
        showToast(
          prefs.language === "bn"
            ? "জিপিএসের মাধ্যমে দোকানে Check In সম্পন্ন হয়েছে।"
            : "Auto Checked In via Shop Geofence."
        );
      } catch {
        // Ignore if active session already exists
      }
    },
    onTriggerAutoCheckOut: async (ev) => {
      if (!activeSession) return;
      await performCheckOut({
        sessionId: activeSession.id,
        source: "GPS",
        reasonId: "other",
        notes: "Auto geofence exit",
        latitude: ev.latitude,
        longitude: ev.longitude,
        startOutsidePeriod: true,
      });
      await loadAllData();
      showToast(
        prefs.language === "bn"
          ? "জিপিএসের মাধ্যমে Check Out সম্পন্ন হয়েছে।"
          : "Auto Checked Out via Shop Geofence."
      );
    },
    onNewPendingEvent: async () => {
      await loadAllData();
    },
  });

  // Scheduled reminders check every 30s
  useEffect(() => {
    const sentToday = new Set<string>();
    const id = window.setInterval(() => {
      const p = getDhakaDateParts(Date.now());
      const hhmm = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
      for (const n of notifications) {
        if (!n.enabled || n.scheduledTime === "00:00") continue;
        const key = `${p.dateStr}_${n.type}`;
        if (n.scheduledTime === hhmm && !sentToday.has(key)) {
          sentToday.add(key);
          sendBrowserNotification(
            "SHOP TIME MASTER",
            prefs.language === "bn"
              ? `রিমাইন্ডার: ${n.type.replace(/_/g, " ")}`
              : `Reminder: ${n.type.replace(/_/g, " ")}`,
            notifications,
            n.type
          );
        }
      }
    }, 30000);
    return () => window.clearInterval(id);
  }, [notifications, prefs.language]);

  const handleManualCheckIn = async () => {
    try {
      await performCheckIn({
        shopId: shop?.id ?? "default_shop",
        source: "MANUAL",
      });
      await loadAllData();
      showToast(prefs.language === "bn" ? "দোকানে Check In সফল হয়েছে।" : "Checked In to shop.");
    } catch (err) {
      if (err instanceof Error && err.message === "ACTIVE_SESSION_EXISTS") {
        showToast(
          prefs.language === "bn" ? "ইতোমধ্যে একটি সক্রিয় সেশন চলছে।" : "A session is already active."
        );
      }
    }
  };

  const handleConfirmExitModal = async (reasonId: string, notes: string) => {
    if (!activeSession) {
      setExitModalMode(null);
      return;
    }
    await performCheckOut({
      sessionId: activeSession.id,
      source: "MANUAL",
      reasonId,
      notes,
      startOutsidePeriod: true,
    });
    setExitModalMode(null);
    await loadAllData();
    showToast(
      prefs.language === "bn"
        ? "প্রস্থান রেকর্ড হয়েছে। বাইরে কাটানো সময় ট্র্যাক হচ্ছে।"
        : "Checked out. Outside time is now being tracked."
    );
  };

  const handleConfirmLocationEvent = async (ev: LocationEvent) => {
    if (ev.eventType === "ENTER" && !activeSession) {
      await performCheckIn({
        shopId: shop?.id ?? "default_shop",
        source: "GPS",
        timestampMs: ev.timestamp,
        confidence: 0.92,
      });
    } else if (ev.eventType === "EXIT" && activeSession) {
      await performCheckOut({
        sessionId: activeSession.id,
        source: "GPS",
        reasonId: "other",
        timestampMs: Math.max(ev.timestamp, activeSession.checkIn + 1000),
        latitude: ev.latitude,
        longitude: ev.longitude,
      });
    }
    await putItem("locationEvents", { ...ev, status: "CONFIRMED" });
    await loadAllData();
  };

  if (booting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#090D0B] text-zinc-100 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Store className="w-7 h-7" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight">SHOP TIME MASTER</h1>
          <p className="text-xs text-zinc-400 mt-1">ব্যক্তিগত ব্যবসা ও সময় ব্যবস্থাপনা ট্র্যাকার</p>
        </div>
      </div>
    );
  }

  if (prefs.pinHash && !pinUnlocked) {
    return <PinLockScreen prefs={prefs} onUnlock={() => setPinUnlocked(true)} />;
  }

  if (!prefs.onboardingCompleted || !prefs.shopSetupCompleted || !prefs.locationPromptSeen) {
    return (
      <OnboardingFlow
        prefs={prefs}
        shop={shop}
        goalSettings={goalSettings}
        onComplete={loadAllData}
      />
    );
  }

  const dict = t(prefs.language);
  const pendingEventsCount = locationEvents.filter((e) => e.status === "PENDING_REVIEW").length;

  const navItems: Array<{ key: MainTab; label: string; Icon: React.FC<{ className?: string }> }> = [
    { key: "HOME", label: dict.navHome, Icon: Home },
    { key: "TRACKER", label: dict.navTracker, Icon: Clock },
    { key: "HISTORY", label: dict.navHistory, Icon: History },
    { key: "ANALYTICS", label: dict.navAnalytics, Icon: BarChart3 },
    { key: "SETTINGS", label: dict.navSettings, Icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#090D0B] text-zinc-900 dark:text-zinc-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#0D1310] p-5 justify-between sticky top-0 h-screen no-print">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight truncate">SHOP TIME MASTER</div>
              <div className="text-[11px] text-zinc-500 truncate">{shop?.name ?? "Asia/Dhaka"}</div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map(({ key, label, Icon }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`w-full min-h-[44px] px-3.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors ${
                    active
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-2 text-[11px] text-zinc-500 space-y-1">
          <div>Asia/Dhaka · BDT (৳)</div>
          <div>{prefs.language === "bn" ? "অফলাইন-প্রথম সংরক্ষণ" : "Offline-First Storage"}</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 pb-24 lg:pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {activeTab === "HOME" && (
            <DashboardView
              nowMs={nowMs}
              todayStr={todayStr}
              shop={shop}
              prefs={prefs}
              activeSession={activeSession}
              activeOutside={activeOutside}
              todayMetrics={todayMetrics}
              weeklyBusinessMinutes={weeklyBusinessMinutes}
              monthBusinessMinutes={monthBusinessMinutes}
              incomeMetrics={incomeMetrics}
              currentStreak={currentStreak}
              goalSettings={goalSettings}
              pendingEventsCount={pendingEventsCount}
              recoverySessionsCount={recoverySessions.length}
              hasAnySessions={sessions.length > 0}
              onCheckIn={handleManualCheckIn}
              onCheckOut={() => setExitModalMode("CHECKOUT")}
              onStepOutside={() => setExitModalMode("STEP_OUTSIDE")}
              onReturnToShop={handleManualCheckIn}
              onOpenManualEntry={() => setManualModalOpen(true)}
              onNavigateTrackerReview={() => setActiveTab("TRACKER")}
            />
          )}

          {activeTab === "TRACKER" && (
            <TrackerView
              nowMs={nowMs}
              shop={shop}
              prefs={prefs}
              activeSession={activeSession}
              activeOutside={activeOutside}
              reasons={reasons}
              geofenceState={geofenceState}
              locationEvents={locationEvents}
              recoverySessions={recoverySessions}
              onCheckIn={handleManualCheckIn}
              onCheckOut={() => setExitModalMode("CHECKOUT")}
              onStepOutside={() => setExitModalMode("STEP_OUTSIDE")}
              onReturnToShop={handleManualCheckIn}
              onTogglePauseGps={async () => {
                await putItem("preferences", {
                  ...prefs,
                  gpsEnabled: true,
                  gpsPaused: !prefs.gpsPaused,
                });
                await loadAllData();
              }}
              onConfirmLocationEvent={handleConfirmLocationEvent}
              onDismissLocationEvent={async (ev) => {
                await putItem("locationEvents", { ...ev, status: "DISMISSED" });
                await loadAllData();
              }}
              onResolveRecoverySession={async (rs, checkOutMs) => {
                await putItem("timeSessions", {
                  ...rs,
                  checkOut: checkOutMs,
                  status: "COMPLETED",
                });
                await loadAllData();
              }}
            />
          )}

          {activeTab === "HISTORY" && (
            <HistoryView
              todayStr={todayStr}
              shop={shop}
              prefs={prefs}
              sessions={sessions}
              outsidePeriods={outsidePeriods}
              reasons={reasons}
              dayMap={dayMap}
              journals={journals}
              auditLogs={auditLogs}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === "ANALYTICS" && (
            <AnalyticsView
              todayStr={todayStr}
              shop={shop}
              prefs={prefs}
              sessions={sessions}
              outsidePeriods={outsidePeriods}
              reasons={reasons}
              dayMap={dayMap}
              goalSettings={goalSettings}
              incomeRecords={incomeRecords}
              dailyIncomeEntries={dailyIncomeEntries}
              currentStreak={currentStreak}
              onRefresh={loadAllData}
            />
          )}

          {activeTab === "SETTINGS" && (
            <SettingsView
              shop={shop}
              prefs={prefs}
              notifications={notifications}
              onRefresh={loadAllData}
            />
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation (<= 15% mobile viewport height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-[#0D1310]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-5 items-center no-print">
        {navItems.map(({ key, label, Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? "text-emerald-500" : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium truncate max-w-[68px]">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      <ExitReasonModal
        open={exitModalMode !== null}
        mode={exitModalMode ?? "CHECKOUT"}
        reasons={reasons}
        prefs={prefs}
        onClose={() => setExitModalMode(null)}
        onConfirm={handleConfirmExitModal}
        onAddCustomReason={async (r) => {
          await putItem("outsideReasons", r);
          await loadAllData();
        }}
      />

      <ManualEntryModal
        open={manualModalOpen}
        defaultDate={todayStr}
        shop={shop}
        prefs={prefs}
        sessions={sessions}
        reasons={reasons}
        onClose={() => setManualModalOpen(false)}
        onSaved={loadAllData}
      />

      {/* Subtle Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 max-w-sm rounded-xl border border-emerald-500/40 bg-zinc-900 text-zinc-100 px-4 py-3 text-xs font-medium shadow-lg no-print">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
