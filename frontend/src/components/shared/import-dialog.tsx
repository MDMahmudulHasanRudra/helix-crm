"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import { mutate } from "@/lib/api";
import type { ImportResult } from "@/lib/types";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string; // "accounts" | "contacts" | "leads"
  title: string;
  templateColumns: string[];
  sampleRows: string[][];
  onSuccess?: () => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  entityName,
  title,
  templateColumns,
  sampleRows,
  onSuccess,
}: ImportDialogProps) {
  const [csvText, setCsvText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Parse CSV text into preview rows
  const { columns: previewColumns, rows: parsedRows } = useMemo(() => {
    const empty = { columns: [] as string[], rows: [] as Record<string, string>[] };
    if (!csvText.trim()) return empty;
    const lines = csvText.trim().split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length <= 1) return empty;

    const headers = parseCsvLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        const cleanKey = toCamelCase(h);
        // Blank cells are left out so numeric fields (score, estimatedValue) bind as null, not "".
        const value = values[idx] ?? "";
        if (cleanKey && value !== "") row[cleanKey] = value;
      });
      rows.push(row);
    }
    return { columns: headers.map(toCamelCase).filter(Boolean), rows };
  }, [csvText]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content ?? "");
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const headerRow = templateColumns.join(",");
    const dataRows = sampleRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(`${headerRow}\n${dataRows}`);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `${entityName}-template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function submit() {
    if (parsedRows.length === 0) {
      toast.error("Please upload or paste a CSV file with at least one data row.");
      return;
    }

    setUploading(true);
    try {
      const result = await mutate<ImportResult>(`/${entityName}/import`, "POST", parsedRows);
      toast.success(`Import complete! ${result.importedCount} added, ${result.skippedCount} skipped.`);
      await globalMutate((key) => typeof key === "string" && key.startsWith(`/${entityName}`));
      onOpenChange(false);
      setCsvText("");
      setFileName(null);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import rows");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader
          title={title}
          description="Upload a CSV file to bulk import records. Deduplication is handled automatically."
        />
        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-brand" />
              <div className="text-[12px] text-foreground font-medium">Need the correct column format?</div>
            </div>
            <Button variant="outline" size="xs" onClick={downloadTemplate}>
              <Download className="size-3" /> Download sample CSV
            </Button>
          </div>

          <div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-2/20 p-6 transition-colors hover:border-brand/50 hover:bg-surface-2/40">
              <Upload className="size-8 text-faint" />
              <span className="mt-2 text-[13px] font-medium text-foreground">
                {fileName ? fileName : "Click to select a CSV file"}
              </span>
              <span className="mt-0.5 text-[11px] text-muted">Supports RFC 4180 standard comma-separated files</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>

          {parsedRows.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                <span className="font-semibold text-foreground">Preview: {parsedRows.length} rows ready</span>
                <span className="text-muted">Showing first 5 rows</span>
              </div>
              <div className="max-h-48 overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-border bg-surface-2/60">
                    <tr>
                      {previewColumns.map((col) => (
                        <th key={col} className="px-3 py-1.5 font-semibold text-faint">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        {previewColumns.map((col) => (
                          <td key={col} className="truncate px-3 py-1.5 text-muted">{row[col] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={uploading || parsedRows.length === 0}>
            {uploading ? "Importing..." : `Import ${parsedRows.length} records`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function toCamelCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase(),
    )
    .replace(/\s+/g, "");
}

