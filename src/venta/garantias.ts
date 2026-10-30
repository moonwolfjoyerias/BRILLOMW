// Garantías: se registran en la caja con dos opciones, primer o segundo
// cambio. Aplican a todos (público general, emprendedoras y líderes).
//
// - Primer cambio: folio del certificado + código de la pieza regresada +
//   código de la pieza que se lleva. La pieza regresada fija el VALOR
//   ORIGINAL (su precio de hoy, con descuento si es e/l).
// - Segundo cambio: mismo folio del certificado; se confirma que la pieza que
//   regresa es la que se llevó en el primer cambio y se elige la nueva.
// - En los dos, la diferencia es lo que cuesta la nueva menos el valor
//   original. Si la nueva cuesta menos, no se paga ni se deja saldo.
// - La pieza defectuosa NO vuelve a la venta: se guarda (zirconias).
// - Después del segundo cambio la garantía queda terminada.
import { precioMayoreo, type Producto } from '../pagina/producto';
import type { ClienteVenta, LineaCarrito } from './carrito';

export const COL_GARANTIAS = 'brilloGarantias';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PiezaGarantia {
  productoId: string | null;
  varianteId: string | null;
  codigo: string;
  nombre: string;
  variante: string;
  precioEtiqueta: number;
  /** Lo que vale para esta clienta (con su descuento si es e/l). */
  valor: number;
}

export interface CambioGarantia {
  numero: 1 | 2;
  fecha: string;
  folioVenta: string;
  regresada: PiezaGarantia;
  nueva: PiezaGarantia;
  diferencia: number;
  por: string;
}

export interface Garantia {
  /** Folio del certificado (id del documento). */
  folio: string;
  cliente: ClienteVenta;
  valorOriginal: number;
  cambios: CambioGarantia[];
  estado: 'abierta' | 'terminada';
}

/** Normaliza el folio que se escribe a mano (mayúsculas, sin espacios). */
export const normalizarFolio = (f: string) => f.trim().toUpperCase().replace(/\s+/g, '');

export function valorPara(p: Pick<Producto, 'precioEtiqueta' | 'descuento'>, cliente: ClienteVenta): number {
  return cliente.tipo === 'publico' ? p.precioEtiqueta : precioMayoreo(p);
}

export function piezaGarantia(p: Producto, varianteId: string, cliente: ClienteVenta): PiezaGarantia {
  const v = p.variantes.find(x => x.id === varianteId);
  if (!v) throw new Error('Variante inexistente');
  return {
    productoId: p.id,
    varianteId: v.id,
    codigo: p.codigo,
    nombre: p.nombre,
    variante: [v.color, v.talla].filter(Boolean).join(' · '),
    precioEtiqueta: p.precioEtiqueta,
    valor: valorPara(p, cliente)
  };
}

export const diferenciaGarantia = (valorNueva: number, valorOriginal: number) => r2(Math.max(0, valorNueva - valorOriginal));

/** ¿Se puede hacer este cambio con lo que ya hay guardado de ese folio? Devuelve el error, o null. */
export function validarCambio(numero: 1 | 2, existente: Garantia | null, codigoRegresada: string): string | null {
  if (numero === 1) return existente ? 'Ese folio de certificado ya tiene un primer cambio. Usa "Segundo cambio".' : null;
  if (!existente) return 'No hay un primer cambio con ese folio. Revisa el folio o usa "Primer cambio".';
  if (existente.estado === 'terminada' || existente.cambios.length >= 2) return 'Esa garantía ya tuvo sus dos cambios.';
  const ultima = existente.cambios[existente.cambios.length - 1].nueva;
  if (ultima.codigo && codigoRegresada.trim().toUpperCase() !== ultima.codigo.toUpperCase()) {
    return `La pieza que regresa no es la que se llevó en el primer cambio (${ultima.nombre}, código ${ultima.codigo}).`;
  }
  return null;
}

/** Línea de la venta: la pieza nueva sale del inventario y se cobra solo la diferencia. */
export function lineaDeGarantia(
  p: Producto,
  varianteId: string,
  folio: string,
  numero: 1 | 2,
  regresada: PiezaGarantia,
  valorOriginal: number,
  cliente: ClienteVenta
): LineaCarrito {
  const nueva = piezaGarantia(p, varianteId, cliente);
  const v = p.variantes.find(x => x.id === varianteId)!;
  return {
    clave: `garantia-${folio}`,
    productoId: p.id,
    varianteId,
    descripcion: [p.nombre, p.colorOro, nueva.variante].filter(Boolean).join(' · '),
    nombre: p.nombre,
    categoria: p.categoria,
    colorOro: p.colorOro,
    variante: nueva.variante,
    codigo: p.codigo,
    material: p.material,
    cantidad: 1,
    precioEtiqueta: p.precioEtiqueta,
    descuentoMayoreo: 0,
    esServicio: false,
    disponible: v.stock,
    garantia: {
      folio,
      numero,
      regresada: { productoId: regresada.productoId, varianteId: regresada.varianteId, codigo: regresada.codigo, nombre: regresada.nombre, variante: regresada.variante, precioEtiqueta: regresada.precioEtiqueta, valor: regresada.valor },
      valorOriginal,
      valorNueva: nueva.valor,
      diferencia: diferenciaGarantia(nueva.valor, valorOriginal)
    }
  };
}

/** Cómo queda el documento de la garantía después de cobrar este cambio. */
export function garantiaDespues(existente: Garantia | null, l: LineaCarrito, cliente: ClienteVenta, folioVenta: string, por: string, ahora: string): Garantia {
  const g = l.garantia!;
  const cambio: CambioGarantia = {
    numero: g.numero,
    fecha: ahora,
    folioVenta,
    regresada: g.regresada,
    nueva: { productoId: l.productoId, varianteId: l.varianteId, codigo: l.codigo, nombre: l.nombre, variante: l.variante, precioEtiqueta: l.precioEtiqueta, valor: g.valorNueva },
    diferencia: g.diferencia,
    por
  };
  const cambios = [...(existente?.cambios ?? []), cambio];
  return {
    folio: g.folio,
    cliente: existente?.cliente ?? cliente,
    valorOriginal: g.valorOriginal,
    cambios,
    estado: cambios.length >= 2 ? 'terminada' : 'abierta'
  };
}
