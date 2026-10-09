// Formato de los renglones del ticket. Funciones puras, para probarlas.
import type { LineaVendida } from './registrarVenta';

const p2 = (n: number) => String(n).padStart(2, '0');

/** "07/10/2026 11:42:04 a.m." */
export function fechaTicket(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${h12}:${p2(d.getMinutes())}:${p2(d.getSeconds())} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/**
 * Abreviaturas del renglón de cada pieza ("AN BL CORAZON VIRGEN").
 * PROVISIONAL: primeras dos letras de la categoría y del color de oro,
 * hasta que la tienda confirme su lista oficial.
 */
export function abreviatura(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase();
}

export interface DatosPieza {
  categoria: string;
  colorOro: string;
  nombre: string;
  /** Color de piedra y talla de la variante. */
  variante: string;
}

/** Primer renglón de la pieza: TIPO COLOR NOMBRE MEDIDA, en mayúsculas. */
export function renglonPieza(d: DatosPieza): string {
  return [abreviatura(d.categoria), abreviatura(d.colorOro), d.nombre, d.variante]
    .map(s => s.trim())
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Segundo renglón: "1 PZ x $289.00 (-60%)" (el importe va a la derecha). */
export function renglonCantidad(l: Pick<LineaVendida, 'cantidad' | 'precioEtiqueta' | 'descuentoAplicado' | 'esServicio'>): string {
  const unidad = l.esServicio ? 'SERV' : 'PZ';
  const desc = l.descuentoAplicado > 0 ? ` (-${l.descuentoAplicado}%)` : '';
  return `${l.cantidad} ${unidad} x ${MXN.format(l.precioEtiqueta)}${desc}`;
}
