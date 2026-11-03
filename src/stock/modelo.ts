// Stock: cuánto hay de cada pieza, entradas de mercancía, ajustes con
// motivo, historial por pieza y aviso de poco stock. Funciones puras.
//
// Cada cambio de existencia deja un movimiento en brilloMovimientosStock
// (inmutable): entradas y ajustes desde Stock, y también ventas, ventas
// canceladas, piezas de cambio físico que regresan al inventario y
// apartados (BRILLO y página).
import type { Producto } from '../pagina/producto';
import { etiquetaVariante } from '../pagina/producto';

export const COL_MOVIMIENTOS_STOCK = 'brilloMovimientosStock';
export const DOC_CONFIG_STOCK = ['brilloConfig', 'stock'] as const;
export const STOCK_MINIMO_POR_OMISION = 2;

export type TipoMovimiento =
  | 'entrada'
  | 'ajuste'
  | 'venta'
  | 'cancelacion_venta'
  | 'regreso_cambio'
  | 'apartado'
  | 'cancelacion_apartado';

export const NOMBRES_MOVIMIENTO: Record<TipoMovimiento, string> = {
  entrada: 'Entrada de mercancía',
  ajuste: 'Ajuste',
  venta: 'Venta',
  cancelacion_venta: 'Venta cancelada',
  regreso_cambio: 'Regresó de cambio físico',
  apartado: 'Apartado',
  cancelacion_apartado: 'Apartado cancelado'
};

export const MOTIVOS_AJUSTE = ['Conteo físico', 'Merma', 'Pieza dañada', 'Robo o extravío', 'Corrección de captura', 'Otro'] as const;

export interface MovimientoStock {
  productoId: string;
  varianteId: string;
  producto: string;
  variante: string;
  codigo: string;
  tipo: TipoMovimiento;
  /** + entra, − sale. */
  cantidad: number;
  antes: number | null;
  despues: number | null;
  motivo?: string;
  nota?: string;
  proveedor?: string;
  /** Folio de venta, id de apartado… */
  referencia?: string;
  por: string;
  fecha: string;
}

export type EstadoStock = 'agotado' | 'poco' | 'ok';

export interface FilaStock {
  producto: Producto;
  varianteId: string;
  variante: string;
  stock: number;
  minimo: number;
  estado: EstadoStock;
}

export function minimoDe(p: Pick<Producto, 'stockMinimo'>, general: number): number {
  return p.stockMinimo ?? general;
}

export function estadoStock(stock: number, minimo: number): EstadoStock {
  if (stock <= 0) return 'agotado';
  if (stock <= minimo) return 'poco';
  return 'ok';
}

/** Una fila por variante de cada producto. */
export function filasStock(productos: Producto[], minimoGeneral: number): FilaStock[] {
  return productos.flatMap(p =>
    p.variantes.map(v => {
      const minimo = minimoDe(p, minimoGeneral);
      return { producto: p, varianteId: v.id, variante: etiquetaVariante(v), stock: v.stock, minimo, estado: estadoStock(v.stock, minimo) };
    })
  );
}

type VarianteCruda = Record<string, unknown>;

/** Nueva existencia de una variante: suma (entrada/ajuste ±) o fija (conteo físico). */
export function cambiarExistencia(
  variantes: VarianteCruda[],
  varianteId: string,
  cambio: { sumar: number } | { fijar: number }
): { variantes: VarianteCruda[]; antes: number; despues: number } | { error: string } {
  const v = variantes.find(x => x.id === varianteId);
  if (!v) return { error: 'Esa variante ya no existe en el producto.' };
  const antes = Math.max(0, Math.floor(Number(v.stock) || 0));
  const despues = 'fijar' in cambio ? cambio.fijar : antes + cambio.sumar;
  if (!Number.isInteger(despues) || despues < 0) return { error: `La existencia no puede quedar en ${despues}.` };
  return { variantes: variantes.map(x => (x.id === varianteId ? { ...x, stock: despues } : x)), antes, despues };
}

/** Movimiento listo para guardar (sin campos vacíos). */
export function nuevoMovimiento(m: MovimientoStock): MovimientoStock {
  const limpio = { ...m } as Record<string, unknown>;
  for (const k of ['motivo', 'nota', 'proveedor', 'referencia']) if (!limpio[k]) delete limpio[k];
  return limpio as unknown as MovimientoStock;
}

export const idMovimiento = (fecha: Date, extra: string) => `${fecha.getTime()}_${extra}_${Math.random().toString(36).slice(2, 7)}`;
