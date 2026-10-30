// Carrito y cobro de la caja. Funciones puras (sin Firebase) para probarlas.
import { precioMayoreo, type Producto } from '../pagina/producto';
import type { Persona } from '../pagina/persona';

export const IVA_TASA = 0.16;

export type TipoCliente = 'publico' | 'emprendedora' | 'lider';

export interface ClienteVenta {
  tipo: TipoCliente;
  personaId: string | null;
  nombre: string;
  /** Membresía (usuario de la página), si es emprendedora o líder. */
  membresia: string | null;
  /** Código de su tarjeta de cliente (el número de cliente de Aronium, ej. 000188). */
  codigoTarjeta?: string | null;
}

export const PUBLICO_GENERAL: ClienteVenta = { tipo: 'publico', personaId: null, nombre: 'Público general', membresia: null };

export function clienteDesdePersona(p: Persona, nombre: string): ClienteVenta {
  return { tipo: p.tipo, personaId: p.id, nombre, membresia: p.usuario || null, codigoTarjeta: p.codigoTarjeta };
}

export interface LineaCarrito {
  /** Identifica la línea: productoId|varianteId, o servicio-<id>. */
  clave: string;
  productoId: string | null;
  varianteId: string | null;
  descripcion: string;
  /** Partes de la descripción, para el ticket ("AN BL CORAZON VIRGEN 7"). */
  nombre: string;
  categoria: string;
  colorOro: string;
  variante: string;
  codigo: string;
  material: string;
  cantidad: number;
  precioEtiqueta: number;
  /** Descuento de mayoreo del producto (se aplica solo si la clienta es emprendedora o líder). */
  descuentoMayoreo: number;
  /** Servicio o artículo sin inventario (grabado, reparación, ajuste...). */
  esServicio: boolean;
  /** Qué servicio es: el grabado no cuenta como compra de la e/l (reparaciones y ajustes sí). */
  tipoServicio?: TipoServicio;
  /** Existencias de la variante al agregarla (tope de cantidad). null en servicios. */
  disponible: number | null;
  /** Cambio por garantía: la pieza nueva sale del inventario y solo se paga la diferencia. */
  garantia?: LineaGarantia;
}

/** Datos de garantía de una línea (ver venta/garantias.ts). */
export interface LineaGarantia {
  /** Folio del certificado de garantía (identifica la garantía en los dos cambios). */
  folio: string;
  numero: 1 | 2;
  /** Pieza que regresa (defectuosa): se guarda, no vuelve a la venta. */
  regresada: { productoId: string | null; varianteId: string | null; codigo: string; nombre: string; variante: string; precioEtiqueta: number; valor: number };
  /** Valor de la pieza que se llevó primero: siempre es la base de la diferencia. */
  valorOriginal: number;
  /** Valor de la pieza nueva para esta clienta (con su descuento si es e/l). */
  valorNueva: number;
  diferencia: number;
}

export function lineaDeProducto(p: Producto, varianteId: string): LineaCarrito {
  const v = p.variantes.find(x => x.id === varianteId);
  if (!v) throw new Error('Variante inexistente');
  const etiqueta = [v.color, v.talla].filter(Boolean).join(' · ');
  return {
    clave: `${p.id}|${v.id}`,
    productoId: p.id,
    varianteId: v.id,
    descripcion: [p.nombre, p.colorOro, etiqueta].filter(Boolean).join(' · '),
    nombre: p.nombre,
    categoria: p.categoria,
    colorOro: p.colorOro,
    variante: etiqueta,
    codigo: p.codigo,
    material: p.material,
    cantidad: 1,
    precioEtiqueta: p.precioEtiqueta,
    descuentoMayoreo: p.descuento,
    esServicio: false,
    disponible: v.stock
  };
}

export type TipoServicio = 'reparacion' | 'ajuste' | 'grabado' | 'articulo';
export const TIPOS_SERVICIO: Record<TipoServicio, string> = {
  reparacion: 'Reparación',
  ajuste: 'Ajuste',
  grabado: 'Grabado',
  articulo: 'Artículo sin inventario'
};

export function lineaDeServicio(id: string, descripcion: string, precio: number, tipoServicio: TipoServicio = 'articulo'): LineaCarrito {
  return {
    clave: `servicio-${id}`,
    productoId: null,
    varianteId: null,
    descripcion,
    nombre: descripcion,
    categoria: '',
    colorOro: '',
    variante: '',
    codigo: '',
    material: 'servicio',
    cantidad: 1,
    precioEtiqueta: precio,
    descuentoMayoreo: 0,
    esServicio: true,
    tipoServicio,
    disponible: null
  };
}

/** Agrega al carrito; si ya estaba, suma 1 sin pasar de las existencias. */
export function agregarLinea(carrito: LineaCarrito[], nueva: LineaCarrito): { carrito: LineaCarrito[]; error?: string } {
  const existente = carrito.find(l => l.clave === nueva.clave);
  if (!existente) {
    if (nueva.disponible !== null && nueva.disponible < 1) return { carrito, error: 'No hay existencias de esa variante.' };
    return { carrito: [...carrito, nueva] };
  }
  return cambiarCantidad(carrito, nueva.clave, existente.cantidad + 1);
}

export function cambiarCantidad(carrito: LineaCarrito[], clave: string, cantidad: number): { carrito: LineaCarrito[]; error?: string } {
  const l = carrito.find(x => x.clave === clave);
  if (!l) return { carrito };
  if (cantidad < 1) return { carrito: carrito.filter(x => x.clave !== clave) };
  if (l.disponible !== null && cantidad > l.disponible) {
    return { carrito, error: `Solo hay ${l.disponible} en existencia de ${l.descripcion}.` };
  }
  return { carrito: carrito.map(x => (x.clave === clave ? { ...x, cantidad } : x)) };
}

/** Precio unitario para esta clienta: mayoreo automático si es emprendedora o líder. */
export function precioUnitario(l: LineaCarrito, cliente: ClienteVenta): number {
  if (l.garantia) return l.garantia.diferencia;
  if (cliente.tipo === 'publico' || l.esServicio) return l.precioEtiqueta;
  return precioMayoreo({ precioEtiqueta: l.precioEtiqueta, descuento: l.descuentoMayoreo });
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Totales {
  piezas: number;
  /** Suma a precio etiqueta (antes de mayoreo). */
  totalEtiqueta: number;
  /** Total a pagar (IVA incluido). */
  total: number;
  descuentoMayoreo: number;
  /** Desglose del IVA incluido en el total. */
  baseSinIva: number;
  iva: number;
  /** Parte del total que es Souvenirs (no cuenta para comisiones; requisitos 4.2). */
  totalSouvenirs: number;
}

export function calcularTotales(carrito: LineaCarrito[], cliente: ClienteVenta): Totales {
  const total = r2(carrito.reduce((s, l) => s + precioUnitario(l, cliente) * l.cantidad, 0));
  // Una garantía no es "ahorro": cuenta a precio etiqueta solo lo que se paga de diferencia.
  const totalEtiqueta = r2(carrito.reduce((s, l) => s + (l.garantia ? l.garantia.diferencia : l.precioEtiqueta) * l.cantidad, 0));
  const baseSinIva = r2(total / (1 + IVA_TASA));
  const totalSouvenirs = r2(
    carrito.filter(l => l.material === 'souvenirs').reduce((s, l) => s + precioUnitario(l, cliente) * l.cantidad, 0)
  );
  return {
    piezas: carrito.reduce((s, l) => s + l.cantidad, 0),
    totalEtiqueta,
    total,
    descuentoMayoreo: r2(totalEtiqueta - total),
    baseSinIva,
    iva: r2(total - baseSinIva),
    totalSouvenirs
  };
}

// ---------------------------------------------------------------- pagos

/**
 * Formas de pago de la tienda (las mismas del reporte de Aronium). Gala,
 * Regalo y Souvenir se usan cuando el cajero lo indica; no llevan
 * referencia ni dan cambio. Para comisiones y recompensas solo cuentan
 * efectivo, tarjeta (terminal) y transferencia.
 */
export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'gala' | 'regalo' | 'souvenir' | 'cambio_fisico' | 'saldo_favor';

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta (terminal)',
  transferencia: 'Transferencia',
  gala: 'Gala',
  regalo: 'Regalo',
  souvenir: 'Souvenir',
  cambio_fisico: 'Cambio físico',
  saldo_favor: 'Saldo a favor'
};

/**
 * Las que el cajero escribe al cobrar. Cambio físico y saldo a favor no se
 * capturan a mano: salen del cambio abierto y del saldo guardado de la e/l.
 */
export const METODOS_CAPTURABLES: MetodoPago[] = ['efectivo', 'tarjeta', 'transferencia', 'gala', 'regalo', 'souvenir'];

/** Tarjeta y transferencia siempre guardan su número de referencia (y no se repite). */
export const LLEVA_REFERENCIA: readonly MetodoPago[] = ['tarjeta', 'transferencia'];
export const llevaReferencia = (m: MetodoPago) => LLEVA_REFERENCIA.includes(m);

export interface PagoCaptura {
  metodo: MetodoPago;
  monto: number;
  /** Obligatoria en tarjeta y transferencia (en las demás se ignora). */
  referencia: string;
}

export interface PagoRegistrado {
  metodo: MetodoPago;
  monto: number;
  referencia: string | null;
}

export type ResultadoPagos =
  | { ok: true; pagos: PagoRegistrado[]; cambio: number; recibido: number }
  | { ok: false; error: string };

export const normalizarReferencia = (r: string) => r.trim().toUpperCase().replace(/\s+/g, '');

/**
 * Valida los pagos contra el total. Solo el efectivo puede exceder (da
 * cambio); tarjeta y transferencia van exactas y con referencia.
 */
export function validarPagos(total: number, capturados: PagoCaptura[]): ResultadoPagos {
  const pagos = capturados.filter(p => p.monto > 0);
  // Todo quedó cubierto con cambio físico o saldo a favor: no hay nada que cobrar.
  if (total <= 0 && !pagos.length) return { ok: true, recibido: 0, cambio: 0, pagos: [] };
  if (!pagos.length) return { ok: false, error: 'Agrega al menos un pago.' };
  for (const p of pagos) {
    if (llevaReferencia(p.metodo) && !normalizarReferencia(p.referencia)) {
      return { ok: false, error: `Falta el número de referencia del pago con ${NOMBRE_METODO[p.metodo].toLowerCase()}.` };
    }
  }
  const refs = pagos.filter(p => llevaReferencia(p.metodo)).map(p => `${p.metodo}_${normalizarReferencia(p.referencia)}`);
  if (new Set(refs).size !== refs.length) return { ok: false, error: 'Hay dos pagos con la misma referencia.' };

  const recibido = r2(pagos.reduce((s, p) => s + p.monto, 0));
  const noEfectivo = r2(pagos.filter(p => p.metodo !== 'efectivo').reduce((s, p) => s + p.monto, 0));
  if (noEfectivo > total) return { ok: false, error: 'Los pagos que no son en efectivo no pueden pasar del total (solo el efectivo da cambio).' };
  if (recibido < total) return { ok: false, error: `Faltan ${(total - recibido).toFixed(2)} por cobrar.` };
  const cambio = r2(recibido - total);

  // El efectivo se registra por lo que REALMENTE entra a la caja (lo
  // recibido menos el cambio), en un solo renglón; así el corte cuadra.
  const efectivoRecibido = r2(pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0));
  const efectivoNeto = r2(efectivoRecibido - cambio);
  const registrados: PagoRegistrado[] = pagos
    .filter(p => p.metodo !== 'efectivo')
    .map(p => ({ metodo: p.metodo, monto: r2(p.monto), referencia: llevaReferencia(p.metodo) ? normalizarReferencia(p.referencia) : null }));
  if (efectivoNeto > 0) registrados.unshift({ metodo: 'efectivo', monto: efectivoNeto, referencia: null });

  return { ok: true, recibido, cambio, pagos: registrados };
}

/** Operación 200 = salida (venta), como en Aronium. */
export const OPERACION_VENTA = 200;

/**
 * N° de recibo con el formato de Aronium: año (2 dígitos) - operación -
 * consecutivo de 6 dígitos. Ej. 2026, venta 3944 → "26-200-003944".
 */
export function formatoRecibo(fechaDia: string, numero: number): string {
  return `${fechaDia.slice(2, 4)}-${OPERACION_VENTA}-${String(numero).padStart(6, '0')}`;
}
