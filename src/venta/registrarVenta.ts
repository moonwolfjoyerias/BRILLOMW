// Registra una venta de caja en una sola transacción de Firestore:
// caja abierta + existencias reales + referencias no usadas → descuenta
// existencias en `productos` (la colección de la página), asigna folio y
// guarda la venta. Si algo falla, no se guarda nada.
import { FirebaseError } from 'firebase/app';
import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { COLECCION_TURNOS, idTurno, type IdCaja } from '../caja/turno';
import {
  calcularTotales,
  formatoFolio,
  precioUnitario,
  type ClienteVenta,
  type LineaCarrito,
  type PagoRegistrado,
  type Totales
} from './carrito';

export const COLECCION_VENTAS = 'brilloVentas';
export const COLECCION_CONTADORES = 'brilloContadores';
export const COLECCION_REFERENCIAS = 'brilloReferenciasPago';

export interface LineaVendida {
  productoId: string | null;
  varianteId: string | null;
  descripcion: string;
  nombre: string;
  categoria: string;
  colorOro: string;
  variante: string;
  codigo: string;
  material: string;
  cantidad: number;
  precioEtiqueta: number;
  /** % de mayoreo aplicado en esta venta (0 si fue precio etiqueta). */
  descuentoAplicado: number;
  precioUnitario: number;
  importe: number;
  esServicio: boolean;
}

export interface VentaRegistrada {
  id: string;
  folio: string;
  caja: IdCaja;
  turnoId: string;
  fechaDia: string;
  /** Hora del equipo al cobrar (la del servidor se guarda aparte). */
  fechaLocal: string;
  cliente: ClienteVenta;
  lineas: LineaVendida[];
  totales: Totales;
  pagos: PagoRegistrado[];
  recibido: number;
  cambio: number;
  cobradoPor: { uid: string; nombre: string; rol: string };
  equipo: string;
  estado: 'completada';
  origen: 'pos';
}

export function lineasVendidas(carrito: LineaCarrito[], cliente: ClienteVenta): LineaVendida[] {
  return carrito.map(l => {
    const pu = precioUnitario(l, cliente);
    return {
      productoId: l.productoId,
      varianteId: l.varianteId,
      descripcion: l.descripcion,
      nombre: l.nombre,
      categoria: l.categoria,
      colorOro: l.colorOro,
      variante: l.variante,
      codigo: l.codigo,
      material: l.material,
      cantidad: l.cantidad,
      precioEtiqueta: l.precioEtiqueta,
      descuentoAplicado: pu === l.precioEtiqueta ? 0 : l.descuentoMayoreo,
      precioUnitario: pu,
      importe: Math.round(pu * l.cantidad * 100) / 100,
      esServicio: l.esServicio
    };
  });
}

/**
 * Calcula las nuevas variantes de cada producto tras la venta, con las
 * existencias ACTUALES del servidor. Pura, para probarla.
 */
export function descontarExistencias(
  actuales: Map<string, Record<string, unknown> | undefined>,
  lineas: LineaVendida[]
): { ok: true; cambios: Map<string, Record<string, unknown>[]> } | { ok: false; error: string } {
  const cambios = new Map<string, Record<string, unknown>[]>();
  for (const l of lineas) {
    if (l.esServicio || !l.productoId || !l.varianteId) continue;
    const doc = actuales.get(l.productoId);
    if (!doc) return { ok: false, error: `"${l.descripcion}" ya no existe en el catálogo.` };
    const variantes = cambios.get(l.productoId) ?? (Array.isArray(doc.variantes) ? (doc.variantes as Record<string, unknown>[]).map(v => ({ ...v })) : []);
    const v = variantes.find(x => x.id === l.varianteId);
    if (!v) return { ok: false, error: `La variante de "${l.descripcion}" ya no existe.` };
    const stock = Number(v.stock) || 0;
    if (stock < l.cantidad) {
      return {
        ok: false,
        error: stock > 0
          ? `Solo ${stock === 1 ? 'queda' : 'quedan'} ${stock} de "${l.descripcion}" (alguien más la vendió o apartó). Ajusta la cantidad.`
          : `Ya no hay existencia de "${l.descripcion}" (alguien más la vendió o apartó). Quítala del carrito.`
      };
    }
    v.stock = stock - l.cantidad;
    cambios.set(l.productoId, variantes);
  }
  return { ok: true, cambios };
}

class ErrorVenta extends Error {}

export async function registrarVenta(
  db: Firestore,
  datos: {
    caja: IdCaja;
    fechaDia: string;
    cliente: ClienteVenta;
    carrito: LineaCarrito[];
    pagos: PagoRegistrado[];
    recibido: number;
    cambio: number;
    perfil: PerfilUsuario;
    equipo: string;
  }
): Promise<{ ok: true; venta: VentaRegistrada } | { ok: false; error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Sin conexión a internet. Por ahora, para cobrar se necesita conexión.' };
  }
  const { caja, fechaDia, cliente, carrito, pagos, perfil } = datos;
  if (!carrito.length) return { ok: false, error: 'El carrito está vacío.' };
  const lineas = lineasVendidas(carrito, cliente);
  const totales = calcularTotales(carrito, cliente);
  const turnoId = idTurno(fechaDia, caja);
  const productoIds = [...new Set(lineas.filter(l => !l.esServicio && l.productoId).map(l => l.productoId!))];
  const refsPago = pagos.filter(p => p.referencia).map(p => ({ p, ref: doc(db, COLECCION_REFERENCIAS, `${p.metodo}_${p.referencia}`) }));

  try {
    const venta = await runTransaction(db, async tx => {
      // 1) Todas las lecturas primero (regla de Firestore para transacciones).
      const turno = await tx.get(doc(db, COLECCION_TURNOS, turnoId));
      const contadorRef = doc(db, COLECCION_CONTADORES, `folios_${caja}`);
      const contador = await tx.get(contadorRef);
      const actuales = new Map<string, Record<string, unknown> | undefined>();
      for (const id of productoIds) {
        const s = await tx.get(doc(db, 'productos', id));
        actuales.set(id, s.exists() ? s.data() : undefined);
      }
      const usadas = [];
      for (const { p, ref } of refsPago) {
        const s = await tx.get(ref);
        if (s.exists()) usadas.push(`${p.referencia} (folio ${String(s.data().folio ?? '?')})`);
      }

      // 2) Validaciones con datos del servidor.
      if (!turno.exists() || turno.data().estado !== 'abierta') {
        throw new ErrorVenta('Esta caja no está abierta hoy. Ábrela en la pestaña Caja.');
      }
      if (usadas.length) throw new ErrorVenta(`Esa referencia ya se registró antes: ${usadas.join(', ')}. Revisa el comprobante.`);
      const r = descontarExistencias(actuales, lineas);
      if (!r.ok) throw new ErrorVenta(r.error);

      // 3) Escrituras.
      const numero = (Number(contador.exists() ? contador.data().siguiente : 1) || 1);
      const folio = formatoFolio(caja, numero);
      const v: VentaRegistrada = {
        id: folio,
        folio,
        caja,
        turnoId,
        fechaDia,
        fechaLocal: new Date().toISOString(),
        cliente,
        lineas,
        totales,
        pagos,
        recibido: datos.recibido,
        cambio: datos.cambio,
        cobradoPor: { uid: perfil.uid, nombre: perfil.nombre, rol: perfil.rol },
        equipo: datos.equipo,
        estado: 'completada',
        origen: 'pos'
      };
      r.cambios.forEach((variantes, id) =>
        tx.update(doc(db, 'productos', id), { variantes, disponible: variantes.some(x => (Number(x.stock) || 0) > 0) })
      );
      tx.set(contadorRef, { siguiente: numero + 1, caja });
      tx.set(doc(db, COLECCION_VENTAS, folio), { ...v, fecha: serverTimestamp() });
      for (const { p, ref } of refsPago) {
        tx.set(ref, { metodo: p.metodo, referencia: p.referencia, monto: p.monto, folio, fechaDia, fecha: serverTimestamp() });
      }
      return v;
    });
    return { ok: true, venta };
  } catch (e) {
    if (e instanceof ErrorVenta) return { ok: false, error: e.message };
    if (e instanceof FirebaseError && e.code === 'permission-denied') {
      return { ok: false, error: 'Firebase rechazó la venta. Revisa que tu cuenta tenga permiso para cobrar.' };
    }
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) {
      return { ok: false, error: 'Sin conexión a internet. Por ahora, para cobrar se necesita conexión.' };
    }
    return { ok: false, error: 'No se pudo registrar la venta. No se cobró nada; inténtalo de nuevo.' };
  }
}
