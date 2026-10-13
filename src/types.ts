export interface Routine {
  id: number
  name: string
  position: number
  created_at: string | null
}

export interface RoutineExercise {
  id: number
  routine_id: number
  exercise: string
  exercise_id: string | null
  default_sets: number | null
  default_reps: number | null
  notes: string | null
  position: number
  superset_id: string | null
}

export interface Session {
  id: number
  routine_id: number
  date: string
  created_at: string | null
}

export interface Workout {
  id: number
  session_id: number
  exercise: string
  exercise_id: string | null
  sets: number | null
  reps: number | null
  weight: number | null
  notes: string | null
  position: number
  superset_id: string | null
  created_at: string | null
}

export interface DbData {
  routines: Routine[]
  routineExercises: RoutineExercise[]
  sessions: Session[]
  workouts: Workout[]
}

export interface Exercise {
  id: string
  name: string
  name_it: string
  body_part: string
  body_part_it: string
  target: string
  target_it: string
  equipment: string
  equipment_it: string
  secondary_muscles: string[]
  image: string
  gif_url: string
  instructions_it: string
  steps_it: string[]
  attribution: string
}
