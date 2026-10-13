import { config } from './config'

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

export async function call<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const url = config().apiUrl.trim()
  if (!url) {
    throw new Error('URL API non configurato. Vai su Impostazioni.')
  }

  const body = JSON.stringify({ action, ...payload })

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain evita il preflight CORS che Apps Script non gestisce
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow'
    })
  } catch {
    throw new Error('Impossibile contattare il server. Controlla la connessione e l\'URL API.')
  }

  if (!res.ok) throw new Error('Errore di rete (' + res.status + ')')

  const text = await res.text()
  let json: ApiResponse<T>
  try {
    json = JSON.parse(text) as ApiResponse<T>
  } catch {
    throw new Error('Risposta non valida dal server.')
  }

  if (!json.ok) throw new Error(json.error || 'Errore sconosciuto')
  return json.data as T
}
