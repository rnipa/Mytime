import React from "react";
import { LanguageCode, NumberFormatMode, OutsidePeriod, OutsideReason, TimeSession } from "../types/domain";
import {
  formatCurrencyBDT,
  formatNumber,
  formatTimeDhaka,
  getDhakaDateParts,
} from "../utils/dhakaTime";

export interface BarDatum {
  label: string;
  presenceHours: number;
  businessOutsideHours: number;
  targetHours: number;
}

export const DailyHoursBarChart: React.FC<{
  data: BarDatum[];
  lang: LanguageCode;
  numberFormat: NumberFormatMode;
}> = ({ data, lang, numberFormat }) => {
  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {lang === "bn" ? "কোনো দৈনিক চার্ট ডেটা নেই" : "No daily chart data yet"}
      </div>
    );
  }
  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.presenceHours + d.businessOutsideHours, d.targetHours))
  );
  const w = 560;
  const h = 210;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const barStep = plotW / data.length;
  const barW = Math.min(28, Math.max(8, barStep * 0.56));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[360px] h-52">
        {[0, 0.5, 1].map((frac) => {
          const y = padT + plotH * (1 - frac);
          const val = maxVal * frac;
          return (
            <g key={frac}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-zinc-200 dark:text-zinc-800"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-zinc-500 dark:fill-zinc-400 text-[10px] font-mono-tabular"
              >
                {formatNumber(Number(val.toFixed(1)), numberFormat, val % 1 === 0 ? 0 : 1)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = padL + i * barStep + (barStep - barW) / 2;
          const pH = (d.presenceHours / maxVal) * plotH;
          const bH = (d.businessOutsideHours / maxVal) * plotH;
          const tY = padT + plotH - (d.targetHours / maxVal) * plotH;
          return (
            <g key={d.label + i}>
              <rect
                x={x}
                y={padT + plotH - pH}
                width={barW}
                height={Math.max(0, pH)}
                rx={4}
                className="fill-emerald-500"
              />
              {bH > 0 && (
                <rect
                  x={x}
                  y={padT + plotH - pH - bH}
                  width={barW}
                  height={Math.max(0, bH)}
                  rx={3}
                  className="fill-emerald-300 dark:fill-emerald-700"
                />
              )}
              {d.targetHours > 0 && (
                <line
                  x1={x - 3}
                  x2={x + barW + 3}
                  y1={tY}
                  y2={tY}
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="text-amber-500"
                />
              )}
              <text
                x={x + barW / 2}
                y={h - 10}
                textAnchor="middle"
                className="fill-zinc-600 dark:fill-zinc-400 text-[10px]"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const TrendLineChart: React.FC<{
  points: Array<{ label: string; value: number }>;
  unitSuffix?: string;
  numberFormat: NumberFormatMode;
}> = ({ points, unitSuffix = "", numberFormat }) => {
  if (points.length === 0) {
    return <div className="py-10 text-center text-sm text-zinc-500">—</div>;
  }
  const maxVal = Math.max(1, ...points.map((p) => p.value));
  const w = 540;
  const h = 180;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW;
    const y = padT + plotH - (p.value / maxVal) * plotH;
    return { ...p, x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${padT + plotH} L ${coords[0].x} ${padT + plotH} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
      <defs>
        <linearGradient id="stmTrendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((frac) => {
        const y = padT + plotH * (1 - frac);
        return (
          <g key={frac}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-zinc-200 dark:text-zinc-800"
              strokeDasharray="3 3"
            />
            <text
              x={padL - 6}
              y={y + 4}
              textAnchor="end"
              className="fill-zinc-500 text-[10px] font-mono-tabular"
            >
              {formatNumber(Math.round(maxVal * frac), numberFormat)}
              {unitSuffix}
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill="url(#stmTrendGrad)" />
      <path d={linePath} fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinejoin="round" />
      {coords.map((c, idx) => (
        <g key={idx}>
          <circle cx={c.x} cy={c.y} r={3.5} className="fill-emerald-400 stroke-[#090D0B]" strokeWidth={1.5} />
          <text x={c.x} y={h - 8} textAnchor="middle" className="fill-zinc-500 text-[10px]">
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

export const RevenueProfitChart: React.FC<{
  data: Array<{ label: string; revenue: number; netProfit: number }>;
  numberFormat: NumberFormatMode;
  lang: LanguageCode;
}> = ({ data, numberFormat, lang }) => {
  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        {lang === "bn" ? "কোনো মাসিক আয়-লাভের তথ্য নেই" : "No monthly revenue/profit entries yet"}
      </div>
    );
  }
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.revenue, Math.max(0, d.netProfit)]));
  return (
    <div className="space-y-3">
      {data.map((row) => (
        <div key={row.label} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{row.label}</span>
            <span className="font-mono-tabular text-zinc-500 dark:text-zinc-400">
              {formatCurrencyBDT(row.revenue, numberFormat)} / {formatCurrencyBDT(row.netProfit, numberFormat)}
            </span>
          </div>
          <div className="space-y-1">
            <div className="h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-zinc-400 dark:bg-zinc-500 rounded"
                style={{ width: `${Math.min(100, (row.revenue / maxVal) * 100)}%` }}
              />
            </div>
            <div className="h-2 w-full rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded"
                style={{ width: `${Math.min(100, (Math.max(0, row.netProfit) / maxVal) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const OutsideReasonPieChart: React.FC<{
  slices: Array<{ label: string; minutes: number; isBusiness: boolean }>;
  lang: LanguageCode;
  numberFormat: NumberFormatMode;
}> = ({ slices, lang, numberFormat }) => {
  const total = slices.reduce((s, x) => s + x.minutes, 0);
  if (total <= 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        {lang === "bn" ? "বাইরে অবস্থানের কোনো রেকর্ড নেই" : "No outside periods recorded"}
      </div>
    );
  }

  const palette = ["#10B981", "#34D399", "#F59E0B", "#FB7185", "#60A5FA", "#A78BFA"];
  const r = 46;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0 -rotate-90">
        <circle cx={60} cy={60} r={r} fill="none" stroke="currentColor" strokeWidth={16} className="text-zinc-200 dark:text-zinc-800" />
        {slices.map((s, idx) => {
          const frac = s.minutes / total;
          const dash = frac * circ;
          const offset = -cumulative * circ;
          cumulative += frac;
          return (
            <circle
              key={s.label + idx}
              cx={60}
              cy={60}
              r={r}
              fill="none"
              stroke={palette[idx % palette.length]}
              strokeWidth={16}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      <div className="flex-1 w-full space-y-2">
        {slices.map((s, idx) => {
          const pct = Math.round((s.minutes / total) * 100);
          return (
            <div key={s.label + idx} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: palette[idx % palette.length] }}
                />
                <span className="truncate text-zinc-700 dark:text-zinc-300">{s.label}</span>
              </div>
              <span className="font-mono-tabular text-zinc-500 dark:text-zinc-400 shrink-0 ml-2">
                {formatNumber(Math.round(s.minutes), numberFormat)} {lang === "bn" ? "মি." : "m"} ({formatNumber(pct, numberFormat)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const DailyTimelineBar: React.FC<{
  dateStr: string;
  sessions: TimeSession[];
  outsidePeriods: OutsidePeriod[];
  reasons: OutsideReason[];
  lang: LanguageCode;
  numberFormat: NumberFormatMode;
}> = ({ dateStr, sessions, outsidePeriods, reasons, lang, numberFormat }) => {
  const reasonMap = new Map(reasons.map((r) => [r.id, r]));
  const items: Array<{
    id: string;
    startMs: number;
    endMs: number;
    kind: "SHOP" | "BUSINESS_OUT" | "PERSONAL_OUT";
    label: string;
  }> = [];

  for (const s of sessions) {
    if (getDhakaDateParts(s.checkIn).dateStr === dateStr) {
      items.push({
        id: s.id,
        startMs: s.checkIn,
        endMs: s.checkOut ?? Date.now(),
        kind: "SHOP",
        label: lang === "bn" ? "দোকানে উপস্থিত" : "In Shop",
      });
    }
  }
  for (const o of outsidePeriods) {
    if (getDhakaDateParts(o.exitTime).dateStr === dateStr && o.returnTime) {
      const r = reasonMap.get(o.reasonId);
      const isBus = r?.categoryType === "BUSINESS" || r?.countsAsBusinessTime;
      items.push({
        id: o.id,
        startMs: o.exitTime,
        endMs: o.returnTime,
        kind: isBus ? "BUSINESS_OUT" : "PERSONAL_OUT",
        label: lang === "bn" ? r?.nameBn ?? o.reasonId : r?.nameEn ?? o.reasonId,
      });
    }
  }
  items.sort((a, b) => a.startMs - b.startMs);

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        {lang === "bn" ? "এই দিনের কোনো টাইমলাইন রেকর্ড নেই" : "No timeline blocks for this date"}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const mins = Math.max(1, Math.round((item.endMs - item.startMs) / 60000));
        const dotColor =
          item.kind === "SHOP"
            ? "bg-emerald-500"
            : item.kind === "BUSINESS_OUT"
              ? "bg-sky-400"
              : "bg-amber-400";
        return (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 py-2.5 border-b border-zinc-200/70 dark:border-zinc-800/80 last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${dotColor}`} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {item.label}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono-tabular">
                  {formatTimeDhaka(item.startMs, lang, numberFormat)} —{" "}
                  {formatTimeDhaka(item.endMs, lang, numberFormat)}
                </div>
              </div>
            </div>
            <div className="text-xs font-mono-tabular font-semibold text-zinc-700 dark:text-zinc-300 shrink-0">
              {formatNumber(mins, numberFormat)} {lang === "bn" ? "মি." : "m"}
            </div>
          </div>
        );
      })}
    </div>
  );
};
