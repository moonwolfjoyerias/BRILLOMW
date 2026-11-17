// El árbol en Firestore, con los MISMOS documentos que mi-equipo:
//   arbolEquipo/team-tree-v2   { value: JSON de la lista de personas, updatedAt }
//   arbolEquipo/team-tree-meta { value: JSON { lastTreeUpdate, lastPointsUpdate } }
// Cada cambio relee la lista dentro de una transacción y aplica el cambio
// sobre lo más reciente, para no pisar lo que haya guardado mi-equipo u otra
// pantalla al mismo tiempo. Después se deja el registro en Actividad (moonwolf).
import { useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, serverTimestamp, setDoc, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { leerMiembros, type Miembro } from './modelo';

export const COL_ARBOL = 'arbolEquipo';
export const DOC_ARBOL = 'team-tree-v2';
export const DOC_META = 'team-tree-meta';

export interface MetaArbol { lastTreeUpdate: string | null; lastPointsUpdate: string | null }

export type EstadoArbol =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; miembros: Miembro[]; meta: MetaArbol };

function leerMeta(v: unknown): MetaArbol {
  try {
    const o = typeof v === 'string' ? JSON.parse(v) : null;
    return { lastTreeUpdate: o?.lastTreeUpdate ?? null, lastPointsUpdate: o?.lastPointsUpdate ?? null };
  } catch {
    return { lastTreeUpdate: null, lastPointsUpdate: null };
  }
}

export function useArbol(dbEquipo: Firestore): EstadoArbol {
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [meta, setMeta] = useState<MetaArbol>({ lastTreeUpdate: null, lastPointsUpdate: null });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const cortes = [
      onSnapshot(
        doc(dbEquipo, COL_ARBOL, DOC_ARBOL),
        s => { setMiembros(leerMiembros(s.exists() ? s.data().value : '')); setError(null); },
        () => setError('No se pudo leer el árbol de mi-equipo. Revisa la conexión.')
      ),
      onSnapshot(doc(dbEquipo, COL_ARBOL, DOC_META), s => setMeta(leerMeta(s.exists() ? s.data().value : '')), () => undefined)
    ];
    return () => cortes.forEach(c => c());
  }, [dbEquipo]);
  if (error && !miembros) return { estado: 'error', mensaje: error };
  return miembros ? { estado: 'listo', miembros, meta } : { estado: 'cargando' };
}

/**
 * Aplica un cambio al árbol más reciente. `cambiar` modifica la lista que
 * recibe y regresa null, o un texto de error para no guardar nada.
 */
export async function cambiarArbol(
  dbEquipo: Firestore,
  dbPortal: Firestore,
  cambiar: (miembros: Miembro[]) => string | null | void,
  tipo: 'arbol' | 'puntos' | 'pagos',
  perfil: PerfilUsuario,
  equipo: string,
  actividad: { accion: string; descripcion: string }
): Promise<string | null> {
  try {
    await runTransaction(dbEquipo, async tx => {
      const ref = doc(dbEquipo, COL_ARBOL, DOC_ARBOL);
      const refMeta = doc(dbEquipo, COL_ARBOL, DOC_META);
      const s = await tx.get(ref);
      const sm = await tx.get(refMeta);
      const lista = leerMiembros(s.exists() ? s.data().value : '');
      if (s.exists() && typeof s.data().value === 'string' && s.data().value.trim() && !lista.length && s.data().value.trim() !== '[]') {
        throw new Error('El árbol guardado no se pudo leer; no se cambió nada para no perder datos.');
      }
      const r = cambiar(lista);
      if (typeof r === 'string') throw new Error(r);
      tx.set(ref, { value: JSON.stringify(lista), updatedAt: serverTimestamp() });
      if (tipo !== 'pagos') {
        const meta = leerMeta(sm.exists() ? sm.data().value : '');
        const ahora = new Date().toISOString();
        if (tipo === 'arbol') meta.lastTreeUpdate = ahora;
        else meta.lastPointsUpdate = ahora;
        tx.set(refMeta, { value: JSON.stringify(meta), updatedAt: serverTimestamp() });
      }
    });
  } catch (e) {
    const m = (e as Error)?.message;
    return m && !/permission|network|unavailable|offline/i.test(m) ? m : 'No se pudo guardar el árbol. Revisa la conexión e inténtalo de nuevo.';
  }
  // Registro en Actividad (aparte: es otro proyecto de Firebase).
  try {
    const reg = nuevoRegistroActividad(perfil, 'arbol_equipo', actividad.accion, conOrigen(actividad.descripcion, equipo), equipo);
    await setDoc(doc(dbPortal, 'auditoria', reg.id), reg);
  } catch {
    // El árbol ya quedó guardado; el registro no es indispensable.
  }
  return null;
}
