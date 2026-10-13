export type Route =
  | { name: 'dashboard' }
  | { name: 'routine'; id: number }
  | { name: 'session'; id: number }
  | { name: 'stats' }
  | { name: 'exercise'; id: string }
  | { name: 'settings' }

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts.length === 0) return { name: 'dashboard' }
  const [head, param] = parts
  switch (head) {
    case 'routine':
      return { name: 'routine', id: Number(param) || 0 }
    case 'session':
      return { name: 'session', id: Number(param) || 0 }
    case 'stats':
      return { name: 'stats' }
    case 'settings':
      return { name: 'settings' }
    case 'exercise':
      return { name: 'exercise', id: decodeURIComponent(param || '') }
    default:
      return { name: 'dashboard' }
  }
}

export function navigate(path: string): void {
  const target = path.startsWith('#') ? path : '#/' + path.replace(/^\/+/, '')
  if (location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    location.hash = target
  }
}

export function currentRoute(): Route {
  return parseHash(location.hash)
}

export function onRouteChange(fn: (route: Route) => void): void {
  const handler = (): void => fn(parseHash(location.hash))
  window.addEventListener('hashchange', handler)
  fn(parseHash(location.hash))
}
