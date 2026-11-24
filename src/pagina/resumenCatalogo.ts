// Resumen del catálogo de la página: `catalogoResumen/p0…pN` guarda todos
// los productos (sin fotos) en pocos documentos para que abrir el catálogo
// cueste ~12 lecturas en vez de una por producto (ver "RESUMEN DEL
// CATÁLOGO" en js/catalogo-firestore-sync.js de la página).
// `catalogoMeta/resumen` dice en cuántas partes está.
//
// Cada vez que BRILLO cambia un producto (venta, apartado, stock, alta o
// edición) escribe aquí el producto tal como quedó, en la misma
// transacción o lote. Así el catálogo de la página ve la existencia
// correcta sin tener que leer el producto aparte.
import { deleteField, doc, getDoc, type Firestore, type Transaction, type WriteBatch } from '../datos/firestore';

export const COL_RESUMEN = 'catalogoResumen';
const CAMPOS_FOTO = ['galeria', 'imagen', 'fotosEditadas'];

/** Misma parte que calcula la página (parteResumenCatalogo). */
export function parteResumen(productoId: string, partes: number): string {
  const texto = String(productoId);
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  return 'p' + (hash % partes);
}

/** El producto sin fotos, como va en el resumen. */
export function productoLigero(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!CAMPOS_FOTO.includes(k) && v !== undefined) out[k] = v;
  return out;
}

const metaRef = (db: Firestore) => doc(db, 'catalogoMeta', 'resumen');
const partesDe = (d: Record<string, unknown> | undefined) => {
  const n = Number(d?.partes);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Partes del resumen leídas dentro de la transacción (antes de cualquier escritura); null si no hay resumen. */
export async function partesResumenTx(tx: Transaction, db: Firestore): Promise<number | null> {
  try {
    const s = await tx.get(metaRef(db));
    return s.exists() ? partesDe(s.data()) : null;
  } catch {
    return null;
  }
}

/** Igual, fuera de transacción (para lotes). */
export async function partesResumen(db: Firestore): Promise<number | null> {
  try {
    const s = await getDoc(metaRef(db));
    return s.exists() ? partesDe(s.data()) : null;
  } catch {
    return null;
  }
}

/** Ids que se pueden escribir como ruta "productos.<id>" sin ambigüedad. */
const idSeguro = (id: string) => /^[A-Za-z0-9_-]+$/.test(id);

/**
 * Escribe el producto completo (o lo quita con `null`) en su parte del resumen.
 * Sin resumen, o con un id raro, no hace nada: la página lo corrige la
 * próxima vez que Staff/Encargado/Admin abren su Catálogo.
 */
export function escribirEnResumen(
  w: Pick<Transaction, 'set'> | Pick<WriteBatch, 'set'>,
  db: Firestore,
  partes: number | null,
  id: string,
  producto: Record<string, unknown> | null
) {
  if (!partes || !idSeguro(id)) return;
  const valor = producto ? productoLigero({ ...producto, id }) : deleteField();
  (w as Transaction).set(doc(db, COL_RESUMEN, parteResumen(id, partes)), { productos: { [id]: valor } }, { mergeFields: [`productos.${id}`] });
}
