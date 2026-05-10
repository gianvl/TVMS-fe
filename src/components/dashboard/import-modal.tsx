import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { bulkImportApprehensions } from "@/lib/api";
import type { ApprehensionInput } from "@/types/apprehension";

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  file: File | null;
}

type Step = "preview" | "importing" | "done";

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

// --- Header normalization ---
// Maps human-readable Excel headers to internal field names.
// Handles: "DATE OF APPREHENSION" → "dateOfApprehension", etc.
// For grouped columns (DRIVER/OPERATOR, CONFISCATED ITEM), the first
// occurrence maps to lastName/type and the second to firstName/number.

const HEADER_MAP: Record<string, string> = {
  // Direct matches (camelCase headers — for programmatic Excel files)
  dateofsubmission: "dateOfSubmission",
  dateofapprehension: "dateOfApprehension",
  timeofapprehension: "timeOfApprehension",
  agency: "agency",
  apprehendingofficer: "apprehendingOfficer",
  casenumber: "caseNumber",
  violation: "violation",
  mvtype: "mvType",
  platenumber: "plateNumber",
  plateno: "plateNumber",
  placeofapprehension: "placeOfApprehension",
  remarks: "remarks",
  lastname: "driver.lastName",
  firstname: "driver.firstName",
  restrictioncode: "restrictionCode",
  conditions: "conditions",
  nationality: "nationality",
  gender: "gender",
  daysinterval: "_skip_",

  // Human-readable headers (from the actual LTO Excel format)
  dateofsubmission_h: "dateOfSubmission",
  daysinterval_h: "_skip_",
  toptransactioncasenumber: "caseNumber",
  plateno_mvfileno: "plateNumber",
  "plateномvfileno": "plateNumber",
};

// Patterns matched via includes (for fuzzy matching)
const HEADER_PATTERNS: [string, string][] = [
  ["dateofsubmission", "dateOfSubmission"],
  ["dateofapprehension", "dateOfApprehension"],
  ["timeofapprehension", "timeOfApprehension"],
  ["apprehendingofficer", "apprehendingOfficer"],
  ["casenumber", "caseNumber"],
  ["transactioncasenumber", "caseNumber"],
  ["placeofapprehension", "placeOfApprehension"],
  ["platenomvfile", "plateNumber"],
  ["platenofile", "plateNumber"],
  ["platenumber", "plateNumber"],
  ["plateno", "plateNumber"],
  ["mvtype", "mvType"],
  ["daysinterval", "_skip_"],
  ["restrictioncode", "restrictionCode"],
];

// Group headers that span multiple columns (first col → field A, second col → field B)
const GROUPED_COLUMNS: Record<string, [string, string]> = {
  driveroperator: ["driver.lastName", "driver.firstName"],
  driver: ["driver.lastName", "driver.firstName"],
  confiscateditem: ["confiscatedItem.type", "confiscatedItem.number"],
};

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

// A row is real apprehension data only if it has a parseable date.
// This filters out junk rows (stray cells, leftover formatting, totals)
// that Excel often leaves far past the visible data.
function hasValidDate(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return true; // Excel date serial
  const s = String(value).trim();
  if (s === "") return false;
  return !isNaN(new Date(s).getTime());
}

interface ParsedSheet {
  fields: string[]; // mapped field name per column
  rows: Record<string, unknown>[];
  rowIndices: number[]; // 1-based Excel row number for each row in `rows`
}

function parseSheet(sheet: XLSX.WorkSheet): ParsedSheet {
  // Read as raw arrays to handle multi-row headers
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  if (raw.length < 2) return { fields: [], rows: [], rowIndices: [] };

  // Find the header row: first row where at least 3 cells have text
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const row = raw[i] as unknown[];
    const filledCells = row?.filter(
      (c) => c !== null && c !== undefined && String(c).trim() !== ""
    ).length;
    if (filledCells >= 3) {
      headerRowIdx = i;
      break;
    }
  }

  // Gather header context from rows 0..headerRowIdx+1
  const headerRows: string[][] = [];
  for (let i = 0; i <= Math.min(headerRowIdx + 1, raw.length - 1); i++) {
    headerRows.push(
      ((raw[i] as unknown[]) || []).map((c) =>
        c !== null && c !== undefined ? String(c).trim() : ""
      )
    );
  }

  // Determine column count
  const colCount = Math.max(...headerRows.map((r) => r.length));

  // Build combined header per column + track group spans.
  // Merged cells in Excel only put text in the first column of the merge.
  // Subsequent columns in the merge are empty. We track the last seen group
  // header so empty columns inherit from it (e.g., DRIVER/OPERATOR spans I-J,
  // but only column I has text).
  const fields: string[] = new Array(colCount).fill("");
  const groupTracker: Record<string, number> = {};
  let activeGroup: string | null = null; // tracks current merged group

  for (let col = 0; col < colCount; col++) {
    const texts = headerRows
      .map((r) => r[col] || "")
      .filter((t) => t !== "");

    // Empty column — check if it's the continuation of a merged group
    if (texts.length === 0) {
      if (activeGroup && GROUPED_COLUMNS[activeGroup]) {
        const count = groupTracker[activeGroup] ?? 0;
        const pair = GROUPED_COLUMNS[activeGroup];
        fields[col] = count < 2 ? pair[count] : "_skip_";
        groupTracker[activeGroup] = count + 1;
        activeGroup = null; // group fully consumed
      } else {
        fields[col] = "_skip_";
      }
      continue;
    }

    // Reset active group when we hit a column with text
    activeGroup = null;

    let mapped = "";
    for (const text of [...texts].reverse()) {
      const key = normalizeKey(text);

      // Check if it's a known grouped column
      if (GROUPED_COLUMNS[key]) {
        const count = groupTracker[key] ?? 0;
        const pair = GROUPED_COLUMNS[key];
        mapped = count < 2 ? pair[count] : "_skip_";
        groupTracker[key] = count + 1;
        // Mark this group as active so the next empty column inherits
        activeGroup = key;
        break;
      }

      // Direct map
      if (HEADER_MAP[key]) {
        mapped = HEADER_MAP[key];
        break;
      }

      // Pattern match
      for (const [pattern, field] of HEADER_PATTERNS) {
        if (key.includes(pattern)) {
          mapped = field;
          break;
        }
      }
      if (mapped) break;

      // Single-word matches
      if (key === "agency") { mapped = "agency"; break; }
      if (key === "violation") { mapped = "violation"; break; }
      if (key === "remarks") { mapped = "remarks"; break; }
      if (key === "gender") { mapped = "gender"; break; }
      if (key === "nationality") { mapped = "nationality"; break; }
      if (key === "conditions") { mapped = "conditions"; break; }
    }

    fields[col] = mapped || "_unknown_";
  }

  // Parse data rows (everything after the header rows)
  const dataStartIdx = headerRows.length;
  const rows: Record<string, unknown>[] = [];
  const rowIndices: number[] = [];

  for (let r = dataStartIdx; r < raw.length; r++) {
    const rowData = raw[r] as unknown[];
    if (
      !rowData ||
      rowData.every(
        (c) => c === null || c === undefined || String(c).trim() === ""
      )
    )
      continue;

    const obj: Record<string, unknown> = {};
    for (let col = 0; col < fields.length; col++) {
      const field = fields[col];
      if (field === "_skip_" || field === "_unknown_") continue;
      obj[field] = rowData[col] ?? null;
    }

    // Drop rows without a real date — they're spreadsheet junk, not records.
    if (!hasValidDate(obj.dateOfApprehension)) continue;

    rows.push(obj);
    rowIndices.push(r + 1); // Excel rows are 1-based
  }

  return { fields, rows, rowIndices };
}

// --- Data conversion ---

function formatDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return s;
}

function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function mapRowToInput(row: Record<string, unknown>): ApprehensionInput {
  return {
    dateOfSubmission: formatDate(row.dateOfSubmission),
    dateOfApprehension: formatDate(row.dateOfApprehension),
    timeOfApprehension: str(row.timeOfApprehension),
    agency: str(row.agency),
    apprehendingOfficer: str(row.apprehendingOfficer),
    caseNumber: str(row.caseNumber),
    driver: {
      lastName: str(row["driver.lastName"]),
      firstName: str(row["driver.firstName"]),
    },
    violation: str(row.violation),
    confiscatedItem: {
      type: str(row["confiscatedItem.type"]),
      number: str(row["confiscatedItem.number"]),
    },
    restrictionCode: str(row.restrictionCode),
    conditions: str(row.conditions),
    nationality: str(row.nationality),
    gender: str(row.gender),
    mvType: str(row.mvType),
    plateNumber: str(row.plateNumber),
    placeOfApprehension: str(row.placeOfApprehension),
    remarks: str(row.remarks),
  };
}

// --- Validation ---

const REQUIRED_FIELDS = [
  "dateOfApprehension",
  "agency",
  "caseNumber",
  "violation",
  "plateNumber",
  "placeOfApprehension",
];

interface ValidationResult {
  missingRequired: string[];
  unmappedCount: number;
}

function validateFields(fields: string[]): ValidationResult {
  const mappedFields = new Set(fields.filter((f) => f !== "_skip_" && f !== "_unknown_"));
  const missingRequired = REQUIRED_FIELDS.filter((f) => !mappedFields.has(f));
  const unmappedCount = fields.filter((f) => f === "_unknown_").length;
  return { missingRequired, unmappedCount };
}

const PREVIEW_COLUMNS = [
  "caseNumber",
  "agency",
  "violation",
  "plateNumber",
  "placeOfApprehension",
] as const;

const PREVIEW_HEADERS: Record<(typeof PREVIEW_COLUMNS)[number], string> = {
  caseNumber: "Case #",
  agency: "Agency",
  violation: "Violation",
  plateNumber: "Plate #",
  placeOfApprehension: "Location",
};

export function ImportModal({ open, onOpenChange, onComplete, file }: ImportModalProps) {
  const [step, setStep] = useState<Step>("preview");
  const [parsedRows, setParsedRows] = useState<ApprehensionInput[]>([]);
  const [rowIndices, setRowIndices] = useState<number[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("preview");
    setParsedRows([]);
    setRowIndices([]);
    setFileName("");
    setResult(null);
    setValidation(null);
    setParseError(null);
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        if (step === "importing") return; // Don't close during import
        if (step === "done") onComplete();
        reset();
      }
      onOpenChange(isOpen);
    },
    [step, onOpenChange, onComplete, reset]
  );

  // Parse file when modal opens with a new file
  useEffect(() => {
    if (!open || !file) return;

    setFileName(file.name);
    setParseError(null);
    setValidation(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const { fields, rows, rowIndices } = parseSheet(sheet);

        if (rows.length === 0) {
          setParseError("The file is empty or has no data rows.");
          return;
        }

        const result = validateFields(fields);
        setValidation(result);

        const mapped = rows.map(mapRowToInput);
        setParsedRows(mapped);
        setRowIndices(rowIndices);
        setStep("preview");
      } catch {
        setParseError(
          "Failed to read file. Make sure it's a valid Excel or CSV file."
        );
      }
    };
    reader.readAsArrayBuffer(file);
  }, [open, file]);

  const handleImport = useCallback(async () => {
    setStep("importing");

    try {
      const res = await bulkImportApprehensions(parsedRows);
      const { imported, failed, errors: apiErrors } = res.data;

      setResult({
        success: imported,
        failed,
        errors: apiErrors.map(
          (e) => `Row ${rowIndices[e.row - 1] ?? e.row}: ${e.error}`
        ),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import request failed";
      setResult({ success: 0, failed: parsedRows.length, errors: [msg] });
    }

    setStep("done");
  }, [parsedRows, rowIndices]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === "preview" && "Preview Import"}
            {step === "importing" && "Importing..."}
            {step === "done" && "Import Complete"}
          </DialogTitle>
        </DialogHeader>

        {/* Preview Step */}
        {step === "preview" && parseError && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <XCircle className="h-4 w-4 shrink-0" />
            {parseError}
          </div>
        )}
        {step === "preview" && !parseError && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="font-medium">{fileName}</span>
              <span>&mdash;</span>
              <span>{parsedRows.length} records found</span>
            </div>

            {/* Missing required columns error */}
            {validation && validation.missingRequired.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                  <XCircle className="h-4 w-4 shrink-0" />
                  Missing required columns:
                </div>
                <p className="mt-1 text-sm text-red-600">
                  {validation.missingRequired.join(", ")}
                </p>
                <p className="mt-2 text-xs text-red-500">
                  Please check that your Excel column headers match the expected
                  field names.
                </p>
              </div>
            )}

            {/* Unrecognized columns warning */}
            {validation && validation.unmappedCount > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {validation.unmappedCount} column(s) could not be mapped and
                  will be ignored.
                </div>
              </div>
            )}

            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 font-medium text-gray-600">#</th>
                    {PREVIEW_COLUMNS.map((col) => (
                      <th
                        key={col}
                        className="px-3 py-2 font-medium text-gray-600"
                      >
                        {PREVIEW_HEADERS[col]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedRows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2">{row.caseNumber}</td>
                      <td className="px-3 py-2">{row.agency}</td>
                      <td className="max-w-[200px] truncate px-3 py-2">
                        {row.violation}
                      </td>
                      <td className="px-3 py-2">{row.plateNumber}</td>
                      <td className="px-3 py-2">{row.placeOfApprehension}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedRows.length > 10 && (
              <p className="text-xs text-gray-500">
                Showing first 10 of {parsedRows.length} records
              </p>
            )}
          </div>
        )}

        {/* Importing Step */}
        {step === "importing" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-[#1a3a5c]" />
            <p className="text-sm text-gray-600">
              Importing {parsedRows.length} records...
            </p>
          </div>
        )}

        {/* Done Step */}
        {step === "done" && result && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="font-medium text-gray-900">
                  {result.success} records imported successfully
                </p>
                {result.failed > 0 && (
                  <p className="text-sm text-red-600">
                    {result.failed} records failed
                  </p>
                )}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-32 overflow-auto rounded-md border border-red-200 bg-red-50 p-3">
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700">
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter>
          {step === "preview" && parseError && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          )}
          {step === "preview" && !parseError && (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  validation !== null && validation.missingRequired.length > 0
                }
              >
                Import {parsedRows.length} Records
              </Button>
            </>
          )}
          {step === "importing" && null}
          {step === "done" && (
            <Button onClick={() => handleOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
