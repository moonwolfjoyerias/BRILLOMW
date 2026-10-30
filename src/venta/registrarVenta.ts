// Registra una venta de caja en una sola transacción de Firestore:
// caja abierta + existencias reales + referencias no usadas → descuenta
// existencias en `productos` (la colección de la página), asigna folio y
// guarda la venta. Si algo falla, no se guarda nada.
import { FirebaseError } from 'firebase/app';
import { doc, runTransaction, serverTimestamp, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { COLECCION_TURNOS, idTurno, type IdCaja } from '../caja/turno';
import {
  calcularTotales,
  formatoRecibo,
  precioUnitario,
  type ClienteVenta,
  type LineaCarrito,
  type LineaGarantia,
  type PagoRegistrado,
  type TipoServicio,
  type Totales
} from './carrito';
import { COL_CAMBIOS, COL_SALDO_MOVIMIENTOS, COL_SALDOS, valorCambio, type CambioEnVenta, type CambioFisico } from './cambios';
import { COL_GARANTIAS, garantiaDespues, validarCambio, type Garantia } from './garantias';
import { COL_TICKETS_PERSONA, idIndicePersona, resumenTicket, type ResumenTicket } from './historial';

import { COL_COMPRAS, compraDeVenta, idCompraVenta, type CompraVenta } from '../compras/modelo';

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
  tipoServicio?: TipoServicio;
  garantia?: LineaGarantia;
}

export interface VentaRegistrada {
  id: string;
  /** N° de recibo, formato de Aronium: "26-200-003944". */
  folio: string;
  /** Orden N°: consecutivo propio de órdenes, como en Aronium. */
  orden: number;
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
  estado: 'completada' | 'cancelada';
  origen: 'pos';
  /** Piezas que dejó como cambio físico (si hubo). */
  cambioFisico?: CambioEnVenta;
  /** Saldo a favor de la e/l: lo que usó, lo que se le guardó y cómo quedó. */
  saldoAFavor?: { usado: number; guardado: number; saldoFinal: number };
  cancelada?: { por: string; en: string; motivo: string };
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
      esServicio: l.esServicio,
      ...(l.esServicio ? { tipoServicio: l.tipoServicio ?? 'articulo' } : {}),
      ...(l.garantia ? { garantia: l.garantia, descuentoAplicado: 0 } : {})
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
    /** Cambio físico abierto de esta clienta que se cierra con la venta. */
    cambioId?: string | null;
  }
): Promise<{ ok: true; venta: VentaRegistrada } | { ok: false; error: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'Sin conexión a internet. Por ahora, para cobrar se necesita conexión.' };
  }
  const { caja, fechaDia, cliente, carrito, pagos, perfil } = datos;
  if (!carrito.length && !datos.cambioId) return { ok: false, error: 'El carrito está vacío.' };
  const personaId = cliente.tipo !== 'publico' ? cliente.personaId : null;
  const usoCambio = pagos.filter(p => p.metodo === 'cambio_fisico').reduce((s, p) => s + p.monto, 0);
  const usoSaldo = pagos.filter(p => p.metodo === 'saldo_favor').reduce((s, p) => s + p.monto, 0);
  if ((datos.cambioId || usoSaldo > 0) && !personaId) return { ok: false, error: 'El cambio físico y el saldo a favor son solo de emprendedoras y líderes.' };
  const lineasGarantia = carrito.filter(l => l.garantia);
  const lineas = lineasVendidas(carrito, cliente);
  const totales = calcularTotales(carrito, cliente);
  const turnoId = idTurno(fechaDia, caja);
  const productoIds = [...new Set(lineas.filter(l => !l.esServicio && l.productoId).map(l => l.productoId!))];
  const refsPago = pagos.filter(p => p.referencia).map(p => ({ p, ref: doc(db, COLECCION_REFERENCIAS, `${p.metodo}_${p.referencia}`) }));

  try {
    const venta = await runTransaction(db, async tx => {
      // 1) Todas las lecturas primero (regla de Firestore para transacciones).
      const turno = await tx.get(doc(db, COLECCION_TURNOS, turnoId));
      // Consecutivos de TODA la tienda (las dos cajas comparten la cuenta,
      // como en Aronium). La transacción evita que dos cajas tomen el mismo.
      const recibosRef = doc(db, COLECCION_CONTADORES, 'recibos');
      const ordenesRef = doc(db, COLECCION_CONTADORES, 'ordenes');
      const recibos = await tx.get(recibosRef);
      const ordenes = await tx.get(ordenesRef);
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
      const cambioRef = datos.cambioId ? doc(db, COL_CAMBIOS, datos.cambioId) : null;
      const cambioSnap = cambioRef ? await tx.get(cambioRef) : null;
      const saldoRef = personaId ? doc(db, COL_SALDOS, personaId) : null;
      const saldoSnap = saldoRef ? await tx.get(saldoRef) : null;
      const garantias = new Map<string, Garantia | null>();
      for (const l of lineasGarantia) {
        const s = await tx.get(doc(db, COL_GARANTIAS, l.garantia!.folio));
        garantias.set(l.garantia!.folio, s.exists() ? (s.data() as Garantia) : null);
      }
      const indiceRef = personaId ? doc(db, COL_TICKETS_PERSONA, idIndicePersona(personaId, fechaDia)) : null;
      const indiceSnap = indiceRef ? await tx.get(indiceRef) : null;

      // 2) Validaciones con datos del servidor.
      if (!turno.exists() || turno.data().estado !== 'abierta') {
        throw new ErrorVenta('Esta caja no está abierta. Si ya se hizo el corte de hoy, ya no se puede cobrar en ella.');
      }
      if (usadas.length) throw new ErrorVenta(`Esa referencia ya se registró antes: ${usadas.join(', ')}. Revisa el comprobante.`);
      const r = descontarExistencias(actuales, lineas);
      if (!r.ok) throw new ErrorVenta(r.error);
      for (const l of lineasGarantia) {
        const err = validarCambio(l.garantia!.numero, garantias.get(l.garantia!.folio) ?? null, l.garantia!.regresada.codigo);
        if (err) throw new ErrorVenta(`Garantía ${l.garantia!.folio}: ${err}`);
      }
      // Cambio físico: se usa el que está guardado (alguien pudo agregar piezas).
      let cambio: CambioFisico | null = null;
      if (cambioRef) {
        if (!cambioSnap?.exists() || cambioSnap.data().estado !== 'abierto') throw new ErrorVenta('Ese cambio físico ya se cerró con otra venta.');
        cambio = { ...(cambioSnap.data() as CambioFisico), id: cambioSnap.id };
        if (cambio.personaId !== personaId) throw new ErrorVenta('El cambio físico es de otra persona.');
      }
      const valorDelCambio = cambio ? valorCambio(cambio.piezas) : 0;
      if (Math.round(usoCambio * 100) > Math.round(valorDelCambio * 100)) throw new ErrorVenta('El cambio físico cambió mientras cobrabas. Vuelve a abrir el cobro.');
      const saldoAntes = Number(saldoSnap?.exists() ? saldoSnap.data().saldo : 0) || 0;
      if (Math.round(usoSaldo * 100) > Math.round(saldoAntes * 100)) throw new ErrorVenta('Su saldo a favor cambió mientras cobrabas. Vuelve a abrir el cobro.');
      const aSaldo = Math.round((valorDelCambio - usoCambio) * 100) / 100;
      const saldoFinal = Math.round((saldoAntes - usoSaldo + aSaldo) * 100) / 100;

      // 3) Escrituras.
      const numero = Number(recibos.exists() ? recibos.data().siguiente : 1) || 1;
      const orden = Number(ordenes.exists() ? ordenes.data().siguiente : 1) || 1;
      const folio = formatoRecibo(fechaDia, numero);
      const v: VentaRegistrada = {
        id: folio,
        folio,
        orden,
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
        origen: 'pos',
        ...(cambio ? { cambioFisico: { id: cambio.id, piezas: cambio.piezas, valor: valorDelCambio, usado: usoCambio, aSaldo, regresado: null } } : {}),
        ...(personaId && (usoSaldo > 0 || aSaldo > 0) ? { saldoAFavor: { usado: usoSaldo, guardado: aSaldo, saldoFinal } } : {})
      };
      r.cambios.forEach((variantes, id) =>
        tx.update(doc(db, 'productos', id), { variantes, disponible: variantes.some(x => (Number(x.stock) || 0) > 0) })
      );
      // Cuenta de ventas del turno: al cerrar la caja sirve para saber que el
      // corte incluye todas.
      tx.update(doc(db, COLECCION_TURNOS, turnoId), { numVentas: (Number(turno.data().numVentas) || 0) + 1 });
      tx.set(recibosRef, { siguiente: numero + 1 }, { merge: true });
      tx.set(ordenesRef, { siguiente: orden + 1 }, { merge: true });
      tx.set(doc(db, COLECCION_VENTAS, folio), { ...v, fecha: serverTimestamp() });
      // Venta a una emprendedora o líder: cuenta como su compra (comisiones,
      // rango, constancia, rifa) desde ya; la página la lee de comprasBrillo.
      const compra = compraDeVenta(v);
      if (compra) {
        const c: CompraVenta = {
          tipo: 'venta', folio, personaId: cliente.personaId!, personaNombre: cliente.nombre, ...compra,
          estado: 'confirmada', fechaCuenta: v.fechaLocal, origen: 'brillo', por: perfil.nombre, porRol: perfil.rol, en: v.fechaLocal
        };
        tx.set(doc(db, COL_COMPRAS, idCompraVenta(folio)), c);
      }
      for (const { p, ref } of refsPago) {
        tx.set(ref, { metodo: p.metodo, referencia: p.referencia, monto: p.monto, folio, fechaDia, fecha: serverTimestamp() });
      }
      if (cambioRef && cambio) tx.update(cambioRef, { estado: 'cerrado', folioVenta: folio, actualizadoEn: v.fechaLocal });
      if (saldoRef && (usoSaldo > 0 || aSaldo > 0)) {
        tx.set(saldoRef, { personaId, personaNombre: cliente.nombre, saldo: saldoFinal, actualizadoEn: v.fechaLocal }, { merge: true });
        const mov = (tipo: 'uso' | 'abono', monto: number) =>
          tx.set(doc(db, COL_SALDO_MOVIMIENTOS, `${folio}__${tipo}`), { personaId, tipo, monto, folio, fecha: v.fechaLocal, por: perfil.nombre });
        if (usoSaldo > 0) mov('uso', usoSaldo);
        if (aSaldo > 0) mov('abono', aSaldo);
      }
      for (const l of lineasGarantia) {
        const g = garantiaDespues(garantias.get(l.garantia!.folio) ?? null, l, cliente, folio, perfil.nombre, v.fechaLocal);
        tx.set(doc(db, COL_GARANTIAS, l.garantia!.folio), g);
      }
      if (indiceRef) {
        const previos = (indiceSnap?.exists() ? (indiceSnap.data().tickets as ResumenTicket[]) : []) ?? [];
        tx.set(indiceRef, { personaId, mes: fechaDia.slice(0, 7), tickets: [...previos, resumenTicket(v)] });
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
