import { call } from './api'
import type { DbData, Exercise, Routine, RoutineExercise, Session, Workout } from './types'

type Listener = () => void

const listeners = new Set<Listener>()

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify(): void {
  listeners.forEach((fn) => fn())
}

function emptyDb(): DbData {
  return { routines: [], routineExercises: [], sessions: [], workouts: [] }
}

interface State {
  db: DbData
  exercises: Exercise[]
  exercisesById: Map<string, Exercise>
  loading: boolean
  loaded: boolean
  error: string
  status: string
}

const state: State = {
  db: emptyDb(),
  exercises: [],
  exercisesById: new Map(),
  loading: false,
  loaded: false,
  error: '',
  status: ''
}

/* ------------------------------ accessors ------------------------------ */

export function data(): DbData {
  return state.db
}
export function allExercises(): Exercise[] {
  return state.exercises
}
export function exercisesReady(): boolean {
  return state.exercises.length > 0
}
export function exerciseById(id: string | number | null | undefined): Exercise | undefined {
  if (id === null || id === undefined || id === '') return undefined
  return state.exercisesById.get(String(id))
}
export function isLoading(): boolean {
  return state.loading
}
export function isLoaded(): boolean {
  return state.loaded
}
export function errorMessage(): string {
  return state.error
}
export function statusMessage(): string {
  return state.status
}
export function setStatus(msg: string): void {
  state.status = msg
  notify()
}
export function clearError(): void {
  state.error = ''
}

/* ------------------------------ selectors ------------------------------ */

function byPosition<T extends { position: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
}

export function routines(): Routine[] {
  return byPosition(state.db.routines)
}

export function routineById(id: number | string): Routine | undefined {
  return state.db.routines.find((r) => Number(r.id) === Number(id))
}

export function routineExercisesFor(routineId: number | string): RoutineExercise[] {
  return byPosition(state.db.routineExercises.filter((re) => Number(re.routine_id) === Number(routineId)))
}

export function sessionById(id: number | string): Session | undefined {
  return state.db.sessions.find((s) => Number(s.id) === Number(id))
}

export function sessionsForRoutine(routineId: number | string): Session[] {
  return state.db.sessions
    .filter((s) => Number(s.routine_id) === Number(routineId))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
}

export function workoutsForSession(sessionId: number | string): Workout[] {
  return byPosition(state.db.workouts.filter((w) => Number(w.session_id) === Number(sessionId)))
}

export function sessionsSorted(): Session[] {
  return [...state.db.sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
}

export function displayName(exercise: string, exerciseId: string | number | null | undefined): string {
  const ex = exerciseById(exerciseId)
  if (ex) return ex.name_it || ex.name
  return exercise
}

/* ------------------------------ loading -------------------------------- */

export async function loadExercises(): Promise<void> {
  if (state.exercises.length) return
  const base = import.meta.env.BASE_URL || './'
  const res = await fetch(base + 'exercises-data.json')
  if (!res.ok) throw new Error('Impossibile caricare il catalogo esercizi')
  const list = (await res.json()) as Exercise[]
  state.exercises = list
  state.exercisesById = new Map(list.map((e) => [String(e.id), e]))
  notify()
}

function toNum(v: unknown, fallback: number | null): number | null {
  if (v === '' || v === null || v === undefined) return fallback
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function normalizeDb(raw: Partial<DbData> | null): DbData {
  const r = raw ?? {}
  return {
    routines: (r.routines ?? []).map((x) => ({
      id: toNum(x.id, 0) as number,
      name: String(x.name ?? ''),
      position: toNum(x.position, 0) as number,
      created_at: (x.created_at as string) ?? null
    })),
    routineExercises: (r.routineExercises ?? []).map((x) => ({
      id: toNum(x.id, 0) as number,
      routine_id: toNum(x.routine_id, 0) as number,
      exercise: String(x.exercise ?? ''),
      exercise_id: x.exercise_id === '' || x.exercise_id === undefined ? null : String(x.exercise_id),
      default_sets: toNum(x.default_sets, null),
      default_reps: toNum(x.default_reps, null),
      notes: (x.notes as string) ?? null,
      position: toNum(x.position, 0) as number,
      superset_id: x.superset_id ? String(x.superset_id) : null
    })),
    sessions: (r.sessions ?? []).map((x) => ({
      id: toNum(x.id, 0) as number,
      routine_id: toNum(x.routine_id, 0) as number,
      date: String(x.date ?? ''),
      created_at: (x.created_at as string) ?? null
    })),
    workouts: (r.workouts ?? []).map((x) => ({
      id: toNum(x.id, 0) as number,
      session_id: toNum(x.session_id, 0) as number,
      exercise: String(x.exercise ?? ''),
      exercise_id: x.exercise_id === '' || x.exercise_id === undefined ? null : String(x.exercise_id),
      sets: toNum(x.sets, null),
      reps: toNum(x.reps, null),
      weight: toNum(x.weight, null),
      notes: (x.notes as string) ?? null,
      position: toNum(x.position, 0) as number,
      superset_id: x.superset_id ? String(x.superset_id) : null,
      created_at: (x.created_at as string) ?? null
    }))
  }
}

export async function reload(): Promise<void> {
  state.loading = true
  state.error = ''
  notify()
  try {
    const db = await call<DbData>('getAll')
    state.db = normalizeDb(db)
    state.loaded = true
  } catch (err) {
    state.error = (err as Error).message
    throw err
  } finally {
    state.loading = false
    notify()
  }
}

async function mutate<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const result = await call<T>(action, payload)
  await reload()
  return result
}

/* ------------------------------ mutations ------------------------------ */

export function createRoutine(name: string): Promise<Routine> {
  return mutate<Routine>('createRoutine', { name })
}
export function renameRoutine(id: number, name: string): Promise<unknown> {
  return mutate('renameRoutine', { id, name })
}
export function deleteRoutine(id: number): Promise<unknown> {
  return mutate('deleteRoutine', { id })
}
export function reorderRoutines(order: number[]): Promise<unknown> {
  return mutate('reorderRoutines', { order })
}

export function addRoutineExercise(payload: {
  routine_id: number
  exercise: string
  exercise_id: string | null
  default_sets: number | null
  default_reps: number | null
  notes: string | null
}): Promise<RoutineExercise> {
  return mutate<RoutineExercise>('addRoutineExercise', payload)
}
export function editRoutineExercise(payload: {
  id: number
  exercise?: string
  exercise_id?: string | null
  default_sets?: number | null
  default_reps?: number | null
  notes?: string | null
}): Promise<unknown> {
  return mutate('editRoutineExercise', payload)
}
export function deleteRoutineExercise(id: number): Promise<unknown> {
  return mutate('deleteRoutineExercise', { id })
}
export function reorderRoutineExercises(items: { id: number; position: number }[]): Promise<unknown> {
  return mutate('reorderRoutineExercises', { items })
}
export function setSuperset(id1: number, id2: number): Promise<{ group_id: string }> {
  return mutate<{ group_id: string }>('setSuperset', { id1, id2 })
}
export function unsetSuperset(supersetId: string): Promise<unknown> {
  return mutate('unsetSuperset', { superset_id: supersetId })
}

export function startSession(routineId: number): Promise<{ session_id: number }> {
  return mutate<{ session_id: number }>('startSession', { routine_id: routineId })
}
export function saveSession(
  sessionId: number,
  workouts: { id: number; sets: number | null; reps: number | null; weight: number | null }[]
): Promise<unknown> {
  return mutate('saveSession', { session_id: sessionId, workouts })
}
export function updateSupersetGroup(
  sessionId: number,
  supersetId: string,
  sets: number | null,
  reps: number | null
): Promise<unknown> {
  return mutate('updateSupersetGroup', { session_id: sessionId, superset_id: supersetId, sets, reps })
}
export function deleteSessionWorkout(workoutId: number): Promise<unknown> {
  return mutate('deleteSessionWorkout', { workout_id: workoutId })
}
export function deleteSession(sessionId: number): Promise<unknown> {
  return mutate('deleteSession', { session_id: sessionId })
}
export function clearStats(): Promise<unknown> {
  return mutate('clearStats')
}
