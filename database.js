const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'relevantes.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Usuarios: espejo sincronizado por el portal (fuente de verdad). El SSO también
// hace upsert al entrar. La captura requiere una subdirección asignada.
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT DEFAULT 'sso',
    rol TEXT NOT NULL DEFAULT 'usuario',
    activo INTEGER NOT NULL DEFAULT 1,
    direccion TEXT,
    subdireccion TEXT,
    creado_en DATETIME DEFAULT (datetime('now','localtime'))
  )
`);

// Asuntos relevantes capturados (uno por asunto).
db.exec(`
  CREATE TABLE IF NOT EXISTS relevantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direccion TEXT NOT NULL,
    subdireccion TEXT NOT NULL,
    fecha TEXT NOT NULL,
    tema TEXT NOT NULL,
    estatus TEXT NOT NULL DEFAULT 'iniciado',
    prioridad TEXT NOT NULL DEFAULT 'media',
    descripcion TEXT,
    avance INTEGER NOT NULL DEFAULT 0,
    observaciones TEXT,
    adjunto_path TEXT,
    adjunto_nombre TEXT,
    adjunto_size INTEGER,
    creado_por INTEGER,
    creado_por_nombre TEXT,
    creado_en DATETIME DEFAULT (datetime('now','localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now','localtime'))
  )
`);
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_relevantes_fecha ON relevantes(fecha)`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_relevantes_sub ON relevantes(subdireccion)`); } catch (_) {}

// Marca de reporte diario por subdirección (con_asuntos | sin_asuntos).
// Alimenta el tablero de Seguimiento Diario (Reportado / Sin reporte).
db.exec(`
  CREATE TABLE IF NOT EXISTS relevantes_reportes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direccion TEXT NOT NULL,
    subdireccion TEXT NOT NULL,
    fecha TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'con_asuntos',
    user_id INTEGER,
    user_nombre TEXT,
    creado_en DATETIME DEFAULT (datetime('now','localtime')),
    actualizado_en DATETIME DEFAULT (datetime('now','localtime')),
    UNIQUE(subdireccion, fecha)
  )
`);

console.log('✅ Base de datos de Relevantes inicializada');

module.exports = db;
