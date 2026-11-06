/** Reading lists of candidates (name and email) from a CSV file or pasted text, and checking them. Pure functions, so they are easy to test. */

export interface Candidate { name: string; email: string }
export interface Row { name: string; email: string }

export const isEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(s.trim());

/** Splits CSV text into rows of cells. Handles quoted cells (with commas, line breaks and doubled quotes inside) and comma, semicolon or tab separators. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const delim = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/**
 * Turns pasted text or a CSV file into candidates. A header row ("Name", "Email") is used if there is one; otherwise the cell that looks like
 * an email address is the email and the first other cell is the name. Rows with no email are reported, not silently dropped.
 */
export function candidatesFromText(text: string): { rows: Row[]; skipped: number } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], skipped: 0 };
  const head = table[0]!.map((h) => h.toLowerCase());
  const nameCol = head.findIndex((h) => /^(full\s*)?name$|^candidate/.test(h));
  const mailCol = head.findIndex((h) => /^e-?mail/.test(h));
  const hasHeader = nameCol >= 0 && mailCol >= 0;
  const out: Row[] = [];
  let skipped = 0;
  for (const cells of table.slice(hasHeader ? 1 : 0)) {
    let name: string, email: string;
    if (hasHeader) { name = cells[nameCol] ?? ''; email = cells[mailCol] ?? ''; }
    else {
      const m = cells.findIndex((c) => c.includes('@'));
      email = m >= 0 ? cells[m]! : '';
      name = cells.find((_, i) => i !== m && cells[i] !== '') ?? '';
    }
    if (!name && !email) continue;
    if (!email) { skipped++; continue; }
    out.push({ name, email });
  }
  return { rows: out, skipped };
}

/** What is wrong with a row, or an empty string when it is fine. Completely empty rows are ignored by the caller. */
export function rowProblem(r: Row): string {
  if (!r.name.trim()) return 'Add a name';
  if (!isEmail(r.email)) return 'Enter a valid email address';
  return '';
}

/** Removes empty rows and repeated emails (the first one wins), so the same person is not invited twice from one list. */
export function cleanRows(rows: Row[]): { valid: Candidate[]; duplicates: number } {
  const seen = new Set<string>(); const valid: Candidate[] = []; let duplicates = 0;
  for (const r of rows) {
    if (!r.name.trim() && !r.email.trim()) continue;
    if (rowProblem(r)) continue;
    const key = r.email.trim().toLowerCase();
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key); valid.push({ name: r.name.trim(), email: r.email.trim() });
  }
  return { valid, duplicates };
}

/** A starter file for hosts to fill in and upload. */
export const TEMPLATE_CSV = 'Name,Email\nAda Obi,ada@school.org\nBola Ade,bola@school.org\n';
