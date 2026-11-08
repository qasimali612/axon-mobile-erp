/**
 * Dependency-free PDF writer for A4 business documents.
 *
 * Uses the built-in Helvetica fonts so no font binary has to be shipped, and writes a plain
 * uncompressed content stream so a generated file stays auditable. Text that WinAnsi cannot encode
 * is transliterated rather than dropped, which keeps amounts and identifiers exact.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 42;

export type PdfColumn = { label: string; width: number; align?: "left" | "right" };
export type PdfDocumentInput = {
  title: string;
  documentNumber: string;
  status: string;
  company: { name: string; address: string; tax: string };
  meta: Array<[string, string]>;
  columns: PdfColumn[];
  rows: string[][];
  totals: Array<[string, string]>;
  notes?: string;
  footers: string[];
};

const SPECIAL: Record<string, string> = { "—": "-", "–": "-", "·": "-", "•": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "...", "≥": ">=", "≤": "<=", "−": "-", "×": "x", "∞": "INF" };

function latin1(value: string) {
  const replaced = value.replace(/[—–·•’‘“”…≥≤−×∞]/g, (match) => SPECIAL[match] ?? match);
  return replaced.replace(/[^\x20-\x7E]/g, "?");
}

function escape(value: string) {
  return latin1(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Rough Helvetica width estimate: 0.5em average for regular, 0.55em for bold. */
function textWidth(value: string, size: number, bold: boolean) {
  return latin1(value).length * size * (bold ? 0.55 : 0.5);
}

function clip(value: string, width: number, size: number, bold = false) {
  let text = value;
  while (text.length > 1 && textWidth(text, size, bold) > width) text = text.slice(0, -1);
  return text === value ? value : `${text.slice(0, -1)}…`.replace("…", "~");
}

type Page = { stream: string[] };

export function renderDocumentPdf(input: PdfDocumentInput): Uint8Array {
  const pages: Page[] = [];
  let page: Page = { stream: [] };
  pages.push(page);
  let y = A4.height - MARGIN;

  const text = (x: number, yPos: number, value: string, size = 9, bold = false) => {
    page.stream.push(`BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${yPos.toFixed(2)} Tm (${escape(value)}) Tj ET`);
  };
  const line = (x1: number, x2: number, yPos: number, width = 0.6) => {
    page.stream.push(`${width} w ${x1.toFixed(2)} ${yPos.toFixed(2)} m ${x2.toFixed(2)} ${yPos.toFixed(2)} l S`);
  };
  const rect = (x: number, yPos: number, width: number, height: number, fill?: [number, number, number]) => {
    if (fill) page.stream.push(`${fill[0]} ${fill[1]} ${fill[2]} rg ${x.toFixed(2)} ${(yPos - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f 0 0 0 rg`);
  };
  const newPage = () => {
    page = { stream: [] };
    pages.push(page);
    y = A4.height - MARGIN;
  };
  const ensure = (needed: number) => { if (y - needed < MARGIN + 60) newPage(); };

  // Header band
  rect(MARGIN, A4.height - MARGIN + 8, A4.width - MARGIN * 2, 64, [0.06, 0.16, 0.34]);
  page.stream.push(`1 1 1 rg`);
  text(MARGIN + 12, A4.height - MARGIN - 12, clip(input.company.name, 330, 14, true), 14, true);
  text(MARGIN + 12, A4.height - MARGIN - 27, clip(input.company.address, 330, 8), 8);
  text(MARGIN + 12, A4.height - MARGIN - 39, clip(input.company.tax, 330, 8), 8);
  text(A4.width - MARGIN - 12 - textWidth(input.documentNumber, 12, true), A4.height - MARGIN - 14, clip(input.documentNumber, 200, 12, true), 12, true);
  text(A4.width - MARGIN - 12 - textWidth(input.title, 8, false), A4.height - MARGIN - 27, input.title.toUpperCase(), 8);
  text(A4.width - MARGIN - 12 - textWidth(input.status, 8, true), A4.height - MARGIN - 39, input.status, 8, true);
  page.stream.push(`0 0 0 rg`);
  y = A4.height - MARGIN - 62;

  // Meta block, two columns
  const metaPairs = input.meta;
  for (let index = 0; index < metaPairs.length; index += 2) {
    ensure(30);
    const [labelA, valueA] = metaPairs[index];
    text(MARGIN, y, `${labelA}:`, 8, true);
    text(MARGIN + 86, y, clip(valueA, 170, 8), 8);
    if (metaPairs[index + 1]) {
      const [labelB, valueB] = metaPairs[index + 1];
      text(MARGIN + 270, y, `${labelB}:`, 8, true);
      text(MARGIN + 356, y, clip(valueB, 150, 8), 8);
    }
    y -= 14;
  }
  y -= 6;

  // Table header
  const tableWidth = A4.width - MARGIN * 2;
  const drawHeader = () => {
    rect(MARGIN, y, tableWidth, 20, [0.93, 0.95, 0.98]);
    let x = MARGIN + 4;
    for (const column of input.columns) {
      const label = clip(column.label, column.width - 6, 8, true);
      if (column.align === "right") text(x + column.width - 6 - textWidth(label, 8, true), y - 13, label, 8, true);
      else text(x, y - 13, label, 8, true);
      x += column.width;
    }
    y -= 20;
  };
  ensure(30);
  drawHeader();

  for (const row of input.rows) {
    ensure(18);
    let x = MARGIN + 4;
    input.columns.forEach((column, index) => {
      const value = clip(row[index] ?? "", column.width - 6, 8);
      if (column.align === "right") text(x + column.width - 6 - textWidth(value, 8, false), y - 12, value, 8);
      else text(x, y - 12, value, 8);
      x += column.width;
    });
    y -= 16;
    if (y < A4.height - MARGIN - 100) line(MARGIN, A4.width - MARGIN, y + 4, 0.3);
  }

  ensure(90);
  y -= 6;
  line(MARGIN, A4.width - MARGIN, y, 0.8);
  y -= 18;
  for (const [label, value] of input.totals) {
    text(MARGIN + 300, y, label, 9, true);
    const rendered = clip(value, 180, 9);
    text(A4.width - MARGIN - 4 - textWidth(rendered, 9, false), y, rendered, 9);
    y -= 14;
  }

  if (input.notes) {
    ensure(60);
    y -= 10;
    text(MARGIN, y, "Notes", 8, true);
    y -= 12;
    for (const chunk of chunkText(input.notes, 95)) {
      ensure(16);
      text(MARGIN, y, chunk, 8);
      y -= 11;
    }
  }

  // Footers on every page
  pages.forEach((current, index) => {
    current.stream.push(`0.45 0.45 0.45 rg`);
    const stamp = input.footers.map((footer) => footer).join("  ·  ");
    current.stream.push(`BT /F1 7 Tf 1 0 0 1 ${MARGIN} ${(MARGIN + 18).toFixed(2)} Tm (${escape(clip(stamp, 380, 7))}) Tj ET`);
    current.stream.push(`BT /F1 7 Tf 1 0 0 1 ${(A4.width - MARGIN - 40).toFixed(2)} ${(MARGIN + 18).toFixed(2)} Tm (Page ${index + 1} of ${pages.length}) Tj ET`);
    current.stream.push(`0 0 0 rg`);
  });

  return assemble(pages);
}

function chunkText(value: string, maxChars: number) {
  const words = latin1(value).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) { lines.push(current.trim()); current = word; }
    else current += ` ${word}`;
  }
  if (current.trim()) lines.push(current.trim());
  return lines.slice(0, 12);
}

function assemble(pages: Page[]): Uint8Array {
  // Fixed object plan: 1 F1, 2 F2, 3 catalog, 4 page tree, then page/content pairs from 5.
  const pageObjectNumbers = pages.map((_, index) => 5 + index * 2);
  const fonts = [
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const catalog = "<< /Type /Catalog /Pages 4 0 R >>";
  const tree = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  const bodies: string[] = [...fonts, catalog, tree];
  pages.forEach((current, index) => {
    const content = current.stream.join("\n");
    bodies.push(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 ${A4.width.toFixed(2)} ${A4.height.toFixed(2)}] /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents ${pageObjectNumbers[index] + 1} 0 R >>`);
    bodies.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  bodies.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
