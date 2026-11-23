import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit3,
  History,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  deleteItem,
  hasSessionOverlap,
  logAudit,
  putItem,
  uid,
} from "../db/indexedDb";
import { t } from "../i18n/translations";
import {
  AppPreferences,
  AuditLog,
  DailyJournal,
  DayMetrics,
  OutsidePeriod,
  OutsideReason,
  Shop,
  TimeSession,
} from "../types/domain";
import {
  dhakaDateTimeToEpoch,
  formatDateDhaka,
  formatDurationCompact,
  formatNumber,
  formatTimeDhaka,
  getDhakaDateParts,
} from "../utils/dhakaTime";
import { DailyTimelineBar } from "./Charts";

export const ManualEntryModal: React.FC<{
  open: boolean;
  defaultDate: string;
  shop: Shop | null;
  prefs: AppPreferences;
  sessions: TimeSession[];
  reasons: OutsideReason[];
  editingSession?: TimeSession | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({
  open,
  defaultDate,
  shop,
  prefs,
  sessions,
  reasons,
  editingSession,
  onClose,
  onSaved,
}) => {
  const lang = prefs.language;
  const dict = t(lang);
  const [entryMode, setEntryMode] = useState<"SESSION" | "OUTSIDE">("SESSION");
  const [date, setDate] = useState(
    editingSession ? getDhakaDateParts(editingSession.checkIn).dateStr : defaultDate
  );
  const [startTime, setStartTime] = useState(() => {
    if (editingSession) {
      const p = getDhakaDateParts(editingSession.checkIn);
      return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    }
    return "09:00";
  });
  const [endTime, setEndTime] = useState(() => {
    if (editingSession?.checkOut) {
      const p = getDhakaDateParts(editingSession.checkOut);
      return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    }
    return "20:00";
  });
  const [reasonId, setReasonId] = useState(reasons[0]?.id ?? "business");
  const [notes, setNotes] = useState(editingSession?.notes ?? "");
  const [auditReason, setAuditReason] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const startMs = dhakaDateTimeToEpoch(date, startTime);
    let endMs = dhakaDateTimeToEpoch(date, endTime);
    if (endMs <= startMs) {
      // Allow midnight-crossing session up to next day
      endMs += 24 * 60 * 60 * 1000;
    }
    if (endMs - startMs > 23 * 3600 * 1000) {
      setError(
        lang === "bn"
          ? "সময়ের ব্যবধান ২৩ ঘণ্টার বেশি হতে পারে না।"
          : "Interval cannot exceed 23 hours."
      );
      return;
    }

    if (entryMode === "SESSION" || editingSession) {
      if (hasSessionOverlap(sessions, startMs, endMs, editingSession?.id)) {
        setError(
          lang === "bn"
            ? "এই সময়ের সাথে পূর্বের সেশন ওভারল্যাপ করছে।"
            : "This time overlaps with an existing session."
        );
        return;
      }
      if (editingSession) {
        const updated: TimeSession = {
          ...editingSession,
          checkIn: startMs,
          checkOut: endMs,
          status: "COMPLETED",
          notes,
        };
        await putItem("timeSessions", updated);
        await logAudit({
          entityType: "SESSION",
          entityId: editingSession.id,
          oldValue: `${new Date(editingSession.checkIn).toISOString()} -> ${
            editingSession.checkOut ? new Date(editingSession.checkOut).toISOString() : "OPEN"
          }`,
          newValue: `${new Date(startMs).toISOString()} -> ${new Date(endMs).toISOString()}`,
          reason: auditReason.trim() || "Manual session correction",
        });
      } else {
        const created: TimeSession = {
          id: uid("sess"),
          checkIn: startMs,
          checkOut: endMs,
          source: "MANUAL",
          status: "COMPLETED",
          shopId: shop?.id ?? "default_shop",
          notes,
          confidence: 1,
        };
        await putItem("timeSessions", created);
        await logAudit({
          entityType: "SESSION",
          entityId: created.id,
          oldValue: "NONE",
          newValue: `${new Date(startMs).toISOString()} -> ${new Date(endMs).toISOString()}`,
          reason: auditReason.trim() || "Added missed manual session",
        });
      }
    } else {
      const outside: OutsidePeriod = {
        id: uid("out"),
        sessionId: null,
        exitTime: startMs,
        returnTime: endMs,
        reasonId,
        notes,
        source: "MANUAL",
      };
      await putItem("outsidePeriods", outside);
      await logAudit({
        entityType: "OUTSIDE_PERIOD",
        entityId: outside.id,
        oldValue: "NONE",
        newValue: `${reasonId}: ${new Date(startMs).toISOString()} -> ${new Date(endMs).toISOString()}`,
        reason: auditReason.trim() || "Added manual outside period",
      });
    }

    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <h3 className="text-lg font-bold">
          {editingSession
            ? lang === "bn"
              ? "সেশন সংশোধন করুন"
              : "Edit Session"
            : lang === "bn"
              ? "ম্যানুয়াল সময় যোগ করুন"
              : "Add Manual Entry"}
        </h3>

        {!editingSession && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setEntryMode("SESSION")}
              className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${
                entryMode === "SESSION" ? "bg-emerald-600 text-white" : "text-zinc-500"
              }`}
            >
              {lang === "bn" ? "দোকানে উপস্থিতি" : "Shop Session"}
            </button>
            <button
              type="button"
              onClick={() => setEntryMode("OUTSIDE")}
              className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${
                entryMode === "OUTSIDE" ? "bg-emerald-600 text-white" : "text-zinc-500"
              }`}
            >
              {lang === "bn" ? "বাইরে থাকার রেকর্ড" : "Outside Period"}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{lang === "bn" ? "তারিখ" : "Date"}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">
              {entryMode === "OUTSIDE"
                ? lang === "bn"
                  ? "বের হওয়ার সময়"
                  : "Exit Time"
                : lang === "bn"
                  ? "প্রবেশের সময়"
                  : "Check In"}
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">
              {entryMode === "OUTSIDE"
                ? lang === "bn"
                  ? "ফিরার সময়"
                  : "Return Time"
                : lang === "bn"
                  ? "প্রস্থানের সময়"
                  : "Check Out"}
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm font-mono-tabular"
            />
          </div>
        </div>

        {entryMode === "OUTSIDE" && !editingSession && (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">{lang === "bn" ? "কারণ" : "Reason"}</label>
            <select
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
            >
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {lang === "bn" ? r.nameBn : r.nameEn}
                </option>
              ))}
            </select>
          </div>
        )}

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={dict.optionalNote}
          className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
        />

        {editingSession && (
          <input
            type="text"
            value={auditReason}
            onChange={(e) => setAuditReason(e.target.value)}
            placeholder={
              lang === "bn" ? "সংশোধনের কারণ (অডিট লগের জন্য)" : "Reason for correction (audit log)"
            }
            className="w-full h-11 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
          />
        )}

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
          >
            {dict.cancel}
          </button>
          <button
            type="submit"
            className="min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
          >
            {dict.save}
          </button>
        </div>
      </form>
    </div>
  );
};

export const HistoryView: React.FC<{
  todayStr: string;
  shop: Shop | null;
  prefs: AppPreferences;
  sessions: TimeSession[];
  outsidePeriods: OutsidePeriod[];
  reasons: OutsideReason[];
  dayMap: Map<string, DayMetrics>;
  journals: DailyJournal[];
  auditLogs: AuditLog[];
  onRefresh: () => Promise<void>;
}> = ({
  todayStr,
  shop,
  prefs,
  sessions,
  outsidePeriods,
  reasons,
  dayMap,
  journals,
  auditLogs,
  onRefresh,
}) => {
  const lang = prefs.language;
  const nf = prefs.numberFormat;
  const dict = t(lang);

  const [subTab, setSubTab] = useState<"TIMELINE" | "CALENDAR" | "JOURNAL" | "AUDIT">("TIMELINE");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [calMonth, setCalMonth] = useState(todayStr.slice(0, 7)); // YYYY-MM
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TimeSession | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteOutsideConfirmId, setDeleteOutsideConfirmId] = useState<string | null>(null);

  // Journal state
  const existingJournal = journals.find((j) => j.date === selectedDate);
  const [jCompleted, setJCompleted] = useState(existingJournal?.completedTasks ?? "");
  const [jPending, setJPending] = useState(existingJournal?.pendingTasks ?? "");
  const [jImportant, setJImportant] = useState(existingJournal?.importantTasks ?? "");
  const [jProblems, setJProblems] = useState(existingJournal?.businessProblems ?? "");
  const [jObservations, setJObservations] = useState(existingJournal?.personalObservations ?? "");
  const [jTomorrow, setJTomorrow] = useState(existingJournal?.tomorrowPlan ?? "");
  const [journalSearch, setJournalSearch] = useState("");
  const [journalSavedMsg, setJournalSavedMsg] = useState("");

  const syncJournalForDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    const j = journals.find((x) => x.date === dateStr);
    setJCompleted(j?.completedTasks ?? "");
    setJPending(j?.pendingTasks ?? "");
    setJImportant(j?.importantTasks ?? "");
    setJProblems(j?.businessProblems ?? "");
    setJObservations(j?.personalObservations ?? "");
    setJTomorrow(j?.tomorrowPlan ?? "");
    setJournalSavedMsg("");
  };

  const daySessions = useMemo(
    () =>
      sessions
        .filter((s) => getDhakaDateParts(s.checkIn).dateStr === selectedDate)
        .sort((a, b) => b.checkIn - a.checkIn),
    [sessions, selectedDate]
  );

  const dayOutsides = useMemo(
    () =>
      outsidePeriods
        .filter((o) => getDhakaDateParts(o.exitTime).dateStr === selectedDate)
        .sort((a, b) => b.exitTime - a.exitTime),
    [outsidePeriods, selectedDate]
  );

  const reasonMap = new Map(reasons.map((r) => [r.id, r]));

  const calendarCells = useMemo(() => {
    const [y, m] = calMonth.split("-").map(Number);
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: Array<{ day: number | null; dateStr: string }> = [];
    for (let i = 0; i < firstDow; i++) cells.push({ day: null, dateStr: "" });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr });
    }
    return cells;
  }, [calMonth]);

  const shiftCalMonth = (delta: number) => {
    const [y, m] = calMonth.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
    setCalMonth(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const handleDeleteSession = async (s: TimeSession) => {
    await deleteItem("timeSessions", s.id);
    await logAudit({
      entityType: "SESSION",
      entityId: s.id,
      oldValue: `${new Date(s.checkIn).toISOString()} -> ${
        s.checkOut ? new Date(s.checkOut).toISOString() : "OPEN"
      }`,
      newValue: "DELETED",
      reason: "User deleted erroneous session",
    });
    setDeleteConfirmId(null);
    await onRefresh();
  };

  const handleDeleteOutside = async (o: OutsidePeriod) => {
    await deleteItem("outsidePeriods", o.id);
    await logAudit({
      entityType: "OUTSIDE_PERIOD",
      entityId: o.id,
      oldValue: `${o.reasonId} (${new Date(o.exitTime).toISOString()})`,
      newValue: "DELETED",
      reason: "User deleted outside period",
    });
    setDeleteOutsideConfirmId(null);
    await onRefresh();
  };

  const handleReasonChange = async (o: OutsidePeriod, nextReasonId: string) => {
    await putItem("outsidePeriods", { ...o, reasonId: nextReasonId });
    await logAudit({
      entityType: "OUTSIDE_PERIOD",
      entityId: o.id,
      oldValue: o.reasonId,
      newValue: nextReasonId,
      reason: "Corrected outside reason",
    });
    await onRefresh();
  };

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    const record: DailyJournal = {
      id: existingJournal?.id ?? selectedDate,
      date: selectedDate,
      completedTasks: jCompleted,
      pendingTasks: jPending,
      importantTasks: jImportant,
      businessProblems: jProblems,
      personalObservations: jObservations,
      tomorrowPlan: jTomorrow,
      updatedAt: Date.now(),
    };
    await putItem("dailyJournals", record);
    await onRefresh();
    setJournalSavedMsg(lang === "bn" ? "ডায়েরি সংরক্ষিত হয়েছে।" : "Journal saved.");
  };

  const filteredJournals = journals
    .filter((j) => {
      if (!journalSearch.trim()) return true;
      const q = journalSearch.toLowerCase();
      return (
        j.date.includes(q) ||
        j.completedTasks.toLowerCase().includes(q) ||
        j.pendingTasks.toLowerCase().includes(q) ||
        j.businessProblems.toLowerCase().includes(q) ||
        j.tomorrowPlan.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {lang === "bn" ? "ইতিহাস, সংশোধন ও ডায়েরি" : "History, Corrections & Journal"}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            {formatDateDhaka(selectedDate, lang, nf)} · Asia/Dhaka
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingSession(null);
            setModalOpen(true);
          }}
          className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{dict.addManualEntry}</span>
        </button>
      </div>

      {/* Sub-Navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-900 overflow-x-auto">
        {(
          [
            ["TIMELINE", lang === "bn" ? "টাইমলাইন ও সেশন" : "Timeline", History],
            ["CALENDAR", lang === "bn" ? "ক্যালেন্ডার" : "Calendar", Calendar],
            ["JOURNAL", lang === "bn" ? "দৈনিক ডায়েরি" : "Daily Journal", BookOpen],
            ["AUDIT", lang === "bn" ? "অডিট লগ" : "Audit Log", Edit3],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              subTab === key
                ? "bg-white dark:bg-[#111714] text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {subTab === "TIMELINE" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-zinc-500">
              {lang === "bn" ? "তারিখ নির্বাচন:" : "Select Date:"}
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => syncJournalForDate(e.target.value)}
              className="h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#111714] text-sm font-mono-tabular"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
              <h2 className="text-sm font-semibold">
                {lang === "bn" ? "দৈনিক সময়রেখা" : "Daily Timeline"}
              </h2>
              <DailyTimelineBar
                dateStr={selectedDate}
                sessions={sessions}
                outsidePeriods={outsidePeriods}
                reasons={reasons}
                lang={lang}
                numberFormat={nf}
              />
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
              <h2 className="text-sm font-semibold">
                {lang === "bn" ? "সেশন ও বাইরে থাকার রেকর্ড" : "Sessions & Outside Records"}
              </h2>

              {daySessions.length === 0 && dayOutsides.length === 0 ? (
                <p className="text-xs text-zinc-500 py-6 text-center">
                  {lang === "bn" ? "এই দিনে কোনো রেকর্ড পাওয়া যায়নি।" : "No records for this date."}
                </p>
              ) : (
                <div className="space-y-3">
                  {daySessions.map((s) => {
                    const durMin = s.checkOut ? (s.checkOut - s.checkIn) / 60000 : 0;
                    return (
                      <div
                        key={s.id}
                        className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold font-mono-tabular">
                            {formatTimeDhaka(s.checkIn, lang, nf)} —{" "}
                            {s.checkOut
                              ? formatTimeDhaka(s.checkOut, lang, nf)
                              : lang === "bn"
                                ? "চলমান"
                                : "Active"}
                          </div>
                          <span className="text-xs font-mono-tabular text-emerald-500">
                            {s.checkOut ? formatDurationCompact(durMin, lang, nf) : s.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>
                            {s.source} {s.notes ? `· ${s.notes}` : ""}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSession(s);
                                setModalOpen(true);
                              }}
                              className="p-1.5 text-zinc-500 hover:text-emerald-500"
                              aria-label="Edit session"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {deleteConfirmId === s.id ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteSession(s)}
                                className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold"
                              >
                                {lang === "bn" ? "নিশ্চিত মুছুন" : "Confirm"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(s.id)}
                                className="p-1.5 text-zinc-500 hover:text-rose-500"
                                aria-label="Delete session"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {dayOutsides.map((o) => {
                    const durMin = o.returnTime ? (o.returnTime - o.exitTime) / 60000 : 0;
                    return (
                      <div
                        key={o.id}
                        className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono-tabular text-zinc-500">
                            {formatTimeDhaka(o.exitTime, lang, nf)} —{" "}
                            {o.returnTime
                              ? formatTimeDhaka(o.returnTime, lang, nf)
                              : lang === "bn"
                                ? "বাইরে"
                                : "Open"}
                          </span>
                          <span className="text-xs font-mono-tabular text-amber-500">
                            {o.returnTime ? formatDurationCompact(durMin, lang, nf) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={o.reasonId}
                            onChange={(e) => handleReasonChange(o, e.target.value)}
                            className="h-8 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs"
                          >
                            {reasons.map((r) => (
                              <option key={r.id} value={r.id}>
                                {lang === "bn" ? r.nameBn : r.nameEn}
                              </option>
                            ))}
                          </select>
                          {deleteOutsideConfirmId === o.id ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteOutside(o)}
                              className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-semibold"
                            >
                              {lang === "bn" ? "নিশ্চিত" : "Confirm"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteOutsideConfirmId(o.id)}
                              className="p-1.5 text-zinc-500 hover:text-rose-500"
                              aria-label="Delete outside period"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === "CALENDAR" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftCalMonth(-1)}
              className="min-h-[40px] min-w-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-bold font-mono-tabular">{calMonth}</div>
            <button
              type="button"
              onClick={() => shiftCalMonth(1)}
              className="min-h-[40px] min-w-[40px] rounded-lg border border-zinc-300 dark:border-zinc-700 flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-zinc-500 font-medium">
            {(lang === "bn"
              ? ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"]
              : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            ).map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, i) => {
              if (!cell.day) return <div key={i} className="h-14" />;
              const m = dayMap.get(cell.dateStr);
              const isSelected = cell.dateStr === selectedDate;
              const hrs = m ? (m.totalBusinessMinutes / 60).toFixed(1) : "0";
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => {
                    syncJournalForDate(cell.dateStr);
                    setSubTab("TIMELINE");
                  }}
                  className={`h-14 rounded-xl border p-1.5 flex flex-col items-center justify-between text-xs transition-colors ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/15"
                      : m?.goalAchieved
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="font-mono-tabular font-semibold">
                    {formatNumber(cell.day, nf)}
                  </span>
                  <span
                    className={`text-[10px] font-mono-tabular ${
                      m && m.totalBusinessMinutes > 0
                        ? m.goalAchieved
                          ? "text-emerald-500"
                          : "text-amber-500"
                        : "text-zinc-400"
                    }`}
                  >
                    {m && m.totalBusinessMinutes > 0
                      ? `${formatNumber(Number(hrs), nf, 1)}h`
                      : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {subTab === "JOURNAL" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <form
            onSubmit={handleSaveJournal}
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-3.5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {lang === "bn" ? "দৈনিক ডায়েরি লিখুন" : "Daily Journal Entry"}
              </h2>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => syncJournalForDate(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-xs font-mono-tabular"
              />
            </div>

            {[
              [
                lang === "bn" ? "সম্পন্ন কাজ" : "Completed Tasks",
                jCompleted,
                setJCompleted,
              ],
              [
                lang === "bn" ? "অসম্পূর্ণ কাজ" : "Pending Tasks",
                jPending,
                setJPending,
              ],
              [
                lang === "bn" ? "গুরুত্বপূর্ণ কাজ" : "Important Tasks",
                jImportant,
                setJImportant,
              ],
              [
                lang === "bn" ? "ব্যবসায়িক সমস্যা" : "Business Problems",
                jProblems,
                setJProblems,
              ],
              [
                lang === "bn" ? "ব্যক্তিগত পর্যবেক্ষণ" : "Personal Observations",
                jObservations,
                setJObservations,
              ],
              [
                lang === "bn" ? "আগামীকালের পরিকল্পনা" : "Tomorrow's Plan",
                jTomorrow,
                setJTomorrow,
              ],
            ].map(([label, val, setter]) => (
              <div key={label as string} className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">{label as string}</label>
                <textarea
                  rows={2}
                  value={val as string}
                  onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
                />
              </div>
            ))}

            {journalSavedMsg && <p className="text-xs text-emerald-500">{journalSavedMsg}</p>}
            <button
              type="submit"
              className="w-full min-h-[46px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
            >
              {dict.save}
            </button>
          </form>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-3" />
              <input
                type="text"
                value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
                placeholder={lang === "bn" ? "ডায়েরি খুঁজুন..." : "Search journal history..."}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#090D0B] text-sm"
              />
            </div>

            {filteredJournals.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                {lang === "bn" ? "এখনও কোনো ডায়েরি সংরক্ষিত হয়নি।" : "No journal entries yet."}
              </p>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto">
                {filteredJournals.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => syncJournalForDate(j.date)}
                    className="w-full text-left p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 space-y-1.5"
                  >
                    <div className="text-xs font-mono-tabular font-semibold text-emerald-500">
                      {formatDateDhaka(j.date, lang, nf)}
                    </div>
                    {j.completedTasks && (
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-2">
                        {j.completedTasks}
                      </p>
                    )}
                    {j.tomorrowPlan && (
                      <p className="text-[11px] text-zinc-500 line-clamp-1">
                        {lang === "bn" ? "পরিকল্পনা: " : "Plan: "}
                        {j.tomorrowPlan}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === "AUDIT" && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111714] p-6 space-y-4">
          <h2 className="text-sm font-semibold">
            {lang === "bn" ? "সংশোধনের অডিট লগ" : "Manual Correction Audit Log"}
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-xs text-zinc-500 py-6 text-center">
              {lang === "bn" ? "কোনো ম্যানুয়াল পরিবর্তনের লগ নেই।" : "No manual edits logged yet."}
            </p>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {auditLogs
                .slice()
                .sort((a, b) => b.modifiedAt - a.modifiedAt)
                .map((log) => (
                  <div key={log.id} className="py-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {log.entityType} · {log.reason}
                      </span>
                      <span className="font-mono-tabular text-zinc-500">
                        {formatTimeDhaka(log.modifiedAt, lang, nf)}
                      </span>
                    </div>
                    <div className="text-zinc-500 font-mono-tabular">
                      {log.oldValue} → {log.newValue}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <ManualEntryModal
        open={modalOpen}
        defaultDate={selectedDate}
        shop={shop}
        prefs={prefs}
        sessions={sessions}
        reasons={reasons}
        editingSession={editingSession}
        onClose={() => {
          setModalOpen(false);
          setEditingSession(null);
        }}
        onSaved={onRefresh}
      />
    </div>
  );
};
