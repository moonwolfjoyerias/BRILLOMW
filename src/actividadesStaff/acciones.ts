// Guarda Actividades del Staff en Firestore, sobre las MISMAS colecciones
// que la página. Cada acción es UNA transacción: lee la versión actual de
// las actividades que toca, aplica la regla de ./modelo y guarda junto
// las actividades, su historial, el catálogo, la Actividad y los avisos.
import { FirebaseError } from 'firebase/app';
import { collection, doc, getDocs, onSnapshot, query, runTransaction, where, type Firestore } from '../datos/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso } from '../pagina/avisos';
import {
  faltantesDeSemana,
  normalizarAsignacion,
  normalizarCatalogo,
  normalizarEmpleado,
  type ActividadCatalogo,
  type Asignacion,
  type EmpleadoNomina,
  type RegistroHistorial,
  type Resultado
} from './modelo';

export const COL_CATALOGO = 'actividadesCatalogoStaff';
export const COL_ASIGNACIONES = 'actividadesStaff';
export const COL_HISTORIAL = 'historialActividadesStaff';

export type EstadoActividadesStaff =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; catalogo: ActividadCatalogo[]; asignaciones: Asignacion[]; empleados: EmpleadoNomina[] };

/** Catálogo, asignaciones y empleados de Nómina, en vivo. */
export function useActividadesStaff(db: Firestore): EstadoActividadesStaff {
  const [catalogo, setCatalogo] = useState<ActividadCatalogo[] | null>(null);
  const [asignaciones, setAsignaciones] = useState<Asignacion[] | null>(null);
  const [empleados, setEmpleados] = useState<EmpleadoNomina[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const fallo = () => setError(true);
    const quitar = [
      onSnapshot(collection(db, COL_CATALOGO), s => setCatalogo(s.docs.map(d => normalizarCatalogo(d.id, d.data()))), fallo),
      onSnapshot(collection(db, COL_ASIGNACIONES), s => setAsignaciones(s.docs.map(d => normalizarAsignacion(d.id, d.data()))), fallo),
      onSnapshot(collection(db, 'nominaEmpleados'), s => setEmpleados(s.docs.map(d => normalizarEmpleado(d.id, d.data()))), fallo)
    ];
    return () => quitar.forEach(q => q());
  }, [db]);
  if (error) return { estado: 'error', mensaje: 'No se pudieron cargar las Actividades del Staff. Revisa la conexión.' };
  if (!catalogo || !asignaciones || !empleados) return { estado: 'cargando' };
  // El catálogo conserva su orden de alta (de ahí sale el orden de las zonas).
  const orden = (id: string) => Number(id.replace(/\D+/g, '')) || 0;
  return { estado: 'listo', catalogo: [...catalogo].sort((a, b) => orden(a.id) - orden(b.id)), asignaciones, empleados };
}

/** Historial de UNA actividad (se pide al abrir su detalle, no se descarga todo). */
export async function leerHistorial(db: Firestore, actividadId: string): Promise<RegistroHistorial[]> {
  const s = await getDocs(query(collection(db, COL_HISTORIAL), where('actividadId', '==', actividadId)));
  return s.docs.map(d => ({ ...(d.data() as RegistroHistorial), id: d.id })).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

class ErrorAccion extends Error {}

function mensajeError(e: unknown): string {
  if (e instanceof ErrorAccion) return e.message;
  if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para esta acción.';
  if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
}

/**
 * Lee la versión actual de las actividades `ids`, aplica `accion` y guarda
 * todo junto. Si alguna ya no existe, no se guarda nada.
 */
export async function guardarActividades(
  db: Firestore,
  ids: string[],
  accion: (actuales: Map<string, Asignacion>) => Resultado,
  perfil: PerfilUsuario,
  equipo: string
): Promise<{ ok: true; cantidad: number } | { ok: false; error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Sin conexión a internet. Para guardar se necesita conexión.' };
  }
  try {
    const cantidad = await runTransaction(db, async tx => {
      const actuales = new Map<string, Asignacion>();
      for (const id of ids) {
        const s = await tx.get(doc(db, COL_ASIGNACIONES, id));
        if (!s.exists()) throw new ErrorAccion('Esa actividad ya no existe.');
        actuales.set(id, normalizarAsignacion(s.id, s.data()));
      }
      const r = accion(actuales);
      if (!r.ok) throw new ErrorAccion(r.error);
      const ahora = new Date();
      if (r.catalogoNuevo) tx.set(doc(db, COL_CATALOGO, r.catalogoNuevo.id), r.catalogoNuevo);
      r.asignaciones.forEach(a => tx.set(doc(db, COL_ASIGNACIONES, a.id), a));
      r.historial.forEach(h => tx.set(doc(db, COL_HISTORIAL, h.id), h));
      if (r.actividad) {
        const registro = nuevoRegistroActividad(perfil, 'actividades_staff', r.actividad.accion, conOrigen(r.actividad.descripcion, equipo), equipo, ahora);
        tx.set(doc(db, 'auditoria', registro.id), registro);
      }
      (r.avisos ?? []).forEach((a, i) => {
        const n = nuevoAviso(a, ahora, i);
        tx.set(doc(db, 'notificaciones', n.id), n);
      });
      return r.asignaciones.length;
    });
    return { ok: true, cantidad };
  } catch (e) {
    return { ok: false, error: mensajeError(e) };
  }
}

/**
 * Precarga la semana con las actividades base del catálogo que le falten
 * (como la página al abrir Actividades del Staff). Cada una tiene un id
 * fijo por semana, así que dos equipos a la vez no la duplican.
 */
export async function asegurarSemana(db: Firestore, catalogo: ActividadCatalogo[], asignaciones: Asignacion[], semanaKey: string): Promise<void> {
  const faltantes = faltantesDeSemana(catalogo, asignaciones, semanaKey);
  if (!faltantes.length) return;
  await runTransaction(db, async tx => {
    const nuevas: Asignacion[] = [];
    for (const a of faltantes) {
      if (!(await tx.get(doc(db, COL_ASIGNACIONES, a.id))).exists()) nuevas.push(a);
    }
    nuevas.forEach(a => tx.set(doc(db, COL_ASIGNACIONES, a.id), a));
  });
}
