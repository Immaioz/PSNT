import * as store from '../store'
import { escapeHtml, confirmDialog, toast, formatDateLong } from '../dom'
import { navigate, type Route } from '../router'
import type { Workout } from '../types'

interface Group {
  supersetId: string | null
  workouts: Workout[]
}

function groupWorkouts(workouts: Workout[]): Group[] {
  const groups: Group[] = []
  for (const w of workouts) {
    const last = groups[groups.length - 1]
    if (w.superset_id && last && last.supersetId === w.superset_id) {
      last.workouts.push(w)
    } else {
      groups.push({ supersetId: w.superset_id || null, workouts: [w] })
    }
  }
  return groups
}

function workoutName(w: Workout): string {
  return store.displayName(w.exercise, w.exercise_id)
}

function nameEl(w: Workout): string {
  const label = escapeHtml(workoutName(w))
  if (w.exercise_id) {
    return `<a class="workout__name" href="#/exercise/${encodeURIComponent(w.exercise_id)}">${label}</a>`
  }
  return `<span class="workout__name">${label}</span>`
}

function weightControl(w: Workout): string {
  return `
    <div class="weight">
      <button type="button" class="weight__btn" data-action="wminus" data-wid="${w.id}" aria-label="Meno 2,5 kg">&minus;</button>
      <input class="field__input weight__input inp-weight" type="number" step="2.5" min="0" value="${w.weight ?? ''}" placeholder="kg" data-wid="${w.id}" />
      <button type="button" class="weight__btn" data-action="wplus" data-wid="${w.id}" aria-label="Più 2,5 kg">+</button>
    </div>`
}

function rowHtml(w: Workout): string {
  return `
    <div class="workout" data-wid="${w.id}">
      <div class="workout__head">
        ${nameEl(w)}
        <button type="button" class="btn btn--icon btn--danger-ghost" data-action="del-workout" data-wid="${w.id}" title="Elimina esercizio">&#10005;</button>
      </div>
      <div class="workout__grid">
        <label class="mini-field">Serie<input class="field__input field__input--mini inp-sets" type="number" min="0" step="1" value="${w.sets ?? ''}" /></label>
        <label class="mini-field">Reps<input class="field__input field__input--mini inp-reps" type="number" min="0" step="1" value="${w.reps ?? ''}" /></label>
        <div class="mini-field">Peso (kg)${weightControl(w)}</div>
      </div>
      ${w.notes ? `<div class="workout__notes">${escapeHtml(w.notes)}</div>` : ''}
    </div>`
}

function supersetHtml(group: Group): string {
  const first = group.workouts[0]
  const names = group.workouts.map((w) => nameEl(w)).join('<span class="superset__plus">+</span>')
  const members = group.workouts
    .map(
      (w) => `
      <div class="superset__member" data-wid="${w.id}">
        <div class="superset__member-head">
          ${nameEl(w)}
          <button type="button" class="btn btn--icon btn--danger-ghost" data-action="del-workout" data-wid="${w.id}" title="Elimina esercizio">&#10005;</button>
        </div>
        <div class="mini-field">Peso (kg)${weightControl(w)}</div>
        ${w.notes ? `<div class="workout__notes">${escapeHtml(w.notes)}</div>` : ''}
      </div>`
    )
    .join('')

  return `
    <div class="superset superset--session">
      <div class="superset__label">Superset</div>
      <div class="superset__names">${names}</div>
      <div class="superset__shared">
        <label class="mini-field">Serie<input class="field__input field__input--mini grp-sets" type="number" min="0" step="1" value="${first.sets ?? ''}" /></label>
        <label class="mini-field">Reps<input class="field__input field__input--mini grp-reps" type="number" min="0" step="1" value="${first.reps ?? ''}" /></label>
      </div>
      <div class="superset__members">${members}</div>
    </div>`
}

export function renderSession(root: HTMLElement, route: Route): void {
  if (route.name !== 'session') return
  const session = store.sessionById(route.id)
  if (!session) {
    root.innerHTML = `<div class="empty">Sessione non trovata. <a href="#/">Torna alla dashboard</a></div>`
    return
  }
  const routine = store.routineById(session.routine_id)
  const workouts = store.workoutsForSession(session.id)
  const groups = groupWorkouts(workouts)

  root.innerHTML = `
    <div class="page-head">
      <div>
        <a class="back" href="#/">&larr; Dashboard</a>
        <h1 class="page-title">${escapeHtml(routine ? routine.name : 'Sessione')}</h1>
        <p class="page-sub">${escapeHtml(formatDateLong(session.date))}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn--ghost" data-action="del-session">Elimina sessione</button>
      </div>
    </div>

    <div class="session-list">
      ${
        workouts.length === 0
          ? `<div class="empty">Nessun esercizio in questa sessione.</div>`
          : groups
              .map((g) => (g.supersetId ? supersetHtml(g) : rowHtml(g.workouts[0])))
              .join('')
      }
    </div>

    ${
      workouts.length
        ? `<div class="session-footer">
            <button class="btn btn--ghost" data-action="save">Salva</button>
            <button class="btn btn--primary" data-action="save-close">Salva e concludi</button>
          </div>`
        : ''
    }`

  function collect(): { id: number; sets: number | null; reps: number | null; weight: number | null }[] {
    const result: { id: number; sets: number | null; reps: number | null; weight: number | null }[] = []
    root.querySelectorAll<HTMLElement>('.superset--session').forEach((grp) => {
      const setsEl = grp.querySelector('.grp-sets') as HTMLInputElement
      const repsEl = grp.querySelector('.grp-reps') as HTMLInputElement
      const sets = setsEl.value === '' ? null : Number(setsEl.value)
      const reps = repsEl.value === '' ? null : Number(repsEl.value)
      grp.querySelectorAll<HTMLElement>('.superset__member').forEach((member) => {
        const wid = Number(member.dataset.wid)
        const weightEl = member.querySelector('.inp-weight') as HTMLInputElement
        result.push({ id: wid, sets, reps, weight: weightEl.value === '' ? null : Number(weightEl.value) })
      })
    })
    root.querySelectorAll<HTMLElement>('.workout[data-wid]').forEach((row) => {
      const wid = Number(row.dataset.wid)
      const setsEl = row.querySelector('.inp-sets') as HTMLInputElement
      const repsEl = row.querySelector('.inp-reps') as HTMLInputElement
      const weightEl = row.querySelector('.inp-weight') as HTMLInputElement
      result.push({
        id: wid,
        sets: setsEl.value === '' ? null : Number(setsEl.value),
        reps: repsEl.value === '' ? null : Number(repsEl.value),
        weight: weightEl.value === '' ? null : Number(weightEl.value)
      })
    })
    return result
  }

  async function save(): Promise<void> {
    try {
      await store.saveSession(session!.id, collect())
      toast('Sessione salvata')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  root.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const btn = target.closest<HTMLElement>('[data-action]')

    if (!btn) return
    const action = btn.dataset.action

    if (action === 'wplus' || action === 'wminus') {
      e.preventDefault()
      const wid = Number(btn.dataset.wid)
      const input = root.querySelector<HTMLInputElement>(`.inp-weight[data-wid="${wid}"]`)
      if (!input) return
      const current = input.value === '' ? 0 : Number(input.value)
      const next = Math.max(0, current + (action === 'wplus' ? 2.5 : -2.5))
      input.value = String(next)
      return
    }

    if (action === 'save') {
      await save()
      return
    }
    if (action === 'save-close') {
      await save()
      navigate('')
      return
    }
    if (action === 'del-workout') {
      const wid = Number(btn.dataset.wid)
      const ok = await confirmDialog('Rimuovere questo esercizio dalla sessione?', {
        danger: true,
        submitLabel: 'Rimuovi'
      })
      if (!ok) return
      try {
        await store.deleteSessionWorkout(wid)
      } catch (err) {
        toast((err as Error).message, 'error')
      }
      return
    }
    if (action === 'del-session') {
      const ok = await confirmDialog('Eliminare questa sessione e tutti i suoi dati?', {
        danger: true,
        submitLabel: 'Elimina'
      })
      if (!ok) return
      try {
        await store.deleteSession(session.id)
        toast('Sessione eliminata')
        navigate('')
      } catch (err) {
        toast((err as Error).message, 'error')
      }
    }
  })
}
