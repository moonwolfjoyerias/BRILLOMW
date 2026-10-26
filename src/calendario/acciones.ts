// Guarda eventos del Calendario en `eventos` (la misma colección que la
// página), cada acción en UNA transacción junto con su registro en
// Actividad (módulo calendario, como Encargado y Admin en la página).
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { normalizarEvento, type Evento } from './modelo';

export const COL_EVENTOS = 'eventos';

export type EstadoEventos = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; eventos: Evento[] };

export function useEventos(db: Firestore): EstadoEventos {
  const [estado, setEstado] = useState<EstadoEventos>({ estado: 'cargando' });
  useEffect(
    () =>
      onSnapshot(
        collection(db, COL_EVENTOS),
        s => setEstado({ estado: 'listo', eventos: s.docs.map(d => normalizarEvento(d.id, d.data())) }),
        () => setEstado({ estado: 'error' })
      ),
    [db]
  );
  return estado;
}

class ErrorEvento extends Error {}

/**
 * Agrega (id null), edita o elimina (`accion` devuelve null) un evento
 * sobre la versión actual del servidor, y lo deja en Actividad.
 */
export async function guardarEvento(
  db: Firestore,
  id: string | null,
  accion: (actual: Evento | null) => Evento | null,
  perfil: PerfilUsuario,
  equipo: string
): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, async tx => {
      let actual: Evento | null = null;
      if (id) {
        const s = await tx.get(doc(db, COL_EVENTOS, id));
        if (!s.exists()) throw new ErrorEvento('Ese evento ya no existe.');
        actual = normalizarEvento(s.id, s.data());
      }
      const nuevo = accion(actual);
      const ahora = new Date();
      let registro;
      if (!nuevo) {
        tx.delete(doc(db, COL_EVENTOS, id!));
        registro = ['eliminar_evento', `Evento eliminado: ${actual!.titulo}`];
      } else {
        tx.set(doc(db, COL_EVENTOS, nuevo.id), nuevo);
        registro = actual ? ['editar_evento', `Evento editado: ${nuevo.titulo}`] : ['agregar_evento', `Evento agregado: ${nuevo.titulo}`];
      }
      const r = nuevoRegistroActividad(perfil, 'calendario', registro[0], conOrigen(registro[1], equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
    });
    return null;
  } catch (e) {
    if (e instanceof ErrorEvento) return e.message;
    if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para esta acción.';
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return 'Sin conexión a internet. Para guardar se necesita conexión.';
    if (e instanceof FirebaseError && e.code === 'invalid-argument') return 'La foto es demasiado pesada. Prueba con otra o quítala.';
    return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
  }
}
