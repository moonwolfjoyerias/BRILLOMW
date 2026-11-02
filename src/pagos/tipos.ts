// Tipos de pago configurables (Administración → Tipos de pago).
//
// Los de siempre (Efectivo, Tarjeta, Transferencia, Gala, Regalo y Souvenir)
// más los que se agreguen (por ejemplo "Mercado Pago" o "Vales"). De cada uno:
// si está activo en la caja, si pide número de referencia (y no se puede
// repetir) y si cuenta para recompensas y comisiones. Efectivo siempre está
// activo y es el único que da cambio. Cambio físico y saldo a favor no son
// tipos de pago: salen del cambio abierto y del saldo guardado de la e/l.
//
// La configuración vive en brilloConfig/pagos; mientras no se carga (o si
// nunca se ha guardado) se usan los valores de siempre.
export const DOC_TIPOS_PAGO = ['brilloConfig', 'pagos'] as const;

export interface TipoPago {
  id: string;
  nombre: string;
  activo: boolean;
  pideReferencia: boolean;
  cuentaRecompensas: boolean;
  /** Los de siempre no se borran ni se renombran (solo se activan o desactivan). */
  base: boolean;
}

export const TIPOS_BASE: TipoPago[] = [
  { id: 'efectivo', nombre: 'Efectivo', activo: true, pideReferencia: false, cuentaRecompensas: true, base: true },
  { id: 'tarjeta', nombre: 'Tarjeta (terminal)', activo: true, pideReferencia: true, cuentaRecompensas: true, base: true },
  { id: 'transferencia', nombre: 'Transferencia', activo: true, pideReferencia: true, cuentaRecompensas: true, base: true },
  { id: 'gala', nombre: 'Gala', activo: true, pideReferencia: false, cuentaRecompensas: false, base: true },
  { id: 'regalo', nombre: 'Regalo', activo: true, pideReferencia: false, cuentaRecompensas: false, base: true },
  { id: 'souvenir', nombre: 'Souvenir', activo: true, pideReferencia: false, cuentaRecompensas: false, base: true }
];

/** No son tipos de pago configurables (salen del cambio y del saldo de la e/l). */
export const METODOS_INTERNOS = ['cambio_fisico', 'saldo_favor'] as const;

/** Une lo guardado con los de siempre (los de siempre primero, en su orden). */
export function combinarTipos(guardados: unknown): TipoPago[] {
  const lista = Array.isArray(guardados) ? (guardados as Partial<TipoPago>[]) : [];
  const porId = new Map(lista.filter(t => t && typeof t.id === 'string').map(t => [t.id!, t]));
  const base = TIPOS_BASE.map(b => {
    const g = porId.get(b.id);
    if (!g) return b;
    return {
      ...b,
      // Efectivo: siempre activo, sin referencia (da cambio).
      activo: b.id === 'efectivo' ? true : g.activo !== false,
      pideReferencia: b.id === 'efectivo' ? false : !!g.pideReferencia,
      cuentaRecompensas: g.cuentaRecompensas ?? b.cuentaRecompensas
    };
  });
  const propios = lista
    .filter(t => t && typeof t.id === 'string' && !TIPOS_BASE.some(b => b.id === t.id) && !(METODOS_INTERNOS as readonly string[]).includes(t.id!))
    .map(t => ({ id: t.id!, nombre: String(t.nombre || t.id), activo: t.activo !== false, pideReferencia: !!t.pideReferencia, cuentaRecompensas: !!t.cuentaRecompensas, base: false }));
  return [...base, ...propios];
}

/** Id para un tipo nuevo a partir de su nombre ("Mercado Pago" → "mercado_pago"). */
export function idDeTipo(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function validarTipos(tipos: TipoPago[]): string | null {
  const ids = new Set<string>();
  for (const t of tipos) {
    if (!t.nombre.trim()) return 'Cada tipo de pago necesita un nombre.';
    if (!t.id) return `"${t.nombre}" no tiene un nombre válido.`;
    if ((METODOS_INTERNOS as readonly string[]).includes(t.id)) return `"${t.nombre}" está reservado.`;
    if (ids.has(t.id)) return `Hay dos tipos de pago llamados "${t.nombre}".`;
    ids.add(t.id);
  }
  return null;
}

// ------------------------------------------------------------ los vigentes

let vigentes: TipoPago[] = TIPOS_BASE;
const oyentes = new Set<() => void>();

/** La app avisa aquí cuando cambia la configuración (ver useTiposPago). */
export function fijarTiposPago(tipos: TipoPago[]) {
  vigentes = tipos;
  oyentes.forEach(f => f());
}
export function alCambiarTiposPago(f: () => void) {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}
export const tiposPago = () => vigentes;

/** Los que el cajero puede elegir al cobrar. */
export const metodosCapturables = () => vigentes.filter(t => t.activo).map(t => t.id);
export const pideReferencia = (metodo: string) => vigentes.some(t => t.id === metodo && t.pideReferencia);
export const metodosQueCuentan = () => vigentes.filter(t => t.cuentaRecompensas).map(t => t.id);
export const nombreTipo = (metodo: string) => vigentes.find(t => t.id === metodo)?.nombre;
