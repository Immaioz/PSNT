import { allExercises, exerciseById } from './store'
import type { Exercise } from './types'
import { escapeHtml } from './dom'
import { assetUrl } from './config'

export function searchExercises(query: string, limit = 50): Exercise[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const list = allExercises()
  if (q.startsWith('*')) {
    const bpq = q.slice(1).trim()
    if (!bpq) return []
    return list
      .filter(
        (e) =>
          (e.body_part || '').toLowerCase().includes(bpq) ||
          (e.body_part_it || '').toLowerCase().includes(bpq)
      )
      .slice(0, limit)
  }
  const scored: { e: Exercise; score: number }[] = []
  for (const e of list) {
    const en = (e.name || '').toLowerCase()
    const it = (e.name_it || '').toLowerCase()
    let score = -1
    if (en.startsWith(q) || it.startsWith(q)) score = 0
    else if (en.includes(q) || it.includes(q)) score = 1
    if (score >= 0) scored.push({ e, score })
  }
  scored.sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name))
  return scored.slice(0, limit).map((s) => s.e)
}

export interface PickerValue {
  name: string
  id: string | null
}

export interface ExercisePicker {
  element: HTMLElement
  get(): PickerValue
  clear(): void
  set(exercise: Exercise): void
}

export function createExercisePicker(options: {
  name?: string
  exerciseId?: string | null
  placeholder?: string
}): ExercisePicker {
  let selectedId: string | null = options.exerciseId ?? null
  let selectedName = options.name || ''
  let debounceTimer: number | undefined
  let results: Exercise[] = []
  let activeIndex = -1

  const wrapper = document.createElement('div')
  wrapper.className = 'ac'
  wrapper.innerHTML = `
    <input class="field__input ac__input" type="text" autocomplete="off"
      placeholder="${escapeHtml(options.placeholder || 'Cerca esercizio...')}"
      value="${escapeHtml(options.name || '')}" />
    <div class="ac__dropdown" hidden></div>
    <div class="ac__selected" hidden>
      <img class="ac__thumb" alt="" />
      <div class="ac__info">
        <a class="ac__link" href="#" target="_blank" rel="noopener"></a>
        <div class="ac__meta"></div>
      </div>
      <button type="button" class="ac__clear" aria-label="Rimuovi">&times;</button>
    </div>`

  const input = wrapper.querySelector('.ac__input') as HTMLInputElement
  const dropdown = wrapper.querySelector('.ac__dropdown') as HTMLDivElement
  const selected = wrapper.querySelector('.ac__selected') as HTMLDivElement
  const thumb = wrapper.querySelector('.ac__thumb') as HTMLImageElement
  const link = wrapper.querySelector('.ac__link') as HTMLAnchorElement
  const meta = wrapper.querySelector('.ac__meta') as HTMLDivElement
  const clearBtn = wrapper.querySelector('.ac__clear') as HTMLButtonElement

  function assetImage(rel: string): string {
    return assetUrl(rel)
  }

  function showSelected(ex: Exercise): void {
    const img = assetImage(ex.image)
    thumb.src = img
    thumb.style.display = img ? '' : 'none'
    const nameIt = ex.name_it || ex.name
    link.textContent = nameIt !== ex.name ? `${nameIt} (${ex.name})` : nameIt
    link.href = `#/exercise/${encodeURIComponent(ex.id)}`
    let m = ex.body_part_it || ex.body_part || ''
    if (ex.target_it || ex.target) m += (m ? ' · ' : '') + (ex.target_it || ex.target)
    if (ex.equipment_it || ex.equipment) m += (m ? ' · ' : '') + (ex.equipment_it || ex.equipment)
    meta.textContent = m
    selected.hidden = false
  }

  function selectExercise(ex: Exercise): void {
    selectedId = String(ex.id)
    selectedName = ex.name_it || ex.name
    input.value = selectedName
    showSelected(ex)
    closeDropdown()
  }

  function closeDropdown(): void {
    dropdown.hidden = true
    dropdown.innerHTML = ''
    results = []
    activeIndex = -1
  }

  function renderDropdown(): void {
    if (results.length === 0) {
      dropdown.innerHTML = `<div class="ac__item ac__item--empty">Nessun risultato — puoi digitare un nome libero</div>`
      dropdown.hidden = false
      return
    }
    dropdown.innerHTML = results
      .map((ex, i) => {
        const nameIt = ex.name_it || ex.name
        const label =
          nameIt !== ex.name
            ? `${escapeHtml(nameIt)} <span class="ac__muted">(${escapeHtml(ex.name)})</span>`
            : escapeHtml(nameIt)
        return `<div class="ac__item" data-index="${i}">
          ${ex.image ? `<img class="ac__thumb" src="${escapeHtml(assetImage(ex.image))}" alt="" loading="lazy" />` : ''}
          <div class="ac__item-info">
            <div class="ac__item-name">${label}</div>
            <div class="ac__item-meta">${escapeHtml(ex.body_part_it || ex.body_part || '')}${
              ex.target_it || ex.target ? ` · ${escapeHtml(ex.target_it || ex.target)}` : ''
            }</div>
          </div>
        </div>`
      })
      .join('')
    dropdown.hidden = false
    dropdown.querySelectorAll<HTMLElement>('.ac__item').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const idx = Number(el.dataset.index)
        if (results[idx]) selectExercise(results[idx])
      })
    })
  }

  input.addEventListener('input', () => {
    if (selectedId && input.value !== selectedName) {
      selectedId = null
      selected.hidden = true
    }
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer)
    const q = input.value.trim()
    if (q.length < 1) {
      closeDropdown()
      return
    }
    debounceTimer = window.setTimeout(() => {
      results = searchExercises(q)
      activeIndex = -1
      renderDropdown()
    }, 200)
  })

  input.addEventListener('keydown', (e) => {
    if (dropdown.hidden) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex = Math.min(activeIndex + 1, results.length - 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex = Math.max(activeIndex - 1, 0)
      highlight()
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      if (results[activeIndex]) selectExercise(results[activeIndex])
    } else if (e.key === 'Escape') {
      closeDropdown()
    }
  })

  input.addEventListener('focus', () => {
    if (results.length > 0) dropdown.hidden = false
  })

  function highlight(): void {
    dropdown.querySelectorAll<HTMLElement>('.ac__item').forEach((el, i) => {
      el.classList.toggle('ac__item--active', i === activeIndex)
    })
  }

  clearBtn.addEventListener('click', () => {
    selectedId = null
    selectedName = ''
    selected.hidden = true
    input.value = ''
    input.focus()
  })

  if (selectedId) {
    const ex = exerciseById(selectedId)
    if (ex) showSelected(ex)
  }

  return {
    element: wrapper,
    get(): PickerValue {
      return { name: input.value.trim(), id: selectedId }
    },
    clear(): void {
      selectedId = null
      selectedName = ''
      selected.hidden = true
      input.value = ''
    },
    set(exercise: Exercise): void {
      selectExercise(exercise)
    }
  }
}
