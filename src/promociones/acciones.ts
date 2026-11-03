// Promociones en Firestore: leer en vivo y guardar (Encargado y Administración).
import { puede } from '../sesion/permisos';
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, runTransaction, where, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { COL_PROMOCIONES, normalizarCupon, validarPromocion, type Promocion } from './modelo';

export const puedeEditarPromociones = (p: Pick<PerfilUsuario, 'rol' | 'permisosBrillo'>) => puede(p, 'editarPromociones');

/** solo activas = las que usa la caja; todas = la pantalla de Promociones. */
export function usePromociones(db: Firestore, soloActivas: boolean): Promocion[] | null {
  const [promos, setPromos] = useState<Promocion[] | null>(null);
  useEffect(() => {
    const ref = collection(db, COL_PROMOCIONES);
    return onSnapshot(
      soloActivas ? query(ref, where('activa', '==', true)) : ref,
      s => setPromos(s.docs.map(d => ({ ...(d.data() as Promocion), id: d.id, usos: Number(d.data().usos) || 0 }))),
      () => setPromos([])
    );
  }, [db, soloActivas]);
  return promos;
}

export async function guardarPromocion(
  db: Firestore,
  id: string | null,
  datos: Omit<Promocion, 'id' | 'usos'>,
  perfil: PerfilUsuario,
  equipo: string,
  ahora = new Date()
): Promise<string | null> {
  if (!puedeEditarPromociones(perfil)) return 'Solo Encargado y Administración pueden crear o cambiar promociones.';
  const err = validarPromocion(datos);
  if (err) return err;
  const cupon = datos.cupon ? normalizarCupon(datos.cupon) : '';
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, COL_PROMOCIONES, id ?? `promo-${ahora.getTime()}`);
      const actual = id ? await tx.get(ref) : null;
      const limpio: Record<string, unknown> = { ...datos, nombre: datos.nombre.trim() };
      if (cupon) limpio.cupon = cupon; else delete limpio.cupon;
      for (const k of ['limiteUsos', 'compraMinima']) if (limpio[k] == null || limpio[k] === '') limpio[k] = null;
      tx.set(ref, { ...limpio, usos: actual?.exists() ? Number(actual.data().usos) || 0 : 0, creadaPor: actual?.exists() ? actual.data().creadaPor ?? perfil.nombre : perfil.nombre, actualizada: ahora.toISOString() });
      const r = nuevoRegistroActividad(perfil, 'promociones', id ? 'editar_promocion' : 'crear_promocion', conOrigen(`${id ? 'Editó' : 'Creó'} la promoción "${datos.nombre.trim()}"${cupon ? ` (cupón ${cupon})` : ''} · ${datos.inicio} a ${datos.fin}${datos.activa ? '' : ' · pausada'}`, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
    });
    return null;
  } catch {
    return 'No se pudo guardar la promoción. Inténtalo de nuevo.';
  }
}
