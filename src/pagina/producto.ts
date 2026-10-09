// Documentos de `productos/{id}` tal como los guarda la PÁGINA WEB.
// BRILLO solo los LEE en la fase 0. Esta forma y la normalización copian
// js/catalogo-variantes-modelo.js (migrarProductoAVariantes) de la página;
// si la página cambia su forma, este archivo se ajusta a ella, nunca al revés.

/** Mismas claves que DESCUENTOS_POR_MATERIAL en js/catalogo-modelo.js. */
export type Material =
  | 'oro-laminado'
  | 'acero-inoxidable'
  | 'exhibidores'
  | 'fantasia'
  | 'souvenirs'
  | 'otros';

export const NOMBRE_MATERIAL: Record<Material, string> = {
  'oro-laminado': 'Oro laminado',
  'acero-inoxidable': 'Acero inoxidable',
  exhibidores: 'Exhibidores y cajas',
  fantasia: 'Fantasía',
  souvenirs: 'Souvenirs',
  otros: 'Otros'
};

export interface FotoProducto {
  id: string;
  src: string;
}

/** Una combinación color (piedra/zirconia) + talla con su propio stock. */
export interface VarianteProducto {
  id: string;
  color: string;
  talla: string;
  stock: number;
  /** Foto de producto.galeria; null = usa la foto principal. */
  fotoId: string | null;
}

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string;
  material: Material | string;
  categoria: string;
  calidad: string;
  codigo: string;
  /** Color de oro del modelo (vive en el producto, no en la variante). */
  colorOro: string;
  variantes: VarianteProducto[];
  precioEtiqueta: number;
  /** % de descuento de mayoreo. */
  descuento: number;
  disponible: boolean;
  galeria: FotoProducto[];
  imagen: string;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Convierte un documento crudo de Firestore a la forma actual, con las
 * mismas reglas de compatibilidad que la página: productos viejos sin
 * `variantes` se vuelven una sola variante; `colorOro` sube de la primera
 * variante al producto; `galeria` sale de la antigua foto única `imagen`.
 */
export function normalizarProducto(id: string, crudo: Record<string, unknown>): Producto {
  const variantesCrudas: Record<string, unknown>[] = Array.isArray(crudo.variantes)
    ? (crudo.variantes as Record<string, unknown>[])
    : [{ id: 'v-legado', colorOro: crudo.colorOro, talla: crudo.talla, stock: crudo.stock }];

  const colorOro =
    crudo.colorOro !== undefined && crudo.colorOro !== null
      ? texto(crudo.colorOro)
      : texto(variantesCrudas[0]?.colorOro);

  const galeria: FotoProducto[] = Array.isArray(crudo.galeria)
    ? (crudo.galeria as Record<string, unknown>[]).map((f, i) => ({
        id: texto(f.id) || `foto-${i}`,
        src: texto(f.src)
      }))
    : crudo.imagen
      ? [{ id: 'foto-legado', src: texto(crudo.imagen) }]
      : [];

  const variantes: VarianteProducto[] = variantesCrudas.map((v, i) => ({
    id: texto(v.id) || `v-${i}`,
    color: texto(v.color),
    talla: texto(v.talla),
    stock: Math.max(0, Math.floor(numero(v.stock))),
    fotoId: v.fotoId ? texto(v.fotoId) : null
  }));

  return {
    id,
    nombre: texto(crudo.nombre),
    descripcion: texto(crudo.descripcion),
    material: texto(crudo.material),
    categoria: texto(crudo.categoria),
    calidad: texto(crudo.calidad),
    codigo: texto(crudo.codigo),
    colorOro,
    variantes,
    precioEtiqueta: numero(crudo.precioEtiqueta),
    descuento: numero(crudo.descuento),
    disponible: variantes.some(v => v.stock > 0),
    galeria,
    imagen: galeria[0]?.src || ''
  };
}

/** Mismo texto que etiquetaVariante() de la página. */
export function etiquetaVariante(v: Pick<VarianteProducto, 'color' | 'talla'>): string {
  return [v.color, v.talla].filter(Boolean).join(' · ') || 'Única';
}

export function stockTotal(p: Pick<Producto, 'variantes'>): number {
  return p.variantes.reduce((suma, v) => suma + v.stock, 0);
}

/** Precio emprendedora — mismo redondeo que calcularPrecioEmprendedora() de la página. */
export function precioMayoreo(p: Pick<Producto, 'precioEtiqueta' | 'descuento'>): number {
  return Math.round(p.precioEtiqueta * (1 - p.descuento / 100));
}

export function nombreMaterial(material: string): string {
  return NOMBRE_MATERIAL[material as Material] ?? (material || 'Sin material');
}

/**
 * Solo fotos que BRILLO puede mostrar: incrustadas (data:) o con URL completa.
 * La página a veces guarda rutas relativas a sus propios archivos (por
 * ejemplo su logo como foto de respaldo), que fuera de la página no existen.
 */
export function fotoMostrable(src: string): string {
  return /^(data:image\/|https?:\/\/|blob:)/i.test(src) ? src : '';
}
