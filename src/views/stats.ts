import * as store from '../store'
import { escapeHtml, confirmDialog, toast, formatDate } from '../dom'
import type { Route } from '../router'
import type { Workout } from '../types'

interface ExStat {
  key: string
  name: string
  lastWeight: number | null
  lastDate: string
  pr: number | null
  sessions: number
}

function exerciseKey(w: Workout): string {
  return w.exercise_id ? `id:${w.exercise_id}` : `name:${w.exercise.toLowerCase()}`
}

function computeStats(routineId: number): ExStat[] {
  const sessions = store.sessionsForRoutine(routineId).slice().sort((a, b) => (a.date < b.date ? -1 : 1))
  const map = new Map<string, ExStat>()
  for (const s of sessions) {
    const workouts = store.workoutsForSession(s.id)
    for (const w of workouts) {
      const key = exerciseKey(w)
      let stat = map.get(key)
      if (!stat) {
        stat = { key, name: store.displayName(w.exercise, w.exercise_id), lastWeight: null, lastDate: '', pr: null, sessions: 0 }
        map.set(key, stat)
      }
      stat.sessions += 1
      if (w.weight !== null && w.weight !== undefined) {
        stat.lastWeight = Number(w.weight)
        stat.lastDate = s.date
        stat.pr = stat.pr === null ? Number(w.weight) : Math.max(stat.pr, Number(w.weight))
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

interface Point {
  label: string
  value: number
}

function historyFor(routineId: number, key: string): Point[] {
  const sessions = store.sessionsForRoutine(routineId).slice().sort((a, b) => (a.date < b.date ? -1 : 1))
  const points: Point[] = []
  for (const s of sessions) {
    for (const w of store.workoutsForSession(s.id)) {
      if (exerciseKey(w) === key && w.weight !== null && w.weight !== undefined) {
        points.push({ label: formatDate(s.date), value: Number(w.weight) })
      }
    }
  }
  return points
}

function svgChart(points: Point[]): string {
  if (points.length === 0) return `<div class="chart__empty">Nessun dato di peso registrato.</div>`
  const width = 640
  const height = 220
  const padL = 44
  const padR = 16
  const padT = 16
  const padB = 34
  const values = points.map((p) => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 5
    max += 5
  }
  const range = max - min
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const x = (i: number): number => (points.length === 1 ? padL + innerW / 2 : padL + (i / (points.length - 1)) * innerW)
  const y = (v: number): number => padT + (1 - (v - min) / range) * innerH

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${padL},${padT + innerH} ${line} ${x(points.length - 1).toFixed(1)},${padT + innerH}`
  const dots = points
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" class="chart__dot"><title>${escapeHtml(p.label)}: ${p.value} kg</title></circle>`)
    .join('')

  const gridLines = 4
  let grid = ''
  for (let g = 0; g <= gridLines; g++) {
    const gy = padT + (g / gridLines) * innerH
    const val = max - (g / gridLines) * range
    grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${width - padR}" y2="${gy.toFixed(1)}" class="chart__grid" />`
    grid += `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" class="chart__axis" text-anchor="end">${val.toFixed(0)}</text>`
  }

  const first = points[0]
  const last = points[points.length - 1]

  return `
    <svg class="chart__svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
      ${grid}
      <polygon points="${area}" class="chart__area" />
      <polyline points="${line}" class="chart__line" />
      ${dots}
      <text x="${padL}" y="${height - 10}" class="chart__axis" text-anchor="start">${escapeHtml(first.label)}</text>
      <text x="${width - padR}" y="${height - 10}" class="chart__axis" text-anchor="end">${escapeHtml(last.label)}</text>
    </svg>`
}

function routineSection(routineId: number, name: string): string {
  const stats = computeStats(routineId)
  if (stats.length === 0) {
    return `
      <div class="card stats-card">
        <h3 class="card__title">${escapeHtml(name)}</h3>
        <div class="empty">Nessun dato registrato.</div>
      </div>`
  }
  const withData = stats.filter((s) => s.pr !== null)
  const options = withData
    .map((s) => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.name)}</option>`)
    .join('')

  const rows = stats
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td class="num">${s.lastWeight !== null ? s.lastWeight + ' kg' : '—'}</td>
        <td class="num">${s.pr !== null ? s.pr + ' kg' : '—'}</td>
        <td class="num">${s.sessions}</td>
      </tr>`
    )
    .join('')

  return `
    <div class="card stats-card" data-routine="${routineId}">
      <h3 class="card__title">${escapeHtml(name)}</h3>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Esercizio</th><th class="num">Ultimo peso</th><th class="num">PR</th><th class="num">Sessioni</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${
        withData.length
          ? `<div class="chart-head">
               <label class="mini-field">Grafico peso — <select class="field__input field__input--mini chart-select">${options}</select></label>
             </div>
             <div class="chart" data-chart></div>`
          : ''
      }
    </div>`
}

function drawChart(card: HTMLElement, routineId: number, key: string): void {
  const target = card.querySelector<HTMLElement>('[data-chart]')
  if (!target) return
  target.innerHTML = svgChart(historyFor(routineId, key))
}

export function renderStats(root: HTMLElement, _route: Route): void {
  const routines = store.routines()
  root.innerHTML = `
    <div class="page-head">
      <div>
        <a class="back" href="#/">&larr; Dashboard</a>
        <h1 class="page-title">Statistiche</h1>
        <p class="page-sub">Progressi per routine</p>
      </div>
      <div class="page-actions">
        <button class="btn btn--ghost btn--danger-ghost" data-action="reset">Reset statistiche</button>
      </div>
    </div>
    ${
      routines.length === 0
        ? `<div class="empty">Nessuna routine. Crea una routine per iniziare a tracciare i progressi.</div>`
        : routines.map((r) => routineSection(r.id, r.name)).join('')
    }`

  root.querySelectorAll<HTMLElement>('.stats-card[data-routine]').forEach((card) => {
    const routineId = Number(card.dataset.routine)
    const select = card.querySelector<HTMLSelectElement>('.chart-select')
    if (select && select.value) {
      drawChart(card, routineId, select.value)
      select.addEventListener('change', () => drawChart(card, routineId, select.value))
    }
  })

  root.querySelector('[data-action="reset"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog('Eliminare tutte le sessioni, i workout e le statistiche? L\'operazione è irreversibile.', {
      danger: true,
      submitLabel: 'Reset'
    })
    if (!ok) return
    try {
      await store.clearStats()
      toast('Statistiche azzerate')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  })
}
