// Download any list as Excel (.xlsx) or CSV, offline. Lists that come in
// pages are fetched in full (100 rows at a time), so the file always has every
// record that matches the filters on screen — not just the page you see.
//
//   const rows = await fetchAll('/suppliers', { q });
//   await downloadTable({ fileName: 'suppliers', columns, rows, format: 'xlsx' });
//
// columns: [{ en: 'Title (English, like the other spreadsheets)', value: (row, i) => any }]
// Numbers stay numbers in Excel, so totals and sums work there.
import { api } from './api';

export async function fetchAll(path, params = {}) {
  const rows = [];
  for (let page = 1; page <= 1000; page++) {
    const res = await api.get(path, { ...params, page, per_page: 100 });
    if (Array.isArray(res)) return res;
    rows.push(...(res?.data || []));
    const last = res?.meta?.last_page ?? res?.last_page;
    if (!last || page >= last) break;
  }
  return rows;
}

const pad = (n) => String(n).padStart(2, '0');
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A file name that is safe on Windows, Mac and Linux.
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80);

export async function downloadTable({ fileName, sheet, columns, rows, format = 'xlsx', dated = true }) {
  const XLSX = await import('xlsx');
  const header = columns.map((c) => c.en);
  const body = rows.map((r, i) => columns.map((c) => {
    const v = c.value(r, i);
    return v === null || v === undefined ? '' : v;
  }));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  // columns as wide as their longest value (up to a limit)
  ws['!cols'] = header.map((h, i) => ({
    wch: Math.min(48, Math.max(String(h).length, ...body.slice(0, 300).map((r) => String(r[i]).length)) + 2),
  }));
  const base = safeName(dated ? `${fileName}-${stamp()}` : fileName);
  if (format === 'csv') {
    // BOM so Excel opens UTF-8 (Urdu names) correctly
    save(new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' }), `${base}.csv`);
    return;
  }
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, body.length), c: Math.max(0, header.length - 1) } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeName(sheet || fileName).slice(0, 31) || 'Sheet1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  save(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${base}.xlsx`);
}

// Money and quantities as plain numbers for the spreadsheet.
export const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
};
