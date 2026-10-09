// Alta y edición de productos desde BRILLO, con la MISMA forma de documento
// y las mismas validaciones que el formulario de la página
// (js/staff-catalogo.js → leerFormularioProducto). Funciones puras: no
// tocan Firebase, para poder probarlas.
import type { FotoProducto, Material, Producto, VarianteProducto } from './producto';
import { GALERIA_MAX_FOTOS, GALERIA_TAMANO_MAX } from './opciones';

/** Lo que se captura en el formulario. */
export interface BorradorProducto {
  nombre: string;
  descripcion: string;
  material: Material | '';
  categoria: string;
  calidad: string;
  codigo: string;
  colorOro: string;
  precioEtiqueta: string;
  descuento: string;
  variantes: { id: string; color: string; talla: string; stock: string; fotoId: string | null }[];
  galeria: FotoProducto[];
}

/** Los datos del producto tal como los guarda la página (sin id ni ultimaAccion). */
export interface DatosProducto {
  nombre: string;
  descripcion: string;
  material: Material | '';
  categoria: string;
  calidad: string;
  codigo: string;
  colorOro: string;
  variantes: VarianteProducto[];
  precioEtiqueta: number;
  descuento: number;
  disponible: boolean;
  galeria: FotoProducto[];
  imagen: string;
}

export function nuevoIdVariante(): string {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function nuevoIdFoto(): string {
  return `foto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function borradorVacio(): BorradorProducto {
  return {
    nombre: '',
    descripcion: '',
    material: '',
    categoria: '',
    calidad: 'estandar',
    codigo: '',
    colorOro: '',
    precioEtiqueta: '',
    descuento: '',
    variantes: [{ id: nuevoIdVariante(), color: '', talla: '', stock: '1', fotoId: null }],
    galeria: []
  };
}

export function borradorDesde(p: Producto): BorradorProducto {
  return {
    nombre: p.nombre,
    descripcion: p.descripcion,
    material: (p.material as Material) || '',
    categoria: p.categoria,
    // Se respeta tal cual (incluso vacío): no inventar cambios al editar.
    calidad: p.calidad,
    codigo: p.codigo,
    colorOro: p.colorOro,
    precioEtiqueta: String(p.precioEtiqueta),
    descuento: String(p.descuento),
    variantes: p.variantes.map(v => ({ ...v, stock: String(v.stock) })),
    galeria: p.galeria.map(f => ({ ...f }))
  };
}

const esEnteroNoNegativo = (s: string) => /^\d+$/.test(s.trim());
const esNumeroNoNegativo = (s: string) => /^\d+(\.\d+)?$/.test(s.trim());

export type ResultadoValidacion = { ok: true; datos: DatosProducto } | { ok: false, error: string };

/** Mismas reglas que la página, con mensajes en el mismo tono. */
export function validarBorrador(b: BorradorProducto): ResultadoValidacion {
  const nombre = b.nombre.trim();
  const descripcion = b.descripcion.trim();
  if (!nombre) return { ok: false, error: 'Escribe el nombre del producto.' };
  if (!descripcion) return { ok: false, error: 'Agrega una descripción.' };
  if (!b.material) return { ok: false, error: 'Elige el material.' };
  if (!b.variantes.length) return { ok: false, error: 'Agrega al menos una variante.' };
  if (b.variantes.some(v => !esEnteroNoNegativo(v.stock))) {
    return { ok: false, error: 'La existencia de alguna variante no es válida (número entero, 0 o más).' };
  }
  if (!esNumeroNoNegativo(b.precioEtiqueta)) return { ok: false, error: 'El precio etiqueta no es válido.' };
  if (!esNumeroNoNegativo(b.descuento) || Number(b.descuento) > 100) {
    return { ok: false, error: 'El descuento no es válido (0 a 100).' };
  }
  if (b.galeria.length > GALERIA_MAX_FOTOS) {
    return { ok: false, error: `Un producto admite máximo ${GALERIA_MAX_FOTOS} fotos.` };
  }
  const tamano = b.galeria.reduce((s, f) => s + (f.src?.length || 0), 0);
  if (tamano > GALERIA_TAMANO_MAX) {
    return { ok: false, error: 'Las fotos de este producto pesan demasiado juntas. Quita alguna o usa fotos más pequeñas.' };
  }

  const idsFotos = new Set(b.galeria.map(f => f.id));
  const variantes: VarianteProducto[] = b.variantes.map(v => ({
    id: v.id,
    color: v.color.trim(),
    talla: v.talla.trim(),
    stock: Number(v.stock.trim()),
    // Si se quitó la foto que tenía asignada, la variante vuelve a usar la principal.
    fotoId: v.fotoId && idsFotos.has(v.fotoId) ? v.fotoId : null
  }));

  return {
    ok: true,
    datos: {
      nombre,
      descripcion,
      material: b.material,
      categoria: b.categoria,
      calidad: b.calidad,
      codigo: b.codigo.trim(),
      colorOro: b.colorOro,
      variantes,
      precioEtiqueta: Number(b.precioEtiqueta.trim()),
      descuento: Number(b.descuento.trim()),
      disponible: variantes.some(v => v.stock > 0),
      galeria: b.galeria,
      imagen: b.galeria[0]?.src || ''
    }
  };
}

export interface UltimaAccion {
  tipo: 'Agregado' | 'Editado';
  empleado: string;
  fecha: string;
  /** Extra de BRILLO: desde dónde se hizo ("BRILLO (Tablet)"). La página no lo usa. */
  origen: string;
}

/**
 * Documento final. En una edición parte del documento ACTUAL del servidor,
 * así se conservan los campos que BRILLO no conoce o no edita.
 */
export function armarDocumento(
  id: string,
  datos: DatosProducto,
  ultimaAccion: UltimaAccion,
  actual: Record<string, unknown> = {}
): Record<string, unknown> {
  return { ...actual, id, ...datos, ultimaAccion };
}

const NOMBRES_CAMPOS: [keyof DatosProducto, string][] = [
  ['nombre', 'nombre'],
  ['descripcion', 'descripción'],
  ['material', 'material'],
  ['categoria', 'categoría'],
  ['calidad', 'calidad'],
  ['codigo', 'código'],
  ['colorOro', 'color de oro'],
  ['precioEtiqueta', 'precio'],
  ['descuento', 'descuento'],
  ['galeria', 'fotos']
];

/** Lista legible de lo que cambió en una edición, para la Actividad. */
export function describirCambios(antes: Producto, despues: DatosProducto): string[] {
  const cambios = NOMBRES_CAMPOS.filter(
    ([k]) => textoEstable(antes[k as keyof Producto]) !== textoEstable(despues[k])
  ).map(([, nombre]) => nombre);

  const estructura = (vs: VarianteProducto[]) => vs.map(v => [v.id, v.color, v.talla, v.fotoId]);
  if (textoEstable(estructura(antes.variantes)) !== textoEstable(estructura(despues.variantes))) {
    cambios.push('variantes');
  }
  const total = (vs: VarianteProducto[]) => vs.reduce((s, v) => s + v.stock, 0);
  const stockAntes = antes.variantes.map(v => v.stock).join(',');
  const stockDespues = despues.variantes.map(v => v.stock).join(',');
  if (stockAntes !== stockDespues) {
    cambios.push(`existencias ${total(antes.variantes)} → ${total(despues.variantes)}`);
  }
  return cambios;
}

/** Texto comparable sin importar el orden de las claves (mismo criterio que la página). */
export function textoEstable(valor: unknown): string {
  if (Array.isArray(valor)) return '[' + valor.map(textoEstable).join(',') + ']';
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    return (
      '{' +
      Object.keys(o)
        .sort()
        .filter(k => o[k] !== undefined)
        .map(k => JSON.stringify(k) + ':' + textoEstable(o[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(valor === undefined ? null : valor);
}
