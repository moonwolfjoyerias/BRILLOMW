// Guarda las acciones de Apartados en Firestore, sobre las MISMAS
// colecciones que la página. Cada acción es UNA transacción: lee la
// versión actual de la ventana en el servidor, aplica la regla de
// ./modelo y guarda junto la ventana, el crédito, las existencias, la
// Actividad y los avisos. Si algo cambió o falla, no se guarda nada.
import { FirebaseError } from 'firebase/app';
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
  type Firestore
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { normalizarReferencia } from '../venta/carrito';
import { normalizarVentana, piezasActivas, type Aviso, type Resultado, type Ventana } from './modelo';

export const COL_VENTANAS = 'ventanasApartado';
export const DOC_CREDITOS = ['apartadosMeta', 'creditos'] as const;
const COL_REFERENCIAS = 'brilloReferenciasPago';

// ------------------------------------------------------------ lectura en vivo

export type EstadoApartados =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; ventanas: Ventana[]; creditos: Record<string, number> };

export function useApartados(db: Firestore): EstadoApartados {
  const [ventanas, setVentanas] = useState<Ventana[] | null>(null);
  const [creditos, setCreditos] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const quitarV = onSnapshot(
      collection(db, COL_VENTANAS),
      s => setVentanas(s.docs.map(d => normalizarVentana(d.id, d.data()))),
      () => setError(true)
    );
    const quitarC = onSnapshot(
      doc(db, ...DOC_CREDITOS),
      s => setCreditos(s.exists() ? (s.data() as Record<string, number>) : {}),
      () => setError(true)
    );
    return () => {
      quitarV();
      quitarC();
    };
  }, [db]);
  if (error) return { estado: 'error', mensaje: 'No se pudieron cargar los apartados. Revisa la conexión.' };
  if (!ventanas || !creditos) return { estado: 'cargando' };
  return { estado: 'listo', ventanas, creditos };
}

// ------------------------------------------------------------ transacción

interface Opciones {
  /** Ventana a modificar; null = ventana nueva (la crea la acción). */
  ventanaId: string | null;
  /** Producto/variante cuya existencia se descuenta (apartar una pieza). */
  descontar?: { productoId: string; varianteId: string };
  /** Referencia de pago a registrar como usada (transferencias). */
  referencia?: { metodo: string; referencia: string; monto: number };
  /** Regla a aplicar sobre la versión ACTUAL del servidor. */
  accion: (actual: Ventana | null, creditoDe: (usuarioId: string) => number) => Resultado;
}

class ErrorAccion extends Error {}

function cambiarExistencia(variantes: Record<string, unknown>[], varianteId: string, delta: number) {
  return variantes.map(v => (v.id === varianteId ? { ...v, stock: Math.max(0, (Number(v.stock) || 0) + delta) } : v));
}

function nuevoAviso(a: Aviso, ahora: Date, i: number) {
  // Misma forma que construirNotificacion()/normalizarNotificacion() de la página.
  return {
    id: `NOTIF-${ahora.getTime()}${i ? `-${i}` : ''}`,
    texto: a.texto,
    link: a.link,
    leida: false,
    paraId: a.paraId,
    tipo: null,
    origen: a.origen ?? 'emprendedora_lider',
    productoId: null,
    rolDestino: a.rolDestino,
    creadaEn: ahora.toISOString()
  };
}

export async function ejecutarAccion(
  db: Firestore,
  op: Opciones,
  perfil: PerfilUsuario,
  equipo: string
): Promise<{ ok: true; ventana: Ventana } | { ok: false; error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Sin conexión a internet. Para guardar apartados se necesita conexión.' };
  }
  const refCreditos = doc(db, ...DOC_CREDITOS);
  try {
    const ventana = await runTransaction(db, async tx => {
      // 1) Lecturas (todas antes de escribir).
      const refVentana = op.ventanaId ? doc(db, COL_VENTANAS, op.ventanaId) : null;
      const snapV = refVentana ? await tx.get(refVentana) : null;
      if (refVentana && !snapV?.exists()) throw new ErrorAccion('Ese apartado ya no existe.');
      const actual = snapV?.exists() ? normalizarVentana(snapV.id, snapV.data()) : null;
      const snapC = await tx.get(refCreditos);
      const creditos = (snapC.exists() ? snapC.data() : {}) as Record<string, number>;
      // Productos que podrían cambiar de existencia: el que se aparta y las piezas activas.
      const idsProductos = new Set<string>();
      if (op.descontar?.productoId) idsProductos.add(op.descontar.productoId);
      actual && piezasActivas(actual).forEach(p => p.productoId && idsProductos.add(p.productoId));
      const productos = new Map<string, { ref: DocumentReference; variantes: Record<string, unknown>[] } | null>();
      for (const id of idsProductos) {
        const ref = doc(db, 'productos', id);
        const s = await tx.get(ref);
        productos.set(id, s.exists() ? { ref, variantes: Array.isArray(s.data().variantes) ? s.data().variantes : [] } : null);
      }
      // Mismo id que las ventas de BRILLO: una transferencia ya usada en caja
      // tampoco se puede usar en un apartado (y al revés).
      const refReferencia = op.referencia ? doc(db, COL_REFERENCIAS, `${op.referencia.metodo}_${normalizarReferencia(op.referencia.referencia)}`) : null;
      if (refReferencia) {
        const s = await tx.get(refReferencia);
        if (s.exists()) throw new ErrorAccion(`Ese número de referencia ya existe (folio ${String(s.data().folio ?? s.data().documento ?? '?')}).`);
      }

      // 2) Regla de negocio sobre la versión actual.
      const r = op.accion(actual, u => Number(creditos[u] || 0));
      if (!r.ok) throw new ErrorAccion(r.error);
      const { ventana: nueva, efectos } = r;

      // 3) Existencias: descontar (apartar) y restaurar (cancelar).
      const cambios = new Map<string, Record<string, unknown>[]>();
      const variantesDe = (id: string) => cambios.get(id) ?? productos.get(id)?.variantes ?? null;
      if (op.descontar) {
        const vs = variantesDe(op.descontar.productoId);
        if (!vs) throw new ErrorAccion('Ese producto ya no existe en el catálogo.');
        const v = vs.find(x => x.id === op.descontar!.varianteId);
        if (!v) throw new ErrorAccion('Esa variante ya no existe en el catálogo.');
        if (!(Number(v.stock) > 0)) throw new ErrorAccion('Ya no hay existencia de esa variante (alguien más la apartó o vendió).');
        cambios.set(op.descontar.productoId, cambiarExistencia(vs, op.descontar.varianteId, -1));
      }
      for (const p of efectos.restaurarStock ?? []) {
        const vs = variantesDe(p.productoId);
        if (!vs) continue; // producto eliminado: no hay a dónde regresarla (igual que la página)
        cambios.set(p.productoId, cambiarExistencia(vs, p.varianteId, +1));
      }

      // 4) Escrituras.
      const ahora = new Date();
      tx.set(doc(db, COL_VENTANAS, nueva.id), nueva);
      if (efectos.credito) {
        const { usuarioId, monto } = efectos.credito;
        tx.set(refCreditos, { [usuarioId]: monto > 0 ? monto : deleteField() }, { merge: true });
      }
      cambios.forEach((variantes, id) =>
        tx.update(productos.get(id)!.ref, { variantes, disponible: variantes.some(v => (Number(v.stock) || 0) > 0) })
      );
      const registro = nuevoRegistroActividad(perfil, 'apartados', efectos.actividad.accion, conOrigen(efectos.actividad.descripcion, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', registro.id), registro);
      (efectos.avisos ?? []).forEach((a, i) => {
        const n = nuevoAviso(a, ahora, i);
        tx.set(doc(db, 'notificaciones', n.id), n);
      });
      if (refReferencia && op.referencia) {
        tx.set(refReferencia, { ...op.referencia, documento: `${COL_VENTANAS}/${nueva.id}`, folio: nueva.id, fecha: serverTimestamp() });
      }
      return nueva;
    });
    return { ok: true, ventana };
  } catch (e) {
    if (e instanceof ErrorAccion) return { ok: false, error: e.message };
    if (e instanceof FirebaseError && e.code === 'permission-denied') {
      return { ok: false, error: 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para esta acción.' };
    }
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) {
      return { ok: false, error: 'Sin conexión a internet. Para guardar apartados se necesita conexión.' };
    }
    return { ok: false, error: 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.' };
  }
}

/**
 * Guarda una ventana sin Actividad ni otros efectos (marcar como revisado
 * el cambio de la clienta, o las banderas de avisos de vencimiento).
 */
export async function guardarSinActividad(
  db: Firestore,
  ventanaId: string,
  cambiar: (actual: Ventana) => { ventana: Ventana; avisos?: Aviso[] } | null
): Promise<void> {
  await runTransaction(db, async tx => {
    const ref = doc(db, COL_VENTANAS, ventanaId);
    const s = await tx.get(ref);
    if (!s.exists()) return;
    const r = cambiar(normalizarVentana(s.id, s.data()));
    if (!r) return;
    tx.set(ref, r.ventana);
    const ahora = new Date();
    (r.avisos ?? []).forEach((a, i) => {
      const n = nuevoAviso(a, ahora, i);
      tx.set(doc(db, 'notificaciones', n.id), n);
    });
  });
}
