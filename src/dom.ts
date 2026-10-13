export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector)
}

export function qsa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector))
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): (...args: A) => void {
  let timer: number | undefined
  return (...args: A) => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), wait)
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T00:00:00' : iso)
  if (isNaN(d.getTime())) return iso
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T00:00:00' : iso)
  if (isNaN(d.getTime())) return iso
  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
  const months = [
    'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
  ]
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export function toast(message: string, type: 'ok' | 'error' = 'ok'): void {
  const root = document.getElementById('toast-root') ?? document.body
  const node = document.createElement('div')
  node.className = `toast toast--${type}`
  node.textContent = message
  root.appendChild(node)
  requestAnimationFrame(() => node.classList.add('toast--show'))
  window.setTimeout(() => {
    node.classList.remove('toast--show')
    window.setTimeout(() => node.remove(), 250)
  }, 2800)
}

export interface ModalField {
  name: string
  label: string
  type?: 'text' | 'number'
  value?: string | number | null
  placeholder?: string
  min?: number
  step?: number
  required?: boolean
  autofocus?: boolean
}

export function formModal(options: {
  title: string
  fields: ModalField[]
  submitLabel?: string
  danger?: boolean
}): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    const fieldsHtml = options.fields
      .map((f) => {
        const type = f.type ?? 'text'
        const value = f.value === null || f.value === undefined ? '' : String(f.value)
        return `
          <label class="field">
            <span class="field__label">${escapeHtml(f.label)}</span>
            <input class="field__input" name="${escapeHtml(f.name)}" type="${type}"
              value="${escapeHtml(value)}"
              ${f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : ''}
              ${f.min !== undefined ? `min="${f.min}"` : ''}
              ${f.step !== undefined ? `step="${f.step}"` : ''}
              ${f.required ? 'required' : ''}
              ${f.autofocus ? 'autofocus' : ''} />
          </label>`
      })
      .join('')

    overlay.innerHTML = `
      <form class="modal">
        <h3 class="modal__title">${escapeHtml(options.title)}</h3>
        <div class="modal__body">${fieldsHtml}</div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Annulla</button>
          <button type="submit" class="btn ${options.danger ? 'btn--danger' : 'btn--primary'}">
            ${escapeHtml(options.submitLabel || 'Salva')}
          </button>
        </div>
      </form>`

    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'))

    const form = overlay.querySelector('form') as HTMLFormElement
    const close = (result: Record<string, string> | null): void => {
      overlay.classList.remove('modal-overlay--show')
      window.setTimeout(() => overlay.remove(), 200)
      resolve(result)
    }

    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => close(null))
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null)
    })
    overlay.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') close(null)
    })
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const result: Record<string, string> = {}
      options.fields.forEach((f) => {
        const input = form.elements.namedItem(f.name) as HTMLInputElement | null
        result[f.name] = input ? input.value.trim() : ''
      })
      close(result)
    })

    const first = overlay.querySelector('input') as HTMLInputElement | null
    window.setTimeout(() => first?.focus(), 60)
  })
}

export function confirmDialog(message: string, options?: { title?: string; submitLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal">
        <h3 class="modal__title">${escapeHtml(options?.title || 'Conferma')}</h3>
        <div class="modal__body"><p>${escapeHtml(message)}</p></div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Annulla</button>
          <button type="button" class="btn ${options?.danger ? 'btn--danger' : 'btn--primary'}" data-ok>
            ${escapeHtml(options?.submitLabel || 'Conferma')}
          </button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--show'))
    const close = (v: boolean): void => {
      overlay.classList.remove('modal-overlay--show')
      window.setTimeout(() => overlay.remove(), 200)
      resolve(v)
    }
    overlay.querySelector('[data-cancel]')?.addEventListener('click', () => close(false))
    overlay.querySelector('[data-ok]')?.addEventListener('click', () => close(true))
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false)
    })
  })
}
