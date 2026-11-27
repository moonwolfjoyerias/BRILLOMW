// Escribe la importación de Aronium en lotes: productos nuevos y
// actualizados, su movimiento de existencia, el resumen del catálogo de la
// página (una escritura por parte en cada lote) y un registro en Actividad.
import { collection, doc, getDocs, setDoc, writeBatch, type Firestore } from '../datos/firestore';
import { COL_RESUMEN, parteResumen, partesResumen, productoLigero } from '../pagina/resumenCatalogo';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { COL_MOVIMIENTOS_STOCK, idMovimiento, nuevoMovimiento } from '../stock/modelo';
import type { PerfilUsuario } from '../sesion/perfil';
import type { Producto } from '../pagina/producto';
import { cambiosProducto, productoNuevo, type FilaAronium } from './aronium';

/** Lo que se va a escribir, ya con las dudas de "parecidos" resueltas. */
export interface Decision {
  fila: FilaAronium;
  /** null = producto nuevo. */
  producto: Producto | null;
}

/** Productos por lote (cada uno = 1–2 escrituras, el límite es 500). */
const POR_LOTE = 200;
/** Una parte del resumen no debe pasar de ~1 MB (límite de Firestore). */
const MAX_BYTES_PARTE = 950000;

export interface Avance { hechos: number; total: number }

export async function aplicarImportacion(
  db: Firestore,
  decisiones: Decision[],
  perfil: PerfilUsuario,
  equipo: string,
  alAvanzar: (a: Avance) => void = () => {}
): Promise<{ ok: true; nuevos: number; actualizados: number } | { ok: false; error: string; hechos: number }> {
  const ahora = new Date();
  const fecha = ahora.toISOString();
  const origen = `BRILLO (${equipo}) · importación Aronium`;
  const partes = await partesResumen(db);

  // El resumen actual (pocas lecturas) para escribir cada producto completo.
  const resumen = new Map<string, Record<string, unknown>>();
  const bytesParte = new Map<string, number>();
  if (partes) {
    const s = await getDocs(collection(db, COL_RESUMEN));
    s.docs.forEach(d => {
      const productos = (d.data().productos ?? {}) as Record<string, Record<string, unknown>>;
      Object.entries(productos).forEach(([id, p]) => resumen.set(id, p));
      bytesParte.set(d.id, JSON.stringify(d.data()).length);
    });
  }

  // Ids nuevos con el formato de la página ('prod-' + milisegundos), sin repetirse.
  let reloj = ahora.getTime();
  const nuevoId = () => `prod-${reloj++}`;

  // Arma todas las escrituras antes de empezar, para revisar el tamaño del resumen.
  type Escritura = { id: string; nuevo: boolean; doc: Record<string, unknown>; resumen: Record<string, unknown>; mov: Record<string, unknown> | null };
  const escrituras: Escritura[] = decisiones.map(({ fila, producto }) => {
    if (!producto) {
      const id = nuevoId();
      const d = productoNuevo(id, `v-${reloj}-${Math.random().toString(36).slice(2, 6)}`, fila, fecha, perfil.nombre, origen);
      const v = (d.variantes as Record<string, unknown>[])[0];
      const mov = fila.cantidad > 0 && !d.servicio
        ? nuevoMovimiento({ productoId: id, varianteId: String(v.id), producto: fila.nombre, variante: '', codigo: fila.codigo, tipo: 'entrada', cantidad: fila.cantidad, antes: 0, despues: fila.cantidad, nota: 'Importación de Aronium', por: perfil.nombre, fecha }) as unknown as Record<string, unknown>
        : null;
      return { id, nuevo: true, doc: d, resumen: productoLigero(d), mov };
    }
    const actual = resumen.get(producto.id) ?? (producto as unknown as Record<string, unknown>);
    const cambio = cambiosProducto(actual, fila, fecha, perfil.nombre, origen);
    const antes = producto.variantes.length === 1 ? producto.variantes[0].stock : null;
    const mov = cambio.variantes && antes !== null && antes !== fila.cantidad
      ? nuevoMovimiento({ productoId: producto.id, varianteId: producto.variantes[0].id, producto: producto.nombre, variante: '', codigo: producto.codigo, tipo: 'ajuste', cantidad: fila.cantidad - antes, antes, despues: fila.cantidad, motivo: 'Conteo físico', nota: 'Importación de Aronium', por: perfil.nombre, fecha }) as unknown as Record<string, unknown>
      : null;
    return { id: producto.id, nuevo: false, doc: cambio, resumen: productoLigero({ ...actual, ...cambio, id: producto.id }), mov };
  });

  if (partes) {
    const crece = new Map(bytesParte);
    for (const e of escrituras) {
      const p = parteResumen(e.id, partes);
      const previo = resumen.get(e.id);
      crece.set(p, (crece.get(p) ?? 0) + JSON.stringify(e.resumen).length - (previo ? JSON.stringify(previo).length : 0));
    }
    const mayor = Math.max(0, ...crece.values());
    if (mayor > MAX_BYTES_PARTE) {
      return { ok: false, hechos: 0, error: `El resumen del catálogo quedaría demasiado grande (${Math.round(mayor / 1000)} KB en una parte). Pide a soporte que aumente las partes del resumen antes de importar.` };
    }
  }

  let hechos = 0;
  try {
    for (let i = 0; i < escrituras.length; i += POR_LOTE) {
      const grupo = escrituras.slice(i, i + POR_LOTE);
      const lote = writeBatch(db);
      const porParte = new Map<string, Record<string, unknown>>();
      grupo.forEach((e, j) => {
        const ref = doc(db, 'productos', e.id);
        if (e.nuevo) lote.set(ref, e.doc);
        else lote.update(ref, e.doc);
        if (e.mov) lote.set(doc(db, COL_MOVIMIENTOS_STOCK, idMovimiento(ahora, `${e.id}_${i + j}`)), e.mov);
        if (partes && /^[A-Za-z0-9_-]+$/.test(e.id)) {
          const p = parteResumen(e.id, partes);
          porParte.set(p, { ...(porParte.get(p) ?? {}), [e.id]: e.resumen });
        }
      });
      porParte.forEach((productos, p) => {
        lote.set(doc(db, COL_RESUMEN, p), { productos }, { mergeFields: Object.keys(productos).map(id => `productos.${id}`) });
      });
      await lote.commit();
      hechos += grupo.length;
      alAvanzar({ hechos, total: escrituras.length });
    }
  } catch {
    return { ok: false, hechos, error: `Se detuvo la importación después de ${hechos} de ${escrituras.length} productos (sin conexión o sin permiso). Vuelve a subir el mismo archivo: lo ya importado se reconoce y no se duplica.` };
  }

  const nuevos = escrituras.filter(e => e.nuevo).length;
  const actualizados = escrituras.length - nuevos;
  // Todo lo importado ya está en el resumen: la página no necesita volver a
  // leer estos productos uno por uno (solo lo cambiado DESPUÉS de esta hora).
  if (partes) await setDoc(doc(db, 'catalogoMeta', 'resumen'), { generadoEn: fecha }, { merge: true }).catch(() => {});
  const reg = nuevoRegistroActividad(perfil, 'stock', 'importar_aronium', conOrigen(`Importación de inventario de Aronium: ${nuevos} productos nuevos, ${actualizados} actualizados`, equipo), equipo, ahora);
  await setDoc(doc(db, 'auditoria', reg.id), reg).catch(() => {});
  return { ok: true, nuevos, actualizados };
}
