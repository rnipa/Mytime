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
  NotificationType,
  OutsidePeriod,
  OutsideReason,
  Shop,
  TimeSession,
  TrackingSource,
} from "../types/domain";
import { getDhakaDateParts } from "../utils/dhakaTime";

const DB_NAME = "ShopTimeMasterDB";
const DB_VERSION = 1;

export const STORE_NAMES = [
  "shops",
  "timeSessions",
  "outsidePeriods",
  "outsideReasons",
  "dailyGoals",
  "goalSettings",
  "incomeRecords",
  "dailyIncomeEntries",
  "dailyJournals",
  "locationEvents",
  "auditLogs",
  "notificationSettings",
  "preferences",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export interface FullDatabaseSnapshot {
  version: number;
  exportedAt: number;
  shops: Shop[];
  timeSessions: TimeSession[];
  outsidePeriods: OutsidePeriod[];
  outsideReasons: OutsideReason[];
  dailyGoals: DailyGoal[];
  goalSettings: GoalSettings[];
  incomeRecords: IncomeRecord[];
  dailyIncomeEntries: DailyIncomeEntry[];
  dailyJournals: DailyJournal[];
  locationEvents: LocationEvent[];
  auditLogs: AuditLog[];
  notificationSettings: NotificationSetting[];
  preferences: AppPreferences[];
}

export const DEFAULT_OUTSIDE_REASONS: OutsideReason[] = [
  { id: "lunch", nameBn: "খাবার", nameEn: "Lunch", categoryType: "BREAK", countsAsBusinessTime: false },
  { id: "home", nameBn: "বাসার কাজ", nameEn: "Home", categoryType: "PERSONAL", countsAsBusinessTime: false },
  { id: "personal", nameBn: "ব্যক্তিগত কাজ", nameEn: "Personal", categoryType: "PERSONAL", countsAsBusinessTime: false },
  { id: "business", nameBn: "ব্যবসায়িক কাজ", nameEn: "Business", categoryType: "BUSINESS", countsAsBusinessTime: true },
  { id: "stock", nameBn: "মালামাল সংগ্রহ", nameEn: "Stock Collection", categoryType: "BUSINESS", countsAsBusinessTime: true },
  { id: "banking", nameBn: "ব্যাংক", nameEn: "Banking", categoryType: "BUSINESS", countsAsBusinessTime: true },
  { id: "rest", nameBn: "বিশ্রাম", nameEn: "Rest", categoryType: "BREAK", countsAsBusinessTime: false },
  { id: "social", nameBn: "বন্ধু / আড্ডা", nameEn: "Social / Friends", categoryType: "PERSONAL", countsAsBusinessTime: false },
  { id: "emergency", nameBn: "জরুরি কাজ", nameEn: "Emergency", categoryType: "PERSONAL", countsAsBusinessTime: false },
  { id: "other", nameBn: "অন্যান্য", nameEn: "Other", categoryType: "PERSONAL", countsAsBusinessTime: false },
];

export const DEFAULT_GOAL_SETTINGS: GoalSettings = {
  id: "default_goal_settings",
  dailyMinutes: 600, // 10 hours
  weeklyMinutes: 3600, // 60 hours
  monthlyMinutes: 15600, // 260 hours
  preferredStart: "09:00",
  preferredEnd: "21:00",
  breakMinutes: 60,
  weeklyRestDays: [5], // Friday default in Bangladesh
  countLunchAsWork: false,
  countRestAsWork: false,
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  id: "default_prefs",
  language: "bn",
  numberFormat: "bn",
  theme: "dark",
  currencySymbol: "৳",
  onboardingCompleted: false,
  shopSetupCompleted: false,
  locationPromptSeen: false,
  gpsEnabled: false,
  gpsPaused: false,
  gpsAutoConfirm: false,
  gpsConfirmationDelaySec: 60,
  pinHash: null,
  lastHeartbeatAt: null,
};

export const DEFAULT_NOTIFICATIONS: NotificationSetting[] = [
  { type: "SHOP_OPENING_REMINDER", enabled: true, scheduledTime: "09:00" },
  { type: "DAILY_TARGET_PROGRESS", enabled: true, scheduledTime: "17:00" },
  { type: "CHECKOUT_REMINDER", enabled: true, scheduledTime: "21:30" },
  { type: "GPS_ARRIVAL", enabled: true, scheduledTime: "00:00" },
  { type: "GPS_DEPARTURE", enabled: true, scheduledTime: "00:00" },
  { type: "MISSING_SESSION_WARNING", enabled: true, scheduledTime: "22:00" },
  { type: "DAILY_SUMMARY", enabled: true, scheduledTime: "22:15" },
  { type: "WEEKLY_REPORT", enabled: true, scheduledTime: "20:00" },
  { type: "GOAL_ACHIEVEMENT", enabled: true, scheduledTime: "00:00" },
];

export function uid(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("shops")) db.createObjectStore("shops", { keyPath: "id" });
      if (!db.objectStoreNames.contains("timeSessions")) {
        const store = db.createObjectStore("timeSessions", { keyPath: "id" });
        store.createIndex("by_checkIn", "checkIn", { unique: false });
        store.createIndex("by_status", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("outsidePeriods")) {
        const store = db.createObjectStore("outsidePeriods", { keyPath: "id" });
        store.createIndex("by_exitTime", "exitTime", { unique: false });
      }
      if (!db.objectStoreNames.contains("outsideReasons")) db.createObjectStore("outsideReasons", { keyPath: "id" });
      if (!db.objectStoreNames.contains("dailyGoals")) db.createObjectStore("dailyGoals", { keyPath: "id" });
      if (!db.objectStoreNames.contains("goalSettings")) db.createObjectStore("goalSettings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("incomeRecords")) db.createObjectStore("incomeRecords", { keyPath: "id" });
      if (!db.objectStoreNames.contains("dailyIncomeEntries")) db.createObjectStore("dailyIncomeEntries", { keyPath: "id" });
      if (!db.objectStoreNames.contains("dailyJournals")) db.createObjectStore("dailyJournals", { keyPath: "id" });
      if (!db.objectStoreNames.contains("locationEvents")) db.createObjectStore("locationEvents", { keyPath: "id" });
      if (!db.objectStoreNames.contains("auditLogs")) db.createObjectStore("auditLogs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("notificationSettings")) {
        db.createObjectStore("notificationSettings", { keyPath: "type" });
      }
      if (!db.objectStoreNames.contains("preferences")) db.createObjectStore("preferences", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function putItem<T>(storeName: StoreName, item: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteItem(storeName: StoreName, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllStores(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...STORE_NAMES], "readwrite");
    for (const s of STORE_NAMES) {
      tx.objectStore(s).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function ensureSeededDefaults(): Promise<void> {
  const reasons = await getAll<OutsideReason>("outsideReasons");
  if (reasons.length === 0) {
    for (const r of DEFAULT_OUTSIDE_REASONS) {
      await putItem("outsideReasons", r);
    }
  }
  const goals = await getAll<GoalSettings>("goalSettings");
  if (goals.length === 0) {
    await putItem("goalSettings", DEFAULT_GOAL_SETTINGS);
  }
  const prefs = await getAll<AppPreferences>("preferences");
  if (prefs.length === 0) {
    await putItem("preferences", DEFAULT_PREFERENCES);
  }
  const notifs = await getAll<NotificationSetting>("notificationSettings");
  if (notifs.length === 0) {
    for (const n of DEFAULT_NOTIFICATIONS) {
      await putItem("notificationSettings", n);
    }
  }
}

export function hasSessionOverlap(
  sessions: TimeSession[],
  startMs: number,
  endMs: number | null,
  ignoreSessionId?: string
): boolean {
  const effectiveEnd = endMs ?? Number.MAX_SAFE_INTEGER;
  for (const s of sessions) {
    if (s.id === ignoreSessionId) continue;
    const sEnd = s.checkOut ?? Number.MAX_SAFE_INTEGER;
    if (startMs < sEnd && s.checkIn < effectiveEnd) {
      return true;
    }
  }
  return false;
}

export async function snapshotTodayGoalIfNeeded(
  dateStr: string,
  settings: GoalSettings
): Promise<void> {
  const all = await getAll<DailyGoal>("dailyGoals");
  const existing = all.find((g) => g.date === dateStr);
  if (!existing) {
    const { dayOfWeek } = getDhakaDateParts(Date.now());
    const snap: DailyGoal = {
      id: dateStr,
      date: dateStr,
      targetMinutes: settings.dailyMinutes,
      preferredStart: settings.preferredStart,
      preferredEnd: settings.preferredEnd,
      isRestDay: settings.weeklyRestDays.includes(dayOfWeek),
    };
    await putItem("dailyGoals", snap);
  }
}

export async function performCheckIn(params: {
  shopId: string;
  source: TrackingSource;
  notes?: string;
  confidence?: number;
  timestampMs?: number;
}): Promise<TimeSession> {
  const now = params.timestampMs ?? Date.now();
  const sessions = await getAll<TimeSession>("timeSessions");
  const active = sessions.find((s) => s.status === "ACTIVE" || s.checkOut === null);
  if (active) {
    throw new Error("ACTIVE_SESSION_EXISTS");
  }
  if (hasSessionOverlap(sessions, now, null)) {
    throw new Error("OVERLAPPING_SESSION");
  }

  // Close any open outside period automatically on check-in
  const outsides = await getAll<OutsidePeriod>("outsidePeriods");
  const openOutside = outsides.find((o) => o.returnTime === null);
  if (openOutside && now > openOutside.exitTime) {
    await putItem<OutsidePeriod>("outsidePeriods", {
      ...openOutside,
      returnTime: now,
    });
  }

  const newSession: TimeSession = {
    id: uid("sess"),
    checkIn: now,
    checkOut: null,
    source: params.source,
    status: "ACTIVE",
    shopId: params.shopId,
    notes: params.notes ?? "",
    confidence: params.confidence ?? (params.source === "MANUAL" ? 1 : 0.85),
  };
  await putItem("timeSessions", newSession);

  const settingsList = await getAll<GoalSettings>("goalSettings");
  const settings = settingsList[0] ?? DEFAULT_GOAL_SETTINGS;
  const { dateStr } = getDhakaDateParts(now);
  await snapshotTodayGoalIfNeeded(dateStr, settings);

  return newSession;
}

export async function performCheckOut(params: {
  sessionId: string;
  source: TrackingSource;
  reasonId: string;
  notes?: string;
  timestampMs?: number;
  latitude?: number | null;
  longitude?: number | null;
  startOutsidePeriod?: boolean;
}): Promise<{ closedSession: TimeSession; outsidePeriod: OutsidePeriod | null }> {
  const now = params.timestampMs ?? Date.now();
  const sessions = await getAll<TimeSession>("timeSessions");
  const target = sessions.find((s) => s.id === params.sessionId);
  if (!target) {
    throw new Error("SESSION_NOT_FOUND");
  }
  if (now <= target.checkIn) {
    throw new Error("INVALID_CHECKOUT_TIME");
  }

  const closedSession: TimeSession = {
    ...target,
    checkOut: now,
    status: "COMPLETED",
    notes: params.notes ? (target.notes ? `${target.notes} | ${params.notes}` : params.notes) : target.notes,
  };
  await putItem("timeSessions", closedSession);

  let outsidePeriod: OutsidePeriod | null = null;
  if (params.startOutsidePeriod !== false) {
    outsidePeriod = {
      id: uid("out"),
      sessionId: target.id,
      exitTime: now,
      returnTime: null,
      reasonId: params.reasonId,
      notes: params.notes ?? "",
      source: params.source,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
    };
    await putItem("outsidePeriods", outsidePeriod);
  }

  return { closedSession, outsidePeriod };
}

export async function logAudit(entry: Omit<AuditLog, "id" | "modifiedAt">): Promise<void> {
  const item: AuditLog = {
    ...entry,
    id: uid("audit"),
    modifiedAt: Date.now(),
  };
  await putItem("auditLogs", item);
}

export async function exportDatabaseSnapshot(): Promise<FullDatabaseSnapshot> {
  return {
    version: 1,
    exportedAt: Date.now(),
    shops: await getAll<Shop>("shops"),
    timeSessions: await getAll<TimeSession>("timeSessions"),
    outsidePeriods: await getAll<OutsidePeriod>("outsidePeriods"),
    outsideReasons: await getAll<OutsideReason>("outsideReasons"),
    dailyGoals: await getAll<DailyGoal>("dailyGoals"),
    goalSettings: await getAll<GoalSettings>("goalSettings"),
    incomeRecords: await getAll<IncomeRecord>("incomeRecords"),
    dailyIncomeEntries: await getAll<DailyIncomeEntry>("dailyIncomeEntries"),
    dailyJournals: await getAll<DailyJournal>("dailyJournals"),
    locationEvents: await getAll<LocationEvent>("locationEvents"),
    auditLogs: await getAll<AuditLog>("auditLogs"),
    notificationSettings: await getAll<NotificationSetting>("notificationSettings"),
    preferences: await getAll<AppPreferences>("preferences"),
  };
}

export async function restoreDatabaseSnapshot(snap: FullDatabaseSnapshot): Promise<void> {
  if (!snap || typeof snap !== "object" || !Array.isArray(snap.timeSessions)) {
    throw new Error("Invalid backup file format");
  }
  await clearAllStores();
  for (const x of snap.shops ?? []) await putItem("shops", x);
  for (const x of snap.timeSessions ?? []) await putItem("timeSessions", x);
  for (const x of snap.outsidePeriods ?? []) await putItem("outsidePeriods", x);
  for (const x of snap.outsideReasons ?? []) await putItem("outsideReasons", x);
  for (const x of snap.dailyGoals ?? []) await putItem("dailyGoals", x);
  for (const x of snap.goalSettings ?? []) await putItem("goalSettings", x);
  for (const x of snap.incomeRecords ?? []) await putItem("incomeRecords", x);
  for (const x of snap.dailyIncomeEntries ?? []) await putItem("dailyIncomeEntries", x);
  for (const x of snap.dailyJournals ?? []) await putItem("dailyJournals", x);
  for (const x of snap.locationEvents ?? []) await putItem("locationEvents", x);
  for (const x of snap.auditLogs ?? []) await putItem("auditLogs", x);
  for (const x of snap.notificationSettings ?? []) await putItem("notificationSettings", x);
  for (const x of snap.preferences ?? []) await putItem("preferences", x);
  await ensureSeededDefaults();
}

export type NotificationTypeAlias = NotificationType;
