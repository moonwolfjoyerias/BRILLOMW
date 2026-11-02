// Lee en vivo los tipos de pago configurados y los guarda (Administración).
import { useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { alCambiarTiposPago, combinarTipos, DOC_TIPOS_PAGO, fijarTiposPago, tiposPago, validarTipos, type TipoPago } from './tipos';

/** Mantiene al día los tipos de pago de toda la app; regresa los vigentes. */
export function useTiposPago(db: Firestore): TipoPago[] {
  const [tipos, setTipos] = useState(tiposPago());
  useEffect(() => alCambiarTiposPago(() => setTipos(tiposPago())), []);
  useEffect(
    () => onSnapshot(doc(db, ...DOC_TIPOS_PAGO), s => fijarTiposPago(combinarTipos(s.exists() ? s.data().tipos : null)), () => {}),
    [db]
  );
  return tipos;
}

export async function guardarTiposPago(db: Firestore, tipos: TipoPago[], antes: TipoPago[], perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  if (perfil.rol !== 'admin') return 'Solo Administración puede cambiar los tipos de pago.';
  const err = validarTipos(tipos);
  if (err) return err;
  const cambios = describirCambiosTipos(antes, tipos);
  if (!cambios.length) return null;
  try {
    await runTransaction(db, async tx => {
      const ahora = new Date();
      tx.set(doc(db, ...DOC_TIPOS_PAGO), { tipos: tipos.map(({ id, nombre, activo, pideReferencia, cuentaRecompensas }) => ({ id, nombre: nombre.trim(), activo, pideReferencia, cuentaRecompensas })), actualizado: ahora.toISOString(), por: perfil.nombre });
      const r = nuevoRegistroActividad(perfil, 'configuracion', 'tipos_pago', conOrigen(`Tipos de pago: ${cambios.join('; ')}`, equipo), equipo, ahora);
      tx.set(doc(db, 'auditoria', r.id), r);
    });
    return null;
  } catch {
    return 'No se pudo guardar. Inténtalo de nuevo.';
  }
}

export function describirCambiosTipos(antes: TipoPago[], despues: TipoPago[]): string[] {
  const c: string[] = [];
  for (const t of despues) {
    const a = antes.find(x => x.id === t.id);
    if (!a) { c.push(`nuevo "${t.nombre}"`); continue; }
    if (a.nombre !== t.nombre) c.push(`"${a.nombre}" ahora se llama "${t.nombre}"`);
    if (a.activo !== t.activo) c.push(`${t.nombre} ${t.activo ? 'activado' : 'desactivado'}`);
    if (a.pideReferencia !== t.pideReferencia) c.push(`${t.nombre} ${t.pideReferencia ? 'pide' : 'ya no pide'} referencia`);
    if (a.cuentaRecompensas !== t.cuentaRecompensas) c.push(`${t.nombre} ${t.cuentaRecompensas ? 'cuenta' : 'ya no cuenta'} para recompensas y comisiones`);
  }
  for (const a of antes) if (!despues.some(t => t.id === a.id)) c.push(`se quitó "${a.nombre}"`);
  return c;
}
