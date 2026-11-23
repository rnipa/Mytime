import {
  DayMetrics,
  IncomeMetrics,
  LanguageCode,
  NumberFormatMode,
  OutsidePeriod,
  OutsideReason,
  Shop,
  TimeSession,
} from "../types/domain";
import {
  formatCurrencyBDT,
  formatDateDhaka,
  formatDurationCompact,
  formatNumber,
  formatTimeDhaka,
} from "../utils/dhakaTime";

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateCsvContent(params: {
  days: DayMetrics[];
  incomeMetrics: IncomeMetrics;
  lang: LanguageCode;
  excelBom: boolean;
}): string {
  const headers =
    params.lang === "bn"
      ? [
          "তারিখ (Asia/Dhaka)",
          "দোকানে উপস্থিতি (মিনিট)",
          "ব্যবসায়িক বাইরে (মিনিট)",
          "ব্যক্তিগত বাইরে (মিনিট)",
          "মোট ব্যবসায়িক সময় (মিনিট)",
          "লক্ষ্য (মিনিট)",
          "লক্ষ্য পূরণ (%)",
          "উৎপাদনশীলতা স্কোর",
        ]
      : [
          "Date (Asia/Dhaka)",
          "Shop Presence (min)",
          "Business Outside (min)",
          "Personal Outside (min)",
          "Total Business Time (min)",
          "Target (min)",
          "Completion (%)",
          "Productivity Score",
        ];

  const rows = params.days.map((d) => [
    d.date,
    Math.round(d.presenceMinutes),
    Math.round(d.businessOutsideMinutes),
    Math.round(d.personalOutsideMinutes),
    Math.round(d.totalBusinessMinutes),
    Math.round(d.targetMinutes),
    d.completionPct,
    d.productivityScore ?? "",
  ]);

  const summaryRows = [
    [],
    [params.lang === "bn" ? "আর্থিক সারসংক্ষেপ (BDT)" : "Financial Summary (BDT)"],
    [params.lang === "bn" ? "মোট বিক্রয় / আয়" : "Total Revenue", params.incomeMetrics.totalRevenue],
    [params.lang === "bn" ? "মোট নিট লাভ" : "Net Profit", params.incomeMetrics.netProfit],
    [
      params.lang === "bn" ? "দোকানে প্রতি ঘণ্টা আয়" : "Revenue / Physical Hour",
      params.incomeMetrics.revenuePerPhysicalHour.toFixed(2),
    ],
    [
      params.lang === "bn" ? "দোকানে প্রতি ঘণ্টা লাভ" : "Profit / Physical Hour",
      params.incomeMetrics.profitPerPhysicalHour.toFixed(2),
    ],
    [
      params.lang === "bn" ? "ব্যবসায়িক প্রতি ঘণ্টা আয়" : "Revenue / Business Hour",
      params.incomeMetrics.revenuePerBusinessHour.toFixed(2),
    ],
    [
      params.lang === "bn" ? "ব্যবসায়িক প্রতি ঘণ্টা লাভ" : "Profit / Business Hour",
      params.incomeMetrics.profitPerBusinessHour.toFixed(2),
    ],
  ];

  const csvBody = [headers, ...rows, ...summaryRows]
    .map((r) => r.map(escapeCsvCell).join(","))
    .join("\r\n");

  return params.excelBom ? `\uFEFF${csvBody}` : csvBody;
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generatePrintableBengaliReportHtml(params: {
  shop: Shop | null;
  title: string;
  rangeLabel: string;
  days: DayMetrics[];
  sessions: TimeSession[];
  outsidePeriods: OutsidePeriod[];
  reasons: OutsideReason[];
  incomeMetrics: IncomeMetrics;
  lang: LanguageCode;
  numberFormat: NumberFormatMode;
}): string {
  const totalPresence = params.days.reduce((s, d) => s + d.presenceMinutes, 0);
  const totalBusOut = params.days.reduce((s, d) => s + d.businessOutsideMinutes, 0);
  const totalPerOut = params.days.reduce((s, d) => s + d.personalOutsideMinutes, 0);
  const totalTarget = params.days.reduce((s, d) => s + (d.isRestDay ? 0 : d.targetMinutes), 0);
  const overallPct = totalTarget > 0 ? Math.round(((totalPresence + totalBusOut) / totalTarget) * 100) : 0;

  const dayRowsHtml = params.days
    .map(
      (d) => `
      <tr>
        <td>${formatDateDhaka(d.date, params.lang, params.numberFormat)}</td>
        <td>${formatDurationCompact(d.presenceMinutes, params.lang, params.numberFormat)}</td>
        <td>${formatDurationCompact(d.businessOutsideMinutes, params.lang, params.numberFormat)}</td>
        <td>${formatDurationCompact(d.personalOutsideMinutes, params.lang, params.numberFormat)}</td>
        <td>${formatNumber(d.completionPct, params.numberFormat)}%</td>
      </tr>`
    )
    .join("");

  const reasonMap = new Map(params.reasons.map((r) => [r.id, r]));
  const outsideSummary = params.outsidePeriods
    .slice(0, 20)
    .map((o) => {
      const r = reasonMap.get(o.reasonId);
      const rName = params.lang === "bn" ? r?.nameBn ?? o.reasonId : r?.nameEn ?? o.reasonId;
      const dur = o.returnTime ? Math.round((o.returnTime - o.exitTime) / 60000) : 0;
      return `<li>${formatTimeDhaka(o.exitTime, params.lang, params.numberFormat)} — ${rName} (${formatDurationCompact(dur, params.lang, params.numberFormat)})</li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${params.lang}">
<head>
  <meta charset="UTF-8" />
  <title>${params.title} — SHOP TIME MASTER</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'Noto Sans Bengali', sans-serif; padding: 32px; color: #111827; max-width: 900px; margin: 0 auto; }
    h1 { margin: 0 0 4px; font-size: 22px; color: #065f46; }
    .meta { font-size: 13px; color: #4b5563; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
    .box-label { font-size: 12px; color: #6b7280; }
    .box-val { font-size: 18px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1>SHOP TIME MASTER — ${params.title}</h1>
  <div class="meta">${params.shop?.name ?? ""} · ${params.rangeLabel} · Asia/Dhaka</div>
  <div class="grid">
    <div class="box"><div class="box-label">${params.lang === "bn" ? "মোট দোকানে উপস্থিতি" : "Shop Presence"}</div><div class="box-val">${formatDurationCompact(totalPresence, params.lang, params.numberFormat)}</div></div>
    <div class="box"><div class="box-label">${params.lang === "bn" ? "ব্যবসায়িক বাইরে" : "Business Outside"}</div><div class="box-val">${formatDurationCompact(totalBusOut, params.lang, params.numberFormat)}</div></div>
    <div class="box"><div class="box-label">${params.lang === "bn" ? "ব্যক্তিগত বাইরে" : "Personal Outside"}</div><div class="box-val">${formatDurationCompact(totalPerOut, params.lang, params.numberFormat)}</div></div>
    <div class="box"><div class="box-label">${params.lang === "bn" ? "লক্ষ্য পূরণ" : "Goal Completion"}</div><div class="box-val">${formatNumber(overallPct, params.numberFormat)}%</div></div>
  </div>
  <div class="grid">
    <div class="box"><div class="box-label">${params.lang === "bn" ? "মোট আয়" : "Total Revenue"}</div><div class="box-val">${formatCurrencyBDT(params.incomeMetrics.totalRevenue, params.numberFormat)}</div></div>
    <div class="box"><div class="box-label">${params.lang === "bn" ? "নিট লাভ" : "Net Profit"}</div><div class="box-val">${formatCurrencyBDT(params.incomeMetrics.netProfit, params.numberFormat)}</div></div>
    <div class="box"><div class="box-label">${params.lang === "bn" ? "ঘণ্টাপ্রতি আয়" : "Revenue / Hr"}</div><div class="box-val">${formatCurrencyBDT(params.incomeMetrics.revenuePerBusinessHour, params.numberFormat)}</div></div>
    <div class="box"><div class="box-label">${params.lang === "bn" ? "ঘণ্টাপ্রতি লাভ" : "Profit / Hr"}</div><div class="box-val">${formatCurrencyBDT(params.incomeMetrics.profitPerBusinessHour, params.numberFormat)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${params.lang === "bn" ? "তারিখ" : "Date"}</th>
        <th>${params.lang === "bn" ? "দোকানে উপস্থিতি" : "Presence"}</th>
        <th>${params.lang === "bn" ? "ব্যবসায়িক বাইরে" : "Business Outside"}</th>
        <th>${params.lang === "bn" ? "ব্যক্তিগত বাইরে" : "Personal Outside"}</th>
        <th>${params.lang === "bn" ? "লক্ষ্য (%)" : "Target (%)"}</th>
      </tr>
    </thead>
    <tbody>${dayRowsHtml}</tbody>
  </table>
  ${outsideSummary ? `<h3 style="margin-top:24px;font-size:15px;">${params.lang === "bn" ? "সাম্প্রতিক বাইরে থাকার বিবরণ" : "Recent Outside Periods"}</h3><ul>${outsideSummary}</ul>` : ""}
</body>
</html>`;
}
