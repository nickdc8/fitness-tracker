export type ExerciseTemplate = {
  id: string;
  muscleGroup: string;
  exercise: string;
  equipment: string;
  sets: string;
  reps: string;
  weight: string;
  notes: string;
};

export type WorkoutExercise = ExerciseTemplate & {
  done: boolean;
};

export type WorkoutSession = {
  id: string;
  completedAt: string;
  exercises: WorkoutExercise[];
};

export type DraftSession = {
  id: string;
  exercises: WorkoutExercise[];
};

export type WorkoutProgram = {
  id: string;
  name: string;
  sourceFile: string;
  headers: string[];
  template: ExerciseTemplate[];
  sessions: WorkoutSession[];
  draft: DraftSession;
  createdAt: string;
};

export type WorkoutAppData = {
  programs: WorkoutProgram[];
};

type BuildCsvOptions = {
  defaultProgramName?: string;
};

const HEADER_KEYS = {
  muscleGroup: ["muscle group", "muscle"],
  exercise: ["exercise", "movement"],
  equipment: ["equipment", "gear"],
  sets: ["sets"],
  reps: ["reps / time", "reps/time", "reps", "time"],
  weight: ["weight", "weight (kg)", "kg"],
  notes: ["progress notes", "notes", "note"],
  sheet: ["sheet", "program", "workout", "day", "split"],
} as const;

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumnIndex(headers: string[], candidates: readonly string[]): number {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex((header) => candidates.includes(header));
}

function toTitleCase(input: string): string {
  return input
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function fileNameToProgramName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  return toTitleCase(withoutExt) || "Workout Program";
}

function cleanCell(value: string | undefined): string {
  return (value ?? "").trim();
}

export function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row.map((value) => value.trim()));
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row.map((value) => value.trim()));
    }
  }

  return rows;
}

function buildExerciseTemplate(
  row: string[],
  columnMap: {
    muscleGroup: number;
    exercise: number;
    equipment: number;
    sets: number;
    reps: number;
    weight: number;
    notes: number;
  },
): ExerciseTemplate | null {
  const exerciseName = cleanCell(row[columnMap.exercise]);
  if (!exerciseName) {
    return null;
  }

  return {
    id: createId(),
    muscleGroup: cleanCell(row[columnMap.muscleGroup]),
    exercise: exerciseName,
    equipment: cleanCell(row[columnMap.equipment]),
    sets: cleanCell(row[columnMap.sets]),
    reps: cleanCell(row[columnMap.reps]),
    weight: cleanCell(row[columnMap.weight]),
    notes: cleanCell(row[columnMap.notes]),
  };
}

function buildDraftFromTemplate(template: ExerciseTemplate[]): DraftSession {
  return {
    id: createId(),
    exercises: template.map((item) => ({ ...item, done: false })),
  };
}

export function createProgramFromTemplate(
  name: string,
  sourceFile: string,
  headers: string[],
  template: ExerciseTemplate[],
): WorkoutProgram {
  return {
    id: createId(),
    name,
    sourceFile,
    headers,
    template,
    sessions: [],
    draft: buildDraftFromTemplate(template),
    createdAt: new Date().toISOString(),
  };
}

export function buildProgramsFromCsv(
  fileName: string,
  csvText: string,
  options?: BuildCsvOptions,
): WorkoutProgram[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error(`CSV ${fileName} does not have enough rows.`);
  }

  const headers = rows[0].map((item) => item.trim());
  const body = rows.slice(1);

  const exerciseIndex = findColumnIndex(headers, HEADER_KEYS.exercise);
  if (exerciseIndex < 0) {
    throw new Error(`CSV ${fileName} is missing an Exercise column.`);
  }

  const columnMap = {
    muscleGroup: findColumnIndex(headers, HEADER_KEYS.muscleGroup),
    exercise: exerciseIndex,
    equipment: findColumnIndex(headers, HEADER_KEYS.equipment),
    sets: findColumnIndex(headers, HEADER_KEYS.sets),
    reps: findColumnIndex(headers, HEADER_KEYS.reps),
    weight: findColumnIndex(headers, HEADER_KEYS.weight),
    notes: findColumnIndex(headers, HEADER_KEYS.notes),
  };

  const sheetIndex = findColumnIndex(headers, HEADER_KEYS.sheet);
  const grouped = new Map<string, ExerciseTemplate[]>();

  for (const row of body) {
    const template = buildExerciseTemplate(row, columnMap);
    if (!template) {
      continue;
    }

    const rawKey = sheetIndex >= 0 ? cleanCell(row[sheetIndex]) : "";
    const fallbackName = options?.defaultProgramName || fileNameToProgramName(fileName);
    const groupKey = rawKey || fallbackName;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey)?.push(template);
  }

  return Array.from(grouped.entries())
    .map(([groupName, template]) => {
      const normalizedName = toTitleCase(groupName);
      return createProgramFromTemplate(normalizedName, fileName, headers, template);
    })
    .filter((program) => program.template.length > 0);
}

export function completeDraft(program: WorkoutProgram): WorkoutProgram {
  const completed: WorkoutSession = {
    id: createId(),
    completedAt: new Date().toISOString(),
    exercises: program.draft.exercises.map((exercise) => ({ ...exercise })),
  };

  return {
    ...program,
    sessions: [...program.sessions, completed],
    draft: buildDraftFromTemplate(program.template),
  };
}

export function formatSessionDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
