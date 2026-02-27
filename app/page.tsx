"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { PwaRegister } from "@/components/pwa-register";
import { parseUploadedFile } from "@/lib/import-programs";
import {
  completeDraft,
  formatSessionDate,
  WorkoutAppData,
  WorkoutExercise,
  WorkoutProgram,
} from "@/lib/workout";

const STORAGE_KEY = "workout-pwa-data-v1";

type CursorMap = Record<string, number>;

const EMPTY_STATE: WorkoutAppData = {
  programs: [],
};

function normalizeExerciseStatus(exercise: WorkoutExercise): WorkoutExercise {
  return {
    ...exercise,
    done: !!exercise.done,
    skipped: !!exercise.skipped,
  };
}

function safeLoad(): WorkoutAppData {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_STATE;
    }

    const parsed = JSON.parse(raw) as WorkoutAppData;
    if (!Array.isArray(parsed.programs)) {
      return EMPTY_STATE;
    }

    return {
      programs: parsed.programs.map((program) => ({
        ...program,
        draft: {
          ...program.draft,
          exercises: (program.draft?.exercises ?? []).map((exercise) =>
            normalizeExerciseStatus(exercise as WorkoutExercise),
          ),
        },
        sessions: (program.sessions ?? []).map((session) => ({
          ...session,
          exercises: (session.exercises ?? []).map((exercise) =>
            normalizeExerciseStatus(exercise as WorkoutExercise),
          ),
        })),
      })),
    };
  } catch {
    return EMPTY_STATE;
  }
}

function updateAtIndex<T>(items: T[], index: number, updater: (item: T) => T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? updater(item) : item));
}

export default function Home() {
  const [data, setData] = useState<WorkoutAppData>(EMPTY_STATE);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [cursorByProgram, setCursorByProgram] = useState<CursorMap>({});
  const [error, setError] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = safeLoad();
    setData(loaded);
    setSelectedProgramId(loaded.programs[0]?.id ?? null);
    setCursorByProgram(
      Object.fromEntries(loaded.programs.map((program) => [program.id, program.sessions.length])),
    );
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  useEffect(() => {
    if (!data.programs.length) {
      setSelectedProgramId(null);
      setCursorByProgram({});
      return;
    }

    setSelectedProgramId((current) => {
      if (current && data.programs.some((program) => program.id === current)) {
        return current;
      }
      return data.programs[0].id;
    });

    setCursorByProgram((current) => {
      const next: CursorMap = {};
      for (const program of data.programs) {
        const fallback = program.sessions.length;
        const existing = current[program.id];
        next[program.id] =
          typeof existing === "number" && existing >= 0 && existing <= fallback
            ? existing
            : fallback;
      }
      return next;
    });
  }, [data.programs]);

  const activeProgram = useMemo(
    () => data.programs.find((program) => program.id === selectedProgramId) ?? null,
    [data.programs, selectedProgramId],
  );

  const activeCursor = activeProgram ? cursorByProgram[activeProgram.id] ?? activeProgram.sessions.length : 0;
  const onDraft = !!activeProgram && activeCursor === activeProgram.sessions.length;
  const activeSession =
    activeProgram && !onDraft ? activeProgram.sessions[activeCursor] : null;
  const exerciseRows = activeProgram
    ? onDraft
      ? activeProgram.draft.exercises
      : activeSession?.exercises ?? []
    : [];

  const canGoBack = !!activeProgram && activeCursor > 0;
  const canGoForward = !!activeProgram && activeCursor < activeProgram.sessions.length;
  const allMarked =
    exerciseRows.length > 0 && exerciseRows.every((row) => row.done || row.skipped);

  const updateProgram = (programId: string, updater: (program: WorkoutProgram) => WorkoutProgram) => {
    setData((current) => ({
      programs: current.programs.map((program) =>
        program.id === programId ? updater(program) : program,
      ),
    }));
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (!files || files.length === 0) {
      return;
    }

    const imported: WorkoutProgram[] = [];
    const failures: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const programs = await parseUploadedFile(file);
        if (!programs.length) {
          failures.push(`${file.name}: no exercises found in the uploaded file`);
          continue;
        }
        imported.push(...programs);
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : "Invalid CSV";
        failures.push(`${file.name}: ${message}`);
      }
    }

    if (imported.length) {
      setData((current) => {
        const byName = new Map<string, WorkoutProgram>();
        for (const program of current.programs) {
          byName.set(program.name.toLowerCase(), program);
        }
        for (const program of imported) {
          byName.set(program.name.toLowerCase(), program);
        }
        return {
          programs: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)),
        };
      });
      setSelectedProgramId(imported[0].id);
      setCursorByProgram((current) => {
        const next = { ...current };
        for (const program of imported) {
          next[program.id] = program.sessions.length;
        }
        return next;
      });
    }

    setError(failures.join(" | "));
    event.target.value = "";
  };

  const handleSessionMove = (direction: "back" | "forward") => {
    if (!activeProgram) {
      return;
    }

    setCursorByProgram((current) => {
      const now = current[activeProgram.id] ?? activeProgram.sessions.length;
      const max = activeProgram.sessions.length;
      const nextCursor = direction === "back" ? Math.max(0, now - 1) : Math.min(max, now + 1);
      return {
        ...current,
        [activeProgram.id]: nextCursor,
      };
    });
  };

  const setExerciseField = (exerciseIndex: number, field: "sets" | "reps" | "weight" | "notes", value: string) => {
    if (!activeProgram) {
      return;
    }

    updateProgram(activeProgram.id, (program) => {
      if (onDraft) {
        return {
          ...program,
          draft: {
            ...program.draft,
            exercises: updateAtIndex(program.draft.exercises, exerciseIndex, (exercise) => ({
              ...exercise,
              [field]: value,
            })),
          },
        };
      }

      return {
        ...program,
        sessions: updateAtIndex(program.sessions, activeCursor, (session) => ({
          ...session,
          exercises: updateAtIndex(session.exercises, exerciseIndex, (exercise) => ({
            ...exercise,
            [field]: value,
          })),
        })),
      };
    });
  };

  const toggleDone = (exerciseIndex: number) => {
    if (!activeProgram) {
      return;
    }

    updateProgram(activeProgram.id, (program) => {
      if (onDraft) {
        return {
          ...program,
          draft: {
            ...program.draft,
            exercises: updateAtIndex(program.draft.exercises, exerciseIndex, (exercise) => ({
              ...exercise,
              done: !exercise.done,
              skipped: exercise.done ? exercise.skipped : false,
            })),
          },
        };
      }

      return {
        ...program,
        sessions: updateAtIndex(program.sessions, activeCursor, (session) => ({
          ...session,
          exercises: updateAtIndex(session.exercises, exerciseIndex, (exercise) => ({
            ...exercise,
            done: !exercise.done,
            skipped: exercise.done ? exercise.skipped : false,
          })),
        })),
      };
    });
  };

  const toggleSkipped = (exerciseIndex: number) => {
    if (!activeProgram) {
      return;
    }

    updateProgram(activeProgram.id, (program) => {
      if (onDraft) {
        return {
          ...program,
          draft: {
            ...program.draft,
            exercises: updateAtIndex(program.draft.exercises, exerciseIndex, (exercise) => ({
              ...exercise,
              skipped: !exercise.skipped,
              done: exercise.skipped ? exercise.done : false,
            })),
          },
        };
      }

      return {
        ...program,
        sessions: updateAtIndex(program.sessions, activeCursor, (session) => ({
          ...session,
          exercises: updateAtIndex(session.exercises, exerciseIndex, (exercise) => ({
            ...exercise,
            skipped: !exercise.skipped,
            done: exercise.skipped ? exercise.done : false,
          })),
        })),
      };
    });
  };

  const completeWorkout = () => {
    if (!activeProgram || !onDraft || !allMarked) {
      return;
    }

    const draftCursorAfterCompletion = activeProgram.sessions.length + 1;
    updateProgram(activeProgram.id, (program) => completeDraft(program));
    setCursorByProgram((current) => ({
      ...current,
      [activeProgram.id]: draftCursorAfterCompletion,
    }));
  };

  return (
    <main className="app-shell">
      <PwaRegister />

      <section className="hero-card">
        <p className="kicker">Workout PWA</p>
        <h1>CSV Workout Tracker</h1>
        <p className="subcopy">
          Upload one or more CSV files, generate workout tracks, edit each set live, and archive completed sessions by date.
        </p>
      </section>

      <section className="panel">
        <label className="upload-label" htmlFor="csv-upload">
          <span>Upload Program File</span>
          <small>Supports CSV or Excel (.xlsx/.xls)</small>
        </label>
        <input
          id="csv-upload"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          onChange={handleUpload}
        />
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel">
        <div className="section-header">
          <h2>Programs</h2>
          <span>{data.programs.length}</span>
        </div>
        <div className="program-list">
          {data.programs.length === 0 ? (
            <p className="empty">No programs yet. Upload a CSV to begin.</p>
          ) : (
            data.programs.map((program) => (
              <button
                key={program.id}
                type="button"
                className={program.id === selectedProgramId ? "program-card active" : "program-card"}
                onClick={() => setSelectedProgramId(program.id)}
              >
                <strong>{program.name}</strong>
                <span>{program.template.length} exercises</span>
              </button>
            ))
          )}
        </div>
      </section>

      {activeProgram ? (
        <section className="panel workout-panel">
          <div className="section-header">
            <h2>{activeProgram.name}</h2>
            <span>{exerciseRows.length} rows</span>
          </div>

          <div className="nav-row">
            <button type="button" disabled={!canGoBack} onClick={() => handleSessionMove("back")}>◀</button>
            <div>
              <p>{onDraft ? "Next workout slot" : "Archived workout"}</p>
              <strong>{onDraft ? "Empty Session" : formatSessionDate(activeSession?.completedAt ?? "")}</strong>
            </div>
            <button type="button" disabled={!canGoForward} onClick={() => handleSessionMove("forward")}>▶</button>
          </div>

          <div className="exercise-list">
            {exerciseRows.map((exercise, index) => (
              <article
                key={exercise.id}
                className={
                  exercise.done
                    ? "exercise-row done"
                    : exercise.skipped
                      ? "exercise-row skipped"
                      : "exercise-row"
                }
              >
                <div className="exercise-top">
                  <div>
                    <h3>{exercise.exercise}</h3>
                    <p>{exercise.muscleGroup || "General"}</p>
                  </div>
                  <div className="status-toggles">
                    <label className="done-toggle">
                      <input
                        type="checkbox"
                        checked={exercise.done}
                        onChange={() => toggleDone(index)}
                      />
                      Done
                    </label>
                    <label className="done-toggle">
                      <input
                        type="checkbox"
                        checked={exercise.skipped}
                        onChange={() => toggleSkipped(index)}
                      />
                      Skipped
                    </label>
                  </div>
                </div>

                <div className="input-grid">
                  <label>
                    Sets
                    <input
                      type="text"
                      value={exercise.sets}
                      onChange={(event) => setExerciseField(index, "sets", event.target.value)}
                    />
                  </label>
                  <label>
                    Reps / Time
                    <input
                      type="text"
                      value={exercise.reps}
                      onChange={(event) => setExerciseField(index, "reps", event.target.value)}
                    />
                  </label>
                  <label>
                    Weight (kg)
                    <input
                      type="text"
                      value={exercise.weight}
                      onChange={(event) => setExerciseField(index, "weight", event.target.value)}
                    />
                  </label>
                  <label>
                    Notes
                    <input
                      type="text"
                      value={exercise.notes}
                      onChange={(event) => setExerciseField(index, "notes", event.target.value)}
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>

          {onDraft ? (
            <button
              type="button"
              className="complete-btn"
              disabled={!allMarked}
              onClick={completeWorkout}
            >
              {allMarked
                ? "Complete & Archive Workout"
                : "Mark each exercise as Done or Skipped"}
            </button>
          ) : null}

          {activeProgram.sessions.length > 0 ? (
            <div className="archive-list">
              <h3>Archived sessions</h3>
              {activeProgram.sessions
                .slice()
                .reverse()
                .map((session) => (
                  <div key={session.id} className="archive-row">
                    <span>{formatSessionDate(session.completedAt)}</span>
                    <span>
                      {session.exercises.filter((item) => item.done).length} done,{" "}
                      {session.exercises.filter((item) => item.skipped).length} skipped
                    </span>
                  </div>
                ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
