// =====================================================
// app.js — Módulo Relevantes (Seguimiento Diario) — SiCoDEAJ
// =====================================================

function cdmxToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

const state = {
  token: localStorage.getItem('rel_token'),
  user: null,
  view: 'tablero',
};
let relCatalogo = null;
let relWeekOffset = 0;
let relPanelDrillState = null;
let relAvancePrev = '25'; // último % de avance confirmado (para revertir si se cancela el 100%)

// ── API ─────────────────────────────────────────────
async function api(method, path, body = null, isFormData = false) {
  const opts = { method, headers: { Authorization: `Bearer ${state.token}` } };
  if (body && !isFormData) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  else if (body) { opts.body = body; }
  const res = await fetch(`/api/rel${path}`, opts);
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Error desconocido');
  }
  const ct = res.headers.get('Content-Type') || '';
  return ct.includes('application/json') ? res.json() : res;
}

function logout() {
  localStorage.removeItem('rel_token');
  localStorage.removeItem('rel_user');
  window.location.replace('/');
}

// ── UI helpers ──────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] ?? 'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function formatFecha(f) {
  if (!f) return '—';
  const d = new Date(f.includes('T') ? f : f + 'T12:00:00');
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function relEscape(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setupCharCounter(inputId, max) {
  const el = document.getElementById(inputId);
  if (!el) return;
  let counter = document.getElementById(inputId + '-counter');
  if (!counter) {
    counter = document.createElement('div');
    counter.id = inputId + '-counter';
    counter.className = 'char-counter';
    el.insertAdjacentElement('afterend', counter);
  }
  const update = () => {
    const len = el.value.length;
    counter.textContent = `${len} / ${max} caracteres`;
    counter.className = 'char-counter' + (len >= max ? ' error' : len >= max * 0.85 ? ' warn' : '');
  };
  el.addEventListener('input', update);
  update();
}

function fetchDownload(url, filename) {
  fetch(url, { headers: { Authorization: `Bearer ${state.token}` } })
    .then(r => { if (!r.ok) throw new Error('No disponible'); return r.blob(); })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(e => toast(e.message, 'error'));
}

// ── Navegación ──────────────────────────────────────
function showView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  document.getElementById(`nav-${view}`)?.classList.add('active');
  if (view === 'tablero') loadRelevantesBoard();
  if (view === 'panel') loadRelevantesPanel();
}

// ── Catálogo ────────────────────────────────────────
const REL_ESTATUS = {
  iniciado:   { label: 'Iniciado',   color: '#6B7280', bg: '#F3F4F6' },
  en_proceso: { label: 'En proceso', color: '#1D4ED8', bg: '#EFF6FF' },
  concluido:  { label: 'Concluido',  color: '#047857', bg: '#ECFDF5' },
};
const REL_PRIORIDAD = {
  baja:     { label: 'Baja',     color: '#059669', bg: '#ECFDF5' },
  media:    { label: 'Media',    color: '#D97706', bg: '#FFFBEB' },
  alta:     { label: 'Alta',     color: '#DC2626', bg: '#FEF2F2' },
  muy_alta: { label: 'Muy Alta', color: '#9D174D', bg: '#FDF2F8' },
};
const REL_AVANCES = [25, 50, 75, 90, 100];

const TXT_TEMA = 'Indica en una sola frase el asunto principal del reporte. Debe ser un título breve que identifique claramente el tema del hecho, actividad, incidencia o comunicación ocurrida en el día. Evita explicaciones detalladas; estas se describen en el apartado "Descripción del tema".';
const TXT_OBS  = 'Indique el área solicitante, la etapa actual del asunto (revisión, construcción, validación, aprobación, etc.), y cualquier información complementaria que sea relevante.';
const TXT_ADJ  = '¿Existe documentación que permita profundizar en el tema reportado? (requerimiento, proyecto, oficio, etc.)';

async function ensureRelCatalogo() {
  if (relCatalogo) return relCatalogo;
  try { relCatalogo = await api('GET', '/relevantes/catalogo'); }
  catch { relCatalogo = { direcciones: [] }; }
  return relCatalogo;
}
function relDirecciones() { return relCatalogo?.direcciones || []; }
function relSubLabel(subKey) {
  for (const d of relDirecciones()) { const s = d.subdirecciones.find(x => x.key === subKey); if (s) return s.label; }
  return subKey || '—';
}
function relDirOfSub(subKey) { return relDirecciones().find(d => d.subdirecciones.some(s => s.key === subKey)) || null; }
// Direcciones/subdirecciones visibles: admin ve todas; capturista sólo la suya.
function relVisibleDirecciones() {
  if (state.user?.rol === 'admin') return relDirecciones();
  const sub = state.user?.subdireccion;
  if (!sub) return [];
  return relDirecciones()
    .map(d => ({ ...d, subdirecciones: d.subdirecciones.filter(s => s.key === sub) }))
    .filter(d => d.subdirecciones.length);
}

// ── Fechas de la semana ─────────────────────────────
function relIsoLocal(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function relMonday(offset = 0) {
  const today = new Date(cdmxToday() + 'T12:00:00');
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(today); monday.setDate(diff);
  return relIsoLocal(monday);
}
function relWeekDates(monday) {
  const m = new Date(monday + 'T12:00:00');
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(m); d.setDate(m.getDate() + i); return relIsoLocal(d); });
}
function relWorkDates(monday) {
  return relWeekDates(monday).filter(d => { const dow = new Date(d + 'T12:00:00').getDay(); return dow !== 0 && dow !== 6; });
}
const REL_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const REL_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function relWeekLabel(dates) {
  const s = new Date(dates[0] + 'T12:00:00'), e = new Date(dates[6] + 'T12:00:00');
  const sm = REL_MONTHS[s.getMonth()], em = REL_MONTHS[e.getMonth()];
  return s.getMonth() === e.getMonth() ? `del ${s.getDate()} al ${e.getDate()} de ${sm}` : `del ${s.getDate()} de ${sm} al ${e.getDate()} de ${em}`;
}

// ── Tablero ─────────────────────────────────────────
async function loadRelevantesBoard() {
  await ensureRelCatalogo();
  const monday = relMonday(relWeekOffset);
  const dates = relWeekDates(monday);
  const work = relWorkDates(monday);
  document.getElementById('rel-week-label').textContent = `Asuntos relevantes · Semana ${relWeekLabel(dates)}`;
  const wrap = document.getElementById('rel-matrix');
  wrap.innerHTML = '<div class="rel-loading">Cargando…</div>';
  let data;
  try { data = await api('GET', `/relevantes/matrix?monday=${monday}`); }
  catch (e) { wrap.innerHTML = `<div class="rel-loading">${e.message}</div>`; return; }
  renderRelMatrix(wrap, work, data);
}

function relCellStatus(subKey, dateStr, data) {
  const dow = new Date(dateStr + 'T12:00:00').getDay();
  if (dow === 0 || dow === 6) return { k: 'inhabil' };
  if (dateStr > cdmxToday()) return { k: 'pendiente' };
  const rep = data.reportes.find(r => r.subdireccion === subKey && r.fecha === dateStr);
  if (rep) {
    const c = data.conteos.find(x => x.subdireccion === subKey && x.fecha === dateStr);
    return { k: 'reportado', tipo: rep.tipo, count: c ? c.n : 0 };
  }
  return { k: 'vacio' };
}

function renderRelMatrix(wrap, work, data) {
  const head = `
    <tr>
      <th class="rel-th rel-th-area">Área</th>
      <th class="rel-th rel-th-sub">Dirección / Subdirección</th>
      ${work.map(d => { const dt = new Date(d + 'T12:00:00'); return `<th class="rel-th rel-th-day">${REL_DAYS[dt.getDay()]} ${dt.getDate()}</th>`; }).join('')}
    </tr>`;
  const visibles = relVisibleDirecciones();
  if (!visibles.length) {
    wrap.innerHTML = '<div class="rel-loading">Tu usuario no tiene una subdirección asignada. Pide a un administrador que te la asigne en el portal.</div>';
    return;
  }
  const rows = visibles.map(dir => dir.subdirecciones.map((s, i) => {
    const areaCell = i === 0
      ? `<td class="rel-area" rowspan="${dir.subdirecciones.length}" style="background:${dir.color}"><span>${dir.abbrev}</span></td>` : '';
    const cells = work.map(d => {
      const st = relCellStatus(s.key, d, data);
      if (st.k === 'inhabil') return `<td class="rel-cell rel-inhabil"></td>`;
      if (st.k === 'pendiente') return `<td class="rel-cell rel-pendiente">Pendiente</td>`;
      if (st.k === 'vacio') return `<td class="rel-cell rel-vacio">Sin reporte</td>`;
      if (st.tipo === 'sin_asuntos') return `<td class="rel-cell rel-reportado">Sin asuntos</td>`;
      return `<td class="rel-cell rel-reportado rel-clic" data-sub="${s.key}" data-fecha="${d}" title="Ver ${st.count} asunto(s)">Reportado${st.count ? ` (${st.count})` : ''}</td>`;
    }).join('');
    return `<tr>${areaCell}<td class="rel-sub">${relEscape(s.label)}</td>${cells}</tr>`;
  }).join('')).join('');
  wrap.innerHTML = `<table class="rel-matrix"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  wrap.querySelectorAll('.rel-clic').forEach(el => el.addEventListener('click', () => openRelDia(el.dataset.sub, el.dataset.fecha)));
}

// ── Modal: asuntos de una subdirección en un día ────
async function openRelDia(subKey, fecha) {
  document.getElementById('modal-relevante-titulo').textContent = `${relSubLabel(subKey)} — ${formatFecha(fecha)}`;
  const body = document.getElementById('modal-relevante-body');
  body.innerHTML = '<div class="rel-loading">Cargando…</div>';
  openModal('modal-relevante');
  try {
    const items = await api('GET', `/relevantes?subdireccion=${encodeURIComponent(subKey)}&fecha_inicio=${fecha}&fecha_fin=${fecha}`);
    if (!items.length) { body.innerHTML = '<p class="empty-msg">Sin asuntos.</p>'; return; }
    body.innerHTML = items.map(it => {
      const e = REL_ESTATUS[it.estatus] || {}, p = REL_PRIORIDAD[it.prioridad] || {};
      return `
      <div class="rel-item-card">
        <div class="rel-item-head">
          <span class="rel-item-tema">${relEscape(it.tema)}</span>
          <span class="rel-chip" style="background:${p.bg};color:${p.color}">${p.label || it.prioridad}</span>
        </div>
        <div class="rel-item-meta">
          <span class="rel-chip" style="background:${e.bg};color:${e.color}">${e.label || it.estatus}</span>
          <span class="rel-avance">Avance: ${it.avance}%</span>
        </div>
        ${it.descripcion ? `<p class="rel-item-desc">${relEscape(it.descripcion)}</p>` : ''}
        <div class="rel-item-actions"><button class="btn btn-secondary btn-sm" onclick="openRelDetalle(${it.id})">Ver detalle</button></div>
      </div>`;
    }).join('') + `<div style="text-align:right;margin-top:12px"><button class="btn btn-secondary" onclick="closeModal('modal-relevante')">Cerrar</button></div>`;
  } catch (e) { body.innerHTML = `<p class="empty-msg">${e.message}</p>`; }
}

// ── Modal: detalle ──────────────────────────────────
async function openRelDetalle(id) {
  const body = document.getElementById('modal-relevante-body');
  body.innerHTML = '<div class="rel-loading">Cargando…</div>';
  openModal('modal-relevante');
  try {
    const it = await api('GET', `/relevantes/${id}`);
    const e = REL_ESTATUS[it.estatus] || {}, p = REL_PRIORIDAD[it.prioridad] || {};
    const puedeEditar = state.user.rol === 'admin' || it.creado_por === state.user.id;
    document.getElementById('modal-relevante-titulo').textContent = 'Detalle del asunto relevante';
    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><span class="detail-label">Fecha</span><span class="detail-value">${formatFecha(it.fecha)}</span></div>
        <div class="detail-item"><span class="detail-label">Subdirección</span><span class="detail-value">${relEscape(relSubLabel(it.subdireccion))}</span></div>
        <div class="detail-item full"><span class="detail-label">Tema</span><span class="detail-value">${relEscape(it.tema)}</span></div>
        <div class="detail-item"><span class="detail-label">Estatus</span><span class="rel-chip" style="background:${e.bg};color:${e.color}">${e.label || it.estatus}</span></div>
        <div class="detail-item"><span class="detail-label">Prioridad</span><span class="rel-chip" style="background:${p.bg};color:${p.color}">${p.label || it.prioridad}</span></div>
        <div class="detail-item"><span class="detail-label">Avance</span><span class="detail-value">${it.avance}%</span></div>
        <div class="detail-item"><span class="detail-label">Capturó</span><span class="detail-value">${relEscape(it.creado_por_nombre || '—')}</span></div>
        <div class="detail-item full"><span class="detail-label">Descripción del tema</span><div class="justif-box">${relEscape(it.descripcion) || '—'}</div></div>
        <div class="detail-item full"><span class="detail-label">Observaciones</span><div class="justif-box">${relEscape(it.observaciones) || '—'}</div></div>
        <div class="detail-item full"><span class="detail-label">Documentación adjunta</span>
          ${it.adjunto_path
            ? `<button class="btn btn-secondary btn-sm" onclick="fetchDownload('/api/rel/relevantes/${it.id}/adjunto','${relEscape(it.adjunto_nombre).replace(/'/g, "\\'")}')">⬇ ${relEscape(it.adjunto_nombre)}</button>`
            : '<span class="detail-value">— Sin adjunto —</span>'}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal('modal-relevante')">Cerrar</button>
        ${puedeEditar ? `<button class="btn btn-danger" onclick="relEliminar(${it.id})">Eliminar</button>` : ''}
        ${puedeEditar ? `<button class="btn btn-primary" onclick="openRelevanteModal(${it.id})">Editar</button>` : ''}
      </div>`;
  } catch (e) { body.innerHTML = `<p class="empty-msg">${e.message}</p>`; }
}

async function relEliminar(id) {
  if (!confirm('¿Eliminar este asunto relevante? Esta acción no se puede deshacer.')) return;
  try {
    await api('DELETE', `/relevantes/${id}`);
    toast('Asunto eliminado', 'success');
    closeModal('modal-relevante');
    if (state.view === 'tablero') loadRelevantesBoard();
    if (state.view === 'panel') loadRelevantesPanel();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Modal: captura / edición ────────────────────────
async function openRelevanteModal(editId = null) {
  await ensureRelCatalogo();
  const titulo = document.getElementById('modal-relevante-titulo');
  const body = document.getElementById('modal-relevante-body');
  const isAdmin = state.user.rol === 'admin';

  let record = null;
  if (editId) {
    try { record = await api('GET', `/relevantes/${editId}`); }
    catch (e) { toast(e.message, 'error'); return; }
  }

  if (!isAdmin && !state.user.subdireccion) {
    titulo.textContent = 'Captura no disponible';
    body.innerHTML = `<div class="form-error" style="position:static">Tu usuario no tiene una subdirección asignada. Pide a un administrador que te la asigne en el <strong>portal</strong> para poder capturar asuntos relevantes.</div>
      <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal('modal-relevante')">Cerrar</button></div>`;
    openModal('modal-relevante');
    return;
  }

  titulo.textContent = editId ? 'Editar asunto relevante' : 'Nuevo asunto relevante';
  const subActual = record ? record.subdireccion : (isAdmin ? '' : state.user.subdireccion);
  const dirActual = record ? record.direccion : (isAdmin ? '' : (relDirOfSub(state.user.subdireccion)?.key || ''));

  const selectorSub = (isAdmin && !editId)
    ? `<div class="form-group col-2">
         <label>Dirección <span class="required">*</span></label>
         <select id="rel-f-direccion" onchange="relFillSub('')">
           <option value="">— Selecciona —</option>
           ${relDirecciones().map(d => `<option value="${d.key}">${d.label}</option>`).join('')}
         </select>
       </div>
       <div class="form-group col-2">
         <label>Subdirección <span class="required">*</span></label>
         <select id="rel-f-subdireccion"><option value="">— Selecciona una dirección —</option></select>
       </div>`
    : `<div class="form-group col-full">
         <label>Subdirección</label>
         <div class="rel-readonly">${relEscape(relSubLabel(subActual))}</div>
         <input type="hidden" id="rel-f-subdireccion" value="${subActual}" />
         <input type="hidden" id="rel-f-direccion" value="${dirActual}" />
       </div>`;

  const preguntaReporte = editId ? '' : `
      <div class="form-group col-full">
        <label>¿Tienes asuntos relevantes que reportar? <span class="required">*</span></label>
        <div class="rel-radio-row">
          <label class="rel-radio"><input type="radio" name="rel-tiene" value="si"> Sí, capturar asunto</label>
          <label class="rel-radio"><input type="radio" name="rel-tiene" value="no"> No hay asuntos que reportar</label>
        </div>
      </div>`;

  const camposAsunto = `
    <div id="rel-campos-asunto" style="display:${editId ? 'contents' : 'none'}">
      <div class="form-group col-full">
        <label for="rel-f-tema">Tema <span class="required">*</span></label>
        <p class="rel-help">${TXT_TEMA}</p>
        <input type="text" id="rel-f-tema" maxlength="255" placeholder="Título breve del asunto" value="${record ? relEscape(record.tema) : ''}" />
      </div>
      <div class="form-group col-2">
        <label for="rel-f-estatus">Estatus <span class="required">*</span></label>
        <select id="rel-f-estatus" onchange="relOnEstatusChange()">
          ${Object.entries(REL_ESTATUS).map(([k, v]) => `<option value="${k}" ${record && record.estatus === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group col-2">
        <label for="rel-f-prioridad">Prioridad <span class="required">*</span></label>
        <select id="rel-f-prioridad">
          ${Object.entries(REL_PRIORIDAD).map(([k, v]) => `<option value="${k}" ${(record ? record.prioridad === k : k === 'media') ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group col-full">
        <label for="rel-f-descripcion">Descripción del tema</label>
        <textarea id="rel-f-descripcion" rows="5" maxlength="2000" placeholder="Describe el asunto con el detalle necesario">${record ? relEscape(record.descripcion) : ''}</textarea>
      </div>
      <div class="form-group col-2">
        <label for="rel-f-avance">Porcentaje de avance</label>
        <select id="rel-f-avance" onchange="relOnAvanceChange()">
          ${REL_AVANCES.map(a => `<option value="${a}" ${record && record.avance === a ? 'selected' : ''}>${a}%</option>`).join('')}
        </select>
        <p class="rel-help" id="rel-avance-hint"></p>
      </div>
      <div class="form-group col-full">
        <label for="rel-f-observaciones">Observaciones</label>
        <p class="rel-help">${TXT_OBS}</p>
        <textarea id="rel-f-observaciones" rows="3" maxlength="512" placeholder="Información complementaria">${record ? relEscape(record.observaciones) : ''}</textarea>
      </div>
      <div class="form-group col-full">
        <label for="rel-f-adjunto">Adjuntar documentación</label>
        <p class="rel-help">${TXT_ADJ}</p>
        ${record && record.adjunto_path ? `<p class="rel-note">Actual: ${relEscape(record.adjunto_nombre)} (subir otro lo reemplaza)</p>` : ''}
        <input type="file" id="rel-f-adjunto" class="file-input" />
        <p class="rel-help">Tamaño máximo: 20 MB.</p>
      </div>
    </div>`;

  body.innerHTML = `
    <form id="rel-form">
      <div class="form-grid">
        <div class="form-group col-2">
          <label for="rel-f-fecha">Fecha <span class="required">*</span></label>
          <input type="date" id="rel-f-fecha" value="${record ? record.fecha : cdmxToday()}" ${editId ? 'disabled' : ''} />
        </div>
        ${selectorSub}
        ${preguntaReporte}
        ${camposAsunto}
      </div>
      <div id="rel-form-error" class="form-error hidden"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal('modal-relevante')">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="rel-btn-guardar">Guardar</button>
      </div>
    </form>`;

  openModal('modal-relevante');
  setupCharCounter('rel-f-tema', 255);
  setupCharCounter('rel-f-descripcion', 2000);
  setupCharCounter('rel-f-observaciones', 512);

  if (!editId) {
    document.querySelectorAll('input[name="rel-tiene"]').forEach(r => r.addEventListener('change', () => {
      const si = document.querySelector('input[name="rel-tiene"]:checked')?.value === 'si';
      document.getElementById('rel-campos-asunto').style.display = si ? 'contents' : 'none';
      document.getElementById('rel-btn-guardar').textContent = si ? 'Guardar asunto' : 'Registrar (sin asuntos)';
    }));
  }
  relOnEstatusChange();
  document.getElementById('rel-form').addEventListener('submit', (e) => { e.preventDefault(); relGuardar(editId); });
}

function relFillSub(selected = '') {
  const dirKey = document.getElementById('rel-f-direccion')?.value || '';
  const sel = document.getElementById('rel-f-subdireccion');
  if (!sel || sel.tagName !== 'SELECT') return;
  const dir = relDirecciones().find(d => d.key === dirKey);
  const subs = dir ? dir.subdirecciones : [];
  sel.innerHTML = subs.length
    ? subs.map(s => `<option value="${s.key}" ${s.key === selected ? 'selected' : ''}>${s.label}</option>`).join('')
    : '<option value="">— Selecciona una dirección —</option>';
}

function relOnEstatusChange() {
  const est = document.getElementById('rel-f-estatus')?.value;
  const av = document.getElementById('rel-f-avance');
  const hint = document.getElementById('rel-avance-hint');
  if (!av) return;
  if (est === 'concluido') {
    av.value = '100'; av.disabled = true;
    if (hint) hint.textContent = 'El asunto está concluido: el avance queda en 100%.';
  } else {
    av.disabled = false;
    if (av.value === '100') av.value = '90';
    if (hint) hint.textContent = 'Al seleccionar 100% se te preguntará si el asunto está concluido.';
  }
  relAvancePrev = av.value; // registra el valor ya asentado
}

function relOnAvanceChange() {
  const av = document.getElementById('rel-f-avance');
  const est = document.getElementById('rel-f-estatus');
  if (!av || !est) return;
  if (av.value === '100' && est.value !== 'concluido') {
    if (confirm('El avance es 100%. ¿El asunto está concluido? Se cambiará el estatus a "Concluido".')) {
      est.value = 'concluido';
      relOnEstatusChange(); // deja 100% bloqueado y actualiza relAvancePrev
    } else {
      av.value = relAvancePrev; // el usuario NO quiere concluir → regresa al valor anterior
      return;
    }
  }
  relAvancePrev = av.value;
}

async function relGuardar(editId) {
  const errEl = document.getElementById('rel-form-error');
  const btn = document.getElementById('rel-btn-guardar');
  errEl.classList.add('hidden');
  const fail = (m) => { errEl.textContent = m; errEl.classList.remove('hidden'); };

  const fecha = document.getElementById('rel-f-fecha').value;
  if (!fecha) return fail('La fecha es requerida.');

  if (!editId) {
    const tiene = document.querySelector('input[name="rel-tiene"]:checked')?.value;
    if (!tiene) return fail('Indica si hay asuntos relevantes que reportar.');
    if (tiene === 'no') {
      const sub = document.getElementById('rel-f-subdireccion')?.value || undefined;
      btn.disabled = true;
      try {
        await api('POST', '/relevantes/sin-asuntos', { fecha, subdireccion: sub });
        toast('Se registró que no hay asuntos relevantes para ' + formatFecha(fecha), 'success');
        closeModal('modal-relevante'); loadRelevantesBoard();
      } catch (e) { fail(e.message); } finally { btn.disabled = false; }
      return;
    }
  }

  const tema = document.getElementById('rel-f-tema').value.trim();
  if (!tema) return fail('El tema es requerido.');
  const sub = document.getElementById('rel-f-subdireccion')?.value || '';
  if (state.user.rol === 'admin' && !editId && !sub) return fail('Selecciona la dirección y subdirección.');

  const fd = new FormData();
  fd.append('fecha', fecha);
  if (sub) fd.append('subdireccion', sub);
  fd.append('tema', tema);
  fd.append('estatus', document.getElementById('rel-f-estatus').value);
  fd.append('prioridad', document.getElementById('rel-f-prioridad').value);
  fd.append('descripcion', document.getElementById('rel-f-descripcion').value);
  fd.append('avance', document.getElementById('rel-f-avance').value);
  fd.append('observaciones', document.getElementById('rel-f-observaciones').value);
  const file = document.getElementById('rel-f-adjunto')?.files[0];
  if (file) {
    if (file.size > 20 * 1024 * 1024) return fail('El adjunto supera los 20 MB.');
    fd.append('adjunto', file);
  }

  btn.disabled = true;
  try {
    if (editId) await api('PUT', `/relevantes/${editId}`, fd, true);
    else await api('POST', '/relevantes', fd, true);
    toast(editId ? 'Asunto actualizado' : 'Asunto relevante registrado', 'success');
    closeModal('modal-relevante');
    if (state.view === 'tablero') loadRelevantesBoard();
    if (state.view === 'panel') loadRelevantesPanel();
  } catch (e) { fail(e.message); } finally { btn.disabled = false; }
}

// ── Panel ───────────────────────────────────────────
async function loadRelevantesPanel() {
  await ensureRelCatalogo();
  const dirSel = document.getElementById('relp-direccion');
  // El capturista sólo ve lo suyo: no tiene sentido filtrar por dirección.
  if (dirSel) dirSel.style.display = state.user?.rol === 'admin' ? '' : 'none';
  if (dirSel && dirSel.options.length <= 1) {
    dirSel.innerHTML = '<option value="">Todas las direcciones</option>' +
      relDirecciones().map(d => `<option value="${d.key}">${d.label}</option>`).join('');
  }
  const params = {
    fecha_inicio: document.getElementById('relp-fecha-inicio').value,
    fecha_fin: document.getElementById('relp-fecha-fin').value,
    direccion: document.getElementById('relp-direccion').value,
    prioridad: document.getElementById('relp-filtro-prioridad').value,
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
  const qs = new URLSearchParams(params).toString();
  try {
    const stats = await api('GET', `/relevantes/stats${qs ? '?' + qs : ''}`);
    renderRelStatCards('relp-estatus', REL_ESTATUS, stats.por_estatus, 'estatus');
    renderRelStatCards('relp-prioridad', REL_PRIORIDAD, stats.por_prioridad, 'prioridad');
    renderRelRecientes(stats.recientes);
  } catch (e) { toast(e.message, 'error'); }
}

function renderRelStatCards(containerId, config, counts, kind) {
  document.getElementById(containerId).innerHTML = Object.entries(config).map(([k, v]) => `
    <button class="rel-stat-card" style="background:${v.bg};border-color:${v.color}33" onclick="relPanelDrill('${kind}','${k}')">
      <span class="rel-stat-value" style="color:${v.color}">${counts?.[k] ?? 0}</span>
      <span class="rel-stat-label" style="color:${v.color}">${v.label}</span>
    </button>`).join('');
}

function relPanelDrill(kind, value) { relPanelDrillState = { kind, value }; loadRelevantesPanelList(); }

async function loadRelevantesPanelList() {
  const params = {
    fecha_inicio: document.getElementById('relp-fecha-inicio').value,
    fecha_fin: document.getElementById('relp-fecha-fin').value,
    direccion: document.getElementById('relp-direccion').value,
    prioridad: document.getElementById('relp-filtro-prioridad').value,
  };
  if (relPanelDrillState) params[relPanelDrillState.kind] = relPanelDrillState.value;
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
  const qs = new URLSearchParams(params).toString();
  try { renderRelRecientes(await api('GET', `/relevantes${qs ? '?' + qs : ''}`)); }
  catch (e) { toast(e.message, 'error'); }
}

function renderRelRecientes(rows) {
  const tbody = document.getElementById('relp-recientes-tbody');
  const empty = document.getElementById('relp-recientes-empty');
  if (!rows || !rows.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  tbody.innerHTML = rows.map(it => {
    const e = REL_ESTATUS[it.estatus] || {}, p = REL_PRIORIDAD[it.prioridad] || {};
    return `
    <tr class="clickable-row" onclick="openRelDetalle(${it.id})">
      <td style="white-space:nowrap">${formatFecha(it.fecha)}</td>
      <td title="${relEscape(relSubLabel(it.subdireccion))}">${relEscape(relSubLabel(it.subdireccion))}</td>
      <td>${relEscape(it.tema)}</td>
      <td><span class="rel-chip" style="background:${e.bg};color:${e.color}">${e.label || it.estatus}</span></td>
      <td><span class="rel-chip" style="background:${p.bg};color:${p.color}">${p.label || it.prioridad}</span></td>
      <td>${it.avance}%</td>
    </tr>`;
  }).join('');
}

// ── Modal helpers ───────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── Listeners ───────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(item =>
  item.addEventListener('click', e => { e.preventDefault(); showView(item.dataset.view); }));
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('rel-week-prev').addEventListener('click', () => { relWeekOffset--; loadRelevantesBoard(); });
document.getElementById('rel-week-next').addEventListener('click', () => { relWeekOffset++; loadRelevantesBoard(); });
document.getElementById('rel-week-today').addEventListener('click', () => { relWeekOffset = 0; loadRelevantesBoard(); });
document.getElementById('btn-nuevo-relevante').addEventListener('click', () => openRelevanteModal());
document.getElementById('modal-relevante-close').addEventListener('click', () => closeModal('modal-relevante'));
document.getElementById('modal-relevante').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('modal-relevante'); });
document.getElementById('relp-filtrar').addEventListener('click', () => { relPanelDrillState = null; loadRelevantesPanel(); });
document.getElementById('relp-limpiar').addEventListener('click', () => {
  ['relp-fecha-inicio', 'relp-fecha-fin', 'relp-direccion', 'relp-filtro-prioridad'].forEach(id => { document.getElementById(id).value = ''; });
  relPanelDrillState = null; loadRelevantesPanel();
});

// ── Init / SSO ──────────────────────────────────────
async function initApp() {
  const ssoToken = new URLSearchParams(location.search).get('sso_token');
  if (ssoToken) { window.location.href = `/api/rel/auth/sso?sso_token=${ssoToken}`; return; }
  if (!state.token) { window.location.replace('/'); return; }
  try {
    const res = await fetch('/api/rel/auth/me', { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) { logout(); return; }
    state.user = (await res.json()).user;
  } catch { logout(); return; }

  const isAdmin = state.user.rol === 'admin';
  document.getElementById('user-avatar').textContent = (state.user.nombre || 'U')[0].toUpperCase();
  document.getElementById('user-name').textContent = state.user.nombre;
  document.getElementById('user-role').textContent = isAdmin ? 'Administrador'
    : state.user.subdireccion ? relSubLabel(state.user.subdireccion) : 'Usuario';

  document.getElementById('auth-loading').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  await ensureRelCatalogo();
  document.getElementById('user-role').textContent = isAdmin ? 'Administrador'
    : state.user.subdireccion ? relSubLabel(state.user.subdireccion) : 'Usuario';
  showView('tablero');
}

initApp();
