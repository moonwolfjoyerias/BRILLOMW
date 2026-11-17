// Fotos que la página guarda APARTE del producto (para no gastar cuota):
//   productosFotos/{id}      → { galeria: [{ id, src }] } (tamaño completo)
//   productosMiniaturas/{id} → { src }                    (foto principal chica)
// y el producto solo trae `fotosIds`. Mismo criterio que
// js/catalogo-variantes-modelo.js de la página: si el producto trae fotos
// dentro, se usan esas; si no, se descargan una sola vez y quedan en memoria.
import { useEffect, useState } from 'react';
import { doc, getDoc } from '../datos/firestore';
import { db } from '../firebase';
import type { FotoProducto, Producto } from './producto';

const galerias = new Map<string, Promise<FotoProducto[]>>();
const miniaturas = new Map<string, Promise<string>>();

type ConFotos = Pick<Producto, 'id' | 'galeria'> & { fotosIds?: string[] };

const embebidas = (p: ConFotos) => p.galeria.filter(f => f.src);
/** El producto dice que no tiene fotos (fotosIds vacío): no hay nada que descargar. */
const sinFotos = (p: ConFotos) => Array.isArray(p.fotosIds) && !p.fotosIds.length;

export function cargarGaleria(p: ConFotos): Promise<FotoProducto[]> {
  if (embebidas(p).length) return Promise.resolve(embebidas(p));
  if (sinFotos(p)) return Promise.resolve([]);
  let pendiente = galerias.get(p.id);
  if (!pendiente) {
    pendiente = getDoc(doc(db, 'productosFotos', p.id))
      .then(s => {
        const g = s.exists() ? s.data().galeria : null;
        return Array.isArray(g)
          ? g.filter(f => f && typeof f.src === 'string' && f.src).map((f, i) => ({ id: String(f.id ?? `foto-${i}`), src: String(f.src) }))
          : [];
      })
      .catch(() => {
        galerias.delete(p.id); // se puede reintentar después
        return [];
      });
    galerias.set(p.id, pendiente);
  }
  return pendiente;
}

export function cargarMiniatura(p: ConFotos): Promise<string> {
  const propia = embebidas(p)[0]?.src;
  if (propia) return Promise.resolve(propia);
  if (sinFotos(p)) return Promise.resolve('');
  let pendiente = miniaturas.get(p.id);
  if (!pendiente) {
    pendiente = getDoc(doc(db, 'productosMiniaturas', p.id))
      .then(async s => (s.exists() && s.data().src ? String(s.data().src) : (await cargarGaleria(p))[0]?.src ?? ''))
      .catch(() => {
        miniaturas.delete(p.id);
        return '';
      });
    miniaturas.set(p.id, pendiente);
  }
  return pendiente;
}

/** Foto principal chica (listas y tarjetas). '' mientras carga o si no tiene. */
export function useMiniatura(p: ConFotos | null | undefined): string {
  const directa = p ? embebidas(p)[0]?.src ?? '' : '';
  const [src, setSrc] = useState(directa);
  useEffect(() => {
    if (!p) return setSrc('');
    if (directa) return setSrc(directa);
    let vigente = true;
    void cargarMiniatura(p).then(s => vigente && setSrc(s));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, directa, p?.fotosIds?.join(',')]);
  return src;
}

/** Galería completa (detalle y edición). null mientras carga. */
export function useGaleria(p: ConFotos | null | undefined): FotoProducto[] | null {
  const directa = p ? embebidas(p) : [];
  const [g, setG] = useState<FotoProducto[] | null>(directa.length ? directa : null);
  useEffect(() => {
    if (!p) return setG([]);
    if (directa.length) return setG(directa);
    let vigente = true;
    setG(null);
    void cargarGaleria(p).then(x => vigente && setG(x));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, directa.map(f => f.id).join(','), p?.fotosIds?.join(',')]);
  return g;
}

/** Después de guardar desde BRILLO (fotos dentro del producto) se olvida lo descargado. */
export function olvidarFotos(id: string) {
  galerias.delete(id);
  miniaturas.delete(id);
}
