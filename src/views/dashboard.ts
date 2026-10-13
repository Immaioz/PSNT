import * as store from '../store'
import { escapeHtml, formModal, confirmDialog, toast, formatDate } from '../dom'
import { navigate, type Route } from '../router'
import type { Routine } from '../types'

function routineCard(r: Routine, index: number, total: number): string {
  const exercises = store.routineExercisesFor(r.id)
  const sessions = store.sessionsForRoutine(r.id)
  const last = sessions[0]
  return `
    <div class="card routine-card" data-id="${r.id}">
      <div class="routine-card__main">
        <h3 class="routine-card__name">${escapeHtml(r.name)}</h3>
        <div class="routine-card__meta">
          <span class="chip">${exercises.length} esercizi</span>
          <span class="chip">${sessions.length} sessioni</span>
          ${last ? `<span class="chip chip--muted">Ultima: ${escapeHtml(formatDate(last.date))}</span>` : ''}
        </div>
      </div>
      <div class="routine-card__actions">
        <button class="btn btn--primary btn--sm" data-action="start">Avvia</button>
        <button class="btn btn--ghost btn--sm" data-action="manage">Gestisci</button>
        <div class="menu">
          <button class="btn btn--icon" data-action="toggle-menu" aria-label="Altre azioni">&#8942;</button>
          <div class="menu__list" hidden>
            <button data-action="rename">Rinomina</button>
            <button data-action="up" ${index === 0 ? 'disabled' : ''}>Sposta su</button>
            <button data-action="down" ${index === total - 1 ? 'disabled' : ''}>Sposta giù</button>
            <button data-action="delete" class="menu__danger">Elimina</button>
          </div>
        </div>
      </div>
    </div>`
}

export function renderDashboard(root: HTMLElement, _route: Route): void {
  const routines = store.routines()
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">Le tue routine</h1>
        <p class="page-sub">${routines.length} routine</p>
      </div>
      <div class="page-actions">
        <button class="btn btn--ghost" data-action="stats">Statistiche</button>
        <button class="btn btn--primary" data-action="add-routine">+ Nuova routine</button>
      </div>
    </div>
    <div class="grid">
      ${
        routines.length === 0
          ? `<div class="empty">Nessuna routine ancora. Crea la tua prima routine per iniziare.</div>`
          : routines.map((r, i) => routineCard(r, i, routines.length)).join('')
      }
    </div>`

  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const addBtn = target.closest('[data-action="add-routine"]')
    if (addBtn) {
      void addRoutine()
      return
    }
    const statsBtn = target.closest('[data-action="stats"]')
    if (statsBtn) {
      navigate('stats')
      return
    }

    const menuToggle = target.closest('[data-action="toggle-menu"]')
    if (menuToggle) {
      const list = menuToggle.nextElementSibling as HTMLElement | null
      if (list) list.hidden = !list.hidden
      return
    }

    const actionEl = target.closest('[data-action]') as HTMLElement | null
    if (!actionEl) {
      root.querySelectorAll<HTMLElement>('.menu__list').forEach((m) => (m.hidden = true))
      return
    }
    const card = actionEl.closest<HTMLElement>('.routine-card')
    if (!card) return
    const id = Number(card.dataset.id)
    const routine = store.routineById(id)
    if (!routine) return

    const action = actionEl.dataset.action
    switch (action) {
      case 'start':
        void startRoutine(id)
        break
      case 'manage':
        navigate(`routine/${id}`)
        break
      case 'rename':
        void rename(routine)
        break
      case 'up':
        void move(id, -1)
        break
      case 'down':
        void move(id, 1)
        break
      case 'delete':
        void remove(routine)
        break
    }
  })
}

async function addRoutine(): Promise<void> {
  const res = await formModal({
    title: 'Nuova routine',
    fields: [{ name: 'name', label: 'Nome routine', required: true, autofocus: true }],
    submitLabel: 'Crea'
  })
  if (!res || !res.name) return
  try {
    await store.createRoutine(res.name)
    toast('Routine creata')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function rename(routine: Routine): Promise<void> {
  const res = await formModal({
    title: 'Rinomina routine',
    fields: [{ name: 'name', label: 'Nome routine', value: routine.name, required: true, autofocus: true }],
    submitLabel: 'Salva'
  })
  if (!res || !res.name || res.name === routine.name) return
  try {
    await store.renameRoutine(routine.id, res.name)
    toast('Routine rinominata')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function move(id: number, delta: number): Promise<void> {
  const list = store.routines().map((r) => r.id)
  const index = list.indexOf(id)
  const swap = index + delta
  if (index < 0 || swap < 0 || swap >= list.length) return
  ;[list[index], list[swap]] = [list[swap], list[index]]
  try {
    await store.reorderRoutines(list)
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function remove(routine: Routine): Promise<void> {
  const ok = await confirmDialog(`Eliminare "${routine.name}" e tutte le sue sessioni?`, {
    danger: true,
    submitLabel: 'Elimina'
  })
  if (!ok) return
  try {
    await store.deleteRoutine(routine.id)
    toast('Routine eliminata')
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}

async function startRoutine(id: number): Promise<void> {
  try {
    const res = await store.startSession(id)
    navigate(`session/${res.session_id}`)
  } catch (err) {
    toast((err as Error).message, 'error')
  }
}
