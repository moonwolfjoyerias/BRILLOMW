// Calendario: los MISMOS eventos que la página (`eventos/{id}`, ver
// js/calendario-tabla.js y admin/encargado-calendario.js). Funciones puras
// para armar, validar y filtrar eventos; se guardan en ./acciones.
import type { PerfilUsuario } from '../sesion/perfil';

export const TIPOS_EVENTO = { presencial: 'Presencial', virtual: 'Virtual' } as const;
export type TipoEvento = keyof typeof TIPOS_EVENTO;

/** Igual que la página: las fotos de eventos se guardan más grandes que las de producto. */
export const EVENTO_FOTO_LADO_MAX = 1200;
export const EVENTO_FOTO_CALIDAD = 0.75;

export interface Acompanante { nombre: string; telefono?: string }

export interface Asistente {
  personaId?: string;
  nombre: string;
  fecha: string;
  /** Solo en las confirmaciones de eventosAsistencia (con acompañantes). */
  acompanantes?: Acompanante[];
}

/**
 * Acompañantes del evento (igual que la página, js/eventos-asistencia.js):
 * límite por e/l y si son prospectos o, si no, por qué van.
 */
export interface ConfigAcompanantes { permitido: boolean; limite: number; prospectos: boolean; motivo: string }
export const ACOMPANANTES_LIMITE_MAXIMO = 20;
export const SIN_ACOMPANANTES: ConfigAcompanantes = { permitido: false, limite: 1, prospectos: false, motivo: '' };

/** La configuración vigente del evento, o null si no se permiten acompañantes. */
export function configAcompanantes(ev: Record<string, unknown> | undefined): ConfigAcompanantes | null {
  const a = ev?.acompanantes as Partial<ConfigAcompanantes> | undefined;
  if (!a || a.permitido !== true) return null;
  const limite = Math.max(1, Math.min(ACOMPANANTES_LIMITE_MAXIMO, Math.floor(Number(a.limite) || 1)));
  return { permitido: true, limite, prospectos: a.prospectos === true, motivo: String(a.motivo ?? '').trim() };
}

/** Lo que se guarda en el evento: { permitido: false } o la configuración completa. */
function acompanantesParaGuardar(c: ConfigAcompanantes): ConfigAcompanantes | { permitido: false } {
  return c.permitido ? { permitido: true, limite: c.limite, prospectos: c.prospectos, motivo: c.prospectos ? '' : c.motivo.trim() } : { permitido: false };
}

export interface Evento {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** Texto libre, como en la página ("9:30 a.m."). */
  hora: string;
  lugarTexto: string;
  enlace: string;
  imagen: string;
  tieneFoto: boolean;
  /** 'mw' o 'emprendedora_lider' (evento propuesto por una e/l y aprobado). */
  origen?: string;
  asistentes: Asistente[];
  ultimaAccion?: { tipo: string; empleado: string; fecha: string; origen?: string };
  /** Campos que la página agregue en el futuro se conservan tal cual. */
  [extra: string]: unknown;
}

export interface DatosEvento {
  titulo: string;
  descripcion: string;
  tipo: string;
  fecha: string;
  hora: string;
  lugarTexto: string;
  enlace: string;
  imagen: string;
  acompanantes: ConfigAcompanantes;
}

const texto = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Mismas validaciones (y mismos mensajes) que obtenerDatosEventoCalendario(). */
export function validarEvento(d: DatosEvento): { ok: true; datos: DatosEvento } | { ok: false; error: string } {
  const limpio = { ...d, titulo: d.titulo.trim(), descripcion: d.descripcion.trim(), hora: d.hora.trim(), lugarTexto: d.lugarTexto.trim(), enlace: d.enlace.trim() };
  if (!limpio.titulo) return { ok: false, error: 'Escribe el título del evento.' };
  if (!limpio.descripcion) return { ok: false, error: 'Agrega una descripción.' };
  if (!limpio.fecha) return { ok: false, error: 'Selecciona la fecha del evento.' };
  if (!limpio.hora) return { ok: false, error: 'Escribe la hora del evento.' };
  if (!limpio.lugarTexto) return { ok: false, error: 'Escribe el lugar del evento.' };
  if (!(limpio.tipo in TIPOS_EVENTO)) return { ok: false, error: 'Elige si el evento es presencial o virtual.' };
  const a = d.acompanantes ?? SIN_ACOMPANANTES;
  if (a.permitido) {
    if (!(Number.isInteger(a.limite) && a.limite >= 1 && a.limite <= ACOMPANANTES_LIMITE_MAXIMO)) return { ok: false, error: `El máximo de acompañantes por e/l va de 1 a ${ACOMPANANTES_LIMITE_MAXIMO}.` };
    if (!a.prospectos && !a.motivo.trim()) return { ok: false, error: 'Escribe por qué van los acompañantes.' };
  }
  return { ok: true, datos: limpio };
}

const ultimaAccion = (tipo: string, perfil: PerfilUsuario, ahora: Date) => ({ tipo, empleado: perfil.nombre, fecha: ahora.toISOString(), origen: 'brillo' });

export function nuevoEvento(d: DatosEvento, perfil: PerfilUsuario, ahora = new Date()): Evento {
  return {
    id: `ev-${ahora.getTime()}`,
    ...d,
    acompanantes: acompanantesParaGuardar(d.acompanantes ?? SIN_ACOMPANANTES) as ConfigAcompanantes,
    tieneFoto: !!d.imagen,
    asistentes: [],
    ultimaAccion: ultimaAccion('Agregado', perfil, ahora)
  };
}

/** Edita conservando lo demás del evento (asistentes, origen…), como Object.assign en la página. */
export function eventoEditado(actual: Evento, d: DatosEvento, perfil: PerfilUsuario, ahora = new Date()): Evento {
  return { ...actual, ...d, acompanantes: acompanantesParaGuardar(d.acompanantes ?? SIN_ACOMPANANTES) as ConfigAcompanantes, tieneFoto: !!d.imagen, ultimaAccion: ultimaAccion('Editado', perfil, ahora) };
}

export function filtrarEventos(eventos: Evento[], busqueda: string, tipo: string): Evento[] {
  const t = busqueda.trim().toLowerCase();
  return eventos
    .filter(ev => !t || ev.titulo.toLowerCase().includes(t) || ev.lugarTexto.toLowerCase().includes(t) || ev.descripcion.toLowerCase().includes(t))
    .filter(ev => !tipo || ev.tipo === tipo)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function resumenEventos(eventos: Evento[], hoy: string) {
  return {
    total: eventos.length,
    proximos: eventos.filter(ev => ev.fecha >= hoy).length,
    presenciales: eventos.filter(ev => ev.tipo === 'presencial').length,
    virtuales: eventos.filter(ev => ev.tipo === 'virtual').length
  };
}

/**
 * Confirmaciones del evento: las de eventosAsistencia (cada e/l la suya,
 * con acompañantes) más las viejas guardadas dentro del evento, sin repetir.
 */
export function asistentesOrdenados(ev: Evento, deLaBase: Asistente[] = []): Asistente[] {
  const porPersona = new Map<string, Asistente>();
  ev.asistentes.forEach((a, i) => porPersona.set(a.personaId ?? `viejo-${i}`, a));
  deLaBase.forEach((a, i) => porPersona.set(a.personaId ?? `base-${i}`, a));
  return [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Mismo CSV que "Descargar lista de asistencia" de la página (con acompañantes). */
export function csvAsistencia(ev: Evento, fechaLarga: (iso: string) => string, deLaBase: Asistente[] = []): string {
  const prospecto = configAcompanantes(ev)?.prospectos ? 'Sí' : 'No';
  const filas = [
    ['Evento', 'Fecha del evento', 'Nombre', 'Tipo', 'Acompañante de', 'Teléfono', 'Prospecto', 'Fecha de confirmación'],
    ...asistentesOrdenados(ev, deLaBase).flatMap(a => [
      [ev.titulo, ev.fecha, a.nombre, 'Emprendedora/Líder', '', '', '', a.fecha ? fechaLarga(a.fecha) : ''],
      ...(a.acompanantes ?? []).map(c => [ev.titulo, ev.fecha, c.nombre, 'Acompañante', a.nombre, c.telefono ?? '', prospecto, ''])
    ])
  ];
  return '﻿' + filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/** Una confirmación de eventosAsistencia/{eventoId}__{personaId}. */
export function normalizarAsistencia(d: Record<string, unknown>): Asistente & { eventoId: string } {
  return {
    eventoId: texto(d.eventoId),
    personaId: texto(d.personaId),
    nombre: texto(d.nombre) || 'Sin nombre',
    fecha: texto(d.fecha),
    acompanantes: Array.isArray(d.acompanantes)
      ? (d.acompanantes as Record<string, unknown>[]).map(a => ({ nombre: texto(a.nombre), ...(a.telefono ? { telefono: texto(a.telefono) } : {}) })).filter(a => a.nombre)
      : []
  };
}

export function normalizarEvento(id: string, d: Record<string, unknown>): Evento {
  return {
    ...d,
    id,
    titulo: texto(d.titulo),
    descripcion: texto(d.descripcion),
    tipo: texto(d.tipo) || 'presencial',
    fecha: texto(d.fecha),
    hora: texto(d.hora),
    lugarTexto: texto(d.lugarTexto),
    enlace: texto(d.enlace),
    imagen: texto(d.imagen),
    tieneFoto: !!d.imagen,
    asistentes: Array.isArray(d.asistentes) ? (d.asistentes as Asistente[]).map(a => ({ ...a, nombre: texto(a.nombre), fecha: texto(a.fecha) })) : []
  };
}
