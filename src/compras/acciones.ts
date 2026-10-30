// Lee y guarda `comprasBrillo`. Confirmar o rechazar es de Encargado y
// Administración (Staff solo ve la lista). Cada acción va en UNA
// transacción con su registro en Actividad.
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, runTransaction, type Firestore } from '../datos/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso } from '../pagina/avisos';
import { COL_COMPRAS, ComprasBrillo, docPieza, idCompraPieza, type DocCompra, type PiezaARevisar } from './modelo';

export const puedeConfirmarCompras = (rol: PerfilUsuario['rol']) => rol === 'encargado' || rol === 'admin';

export function useComprasBrillo(db: Firestore): ComprasBrillo | null | 'error' {
  const [estado, setEstado] = useState<ComprasBrillo | null | 'error'>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, COL_COMPRAS),
        s => setEstado(new ComprasBrillo(new Map(s.docs.map(d => [d.id, d.data() as DocCompra])))),
        () => setEstado('error')
      ),
    [db]
  );
  return estado;
}

class ErrorCompra extends Error {}

async function ejecutar(db: Firestore, fn: Parameters<typeof runTransaction>[1]): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, fn);
    return null;
  } catch (e) {
    if (e instanceof ErrorCompra) return e.message;
    if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Confirmar compras es de Encargado y Administración.';
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return 'Sin conexión a internet. Para guardar se necesita conexión.';
    return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
  }
}

const dinero = (n: number) => `$${n.toFixed(2)}`;
/** Una transacción guarda hasta 500 documentos; se deja margen para Actividad. */
export const MAXIMO_POR_LOTE = 200;

/** Confirma piezas pendientes (o rechazadas): desde ya cuentan como compra. */
export function confirmarCompras(db: Firestore, piezas: PiezaARevisar[], perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async tx => {
    if (!piezas.length) throw new ErrorCompra('Elige al menos una compra.');
    if (piezas.length > MAXIMO_POR_LOTE) throw new ErrorCompra(`Confirma de ${MAXIMO_POR_LOTE} en ${MAXIMO_POR_LOTE} como máximo.`);
    const ahora = new Date();
    const refs = piezas.map(p => doc(db, COL_COMPRAS, idCompraPieza(p.ventana.id, p.pieza.id)));
    const actuales: { exists(): boolean; data(): Record<string, unknown> | undefined }[] = [];
    for (const r of refs) actuales.push(await tx.get(r));
    // Si alguien ya la confirmó mientras tanto, no se toca (su fecha se queda).
    const nuevas = piezas.filter((_, i) => !(actuales[i].exists() && actuales[i].data()?.estado === 'confirmada'));
    if (!nuevas.length) throw new ErrorCompra('Esas compras ya estaban confirmadas.');
    const quien = { nombre: perfil.nombre, rol: perfil.rol };
    nuevas.forEach(p => tx.set(doc(db, COL_COMPRAS, idCompraPieza(p.ventana.id, p.pieza.id)), docPieza(p, 'confirmada', 'pagina', quien, ahora)));
    const total = nuevas.reduce((s, p) => s + (Number(p.pieza.total) || 0), 0);
    const texto = nuevas.length === 1
      ? `Compra confirmada: ${nuevas[0].pieza.producto} de ${nuevas[0].ventana.usuarioNombre} (${dinero(total)})`
      : `${nuevas.length} compras confirmadas (${dinero(total)}) de ${[...new Set(nuevas.map(p => p.ventana.usuarioNombre))].join(', ')}`;
    const r = nuevoRegistroActividad(perfil, 'apartados', 'confirmar_compra', conOrigen(texto, equipo), equipo, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
  });
}

/** No la confirma: no cuenta (queda en la lista de rechazadas, se puede confirmar después). */
export function rechazarCompra(db: Firestore, p: PiezaARevisar, motivo: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async tx => {
    if (!motivo.trim()) throw new ErrorCompra('Escribe por qué no se confirma.');
    const ahora = new Date();
    const ref = doc(db, COL_COMPRAS, idCompraPieza(p.ventana.id, p.pieza.id));
    const actual = await tx.get(ref);
    if (actual.exists() && actual.data().estado === 'confirmada') throw new ErrorCompra('Esa compra ya está confirmada. Para quitarla, primero regrésala a pendiente.');
    tx.set(ref, docPieza(p, 'rechazada', 'pagina', { nombre: perfil.nombre, rol: perfil.rol }, ahora, motivo.trim()));
    // Que sepa por qué esa compra no le cuenta.
    const aviso = nuevoAviso({ texto: `Tu compra de "${p.pieza.producto}" no se confirmó en la tienda, así que todavía no cuenta para tu Plan MW. Motivo: ${motivo.trim().replace(/[.\s]+$/, '')}.`, link: 'compras', paraId: p.ventana.usuarioId, rolDestino: 'emprendedora_lider', origen: 'admin' }, ahora);
    tx.set(doc(db, 'notificaciones', aviso.id), aviso);
    const r = nuevoRegistroActividad(perfil, 'apartados', 'rechazar_compra', conOrigen(`Compra NO confirmada: ${p.pieza.producto} de ${p.ventana.usuarioNombre} (${dinero(Number(p.pieza.total) || 0)}) — ${motivo.trim()}`, equipo), equipo, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
  });
}

/** Regresa una compra confirmada o rechazada a pendiente (deja de contar). */
export function regresarAPendiente(db: Firestore, p: PiezaARevisar, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async tx => {
    const ahora = new Date();
    const ref = doc(db, COL_COMPRAS, idCompraPieza(p.ventana.id, p.pieza.id));
    const actual = await tx.get(ref);
    if (!actual.exists()) throw new ErrorCompra('Esa compra ya estaba pendiente.');
    tx.delete(ref);
    const r = nuevoRegistroActividad(perfil, 'apartados', 'compra_a_pendiente', conOrigen(`Compra regresada a pendiente de confirmar: ${p.pieza.producto} de ${p.ventana.usuarioNombre} (${dinero(Number(p.pieza.total) || 0)})`, equipo), equipo, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
  });
}
