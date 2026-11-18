// Plan de constancia en Firestore: planConstancia/{personaId}. Solo
// Administración escribe; cada e/l lee el suyo (firestore.rules).
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, runTransaction, writeBatch, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { normalizarNombre, buscarPersonaEnArbol, type Miembro } from '../arbol/modelo';
import { nombreCompletoPersona, type PersonaAdmin } from '../personas/modelo';
import { normalizarPlan, type PlanConstancia } from './plan';

export const COL_PLAN = 'planConstancia';

export function usePlanesConstancia(db: Firestore): Map<string, PlanConstancia> | null {
  const [planes, setPlanes] = useState<Map<string, PlanConstancia> | null>(null);
  useEffect(() => onSnapshot(
    collection(db, COL_PLAN),
    s => setPlanes(new Map(s.docs.map(d => [d.id, normalizarPlan(d.id, d.data())]).filter((x): x is [string, PlanConstancia] => !!x[1]))),
    () => setPlanes(new Map())
  ), [db]);
  return planes;
}

const marca = (perfil: PerfilUsuario) => ({ actualizadoEn: new Date().toISOString(), actualizadoPorNombre: perfil.nombre });
const limpio = (p: PlanConstancia) => JSON.parse(JSON.stringify(p)) as PlanConstancia;
const errorAmable = (e: unknown) => {
  const m = (e as Error)?.message;
  return m && !/permission|network|unavailable|offline/i.test(m) ? m : 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.';
};

/** Guarda varios planes de una vez (importación o carga del mes), con su registro en Actividad. */
export async function guardarPlanes(db: Firestore, planes: PlanConstancia[], perfil: PerfilUsuario, equipo: string, actividad: { accion: string; descripcion: string }): Promise<string | null> {
  try {
    for (let i = 0; i < planes.length; i += 400) {
      const lote = writeBatch(db);
      for (const p of planes.slice(i, i + 400)) lote.set(doc(db, COL_PLAN, p.personaId), limpio({ ...p, ...marca(perfil) }));
      if (i === 0) {
        const reg = nuevoRegistroActividad(perfil, 'plan_constancia', actividad.accion, conOrigen(actividad.descripcion, equipo), equipo);
        lote.set(doc(db, 'auditoria', reg.id), reg);
      }
      await lote.commit();
    }
    return null;
  } catch (e) {
    return errorAmable(e);
  }
}

/** Cambia el plan de una persona leyendo lo más reciente dentro de una transacción. */
export async function cambiarPlan(db: Firestore, personaId: string, cambiar: (p: PlanConstancia | null) => PlanConstancia | string, perfil: PerfilUsuario, equipo: string, actividad: { accion: string; descripcion: string }): Promise<string | null> {
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, COL_PLAN, personaId);
      const s = await tx.get(ref);
      const r = cambiar(s.exists() ? normalizarPlan(personaId, s.data()) : null);
      if (typeof r === 'string') throw new Error(r);
      tx.set(ref, limpio({ ...r, ...marca(perfil) }));
      const reg = nuevoRegistroActividad(perfil, 'plan_constancia', actividad.accion, conOrigen(actividad.descripcion, equipo), equipo);
      tx.set(doc(db, 'auditoria', reg.id), reg);
    });
    return null;
  } catch (e) {
    return errorAmable(e);
  }
}

// ---------- Emparejar nombres del Excel con las e/l ----------

const palabras = (s: string) => normalizarNombre(s).split(' ').filter(w => w.length > 1 && !/\d/.test(w) && !['mw'].includes(w));

/**
 * La e/l que corresponde a un nombre del Excel: por su membresía MW (usuario
 * del portal o membresía del árbol), por nombre completo idéntico, o porque
 * todas las palabras del Excel están en su nombre (si solo hay una así).
 */
export function emparejarPersona(nombreExcel: string, codigo: string, personas: PersonaAdmin[], miembros: Miembro[]): string {
  const activas = personas.filter(p => p.estado !== 'baja');
  const cod = (codigo || (nombreExcel.match(/\b(?:MW)?\s?(\d{5,})\b/i)?.[1] ? 'MW' + nombreExcel.match(/\b(?:MW)?\s?(\d{5,})\b/i)![1] : '')).toUpperCase();
  if (cod) {
    const porUsuario = activas.filter(p => p.usuario.toUpperCase() === cod);
    if (porUsuario.length === 1) return porUsuario[0].id;
    const miembro = miembros.filter(m => String(m.clientCode ?? '').toUpperCase() === cod);
    if (miembro.length === 1) {
      const vinculada = activas.find(p => buscarPersonaEnArbol(miembros, { id: p.id, usuario: p.usuario, nombre: nombreCompletoPersona(p) })?.miembro.id === miembro[0].id);
      if (vinculada) return vinculada.id;
    }
  }
  const n = normalizarNombre(nombreExcel.replace(/\b(?:MW)?\s?\d{5,}\b/gi, ' '));
  const exactas = activas.filter(p => normalizarNombre(nombreCompletoPersona(p)) === n);
  if (exactas.length === 1) return exactas[0].id;
  const buscadas = palabras(nombreExcel);
  if (buscadas.length >= 2) {
    const contienen = activas.filter(p => { const t = new Set(palabras(nombreCompletoPersona(p))); return buscadas.every(w => t.has(w)); });
    if (contienen.length === 1) return contienen[0].id;
  }
  return '';
}
