// Calendario: los MISMOS eventos que la página (`eventos/{id}`, ver
// js/calendario-tabla.js y admin/encargado-calendario.js). Funciones puras
// para armar, validar y filtrar eventos; se guardan en ./acciones.
import type { PerfilUsuario } from '../sesion/perfil';

export const TIPOS_EVENTO = { presencial: 'Presencial', virtual: 'Virtual' } as const;
export type TipoEvento = keyof typeof TIPOS_EVENTO;

/** Igual que la página: las fotos de eventos se guardan más grandes que las de producto. */
export const EVENTO_FOTO_LADO_MAX = 1200;
export const EVENTO_FOTO_CALIDAD = 0.75;

export interface Asistente {
  personaId?: string;
  nombre: string;
  fecha: string;
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
  return { ok: true, datos: limpio };
}

const ultimaAccion = (tipo: string, perfil: PerfilUsuario, ahora: Date) => ({ tipo, empleado: perfil.nombre, fecha: ahora.toISOString(), origen: 'brillo' });

export function nuevoEvento(d: DatosEvento, perfil: PerfilUsuario, ahora = new Date()): Evento {
  return {
    id: `ev-${ahora.getTime()}`,
    ...d,
    tieneFoto: !!d.imagen,
    asistentes: [],
    ultimaAccion: ultimaAccion('Agregado', perfil, ahora)
  };
}

/** Edita conservando lo demás del evento (asistentes, origen…), como Object.assign en la página. */
export function eventoEditado(actual: Evento, d: DatosEvento, perfil: PerfilUsuario, ahora = new Date()): Evento {
  return { ...actual, ...d, tieneFoto: !!d.imagen, ultimaAccion: ultimaAccion('Editado', perfil, ahora) };
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

export function asistentesOrdenados(ev: Evento): Asistente[] {
  return [...ev.asistentes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Mismo CSV que "Descargar lista de asistencia" de la página. */
export function csvAsistencia(ev: Evento, fechaLarga: (iso: string) => string): string {
  const filas = [['Evento', 'Fecha del evento', 'Nombre', 'Fecha de confirmación'], ...asistentesOrdenados(ev).map(a => [ev.titulo, ev.fecha, a.nombre, fechaLarga(a.fecha)])];
  return '﻿' + filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
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
