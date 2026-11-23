import { LanguageCode, NumberFormatMode } from "../types/domain";

export const DHAKA_TIMEZONE = "Asia/Dhaka";

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBengaliDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d);
}

export function formatNumber(
  value: number,
  numberFormat: NumberFormatMode,
  fractionDigits = 0
): string {
  const fixed = fractionDigits > 0 ? value.toFixed(fractionDigits) : Math.round(value).toString();
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = decPart !== undefined ? `${grouped}.${decPart}` : grouped;
  return numberFormat === "bn" ? toBengaliDigits(formatted) : formatted;
}

export function formatCurrencyBDT(
  amount: number,
  numberFormat: NumberFormatMode,
  fractionDigits = 0
): string {
  const sign = amount < 0 ? "-" : "";
  const absFormatted = formatNumber(Math.abs(amount), numberFormat, fractionDigits);
  return `${sign}৳${absFormatted}`;
}

export function getDhakaDateParts(timestampMs: number = Date.now()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sun..6=Sat
  dateStr: string; // YYYY-MM-DD
  monthStr: string; // YYYY-MM
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(new Date(timestampMs));
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour === "24" ? "0" : map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[map.weekday] ?? 0;

  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
  const monthStr = `${year}-${pad(month)}`;

  return { year, month, day, hour, minute, second, dayOfWeek, dateStr, monthStr };
}

export function dhakaDateTimeToEpoch(dateStr: string, timeStr: string): number {
  // Asia/Dhaka is permanently UTC+06:00 (no DST)
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh - 6, mm, 0, 0);
}

export function dhakaDateBounds(dateStr: string): { startMs: number; endMs: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, d, -6, 0, 0, 0);
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

export function addDaysToDhakaDate(dateStr: string, deltaDays: number): string {
  const { startMs } = dhakaDateBounds(dateStr);
  const shifted = startMs + deltaDays * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000;
  return getDhakaDateParts(shifted).dateStr;
}

/**
 * Splits an interval [startMs, endMs] cleanly across Asia/Dhaka midnight boundaries.
 */
export function splitIntervalByDhakaDate(
  startMs: number,
  endMs: number
): Array<{ date: string; startMs: number; endMs: number; minutes: number }> {
  if (endMs <= startMs) return [];
  const segments: Array<{ date: string; startMs: number; endMs: number; minutes: number }> = [];
  let cursor = startMs;
  let guard = 0;
  while (cursor < endMs && guard < 400) {
    guard++;
    const { dateStr } = getDhakaDateParts(cursor);
    const { endMs: dayEndMs } = dhakaDateBounds(dateStr);
    const segEnd = Math.min(endMs, dayEndMs);
    const minutes = Math.max(0, (segEnd - cursor) / 60000);
    segments.push({ date: dateStr, startMs: cursor, endMs: segEnd, minutes });
    cursor = segEnd;
  }
  return segments;
}

export function formatTimeDhaka(
  timestampMs: number,
  lang: LanguageCode,
  numberFormat: NumberFormatMode
): string {
  const d = new Date(timestampMs);
  const formatted = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-US", {
    timeZone: DHAKA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return numberFormat === "bn" ? toBengaliDigits(formatted) : formatted;
}

export function formatDateDhaka(
  dateStr: string,
  lang: LanguageCode,
  numberFormat: NumberFormatMode
): string {
  const { startMs } = dhakaDateBounds(dateStr);
  const formatted = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-US", {
    timeZone: DHAKA_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(startMs + 6 * 3600 * 1000));
  return numberFormat === "bn" ? toBengaliDigits(formatted) : formatted;
}

export function formatClockWithSeconds(
  timestampMs: number,
  lang: LanguageCode,
  numberFormat: NumberFormatMode
): string {
  const formatted = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-US", {
    timeZone: DHAKA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(timestampMs));
  return numberFormat === "bn" ? toBengaliDigits(formatted) : formatted;
}

export function formatElapsedTimer(ms: number, numberFormat: NumberFormatMode): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const str = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  return numberFormat === "bn" ? toBengaliDigits(str) : str;
}

export function formatDurationCompact(
  totalMinutes: number,
  lang: LanguageCode,
  numberFormat: NumberFormatMode
): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hrs = Math.floor(rounded / 60);
  const mins = rounded % 60;
  const hStr = formatNumber(hrs, numberFormat);
  const mStr = formatNumber(mins, numberFormat);
  if (lang === "bn") {
    if (hrs === 0) return `${mStr} মি.`;
    if (mins === 0) return `${hStr} ঘণ্টা`;
    return `${hStr} ঘ. ${mStr} মি.`;
  }
  if (hrs === 0) return `${mStr}m`;
  if (mins === 0) return `${hStr}h`;
  return `${hStr}h ${mStr}m`;
}

export function getGreeting(lang: LanguageCode, timestampMs: number = Date.now()): string {
  const { hour } = getDhakaDateParts(timestampMs);
  if (lang === "bn") {
    if (hour >= 5 && hour < 12) return "শুভ সকাল";
    if (hour >= 12 && hour < 16) return "শুভ দুপুর";
    if (hour >= 16 && hour < 19) return "শুভ বিকাল";
    return "শুভ সন্ধ্যা";
  }
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  if (hour >= 17 && hour < 21) return "Good Evening";
  return "Good Night";
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder().encode(`stm_pin_v1_${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
