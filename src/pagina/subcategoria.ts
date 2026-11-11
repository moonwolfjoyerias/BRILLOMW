// Subcategorías de Dijes: campo `subcategoria` del producto, igual que la
// página (SUBCATEGORIAS_DIJES en js/staff-catalogo-ejemplo.js). Al dar de
// alta un dije se marca "Religioso" o "Cruz" (solo una); sin marcar queda
// como dije normal. En los filtros van debajo de "Dijes" con el valor
// "Dijes:<clave>"; elegir "Dijes" trae todos.

export type SubcategoriaDije = 'religiosos' | 'cruces';

export const SUBCATEGORIAS_DIJES: { key: SubcategoriaDije | 'otros'; label: string; casilla?: string }[] = [
  { key: 'religiosos', label: 'Dijes religiosos', casilla: 'Religioso' },
  { key: 'cruces', label: 'Cruces', casilla: 'Cruz' },
  { key: 'otros', label: 'Otros dijes' }
];

interface ConCategoria { categoria: string; subcategoria?: string }

export function subcategoriaDije(p: ConCategoria): SubcategoriaDije | 'otros' | '' {
  if (p.categoria !== 'Dijes') return '';
  return p.subcategoria === 'religiosos' || p.subcategoria === 'cruces' ? p.subcategoria : 'otros';
}

/** "Dijes religiosos", "Cruces" o la categoría tal cual. */
export function etiquetaCategoria(p: ConCategoria): string {
  const sub = subcategoriaDije(p);
  return sub === 'religiosos' || sub === 'cruces' ? SUBCATEGORIAS_DIJES.find(s => s.key === sub)!.label : p.categoria;
}

/** ¿Entra en este valor de filtro ("Anillos", "Dijes" o "Dijes:cruces")? */
export function enCategoriaFiltro(p: ConCategoria, valor: string): boolean {
  if (!valor) return true;
  const [categoria, sub] = valor.split(':');
  if (p.categoria !== categoria) return false;
  return !sub || subcategoriaDije(p) === sub;
}

/** Opciones del filtro de categoría, con las de Dijes debajo. */
export function opcionesFiltroCategoria(categorias: string[]): { valor: string; texto: string }[] {
  return categorias.flatMap(c =>
    c === 'Dijes'
      ? [{ valor: c, texto: c }, ...SUBCATEGORIAS_DIJES.map(s => ({ valor: `Dijes:${s.key}`, texto: `— ${s.label}` }))]
      : [{ valor: c, texto: c }]
  );
}

/** Lo que se guarda: '' si no es dije o no se marcó nada. */
export function subcategoriaParaGuardar(categoria: string, subcategoria: string): string {
  return categoria === 'Dijes' && (subcategoria === 'religiosos' || subcategoria === 'cruces') ? subcategoria : '';
}
