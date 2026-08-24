// =====================================================
// catalogo.js — Direcciones y Subdirecciones de la DEAJ
// para el módulo de Asuntos Relevantes (backend + frontend).
// =====================================================
// Cada dirección: { key, label, abbrev, color, subdirecciones: [{key,label}] }
// Las coordinaciones sin subdirecciones se modelan con una única "subdirección"
// homónima, para que ocupen una fila en el tablero de seguimiento diario.

const DIRECCIONES = [
  {
    key: 'asuntos_hasl',
    label: 'Dirección de Asuntos HASL',
    abbrev: 'DAHASL',
    color: '#F59E0B',
    subdirecciones: [
      { key: 'hasl_atencion_integral', label: 'Subdirección de Atención Integral y Sensibilización' },
      { key: 'hasl_capacitacion',      label: 'Subdirección de Capacitación, Conciliación y Seguimiento' },
      { key: 'hasl_investigacion',     label: 'Subdirección de Investigación' },
      { key: 'hasl_sustanciacion',     label: 'Subdirección de Sustanciación' },
    ],
  },
  {
    key: 'asuntos_laborales',
    label: 'Dirección de Asuntos Laborales',
    abbrev: 'DAL',
    color: '#EF4444',
    subdirecciones: [
      { key: 'lab_litigio',  label: 'Subdirección de Litigio Laboral' },
      { key: 'lab_recursos', label: 'Subdirección de Recursos y Consultas' },
    ],
  },
  {
    key: 'contratos_convenios',
    label: 'Dirección de Contratos y Convenios',
    abbrev: 'DCyC',
    color: '#10B981',
    subdirecciones: [
      { key: 'cyc_contratos', label: 'Subdirección de Contratos' },
      { key: 'cyc_convenios', label: 'Subdirección de Convenios' },
    ],
  },
  {
    key: 'instruccion_recursal',
    label: 'Dirección de Instrucción Recursal',
    abbrev: 'DIR',
    color: '#3B82F6',
    subdirecciones: [
      { key: 'ir_medios_a',     label: 'Subdirección de Atención a Medios de Impugnación A' },
      { key: 'ir_medios_b',     label: 'Subdirección de Atención a Medios de Impugnación B' },
      { key: 'ir_resoluciones', label: 'Subdirección de Resoluciones y Análisis' },
      { key: 'ir_multas',       label: 'Subdirección de Seguimiento a Multas y Reintegro de Remanentes' },
    ],
  },
  {
    key: 'normatividad_consulta',
    label: 'Dirección de Normatividad y Consulta',
    abbrev: 'DNyC',
    color: '#8B5CF6',
    subdirecciones: [
      { key: 'nyc_consulta',     label: 'Subdirección de Consulta' },
      { key: 'nyc_normatividad', label: 'Subdirección de Normatividad' },
    ],
  },
  {
    key: 'servicios_legales',
    label: 'Dirección de Servicios Legales',
    abbrev: 'DSL',
    color: '#14B8A6',
    subdirecciones: [
      { key: 'sl_penales',   label: 'Subdirección de Asuntos Penales' },
      { key: 'sl_servicios', label: 'Subdirección de Servicios Legales' },
    ],
  },
  {
    key: 'coordinacion_administrativa',
    label: 'Coordinación Administrativa',
    abbrev: 'CA',
    color: '#D97706',
    subdirecciones: [
      { key: 'coord_administrativa', label: 'Coordinación Administrativa' },
    ],
  },
  {
    key: 'coordinacion_analisis',
    label: 'Coordinación de Análisis de Información y Control Documental',
    abbrev: 'CAICD',
    color: '#6366F1',
    subdirecciones: [
      { key: 'coord_analisis', label: 'Coordinación de Análisis de Información y Control Documental' },
    ],
  },
];

const DIRECCION_KEYS = new Set(DIRECCIONES.map(d => d.key));

const SUBDIRECCIONES = {}; // subKey -> { direccionKey, label, direccionLabel }
for (const d of DIRECCIONES) {
  for (const s of d.subdirecciones) {
    SUBDIRECCIONES[s.key] = { direccionKey: d.key, label: s.label, direccionLabel: d.label };
  }
}

module.exports = { DIRECCIONES, DIRECCION_KEYS, SUBDIRECCIONES };
