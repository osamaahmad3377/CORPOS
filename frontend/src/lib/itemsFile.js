// Reading and writing item lists as Excel (.xlsx / .xls) or CSV, offline.
// Column names from other POS systems are matched to ours automatically.
import * as XLSX from 'xlsx';

// Our fields, in file order. `labels` are the column headers we write; `match`
// are header words seen in other POS exports (lower-case, no punctuation).
export const FIELDS = [
  { key: 'name', required: true, match: ['name', 'item', 'item name', 'itemname', 'product', 'product name', 'productname', 'title', 'item title', 'article', 'dish', 'menu item'] },
  { key: 'category', match: ['category', 'categories', 'category name', 'group', 'item group', 'department', 'dept', 'section', 'family', 'type'] },
  { key: 'brand', match: ['brand', 'brand name', 'company', 'manufacturer', 'make', 'vendor'] },
  { key: 'unit', match: ['unit', 'units', 'uom', 'unit of measure', 'measure', 'sold by'] },
  { key: 'option1', match: ['size', 'variant', 'variation', 'option', 'option 1', 'option1', 'weight', 'pack size'] },
  { key: 'option2', match: ['color', 'colour', 'flavour', 'flavor', 'option 2', 'option2', 'style', 'model'] },
  { key: 'barcode', match: ['barcode', 'bar code', 'upc', 'ean', 'ean13', 'gtin', 'code', 'item code', 'product code', 'barcode number'] },
  { key: 'purchase_price', match: ['cost', 'cost price', 'costprice', 'purchase price', 'purchase', 'buying price', 'buy price', 'unit cost', 'purchase rate', 'cost rate'] },
  { key: 'selling_price', required: true, match: ['price', 'sale price', 'saleprice', 'selling price', 'sell price', 'retail price', 'retail', 'mrp', 'rate', 'sale rate', 'unit price', 'sales price', 'amount'] },
  { key: 'wholesale_price', match: ['wholesale', 'wholesale price', 'trade price', 'tp', 'dealer price'] },
  { key: 'stock_qty', match: ['stock', 'qty', 'quantity', 'on hand', 'onhand', 'in stock', 'current stock', 'opening stock', 'available', 'stock qty', 'balance'] },
  { key: 'low_stock_threshold', match: ['reorder', 'reorder level', 'reorder point', 'min stock', 'minimum stock', 'alert', 'low stock', 'alert qty', 'warn below'] },
  { key: 'description', match: ['description', 'details', 'notes', 'note', 'remarks'] },
];

const norm = (h) => String(h ?? '').toLowerCase().replace(/[_\-.:()#*]/g, ' ').replace(/\s+/g, ' ').trim();

export function fieldLabels(t, shop) {
  return {
    name: t('Item name'), category: t('Category'), brand: t('Brand'), unit: t('Unit'),
    option1: t(shop.option1), option2: t(shop.option2), barcode: t('Barcode'),
    purchase_price: t('Buying price'), selling_price: t('Selling price'), wholesale_price: t('Wholesale price'),
    stock_qty: t('Stock'), low_stock_threshold: t('Warn when below'), description: t('Description'),
  };
}

/** Best guess of which file column holds each of our fields. */
export function guessMapping(headers, shop) {
  const used = new Set();
  const map = {};
  const n = headers.map(norm);
  const take = (key, idx) => { if (idx >= 0 && map[key] == null) { map[key] = idx; used.add(idx); } };
  // 1. the shop's own words for its two options win: "Size" -> "Pack size"
  for (const [key, label] of [['option1', norm(shop.option1)], ['option2', norm(shop.option2)]]) {
    take(key, n.findIndex((h, i) => !used.has(i) && h && (h === label || label.split(' ').includes(h))));
  }
  for (const f of FIELDS) {
    if (map[f.key] != null) continue;
    take(f.key, n.findIndex((h, i) => !used.has(i) && f.match.includes(h))); // exact
    if (map[f.key] == null) take(f.key, n.findIndex((h, i) => !used.has(i) && h && f.match.some((w) => w.length > 3 && h.includes(w)))); // "Item Sale Price (Rs)"
  }
  return map;
}

/** File -> { headers, rows } (first sheet; first non-empty row is the header). */
export async function readItemsFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false, codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('This file has no sheet.');
  // raw:false keeps barcodes as written ("8964000123456", not 8.96E+12)
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false });
  const start = grid.findIndex((r) => r.some((c) => String(c).trim() !== ''));
  if (start < 0) throw new Error('This file is empty.');
  const headers = grid[start].map((h, i) => String(h).trim() || `Column ${i + 1}`);
  const rows = grid.slice(start + 1).filter((r) => r.some((c) => String(c).trim() !== ''));
  return { headers, rows, headerRow: start + 1, sheet: wb.SheetNames[0] };
}

export function rowsFromMapping(rows, mapping) {
  return rows.map((r) => Object.fromEntries(Object.entries(mapping).filter(([, i]) => i != null && i !== '').map(([k, i]) => [k, String(r[i] ?? '').trim()])));
}

/** Write rows (objects keyed by our fields) to .xlsx or .csv and download it. */
export function downloadItemsFile(rows, { format = 'xlsx', labels, fileName }) {
  const keys = FIELDS.map((f) => f.key).filter((k) => k !== 'description').concat(['description', 'active']);
  const head = keys.map((k) => labels[k] || k);
  const body = rows.map((r) => keys.map((k) => r[k] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  // barcodes and SKUs as text so Excel keeps every digit
  const bc = keys.indexOf('barcode');
  body.forEach((_, i) => { const ref = XLSX.utils.encode_cell({ r: i + 1, c: bc }); if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; } });
  ws['!cols'] = keys.map((k) => ({ wch: k === 'name' ? 32 : k === 'description' ? 40 : k === 'category' ? 24 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Items');
  XLSX.writeFile(wb, `${fileName}.${format}`, { bookType: format === 'csv' ? 'csv' : 'xlsx' });
}
