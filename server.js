require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

require('./database'); // init sincrónico (crea tablas)

const app = express();
const PORT = process.env.PORT || 3007;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  exposedHeaders: ['Content-Disposition', 'Content-Length'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Los adjuntos NO se sirven como estáticos (antes /uploads/rel/* era público, sin sesión):
// se descargan por GET /api/relevantes/:id/adjunto, que valida sesión y subdirección.
app.use('/uploads', (req, res) => res.status(404).end());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/relevantes', require('./routes/relevantes'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🗂️  Módulo Relevantes — Seguimiento Diario DEAJ en http://localhost:${PORT}\n`);
});
