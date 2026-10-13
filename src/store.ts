import { call, callRaw } from './api'
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

/* ------------------------------ mutation engine ------------------------ */

let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

function cloneDb(): DbData {
  return {
    routines: state.db.routines.map((x) => ({ ...x })),
    routineExercises: state.db.routineExercises.map((x) => ({ ...x })),
    sessions: state.db.sessions.map((x) => ({ ...x })),
    workouts: state.db.workouts.map((x) => ({ ...x }))
  }
}

let tmpCounter = 0
function tmpId(): number {
  tmpCounter += 1
  return -Date.now() - tmpCounter
}

function nextPosition(items: { position: number | null }[]): number {
  let max = 0
  for (const it of items) max = Math.max(max, Number(it.position) || 0)
  return max + 1
}

type Optimistic<T> = (db: DbData) => T

async function mutate<T>(
  action: string,
  payload: Record<string, unknown> = {},
  optimistic?: Optimistic<T>
): Promise<T> {
  let optimisticResult: T | undefined
  const before = state.db
  if (optimistic) {
    const db = cloneDb()
    optimisticResult = optimistic(db)
    state.db = db
    notify()
  }
  try {
    const env = await enqueue(() => callRaw<T>(action, payload))
    if (env.db) state.db = normalizeDb(env.db as Partial<DbData>)
    if (state.error) state.error = ''
    notify()
    return (env.data as T) ?? (optimisticResult as T)
  } catch (err) {
    state.db = before
    state.error = (err as Error).message
    notify()
    throw err
  }
}

/* ------------------------------ mutations ------------------------------ */

export function createRoutine(name: string): Promise<Routine> {
  return mutate<Routine>('createRoutine', { name }, (db) => {
    const routine: Routine = { id: tmpId(), name, position: nextPosition(db.routines), created_at: null }
    db.routines.push(routine)
    return routine
  })
}
export function renameRoutine(id: number, name: string): Promise<unknown> {
  return mutate('renameRoutine', { id, name }, (db) => {
    const r = db.routines.find((x) => Number(x.id) === Number(id))
    if (r) r.name = name
  })
}
export function deleteRoutine(id: number): Promise<unknown> {
  return mutate('deleteRoutine', { id }, (db) => {
    db.routines = db.routines.filter((x) => Number(x.id) !== Number(id))
    db.routineExercises = db.routineExercises.filter((x) => Number(x.routine_id) !== Number(id))
    const sIds = db.sessions.filter((x) => Number(x.routine_id) === Number(id)).map((x) => Number(x.id))
    db.sessions = db.sessions.filter((x) => Number(x.routine_id) !== Number(id))
    db.workouts = db.workouts.filter((x) => !sIds.includes(Number(x.session_id)))
  })
}
export function reorderRoutines(order: number[]): Promise<unknown> {
  return mutate('reorderRoutines', { order }, (db) => {
    order.forEach((rid, i) => {
      const r = db.routines.find((x) => Number(x.id) === Number(rid))
      if (r) r.position = i
    })
  })
}

export function addRoutineExercise(payload: {
  routine_id: number
  exercise: string
  exercise_id: string | null
  default_sets: number | null
  default_reps: number | null
  notes: string | null
}): Promise<RoutineExercise> {
  return mutate<RoutineExercise>('addRoutineExercise', payload, (db) => {
    const re: RoutineExercise = {
      id: tmpId(),
      routine_id: payload.routine_id,
      exercise: payload.exercise,
      exercise_id: payload.exercise_id ?? null,
      default_sets: payload.default_sets ?? null,
      default_reps: payload.default_reps ?? null,
      notes: payload.notes ?? null,
      position: nextPosition(db.routineExercises.filter((x) => Number(x.routine_id) === Number(payload.routine_id))),
      superset_id: null
    }
    db.routineExercises.push(re)
    return re
  })
}
export function editRoutineExercise(payload: {
  id: number
  exercise?: string
  exercise_id?: string | null
  default_sets?: number | null
  default_reps?: number | null
  notes?: string | null
}): Promise<unknown> {
  return mutate('editRoutineExercise', payload, (db) => {
    const re = db.routineExercises.find((x) => Number(x.id) === Number(payload.id))
    if (!re) return
    if (payload.exercise !== undefined) re.exercise = payload.exercise
    if (payload.exercise_id !== undefined) re.exercise_id = payload.exercise_id ?? null
    if (payload.default_sets !== undefined) re.default_sets = payload.default_sets ?? null
    if (payload.default_reps !== undefined) re.default_reps = payload.default_reps ?? null
    if (payload.notes !== undefined) re.notes = payload.notes ?? null
  })
}
export function deleteRoutineExercise(id: number): Promise<unknown> {
  return mutate('deleteRoutineExercise', { id }, (db) => {
    db.routineExercises = db.routineExercises.filter((x) => Number(x.id) !== Number(id))
  })
}
export function reorderRoutineExercises(items: { id: number; position: number }[]): Promise<unknown> {
  return mutate('reorderRoutineExercises', { items }, (db) => {
    items.forEach(({ id, position }) => {
      const re = db.routineExercises.find((x) => Number(x.id) === Number(id))
      if (re) re.position = position
    })
  })
}
export function setSuperset(id1: number, id2: number): Promise<{ group_id: string }> {
  return mutate<{ group_id: string }>('setSuperset', { id1, id2 }, (db) => {
    const g = 'tmp-' + Math.abs(tmpId())
    db.routineExercises.forEach((x) => {
      if (Number(x.id) === Number(id1) || Number(x.id) === Number(id2)) x.superset_id = g
    })
    return { group_id: g }
  })
}
export function unsetSuperset(supersetId: string): Promise<unknown> {
  return mutate('unsetSuperset', { superset_id: supersetId }, (db) => {
    db.routineExercises.forEach((x) => {
      if (x.superset_id === supersetId) x.superset_id = null
    })
  })
}

export function startSession(routineId: number): Promise<{ session_id: number }> {
  return mutate<{ session_id: number }>('startSession', { routine_id: routineId })
}
export function saveSession(
  sessionId: number,
  workouts: { id: number; sets: number | null; reps: number | null; weight: number | null }[]
): Promise<unknown> {
  return mutate('saveSession', { session_id: sessionId, workouts }, (db) => {
    workouts.forEach((w) => {
      const x = db.workouts.find((y) => Number(y.id) === Number(w.id))
      if (x) {
        x.sets = w.sets
        x.reps = w.reps
        x.weight = w.weight
      }
    })
  })
}
export function updateSupersetGroup(
  sessionId: number,
  supersetId: string,
  sets: number | null,
  reps: number | null
): Promise<unknown> {
  return mutate('updateSupersetGroup', { session_id: sessionId, superset_id: supersetId, sets, reps }, (db) => {
    db.workouts.forEach((w) => {
      if (Number(w.session_id) === Number(sessionId) && w.superset_id === supersetId) {
        w.sets = sets
        w.reps = reps
      }
    })
  })
}
export function deleteSessionWorkout(workoutId: number): Promise<unknown> {
  return mutate('deleteSessionWorkout', { workout_id: workoutId }, (db) => {
    db.workouts = db.workouts.filter((x) => Number(x.id) !== Number(workoutId))
  })
}
export function deleteSession(sessionId: number): Promise<unknown> {
  return mutate('deleteSession', { session_id: sessionId }, (db) => {
    db.sessions = db.sessions.filter((x) => Number(x.id) !== Number(sessionId))
    db.workouts = db.workouts.filter((x) => Number(x.session_id) !== Number(sessionId))
  })
}
export function clearStats(): Promise<unknown> {
  return mutate('clearStats', {}, (db) => {
    db.sessions = []
    db.workouts = []
  })
}
