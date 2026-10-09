// Opciones del formulario de productos: copiadas EXACTAMENTE de la página
// (js/staff-catalogo-ejemplo.js, js/catalogo-modelo.js, js/admin-catalogo.js),
// para que un producto dado de alta en BRILLO sea idéntico a uno de la página.
import type { Material } from './producto';

export const MATERIALES: { key: Material; label: string }[] = [
  { key: 'oro-laminado', label: 'Oro Laminado' },
  { key: 'acero-inoxidable', label: 'Acero Inoxidable' },
  { key: 'exhibidores', label: 'Exhibidores' },
  { key: 'souvenirs', label: 'Souvenirs' },
  { key: 'fantasia', label: 'Fantasía' },
  { key: 'otros', label: 'Otros' }
];

export const CATEGORIAS = [
  'Arracadas', 'Aretes', 'Anillos', 'Broqueles', 'Brazaletes', 'Cadenas', 'Collares',
  'Dijes', 'Fin de semana', 'Huggies', 'Juegos', 'Misterios', 'Pulseras', 'Prendedores',
  'Relicarios', 'Rosarios', 'Simuladores', 'Semanarios', 'Tobilleras', 'Tiaras'
];

export const CALIDADES = [
  { key: 'estandar', label: 'Estándar' },
  { key: 'premium', label: 'Premium' }
];

export const COLORES_ORO = ['Amarillo', 'Blanco', 'Dorado', 'Negro', 'Rosa'];

/** Descuento de mayoreo sugerido por material (DESCUENTOS_POR_MATERIAL). Siempre editable. */
export const DESCUENTO_SUGERIDO: Record<Material, number> = {
  'oro-laminado': 60,
  'acero-inoxidable': 40,
  exhibidores: 30,
  souvenirs: 0,
  fantasia: 40,
  otros: 0
};

export const GALERIA_MAX_FOTOS = 5;
/** Suma de caracteres base64 de la galería (un producto = un documento, límite ~1 MB). */
export const GALERIA_TAMANO_MAX = 700000;
/** Compresión de fotos igual que comprimirImagenAProductoDataURL() de la página. */
export const FOTO_LADO_MAX = 900;
export const FOTO_CALIDAD = 0.72;
