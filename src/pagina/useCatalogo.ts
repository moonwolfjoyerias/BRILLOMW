import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from '../datos/firestore';
import { db } from '../firebase';
import { marcaAlta, normalizarProducto, type Producto } from './producto';
import { COL_RESUMEN } from './resumenCatalogo';

export type EstadoCatalogo =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; productos: Producto[]; desdeCache: boolean };

// ---------------------------------------------------------------------------
// Catálogo en tiempo real desde el RESUMEN de la página (catalogoResumen/p0…):
// ~12 lecturas al abrir BRILLO en vez de una por producto. BRILLO y la página
// escriben ahí cada cambio, así que llega en vivo. Además se escucha lo que
// tenga `ultimaAccion.fecha` posterior al resumen (por si algo no lo
// actualizó) — eso suele ser casi nada. Sin resumen todavía, se lee
// `productos` completo como antes.
//
// Una sola suscripción para todas las pantallas que usan el catálogo.
// ---------------------------------------------------------------------------

type Datos = Record<string, unknown>;
let estadoActual: EstadoCatalogo = { estado: 'cargando' };
const oyentes = new Set<(e: EstadoCatalogo) => void>();
let cancelar: Unsubscribe[] = [];
let apagarTemporizador: ReturnType<typeof setTimeout> | null = null;

function publicar(e: EstadoCatalogo) {
  estadoActual = e;
  oyentes.forEach(f => f(e));
}

const ordenar = (ps: Producto[]) =>
  ps.sort((a, b) => marcaAlta(b) - marcaAlta(a) || a.nombre.localeCompare(b.nombre, 'es')); // lo más nuevo arriba, como la página

const error = () => publicar({ estado: 'error', mensaje: 'No se pudo cargar el catálogo. Revisa la conexión.' });

/** Junta las partes del resumen y lo reciente; lo reciente gana. Exportada para pruebas. */
export function combinarCatalogo(partes: Map<string, Datos>, recientes: Map<string, Datos>): Producto[] {
  const porId = new Map<string, Datos>();
  partes.forEach(productos => Object.entries(productos).forEach(([id, p]) => { if (p && typeof p === 'object') porId.set(id, p as Datos); }));
  recientes.forEach((p, id) => porId.set(id, p));
  return ordenar([...porId].map(([id, p]) => normalizarProducto(id, p)));
}

function leerCompleto() {
  cancelar.push(
    onSnapshot(
      collection(db, 'productos'),
      { includeMetadataChanges: true },
      snap => publicar({ estado: 'listo', productos: ordenar(snap.docs.map(d => normalizarProducto(d.id, d.data()))), desdeCache: snap.metadata.fromCache }),
      error
    )
  );
}

function leerDesdeResumen(numPartes: number, generadoEn: string) {
  const partes = new Map<string, Datos>();
  const recientes = new Map<string, Datos>();
  const listas = new Set<string>();
  const enCache = new Set<string>();
  const total = numPartes + 1; // partes + consulta de lo reciente
  const pintar = () => {
    if (listas.size >= total) publicar({ estado: 'listo', productos: combinarCatalogo(partes, recientes), desdeCache: enCache.size > 0 });
  };
  for (let i = 0; i < numPartes; i++) {
    const id = 'p' + i;
    cancelar.push(
      onSnapshot(
        doc(db, COL_RESUMEN, id),
        { includeMetadataChanges: true },
        s => {
          partes.set(id, s.exists() ? ((s.data().productos as Datos) ?? {}) : {});
          if (s.metadata.fromCache) enCache.add(id); else enCache.delete(id);
          listas.add(id);
          pintar();
        },
        error
      )
    );
  }
  cancelar.push(
    onSnapshot(
      query(collection(db, 'productos'), where('ultimaAccion.fecha', '>', generadoEn)),
      snap => {
        recientes.clear();
        snap.docs.forEach(d => recientes.set(d.id, d.data()));
        listas.add('recientes');
        pintar();
      },
      () => { listas.add('recientes'); pintar(); } // sin esa consulta, el resumen tal cual
    )
  );
}

function encender() {
  let claveActual = '';
  const cambiarDatos = (clave: string, partes: number, generadoEn: string) => {
    if (clave === claveActual) return;
    claveActual = clave;
    // Se reemplazan las suscripciones de datos (la del meta es la primera).
    cancelar.splice(1).forEach(f => f());
    if (clave === 'completo') leerCompleto();
    else leerDesdeResumen(partes, generadoEn);
  };
  cancelar.push(
    onSnapshot(
      doc(db, 'catalogoMeta', 'resumen'),
      s => {
        const d = s.exists() ? s.data() : null;
        const partes = Number(d?.partes);
        const generadoEn = String(d?.generadoEn ?? '');
        const hay = Number.isInteger(partes) && partes > 0;
        cambiarDatos(hay ? `${partes}|${generadoEn}` : 'completo', partes, generadoEn);
      },
      () => cambiarDatos('completo', 0, '')
    )
  );
}

function apagar() {
  cancelar.forEach(f => f());
  cancelar = [];
  estadoActual = { estado: 'cargando' };
}

/** Catálogo en tiempo real (mismos productos que la página). */
export function useCatalogo(): EstadoCatalogo {
  const [estado, setEstado] = useState<EstadoCatalogo>(estadoActual);
  useEffect(() => {
    if (apagarTemporizador) { clearTimeout(apagarTemporizador); apagarTemporizador = null; }
    if (!cancelar.length) encender();
    oyentes.add(setEstado);
    setEstado(estadoActual);
    return () => {
      oyentes.delete(setEstado);
      // Al cambiar de pantalla se queda encendido un momento para no volver a leer.
      if (!oyentes.size) apagarTemporizador = setTimeout(apagar, 60_000);
    };
  }, []);
  return estado;
}
