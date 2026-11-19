// Plan MW con los datos del árbol de mi-equipo (la verdad para rangos,
// comisiones y boletos): quién está cerca de subir de rango, quién subió en
// el mes, el bono por rango de la primera vez que se logra y el vínculo de
// cada persona del árbol con su cuenta de la página.
import {
  buscarPersonaEnArbol,
  lideres,
  mesAnterior,
  ORDEN_RANGO,
  RANGOS,
  rangoDelMes,
  rangoHistorico,
  type InfoRango,
  type Miembro,
  type Rango,
  type RangoKey
} from './modelo';

export interface Requisito { nombre: string; lleva: number; meta: number; ok: boolean; dinero: boolean }

export interface ProximoRango {
  lider: Miembro;
  actual: Rango;
  siguiente: Rango;
  requisitos: Requisito[];
  /** Promedio de lo cumplido de cada requisito (0–100). */
  progresoPct: number;
  /** Ya cumple todo para el siguiente rango. */
  listo: boolean;
  info: InfoRango;
}

const ascendente = RANGOS.slice().reverse(); // plata, oro, diamante, corona

/** El rango que sigue al que logra en el mes (null si ya es Corona). */
export function rangoSiguiente(k: RangoKey): Rango | null {
  return ascendente.find(r => ORDEN_RANGO[r.key] > ORDEN_RANGO[k]) ?? null;
}

export function requisitosPara(info: InfoRango, r: Rango): Requisito[] {
  const e = info.evaluaciones.find(x => x.rango.key === r.key)!;
  return [
    { nombre: 'Producción válida del equipo', lleva: info.validaMes, meta: r.produccion, ok: e.okProduccion, dinero: true },
    { nombre: 'Activas', lleva: info.activas, meta: r.activas, ok: e.okActivas, dinero: false },
    { nombre: 'Calificadas', lleva: info.calificadas, meta: r.calificadas, ok: e.okCalificadas, dinero: false },
    { nombre: e.soloUnPeriodo ? 'Compra de la líder (una quincena)' : 'Compra de la líder (cada quincena)', lleva: e.valorCompra, meta: r.compraLider, ok: e.okCompra, dinero: true }
  ];
}

/** Cada líder con su rango del mes y lo que le falta para el siguiente, de la más cercana a la más lejana. */
export function proximosRangos(miembros: Miembro[], mk: string): ProximoRango[] {
  const lista: ProximoRango[] = [];
  for (const lider of lideres(miembros)) {
    const info = rangoDelMes(miembros, lider.id, mk);
    const siguiente = rangoSiguiente(info.rango.key);
    if (!siguiente) continue;
    const requisitos = requisitosPara(info, siguiente);
    const progresoPct = Math.round((requisitos.reduce((s, q) => s + Math.min(1, q.meta ? q.lleva / q.meta : 1), 0) / requisitos.length) * 100);
    lista.push({ lider, actual: info.rango, siguiente, requisitos, progresoPct, listo: requisitos.every(q => q.ok), info });
  }
  return lista.sort((a, b) => b.progresoPct - a.progresoPct || a.lider.fullName.localeCompare(b.lider.fullName));
}

export interface Logro { lider: Miembro; antes: Rango; ahora: Rango; primeraVez: boolean }

/** Líderes que en el mes lograron un rango mayor al del mes anterior (y si es la primera vez que lo logran). */
export function logrosDelMes(miembros: Miembro[], mk: string): Logro[] {
  const anterior = mesAnterior(mk);
  const out: Logro[] = [];
  for (const lider of lideres(miembros)) {
    const ahora = rangoDelMes(miembros, lider.id, mk).rango;
    const antes = rangoDelMes(miembros, lider.id, anterior).rango;
    if (ORDEN_RANGO[ahora.key] <= ORDEN_RANGO[antes.key]) continue;
    const mejorAntes = rangoHistorico(miembros, lider.id, anterior);
    out.push({ lider, antes, ahora, primeraVez: ORDEN_RANGO[ahora.key] > ORDEN_RANGO[mejorAntes.key] });
  }
  return out.sort((a, b) => ORDEN_RANGO[b.ahora.key] - ORDEN_RANGO[a.ahora.key] || a.lider.fullName.localeCompare(b.lider.fullName));
}

/** El rango que la líder logró por PRIMERA VEZ en ese mes (para el bono por rango), o null. */
export function ascensoPrimeraVez(miembros: Miembro[], liderId: string, mk: string): Rango | null {
  const ahora = rangoDelMes(miembros, liderId, mk).rango;
  if (ahora.key === 'sinRango') return null;
  const mejorAntes = rangoHistorico(miembros, liderId, mesAnterior(mk));
  return ORDEN_RANGO[ahora.key] > ORDEN_RANGO[mejorAntes.key] ? ahora : null;
}

interface PersonaParaVinculo { id: string; usuario?: string; nombre?: string; apellidos?: string; estado?: string }

/** miembroId → persona de la página (por vínculo, membresía o nombre, como buscarPersonaEnArbol). */
export function personasPorMiembro<P extends PersonaParaVinculo>(miembros: Miembro[], personas: P[]): Map<string, P> {
  const mapa = new Map<string, P>();
  for (const p of personas) {
    const nombre = [p.nombre, p.apellidos].filter(Boolean).join(' ');
    const r = buscarPersonaEnArbol(miembros, { id: p.id, usuario: p.usuario, nombre });
    if (r && !mapa.has(r.miembro.id)) mapa.set(r.miembro.id, p);
  }
  return mapa;
}
