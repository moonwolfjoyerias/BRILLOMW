// Guarda Lista de deseos y Resurtido en Firestore, sobre las MISMAS
// colecciones que la página. Cada acción es UNA transacción: lee la
// versión actual del servidor, aplica la regla de ./modelo y guarda
// junto el documento, su historial, la Actividad y los avisos.
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, runTransaction, type Firestore } from '../datos/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso } from '../pagina/avisos';
import {
  normalizarDeseo,
  normalizarResurtido,
  type Resultado,
  type SolicitudDeseo,
  type SolicitudResurtido
} from './modelo';

export const COL_DESEOS = 'listaDeseos';
export const COL_RESURTIDO = 'solicitudesResurtido';
const COL_HISTORIAL = 'listaDeseosHistorialEstados';

export type EstadoDeseos =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; deseos: SolicitudDeseo[]; resurtido: SolicitudResurtido[] };

export function useListaDeseos(db: Firestore): EstadoDeseos {
  const [deseos, setDeseos] = useState<SolicitudDeseo[] | null>(null);
  const [resurtido, setResurtido] = useState<SolicitudResurtido[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const quitarD = onSnapshot(
      collection(db, COL_DESEOS),
      s => setDeseos(s.docs.map(d => normalizarDeseo(d.id, d.data()))),
      () => setError(true)
    );
    const quitarR = onSnapshot(
      collection(db, COL_RESURTIDO),
      s => setResurtido(s.docs.map(d => normalizarResurtido(d.id, d.data()))),
      () => setError(true)
    );
    return () => {
      quitarD();
      quitarR();
    };
  }, [db]);
  if (error) return { estado: 'error', mensaje: 'No se pudo cargar la Lista de deseos. Revisa la conexión.' };
  if (!deseos || !resurtido) return { estado: 'cargando' };
  return { estado: 'listo', deseos, resurtido };
}

class ErrorAccion extends Error {}

type Coleccion = typeof COL_DESEOS | typeof COL_RESURTIDO;
type DocDe<C extends Coleccion> = C extends typeof COL_DESEOS ? SolicitudDeseo : SolicitudResurtido;

/**
 * Aplica `accion` sobre la versión actual del documento `id` (null = uno
 * nuevo, que crea la propia acción) y lo guarda todo junto.
 */
export async function guardarDeseo<C extends Coleccion>(
  db: Firestore,
  coleccion: C,
  id: string | null,
  accion: (actual: DocDe<C> | null) => Resultado<DocDe<C>>,
  perfil: PerfilUsuario,
  equipo: string
): Promise<{ ok: true; doc: DocDe<C> } | { ok: false; error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Sin conexión a internet. Para guardar se necesita conexión.' };
  }
  const normalizar = (coleccion === COL_DESEOS ? normalizarDeseo : normalizarResurtido) as (i: string, d: Record<string, unknown>) => DocDe<C>;
  try {
    const guardado = await runTransaction(db, async tx => {
      let actual: DocDe<C> | null = null;
      if (id) {
        const s = await tx.get(doc(db, coleccion, id));
        if (!s.exists()) throw new ErrorAccion('Esa solicitud ya no existe.');
        actual = normalizar(s.id, s.data());
      }
      const r = accion(actual);
      if (!r.ok) throw new ErrorAccion(r.error);
      const ahora = new Date();
      tx.set(doc(db, coleccion, r.doc.id), r.doc);
      if (r.efectos.historial) tx.set(doc(db, COL_HISTORIAL, r.efectos.historial.id), r.efectos.historial);
      const { modulo, accion: nombre, descripcion } = r.efectos.actividad;
      const registro = nuevoRegistroActividad(perfil, modulo, nombre, conOrigen(descripcion, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', registro.id), registro);
      (r.efectos.avisos ?? []).forEach((a, i) => {
        const n = nuevoAviso(a, ahora, i);
        tx.set(doc(db, 'notificaciones', n.id), n);
      });
      return r.doc;
    });
    return { ok: true, doc: guardado };
  } catch (e) {
    if (e instanceof ErrorAccion) return { ok: false, error: e.message };
    if (e instanceof FirebaseError && e.code === 'permission-denied') {
      return { ok: false, error: 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para esta acción.' };
    }
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) {
      return { ok: false, error: 'Sin conexión a internet. Para guardar se necesita conexión.' };
    }
    return { ok: false, error: 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.' };
  }
}
