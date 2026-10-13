/**
 * PSNT — Google Apps Script backend
 * -------------------------------------------------------------
 * Trasforma uno spreadsheet Google in un piccolo backend JSON
 * per l'app di tracking allenamenti (single user, senza login).
 *
 * SETUP:
 *  1. Crea (o apri) uno spreadsheet Google e copia il suo ID.
 *  2. Incolla l'ID qui sotto in SPREADSHEET_ID (oppure lascia vuoto
 *     se lo script e' "container-bound", cioe' creato dal menu
 *     Estensioni > Apps Script dentro lo spreadsheet stesso).
 *  3. Distribuisci > Nuova distribuzione > App web
 *       - Esegui come: Me
 *       - Chi ha accesso: Chiunque
 *  4. Copia l'URL /exec e incollalo nelle Impostazioni dell'app.
 *
 * Le azioni sono richieste in POST con body JSON:
 *   { action: "...", ...campi }
 * e rispondono sempre con { ok: true, data } oppure { ok: false, error }.
 */

var SPREADSHEET_ID = '';

// Token condiviso: se impostato (non vuoto), ogni richiesta deve includere
// il campo "token" con lo stesso valore, altrimenti viene rifiutata.
// Genera una stringa lunga e casuale e incollala anche nelle Impostazioni
// dell'app (NON nel codice del sito pubblico).
var API_TOKEN = '';

var SCHEMAS = {
  Routines: ['id', 'name', 'position', 'created_at'],
  RoutineExercises: [
    'id', 'routine_id', 'exercise', 'exercise_id',
    'default_sets', 'default_reps', 'notes', 'position', 'superset_id'
  ],
  Sessions: ['id', 'routine_id', 'date', 'created_at'],
  Workouts: [
    'id', 'session_id', 'exercise', 'exercise_id',
    'sets', 'reps', 'weight', 'notes', 'position', 'superset_id', 'created_at'
  ]
};

/* ----------------------------- entrypoints ----------------------------- */

function doGet(e) {
  return handle_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  var req = {};
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    req = JSON.parse(raw);
  } catch (err) {
    return json_({ ok: false, error: 'Body non valido: ' + err });
  }
  return handle_(req);
}

function handle_(req) {
  try {
    if (API_TOKEN && String(req.token || '') !== API_TOKEN) {
      throw new Error('Non autorizzato');
    }
    ensureSheets_();
    var action = req.action;
    var out;
    var includeDb = true;
    switch (action) {
      case 'ping': out = { pong: true, time: nowIso_() }; includeDb = false; break;
      case 'getAll': out = getAll_(); includeDb = false; break;

      case 'createRoutine': out = createRoutine_(req); break;
      case 'renameRoutine': out = renameRoutine_(req); break;
      case 'deleteRoutine': out = deleteRoutine_(req); break;
      case 'reorderRoutines': out = reorderRoutines_(req); break;

      case 'addRoutineExercise': out = addRoutineExercise_(req); break;
      case 'editRoutineExercise': out = editRoutineExercise_(req); break;
      case 'deleteRoutineExercise': out = deleteRoutineExercise_(req); break;
      case 'reorderRoutineExercises': out = reorderRoutineExercises_(req); break;
      case 'setSuperset': out = setSuperset_(req); break;
      case 'unsetSuperset': out = unsetSuperset_(req); break;

      case 'startSession': out = startSession_(req); break;
      case 'saveSession': out = saveSession_(req); break;
      case 'updateSupersetGroup': out = updateSupersetGroup_(req); break;
      case 'deleteSessionWorkout': out = deleteSessionWorkout_(req); break;
      case 'deleteSession': out = deleteSession_(req); break;
      case 'clearStats': out = clearStats_(req); break;

      default: throw new Error('Azione sconosciuta: ' + action);
    }
    var res = { ok: true, data: out === undefined ? null : out };
    if (includeDb) res.db = getAll_();
    return json_(res);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ------------------------------- helpers ------------------------------- */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowIso_() {
  return new Date().toISOString();
}

function today_() {
  var tz = 'Etc/GMT-2';
  try { tz = Session.getScriptTimeZone() || tz; } catch (e) {}
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function book_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Imposta SPREADSHEET_ID nello script.');
}

function ensureSheets_() {
  var ss = book_();
  Object.keys(SCHEMAS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SCHEMAS[name]);
      sh.setFrozenRows(1);
    }
  });
}

function sheet_(name) {
  return book_().getSheetByName(name);
}

function headers_(name) {
  return SCHEMAS[name];
}

function readAll_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = headers_(name);
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.filter(function (row) {
    return row[0] !== '' && row[0] !== null && typeof row[0] !== 'undefined';
  }).map(function (row) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = row[i] === '' ? null : row[i]; });
    return o;
  });
}

function nextId_(name) {
  var rows = readAll_(name);
  var max = 0;
  rows.forEach(function (r) { if (typeof r.id === 'number' && r.id > max) max = r.id; });
  return max + 1;
}

function append_(name, obj) {
  var sh = sheet_(name);
  var headers = headers_(name);
  var row = headers.map(function (h) {
    return typeof obj[h] === 'undefined' || obj[h] === null ? '' : obj[h];
  });
  sh.appendRow(row);
  return obj;
}

function findRowIndex_(name, id) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(id)) return i + 2;
  }
  return -1;
}

function patch_(name, id, patch) {
  var sh = sheet_(name);
  var headers = headers_(name);
  var rowIndex = findRowIndex_(name, id);
  if (rowIndex < 0) throw new Error('Record non trovato: ' + name + '#' + id);
  var row = sh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (h, i) {
    if (Object.prototype.hasOwnProperty.call(patch, h)) {
      row[i] = typeof patch[h] === 'undefined' || patch[h] === null ? '' : patch[h];
    }
  });
  sh.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

function deleteById_(name, id) {
  var sh = sheet_(name);
  var rowIndex = findRowIndex_(name, id);
  if (rowIndex > 0) sh.deleteRow(rowIndex);
}

function deleteWhere_(name, predicate) {
  var rows = readAll_(name);
  rows.forEach(function (r) { if (predicate(r)) deleteById_(name, r.id); });
}

function num_(v) {
  if (v === '' || v === null || typeof v === 'undefined') return null;
  var n = Number(v);
  return isNaN(n) ? v : n;
}

/* ------------------------------- actions ------------------------------- */

function getAll_() {
  return {
    routines: readAll_('Routines'),
    routineExercises: readAll_('RoutineExercises'),
    sessions: readAll_('Sessions'),
    workouts: readAll_('Workouts')
  };
}

function createRoutine_(req) {
  var id = nextId_('Routines');
  var rows = readAll_('Routines');
  var position = req.position;
  if (typeof position === 'undefined' || position === null) {
    position = rows.reduce(function (m, r) { return Math.max(m, Number(r.position) || 0); }, 0) + 1;
  }
  return append_('Routines', {
    id: id,
    name: String(req.name || '').trim() || 'Nuova Routine',
    position: position,
    created_at: nowIso_()
  });
}

function renameRoutine_(req) {
  patch_('Routines', req.id, { name: String(req.name || '').trim() || 'Routine' });
  return { id: req.id };
}

function deleteRoutine_(req) {
  var id = req.id;
  deleteWhere_('RoutineExercises', function (r) { return Number(r.routine_id) === Number(id); });
  var sessionIds = readAll_('Sessions')
    .filter(function (s) { return Number(s.routine_id) === Number(id); })
    .map(function (s) { return Number(s.id); });
  sessionIds.forEach(function (sid) {
    deleteWhere_('Workouts', function (w) { return Number(w.session_id) === sid; });
    deleteById_('Sessions', sid);
  });
  deleteById_('Routines', id);
  return { id: id };
}

function reorderRoutines_(req) {
  var order = req.order || [];
  order.forEach(function (id, i) { patch_('Routines', id, { position: i + 1 }); });
  return { ok: true };
}

function addRoutineExercise_(req) {
  var id = nextId_('RoutineExercises');
  var siblings = readAll_('RoutineExercises')
    .filter(function (r) { return Number(r.routine_id) === Number(req.routine_id); });
  var position = siblings.reduce(function (m, r) { return Math.max(m, Number(r.position) || 0); }, 0) + 1;
  return append_('RoutineExercises', {
    id: id,
    routine_id: req.routine_id,
    exercise: String(req.exercise || '').trim(),
    exercise_id: req.exercise_id === undefined ? null : req.exercise_id,
    default_sets: num_(req.default_sets),
    default_reps: num_(req.default_reps),
    notes: req.notes || null,
    position: position,
    superset_id: null
  });
}

function editRoutineExercise_(req) {
  var patch = {};
  if (Object.prototype.hasOwnProperty.call(req, 'exercise')) patch.exercise = req.exercise;
  if (Object.prototype.hasOwnProperty.call(req, 'exercise_id')) patch.exercise_id = req.exercise_id;
  if (Object.prototype.hasOwnProperty.call(req, 'default_sets')) patch.default_sets = num_(req.default_sets);
  if (Object.prototype.hasOwnProperty.call(req, 'default_reps')) patch.default_reps = num_(req.default_reps);
  if (Object.prototype.hasOwnProperty.call(req, 'notes')) patch.notes = req.notes;
  patch_('RoutineExercises', req.id, patch);
  return { id: req.id };
}

function deleteRoutineExercise_(req) {
  deleteById_('RoutineExercises', req.id);
  return { id: req.id };
}

function reorderRoutineExercises_(req) {
  var items = req.items || [];
  items.forEach(function (it) { patch_('RoutineExercises', it.id, { position: it.position }); });
  return { ok: true };
}

function setSuperset_(req) {
  var groupId = req.group_id || ('ss_' + new Date().getTime());
  patch_('RoutineExercises', req.id1, { superset_id: groupId });
  patch_('RoutineExercises', req.id2, { superset_id: groupId });
  return { group_id: groupId };
}

function unsetSuperset_(req) {
  var from = readAll_('RoutineExercises').filter(function (r) {
    return r.superset_id && r.superset_id === req.superset_id;
  });
  from.forEach(function (r) { patch_('RoutineExercises', r.id, { superset_id: null }); });
  return { ok: true };
}

function startSession_(req) {
  var routineId = req.routine_id;
  var routine = readAll_('Routines').filter(function (r) { return Number(r.id) === Number(routineId); })[0];
  if (!routine) throw new Error('Routine non trovata');

  var sessionId = nextId_('Sessions');
  append_('Sessions', {
    id: sessionId,
    routine_id: routineId,
    date: req.date || today_(),
    created_at: nowIso_()
  });

  var exercises = readAll_('RoutineExercises')
    .filter(function (r) { return Number(r.routine_id) === Number(routineId); })
    .sort(function (a, b) { return (Number(a.position) || 0) - (Number(b.position) || 0); });

  var wid = nextId_('Workouts');
  exercises.forEach(function (re, i) {
    append_('Workouts', {
      id: wid++,
      session_id: sessionId,
      exercise: re.exercise,
      exercise_id: re.exercise_id,
      sets: re.default_sets,
      reps: re.default_reps,
      weight: null,
      notes: re.notes,
      position: i + 1,
      superset_id: re.superset_id,
      created_at: nowIso_()
    });
  });

  return { session_id: sessionId };
}

function saveSession_(req) {
  var sessionId = req.session_id;
  (req.workouts || []).forEach(function (w) {
    patch_('Workouts', w.id, {
      sets: num_(w.sets),
      reps: num_(w.reps),
      weight: num_(w.weight)
    });
  });
  return { session_id: sessionId };
}

function updateSupersetGroup_(req) {
  var workouts = readAll_('Workouts').filter(function (w) {
    return Number(w.session_id) === Number(req.session_id) && w.superset_id && w.superset_id === req.superset_id;
  });
  workouts.forEach(function (w) {
    patch_('Workouts', w.id, { sets: num_(req.sets), reps: num_(req.reps) });
  });
  return { updated: workouts.length };
}

function deleteSessionWorkout_(req) {
  deleteById_('Workouts', req.workout_id);
  return { ok: true };
}

function deleteSession_(req) {
  var id = req.session_id;
  deleteWhere_('Workouts', function (w) { return Number(w.session_id) === Number(id); });
  deleteById_('Sessions', id);
  return { id: id };
}

function clearStats_() {
  clearSheet_('Workouts');
  clearSheet_('Sessions');
  return { ok: true };
}

function clearSheet_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
}
