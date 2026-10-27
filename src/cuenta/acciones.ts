// "Mi cuenta": datos propios (`users/{uid}`, la misma cuenta de la página)
// y el recibo de nómina (`nominaEmpleados` / `nominaPeriodos`).
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, query, runTransaction, setDoc, updateDoc, where, type Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { nuevoAviso } from '../pagina/avisos';
import { clavePeriodo, empleadoDeLaCuenta, normalizarEmpleadoNomina, normalizarPeriodo, type EmpleadoNomina, type PeriodoNomina } from './nomina';

export interface DatosCuenta {
  telefono: string;
  correo: string;
  fotoUrl: string;
}

export type EstadoCuenta =
  | { estado: 'cargando' }
  | { estado: 'listo'; cuenta: DatosCuenta; empleado: EmpleadoNomina | null; periodos: PeriodoNomina[]; errorNomina: boolean };

export function useMiCuenta(db: Firestore, perfil: PerfilUsuario): EstadoCuenta {
  const [cuenta, setCuenta] = useState<DatosCuenta | null>(null);
  const [empleados, setEmpleados] = useState<EmpleadoNomina[] | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoNomina[]>([]);
  const [errorNomina, setErrorNomina] = useState(false);
  const empleado = empleados ? empleadoDeLaCuenta(perfil, empleados) : null;

  useEffect(() => {
    const t = (v: unknown) => (typeof v === 'string' ? v : '');
    const quitarCuenta = onSnapshot(
      doc(db, 'users', perfil.uid),
      s => setCuenta({ telefono: t(s.data()?.telefono), correo: t(s.data()?.correo), fotoUrl: t(s.data()?.fotoUrl) }),
      () => setCuenta({ telefono: '', correo: '', fotoUrl: '' })
    );
    const quitarEmpleados = onSnapshot(
      collection(db, 'nominaEmpleados'),
      s => setEmpleados(s.docs.map(d => normalizarEmpleadoNomina(d.id, d.data()))),
      () => {
        setEmpleados([]);
        setErrorNomina(true);
      }
    );
    return () => {
      quitarCuenta();
      quitarEmpleados();
    };
  }, [db, perfil.uid]);

  const empleadoId = empleado?.id;
  useEffect(() => {
    if (!empleadoId) return;
    // Solo las semanas de esta persona (no se descarga la nómina de todos).
    return onSnapshot(
      query(collection(db, 'nominaPeriodos'), where('empleadoId', '==', empleadoId)),
      s => setPeriodos(s.docs.map(d => normalizarPeriodo(d.id, d.data()))),
      () => setErrorNomina(true)
    );
  }, [db, empleadoId]);

  if (!cuenta || !empleados) return { estado: 'cargando' };
  return { estado: 'listo', cuenta, empleado, periodos: empleadoId ? periodos.filter(p => p.empleadoId === empleadoId) : [], errorNomina };
}

function mensaje(e: unknown, accion: string): string {
  if (e instanceof Error && e.name === 'ErrorCuenta') return e.message;
  if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para esta acción.';
  if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return `Para ${accion} se necesita internet.`;
  return `No se pudo ${accion}. Inténtalo de nuevo.`;
}

function errorCuenta(m: string) {
  const e = new Error(m);
  e.name = 'ErrorCuenta';
  return e;
}

/**
 * Firma de recibido la nómina de una semana, como firmarReciboNomina() de
 * la página: solo si Encargado ya la capturó, una sola vez, y tocando
 * únicamente `firmaEmpleado` (lo único que las reglas permiten).
 */
export async function firmarRecibo(db: Firestore, empleadoId: string, periodoKey: string, perfil: PerfilUsuario): Promise<string | null> {
  const ref = doc(db, 'nominaPeriodos', clavePeriodo(empleadoId, periodoKey));
  try {
    await runTransaction(db, async tx => {
      const s = await tx.get(ref);
      if (!s.exists() || s.data().guardado !== true) throw errorCuenta('Todavía no hay una nómina capturada esta semana para firmar.');
      if (s.data().firmaEmpleado?.firmado) return;
      tx.update(ref, { firmaEmpleado: { firmado: true, fecha: new Date().toISOString(), usuarioId: perfil.usuario, usuarioNombre: perfil.nombre } });
    });
    return null;
  } catch (e) {
    return mensaje(e, 'firmar');
  }
}

/** Teléfono, correo y foto de la propia cuenta. Las reglas solo lo permiten a Administración (igual que en la página). */
export async function guardarMiCuenta(db: Firestore, perfil: PerfilUsuario, cambios: Partial<DatosCuenta>): Promise<string | null> {
  if (cambios.correo && !/^\S+@\S+\.\S+$/.test(cambios.correo)) return 'Ingresa un correo válido.';
  try {
    await updateDoc(doc(db, 'users', perfil.uid), cambios);
    return null;
  } catch (e) {
    return mensaje(e, 'guardar');
  }
}

/** "Olvidé mi acceso": le llega un aviso a Administración en la campana de la página. */
export async function avisarOlvideAcceso(db: Firestore, perfil: PerfilUsuario): Promise<string | null> {
  const n = nuevoAviso(
    { texto: `${perfil.nombre} (${perfil.usuario}) pidió ayuda para restablecer su acceso.`, link: 'admin-configuracion.html', paraId: null, rolDestino: 'admin', origen: perfil.rol === 'encargado' ? 'encargado' : 'staff' },
    new Date()
  );
  try {
    await setDoc(doc(db, 'notificaciones', n.id), n);
    return null;
  } catch (e) {
    return mensaje(e, 'enviar el aviso');
  }
}
