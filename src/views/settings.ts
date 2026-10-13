import { config, setConfig } from '../config'
import { applyTheme } from '../theme'
import { call } from '../api'
import { toast, escapeHtml } from '../dom'
import type { Route } from '../router'

export function renderSettings(root: HTMLElement, _route: Route): void {
  const cfg = config()
  root.innerHTML = `
    <div class="page-head">
      <div>
        <a class="back" href="#/">&larr; Dashboard</a>
        <h1 class="page-title">Impostazioni</h1>
        <p class="page-sub">Connessione al foglio Google e aspetto</p>
      </div>
    </div>
    <form class="card settings-form">
      <label class="field">
        <span class="field__label">URL API (Google Apps Script /exec)</span>
        <input class="field__input" name="apiUrl" type="url" value="${escapeHtml(cfg.apiUrl)}"
          placeholder="https://script.google.com/macros/s/XXXX/exec" />
        <span class="field__hint">L'URL dell'app web pubblicata da Apps Script (termina con /exec).</span>
      </label>
      <label class="field">
        <span class="field__label">Base URL degli asset esercizi</span>
        <input class="field__input" name="assetBase" type="text" value="${escapeHtml(cfg.assetBase)}"
          placeholder="exercises/" />
        <span class="field__hint">Cartella (locale o remota) che contiene <code>images/</code> e <code>videos/</code>.</span>
      </label>
      <label class="field">
        <span class="field__label">Tema</span>
        <select class="field__input" name="theme">
          <option value="dark" ${cfg.theme === 'dark' ? 'selected' : ''}>Scuro</option>
          <option value="light" ${cfg.theme === 'light' ? 'selected' : ''}>Chiaro</option>
        </select>
      </label>
      <div class="settings-form__actions">
        <button type="button" class="btn btn--ghost" data-action="test">Test connessione</button>
        <button type="submit" class="btn btn--primary">Salva</button>
      </div>
      <p class="settings-form__status" data-status></p>
    </form>`

  const form = root.querySelector('form') as HTMLFormElement
  const status = root.querySelector('[data-status]') as HTMLElement

  form.querySelector('[data-action="test"]')?.addEventListener('click', async () => {
    status.textContent = 'Verifica in corso...'
    status.className = 'settings-form__status'
    const saved = config()
    setConfig({
      apiUrl: (form.elements.namedItem('apiUrl') as HTMLInputElement).value,
      assetBase: (form.elements.namedItem('assetBase') as HTMLInputElement).value,
      theme: saved.theme
    })
    try {
      await call('ping')
      status.textContent = 'Connessione riuscita.'
      status.className = 'settings-form__status settings-form__status--ok'
      toast('Connessione riuscita')
    } catch (err) {
      status.textContent = (err as Error).message
      status.className = 'settings-form__status settings-form__status--err'
      toast((err as Error).message, 'error')
    }
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const apiUrl = (form.elements.namedItem('apiUrl') as HTMLInputElement).value
    const assetBase = (form.elements.namedItem('assetBase') as HTMLInputElement).value
    const theme = (form.elements.namedItem('theme') as HTMLSelectElement).value as 'light' | 'dark'
    setConfig({ apiUrl, assetBase, theme })
    applyTheme(theme)
    toast('Impostazioni salvate')
  })
}
