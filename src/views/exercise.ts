import { exerciseById } from '../store'
import { escapeHtml } from '../dom'
import { assetUrl } from '../config'
import type { Route } from '../router'

export function renderExercise(root: HTMLElement, route: Route): void {
  if (route.name !== 'exercise') return
  const ex = exerciseById(route.id)
  const back = `<a class="back" href="#/">&larr; Dashboard</a>`

  if (!ex) {
    root.innerHTML = `
      <div class="page-head"><div>${back}<h1 class="page-title">${escapeHtml(route.id)}</h1></div></div>
      <div class="card"><div class="empty">Dettagli non disponibili per questo esercizio.</div></div>`
    return
  }

  const gif = assetUrl(ex.gif_url)
  const badges = [
    ex.body_part_it ? `<span class="badge badge--primary">${escapeHtml(ex.body_part_it)}</span>` : '',
    ex.target_it ? `<span class="badge badge--green">${escapeHtml(ex.target_it)}</span>` : '',
    ex.equipment_it ? `<span class="badge badge--amber">${escapeHtml(ex.equipment_it)}</span>` : ''
  ]
    .filter(Boolean)
    .join('')

  const secondary = (ex.secondary_muscles || [])
    .map((m) => `<span class="chip">${escapeHtml(m)}</span>`)
    .join('')

  const steps = (ex.steps_it || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')

  root.innerHTML = `
    <div class="page-head">
      <div>
        ${back}
        <h1 class="page-title">${escapeHtml(ex.name_it || ex.name)}</h1>
        ${ex.name_it && ex.name_it !== ex.name ? `<p class="page-sub">${escapeHtml(ex.name)}</p>` : ''}
      </div>
    </div>
    <div class="card exercise-detail">
      <div class="exercise-detail__top">
        ${gif ? `<div class="exercise-detail__media"><img class="exercise-gif" src="${escapeHtml(gif)}" alt="${escapeHtml(ex.name)}" loading="lazy" /></div>` : ''}
        <div class="exercise-detail__info">
          <div class="badges">${badges}</div>
          ${secondary ? `<div class="exercise-detail__secondary"><strong>Muscoli secondari:</strong> ${secondary}</div>` : ''}
        </div>
      </div>

      ${
        ex.instructions_it
          ? `<section class="exercise-detail__section"><h4>Istruzioni</h4><p>${escapeHtml(ex.instructions_it)}</p></section>`
          : ''
      }

      ${steps ? `<section class="exercise-detail__section"><h4>Passi</h4><ol class="steps">${steps}</ol></section>` : ''}

      ${ex.attribution ? `<p class="attribution">${escapeHtml(ex.attribution)}</p>` : ''}
    </div>`
}
