import { useEffect, useState } from 'react';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore
} from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { db } from '../firebase';
import type { PerfilUsuario } from '../sesion/perfil';
import { COLECCION_TURNOS, idTurno, type IdCaja, type TurnoCaja } from './turno';

function aTurno(id: string, d: Record<string, unknown>): TurnoCaja {
  const abiertaEn = d.abiertaEn instanceof Timestamp ? d.abiertaEn.toDate().toISOString() : null;
  return {
    id,
    fecha: String(d.fecha ?? ''),
    caja: d.caja as IdCaja,
    estado: d.estado === 'cerrada' ? 'cerrada' : 'abierta',
    fondoInicial: Number(d.fondoInicial) || 0,
    abiertaPor: (d.abiertaPor as TurnoCaja['abiertaPor']) ?? { uid: '', nombre: '', rol: '' },
    abiertaEn
  };
}

export type EstadoTurnos =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; turnos: TurnoCaja[] };

/** Turnos de las cajas del día indicado, en tiempo real (se ven en todos los equipos). */
export function useTurnosDelDia(fecha: string): EstadoTurnos {
  const [estado, setEstado] = useState<EstadoTurnos>({ estado: 'cargando' });
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, COLECCION_TURNOS), where('fecha', '==', fecha)),
        snap => setEstado({ estado: 'listo', turnos: snap.docs.map(d => aTurno(d.id, d.data())) }),
        () =>
          setEstado({
            estado: 'error',
            mensaje: 'No se pudo consultar el estado de las cajas. Revisa la conexión.'
          })
      ),
    [fecha]
  );
  return estado;
}

/**
 * Abre la caja del día. Es una transacción: si otra persona ya la abrió hoy
 * (desde este u otro equipo), no se abre dos veces. Requiere internet, para
 * que dos equipos sin conexión no abran la misma caja a la vez.
 */
export async function abrirCaja(
  db: Firestore,
  caja: IdCaja,
  fecha: string,
  fondoInicial: number,
  perfil: PerfilUsuario
): Promise<string | null> {
  const ref = doc(db, COLECCION_TURNOS, idTurno(fecha, caja));
  try {
    await runTransaction(db, async tx => {
      const actual = await tx.get(ref);
      if (actual.exists()) throw new Error('ya-abierta');
      tx.set(ref, {
        fecha,
        caja,
        estado: 'abierta',
        fondoInicial,
        abiertaPor: { uid: perfil.uid, nombre: perfil.nombre, rol: perfil.rol },
        abiertaEn: serverTimestamp()
      });
    });
    return null;
  } catch (e) {
    if (e instanceof Error && e.message === 'ya-abierta') return 'Esta caja ya se abrió hoy.';
    if (e instanceof FirebaseError && e.code === 'permission-denied') {
      return 'Firebase rechazó el guardado. Revisa que las reglas de BRILLO estén publicadas en Firestore.';
    }
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) {
      return 'Para abrir la caja se necesita internet. Revisa la conexión e inténtalo de nuevo.';
    }
    return 'No se pudo abrir la caja. Inténtalo de nuevo.';
  }
}
