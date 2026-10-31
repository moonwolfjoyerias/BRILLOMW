// Lo que dice el código de la etiqueta (el mismo que lleva su QR), para
// llenar solo el formulario del producto al escanearlo:
//
//   HUGX000988119XP  →  HUG = Huggies · XP = Oro laminado
//   PULT001318462ACERO → PUL = Pulseras · ACERO = Acero inoxidable
//   BRO71857GT-03    →  BRO = Broqueles · GT = Oro laminado
//
// Inicio: las abreviaturas oficiales de la tienda (3 letras; si no, 2).
// Final: XP, GT y CM = Oro laminado; ACERO = Acero inoxidable (decisión de
// la tienda, oct-2026). Lo que no se reconoce se deja como esté.
// La página tiene la misma lógica en js/escaner-qr.js.
import type { Material } from './producto';

const CATEGORIA_3: Record<string, string> = {
  ANI: 'Anillos', ARE: 'Aretes', ARR: 'Arracadas', BRA: 'Brazaletes', BRO: 'Broqueles',
  CAD: 'Cadenas', COL: 'Collares', DIJ: 'Dijes', HUG: 'Huggies', JUE: 'Juegos',
  PRE: 'Prendedores', PUL: 'Pulseras', ROS: 'Rosarios', SIM: 'Simuladores', TOB: 'Tobilleras'
};
const CATEGORIA_2: Record<string, string> = {
  AN: 'Anillos', AE: 'Aretes', AA: 'Arracadas', BA: 'Brazaletes', BO: 'Broqueles',
  CA: 'Cadenas', CO: 'Collares', DI: 'Dijes', HU: 'Huggies', JU: 'Juegos',
  PR: 'Prendedores', PU: 'Pulseras', RO: 'Rosarios', SI: 'Simuladores', TO: 'Tobilleras'
};
const MATERIAL_FINAL: [string, Material][] = [
  ['ACERO', 'acero-inoxidable'],
  ['XP', 'oro-laminado'],
  ['GT', 'oro-laminado'],
  ['CM', 'oro-laminado']
];

/** El código como se guarda: sin espacios y en mayúsculas. Si el QR trae una liga, su última parte. */
export function limpiarCodigo(texto: string): string {
  let t = texto.trim();
  if (/^https?:\/\//i.test(t)) t = t.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';
  return t.replace(/\s+/g, '').toUpperCase();
}

export interface DatosCodigo {
  codigo: string;
  categoria: string | null;
  material: Material | null;
}

export function datosDeCodigo(texto: string): DatosCodigo {
  const codigo = limpiarCodigo(texto);
  const categoria = CATEGORIA_3[codigo.slice(0, 3)] ?? CATEGORIA_2[codigo.slice(0, 2)] ?? null;
  // "BRO71857GT-03": el número de variante del final no cuenta.
  const cuerpo = codigo.replace(/[-_]\d{1,3}$/, '');
  const material = MATERIAL_FINAL.find(([fin]) => cuerpo.endsWith(fin))?.[1] ?? null;
  return { codigo, categoria, material };
}
