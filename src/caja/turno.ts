// Turnos de caja: una apertura y un corte por caja y por día (PLAN.md,
// "Corte de caja"). Se guardan en `brilloTurnosCaja`, colección propia de
// BRILLO; la página no la conoce ni la toca.

export const COLECCION_TURNOS = 'brilloTurnosCaja';

export const CAJAS = [
  { id: 'caja1', nombre: 'Caja 1' },
  { id: 'caja2', nombre: 'Caja 2' }
] as const;

export type IdCaja = (typeof CAJAS)[number]['id'];

export function nombreCaja(id: string): string {
  return CAJAS.find(c => c.id === id)?.nombre ?? id;
}

export interface PersonaTurno {
  uid: string;
  nombre: string;
  rol: string;
}

export interface TurnoCaja {
  id: string;
  /** Día de operación en hora local de la tienda, 'YYYY-MM-DD'. */
  fecha: string;
  caja: IdCaja;
  estado: 'abierta' | 'cerrada';
  /** Efectivo con el que abre la caja. */
  fondoInicial: number;
  abiertaPor: PersonaTurno;
  /** Hora de apertura según el servidor (ISO); null mientras se confirma. */
  abiertaEn: string | null;
}

/** 'YYYY-MM-DD' en la hora local del equipo (la tienda), no en UTC. */
export function fechaLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Un turno por caja y por día: el id lo garantiza (abrir dos veces choca). */
export function idTurno(fecha: string, caja: IdCaja): string {
  return `${fecha}_${caja}`;
}

/**
 * Lee el monto del fondo tal como lo escribe la persona ("500", "$1,250.50",
 * "1250,5"). Devuelve null si no es un monto válido. Vacío = $0.
 */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[$\s]/g, '');
  if (limpio === '') return 0;
  // "1,250.50" → miles con coma; "1250,5" → coma decimal.
  const normal = /,\d{1,2}$/.test(limpio) && !limpio.includes('.')
    ? limpio.replace(',', '.')
    : limpio.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}
