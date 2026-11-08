import { NextResponse } from "next/server";
import { readSheet } from "read-excel-file/node";
import { ApiError, apiError, assertSameOrigin } from "@/lib/api";
import { requireAuth } from "@/lib/auth";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5_001;
const MAX_COLUMNS = 40;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"' && value.length === 0) quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value.replace(/\r$/, "")); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = ""; }
    else value += character;
  }
  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function stringifyCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const context = await requireAuth();
    if (!context.permissions.includes("PURCHASE_ORDER_CREATE") && !context.permissions.includes("PURCHASE_RECEIPT_CREATE")) {
      throw new ApiError(403, "FORBIDDEN", "Spreadsheet import permission is not granted.");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "FILE_REQUIRED", "Select a CSV or XLSX file to import.");
    if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new ApiError(413, "FILE_SIZE_INVALID", "Import files must be between 1 byte and 5 MB.");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv" && extension !== "xlsx") throw new ApiError(415, "UNSUPPORTED_FILE", "Only .csv and .xlsx import files are accepted.");

    let rows: string[][];
    if (extension === "csv") {
      rows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
    } else {
      const parsed = await readSheet(Buffer.from(await file.arrayBuffer()), 1);
      rows = parsed.map((row) => row.map(stringifyCell));
    }
    rows = rows.filter((row) => row.some((cell) => cell.trim()));
    if (rows.length < 2) throw new ApiError(422, "EMPTY_IMPORT", "The import must contain a header row and at least one data row.");
    if (rows.length > MAX_ROWS) throw new ApiError(422, "TOO_MANY_ROWS", "An import can contain at most 5,000 data rows.");
    if (rows.some((row) => row.length > MAX_COLUMNS)) throw new ApiError(422, "TOO_MANY_COLUMNS", "An import can contain at most 40 columns.");
    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => (row[index] || "").trim()));
    return NextResponse.json({ data: { fileName: file.name, rows: normalized, rowCount: normalized.length - 1 } });
  } catch (error) {
    return apiError(error);
  }
}
