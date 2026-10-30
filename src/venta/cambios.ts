// Cambio físico (devoluciones de emprendedoras y líderes) y saldo a favor.
// Funciones puras, para probarlas.
//
// Cómo funciona en la tienda: la e/l deja las piezas que quiere cambiar; el
// cajero arma el cambio (cada pieza vale su precio de HOY con su descuento de
// mayoreo) e imprime el preticket para que Staff y la e/l sepan cuánto tiene
// a favor. El cambio queda ABIERTO (se pueden agregar piezas) hasta que se
// cierra la venta. Al cerrarla, el valor del cambio se usa como pago; si
// sobra, queda como saldo a favor a su nombre (no caduca). Las piezas
// regresan al inventario solo cuando el cajero presiona "Regresar al
// inventario". Ni el cambio ni el saldo cuentan para comisiones, constancia
// ni rifa: solo el dinero nuevo.
import { precioMayoreo, type Producto } from '../pagina/producto';
import type { ClienteVenta, PagoRegistrado } from './carrito';

export const COL_CAMBIOS = 'brilloCambiosFisicos';
export const COL_SALDOS = 'brilloSaldos';
export const COL_SALDO_MOVIMIENTOS = 'brilloSaldoMovimientos';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PiezaCambio {
  /** Identifica la pieza dentro del cambio (cada pieza física es un renglón). */
  clave: string;
  productoId: string | null;
  varianteId: string | null;
  codigo: string;
  nombre: string;
  categoria: string;
  colorOro: string;
  variante: string;
  precioEtiqueta: number;
  /** % de mayoreo aplicado. */
  descuento: number;
  /** Lo que vale a favor (precio de hoy con su descuento). */
  valor: number;
}

export interface CambioFisico {
  id: string;
  personaId: string;
  cliente: ClienteVenta;
  piezas: PiezaCambio[];
  estado: 'abierto' | 'cerrado';
  creadoPor: { uid: string; nombre: string };
  creadoEn: string;
  actualizadoEn: string;
  /** Al cerrarse con una venta. */
  folioVenta?: string;
}

/** Cada pieza vale su precio etiqueta de hoy con el descuento de mayoreo. */
export function piezaDeCambio(p: Producto, varianteId: string, ahora = Date.now()): PiezaCambio {
  const v = p.variantes.find(x => x.id === varianteId);
  if (!v) throw new Error('Variante inexistente');
  return {
    clave: `${p.id}|${v.id}|${ahora}`,
    productoId: p.id,
    varianteId: v.id,
    codigo: p.codigo,
    nombre: p.nombre,
    categoria: p.categoria,
    colorOro: p.colorOro,
    variante: [v.color, v.talla].filter(Boolean).join(' · '),
    precioEtiqueta: p.precioEtiqueta,
    descuento: p.descuento,
    valor: precioMayoreo(p)
  };
}

/**
 * Pieza que ya no está en el catálogo (por ejemplo, comprada en tiempos de
 * Aronium): el cajero escribe su precio etiqueta y el descuento. No puede
 * regresar al inventario porque no hay producto al cual sumarla.
 */
export function piezaManual(nombre: string, precioEtiqueta: number, descuento: number, ahora = Date.now()): PiezaCambio {
  return {
    clave: `manual|${ahora}`,
    productoId: null,
    varianteId: null,
    codigo: '',
    nombre: nombre.trim(),
    categoria: '',
    colorOro: '',
    variante: '',
    precioEtiqueta,
    descuento,
    valor: Math.round(precioEtiqueta * (1 - descuento / 100))
  };
}

export const valorCambio = (piezas: PiezaCambio[]) => r2(piezas.reduce((s, p) => s + p.valor, 0));

/**
 * Cómo se cubre una venta con el cambio físico y el saldo guardado: primero
 * el cambio; si no alcanza, el saldo (si el cajero lo usa); lo demás se paga.
 * Si el cambio pasa del total, lo que sobra se guarda como saldo a favor.
 */
export function aplicarCreditos(total: number, valorDelCambio: number, saldoDisponible: number, usarSaldo: boolean) {
  const usarCambio = r2(Math.min(total, valorDelCambio));
  const sobrante = r2(Math.max(0, valorDelCambio - total));
  const falta = r2(total - usarCambio);
  const usaSaldo = usarSaldo ? r2(Math.min(falta, Math.max(0, saldoDisponible))) : 0;
  return { usarCambio, usarSaldo: usaSaldo, sobrante, porPagar: r2(falta - usaSaldo) };
}

/** Renglones de pago de los créditos (van antes del dinero en el ticket). */
export function pagosDeCreditos(c: { usarCambio: number; usarSaldo: number }): PagoRegistrado[] {
  return [
    ...(c.usarCambio > 0 ? [{ metodo: 'cambio_fisico' as const, monto: c.usarCambio, referencia: null }] : []),
    ...(c.usarSaldo > 0 ? [{ metodo: 'saldo_favor' as const, monto: c.usarSaldo, referencia: null }] : [])
  ];
}

/** Lo que queda en la venta del cambio físico (para el ticket y para "Regresar al inventario"). */
export interface CambioEnVenta {
  id: string;
  piezas: PiezaCambio[];
  valor: number;
  usado: number;
  /** Lo que sobró y se guardó como saldo a favor. */
  aSaldo: number;
  regresado: { por: string; en: string } | null;
}

/** Piezas que sí pueden volver a la venta (las del catálogo). */
export const piezasRegresables = (piezas: PiezaCambio[]) => piezas.filter(p => p.productoId && p.varianteId);

/** Suma 1 de existencia por cada pieza devuelta (variantes ACTUALES del servidor). */
export function sumarExistencias(
  actuales: Map<string, Record<string, unknown>[] | undefined>,
  piezas: { productoId: string | null; varianteId: string | null }[],
  signo: 1 | -1 = 1
): { ok: true; cambios: Map<string, Record<string, unknown>[]> } | { ok: false; error: string } {
  const cambios = new Map<string, Record<string, unknown>[]>();
  for (const p of piezas) {
    if (!p.productoId || !p.varianteId) continue;
    const base = cambios.get(p.productoId) ?? actuales.get(p.productoId)?.map(v => ({ ...v }));
    if (!base) continue; // el producto ya no existe: no hay a dónde regresarla
    const v = base.find(x => x.id === p.varianteId);
    if (!v) continue;
    const nuevo = (Number(v.stock) || 0) + signo;
    if (nuevo < 0) return { ok: false, error: 'Esa pieza ya se vendió otra vez; no se puede quitar del inventario.' };
    v.stock = nuevo;
    cambios.set(p.productoId, base);
  }
  return { ok: true, cambios };
}
