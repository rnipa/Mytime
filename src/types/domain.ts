export type LanguageCode = "bn" | "en";
export type NumberFormatMode = "bn" | "en";
export type ThemeMode = "dark" | "light";
export type TrackingSource = "MANUAL" | "GPS";
export type SessionStatus = "ACTIVE" | "COMPLETED" | "NEEDS_REVIEW";
export type OutsideCategoryType = "BUSINESS" | "PERSONAL" | "BREAK";
export type LocationEventType = "ENTER" | "EXIT";
export type LocationEventStatus = "PENDING_REVIEW" | "CONFIRMED" | "DISMISSED" | "AUTO_APPLIED";

export interface Shop {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadius: number; // meters, default 100
  createdAt: number;
}

export interface TimeSession {
  id: string;
  checkIn: number; // epoch ms
  checkOut: number | null; // epoch ms
  source: TrackingSource;
  status: SessionStatus;
  shopId: string;
  notes: string;
  confidence: number; // 0.0 to 1.0
  isOutsideActive?: boolean;
}

export interface OutsideReason {
  id: string;
  nameBn: string;
  nameEn: string;
  categoryType: OutsideCategoryType;
  countsAsBusinessTime: boolean;
  isCustom?: boolean;
}

export interface OutsidePeriod {
  id: string;
  sessionId: string | null;
  exitTime: number; // epoch ms
  returnTime: number | null; // epoch ms
  reasonId: string;
  notes: string;
  source: TrackingSource;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DailyGoal {
  id: string; // YYYY-MM-DD in Asia/Dhaka
  date: string;
  targetMinutes: number;
  preferredStart: string; // HH:mm
  preferredEnd: string; // HH:mm
  isRestDay: boolean;
}

export interface GoalSettings {
  id: string;
  dailyMinutes: number;
  weeklyMinutes: number;
  monthlyMinutes: number;
  preferredStart: string; // "09:00"
  preferredEnd: string; // "21:00"
  breakMinutes: number;
  weeklyRestDays: number[]; // 0=Sun .. 6=Sat (e.g. [5] for Friday)
  countLunchAsWork: boolean;
  countRestAsWork: boolean;
}

export interface IncomeRecord {
  id: string;
  month: string; // YYYY-MM in Asia/Dhaka
  revenue: number;
  expenses: number;
  costOfGoods: number;
  otherCosts: number;
  netProfit: number;
  isConfirmed: boolean;
  notes: string;
  updatedAt: number;
}

export interface DailyIncomeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  revenue: number;
  expenses: number;
  notes: string;
  createdAt: number;
}

export interface DailyJournal {
  id: string;
  date: string; // YYYY-MM-DD
  completedTasks: string;
  pendingTasks: string;
  importantTasks: string;
  businessProblems: string;
  personalObservations: string;
  tomorrowPlan: string;
  updatedAt: number;
}

export interface LocationEvent {
  id: string;
  timestamp: number;
  eventType: LocationEventType;
  latitude: number;
  longitude: number;
  accuracy: number;
  source: TrackingSource;
  status: LocationEventStatus;
  distanceMeters: number;
  note: string;
}

export interface AuditLog {
  id: string;
  entityType: "SESSION" | "OUTSIDE_PERIOD" | "GOAL" | "INCOME";
  entityId: string;
  oldValue: string;
  newValue: string;
  reason: string;
  modifiedAt: number;
}

export type NotificationType =
  | "SHOP_OPENING_REMINDER"
  | "DAILY_TARGET_PROGRESS"
  | "CHECKOUT_REMINDER"
  | "GPS_ARRIVAL"
  | "GPS_DEPARTURE"
  | "MISSING_SESSION_WARNING"
  | "DAILY_SUMMARY"
  | "WEEKLY_REPORT"
  | "GOAL_ACHIEVEMENT";

export interface NotificationSetting {
  type: NotificationType;
  enabled: boolean;
  scheduledTime: string; // HH:mm
}

export interface AppPreferences {
  id: string;
  language: LanguageCode;
  numberFormat: NumberFormatMode;
  theme: ThemeMode;
  currencySymbol: string;
  onboardingCompleted: boolean;
  shopSetupCompleted: boolean;
  locationPromptSeen: boolean;
  gpsEnabled: boolean;
  gpsPaused: boolean;
  gpsAutoConfirm: boolean;
  gpsConfirmationDelaySec: number;
  pinHash: string | null;
  lastHeartbeatAt: number | null;
}

export interface DayMetrics {
  date: string; // YYYY-MM-DD
  presenceMinutes: number;
  businessOutsideMinutes: number;
  personalOutsideMinutes: number;
  totalBusinessMinutes: number;
  targetMinutes: number;
  completionPct: number;
  goalAchieved: boolean;
  isRestDay: boolean;
  entryCount: number;
  exitCount: number;
  firstCheckIn: number | null;
  lastCheckOut: number | null;
  arrivalDelayMinutes: number | null;
  earlyDepartureMinutes: number | null;
  productivityScore: number | null;
}

export interface IncomeMetrics {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  isConfirmed: boolean;
  physicalHours: number;
  businessHours: number;
  revenuePerPhysicalHour: number;
  profitPerPhysicalHour: number;
  revenuePerBusinessHour: number;
  profitPerBusinessHour: number;
}

export interface LeakageInsight {
  id: string;
  type:
    | "LATE_ARRIVAL"
    | "EARLY_DEPARTURE"
    | "LONG_PERSONAL_BREAK"
    | "FREQUENT_EXITS"
    | "REPEATED_SHORT_TRIPS"
    | "EXCESSIVE_OUTSIDE"
    | "INCONSISTENT_ROUTINE"
    | "POSITIVE_PROGRESS";
  severity: "info" | "warning" | "positive";
  titleBn: string;
  titleEn: string;
  detailBn: string;
  detailEn: string;
  recommendationBn: string;
  recommendationEn: string;
}

export interface CoachAnalysis {
  observations: string[];
  suggestions: string[];
  weeklyChallenge: string;
  source: "LOCAL" | "GEMINI";
}
