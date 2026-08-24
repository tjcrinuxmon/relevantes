// =====================================================
// routes/relevantes.js — Asuntos Relevantes (DEAJ)
// Captura por subdirección + tablero Seguimiento Diario + panel.
// =====================================================
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { DIRECCIONES, DIRECCION_KEYS, SUBDIRECCIONES } = require('../catalogo');

const router = express.Router();
router.use(authMiddleware);

const ESTATUS     = ['iniciado', 'en_proceso', 'concluido'];
const PRIORIDADES = ['baja', 'media', 'alta', 'muy_alta'];
const AVANCES     = [25, 50, 75, 90, 100];

// ── Adjuntos (hasta 20 MB) ─────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').slice(0, 10);
    cb(null, `relev_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const isAdmin = (req) => req.user?.rol === 'admin';
// Ámbito de visibilidad: admin ve todo; capturista sólo su subdirección.
// Devuelve la subdirección a la que limitar, o null si es admin (sin límite).
// '__none__' fuerza cero resultados si el capturista no tiene subdirección.
const scopeSub = (req) => (isAdmin(req) ? null : (req.user.subdireccion || '__none__'));

// Resuelve la subdirección/dirección objetivo de una captura.
function resolverAsignacion(req) {
  if (isAdmin(req)) {
    const sub = req.body.subdireccion || null;
    if (!sub || !SUBDIRECCIONES[sub]) {
      const err = new Error('Selecciona una subdirección válida'); err.status = 400; throw err;
    }
    return { subdireccion: sub, direccion: SUBDIRECCIONES[sub].direccionKey };
  }
  const sub = req.user.subdireccion;
  if (!sub || !SUBDIRECCIONES[sub]) {
    const err = new Error('Tu usuario no tiene una subdirección asignada. Pide a un administrador que te la asigne en el portal para poder capturar.');
    err.status = 403; throw err;
  }
  return { subdireccion: sub, direccion: SUBDIRECCIONES[sub].direccionKey };
}

const validarFecha = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);

// concluido ⟺ avance 100.
function normalizarEstatusAvance(estatusRaw, avanceRaw) {
  const estatus = ESTATUS.includes(estatusRaw) ? estatusRaw : 'iniciado';
  let avance = parseInt(avanceRaw, 10);
  if (!AVANCES.includes(avance)) avance = estatus === 'concluido' ? 100 : 25;
  if (estatus === 'concluido') avance = 100;
  return { estatus, avance };
}

function upsertReporteDiario({ direccion, subdireccion, fecha, tipo, userId, userNombre }) {
  db.prepare(`
    INSERT INTO relevantes_reportes (direccion, subdireccion, fecha, tipo, user_id, user_nombre)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(subdireccion, fecha) DO UPDATE SET
      tipo = excluded.tipo, direccion = excluded.direccion,
      user_id = excluded.user_id, user_nombre = excluded.user_nombre,
      actualizado_en = datetime('now','localtime')
  `).run(direccion, subdireccion, fecha, tipo, userId, userNombre);
}

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// GET /api/relevantes/catalogo
router.get('/catalogo', (req, res) => res.json({ direcciones: DIRECCIONES }));

// GET /api/relevantes/matrix?monday=YYYY-MM-DD
router.get('/matrix', (req, res) => {
  const monday = validarFecha(req.query.monday) ? req.query.monday : null;
  if (!monday) return res.status(400).json({ error: 'Parámetro monday (YYYY-MM-DD) requerido' });
  const sunday = addDaysISO(monday, 6);
  const only = scopeSub(req);
  const cond = only ? ' AND subdireccion = ?' : '';
  const extra = only ? [only] : [];
  const reportes = db.prepare(`
    SELECT subdireccion, direccion, fecha, tipo, user_nombre
    FROM relevantes_reportes WHERE fecha >= ? AND fecha <= ?${cond}`).all(monday, sunday, ...extra);
  const conteos = db.prepare(`
    SELECT subdireccion, fecha, COUNT(*) AS n FROM relevantes
    WHERE fecha >= ? AND fecha <= ?${cond} GROUP BY subdireccion, fecha`).all(monday, sunday, ...extra);
  res.json({ monday, sunday, reportes, conteos });
});

// GET /api/relevantes/stats
router.get('/stats', (req, res) => {
  const { fecha_inicio, fecha_fin, direccion, prioridad } = req.query;
  const where = [], args = [];
  if (validarFecha(fecha_inicio)) { where.push('fecha >= ?'); args.push(fecha_inicio); }
  if (validarFecha(fecha_fin))    { where.push('fecha <= ?'); args.push(fecha_fin); }
  const only = scopeSub(req);
  if (only) { where.push('subdireccion = ?'); args.push(only); }
  else if (direccion && DIRECCION_KEYS.has(direccion)) { where.push('direccion = ?'); args.push(direccion); }
  if (PRIORIDADES.includes(prioridad)) { where.push('prioridad = ?'); args.push(prioridad); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM relevantes ${clause}`).get(...args).n;
  const porEstatus = {}; ESTATUS.forEach(e => (porEstatus[e] = 0));
  db.prepare(`SELECT estatus, COUNT(*) AS n FROM relevantes ${clause} GROUP BY estatus`).all(...args)
    .forEach(r => { if (r.estatus in porEstatus) porEstatus[r.estatus] = r.n; });
  const porPrioridad = {}; PRIORIDADES.forEach(p => (porPrioridad[p] = 0));
  db.prepare(`SELECT prioridad, COUNT(*) AS n FROM relevantes ${clause} GROUP BY prioridad`).all(...args)
    .forEach(r => { if (r.prioridad in porPrioridad) porPrioridad[r.prioridad] = r.n; });
  const recientes = db.prepare(`
    SELECT id, direccion, subdireccion, fecha, tema, estatus, prioridad, avance
    FROM relevantes ${clause} ORDER BY fecha DESC, id DESC LIMIT 8`).all(...args);

  res.json({ total, por_estatus: porEstatus, por_prioridad: porPrioridad, recientes });
});

// POST /api/relevantes/sin-asuntos
router.post('/sin-asuntos', (req, res) => {
  const { fecha } = req.body;
  if (!validarFecha(fecha)) return res.status(400).json({ error: 'Fecha inválida' });
  let asig;
  try { asig = resolverAsignacion(req); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const yaHay = db.prepare(`SELECT COUNT(*) AS n FROM relevantes WHERE subdireccion = ? AND fecha = ?`).get(asig.subdireccion, fecha).n;
  if (yaHay > 0) return res.status(400).json({ error: 'Ya existen asuntos capturados para esta subdirección y fecha; no puede marcarse "sin asuntos".' });
  upsertReporteDiario({ direccion: asig.direccion, subdireccion: asig.subdireccion, fecha, tipo: 'sin_asuntos', userId: req.user.id, userNombre: req.user.nombre });
  res.status(201).json({ ok: true, tipo: 'sin_asuntos' });
});

// POST /api/relevantes — crea un asunto (adjunto opcional)
router.post('/', upload.single('adjunto'), (req, res) => {
  const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  try {
    const asig = resolverAsignacion(req);
    const { fecha, tema } = req.body;
    if (!validarFecha(fecha)) { cleanup(); return res.status(400).json({ error: 'Fecha inválida' }); }
    if (!tema || !tema.trim()) { cleanup(); return res.status(400).json({ error: 'El tema es requerido' }); }
    const { estatus, avance } = normalizarEstatusAvance(req.body.estatus, req.body.avance);
    const prioridad = PRIORIDADES.includes(req.body.prioridad) ? req.body.prioridad : 'media';
    const descripcion   = (req.body.descripcion || '').slice(0, 2000) || null;
    const observaciones = (req.body.observaciones || '').slice(0, 512) || null;

    const r = db.prepare(`
      INSERT INTO relevantes (direccion, subdireccion, fecha, tema, estatus, prioridad, descripcion, avance,
        observaciones, adjunto_path, adjunto_nombre, adjunto_size, creado_por, creado_por_nombre)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      asig.direccion, asig.subdireccion, fecha, tema.trim().slice(0, 255), estatus, prioridad,
      descripcion, avance, observaciones,
      req.file ? req.file.filename : null, req.file ? req.file.originalname : null, req.file ? req.file.size : null,
      req.user.id, req.user.nombre,
    );
    upsertReporteDiario({ direccion: asig.direccion, subdireccion: asig.subdireccion, fecha, tipo: 'con_asuntos', userId: req.user.id, userNombre: req.user.nombre });
    res.status(201).json(db.prepare(`SELECT * FROM relevantes WHERE id = ?`).get(r.lastInsertRowid));
  } catch (e) {
    cleanup();
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/relevantes — listado con filtros
router.get('/', (req, res) => {
  const { q, fecha_inicio, fecha_fin, direccion, subdireccion, estatus, prioridad } = req.query;
  const where = [], args = [];
  if (validarFecha(fecha_inicio)) { where.push('fecha >= ?'); args.push(fecha_inicio); }
  if (validarFecha(fecha_fin))    { where.push('fecha <= ?'); args.push(fecha_fin); }
  const only = scopeSub(req);
  if (only) {
    // Capturista: siempre limitado a su subdirección (se ignora cualquier filtro recibido).
    where.push('subdireccion = ?'); args.push(only);
  } else {
    if (direccion && DIRECCION_KEYS.has(direccion))   { where.push('direccion = ?'); args.push(direccion); }
    if (subdireccion && SUBDIRECCIONES[subdireccion]) { where.push('subdireccion = ?'); args.push(subdireccion); }
  }
  if (ESTATUS.includes(estatus))       { where.push('estatus = ?'); args.push(estatus); }
  if (PRIORIDADES.includes(prioridad)) { where.push('prioridad = ?'); args.push(prioridad); }
  if (q && q.trim()) {
    where.push('(tema LIKE ? OR descripcion LIKE ? OR observaciones LIKE ? OR creado_por_nombre LIKE ?)');
    const like = `%${q.trim()}%`; args.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  res.json(db.prepare(`SELECT * FROM relevantes ${clause} ORDER BY fecha DESC, id DESC`).all(...args));
});

// GET /api/relevantes/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM relevantes WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Asunto no encontrado' });
  if (!isAdmin(req) && row.subdireccion !== req.user.subdireccion) {
    return res.status(403).json({ error: 'No tienes acceso a este asunto' });
  }
  res.json(row);
});

// GET /api/relevantes/:id/adjunto
router.get('/:id/adjunto', (req, res) => {
  const row = db.prepare(`SELECT adjunto_path, adjunto_nombre, subdireccion FROM relevantes WHERE id = ?`).get(req.params.id);
  if (!row || !row.adjunto_path) return res.status(404).json({ error: 'Sin adjunto' });
  if (!isAdmin(req) && row.subdireccion !== req.user.subdireccion) {
    return res.status(403).json({ error: 'No tienes acceso a este adjunto' });
  }
  const filePath = path.join(__dirname, '../uploads', row.adjunto_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.download(filePath, row.adjunto_nombre || row.adjunto_path);
});

// PUT /api/relevantes/:id — edita (dueño o admin)
router.put('/:id', upload.single('adjunto'), (req, res) => {
  const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  const row = db.prepare(`SELECT * FROM relevantes WHERE id = ?`).get(req.params.id);
  if (!row) { cleanup(); return res.status(404).json({ error: 'Asunto no encontrado' }); }
  if (!isAdmin(req) && row.creado_por !== req.user.id) {
    cleanup(); return res.status(403).json({ error: 'Solo el capturista o un administrador pueden editar este asunto' });
  }
  const tema = req.body.tema !== undefined ? (req.body.tema || '').trim().slice(0, 255) : row.tema;
  if (!tema) { cleanup(); return res.status(400).json({ error: 'El tema es requerido' }); }
  const { estatus, avance } = normalizarEstatusAvance(
    req.body.estatus !== undefined ? req.body.estatus : row.estatus,
    req.body.avance  !== undefined ? req.body.avance  : row.avance,
  );
  const prioridad = PRIORIDADES.includes(req.body.prioridad) ? req.body.prioridad : row.prioridad;
  const descripcion   = req.body.descripcion   !== undefined ? ((req.body.descripcion || '').slice(0, 2000) || null) : row.descripcion;
  const observaciones = req.body.observaciones !== undefined ? ((req.body.observaciones || '').slice(0, 512) || null) : row.observaciones;

  let adjPath = row.adjunto_path, adjNombre = row.adjunto_nombre, adjSize = row.adjunto_size;
  if (req.file) {
    if (row.adjunto_path) fs.unlink(path.join(__dirname, '../uploads', row.adjunto_path), () => {});
    adjPath = req.file.filename; adjNombre = req.file.originalname; adjSize = req.file.size;
  }

  db.prepare(`
    UPDATE relevantes SET tema = ?, estatus = ?, prioridad = ?, descripcion = ?, avance = ?, observaciones = ?,
      adjunto_path = ?, adjunto_nombre = ?, adjunto_size = ?, actualizado_en = datetime('now','localtime')
    WHERE id = ?`).run(tema, estatus, prioridad, descripcion, avance, observaciones, adjPath, adjNombre, adjSize, req.params.id);

  res.json(db.prepare(`SELECT * FROM relevantes WHERE id = ?`).get(req.params.id));
});

// DELETE /api/relevantes/:id — elimina (dueño o admin)
router.delete('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM relevantes WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Asunto no encontrado' });
  if (!isAdmin(req) && row.creado_por !== req.user.id) {
    return res.status(403).json({ error: 'Solo el capturista o un administrador pueden eliminar este asunto' });
  }
  if (row.adjunto_path) fs.unlink(path.join(__dirname, '../uploads', row.adjunto_path), () => {});
  db.prepare(`DELETE FROM relevantes WHERE id = ?`).run(req.params.id);
  const quedan = db.prepare(`SELECT COUNT(*) AS n FROM relevantes WHERE subdireccion = ? AND fecha = ?`).get(row.subdireccion, row.fecha).n;
  if (quedan === 0) {
    db.prepare(`DELETE FROM relevantes_reportes WHERE subdireccion = ? AND fecha = ? AND tipo = 'con_asuntos'`).run(row.subdireccion, row.fecha);
  }
  res.json({ ok: true });
});

module.exports = router;
