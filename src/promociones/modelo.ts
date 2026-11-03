// Promociones de la caja. Funciones puras: qué promociones le tocan a una
// venta y cuánto descuentan por renglón.
//
// Tipos: % de descuento, N×M (lleva N, paga M; salen gratis las más baratas)
// y precio especial. Cada una dice a qué piezas aplica (todo, productos,
// categorías o materiales), para quién (público, e/l o ambos; a la e/l se le
// aplica sobre su precio de mayoreo), sus fechas, y opcionalmente un cupón
// (código que se escribe en la caja), límite de usos, un uso por e/l y
// compra mínima.
//
// Varias a la vez: quien crea la promoción (Encargado o Administración)
// decide si es combinable. Las combinables se suman entre sí; una NO
// combinable nunca se junta con otra: se usa lo que más le ahorra a la
// clienta entre la mejor no combinable y todas las combinables juntas.
// No aplican a servicios ni a garantías.
import { precioUnitario, type ClienteVenta, type LineaCarrito } from '../venta/carrito';

export const COL_PROMOCIONES = 'brilloPromociones';
/** Un documento por promoción y persona que ya la usó (para "un uso por e/l"). */
export const COL_USOS_PROMOCION = 'brilloPromocionUsos';

export type TipoPromocion = 'porcentaje' | 'nxm' | 'precio';
export type ParaQuien = 'publico' | 'el' | 'ambos';

export const NOMBRES_TIPO: Record<TipoPromocion, string> = { porcentaje: '% de descuento', nxm: 'N×M (lleva N, paga M)', precio: 'Precio especial' };
export const NOMBRES_PARA: Record<ParaQuien, string> = { publico: 'Público general', el: 'Emprendedoras y líderes', ambos: 'Todos' };

export interface Promocion {
  id: string;
  nombre: string;
  tipo: TipoPromocion;
  /** % (porcentaje), precio fijo (precio). */
  valor: number;
  /** N×M: lleva n, paga m. */
  n?: number;
  m?: number;
  alcance: { todo: boolean; productos: string[]; categorias: string[]; materiales: string[] };
  paraQuien: ParaQuien;
  /** 'YYYY-MM-DD' (incluidos). */
  inicio: string;
  fin: string;
  activa: boolean;
  combinable: boolean;
  /** Se aplica solo si se escribe este código en la caja. */
  cupon?: string;
  limiteUsos?: number | null;
  unUsoPorPersona?: boolean;
  compraMinima?: number | null;
  /** Veces que se ha usado (lo suma cada venta). */
  usos: number;
  creadaPor?: string;
}

export interface PromoAplicada {
  id: string;
  nombre: string;
  cupon?: string;
  monto: number;
}

export interface ResultadoPromos {
  aplicadas: PromoAplicada[];
  /** Descuento por renglón (clave del renglón → monto total del renglón). */
  porLinea: Record<string, number>;
  total: number;
  /** Cupones escritos que no aplicaron, con el porqué. */
  avisos: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const normalizarCupon = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '');

function aplicaALinea(p: Promocion, l: LineaCarrito): boolean {
  if (l.esServicio || l.garantia) return false;
  const a = p.alcance;
  if (a.todo) return true;
  return (!!l.productoId && a.productos.includes(l.productoId)) || a.categorias.includes(l.categoria) || a.materiales.includes(l.material ?? '');
}

const esParaCliente = (p: Promocion, c: ClienteVenta) => p.paraQuien === 'ambos' || (p.paraQuien === 'publico') === (c.tipo === 'publico');

/** ¿Está vigente hoy (sin contar cupón ni usos por persona)? Devuelve el motivo si no. */
export function motivoNoVigente(p: Promocion, hoy: string): string | null {
  if (!p.activa) return 'está pausada';
  if (hoy < p.inicio) return `empieza el ${p.inicio}`;
  if (hoy > p.fin) return 'ya terminó';
  if (p.limiteUsos != null && p.usos >= p.limiteUsos) return 'ya se usó todas las veces permitidas';
  return null;
}

/** Descuento de UNA promoción por renglón (sin combinar con otras). */
export function descuentoDe(p: Promocion, carrito: LineaCarrito[], cliente: ClienteVenta): Record<string, number> {
  const lineas = carrito.filter(l => aplicaALinea(p, l));
  const res: Record<string, number> = {};
  if (p.tipo === 'porcentaje') {
    const pct = Math.min(100, Math.max(0, p.valor));
    for (const l of lineas) res[l.clave] = r2(precioUnitario(l, cliente) * l.cantidad * pct / 100);
  } else if (p.tipo === 'precio') {
    for (const l of lineas) {
      const pu = precioUnitario(l, cliente);
      if (pu > p.valor) res[l.clave] = r2((pu - p.valor) * l.cantidad);
    }
  } else {
    const n = Math.floor(p.n ?? 0);
    const m = Math.floor(p.m ?? 0);
    if (n > 0 && m >= 0 && m < n) {
      // Cada pieza por separado; por cada N salen gratis N−M, las más baratas.
      const unidades = lineas.flatMap(l => Array.from({ length: l.cantidad }, () => ({ clave: l.clave, precio: precioUnitario(l, cliente) }))).sort((a, b) => a.precio - b.precio);
      const gratis = Math.floor(unidades.length / n) * (n - m);
      for (const u of unidades.slice(0, gratis)) res[u.clave] = r2((res[u.clave] ?? 0) + u.precio);
    }
  }
  for (const k of Object.keys(res)) if (!(res[k] > 0)) delete res[k];
  return res;
}

const suma = (o: Record<string, number>) => r2(Object.values(o).reduce((s, x) => s + x, 0));

/**
 * Promociones que le tocan a esta venta. `cupones`: los códigos escritos en
 * la caja. `yaUsadas`: promociones de "un uso por e/l" que esta clienta ya usó.
 */
export function calcularPromociones(
  carrito: LineaCarrito[],
  cliente: ClienteVenta,
  promos: Promocion[],
  opciones: { hoy: string; cupones?: string[]; yaUsadas?: string[] }
): ResultadoPromos {
  const cupones = (opciones.cupones ?? []).map(normalizarCupon).filter(Boolean);
  const avisos: string[] = [];
  const subtotal = r2(carrito.reduce((s, l) => s + precioUnitario(l, cliente) * l.cantidad, 0));
  const candidatas: { p: Promocion; porLinea: Record<string, number> }[] = [];

  for (const p of promos) {
    const cupon = p.cupon ? normalizarCupon(p.cupon) : '';
    const conCupon = !!cupon && cupones.includes(cupon);
    if (cupon && !conCupon) continue;
    const explicar = (m: string) => { if (conCupon) avisos.push(`El cupón ${cupon} no aplica: ${m}.`); };
    const motivo = motivoNoVigente(p, opciones.hoy);
    if (motivo) { explicar(`la promoción ${motivo}`); continue; }
    if (!esParaCliente(p, cliente)) { explicar(p.paraQuien === 'publico' ? 'es solo para público general' : 'es solo para emprendedoras y líderes'); continue; }
    if (p.unUsoPorPersona && cliente.personaId && opciones.yaUsadas?.includes(p.id)) { explicar('esta clienta ya lo usó'); continue; }
    if (p.compraMinima && subtotal < p.compraMinima) { explicar(`la compra mínima es de $${p.compraMinima}`); continue; }
    const porLinea = descuentoDe(p, carrito, cliente);
    if (!suma(porLinea)) { explicar('no hay piezas de la promoción en la venta'); continue; }
    candidatas.push({ p, porLinea });
  }
  for (const c of cupones) if (!promos.some(p => p.cupon && normalizarCupon(p.cupon) === c)) avisos.push(`No existe el cupón ${c}.`);

  // Combinables juntas (sin pasar del precio de cada renglón) vs. la mejor no combinable.
  const tope = Object.fromEntries(carrito.map(l => [l.clave, r2(precioUnitario(l, cliente) * l.cantidad)]));
  const comb = candidatas.filter(c => c.p.combinable);
  const juntas: Record<string, number> = {};
  const aplicadasComb: PromoAplicada[] = [];
  for (const c of comb) {
    let monto = 0;
    for (const [k, v] of Object.entries(c.porLinea)) {
      const cabe = Math.max(0, r2(tope[k] - (juntas[k] ?? 0)));
      const usa = Math.min(v, cabe);
      if (usa > 0) { juntas[k] = r2((juntas[k] ?? 0) + usa); monto += usa; }
    }
    if (monto > 0) aplicadasComb.push({ id: c.p.id, nombre: c.p.nombre, ...(c.p.cupon ? { cupon: normalizarCupon(c.p.cupon) } : {}), monto: r2(monto) });
  }
  const mejorSola = candidatas.filter(c => !c.p.combinable).sort((a, b) => suma(b.porLinea) - suma(a.porLinea))[0];

  if (mejorSola && suma(mejorSola.porLinea) > suma(juntas)) {
    const p = mejorSola.p;
    return { aplicadas: [{ id: p.id, nombre: p.nombre, ...(p.cupon ? { cupon: normalizarCupon(p.cupon) } : {}), monto: suma(mejorSola.porLinea) }], porLinea: mejorSola.porLinea, total: suma(mejorSola.porLinea), avisos };
  }
  return { aplicadas: aplicadasComb, porLinea: juntas, total: suma(juntas), avisos };
}

export const SIN_PROMOCIONES: ResultadoPromos = { aplicadas: [], porLinea: {}, total: 0, avisos: [] };

/** Mismo resultado (para validar en el servidor que no cambió desde la pantalla). */
export const mismoResultado = (a: ResultadoPromos, b: ResultadoPromos) =>
  a.total === b.total && JSON.stringify(a.aplicadas.map(x => [x.id, x.monto])) === JSON.stringify(b.aplicadas.map(x => [x.id, x.monto]));

/** Error en texto o null. */
export function validarPromocion(p: Omit<Promocion, 'id' | 'usos'>): string | null {
  if (!p.nombre.trim()) return 'Escribe el nombre de la promoción.';
  if (!p.inicio || !p.fin || p.inicio > p.fin) return 'Revisa las fechas: el inicio debe ser antes del fin.';
  if (p.tipo === 'porcentaje' && !(p.valor > 0 && p.valor <= 100)) return 'El porcentaje va de 1 a 100.';
  if (p.tipo === 'precio' && !(p.valor >= 0)) return 'Escribe el precio especial.';
  if (p.tipo === 'nxm' && !(Number.isInteger(p.n) && Number.isInteger(p.m) && p.n! > 1 && p.m! >= 1 && p.m! < p.n!)) return 'En N×M, N debe ser mayor que M (ej. 3×2).';
  const a = p.alcance;
  if (!a.todo && !a.productos.length && !a.categorias.length && !a.materiales.length) return 'Elige a qué piezas aplica.';
  if (p.limiteUsos != null && !(Number.isInteger(p.limiteUsos) && p.limiteUsos > 0)) return 'El límite de usos debe ser un número entero mayor a 0.';
  if (p.compraMinima != null && !(p.compraMinima > 0)) return 'La compra mínima debe ser mayor a 0.';
  if (p.cupon != null && p.cupon !== '' && !/^[A-Z0-9_-]{3,20}$/.test(normalizarCupon(p.cupon))) return 'El cupón lleva de 3 a 20 letras o números, sin espacios.';
  return null;
}
