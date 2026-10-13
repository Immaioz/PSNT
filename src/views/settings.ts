import { config, setConfig } from '../config'
import { applyTheme } from '../theme'
import { call } from '../api'
import { toast, escapeHtml } from '../dom'
import type { Route } from '../router'

function randomToken(len = 32): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

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
        <span class="field__label">Token API (condiviso)</span>
        <div class="token-row">
          <input class="field__input" name="apiToken" type="password" value="${escapeHtml(cfg.apiToken)}"
            placeholder="incolla il token di Code.gs" autocomplete="off" />
          <button type="button" class="btn btn--ghost" data-action="gen-token">Genera</button>
        </div>
        <span class="field__hint">Deve combaciare con <code>API_TOKEN</code> in Code.gs. Salvato solo in questo browser.</span>
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
  const tokenInput = form.elements.namedItem('apiToken') as HTMLInputElement

  function readApiUrl(): string {
    return (form.elements.namedItem('apiUrl') as HTMLInputElement).value
  }
  function readAssetBase(): string {
    return (form.elements.namedItem('assetBase') as HTMLInputElement).value
  }

  form.querySelector('[data-action="gen-token"]')?.addEventListener('click', async () => {
    const token = randomToken()
    tokenInput.value = token
    tokenInput.type = 'text'
    try {
      await navigator.clipboard.writeText(token)
      toast('Token generato e copiato: incollalo in API_TOKEN di Code.gs')
    } catch {
      toast('Token generato: copialo e incollalo in API_TOKEN di Code.gs')
    }
  })

  form.querySelector('[data-action="test"]')?.addEventListener('click', async () => {
    status.textContent = 'Verifica in corso...'
    status.className = 'settings-form__status'
    setConfig({
      apiUrl: readApiUrl(),
      apiToken: tokenInput.value,
      assetBase: readAssetBase(),
      theme: config().theme
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
    const theme = (form.elements.namedItem('theme') as HTMLSelectElement).value as 'light' | 'dark'
    setConfig({
      apiUrl: readApiUrl(),
      apiToken: tokenInput.value,
      assetBase: readAssetBase(),
      theme
    })
    applyTheme(theme)
    toast('Impostazioni salvate')
  })
}
