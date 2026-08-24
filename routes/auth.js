const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');
const { SUBDIRECCIONES, DIRECCION_KEYS } = require('../catalogo');

const router = express.Router();

const RELEVANTES_SSO_SECRET = process.env.RELEVANTES_SSO_SECRET;
if (!RELEVANTES_SSO_SECRET) { console.error('FATAL: RELEVANTES_SSO_SECRET no definido'); process.exit(1); }

// Deriva/normaliza la asignación dirección/subdirección desde el catálogo.
function normalizar(direccion, subdireccion) {
  let sub = subdireccion || null;
  let dir = direccion || null;
  if (sub && SUBDIRECCIONES[sub]) {
    dir = SUBDIRECCIONES[sub].direccionKey; // la dirección se infiere de la subdirección
  } else {
    sub = null;
    if (dir && !DIRECCION_KEYS.has(dir)) dir = null;
  }
  return { direccion: dir, subdireccion: sub };
}

// GET /api/auth/sso?sso_token=xxx  — entrada SSO desde el portal
router.get('/sso', (req, res) => {
  const { sso_token } = req.query;
  if (!sso_token) return res.redirect('/?error=missing_token');
  try {
    const p = jwt.verify(sso_token, RELEVANTES_SSO_SECRET);
    const { direccion, subdireccion } = normalizar(p.direccion, p.subdireccion);
    const rol = p.rol === 'admin' ? 'admin' : 'usuario';

    let u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(p.email);
    if (!u) {
      db.prepare(`INSERT INTO usuarios (nombre, email, password_hash, rol, activo, direccion, subdireccion)
                  VALUES (?, ?, 'sso', ?, 1, ?, ?)`)
        .run(p.nombre || p.email, p.email, rol, direccion, subdireccion);
      u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(p.email);
    } else {
      db.prepare(`UPDATE usuarios SET nombre = ?, rol = ?, activo = 1, direccion = ?, subdireccion = ? WHERE id = ?`)
        .run(p.nombre || u.nombre, rol, direccion, subdireccion, u.id);
      u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id);
    }

    const token = jwt.sign({ id: u.id, email: u.email, rol: u.rol }, JWT_SECRET, { expiresIn: '8h' });
    const safeToken = JSON.stringify(token);
    const safeUser = JSON.stringify({
      id: u.id, nombre: u.nombre, email: u.email, rol: u.rol,
      direccion: u.direccion || null, subdireccion: u.subdireccion || null,
    });
    res.send(`<!DOCTYPE html><html><body><script>localStorage.setItem('rel_token',${safeToken});localStorage.setItem('rel_user',${safeUser});window.location.href='/relevantes';</script></body></html>`);
  } catch (e) {
    res.redirect('/?error=invalid_token');
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
