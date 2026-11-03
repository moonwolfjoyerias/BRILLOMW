// Guardar entradas y ajustes de existencia (una transacción cada uno: el
// producto, su movimiento y la Actividad) y leer el historial de una pieza.
import { puede } from '../sesion/permisos';
import { useEffect, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, runTransaction, setDoc, where, type Firestore, type Transaction } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { etiquetaVariante } from '../pagina/producto';
import {
  cambiarExistencia,
  COL_MOVIMIENTOS_STOCK,
  DOC_CONFIG_STOCK,
  idMovimiento,
  nuevoMovimiento,
  STOCK_MINIMO_POR_OMISION,
  type MovimientoStock,
  type TipoMovimiento
} from './modelo';

export const puedeMoverStock = (p: Pick<PerfilUsuario, 'rol' | 'permisosBrillo'>) => puede(p, 'moverStock');

type VarianteCruda = Record<string, unknown>;

/**
 * Deja en la transacción el movimiento de existencia de una variante (lo usan
 * ventas, cancelaciones, cambios físicos y apartados, además de Stock).
 */
export function anotarMovimiento(
  tx: Transaction,
  db: Firestore,
  datos: {
    productoId: string;
    varianteId: string;
    producto: Record<string, unknown> | null;
    tipo: TipoMovimiento;
    cantidad: number;
    antes?: number | null;
    despues?: number | null;
    referencia?: string;
    motivo?: string;
    nota?: string;
    proveedor?: string;
    por: string;
  },
  ahora: Date
) {
  const variantes = (Array.isArray(datos.producto?.variantes) ? datos.producto!.variantes : []) as VarianteCruda[];
  const v = variantes.find(x => x.id === datos.varianteId);
  const m = nuevoMovimiento({
    productoId: datos.productoId,
    varianteId: datos.varianteId,
    producto: String(datos.producto?.nombre ?? ''),
    variante: v ? etiquetaVariante({ color: String(v.color ?? ''), talla: String(v.talla ?? '') }) : '',
    codigo: String(datos.producto?.codigo ?? ''),
    tipo: datos.tipo,
    cantidad: datos.cantidad,
    antes: datos.antes ?? null,
    despues: datos.despues ?? null,
    motivo: datos.motivo,
    nota: datos.nota,
    proveedor: datos.proveedor,
    referencia: datos.referencia,
    por: datos.por,
    fecha: ahora.toISOString()
  });
  tx.set(doc(db, COL_MOVIMIENTOS_STOCK, idMovimiento(ahora, `${datos.productoId}_${datos.varianteId}`)), m);
}

export interface CambioStock {
  productoId: string;
  varianteId: string;
  /** entrada: suma lo que llegó; ajuste: suma/resta o fija el conteo. */
  tipo: 'entrada' | 'ajuste';
  cambio: { sumar: number } | { fijar: number };
  motivo?: string;
  nota?: string;
  proveedor?: string;
}

export async function moverStock(db: Firestore, c: CambioStock, perfil: PerfilUsuario, equipo: string, ahora = new Date()): Promise<string | null> {
  if (!puedeMoverStock(perfil)) return 'Solo Encargado y Administración pueden cambiar existencias.';
  if (c.tipo === 'entrada' && !('sumar' in c.cambio && Number.isInteger(c.cambio.sumar) && c.cambio.sumar > 0)) return 'Escribe cuántas piezas llegaron (número entero mayor a 0).';
  if (c.tipo === 'ajuste' && !c.motivo) return 'Elige el motivo del ajuste.';
  if (c.tipo === 'ajuste' && c.motivo === 'Otro' && !c.nota?.trim()) return 'Escribe el motivo del ajuste.';
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, 'productos', c.productoId);
      const s = await tx.get(ref);
      if (!s.exists()) throw new Error('Ese producto ya no existe.');
      const datos = s.data();
      const r = cambiarExistencia(Array.isArray(datos.variantes) ? datos.variantes : [], c.varianteId, c.cambio);
      if ('error' in r) throw new Error(r.error);
      if (r.antes === r.despues) throw new Error('La existencia no cambia.');
      const fecha = ahora.toISOString();
      tx.update(ref, {
        variantes: r.variantes,
        disponible: r.variantes.some(x => (Number(x.stock) || 0) > 0),
        // Con ultimaAccion la página ve el cambio en su resumen del catálogo.
        ultimaAccion: { tipo: 'Existencia modificada', empleado: perfil.nombre, fecha, origen: `BRILLO (${equipo})` }
      });
      anotarMovimiento(tx, db, { productoId: c.productoId, varianteId: c.varianteId, producto: datos, tipo: c.tipo, cantidad: r.despues - r.antes, antes: r.antes, despues: r.despues, motivo: c.motivo, nota: c.nota?.trim(), proveedor: c.proveedor?.trim(), por: perfil.nombre }, ahora);
      const v = (datos.variantes as VarianteCruda[]).find(x => x.id === c.varianteId)!;
      const nombre = `${String(datos.nombre)} (${etiquetaVariante({ color: String(v.color ?? ''), talla: String(v.talla ?? '') })})`;
      const desc = c.tipo === 'entrada'
        ? `Entrada de ${r.despues - r.antes} pza de ${nombre}${c.proveedor ? ` · ${c.proveedor.trim()}` : ''}: ${r.antes} → ${r.despues}`
        : `Ajuste de existencia de ${nombre} (${c.motivo}${c.nota ? `: ${c.nota.trim()}` : ''}): ${r.antes} → ${r.despues}`;
      const reg = nuevoRegistroActividad(perfil, 'stock', c.tipo === 'entrada' ? 'entrada_stock' : 'ajuste_stock', conOrigen(desc, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', reg.id), reg);
    });
    return null;
  } catch (e) {
    const msg = (e as Error)?.message;
    if (msg && !/permission|network|unavailable/i.test(msg)) return msg;
    return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
  }
}

export async function leerHistorial(db: Firestore, productoId: string): Promise<(MovimientoStock & { id: string })[]> {
  const s = await getDocs(query(collection(db, COL_MOVIMIENTOS_STOCK), where('productoId', '==', productoId)));
  return s.docs.map(d => ({ id: d.id, ...(d.data() as MovimientoStock) })).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function useStockMinimo(db: Firestore): number {
  const [minimo, setMinimo] = useState(STOCK_MINIMO_POR_OMISION);
  useEffect(
    () => onSnapshot(doc(db, ...DOC_CONFIG_STOCK), s => setMinimo(s.exists() && Number.isFinite(Number(s.data().minimo)) ? Number(s.data().minimo) : STOCK_MINIMO_POR_OMISION), () => {}),
    [db]
  );
  return minimo;
}

export async function guardarStockMinimo(db: Firestore, minimo: number): Promise<string | null> {
  if (!Number.isInteger(minimo) || minimo < 0) return 'El mínimo debe ser un número entero, 0 o más.';
  try {
    await setDoc(doc(db, ...DOC_CONFIG_STOCK), { minimo }, { merge: true });
    return null;
  } catch {
    return 'No se pudo guardar el mínimo.';
  }
}
