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
 * Abreviaturas oficiales de la tienda (lista entregada en oct-2026, las
 * mismas de Aronium): tipo de pieza → [2 letras del ticket, 3 letras].
 * El ticket usa las de 2 letras ("AN BL CORAZON VIRGEN").
 */
export const ABREVIATURAS: Record<string, readonly [string, string]> = {
  ANILLO: ['AN', 'ANI'],
  ARETE: ['AE', 'ARE'],
  ARRACADA: ['AA', 'ARR'],
  BRAZALETE: ['BA', 'BRA'],
  BROQUEL: ['BO', 'BRO'],
  CADENA: ['CA', 'CAD'],
  CHAM: ['CH', 'CHA'],
  COLLAR: ['CO', 'COL'],
  DIJE: ['DI', 'DIJ'],
  EXIBIDOR: ['EX', 'EXB'],
  EXHIBIDOR: ['EX', 'EXB'],
  HUGGIE: ['HU', 'HUG'],
  JUEGO: ['JU', 'JUE'],
  PRENDEDOR: ['PR', 'PRE'],
  PULSERA: ['PU', 'PUL'],
  ROSARIO: ['RO', 'ROS'],
  SIMULADOR: ['SI', 'SIM'],
  TOBILLERA: ['TO', 'TOB'],
  ACERO: ['AC', 'ACE'],
  GOTICO: ['GO', 'GOT']
};

const limpiar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();

/** Entrada oficial de un tipo de pieza, en singular o plural ("Aretes", "Broqueles"). */
function oficial(texto: string): readonly [string, string] | null {
  const t = limpiar(texto);
  return ABREVIATURAS[t] ?? ABREVIATURAS[t.replace(/ES$/, '')] ?? ABREVIATURAS[t.replace(/S$/, '')] ?? null;
}

/** Colores de oro (confirmados por la tienda). */
export const ABREVIATURAS_COLOR: Record<string, string> = {
  BLANCO: 'BL',
  AMARILLO: 'AM',
  DORADO: 'DO',
  FLORENTINO: 'FL',
  NEGRO: 'NE',
  ROSA: 'RO'
};

/**
 * Abreviatura de 2 letras de un tipo de pieza: la oficial si viene en la
 * lista. Las categorías que no tienen (Fin de semana, Misterios,
 * Relicarios, Semanarios, Tiaras) no llevan abreviatura: cadena vacía.
 */
export function abreviatura(texto: string): string {
  return oficial(texto)?.[0] ?? '';
}

/** Abreviatura del color de oro: la confirmada, o sus primeras dos letras si es un color nuevo. */
export function abreviaturaColor(texto: string): string {
  const t = limpiar(texto);
  return ABREVIATURAS_COLOR[t] ?? t.slice(0, 2);
}

/** Abreviatura de 3 letras del tipo de pieza (la de la lista oficial), o null si no viene en la lista. */
export function abreviatura3(texto: string): string | null {
  return oficial(texto)?.[1] ?? null;
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
  return [abreviatura(d.categoria), abreviaturaColor(d.colorOro), d.nombre, d.variante]
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
