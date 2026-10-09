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
}

export const PUBLICO_GENERAL: ClienteVenta = { tipo: 'publico', personaId: null, nombre: 'Público general', membresia: null };

export function clienteDesdePersona(p: Persona, nombre: string): ClienteVenta {
  return { tipo: p.tipo, personaId: p.id, nombre, membresia: p.usuario || null };
}

export interface LineaCarrito {
  /** Identifica la línea: productoId|varianteId, o servicio-<id>. */
  clave: string;
  productoId: string | null;
  varianteId: string | null;
  descripcion: string;
  codigo: string;
  material: string;
  cantidad: number;
  precioEtiqueta: number;
  /** Descuento de mayoreo del producto (se aplica solo si la clienta es emprendedora o líder). */
  descuentoMayoreo: number;
  /** Servicio o artículo sin inventario (grabado, reparación, ajuste...). */
  esServicio: boolean;
  /** Existencias de la variante al agregarla (tope de cantidad). null en servicios. */
  disponible: number | null;
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
    codigo: p.codigo,
    material: p.material,
    cantidad: 1,
    precioEtiqueta: p.precioEtiqueta,
    descuentoMayoreo: p.descuento,
    esServicio: false,
    disponible: v.stock
  };
}

export function lineaDeServicio(id: string, descripcion: string, precio: number): LineaCarrito {
  return {
    clave: `servicio-${id}`,
    productoId: null,
    varianteId: null,
    descripcion,
    codigo: '',
    material: 'servicio',
    cantidad: 1,
    precioEtiqueta: precio,
    descuentoMayoreo: 0,
    esServicio: true,
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
  const totalEtiqueta = r2(carrito.reduce((s, l) => s + l.precioEtiqueta * l.cantidad, 0));
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

export type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia';

export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia'
};

export interface PagoCaptura {
  metodo: MetodoPago;
  monto: number;
  /** Obligatoria en tarjeta y transferencia. */
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
  if (!pagos.length) return { ok: false, error: 'Agrega al menos un pago.' };
  for (const p of pagos) {
    if (p.metodo !== 'efectivo' && !normalizarReferencia(p.referencia)) {
      return { ok: false, error: `Falta el número de referencia del pago con ${NOMBRE_METODO[p.metodo].toLowerCase()}.` };
    }
  }
  const refs = pagos.filter(p => p.metodo !== 'efectivo').map(p => `${p.metodo}_${normalizarReferencia(p.referencia)}`);
  if (new Set(refs).size !== refs.length) return { ok: false, error: 'Hay dos pagos con la misma referencia.' };

  const recibido = r2(pagos.reduce((s, p) => s + p.monto, 0));
  const noEfectivo = r2(pagos.filter(p => p.metodo !== 'efectivo').reduce((s, p) => s + p.monto, 0));
  if (noEfectivo > total) return { ok: false, error: 'Tarjeta y transferencia no pueden pasar del total (solo el efectivo da cambio).' };
  if (recibido < total) return { ok: false, error: `Faltan ${(total - recibido).toFixed(2)} por cobrar.` };
  const cambio = r2(recibido - total);

  // El efectivo se registra por lo que REALMENTE entra a la caja (lo
  // recibido menos el cambio), en un solo renglón; así el corte cuadra.
  const efectivoRecibido = r2(pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + p.monto, 0));
  const efectivoNeto = r2(efectivoRecibido - cambio);
  const registrados: PagoRegistrado[] = pagos
    .filter(p => p.metodo !== 'efectivo')
    .map(p => ({ metodo: p.metodo, monto: r2(p.monto), referencia: normalizarReferencia(p.referencia) }));
  if (efectivoNeto > 0) registrados.unshift({ metodo: 'efectivo', monto: efectivoNeto, referencia: null });

  return { ok: true, recibido, cambio, pagos: registrados };
}

/** Folio legible por caja: C1-000123. */
export function formatoFolio(caja: string, numero: number): string {
  const n = caja.replace(/\D/g, '') || '0';
  return `C${n}-${String(numero).padStart(6, '0')}`;
}
