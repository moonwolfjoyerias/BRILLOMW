// Pedidos pagados (Pedidos → Pagados), los mismos documentos que la página
// (js/pedidos-modelo.js): `pedidosPagados/{id}` y la foto del comprobante
// en `comprobantesPedidos/{id}`.
//
//   Por confirmar → Confirmar pago (Encargado/Admin: venta en la "Caja en
//   línea", cuenta como compra) | Rechazar (otro comprobante hasta el fin
//   del día; si no, las piezas regresan al catálogo)
//   Confirmado → normal: En bolsita (caja de pagados) → Entregado
//                foránea: Empaquetado → Enviado (guía) → Entregado
import { useEffect, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp,
  type Firestore, type Transaction
} from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { nuevoAviso } from '../pagina/avisos';
import { nuevoRegistroActividad, conOrigen } from '../pagina/actividad';
import { COLECCION_CONTADORES, COLECCION_REFERENCIAS, COLECCION_VENTAS, type LineaVendida, type VentaRegistrada } from '../venta/registrarVenta';
import type { Totales } from '../venta/carrito';
import { IVA_TASA, formatoRecibo } from '../venta/carrito';
import { COL_COMPRAS, idCompraVenta } from '../compras/modelo';
import { COL_TICKETS_PERSONA, idIndicePersona, resumenTicket } from '../venta/historial';
import { escribirEnResumen, partesResumenTx } from '../pagina/resumenCatalogo';
import { anotarMovimiento } from '../stock/acciones';
import type { Pieza, Ventana } from '../apartados/modelo';

export const COL_PEDIDOS_PAGADOS = 'pedidosPagados';
export const COL_COMPROBANTES = 'comprobantesPedidos';
/** La caja de los pedidos pagados por transferencia: sin turno ni efectivo. */
export const CAJA_EN_LINEA = 'en_linea';

export type EstadoPagado =
  | 'por_confirmar' | 'rechazado' | 'confirmado' | 'en_bolsita' | 'empaquetado' | 'enviado' | 'entregado' | 'vencido' | 'cancelado';

export const ESTADOS_PAGADO: Record<EstadoPagado, { texto: string; tono: 'aviso' | 'error' | 'ok' | 'neutro' }> = {
  por_confirmar: { texto: 'Por confirmar pago', tono: 'aviso' },
  rechazado: { texto: 'Comprobante rechazado', tono: 'error' },
  confirmado: { texto: 'Pago confirmado', tono: 'ok' },
  en_bolsita: { texto: 'En bolsita · caja de pagados', tono: 'ok' },
  empaquetado: { texto: 'Empaquetado', tono: 'ok' },
  enviado: { texto: 'Enviado', tono: 'ok' },
  entregado: { texto: 'Entregado', tono: 'neutro' },
  vencido: { texto: 'Sin comprobante · piezas liberadas', tono: 'neutro' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' }
};
export const TERMINADOS: EstadoPagado[] = ['entregado', 'vencido', 'cancelado'];

export interface PiezaPagada {
  id: string;
  productoId: string | null;
  varianteId: string | null;
  producto: string;
  variante: string;
  colorOro: string;
  material: string;
  categoria?: string;
  codigo?: string;
  precioEtiqueta: number;
  total: number;
}

export interface PasoHistorial { estado: string; por: string; rol: string; en: string; nota?: string }

export interface PedidoPagado {
  id: string;
  personaId: string;
  personaNombre: string;
  usuario: string;
  tipoPersona: 'emprendedora' | 'lider';
  telefono: string;
  categoria: string;
  origen: 'carrito' | 'apartado';
  ventanaId?: string;
  piezas: PiezaPagada[];
  subtotal: number;
  envio: number;
  envioGratis?: boolean;
  envioPorConfirmar?: boolean;
  total: number;
  estado: EstadoPagado;
  comprobante?: { referencia: string; subidoEn: string };
  rechazo?: { motivo: string; por: string; en: string; plazo: string };
  venta?: { folio: string; en: string; por: string };
  envioInfo?: { paqueteria: string; guia: string; en: string; por: string };
  historial: PasoHistorial[];
  dia: string;
  creadoEn: string;
  actualizadoEn: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Día de la tienda (San Luis Potosí), 'AAAA-MM-DD'. */
export function hoyTienda(fecha: Date = new Date()): string {
  try { return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }); } catch { return fecha.toISOString().slice(0, 10); }
}

export const esForanea = (p: Pick<PedidoPagado, 'categoria'>) => p.categoria === 'foranea';

// ------------------------------------------------------------ pasos

export interface Paso { estado: EstadoPagado; boton: string }

/** Los pasos que siguen después de confirmar el pago (normal: bolsita; foránea: paquete y guía). */
export function pasosDisponibles(p: Pick<PedidoPagado, 'estado' | 'categoria'>): Paso[] {
  const f = esForanea(p);
  switch (p.estado) {
    case 'confirmado': return [f ? { estado: 'empaquetado', boton: 'Empaquetar' } : { estado: 'en_bolsita', boton: 'Guardar en bolsita' }];
    case 'empaquetado': return f ? [{ estado: 'enviado', boton: 'Marcar enviado' }] : [];
    case 'en_bolsita': return [{ estado: 'entregado', boton: 'Ya se entregó' }];
    case 'enviado': return [{ estado: 'entregado', boton: 'Entregado' }];
    default: return [];
  }
}

/** Rechazado y ya pasó el día para mandar otro comprobante. */
export function rechazoVencido(p: Pick<PedidoPagado, 'estado' | 'rechazo'>, hoy = hoyTienda()): boolean {
  if (p.estado !== 'rechazado' || !p.rechazo) return false;
  return hoy > (p.rechazo.plazo || p.rechazo.en.slice(0, 10));
}

// ------------------------------------------------------------ venta en línea

/** Renglones de la venta: piezas a precio e/l y, si hay, el envío como servicio (no cuenta como compra). */
export function lineasVentaPedido(p: Pick<PedidoPagado, 'piezas' | 'envio'>): LineaVendida[] {
  const lineas: LineaVendida[] = p.piezas.map(x => {
    const etiqueta = Number(x.precioEtiqueta) || Number(x.total) || 0;
    const precio = Number(x.total) || 0;
    return {
      productoId: x.productoId ?? null, varianteId: x.varianteId ?? null,
      descripcion: [x.producto, x.variante].filter(Boolean).join(' '), nombre: x.producto ?? '',
      categoria: x.categoria ?? '', colorOro: x.colorOro ?? '', variante: x.variante ?? '', codigo: x.codigo ?? '',
      material: x.material ?? '', cantidad: 1, precioEtiqueta: etiqueta,
      descuentoAplicado: etiqueta > 0 ? Math.round((1 - precio / etiqueta) * 100) : 0,
      precioUnitario: precio, importe: precio, esServicio: false
    };
  });
  if (Number(p.envio) > 0) {
    lineas.push({
      productoId: null, varianteId: null, descripcion: 'Envío (paquetería)', nombre: 'Envío', categoria: '', colorOro: '', variante: '',
      codigo: '', material: '', cantidad: 1, precioEtiqueta: Number(p.envio), descuentoAplicado: 0,
      precioUnitario: Number(p.envio), importe: Number(p.envio), esServicio: true, tipoServicio: 'envio'
    });
  }
  return lineas;
}

export function totalesVentaPedido(lineas: LineaVendida[]): Totales {
  const total = r2(lineas.reduce((s, l) => s + l.importe, 0));
  const totalEtiqueta = r2(lineas.reduce((s, l) => s + l.precioEtiqueta * l.cantidad, 0));
  const baseSinIva = r2(total / (1 + IVA_TASA));
  return {
    piezas: lineas.filter(l => !l.esServicio).reduce((s, l) => s + l.cantidad, 0),
    totalEtiqueta, total, descuentoMayoreo: r2(totalEtiqueta - total), baseSinIva, iva: r2(total - baseSinIva),
    totalSouvenirs: r2(lineas.filter(l => l.material === 'souvenirs').reduce((s, l) => s + l.importe, 0))
  };
}

/** Lo que cuenta como su compra (Plan MW, recompensas): las piezas, sin el envío. */
export function compraDePedido(lineas: LineaVendida[]): { normal: number; souvenir: number } {
  let normal = 0;
  let souvenir = 0;
  for (const l of lineas) {
    if (l.esServicio) continue;
    if (l.material === 'souvenirs') souvenir += l.importe; else normal += l.importe;
  }
  return { normal: r2(normal), souvenir: r2(souvenir) };
}

export const puedeConfirmarPagos = (perfil: PerfilUsuario) => perfil.rol === 'encargado' || perfil.rol === 'admin';

// ------------------------------------------------------------ desde un apartado liquidado

export const idPagadoDeApartado = (ventanaId: string, piezas: { id: string }[]) =>
  `PA-${ventanaId}-${piezas.map(p => p.id).join('').slice(-12)}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);

/** El pedido pagado que nace al liquidar piezas de un apartado (ya pagadas; normal: ya en bolsita). */
export function pagadoDesdeApartado(v: Ventana, piezas: Pieza[], quien: { nombre: string; rol: string }, ahora = new Date()): PedidoPagado {
  const foranea = v.categoria === 'foranea';
  const en = ahora.toISOString();
  const subtotal = r2(piezas.reduce((s, p) => s + Number(p.total || 0), 0));
  return {
    id: idPagadoDeApartado(v.id, piezas),
    personaId: v.usuarioId, personaNombre: v.usuarioNombre, usuario: '', tipoPersona: 'emprendedora', telefono: v.telefono || '',
    categoria: foranea ? 'foranea' : 'normal', origen: 'apartado', ventanaId: v.id,
    piezas: piezas.map(p => ({
      id: p.id, productoId: p.productoId || null, varianteId: p.varianteId || null, producto: p.producto, variante: p.variante,
      colorOro: p.colorOro || '', material: p.material || '', precioEtiqueta: Number(p.precioEtiqueta) || 0, total: Number(p.total) || 0
    })),
    subtotal, envio: 0, envioGratis: false, total: subtotal,
    // Normal: solo pasa directo a la caja de pagados si TODAS sus piezas ya estaban en su bolsita.
    estado: foranea ? 'confirmado' : piezas.every(p => !!p.enBolsita) ? 'en_bolsita' : 'confirmado',
    historial: [{ estado: 'confirmado', por: quien.nombre, rol: quien.rol, en, nota: `Apartado ${v.id} liquidado` }],
    dia: hoyTienda(ahora), creadoEn: en, actualizadoEn: en
  };
}

// ------------------------------------------------------------ lectura

export type EstadoPagados = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; pedidos: PedidoPagado[] };

export function usePedidosPagados(db: Firestore): EstadoPagados {
  const [e, setE] = useState<EstadoPagados>({ estado: 'cargando' });
  useEffect(() => onSnapshot(
    collection(db, COL_PEDIDOS_PAGADOS),
    s => setE({ estado: 'listo', pedidos: s.docs.map(d => ({ ...(d.data() as PedidoPagado), id: d.id })).sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn))) }),
    () => setE({ estado: 'error' })
  ), [db]);
  return e;
}

export async function leerComprobante(db: Firestore, id: string): Promise<string> {
  try {
    const d = await getDoc(doc(db, COL_COMPROBANTES, id));
    const url = d.exists() ? d.data().fotoUrl : '';
    return typeof url === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url) ? url : '';
  } catch {
    return '';
  }
}

// ------------------------------------------------------------ acciones

const paso = (estado: string, perfil: PerfilUsuario, en: string, nota?: string): PasoHistorial => ({ estado, por: perfil.nombre, rol: perfil.rol, en, ...(nota ? { nota } : {}) });
const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;

function avisoPersona(tx: Transaction, db: Firestore, p: PedidoPagado, texto: string, ahora: Date) {
  const n = nuevoAviso({ texto, link: 'apartados', paraId: p.personaId, rolDestino: 'emprendedora_lider', origen: 'interno' }, ahora);
  tx.set(doc(db, 'notificaciones', n.id), n);
}

class ErrorPagado extends Error {}

/** Confirmar pago: venta en la Caja en línea (folio de la tienda), compra para Plan MW e historial de tickets. */
export async function confirmarPago(
  db: Firestore, pedido: PedidoPagado, referencia: string, perfil: PerfilUsuario, equipo: string, ahora = new Date()
): Promise<{ ok: true; folio: string } | { ok: false; error: string }> {
  if (!puedeConfirmarPagos(perfil)) return { ok: false, error: 'Solo Encargado y Administración confirman pagos (registran la venta).' };
  const refNorm = referencia.replace(/\s+/g, '').toUpperCase();
  const fechaDia = hoyTienda(ahora);
  const lineas = lineasVentaPedido(pedido);
  const totales = totalesVentaPedido(lineas);
  const pedidoRef = doc(db, COL_PEDIDOS_PAGADOS, pedido.id);
  const recibosRef = doc(db, COLECCION_CONTADORES, 'recibos');
  const ordenesRef = doc(db, COLECCION_CONTADORES, 'ordenes');
  const indiceRef = doc(db, COL_TICKETS_PERSONA, idIndicePersona(pedido.personaId, fechaDia));
  const refPago = refNorm ? doc(db, COLECCION_REFERENCIAS, `transferencia_${refNorm}`) : null;
  try {
    const folio = await runTransaction(db, async tx => {
      const actual = await tx.get(pedidoRef);
      const recibos = await tx.get(recibosRef);
      const ordenes = await tx.get(ordenesRef);
      const indice = await tx.get(indiceRef);
      const usada = refPago ? await tx.get(refPago) : null;
      if (!actual.exists() || actual.data().estado !== 'por_confirmar') throw new ErrorPagado('Este pago ya se revisó (quizá desde la página).');
      if (usada?.exists()) throw new ErrorPagado(`Esa referencia de transferencia ya se registró antes (folio ${String(usada.data().folio ?? '?')}). Revisa el comprobante.`);
      const numero = Number(recibos.exists() ? recibos.data().siguiente : 1) || 1;
      const orden = Number(ordenes.exists() ? ordenes.data().siguiente : 1) || 1;
      const folio = formatoRecibo(fechaDia, numero);
      const en = ahora.toISOString();
      const v = {
        id: folio, folio, orden, caja: CAJA_EN_LINEA, turnoId: CAJA_EN_LINEA, fechaDia, fechaLocal: en,
        cliente: { tipo: pedido.tipoPersona === 'lider' ? 'lider' : 'emprendedora', personaId: pedido.personaId, nombre: pedido.personaNombre, membresia: pedido.usuario || null },
        lineas, totales,
        pagos: [{ metodo: 'transferencia', monto: totales.total, ...(refNorm ? { referencia: refNorm } : {}) }],
        recibido: totales.total, cambio: 0,
        cobradoPor: { uid: perfil.uid, nombre: perfil.nombre, rol: perfil.rol },
        equipo, estado: 'completada', origen: 'en_linea', pedidoId: pedido.id, comentarios: `Pedido en línea ${pedido.id}`
      } as unknown as VentaRegistrada;
      tx.set(doc(db, COLECCION_VENTAS, folio), { ...v, fecha: serverTimestamp() });
      tx.set(recibosRef, { siguiente: numero + 1 }, { merge: true });
      tx.set(ordenesRef, { siguiente: orden + 1 }, { merge: true });
      const compra = compraDePedido(lineas);
      if (compra.normal + compra.souvenir > 0) {
        tx.set(doc(db, COL_COMPRAS, idCompraVenta(folio)), {
          tipo: 'venta', folio, personaId: pedido.personaId, personaNombre: pedido.personaNombre, ...compra,
          estado: 'confirmada', fechaCuenta: en, origen: 'brillo', por: perfil.nombre, porRol: perfil.rol, en
        });
      }
      const previos = (indice.exists() ? (indice.data().tickets as unknown[]) : []) ?? [];
      tx.set(indiceRef, { personaId: pedido.personaId, mes: fechaDia.slice(0, 7), tickets: [...previos, resumenTicket(v)] });
      if (refPago) tx.set(refPago, { metodo: 'transferencia', referencia: refNorm, monto: totales.total, folio, fechaDia, fecha: serverTimestamp() });
      tx.update(pedidoRef, {
        estado: 'confirmado', venta: { folio, en, por: perfil.nombre },
        historial: [...((actual.data().historial as PasoHistorial[]) ?? []), paso('confirmado', perfil, en, `Venta ${folio} · Caja en línea`)],
        actualizadoEn: en
      });
      avisoPersona(tx, db, pedido, `¡Tu pago de ${pesos(pedido.total)} quedó confirmado! Ticket ${folio}. ${esForanea(pedido) ? 'Te avisamos cuando tu paquete vaya en camino.' : 'Te avisamos cuando esté en tu bolsita, en la caja de pagados.'}`, ahora);
      const reg = nuevoRegistroActividad(perfil, 'apartados', 'confirmar_pago_pedido', conOrigen(`Pago confirmado de ${pedido.personaNombre} (${pesos(pedido.total)}) · venta ${folio} en Caja en línea`, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', reg.id), reg);
      return folio;
    });
    return { ok: true, folio };
  } catch (e) {
    if (e instanceof ErrorPagado) return { ok: false, error: e.message };
    return { ok: false, error: 'No se pudo confirmar el pago. Revisa tu conexión e inténtalo otra vez.' };
  }
}

export async function rechazarPago(db: Firestore, pedido: PedidoPagado, motivo: string, perfil: PerfilUsuario, ahora = new Date()): Promise<string | null> {
  const ref = doc(db, COL_PEDIDOS_PAGADOS, pedido.id);
  const en = ahora.toISOString();
  const rechazo = { motivo: motivo.trim().slice(0, 200) || 'El comprobante no es válido', por: perfil.nombre, en, plazo: hoyTienda(ahora) };
  try {
    await runTransaction(db, async tx => {
      const actual = await tx.get(ref);
      if (!actual.exists() || actual.data().estado !== 'por_confirmar') throw new ErrorPagado('Este pago ya se revisó.');
      tx.update(ref, { estado: 'rechazado', rechazo, historial: [...((actual.data().historial as PasoHistorial[]) ?? []), paso('rechazado', perfil, en, rechazo.motivo)], actualizadoEn: en });
      avisoPersona(tx, db, pedido, `Tu comprobante de pago (${pesos(pedido.total)}) no se pudo validar: ${rechazo.motivo}. Sube otro hoy antes de las 11:59 p.m. o tus piezas regresarán al catálogo.`, ahora);
    });
    return null;
  } catch (e) {
    return e instanceof ErrorPagado ? e.message : 'No se pudo guardar. Revisa tu conexión.';
  }
}

export async function avanzarPedido(
  db: Firestore, pedido: PedidoPagado, estado: EstadoPagado, perfil: PerfilUsuario, datos: { paqueteria?: string; guia?: string } = {}, ahora = new Date()
): Promise<string | null> {
  if (!pasosDisponibles(pedido).some(p => p.estado === estado)) return 'Ese paso ya no aplica a este pedido.';
  const en = ahora.toISOString();
  const ref = doc(db, COL_PEDIDOS_PAGADOS, pedido.id);
  let envioInfo: PedidoPagado['envioInfo'];
  if (estado === 'enviado') {
    const guia = (datos.guia ?? '').trim().slice(0, 60);
    if (!guia) return 'Escribe el número de guía.';
    envioInfo = { paqueteria: (datos.paqueteria ?? '').trim().slice(0, 40), guia, en, por: perfil.nombre };
  }
  try {
    await runTransaction(db, async tx => {
      const actual = await tx.get(ref);
      if (!actual.exists() || actual.data().estado !== pedido.estado) throw new ErrorPagado('Este pedido cambió; revisa la lista.');
      tx.update(ref, {
        estado, ...(envioInfo ? { envioInfo } : {}), actualizadoEn: en,
        historial: [...((actual.data().historial as PasoHistorial[]) ?? []), paso(estado, perfil, en, envioInfo ? `${envioInfo.paqueteria} ${envioInfo.guia}`.trim() : undefined)]
      });
      if (estado === 'en_bolsita') avisoPersona(tx, db, pedido, 'Tu pedido pagado ya está en tu bolsita, en la caja de pagados del local. ¡Pasa por él cuando quieras!', ahora);
      if (estado === 'enviado' && envioInfo) avisoPersona(tx, db, pedido, `¡Tu pedido va en camino! ${envioInfo.paqueteria ? envioInfo.paqueteria + ', ' : ''}guía ${envioInfo.guia}.`, ahora);
    });
    return null;
  } catch (e) {
    return e instanceof ErrorPagado ? e.message : 'No se pudo guardar. Revisa tu conexión.';
  }
}

/** Rechazado y sin otro comprobante al terminar el día: las piezas regresan al catálogo (una sola vez). */
export async function vencerPedido(db: Firestore, pedido: PedidoPagado, ahora = new Date()): Promise<void> {
  const ref = doc(db, COL_PEDIDOS_PAGADOS, pedido.id);
  try {
    await runTransaction(db, async tx => {
      const actual = await tx.get(ref);
      if (!actual.exists() || actual.data().estado !== 'rechazado') return;
      const ids = [...new Set(pedido.piezas.map(p => p.productoId).filter((x): x is string => !!x))];
      const productos = new Map<string, Record<string, unknown>>();
      for (const id of ids) {
        const s = await tx.get(doc(db, 'productos', id));
        if (s.exists()) productos.set(id, s.data());
      }
      const partes = ids.length ? await partesResumenTx(tx, db) : null;
      for (const [id, datos] of productos) {
        const variantes = ((datos.variantes as Record<string, unknown>[]) ?? []).map(v => {
          const n = pedido.piezas.filter(p => p.productoId === id && p.varianteId === v.id).length;
          return n ? { ...v, stock: (Number(v.stock) || 0) + n } : v;
        });
        const cambio = { variantes, disponible: variantes.some(v => (Number(v.stock) || 0) > 0) };
        tx.update(doc(db, 'productos', id), cambio);
        escribirEnResumen(tx, db, partes, id, { ...datos, ...cambio });
        for (const v of (datos.variantes as Record<string, unknown>[]) ?? []) {
          const n = pedido.piezas.filter(p => p.productoId === id && p.varianteId === v.id).length;
          if (!n) continue;
          const antes = Number(v.stock) || 0;
          anotarMovimiento(tx, db, { productoId: id, varianteId: String(v.id), producto: datos, tipo: 'cancelacion_apartado', cantidad: n, antes, despues: antes + n, referencia: pedido.id, nota: `Pedido pagado sin comprobante válido · ${pedido.personaNombre}`, por: 'Sistema' }, ahora);
        }
      }
      const en = ahora.toISOString();
      tx.update(ref, {
        estado: 'vencido', actualizadoEn: en,
        historial: [...((actual.data().historial as PasoHistorial[]) ?? []), { estado: 'vencido', por: 'Sistema', rol: '', en, nota: 'No llegó otro comprobante a tiempo' }]
      });
    });
  } catch {
    /* lo intenta de nuevo quien lo vea después */
  }
}

