import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizarProducto, type Producto } from './producto';

export type EstadoCatalogo =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; productos: Producto[]; desdeCache: boolean };

/**
 * Catálogo en tiempo real desde `productos` (la misma colección que usa la
 * página). Solo lectura: BRILLO no escribe en esta colección en la fase 0.
 */
export function useCatalogo(): EstadoCatalogo {
  const [estado, setEstado] = useState<EstadoCatalogo>({ estado: 'cargando' });
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'productos'),
        { includeMetadataChanges: true },
        snap => {
          const productos = snap.docs
            .map(d => normalizarProducto(d.id, d.data()))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
          setEstado({ estado: 'listo', productos, desdeCache: snap.metadata.fromCache });
        },
        () => setEstado({ estado: 'error', mensaje: 'No se pudo cargar el catálogo. Revisa la conexión.' })
      ),
    []
  );
  return estado;
}
