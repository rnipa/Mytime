import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  MapPin,
  Navigation,
  Pause,
  Play,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { putItem, uid } from "../db/indexedDb";
import { GeofenceState } from "../hooks/useGeofenceTracker";
import { t } from "../i18n/translations";
import {
  AppPreferences,
  LocationEvent,
  OutsidePeriod,
  OutsideReason,
  Shop,
  TimeSession,
} from "../types/domain";
import {
  formatDateDhaka,
  formatElapsedTimer,
  formatNumber,
  formatTimeDhaka,
  getDhakaDateParts,
} from "../utils/dhakaTime";

export const ExitReasonModal: React.FC<{
  open: boolean;
  mode: "CHECKOUT" | "STEP_OUTSIDE";
  reasons: OutsideReason[];
  prefs: AppPreferences;
  onClose: () => void;
  onConfirm: (reasonId: string, notes: string) => Promise<void>;
  onAddCustomReason: (reason: OutsideReason) => Promise<void>;
}> = ({ open, mode, reasons, prefs, onClose, onConfirm, onAddCustomReason }) => {
  const [selectedId, setSelectedId] = useState<string>(reasons[0]?.id ?? "lunch");
  const [notes, setNotes] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customBusiness, setCustomBusiness] = useState(false);
  const lang = prefs.language;
  const dict = t(lang);

  if (!open) return null;

  const handleSaveCustom = async () => {
    if (!customName.trim()) return;
    const newR: OutsideReason = {
      id: uid("reason"),
      nameBn: customName.trim(),
      nameEn: customName.trim(),
      categoryType: customBusiness ? "BUSINESS" : "PERSONAL",
      countsAsBusinessTime: customBusiness,
      isCustom: true,
    };
    await onAddCustomReason(newR);
    setSelectedId(newR.id);
    setCustomName("");
    setAddingCustom(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 mx-auto sm:hidden" />
        <div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {mode === "CHECKOUT"
              ? lang === "bn"
                ? "দোকান থেকে বের হওয়ার কারণ"
                : "Reason for Shop Check Out"
              : dict.outsideReasonTitle}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {lang === "bn"
              ? "ব্যবসায়িক কাজ মোট কর্মঘণ্টায় যুক্ত হবে; ব্যক্তিগত কাজ আলাদা হিসাব হবে।"
              : "Business reasons count toward total business hours; personal reasons stay separate."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {reasons.map((r) => {
            const active = selectedId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                  active
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-semibold"
                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 text-zinc-800 dark:text-zinc-200"
                }`}
              >
                <div className="text-sm truncate">{lang === "bn" ? r.nameBn : r.nameEn}</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {r.categoryType === "BUSINESS" || r.countsAsBusinessTime
                    ? lang === "bn"
                      ? "ব্যবসায়িক"
                      : "Business"
                    : r.categoryType === "BREAK"
                      ? lang === "bn"
                        ? "বিরতি"
                        : "Break"
                      : lang === "bn"
                        ? "ব্যক্তিগত"
                        : "Personal"}
                </div>
              </button>
            );
          })}
        </div>

        {!addingCustom ? (
          <button
            type="button"
            onClick={() => setAddingCustom(true)}
            className="text-xs font-medium text-emerald-500 hover:text-emerald-400 inline-flex items-center gap-1.5 min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            {dict.addCustomReason}
          </button>
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3.5 space-y-3">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={lang === "bn" ? "নতুন কারণের নাম..." : "Custom reason name..."}
              className="w-full h-10 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
            />
            <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={customBusiness}
                onChange={(e) => setCustomBusiness(e.target.checked)}
                className="accent-emerald-500 w-4 h-4"
              />
              {lang === "bn"
                ? "এটি ব্যবসায়িক কাজের সময় হিসেবে গণনা করুন"
                : "Count as business working time"}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveCustom}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                {dict.save}
              </button>
              <button
                type="button"
                onClick={() => setAddingCustom(false)}
                className="px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs"
              >
                {dict.cancel}
              </button>
            </div>
          </div>
        )}

        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={dict.optionalNote}
          className="w-full p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
          >
            {dict.cancel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedId, notes)}
            className="min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
          >
            {dict.confirmExit}
          </button>
        </div>
      </div>
    </div>
  );
};

export const TrackerView: React.FC<{
  nowMs: number;
  shop: Shop | null;
  prefs: AppPreferences;
  activeSession: TimeSession | null;
  activeOutside: OutsidePeriod | null;
  reasons: OutsideReason[];
  geofenceState: GeofenceState;
  locationEvents: LocationEvent[];
  recoverySessions: TimeSession[];
  onCheckIn: () => void;
  onCheckOut: () => void;
  onStepOutside: () => void;
  onReturnToShop: () => void;
  onTogglePauseGps: () => Promise<void>;
  onConfirmLocationEvent: (ev: LocationEvent) => Promise<void>;
  onDismissLocationEvent: (ev: LocationEvent) => Promise<void>;
  onResolveRecoverySession: (session: TimeSession, checkOutMs: number) => Promise<void>;
}> = ({
  nowMs,
  shop,
  prefs,
  activeSession,
  activeOutside,
  reasons,
  geofenceState,
  locationEvents,
  recoverySessions,
  onCheckIn,
  onCheckOut,
  onStepOutside,
  onReturnToShop,
  onTogglePauseGps,
  onConfirmLocationEvent,
  onDismissLocationEvent,
  onResolveRecoverySession,
}) => {
  const lang = prefs.language;
  const nf = prefs.numberFormat;
  const dict = t(lang);
  const [recoveryTimes, setRecoveryTimes] = useState<Record<string, string>>({});

  const pendingEvents = locationEvents
    .filter((e) => e.status === "PENDING_REVIEW")
    .sort((a, b) => b.timestamp - a.timestamp);
  const recentEvents = locationEvents
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 8);

  const activeReason = activeOutside
    ? reasons.find((r) => r.id === activeOutside.reasonId)
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {lang === "bn" ? "লাইভ সময় ও জিওফেন্স ট্র্যাকার" : "Live Time & Geofence Tracker"}
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {lang === "bn"
            ? "ম্যানুয়াল এবং স্বয়ংক্রিয় জিপিএস ট্র্যাকিং একসাথে ওভারল্যাপ-মুক্তভাবে কাজ করে।"
            : "Manual and automatic GPS tracking run together with strict overlap protection."}
        </p>
      </div>

      {/* Live Session Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              {lang === "bn" ? "বর্তমান সেশন" : "Live Session"}
            </span>
            <span className="text-xs font-mono-tabular text-zinc-500">
              {activeSession
                ? `${activeSession.source} · ${formatTimeDhaka(activeSession.checkIn, lang, nf)}`
                : activeOutside
                  ? `${lang === "bn" ? "বাইরে থেকে শুরু" : "Outside since"} ${formatTimeDhaka(activeOutside.exitTime, lang, nf)}`
                  : lang === "bn"
                    ? "নিষ্ক্রিয়"
                    : "Idle"}
            </span>
          </div>

          <div className="py-4 text-center rounded-xl bg-zinc-50 dark:bg-[#090D0B] border border-zinc-200/70 dark:border-zinc-800/80">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeSession
                ? lang === "bn"
                  ? "দোকানে চলমান সময়"
                  : "Active Shop Timer"
                : activeOutside
                  ? `${lang === "bn" ? "বাইরে অবস্থান" : "Outside"} — ${
                      lang === "bn" ? activeReason?.nameBn ?? "" : activeReason?.nameEn ?? ""
                    }`
                  : lang === "bn"
                    ? "কোনো সক্রিয় সেশন নেই"
                    : "No Active Session"}
            </div>
            <div
              className={`text-4xl font-bold font-mono-tabular mt-2 ${
                activeSession
                  ? "text-emerald-500"
                  : activeOutside
                    ? "text-amber-500"
                    : "text-zinc-400 dark:text-zinc-600"
              }`}
            >
              {activeSession
                ? formatElapsedTimer(nowMs - activeSession.checkIn, nf)
                : activeOutside
                  ? formatElapsedTimer(nowMs - activeOutside.exitTime, nf)
                  : formatElapsedTimer(0, nf)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {!activeSession ? (
              <button
                type="button"
                onClick={activeOutside ? onReturnToShop : onCheckIn}
                className="min-h-[50px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm sm:col-span-2"
              >
                {activeOutside ? dict.returnShopBtn : dict.checkInBtn}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onStepOutside}
                  className="min-h-[50px] rounded-xl border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 font-semibold text-sm"
                >
                  {dict.stepOutsideBtn}
                </button>
                <button
                  type="button"
                  onClick={onCheckOut}
                  className="min-h-[50px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm"
                >
                  {dict.checkOutBtn}
                </button>
              </>
            )}
          </div>
        </div>

        {/* GPS Geofence Panel */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold">
                {lang === "bn" ? "স্বয়ংক্রিয় জিপিএস জিওফেন্স" : "Automatic GPS Geofence"}
              </span>
            </div>
            <button
              type="button"
              onClick={onTogglePauseGps}
              className="min-h-[38px] px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {prefs.gpsPaused || !prefs.gpsEnabled ? (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-500" />
                  {dict.resumeGps}
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-500" />
                  {dict.pauseGps}
                </>
              )}
            </button>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
            <div className="py-2 flex justify-between">
              <span className="text-zinc-500">{lang === "bn" ? "দোকানের স্থানাঙ্ক" : "Shop Coordinates"}</span>
              <span className="font-mono-tabular">
                {shop?.latitude !== null && shop?.longitude !== null && shop
                  ? `${shop.latitude.toFixed(4)}, ${shop.longitude.toFixed(4)}`
                  : lang === "bn"
                    ? "নির্ধারিত নয়"
                    : "Not set"}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-zinc-500">{lang === "bn" ? "জিওফেন্স ব্যাসার্ধ" : "Geofence Radius"}</span>
              <span className="font-mono-tabular">
                {formatNumber(shop?.geofenceRadius ?? 100, nf)} {lang === "bn" ? "মিটার" : "m"}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-zinc-500">{lang === "bn" ? "বর্তমান দূরত্ব" : "Current Distance"}</span>
              <span className="font-mono-tabular">
                {geofenceState.currentDistanceMeters !== null
                  ? `${formatNumber(geofenceState.currentDistanceMeters, nf)} ${lang === "bn" ? "মি." : "m"}`
                  : "—"}
              </span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-zinc-500">{lang === "bn" ? "লোকেশন অনুমতি" : "Location Permission"}</span>
              <span className="font-medium capitalize">{geofenceState.permissionStatus}</span>
            </div>
            <div className="py-2 flex justify-between">
              <span className="text-zinc-500">{lang === "bn" ? "নিশ্চিতকরণ বিলম্ব" : "Confirmation Delay"}</span>
              <span className="font-mono-tabular">
                {formatNumber(prefs.gpsConfirmationDelaySec, nf)} {lang === "bn" ? "সেকেন্ড" : "sec"}
              </span>
            </div>
          </div>

          {geofenceState.pendingTransition && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-400">
              {lang === "bn"
                ? `জিপিএস ${geofenceState.pendingTransition.type} শনাক্ত হয়েছে — ভুয়া ইভেন্ট এড়াতে ${formatNumber(prefs.gpsConfirmationDelaySec, nf)} সেকেন্ড যাচাই চলছে...`
                : `GPS ${geofenceState.pendingTransition.type} detected — verifying stability for ${prefs.gpsConfirmationDelaySec}s...`}
            </div>
          )}

          {geofenceState.errorMessage && (
            <p className="text-xs text-amber-500">
              {geofenceState.errorMessage} ({lang === "bn" ? "ম্যানুয়াল ট্র্যাকিং সচল আছে" : "Manual tracking stays active"})
            </p>
          )}
        </div>
      </div>

      {/* Session Recovery Queue (Never invents exit timestamps!) */}
      {recoverySessions.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-white dark:bg-[#111714] p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-500 font-semibold text-sm">
            <RefreshCw className="w-4 h-4" />
            <span>
              {lang === "bn"
                ? "অসম্পূর্ণ সেশন রিকভারি (অনুমান ছাড়া সঠিক সময় দিন)"
                : "Session Recovery (Confirm Exact Exit Time)"}
            </span>
          </div>
          <div className="space-y-3">
            {recoverySessions.map((rs) => {
              const dateStr = getDhakaDateParts(rs.checkIn).dateStr;
              const defaultVal = recoveryTimes[rs.id] ?? "21:00";
              return (
                <div
                  key={rs.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800"
                >
                  <div>
                    <div className="text-sm font-medium">
                      {formatDateDhaka(dateStr, lang, nf)} ·{" "}
                      {lang === "bn" ? "প্রবেশ:" : "Check-In:"}{" "}
                      <span className="font-mono-tabular">
                        {formatTimeDhaka(rs.checkIn, lang, nf)}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {lang === "bn"
                        ? "অ্যাপ বন্ধ বা রিস্টার্টের কারণে বের হওয়ার সময় নিশ্চিত করা প্রয়োজন।"
                        : "Exit timestamp missing after restart/close. Please confirm exit time."}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={defaultVal}
                      onChange={(e) =>
                        setRecoveryTimes((prev) => ({ ...prev, [rs.id]: e.target.value }))
                      }
                      className="h-10 px-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const [hh, mm] = defaultVal.split(":").map(Number);
                        const [y, m, d] = dateStr.split("-").map(Number);
                        let exitMs = Date.UTC(y, m - 1, d, hh - 6, mm, 0, 0);
                        if (exitMs <= rs.checkIn) {
                          exitMs += 24 * 60 * 60 * 1000;
                        }
                        await onResolveRecoverySession(rs, exitMs);
                      }}
                      className="min-h-[40px] px-4 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      {dict.save}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GPS Event Review Queue */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold">
              {lang === "bn" ? "জিপিএস ইভেন্ট পর্যালোচনা (GPS Event Review)" : "GPS Event Review"}
            </h2>
          </div>
          <span className="text-xs font-mono-tabular text-zinc-500">
            {formatNumber(pendingEvents.length, nf)}{" "}
            {lang === "bn" ? "অপেক্ষমাণ" : "pending"}
          </span>
        </div>

        {pendingEvents.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 py-3">
            {lang === "bn"
              ? "বর্তমানে কোনো অনিশ্চিত জিপিএস ইভেন্ট নেই।"
              : "No uncertain GPS events pending confirmation."}
          </p>
        ) : (
          <div className="space-y-2.5">
            {pendingEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span>
                      {ev.eventType === "ENTER"
                        ? lang === "bn"
                          ? "দোকানে প্রবেশ শনাক্ত"
                          : "Shop Arrival Detected"
                        : lang === "bn"
                          ? "দোকান থেকে প্রস্থান শনাক্ত"
                          : "Shop Exit Detected"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 font-mono-tabular">
                    {formatTimeDhaka(ev.timestamp, lang, nf)} ·{" "}
                    {formatNumber(ev.distanceMeters, nf)}m (±{formatNumber(ev.accuracy, nf)}m)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmLocationEvent(ev)}
                    className="min-h-[40px] px-3.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === "bn" ? "নিশ্চিত" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissLocationEvent(ev)}
                    className="min-h-[40px] px-3.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {lang === "bn" ? "বাতিল" : "Dismiss"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {recentEvents.length > 0 && (
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <div className="text-xs font-medium text-zinc-500 mb-2">
              {lang === "bn" ? "সাম্প্রতিক জিপিএস লগ" : "Recent Location Events"}
            </div>
            <div className="space-y-1.5">
              {recentEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 py-1"
                >
                  <span>
                    {ev.eventType} · {formatTimeDhaka(ev.timestamp, lang, nf)}
                  </span>
                  <span className="font-mono-tabular">
                    {ev.status} · {formatNumber(ev.distanceMeters, nf)}m
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
