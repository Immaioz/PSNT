import * as store from '../store'
import { escapeHtml, formModal, confirmDialog, toast } from '../dom'
import { navigate, type Route } from '../router'
import { createExercisePicker } from '../exercises'
import type { RoutineExercise } from '../types'

function exerciseName(re: RoutineExercise): string {
  return store.displayName(re.exercise, re.exercise_id)
}

function exerciseLink(re: RoutineExercise): string {
  if (re.exercise_id) {
    return `<a class="ex-row__name" href="#/exercise/${encodeURIComponent(re.exercise_id)}">${escapeHtml(exerciseName(re))}</a>`
  }
  return `<span class="ex-row__name ex-row__name--plain">${escapeHtml(exerciseName(re))}</span>`
}

function rowHtml(re: RoutineExercise, index: number, total: number, inSuperset: boolean): string {
  return `
    <div class="ex-row" data-id="${re.id}">
      <div class="ex-row__main">
        ${exerciseLink(re)}
        <div class="ex-row__inputs">
          <label class="mini-field">Serie<input class="field__input field__input--mini inp-sets" type="number" min="0" step="1" value="${re.default_sets ?? ''}" /></label>
          <label class="mini-field">Reps<input class="field__input field__input--mini inp-reps" type="number" min="0" step="1" value="${re.default_reps ?? ''}" /></label>
          <label class="mini-field mini-field--grow">Note<input class="field__input field__input--mini inp-notes" type="text" value="${escapeHtml(re.notes || '')}" placeholder="opzionale" /></label>
        </div>
      </div>
      <div class="ex-row__actions">
        <button class="btn btn--icon" data-action="save" title="Salva modifiche">&#10003;</button>
        <button class="btn btn--icon" data-action="up" title="Sposta su" ${index === 0 ? 'disabled' : ''}>&#9650;</button>
        <button class="btn btn--icon" data-action="down" title="Sposta giù" ${index === total - 1 ? 'disabled' : ''}>&#9660;</button>
        ${
          inSuperset
            ? `<button class="btn btn--ghost btn--sm" data-action="unsuperset">Rompî superset</button>`
            : `<button class="btn btn--ghost btn--sm" data-action="superset" title="Unisci al prossimo" ${index === total - 1 ? 'disabled' : ''}>Superset</button>`
        }
        <button class="btn btn--icon btn--danger-ghost" data-action="delete" title="Elimina">&#128465;</button>
      </div>
    </div>`
}

function groupedHtml(list: RoutineExercise[], total: number): string {
  let html = ''
  let i = 0
  while (i < list.length) {
    const re = list[i]
    if (re.superset_id) {
      const group: RoutineExercise[] = []
      while (i < list.length && list[i].superset_id === re.superset_id) {
        group.push(list[i])
        i++
      }
      html += `<div class="superset"><div class="superset__label">Superset</div>`
      group.forEach((g, gi) => {
        const index = list.indexOf(g)
        html += rowHtml(g, index, total, true)
        if (gi < group.length - 1) html += `<div class="superset__link"></div>`
      })
      html += `</div>`
    } else {
      html += rowHtml(re, i, total, false)
      i++
    }
  }
  return html
}

export function renderRoutine(root: HTMLElement, route: Route): void {
  if (route.name !== 'routine') return
  const routine = store.routineById(route.id)
  if (!routine) {
    root.innerHTML = `<div class="empty">Routine non trovata. <a href="#/">Torna alla dashboard</a></div>`
    return
  }
  const exercises = store.routineExercisesFor(routine.id)

  root.innerHTML = `
    <div class="page-head">
      <div>
        <a class="back" href="#/">&larr; Dashboard</a>
        <h1 class="page-title">${escapeHtml(routine.name)}</h1>
        <p class="page-sub">${exercises.length} esercizi</p>
      </div>
      <div class="page-actions">
        <button class="btn btn--primary" data-action="start">Avvia sessione</button>
      </div>
    </div>

    <div class="card add-exercise">
      <h3 class="card__title">Aggiungi esercizio</h3>
      <div class="add-form">
        <div class="add-form__picker" data-picker></div>
        <label class="mini-field">Serie<input class="field__input field__input--mini add-sets" type="number" min="0" step="1" placeholder="3" /></label>
        <label class="mini-field">Reps<input class="field__input field__input--mini add-reps" type="number" min="0" step="1" placeholder="10" /></label>
        <label class="mini-field mini-field--grow">Note<input class="field__input field__input--mini add-notes" type="text" placeholder="opzionale" /></label>
        <button class="btn btn--primary" data-action="add">+ Aggiungi</button>
      </div>
    </div>

    <div class="exercise-list">
      ${
        exercises.length === 0
          ? `<div class="empty">Nessun esercizio. Aggiungine uno qui sopra.</div>`
          : groupedHtml(exercises, exercises.length)
      }
    </div>`

  const picker = createExercisePicker({ placeholder: 'Cerca esercizio (es. panca, squat...) oppure *petto' })
  root.querySelector('[data-picker]')?.appendChild(picker.element)

  const setsInput = root.querySelector('.add-sets') as HTMLInputElement
  const repsInput = root.querySelector('.add-reps') as HTMLInputElement
  const notesInput = root.querySelector('.add-notes') as HTMLInputElement

  async function addExercise(): Promise<void> {
    const value = picker.get()
    if (!value.name) {
      toast('Scegli o digita un esercizio', 'error')
      return
    }
    try {
      await store.addRoutineExercise({
        routine_id: routine!.id,
        exercise: value.name,
        exercise_id: value.id,
        default_sets: setsInput.value === '' ? null : Number(setsInput.value),
        default_reps: repsInput.value === '' ? null : Number(repsInput.value),
        notes: notesInput.value.trim() || null
      })
      toast('Esercizio aggiunto')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  root.querySelector('[data-action="start"]')?.addEventListener('click', async () => {
    try {
      const res = await store.startSession(routine.id)
      navigate(`session/${res.session_id}`)
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  })

  root.querySelector('[data-action="add"]')?.addEventListener('click', () => void addExercise())
  notesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void addExercise()
  })

  root.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    if (action === 'add' || action === 'start') return
    const row = btn.closest<HTMLElement>('.ex-row')
    if (!row) return
    const id = Number(row.dataset.id)
    const current = store.routineExercisesFor(routine.id)
    const index = current.findIndex((r) => r.id === id)
    if (index < 0) return
    const re = current[index]

    try {
      if (action === 'save') {
        const sets = (row.querySelector('.inp-sets') as HTMLInputElement).value
        const reps = (row.querySelector('.inp-reps') as HTMLInputElement).value
        const notes = (row.querySelector('.inp-notes') as HTMLInputElement).value
        await store.editRoutineExercise({
          id,
          default_sets: sets === '' ? null : Number(sets),
          default_reps: reps === '' ? null : Number(reps),
          notes: notes.trim() || null
        })
        toast('Salvato')
      } else if (action === 'up' && index > 0) {
        await swapPositions(current, index, index - 1)
      } else if (action === 'down' && index < current.length - 1) {
        await swapPositions(current, index, index + 1)
      } else if (action === 'delete') {
        const ok = await confirmDialog(`Rimuovere "${exerciseName(re)}" dalla routine?`, {
          danger: true,
          submitLabel: 'Rimuovi'
        })
        if (!ok) return
        await store.deleteRoutineExercise(id)
        toast('Esercizio rimosso')
      } else if (action === 'superset') {
        const next = current[index + 1]
        if (!next) return
        await store.setSuperset(re.id, next.id)
        toast('Superset creato')
      } else if (action === 'unsuperset') {
        if (!re.superset_id) return
        await store.unsetSuperset(re.superset_id)
        toast('Superset rimosso')
      }
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  })
}

async function swapPositions(list: RoutineExercise[], a: number, b: number): Promise<void> {
  const ids = list.map((r) => r.id)
  ;[ids[a], ids[b]] = [ids[b], ids[a]]
  await store.reorderRoutineExercises(ids.map((id, i) => ({ id, position: i + 1 })))
}

export function editRoutineExerciseModal(re: RoutineExercise): Promise<void> {
  return formModal({
    title: 'Modifica esercizio',
    fields: [
      { name: 'sets', label: 'Serie', type: 'number', value: re.default_sets ?? '', min: 0 },
      { name: 'reps', label: 'Reps', type: 'number', value: re.default_reps ?? '', min: 0 },
      { name: 'notes', label: 'Note', value: re.notes ?? '' }
    ]
  }).then(async (res) => {
    if (!res) return
    await store.editRoutineExercise({
      id: re.id,
      default_sets: res.sets === '' ? null : Number(res.sets),
      default_reps: res.reps === '' ? null : Number(res.reps),
      notes: res.notes.trim() || null
    })
    toast('Salvato')
  })
}
