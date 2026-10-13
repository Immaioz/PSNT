# PSNT Web

App di tracking allenamenti: frontend statico in **TypeScript + Vite** che usa uno
**spreadsheet Google** come database tramite **Google Apps Script**. Single user,
senza login. Depreca amicizie, profilo e admin della vecchia webapp Flask.

## Cosa c'è

- `src/` — frontend TypeScript (vanilla, nessun framework runtime).
- `apps-script/Code.gs` — backend Google Apps Script (API JSON sul foglio).
- `public/exercises-data.json` — catalogo esercizi compatto (generato).
- `scripts/` — utility (generazione dati, copia asset).

Funzionalità: dashboard routine, gestione routine (esercizi, serie/reps/note,
riordino, superset), sessione con registrazione pesi (+/− 2,5 kg), statistiche
con grafico peso per esercizio, dettaglio esercizio con GIF/istruzioni in
italiano, tema chiaro/scuro.

## Requisiti

- **Node.js 18+** (per build/sviluppo).
- Un account Google.

## 1. Backend: Google Sheet + Apps Script

1. Crea un nuovo Google Sheet (es. "PSNT").
2. Menu **Estensioni → Apps Script**.
3. Incolla il contenuto di `apps-script/Code.gs` nel file `Code.gs`.
   - Se lo script **non** è legato al foglio, imposta in alto:
     `var SPREADSHEET_ID = '<ID_DEL_FOGLIO>';`
     (l'ID è la stringa lunga nell'URL del foglio).
4. **Distribuisci → Nuova distribuzione → App web**:
   - *Esegui come*: **Me**
   - *Chi ha accesso*: **Chiunque**
5. Copia l'URL che termina con `/exec`.

I fogli `Routines`, `RoutineExercises`, `Sessions`, `Workouts` vengono creati
automaticamente alla prima richiesta.

## 2. Catalogo esercizi

Il file `public/exercises-data.json` è già generato. Se aggiorni il dataset:

```powershell
python scripts/generate-exercises-data.py
```

## 3. Asset (immagini + GIF)

Copia immagini e GIF dalla vecchia webapp:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/copy-assets.ps1
```

In alternativa puoi lasciare gli asset su un host remoto e impostare il campo
**Base URL degli asset** nelle Impostazioni dell'app.

## 4. Sviluppo e build

```powershell
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
npm run preview
```

## 5. Configurazione dell'app

Due modi (il primo ha priorità: se l'utente salva nelle Impostazioni, quel
valore vince sul default del build):

1. **Variabili d'ambiente al build** (comodo su Vercel): copia `.env.example` in
   `.env` e imposta:
   - `VITE_API_URL` = URL `/exec` di Apps Script
   - `VITE_ASSET_BASE` = cartella asset (default `exercises/`)
2. **Impostazioni in-app**: apri **Impostazioni** (icona ingranaggio) e incolla
   l'URL `/exec`, poi **Test connessione**. Salvato nel `localStorage`.

### Deploy su Vercel

- Framework preset: **Vite** · Build: `npm run build` · Output: `dist`.
- In *Settings → Environment Variables* aggiungi `VITE_API_URL` (e
  `VITE_ASSET_BASE` se serve).
- Per gli asset locali, esegui prima `scripts/copy-assets.ps1` così `public/exercises/`
  finisce nel build.

## 6. Sicurezza (sito pubblico)

Il deploy Apps Script gira "come te" e non ha login: chiunque abbia l'URL `/exec`
può leggere/scrivere. Per proteggere i dati usa un **token condiviso**:

1. In `Code.gs` imposta `var API_TOKEN = '<stringa-lunga-casuale>';` e ripubblica
   (Gestisci distribuzioni → Nuova versione).
2. Nell'app → **Impostazioni** → campo **Token API**: incolla lo stesso valore
   (o premi **Genera** e copialo in `Code.gs`). → *Test connessione*.

Il token viene salvato **solo nel `localStorage`** del browser (non nel bundle
pubblico). ⚠️ Non mettere il token in `VITE_API_TOKEN`: le variabili `VITE_*`
finiscono in chiaro nel JS servito dal sito.



## Note

- La comunicazione con Apps Script usa `POST` con `Content-Type: text/plain`
  (per evitare il preflight CORS che Apps Script non gestisce).
- Il tema e l'URL API sono salvati in `localStorage`.
