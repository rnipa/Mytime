import React, { useEffect, useState } from "react";
import {
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  DatabaseBackup,
  Download,
  Lock,
  MapPin,
  Moon,
  Plus,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import {
  clearAllStores,
  ensureSeededDefaults,
  exportDatabaseSnapshot,
  putItem,
  restoreDatabaseSnapshot,
  uid,
} from "../db/indexedDb";
import { downloadTextFile } from "../engine/exporter";
import {
  AppPreferences,
  GoalSettings,
  NotificationSetting,
  NotificationType,
  OutsideReason,
  Shop,
} from "../types/domain";
import { formatNumber, hashPin } from "../utils/dhakaTime";

const NOTIFICATION_LABELS: Record<NotificationType, { bn: string; en: string }> = {
  SHOP_OPENING_REMINDER: { bn: "দোকান খোলার রিমাইন্ডার", en: "Preferred Shop Opening Reminder" },
  DAILY_TARGET_PROGRESS: { bn: "দৈনিক লক্ষ্য অগ্রগতি", en: "Daily Target Progress Alert" },
  CHECKOUT_REMINDER: { bn: "Check Out রিমাইন্ডার", en: "Check Out Reminder" },
  GPS_ARRIVAL: { bn: "জিপিএস আগমন নিশ্চিতকরণ", en: "GPS Arrival Confirmation" },
  GPS_DEPARTURE: { bn: "জিপিএস প্রস্থান নিশ্চিতকরণ", en: "GPS Departure Confirmation" },
  MISSING_SESSION_WARNING: { bn: "অনুপস্থিত সেশন সতর্কতা", en: "Missing Session Warning" },
  DAILY_SUMMARY: { bn: "দৈনিক সারসংক্ষেপ", en: "Daily Summary" },
  WEEKLY_REPORT: { bn: "সাপ্তাহিক রিপোর্ট", en: "Weekly Report" },
  GOAL_ACHIEVEMENT: { bn: "লক্ষ্য অর্জন অভিনন্দন", en: "Goal Achievement Notification" },
};

export const SettingsView: React.FC<{
  shop: Shop | null;
  prefs: AppPreferences;
  goalSettings: GoalSettings;
  notifications: NotificationSetting[];
  reasons: OutsideReason[];
  onRefresh: () => Promise<void>;
}> = ({ shop, prefs, goalSettings, notifications, reasons, onRefresh }) => {
  const lang = prefs.language;
  const nf = prefs.numberFormat;

  const [subTab, setSubTab] = useState<"GOALS" | "GENERAL" | "LOCATION" | "NOTIFICATIONS" | "BACKUP" | "ANDROID">(
    "GOALS"
  );

  // Shop location form
  const [shopName, setShopName] = useState(shop?.name ?? "");
  const [shopAddress, setShopAddress] = useState(shop?.address ?? "");
  const [lat, setLat] = useState(shop?.latitude !== null && shop?.latitude !== undefined ? String(shop.latitude) : "");
  const [lng, setLng] = useState(shop?.longitude !== null && shop?.longitude !== undefined ? String(shop.longitude) : "");
  const [radius, setRadius] = useState(shop?.geofenceRadius ?? 100);
  const [gpsEnabled, setGpsEnabled] = useState(prefs.gpsEnabled);
  const [gpsAutoConfirm, setGpsAutoConfirm] = useState(prefs.gpsAutoConfirm);
  const [gpsDelay, setGpsDelay] = useState(prefs.gpsConfirmationDelaySec);
  const [locStatusMsg, setLocStatusMsg] = useState("");

  // PIN lock state
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  // Backup / wipe state
  const [backupMsg, setBackupMsg] = useState("");
  const [wipeStep, setWipeStep] = useState(0);

  // Android source & APK viewer
  const [androidFiles, setAndroidFiles] = useState<string[]>([]);
  const [selectedAndroidFile, setSelectedAndroidFile] = useState<string>("");
  const [androidFileContent, setAndroidFileContent] = useState<string>("");
  const [apkInfo, setApkInfo] = useState<{
    available: boolean;
    sizeBytes: number;
    filename: string;
  } | null>(null);

  // Working Hours & Goals form
  const [dailyHours, setDailyHours] = useState(String(Math.round((goalSettings.dailyMinutes / 60) * 10) / 10));
  const [weeklyHours, setWeeklyHours] = useState(String(Math.round((goalSettings.weeklyMinutes / 60) * 10) / 10));
  const [monthlyHours, setMonthlyHours] = useState(String(Math.round((goalSettings.monthlyMinutes / 60) * 10) / 10));
  const [prefStart, setPrefStart] = useState(goalSettings.preferredStart);
  const [prefEnd, setPrefEnd] = useState(goalSettings.preferredEnd);
  const [breakMinutes, setBreakMinutes] = useState(String(goalSettings.breakMinutes));
  const [restDays, setRestDays] = useState<number[]>(goalSettings.weeklyRestDays);
  const [countLunchAsWork, setCountLunchAsWork] = useState(goalSettings.countLunchAsWork);
  const [countRestAsWork, setCountRestAsWork] = useState(goalSettings.countRestAsWork);
  const [goalMsg, setGoalMsg] = useState("");
  const [newReasonBn, setNewReasonBn] = useState("");
  const [newReasonEn, setNewReasonEn] = useState("");
  const [newReasonBusiness, setNewReasonBusiness] = useState(false);

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    const dMin = Math.max(60, Math.round((Number(dailyHours) || 10) * 60));
    const wMin = Math.max(60, Math.round((Number(weeklyHours) || 60) * 60));
    const mMin = Math.max(60, Math.round((Number(monthlyHours) || 260) * 60));
    await putItem("goalSettings", {
      ...goalSettings,
      dailyMinutes: dMin,
      weeklyMinutes: wMin,
      monthlyMinutes: mMin,
      preferredStart: prefStart || "09:00",
      preferredEnd: prefEnd || "21:00",
      breakMinutes: Math.max(0, Number(breakMinutes) || 0),
      weeklyRestDays: restDays,
      countLunchAsWork,
      countRestAsWork,
    });
    await onRefresh();
    setGoalMsg(lang === "bn" ? "কর্মঘণ্টা ও লক্ষ্য সেটিংস সংরক্ষিত হয়েছে।" : "Work hours & goal settings saved.");
  };

  const handleAddReason = async () => {
    if (!newReasonBn.trim() && !newReasonEn.trim()) return;
    await putItem("outsideReasons", {
      id: uid("reason"),
      nameBn: newReasonBn.trim() || newReasonEn.trim(),
      nameEn: newReasonEn.trim() || newReasonBn.trim(),
      categoryType: newReasonBusiness ? "BUSINESS" : "PERSONAL",
      countsAsBusinessTime: newReasonBusiness,
      isCustom: true,
    });
    setNewReasonBn("");
    setNewReasonEn("");
    await onRefresh();
  };

  useEffect(() => {
    if (subTab === "ANDROID") {
      fetch("/api/android-project/apk-info")
        .then((r) => r.json())
        .then((d) => setApkInfo(d))
        .catch(() => {});
      if (androidFiles.length === 0) {
        fetch("/api/android-project/tree")
          .then((r) => r.json())
          .then((d) => {
            const list = Array.isArray(d.files) ? d.files : [];
            setAndroidFiles(list);
            if (list.length > 0) {
              loadAndroidFile(list[0]);
            }
          })
          .catch(() => {});
      }
    }
  }, [subTab]);

  const loadAndroidFile = async (filePath: string) => {
    setSelectedAndroidFile(filePath);
    try {
      const res = await fetch(`/api/android-project/file?path=${encodeURIComponent(filePath)}`);
      const d = await res.json();
      setAndroidFileContent(d.content ?? "");
    } catch {
      setAndroidFileContent("// Failed to load file");
    }
  };

  const updatePref = async (patch: Partial<AppPreferences>) => {
    await putItem("preferences", { ...prefs, ...patch });
    await onRefresh();
  };

  const handleSaveShopLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = lat.trim() ? Number(lat) : null;
    const parsedLng = lng.trim() ? Number(lng) : null;
    await putItem("shops", {
      id: shop?.id ?? uid("shop"),
      name: shopName.trim() || "My Shop",
      address: shopAddress.trim(),
      latitude: Number.isFinite(parsedLat) ? parsedLat : null,
      longitude: Number.isFinite(parsedLng) ? parsedLng : null,
      geofenceRadius: radius,
      createdAt: shop?.createdAt ?? Date.now(),
    });
    await putItem("preferences", {
      ...prefs,
      gpsEnabled,
      gpsAutoConfirm,
      gpsConfirmationDelaySec: gpsDelay,
    });
    await onRefresh();
    setLocStatusMsg(lang === "bn" ? "দোকান ও জিপিএস সেটিংস সংরক্ষিত।" : "Shop & GPS settings saved.");
  };

  const handleCaptureGps = () => {
    if (!("geolocation" in navigator)) {
      setLocStatusMsg("Geolocation unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocStatusMsg(
          lang === "bn"
            ? `অবস্থান পাওয়া গেছে (±${Math.round(pos.coords.accuracy)} মি.)`
            : `Captured (±${Math.round(pos.coords.accuracy)}m)`
        );
      },
      (err) => setLocStatusMsg(err.message),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.trim().length < 4) {
      setPinMsg(lang === "bn" ? "কমপক্ষে ৪ সংখ্যার পিন দিন।" : "Enter at least 4 digits.");
      return;
    }
    const h = await hashPin(newPin.trim());
    await updatePref({ pinHash: h });
    setNewPin("");
    setPinMsg(lang === "bn" ? "অ্যাপ লক পিন সক্রিয় হয়েছে।" : "App PIN lock enabled.");
  };

  const handleBackupDownload = async () => {
    const snap = await exportDatabaseSnapshot();
    downloadTextFile(
      `shop-time-master-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(snap, null, 2),
      "application/json"
    );
    setBackupMsg(lang === "bn" ? "সম্পূর্ণ ব্যাকআপ ডাউনলোড হয়েছে।" : "Full JSON backup exported.");
  };

  const handleRestoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await restoreDatabaseSnapshot(parsed);
      await onRefresh();
      setBackupMsg(lang === "bn" ? "ব্যাকআপ সফলভাবে পুনরুদ্ধার হয়েছে।" : "Backup restored successfully.");
    } catch {
      setBackupMsg(lang === "bn" ? "অবৈধ ব্যাকআপ ফাইল।" : "Invalid backup JSON file.");
    }
  };

  const handleWipeAll = async () => {
    await clearAllStores();
    await ensureSeededDefaults();
    setWipeStep(0);
    await onRefresh();
  };

  const handleRequestBrowserNotifications = async () => {
    if (typeof Notification !== "undefined") {
      await Notification.requestPermission();
      await onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {lang === "bn" ? "সেটিংস ও অ্যান্ড্রয়েড প্রজেক্ট" : "Settings & Android Studio Project"}
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {lang === "bn"
            ? "ভাষা, থিম, জিওফেন্স, নোটিফিকেশন, পিন লক এবং নেটিভ Kotlin সোর্স কোড।"
            : "Language, theme, geofencing, notifications, PIN lock, backup, and native Kotlin source."}
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900 overflow-x-auto">
        {(
          [
            ["GOALS", lang === "bn" ? "কর্মঘণ্টা ও লক্ষ্য" : "Work Hours", Clock],
            ["GENERAL", lang === "bn" ? "সাধারণ" : "General", Sliders],
            ["LOCATION", lang === "bn" ? "দোকান ও জিপিএস" : "Shop & GPS", MapPin],
            ["NOTIFICATIONS", lang === "bn" ? "নোটিফিকেশন" : "Notifications", Bell],
            ["BACKUP", lang === "bn" ? "ব্যাকআপ ও রিসেট" : "Backup & Data", DatabaseBackup],
            ["ANDROID", lang === "bn" ? "Android সোর্স" : "Android Source", Code2],
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

      {subTab === "GOALS" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <form
            onSubmit={handleSaveGoals}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">
                {lang === "bn" ? "দৈনিক, সাপ্তাহিক ও মাসিক কর্মঘণ্টা" : "Working Hours & Target Settings"}
              </h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {lang === "bn" ? "দৈনিক (ঘণ্টা)" : "Daily (hrs)"}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="24"
                  value={dailyHours}
                  onChange={(e) => setDailyHours(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {lang === "bn" ? "সাপ্তাহিক (ঘণ্টা)" : "Weekly (hrs)"}
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="168"
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {lang === "bn" ? "মাসিক (ঘণ্টা)" : "Monthly (hrs)"}
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="744"
                  value={monthlyHours}
                  onChange={(e) => setMonthlyHours(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {lang === "bn" ? "দোকান খোলার সময়" : "Opening Time"}
                </label>
                <input
                  type="time"
                  value={prefStart}
                  onChange={(e) => setPrefStart(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {lang === "bn" ? "বন্ধের সময়" : "Closing Time"}
                </label>
                <input
                  type="time"
                  value={prefEnd}
                  onChange={(e) => setPrefEnd(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {lang === "bn" ? "বিরতি (মিনিট)" : "Break (min)"}
                </label>
                <input
                  type="number"
                  min="0"
                  max="240"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-500 mb-2">
                {lang === "bn" ? "সাপ্তাহিক ছুটির দিন" : "Weekly Rest Days"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  [0, lang === "bn" ? "রবি" : "Sun"],
                  [1, lang === "bn" ? "সোম" : "Mon"],
                  [2, lang === "bn" ? "মঙ্গল" : "Tue"],
                  [3, lang === "bn" ? "বুধ" : "Wed"],
                  [4, lang === "bn" ? "বৃহঃ" : "Thu"],
                  [5, lang === "bn" ? "শুক্র" : "Fri"],
                  [6, lang === "bn" ? "শনি" : "Sat"],
                ].map(([dayIdx, label]) => {
                  const idx = Number(dayIdx);
                  const active = restDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        setRestDays((prev) =>
                          prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                        active
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                          : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-xs font-medium">
                  {lang === "bn" ? "দুপুরের খাবার কর্মঘণ্টায় গণনা করুন" : "Count lunch break as business hours"}
                </span>
                <input
                  type="checkbox"
                  checked={countLunchAsWork}
                  onChange={(e) => setCountLunchAsWork(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                <span className="text-xs font-medium">
                  {lang === "bn" ? "বিশ্রাম সময় কর্মঘণ্টায় গণনা করুন" : "Count rest break as business hours"}
                </span>
                <input
                  type="checkbox"
                  checked={countRestAsWork}
                  onChange={(e) => setCountRestAsWork(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{lang === "bn" ? "কর্মঘণ্টা সেটিংস সংরক্ষণ করুন" : "Save Working Hours"}</span>
            </button>

            {goalMsg && <p className="text-xs text-emerald-500">{goalMsg}</p>}
          </form>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">
                {lang === "bn" ? "দোকানের বাইরে যাওয়ার কারণসমূহ" : "Outside Exit Reasons"}
              </h2>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {reasons.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs"
                >
                  <div>
                    <span className="font-semibold">{lang === "bn" ? r.nameBn : r.nameEn}</span>
                    <span className="text-zinc-400 ml-2">({lang === "bn" ? r.nameEn : r.nameBn})</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                      r.countsAsBusinessTime
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-amber-500/15 text-amber-500"
                    }`}
                  >
                    {r.countsAsBusinessTime
                      ? lang === "bn"
                        ? "ব্যবসায়িক"
                        : "Business"
                      : lang === "bn"
                        ? "ব্যক্তিগত/বিরতি"
                        : "Personal"}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <div className="text-xs font-medium text-zinc-500">
                {lang === "bn" ? "নতুন কাস্টম কারণ যোগ করুন" : "Add Custom Exit Reason"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newReasonBn}
                  onChange={(e) => setNewReasonBn(e.target.value)}
                  placeholder={lang === "bn" ? "বাংলা নাম" : "Bengali label"}
                  className="min-h-[40px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                />
                <input
                  type="text"
                  value={newReasonEn}
                  onChange={(e) => setNewReasonEn(e.target.value)}
                  placeholder={lang === "bn" ? "ইংরেজি নাম" : "English label"}
                  className="min-h-[40px] px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={newReasonBusiness}
                  onChange={(e) => setNewReasonBusiness(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                <span>
                  {lang === "bn" ? "ব্যবসায়িক কর্মঘণ্টায় যোগ হবে" : "Counts as business hours"}
                </span>
              </label>
              <button
                type="button"
                onClick={handleAddReason}
                className="w-full min-h-[40px] rounded-xl border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{lang === "bn" ? "কারণ যোগ করুন" : "Add Reason"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === "GENERAL" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-5">
            <h2 className="text-sm font-semibold">
              {lang === "bn" ? "ভাষা, সংখ্যা ও থিম" : "Language, Numerals & Theme"}
            </h2>

            <div className="space-y-2">
              <div className="text-xs text-zinc-500">{lang === "bn" ? "অ্যাপের ভাষা" : "App Language"}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updatePref({ language: "bn" })}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold ${
                    prefs.language === "bn"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  বাংলা (bn-BD)
                </button>
                <button
                  type="button"
                  onClick={() => updatePref({ language: "en" })}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold ${
                    prefs.language === "en"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  English (US)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-zinc-500">{lang === "bn" ? "সংখ্যা ফরম্যাট" : "Number Format"}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updatePref({ numberFormat: "bn" })}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold ${
                    prefs.numberFormat === "bn"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  বাংলা (০১২৩)
                </button>
                <button
                  type="button"
                  onClick={() => updatePref({ numberFormat: "en" })}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold ${
                    prefs.numberFormat === "en"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  English (0123)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-zinc-500">{lang === "bn" ? "থিম মোড" : "Appearance"}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updatePref({ theme: "dark" })}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-2 ${
                    prefs.theme === "dark"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  <Moon className="w-4 h-4" />
                  <span>{lang === "bn" ? "ডার্ক মোড" : "Dark"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => updatePref({ theme: "light" })}
                  className={`min-h-[44px] rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-2 ${
                    prefs.theme === "light"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                      : "border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  <Sun className="w-4 h-4" />
                  <span>{lang === "bn" ? "লাইট মোড" : "Light"}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {/* App PIN Lock */}
            <form
              onSubmit={handleSetPin}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold">
                  {lang === "bn" ? "অ্যাপ লক / পিন সুরক্ষা" : "App PIN Lock"}
                </h2>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder={lang === "bn" ? "নতুন ৪-৬ সংখ্যার পিন" : "4–6 digit PIN"}
                  className="flex-1 h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                />
                <button
                  type="submit"
                  className="px-4 h-11 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  {lang === "bn" ? "সেট করুন" : "Set PIN"}
                </button>
              </div>
              {prefs.pinHash && (
                <button
                  type="button"
                  onClick={() => updatePref({ pinHash: null })}
                  className="text-xs text-rose-500 hover:underline"
                >
                  {lang === "bn" ? "পিন লক বন্ধ করুন" : "Disable PIN Lock"}
                </button>
              )}
              {pinMsg && <p className="text-xs text-emerald-500">{pinMsg}</p>}
            </form>

            {/* Privacy Info */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span>{lang === "bn" ? "গোপনীয়তা ও অফলাইন সুরক্ষা" : "Privacy & Offline First"}</span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {lang === "bn"
                  ? "আপনার সমস্ত সময়, আয় এবং ডায়েরির তথ্য আপনার ডিভাইসের স্থানীয় ডাটাবেসে সংরক্ষিত থাকে। অবস্থানের ইতিহাস কখনো ক্লাউডে পাঠানো হয় না।"
                  : "All sessions, income, and journal data are stored locally on your device. Location coordinates are never sent to external servers or AI."}
              </p>
            </div>
          </div>
        </div>
      )}

      {subTab === "LOCATION" && (
        <form
          onSubmit={handleSaveShopLocation}
          className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4 max-w-2xl"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {lang === "bn" ? "দোকান ও জিওফেন্স সেটিংস" : "Shop Location & Geofence"}
            </h2>
            <button
              type="button"
              onClick={handleCaptureGps}
              className="min-h-[38px] px-3 rounded-lg border border-emerald-500/40 text-emerald-500 text-xs font-medium inline-flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5" />
              {lang === "bn" ? "বর্তমান অবস্থান নিন" : "Capture GPS"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "দোকানের নাম" : "Shop Name"}</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">{lang === "bn" ? "ঠিকানা" : "Address"}</label>
              <input
                type="text"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Latitude</label>
              <input
                type="text"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Longitude</label>
              <input
                type="text"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">{lang === "bn" ? "জিওফেন্স ব্যাসার্ধ" : "Geofence Radius"}</span>
              <span className="font-mono-tabular font-semibold">
                {formatNumber(radius, nf)} {lang === "bn" ? "মিটার" : "m"}
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={500}
              step={10}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="space-y-2.5 text-xs pt-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gpsEnabled}
                onChange={(e) => setGpsEnabled(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
              {lang === "bn" ? "স্বয়ংক্রিয় জিপিএস ট্র্যাকিং চালু রাখুন" : "Enable automatic GPS geofencing"}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={gpsAutoConfirm}
                onChange={(e) => setGpsAutoConfirm(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
              {lang === "bn"
                ? "আগমন/প্রস্থান স্বয়ংক্রিয়ভাবে নিশ্চিত করুন (অন্যথায় রিভিউ চাইলে জিজ্ঞাসা করবে)"
                : "Auto-confirm arrival/exit sessions without prompt"}
            </label>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">
                {lang === "bn" ? "ভুয়া জিপিএস প্রতিরোধ বিলম্ব (সেকেন্ড):" : "Confirmation Delay (sec):"}
              </span>
              <input
                type="number"
                min={10}
                max={300}
                value={gpsDelay}
                onChange={(e) => setGpsDelay(Number(e.target.value) || 60)}
                className="w-24 h-9 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] font-mono-tabular"
              />
            </div>
          </div>

          {locStatusMsg && <p className="text-xs text-emerald-500">{locStatusMsg}</p>}
          <button
            type="submit"
            className="min-h-[46px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
          >
            {lang === "bn" ? "সংরক্ষণ করুন" : "Save Location Settings"}
          </button>
        </form>
      )}

      {subTab === "NOTIFICATIONS" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4 max-w-2xl">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {lang === "bn" ? "নোটিফিকেশন ও রিমাইন্ডার" : "Notifications & Reminders"}
            </h2>
            <button
              type="button"
              onClick={handleRequestBrowserNotifications}
              className="min-h-[38px] px-3 rounded-lg border border-emerald-500/40 text-emerald-500 text-xs font-medium"
            >
              {lang === "bn" ? "ব্রাউজার অনুমতি দিন" : "Enable Alerts"}
            </button>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {notifications.map((n) => (
              <div key={n.type} className="py-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={n.enabled}
                    onChange={async (e) => {
                      await putItem("notificationSettings", { ...n, enabled: e.target.checked });
                      await onRefresh();
                    }}
                    className="accent-emerald-500 w-4 h-4"
                  />
                  <span>{NOTIFICATION_LABELS[n.type][lang]}</span>
                </label>
                {n.scheduledTime !== "00:00" && (
                  <input
                    type="time"
                    value={n.scheduledTime}
                    onChange={async (e) => {
                      await putItem("notificationSettings", { ...n, scheduledTime: e.target.value });
                      await onRefresh();
                    }}
                    className="h-9 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === "BACKUP" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-5 max-w-2xl">
          <h2 className="text-sm font-semibold">
            {lang === "bn" ? "ব্যাকআপ, পুনরুদ্ধার ও ডেটা রিসেট" : "Backup, Restore & Data Wipe"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleBackupDownload}
              className="min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>{lang === "bn" ? "JSON ব্যাকআপ ডাউনলোড" : "Download JSON Backup"}</span>
            </button>
            <label className="min-h-[48px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>{lang === "bn" ? "ব্যাকআপ পুনরুদ্ধার করুন" : "Restore JSON Backup"}</span>
              <input type="file" accept=".json" onChange={handleRestoreUpload} className="hidden" />
            </label>
          </div>
          {backupMsg && <p className="text-xs text-emerald-500">{backupMsg}</p>}

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="text-xs font-semibold text-rose-500">
              {lang === "bn" ? "সকল ডেটা মুছে ফেলুন" : "Delete All Local Data"}
            </div>
            {wipeStep === 0 ? (
              <button
                type="button"
                onClick={() => setWipeStep(1)}
                className="min-h-[44px] px-4 rounded-xl border border-rose-500/40 text-rose-500 text-xs font-semibold inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{lang === "bn" ? "সব ডেটা রিসেট করুন" : "Wipe All Data"}</span>
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleWipeAll}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                >
                  {lang === "bn" ? "হ্যাঁ, সব স্থায়ীভাবে মুছুন" : "Confirm Permanent Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setWipeStep(0)}
                  className="min-h-[44px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs"
                >
                  {lang === "bn" ? "বাতিল" : "Cancel"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === "ANDROID" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">
                {lang === "bn"
                  ? "নেটিভ Android Studio Kotlin প্রজেক্ট"
                  : "Native Android Studio Kotlin Project"}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {lang === "bn"
                  ? "Jetpack Compose, Room DB, Hilt DI, Geofencing API ও WorkManager সহ সম্পূর্ণ প্রজেক্ট ডাউনলোড করুন।"
                  : "Complete Kotlin + Jetpack Compose + Room + Hilt + Geofencing source tree ready for Android Studio."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {apkInfo?.available && (
                <a
                  href="/api/android-project/apk"
                  download="SHOP-TIME-MASTER-v1.0.0-debug.apk"
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-2 shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {lang === "bn" ? "Debug APK ডাউনলোড" : "Download Debug APK"} (
                    {(apkInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                </a>
              )}
              <a
                href="/api/android-project/download"
                download="ShopTimeMaster-AndroidStudio.zip"
                className="min-h-[44px] px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold inline-flex items-center gap-2 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>{lang === "bn" ? "সোর্স ZIP" : "Source ZIP"}</span>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 max-h-96 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
              {androidFiles.map((file) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => loadAndroidFile(file)}
                  className={`w-full text-left px-3 py-2 text-xs font-mono-tabular truncate transition-colors ${
                    selectedAndroidFile === file
                      ? "bg-emerald-500/15 text-emerald-500 font-semibold"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {file}
                </button>
              ))}
            </div>
            <div className="lg:col-span-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#090D0B] p-4 max-h-96 overflow-auto">
              <div className="text-xs font-mono-tabular text-emerald-500 mb-2">
                {selectedAndroidFile || "Select a file"}
              </div>
              <pre className="text-[11px] font-mono-tabular text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap break-words">
                {androidFileContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
