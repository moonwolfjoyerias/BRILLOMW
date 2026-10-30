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
} from '../datos/firestore';
import { FirebaseError } from 'firebase/app';
import { db } from '../firebase';
import type { PerfilUsuario } from '../sesion/perfil';
import { COLECCION_TURNOS, idTurno, type CierreCaja, type IdCaja, type MovimientoEfectivo, type TurnoCaja } from './turno';
import { calcularCorte, diferenciaCierre, validarMovimiento } from './corte';
import { COLECCION_VENTAS, type VentaRegistrada } from '../venta/registrarVenta';

function aTurno(id: string, d: Record<string, unknown>): TurnoCaja {
  const abiertaEn = d.abiertaEn instanceof Timestamp ? d.abiertaEn.toDate().toISOString() : null;
  return {
    id,
    fecha: String(d.fecha ?? ''),
    caja: d.caja as IdCaja,
    estado: d.estado === 'cerrada' ? 'cerrada' : 'abierta',
    fondoInicial: Number(d.fondoInicial) || 0,
    abiertaPor: (d.abiertaPor as TurnoCaja['abiertaPor']) ?? { uid: '', nombre: '', rol: '' },
    abiertaEn,
    numVentas: Number(d.numVentas) || 0,
    movimientos: Array.isArray(d.movimientos) ? (d.movimientos as MovimientoEfectivo[]) : [],
    cierre: (d.cierre as CierreCaja | undefined) ?? null
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
        abiertaEn: serverTimestamp(),
        numVentas: 0,
        movimientos: [],
        cierre: null
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

/** Ventas del día (las dos cajas), en tiempo real. */
export type EstadoVentasDia = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; ventas: VentaRegistrada[] };

export function useVentasDelDia(fecha: string): EstadoVentasDia {
  const [estado, setEstado] = useState<EstadoVentasDia>({ estado: 'cargando' });
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, COLECCION_VENTAS), where('fechaDia', '==', fecha)),
        snap => setEstado({ estado: 'listo', ventas: snap.docs.map(d => d.data() as VentaRegistrada) }),
        () => setEstado({ estado: 'error' })
      ),
    [fecha]
  );
  return estado;
}

function errorCaja(e: unknown, accion: string): string {
  if (e instanceof ErrorCaja) return e.message;
  if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para esta acción.';
  if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) {
    return `Para ${accion} se necesita internet. Revisa la conexión e inténtalo de nuevo.`;
  }
  return `No se pudo ${accion}. No se cambió nada; inténtalo de nuevo.`;
}

class ErrorCaja extends Error {}

const persona = (p: PerfilUsuario) => ({ uid: p.uid, nombre: p.nombre, rol: p.rol });

/** Registra una entrada o salida de efectivo en la caja abierta. */
export async function registrarMovimiento(
  db: Firestore,
  caja: IdCaja,
  fecha: string,
  mov: { tipo: MovimientoEfectivo['tipo']; monto: number; motivo: string },
  perfil: PerfilUsuario
): Promise<string | null> {
  const err = validarMovimiento(mov.tipo, mov.monto, mov.motivo);
  if (err) return err;
  const ref = doc(db, COLECCION_TURNOS, idTurno(fecha, caja));
  try {
    await runTransaction(db, async tx => {
      const s = await tx.get(ref);
      if (!s.exists() || s.data().estado !== 'abierta') throw new ErrorCaja('Esta caja no está abierta.');
      const actuales = Array.isArray(s.data().movimientos) ? (s.data().movimientos as MovimientoEfectivo[]) : [];
      const nuevo: MovimientoEfectivo = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tipo: mov.tipo,
        monto: Math.round(mov.monto * 100) / 100,
        motivo: mov.motivo.trim(),
        por: persona(perfil),
        fecha: new Date().toISOString()
      };
      tx.update(ref, { movimientos: [...actuales, nuevo] });
    });
    return null;
  } catch (e) {
    return errorCaja(e, 'registrar el movimiento');
  }
}

/**
 * Cierra la caja del día (corte final). Se guarda el efectivo contado, el
 * esperado y la diferencia, y una copia del corte. Si mientras tanto se
 * cobró otra venta en esta caja, no se cierra: hay que volver a revisar.
 */
export async function cerrarCaja(
  db: Firestore,
  caja: IdCaja,
  fecha: string,
  ventasRevisadas: VentaRegistrada[],
  efectivoContado: number,
  nota: string,
  perfil: PerfilUsuario
): Promise<string | null> {
  const ref = doc(db, COLECCION_TURNOS, idTurno(fecha, caja));
  try {
    await runTransaction(db, async tx => {
      const s = await tx.get(ref);
      if (!s.exists()) throw new ErrorCaja('Esta caja no se abrió hoy.');
      const turno = aTurno(s.id, s.data());
      if (turno.estado !== 'abierta') throw new ErrorCaja('Esta caja ya se cerró.');
      const propias = ventasRevisadas.filter(v => v.caja === caja && v.fechaDia === fecha);
      if (turno.numVentas !== propias.length) {
        throw new ErrorCaja('Se registró una venta mientras revisabas el corte. Revisa los números otra vez y vuelve a cerrar.');
      }
      const resumen = calcularCorte(turno, propias);
      const cierre: CierreCaja = {
        cerradaPor: persona(perfil),
        cerradaEnLocal: new Date().toISOString(),
        efectivoContado: Math.round(efectivoContado * 100) / 100,
        efectivoEsperado: resumen.efectivoEsperado,
        diferencia: diferenciaCierre(efectivoContado, resumen.efectivoEsperado),
        nota: nota.trim()
      };
      tx.update(ref, { estado: 'cerrada', cierre, resumenCierre: resumen, cerradaEn: serverTimestamp() });
    });
    return null;
  } catch (e) {
    return errorCaja(e, 'cerrar la caja');
  }
}
