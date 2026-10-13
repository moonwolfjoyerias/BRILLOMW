// Lista de deseos y Solicitudes de resurtido: las MISMAS reglas que
// js/lista-deseos-modelo.js de la página, sobre los mismos documentos
// (`listaDeseos/{id}`, `solicitudesResurtido/{id}` y el historial
// `listaDeseosHistorialEstados/{id}`). Funciones puras: devuelven el
// documento nuevo y lo que hay que guardar junto con él (historial,
// aviso y Actividad), para aplicarlo todo en UNA transacción.
import type { PerfilUsuario } from '../sesion/perfil';
import type { Aviso } from '../pagina/avisos';

export const ESTADOS_DESEO = {
  pendiente: 'Pendiente',
  en_seguimiento: 'En seguimiento',
  disponible: 'Disponible',
  atendida: 'Atendida',
  cancelada: 'Cancelada'
} as const;
export type EstadoDeseo = keyof typeof ESTADOS_DESEO;

export const ESTADOS_RESURTIDO = {
  pendiente: 'Pendiente',
  revisada: 'Revisada',
  atendida: 'Atendida'
} as const;
export type EstadoResurtido = keyof typeof ESTADOS_RESURTIDO;

export const ROLES_CREADOR: Record<string, string> = {
  staff: 'Staff',
  encargado: 'Encargado',
  admin: 'Admin',
  emprendedora: 'Emprendedora',
  lider: 'Líder'
};

export interface PiezaDeseo {
  id: string;
  producto: string;
  variante: string;
  cantidad: number;
  observaciones: string;
}

export interface SolicitudDeseo {
  id: string;
  destinatario: 'emprendedora' | 'publico';
  personaId: string | null;
  personaNombre: string | null;
  piezas: PiezaDeseo[];
  estado: string;
  creadoPorId: string;
  creadoPorNombre: string;
  creadoPorRol: string;
  fechaCreacion: string;
  comentarioEstado: string | null;
  productoId?: string;
  /** Campos que la página agregue en el futuro se conservan tal cual. */
  [extra: string]: unknown;
}

export interface RegistroHistorialDeseo {
  id: string;
  listaDeseosId: string;
  estadoAnterior: string | null;
  estadoNuevo: string;
  usuarioId: string;
  usuarioNombre: string;
  usuarioRol: string;
  fecha: string;
  comentario: string | null;
}

export interface Observacion {
  texto: string;
  usuarioId: string;
  usuarioNombre: string;
  fecha: string;
}

export interface SolicitudResurtido {
  id: string;
  producto: string;
  variante: string;
  cantidadSugerida: number | null;
  comentario: string;
  estado: string;
  solicitadoPorId: string;
  solicitadoPorNombre: string;
  solicitadoPorRol: string;
  fechaSolicitud: string;
  observaciones: Observacion[];
  revisadoPorId: string | null;
  revisadoPorNombre: string | null;
  fechaRevisado: string | null;
  atendidoPorId: string | null;
  atendidoPorNombre: string | null;
  fechaAtendido: string | null;
  [extra: string]: unknown;
}

export interface Efectos {
  historial?: RegistroHistorialDeseo;
  avisos?: Aviso[];
  actividad: { modulo: 'lista_deseos' | 'resurtido'; accion: string; descripcion: string };
}

export type Resultado<T> = { ok: true; doc: T; efectos: Efectos } | { ok: false; error: string };

const sufijo = () => Math.random().toString(36).slice(2, 7);
const texto = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function historial(
  listaDeseosId: string,
  estadoAnterior: string | null,
  estadoNuevo: string,
  perfil: PerfilUsuario,
  comentario: string | null,
  ahora: Date
): RegistroHistorialDeseo {
  return {
    id: `ldh-${ahora.getTime()}-${sufijo()}`,
    listaDeseosId,
    estadoAnterior,
    estadoNuevo,
    usuarioId: perfil.usuario,
    usuarioNombre: perfil.nombre,
    usuarioRol: perfil.rol,
    fecha: ahora.toISOString(),
    comentario: comentario || null
  };
}

export function resumenPiezas(piezas: PiezaDeseo[]): string {
  if (!piezas.length) return '—';
  return piezas.length === 1 ? piezas[0].producto : `${piezas[0].producto} (+${piezas.length - 1} más)`;
}

// ------------------------------------------------------------ lista de deseos

export interface DatosSolicitud {
  destinatario: 'emprendedora' | 'publico' | '';
  persona: { id: string; nombre: string } | null;
  piezas: { producto: string; cantidad: number | string }[];
}

/** crearSolicitudListaDeseos() de la página. */
export function crearSolicitud(d: DatosSolicitud, perfil: PerfilUsuario, ahora = new Date()): Resultado<SolicitudDeseo> {
  if (d.destinatario !== 'emprendedora' && d.destinatario !== 'publico') {
    return { ok: false, error: 'Indica si la solicitud es para una Emprendedora o para público en general.' };
  }
  if (d.destinatario === 'emprendedora' && !d.persona) return { ok: false, error: 'Busca y selecciona a la Emprendedora.' };
  const piezas = d.piezas
    .map((p, i) => ({
      id: `pz-${ahora.getTime()}-${i}${sufijo()}`,
      producto: texto(p.producto).trim(),
      variante: '',
      cantidad: Math.max(1, parseInt(String(p.cantidad), 10) || 1),
      observaciones: ''
    }))
    .filter(p => p.producto);
  if (!piezas.length) return { ok: false, error: 'Agrega al menos una pieza con su producto.' };

  const s: SolicitudDeseo = {
    id: `ld-${ahora.getTime()}-${sufijo()}`,
    destinatario: d.destinatario,
    personaId: d.destinatario === 'emprendedora' ? d.persona!.id : null,
    personaNombre: d.destinatario === 'emprendedora' ? d.persona!.nombre : null,
    piezas,
    estado: 'pendiente',
    creadoPorId: perfil.usuario,
    creadoPorNombre: perfil.nombre,
    creadoPorRol: perfil.rol,
    fechaCreacion: ahora.toISOString(),
    comentarioEstado: null
  };
  return {
    ok: true,
    doc: s,
    efectos: {
      historial: historial(s.id, null, 'pendiente', perfil, null, ahora),
      actividad: { modulo: 'lista_deseos', accion: 'crear_solicitud', descripcion: `Solicitud de lista de deseos creada (${s.id})` }
    }
  };
}

/**
 * actualizarEstadoListaDeseos() de la página. Marcar "disponible" exige
 * el producto real del catálogo y avisa a la Emprendedora (con enlace
 * para apartarlo).
 */
export function cambiarEstado(
  actual: SolicitudDeseo,
  nuevo: string,
  d: { comentario?: string; productoId?: string | null },
  perfil: PerfilUsuario,
  ahora = new Date()
): Resultado<SolicitudDeseo> {
  if (!(nuevo in ESTADOS_DESEO)) return { ok: false, error: 'Ese estado no es válido.' };
  if (nuevo === 'disponible' && !d.productoId) return { ok: false, error: 'Elige el producto del catálogo para marcarla disponible.' };
  const comentario = (d.comentario ?? '').trim() || null;
  const s: SolicitudDeseo = { ...structuredClone(actual), estado: nuevo, comentarioEstado: comentario };
  if (nuevo === 'disponible') s.productoId = d.productoId!;
  const anterior = actual.estado;

  const avisos: Aviso[] = [];
  if (nuevo === 'disponible' && s.destinatario === 'emprendedora' && s.personaId) {
    const resumen = s.piezas.length ? resumenPiezas(s.piezas) : 'tu pieza';
    avisos.push({
      texto: `¡Buena noticia! Ya está disponible lo que pediste en tu lista de deseos: ${resumen}. Toca aquí para apartarlo.`,
      link: 'catalogo',
      productoId: d.productoId!,
      paraId: s.personaId,
      rolDestino: 'emprendedora_lider'
    });
  }
  const etiqueta = (e: string) => ESTADOS_DESEO[e as EstadoDeseo] ?? e;
  return {
    ok: true,
    doc: s,
    efectos: {
      historial: historial(s.id, anterior, nuevo, perfil, comentario, ahora),
      avisos,
      actividad: {
        modulo: 'lista_deseos',
        accion: 'cambio_estado',
        descripcion: `Lista de deseos ${s.id}: ${etiqueta(anterior)} → ${etiqueta(nuevo)}${comentario ? ` — ${comentario}` : ''}`
      }
    }
  };
}

export interface FiltrosDeseos {
  texto: string;
  estado: string;
  destinatario: string;
  creador: string;
  desde: string;
  hasta: string;
}

/** Mismos filtros que Lista de deseos de Admin en la página. */
export function filtrarDeseos(lista: SolicitudDeseo[], f: FiltrosDeseos): SolicitudDeseo[] {
  const t = f.texto.trim().toLowerCase();
  return lista
    .filter(s =>
      !t ||
      (s.personaNombre || 'público en general').toLowerCase().includes(t) ||
      s.piezas.some(p => p.producto.toLowerCase().includes(t))
    )
    .filter(s => !f.destinatario || s.destinatario === f.destinatario)
    .filter(s => !f.estado || s.estado === f.estado)
    .filter(s => !f.creador || s.creadoPorRol === f.creador)
    .filter(s => !f.desde || s.fechaCreacion.slice(0, 10) >= f.desde)
    .filter(s => !f.hasta || s.fechaCreacion.slice(0, 10) <= f.hasta)
    .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion));
}

export function normalizarDeseo(id: string, d: Record<string, unknown>): SolicitudDeseo {
  const s = { ...d } as SolicitudDeseo;
  s.id = id;
  s.destinatario = d.destinatario === 'emprendedora' ? 'emprendedora' : 'publico';
  s.personaId = d.personaId ? texto(d.personaId) : null;
  s.personaNombre = d.personaNombre ? texto(d.personaNombre) : null;
  s.piezas = Array.isArray(d.piezas)
    ? (d.piezas as Record<string, unknown>[]).map((p, i) => ({
        ...p,
        id: texto(p.id) || `pz-${i}`,
        producto: texto(p.producto),
        variante: texto(p.variante),
        cantidad: Number(p.cantidad) || 1,
        observaciones: texto(p.observaciones)
      }))
    : [];
  s.estado = texto(d.estado) || 'pendiente';
  s.creadoPorId = texto(d.creadoPorId);
  s.creadoPorNombre = texto(d.creadoPorNombre);
  s.creadoPorRol = texto(d.creadoPorRol);
  s.fechaCreacion = texto(d.fechaCreacion);
  s.comentarioEstado = d.comentarioEstado ? texto(d.comentarioEstado) : null;
  return s;
}

// ------------------------------------------------------------ resurtido

/** Solo Staff y Encargado piden resurtido; Administración lo atiende. */
export const puedeSolicitarResurtido = (rol: string) => rol === 'staff' || rol === 'encargado';
export const administraResurtido = (rol: string) => rol === 'admin';

/** crearSolicitudResurtido() de la página: avisa a la bandeja de Staff. */
export function crearResurtido(
  d: { producto: string; variante: string; cantidadSugerida: string; comentario: string },
  perfil: PerfilUsuario,
  ahora = new Date()
): Resultado<SolicitudResurtido> {
  if (!puedeSolicitarResurtido(perfil.rol)) return { ok: false, error: 'Solo Staff o Encargado pueden solicitar un resurtido.' };
  const producto = d.producto.trim();
  if (!producto) return { ok: false, error: 'Indica el producto o tipo de pieza.' };
  const cantidad = d.cantidadSugerida.trim() ? Math.max(1, parseInt(d.cantidadSugerida, 10) || 0) : null;
  const s: SolicitudResurtido = {
    id: `res-${ahora.getTime()}-${sufijo()}`,
    producto,
    variante: d.variante.trim(),
    cantidadSugerida: cantidad,
    comentario: d.comentario.trim(),
    estado: 'pendiente',
    solicitadoPorId: perfil.usuario,
    solicitadoPorNombre: perfil.nombre,
    solicitadoPorRol: perfil.rol,
    fechaSolicitud: ahora.toISOString(),
    observaciones: [],
    revisadoPorId: null,
    revisadoPorNombre: null,
    fechaRevisado: null,
    atendidoPorId: null,
    atendidoPorNombre: null,
    fechaAtendido: null
  };
  const rol = ROLES_CREADOR[perfil.rol] ?? perfil.rol;
  return {
    ok: true,
    doc: s,
    efectos: {
      avisos: [{
        texto: `Solicitud de resurtido: ${perfil.nombre} (${rol}) solicita revisar el resurtido de ${producto}.${s.comentario ? ` Motivo: ${s.comentario}` : ''}`,
        link: 'deseos',
        paraId: null,
        rolDestino: 'staff',
        origen: 'staff'
      }],
      actividad: { modulo: 'resurtido', accion: 'crear_solicitud', descripcion: `Solicitud de resurtido creada: ${producto}${s.variante ? ` (${s.variante})` : ''}` }
    }
  };
}

function soloAdmin(perfil: PerfilUsuario): { ok: false; error: string } | null {
  return administraResurtido(perfil.rol) ? null : { ok: false, error: 'Solo Administración atiende las solicitudes de resurtido.' };
}

export function marcarRevisada(actual: SolicitudResurtido, perfil: PerfilUsuario, ahora = new Date()): Resultado<SolicitudResurtido> {
  const no = soloAdmin(perfil);
  if (no) return no;
  if (actual.estado !== 'pendiente') return { ok: false, error: 'Esta solicitud ya fue revisada.' };
  const s = { ...structuredClone(actual), estado: 'revisada', revisadoPorId: perfil.usuario, revisadoPorNombre: perfil.nombre, fechaRevisado: ahora.toISOString() };
  return { ok: true, doc: s, efectos: { actividad: { modulo: 'resurtido', accion: 'marcar_revisada', descripcion: `Solicitud de resurtido revisada: ${s.producto}` } } };
}

export function marcarAtendida(actual: SolicitudResurtido, perfil: PerfilUsuario, ahora = new Date()): Resultado<SolicitudResurtido> {
  const no = soloAdmin(perfil);
  if (no) return no;
  if (actual.estado === 'atendida') return { ok: false, error: 'Esta solicitud ya está atendida.' };
  const s = { ...structuredClone(actual), estado: 'atendida', atendidoPorId: perfil.usuario, atendidoPorNombre: perfil.nombre, fechaAtendido: ahora.toISOString() };
  const rol = s.solicitadoPorRol;
  return {
    ok: true,
    doc: s,
    efectos: {
      avisos:
        rol === 'staff' || rol === 'encargado' || rol === 'admin'
          ? [{ texto: `Tu solicitud de resurtido de ${s.producto} fue marcada como atendida.`, link: 'deseos', paraId: null, rolDestino: rol, origen: 'staff' }]
          : [],
      actividad: { modulo: 'resurtido', accion: 'marcar_atendida', descripcion: `Solicitud de resurtido atendida: ${s.producto}` }
    }
  };
}

export function agregarObservacion(actual: SolicitudResurtido, textoObs: string, perfil: PerfilUsuario, ahora = new Date()): Resultado<SolicitudResurtido> {
  const no = soloAdmin(perfil);
  if (no) return no;
  const t = textoObs.trim();
  if (!t) return { ok: false, error: 'Escribe una observación.' };
  const s = structuredClone(actual);
  s.observaciones = [...(s.observaciones ?? []), { texto: t, usuarioId: perfil.usuario, usuarioNombre: perfil.nombre, fecha: ahora.toISOString() }];
  return { ok: true, doc: s, efectos: { actividad: { modulo: 'resurtido', accion: 'agregar_observacion', descripcion: `Observación agregada a la solicitud de resurtido de ${s.producto}` } } };
}

export function normalizarResurtido(id: string, d: Record<string, unknown>): SolicitudResurtido {
  const s = { ...d } as SolicitudResurtido;
  s.id = id;
  s.producto = texto(d.producto);
  s.variante = texto(d.variante);
  s.cantidadSugerida = d.cantidadSugerida == null ? null : Number(d.cantidadSugerida) || null;
  s.comentario = texto(d.comentario);
  s.estado = texto(d.estado) || 'pendiente';
  s.solicitadoPorId = texto(d.solicitadoPorId);
  s.solicitadoPorNombre = texto(d.solicitadoPorNombre);
  s.solicitadoPorRol = texto(d.solicitadoPorRol);
  s.fechaSolicitud = texto(d.fechaSolicitud);
  s.observaciones = Array.isArray(d.observaciones) ? (d.observaciones as Observacion[]) : [];
  for (const k of ['revisadoPorId', 'revisadoPorNombre', 'fechaRevisado', 'atendidoPorId', 'atendidoPorNombre', 'fechaAtendido'] as const) {
    s[k] = d[k] ? texto(d[k]) : null;
  }
  return s;
}
