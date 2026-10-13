import './styles.css'
import { config } from './config'
import { initTheme, toggleTheme } from './theme'
import { onRouteChange, navigate, currentRoute, type Route } from './router'
import * as store from './store'
import { renderDashboard } from './views/dashboard'
import { renderRoutine } from './views/routine'
import { renderSession } from './views/session'
import { renderStats } from './views/stats'
import { renderExercise } from './views/exercise'
import { renderSettings } from './views/settings'

type View = (root: HTMLElement, route: Route) => void

const views: Record<Route['name'], View> = {
  dashboard: renderDashboard,
  routine: renderRoutine,
  session: renderSession,
  stats: renderStats,
  exercise: renderExercise,
  settings: renderSettings
}

function shell(): string {
  return `
    <header class="topbar">
      <a class="brand" href="#/">
        <span class="brand__mark">P</span>
        <span class="brand__name">PSNT</span>
      </a>
      <nav class="topnav">
        <a href="#/" data-nav="dashboard">Dashboard</a>
        <a href="#/stats" data-nav="stats">Statistiche</a>
      </nav>
      <div class="topbar__actions">
        <button class="btn btn--icon" data-action="theme" title="Cambia tema" aria-label="Cambia tema"></button>
        <a class="btn btn--icon" href="#/settings" title="Impostazioni" aria-label="Impostazioni">&#9881;</a>
      </div>
    </header>
    <div id="progress" class="progress" hidden></div>
    <div id="error-slot"></div>
    <main id="view" class="view"></main>
    <div id="toast-root" class="toast-root"></div>`
}

function notConfigured(): string {
  return `
    <div class="empty empty--big">
      <h2>Benvenuto in PSNT</h2>
      <p>Configura l'URL dell'API (Google Apps Script) per iniziare.</p>
      <a class="btn btn--primary" href="#/settings">Apri le impostazioni</a>
    </div>`
}

function renderErrorSlot(): void {
  const slot = document.getElementById('error-slot')
  if (!slot) return
  const err = store.errorMessage()
  if (!err) {
    slot.innerHTML = ''
    return
  }
  slot.innerHTML = `
    <div class="banner banner--error">
      <span>${err}</span>
      <button class="btn btn--sm btn--ghost" data-action="retry">Riprova</button>
    </div>`
  slot.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
    void store.reload().catch(() => undefined)
  })
}

function updateProgress(): void {
  const bar = document.getElementById('progress')
  if (bar) bar.hidden = !store.isLoading()
}

function updateNav(route: Route): void {
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.nav === route.name)
  })
  const themeBtn = document.querySelector('[data-action="theme"]')
  if (themeBtn) themeBtn.textContent = config().theme === 'dark' ? '\u263e' : '\u2600'
}

function renderView(): void {
  const route = currentRoute()
  updateProgress()
  updateNav(route)
  renderErrorSlot()

  const previous = document.getElementById('view')
  const view = document.createElement('main')
  view.id = 'view'
  view.className = 'view'
  if (previous) previous.replaceWith(view)
  else document.body.appendChild(view)

  if (!config().apiUrl && route.name !== 'settings') {
    view.innerHTML = notConfigured()
    return
  }

  const render = views[route.name] ?? renderDashboard
  try {
    render(view, route)
  } catch (err) {
    view.innerHTML = `<div class="banner banner--error">Errore: ${String((err as Error).message)}</div>`
  }
}

async function boot(): Promise<void> {
  initTheme()
  document.body.insertAdjacentHTML('afterbegin', shell())

  document.querySelector('[data-action="theme"]')?.addEventListener('click', () => {
    toggleTheme()
    updateNav(currentRoute())
  })

  onRouteChange(() => renderView())
  store.subscribe(() => renderView())

  void store.loadExercises().catch(() => undefined)

  if (config().apiUrl) {
    try {
      await store.reload()
    } catch {
      /* mostrato dal banner */
    }
  } else {
    navigate('settings')
  }
}

void boot()
