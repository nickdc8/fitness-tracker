import { buildProgramsFromCsv, WorkoutProgram } from "@/lib/workout";

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function getBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

async function parseExcelFile(file: File): Promise<WorkoutProgram[]> {
  const xlsxModule = await import("xlsx/xlsx.mjs");
  const XLSX = (xlsxModule as { default?: typeof xlsxModule }).default ?? xlsxModule;
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const imported: WorkoutProgram[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const csvText = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (!csvText.trim()) {
      continue;
    }

    const programs = buildProgramsFromCsv(file.name, csvText, {
      defaultProgramName: sheetName || getBaseName(file.name),
    });

    imported.push(...programs);
  }

  return imported;
}

export async function parseUploadedFile(file: File): Promise<WorkoutProgram[]> {
  const extension = getExtension(file.name);

  if (extension === "csv") {
    const text = await file.text();
    return buildProgramsFromCsv(file.name, text);
  }

  if (extension === "xlsx" || extension === "xls") {
    return parseExcelFile(file);
  }

  throw new Error("Unsupported file type. Upload CSV or Excel (.xlsx/.xls).");
}
