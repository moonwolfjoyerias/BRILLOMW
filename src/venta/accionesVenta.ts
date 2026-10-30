// Lo que se hace sobre ventas ya cobradas y sobre los cambios físicos
// abiertos. Cada acción es UNA transacción con su registro en Actividad.
import { FirebaseError } from 'firebase/app';
import { collection, doc, getDoc, onSnapshot, query, runTransaction, where, type Firestore } from '../datos/firestore';
import { useEffect, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { COLECCION_TURNOS } from '../caja/turno';
import { COL_COMPRAS, idCompraVenta } from '../compras/modelo';
import { COL_CAMBIOS, COL_SALDO_MOVIMIENTOS, COL_SALDOS, piezasRegresables, sumarExistencias, type CambioFisico, type PiezaCambio } from './cambios';
import { COL_GARANTIAS, type Garantia } from './garantias';
import { COL_TICKETS_PERSONA, idIndicePersona, type ResumenTicket } from './historial';
import { COLECCION_REFERENCIAS, COLECCION_VENTAS, type VentaRegistrada } from './registrarVenta';
import type { ClienteVenta } from './carrito';

class ErrorAccion extends Error {}
const r2 = (n: number) => Math.round(n * 100) / 100;

async function ejecutar(db: Firestore, fn: Parameters<typeof runTransaction>[1]): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, fn);
    return null;
  } catch (e) {
    if (e instanceof ErrorAccion) return e.message;
    if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Tu cuenta no tiene permiso para esta acción.';
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return 'Sin conexión a internet. Para guardar se necesita conexión.';
    return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
  }
}

// ------------------------------------------------------------ cambios físicos abiertos

/** Cambios físicos que siguen abiertos (esperando que se cierre la venta), en vivo. */
export function useCambiosAbiertos(db: Firestore): CambioFisico[] | null {
  const [lista, setLista] = useState<CambioFisico[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, COL_CAMBIOS), where('estado', '==', 'abierto')),
        s => setLista(s.docs.map(d => ({ ...(d.data() as CambioFisico), id: d.id })).sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))),
        () => setLista([])
      ),
    [db]
  );
  return lista;
}

/** Saldo a favor guardado de una e/l (en vivo); null mientras carga. */
export function useSaldoAFavor(db: Firestore, personaId: string | null): number | null {
  const [saldo, setSaldo] = useState<number | null>(null);
  useEffect(() => {
    if (!personaId) {
      setSaldo(0);
      return;
    }
    setSaldo(null);
    return onSnapshot(doc(db, COL_SALDOS, personaId), s => setSaldo(Number(s.exists() ? s.data().saldo : 0) || 0), () => setSaldo(0));
  }, [db, personaId]);
  return saldo;
}

/** Crea o actualiza el cambio abierto de una e/l (solo mientras siga abierto). Devuelve su id. */
export async function guardarCambio(
  db: Firestore,
  d: { id: string | null; cliente: ClienteVenta; piezas: PiezaCambio[] },
  perfil: PerfilUsuario,
  equipo: string
): Promise<{ error: string | null; id: string }> {
  const ref = d.id ? doc(db, COL_CAMBIOS, d.id) : doc(collection(db, COL_CAMBIOS));
  const error = await ejecutar(db, async tx => {
    if (!d.cliente.personaId || d.cliente.tipo === 'publico') throw new ErrorAccion('El cambio físico es solo para emprendedoras y líderes.');
    if (!d.piezas.length) throw new ErrorAccion('Agrega al menos una pieza.');
    const ahora = new Date().toISOString();
    const actual = d.id ? await tx.get(ref) : null;
    if (actual && (!actual.exists() || actual.data().estado !== 'abierto')) throw new ErrorAccion('Ese cambio físico ya se cerró con una venta.');
    const base = actual?.exists() ? (actual.data() as CambioFisico) : null;
    const cambio: Omit<CambioFisico, 'id'> = {
      personaId: d.cliente.personaId,
      cliente: d.cliente,
      piezas: d.piezas,
      estado: 'abierto',
      creadoPor: base?.creadoPor ?? { uid: perfil.uid, nombre: perfil.nombre },
      creadoEn: base?.creadoEn ?? ahora,
      actualizadoEn: ahora
    };
    tx.set(ref, cambio);
    const valor = r2(d.piezas.reduce((s, p) => s + p.valor, 0));
    const reg = nuevoRegistroActividad(perfil, 'caja', base ? 'actualizar_cambio_fisico' : 'abrir_cambio_fisico', conOrigen(`Cambio físico de ${d.cliente.nombre}: ${d.piezas.length} pieza(s), $${valor.toFixed(2)} a favor`, equipo), equipo);
    tx.set(doc(db, 'auditoria', reg.id), reg);
  });
  return { error, id: ref.id };
}

/** Descarta un cambio abierto (por ejemplo, se registró por error). Las piezas no tocan el inventario. */
export function descartarCambio(db: Firestore, cambio: CambioFisico, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async tx => {
    const ref = doc(db, COL_CAMBIOS, cambio.id);
    const s = await tx.get(ref);
    if (!s.exists() || s.data().estado !== 'abierto') throw new ErrorAccion('Ese cambio físico ya se cerró con una venta.');
    tx.delete(ref);
    const reg = nuevoRegistroActividad(perfil, 'caja', 'descartar_cambio_fisico', conOrigen(`Cambio físico de ${cambio.cliente.nombre} descartado`, equipo), equipo);
    tx.set(doc(db, 'auditoria', reg.id), reg);
  });
}

// ------------------------------------------------------------ ventas cobradas

/** Lee una venta por folio (para el historial, reimprimir o cancelar). */
export async function leerVenta(db: Firestore, folio: string): Promise<VentaRegistrada | null> {
  const s = await getDoc(doc(db, COLECCION_VENTAS, folio.trim()));
  return s.exists() ? (s.data() as VentaRegistrada) : null;
}

/** "Regresar al inventario": las piezas del cambio físico vuelven a la venta. */
export function regresarAlInventario(db: Firestore, folio: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async tx => {
    const ref = doc(db, COLECCION_VENTAS, folio);
    const s = await tx.get(ref);
    if (!s.exists()) throw new ErrorAccion('Esa venta no existe.');
    const v = s.data() as VentaRegistrada;
    if (v.estado !== 'completada') throw new ErrorAccion('Esa venta está cancelada.');
    if (!v.cambioFisico) throw new ErrorAccion('Esa venta no tiene cambio físico.');
    if (v.cambioFisico.regresado) throw new ErrorAccion('Esas piezas ya se regresaron al inventario.');
    const piezas = piezasRegresables(v.cambioFisico.piezas);
    const actuales = new Map<string, Record<string, unknown>[] | undefined>();
    for (const id of new Set(piezas.map(p => p.productoId!))) {
      const p = await tx.get(doc(db, 'productos', id));
      actuales.set(id, p.exists() && Array.isArray(p.data().variantes) ? (p.data().variantes as Record<string, unknown>[]) : undefined);
    }
    const r = sumarExistencias(actuales, piezas, 1);
    if (!r.ok) throw new ErrorAccion(r.error);
    r.cambios.forEach((variantes, id) => tx.update(doc(db, 'productos', id), { variantes, disponible: variantes.some(x => (Number(x.stock) || 0) > 0) }));
    const ahora = new Date().toISOString();
    tx.update(ref, { cambioFisico: { ...v.cambioFisico, regresado: { por: perfil.nombre, en: ahora } } });
    const reg = nuevoRegistroActividad(perfil, 'catalogo', 'regresar_inventario_cambio', conOrigen(`${piezas.length} pieza(s) del cambio físico de ${v.cliente.nombre} (ticket ${folio}) regresaron al inventario`, equipo), equipo);
    tx.set(doc(db, 'auditoria', reg.id), reg);
  });
}

export const puedeCancelarVentas = (rol: PerfilUsuario['rol']) => rol === 'admin';

/**
 * Cancelar una venta cobrada por error. Solo Administración, el mismo día y
 * con la caja todavía abierta (después se corrige con un cambio). Deshace
 * todo lo que hizo la venta: existencias, compra para el Plan MW,
 * referencias de pago, saldo a favor, cambio físico (vuelve a quedar
 * abierto) y garantías. La venta no se borra: queda como cancelada.
 */
export function cancelarVenta(db: Firestore, folio: string, motivo: string, hoy: string, perfil: PerfilUsuario, equipo: string): Promise<string | null> {
  return ejecutar(db, async tx => {
    if (!puedeCancelarVentas(perfil.rol)) throw new ErrorAccion('Solo Administración cancela ventas.');
    if (!motivo.trim()) throw new ErrorAccion('Escribe el motivo de la cancelación.');
    const ref = doc(db, COLECCION_VENTAS, folio);
    const s = await tx.get(ref);
    if (!s.exists()) throw new ErrorAccion('Esa venta no existe.');
    const v = s.data() as VentaRegistrada;
    if (v.estado !== 'completada') throw new ErrorAccion('Esa venta ya estaba cancelada.');
    if (v.fechaDia !== hoy) throw new ErrorAccion('Solo se cancelan ventas del día. Para una venta anterior, haz un cambio físico.');
    const turno = await tx.get(doc(db, COLECCION_TURNOS, v.turnoId));
    if (!turno.exists() || turno.data().estado !== 'abierta') throw new ErrorAccion('La caja de esa venta ya se cerró; no se puede cancelar.');

    // Existencias: lo vendido regresa; si las piezas del cambio ya se habían
    // regresado al inventario, salen otra vez (el cambio vuelve a quedar abierto).
    const vendidas = v.lineas.filter(l => !l.esServicio && l.productoId && l.varianteId);
    const delCambio = v.cambioFisico?.regresado ? piezasRegresables(v.cambioFisico.piezas) : [];
    const actuales = new Map<string, Record<string, unknown>[] | undefined>();
    for (const id of new Set([...vendidas.map(l => l.productoId!), ...delCambio.map(p => p.productoId!)])) {
      const p = await tx.get(doc(db, 'productos', id));
      actuales.set(id, p.exists() && Array.isArray(p.data().variantes) ? (p.data().variantes as Record<string, unknown>[]) : undefined);
    }
    const personaId = v.cliente.tipo !== 'publico' ? v.cliente.personaId : null;
    const saldoRef = personaId ? doc(db, COL_SALDOS, personaId) : null;
    const saldoSnap = saldoRef && v.saldoAFavor ? await tx.get(saldoRef) : null;
    const folios = [...new Set(v.lineas.filter(l => l.garantia).map(l => l.garantia!.folio))];
    const garantias = new Map<string, Garantia | null>();
    for (const f of folios) {
      const g = await tx.get(doc(db, COL_GARANTIAS, f));
      garantias.set(f, g.exists() ? (g.data() as Garantia) : null);
    }
    const indiceRef = personaId ? doc(db, COL_TICKETS_PERSONA, idIndicePersona(personaId, v.fechaDia)) : null;
    const indiceSnap = indiceRef ? await tx.get(indiceRef) : null;

    // 1) Existencias.
    const devueltas = vendidas.flatMap(l => Array.from({ length: l.cantidad }, () => ({ productoId: l.productoId, varianteId: l.varianteId })));
    const r1 = sumarExistencias(actuales, devueltas, 1);
    if (!r1.ok) throw new ErrorAccion(r1.error);
    let cambios = r1.cambios;
    if (delCambio.length) {
      const r2x = sumarExistencias(new Map([...actuales, ...cambios]), delCambio, -1);
      if (!r2x.ok) throw new ErrorAccion('Las piezas del cambio físico ya se vendieron otra vez; no se puede cancelar esta venta.');
      cambios = new Map([...cambios, ...r2x.cambios]);
    }
    cambios.forEach((variantes, id) => tx.update(doc(db, 'productos', id), { variantes, disponible: variantes.some(x => (Number(x.stock) || 0) > 0) }));

    // 2) Saldo a favor: regresa lo usado y se quita lo que se le guardó.
    if (saldoRef && v.saldoAFavor) {
      const antes = Number(saldoSnap?.exists() ? saldoSnap.data().saldo : 0) || 0;
      const despues = r2(antes + v.saldoAFavor.usado - v.saldoAFavor.guardado);
      if (despues < 0) throw new ErrorAccion('Ya usó el saldo a favor que le dejó esta venta; no se puede cancelar.');
      tx.set(saldoRef, { saldo: despues, actualizadoEn: new Date().toISOString() }, { merge: true });
      tx.set(doc(db, COL_SALDO_MOVIMIENTOS, `${folio}__cancelacion`), { personaId, tipo: 'cancelacion', monto: r2(v.saldoAFavor.usado - v.saldoAFavor.guardado), folio, fecha: new Date().toISOString(), por: perfil.nombre });
    }

    // 3) Cambio físico: vuelve a quedar abierto para cerrarlo con otra venta.
    if (v.cambioFisico) tx.update(doc(db, COL_CAMBIOS, v.cambioFisico.id), { estado: 'abierto', folioVenta: null, actualizadoEn: new Date().toISOString() });

    // 4) Garantías: se quita el cambio que hizo esta venta.
    for (const f of folios) {
      const g = garantias.get(f);
      if (!g) continue;
      const resto = g.cambios.filter(c => c.folioVenta !== folio);
      if (!resto.length) tx.delete(doc(db, COL_GARANTIAS, f));
      else tx.set(doc(db, COL_GARANTIAS, f), { ...g, cambios: resto, estado: resto.length >= 2 ? 'terminada' : 'abierta' });
    }

    // 5) Deja de contar para el Plan MW y libera las referencias de pago.
    tx.delete(doc(db, COL_COMPRAS, idCompraVenta(folio)));
    v.pagos.filter(p => p.referencia).forEach(p => tx.delete(doc(db, COLECCION_REFERENCIAS, `${p.metodo}_${p.referencia}`)));

    // 6) Historial de la persona y la venta misma.
    if (indiceRef && indiceSnap?.exists()) {
      const tickets = (indiceSnap.data().tickets as ResumenTicket[]).map(t => (t.folio === folio ? { ...t, estado: 'cancelada' as const } : t));
      tx.update(indiceRef, { tickets });
    }
    const ahora = new Date().toISOString();
    tx.update(ref, { estado: 'cancelada', cancelada: { por: perfil.nombre, en: ahora, motivo: motivo.trim() } });
    const reg = nuevoRegistroActividad(perfil, 'caja', 'cancelar_venta', conOrigen(`Venta ${folio} de ${v.cliente.nombre} ($${v.totales.total.toFixed(2)}) cancelada — ${motivo.trim()}`, equipo), equipo);
    tx.set(doc(db, 'auditoria', reg.id), reg);
  });
}
