// Lee y guarda Comisiones en las mismas colecciones que la página (solo
// Administración). Cada acción va en UNA transacción con su registro en
// Actividad (módulo comisiones) y, si aplica, el aviso a la líder.
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, runTransaction, type Firestore } from '../datos/firestore';
import { useEffect, useMemo, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso } from '../pagina/avisos';
import type { Aronium, SubPeriodo } from '../planmw/modelo';
import { mesLabel } from '../planmw/modelo';
import { COL_SALDO_MOVIMIENTOS, COL_SALDOS } from '../venta/cambios';
import { claveAjuste, clavePago, claveRangoManual, type Ajuste, type Bono, type DatosComisiones, type Pago, type VersionConfig } from './modelo';

export const COL = {
  ajustes: 'comisionesAjustes',
  historial: 'comisionesHistorialAjustes',
  pagos: 'comisionesPagos',
  bonos: 'comisionesBonos',
  rangoManual: 'comisionesRangoManual',
  /** Cómo quiere recibir sus comisiones la líder ('pago' | 'saldo'); lo elige en la página. */
  destino: 'comisionesDestino'
} as const;

export type DestinoComision = 'pago' | 'saldo';

/** Lo que pidió la líder en la página (null = no ha elegido: se le paga; undefined = cargando). */
export function useDestinoComision(db: Firestore, personaId: string): { destino: DestinoComision; en: string | null } | null | undefined {
  const [v, setV] = useState<{ destino: DestinoComision; en: string | null } | null | undefined>(undefined);
  useEffect(() => {
    if (!personaId) return;
    return onSnapshot(
      doc(db, COL.destino, personaId),
      s => setV(s.exists() ? { destino: s.data().destino === 'saldo' ? 'saldo' : 'pago', en: (s.data().actualizadoEn as string) ?? null } : null),
      () => setV(null)
    );
  }, [db, personaId]);
  return v;
}

export type EstadoComisiones = { estado: 'cargando' } | { estado: 'error' } | ({ estado: 'listo' } & DatosComisiones);

export function useComisiones(db: Firestore): EstadoComisiones {
  const [estado, setEstado] = useState<EstadoComisiones>({ estado: 'cargando' });
  useEffect(() => {
    const d: Partial<DatosComisiones> = {};
    let fallo = false;
    const necesarias: (keyof DatosComisiones)[] = ['ajustes', 'historial', 'pagos', 'bonos', 'rangoManual', 'config'];
    const listo = () => !fallo && necesarias.every(k => k in d) && setEstado({ estado: 'listo', ...(d as DatosComisiones) });
    const mapa = <T,>(col: string, clave: keyof DatosComisiones, valor: (x: Record<string, unknown>) => T) =>
      onSnapshot(
        collection(db, col),
        s => {
          const m: Record<string, T> = {};
          s.docs.forEach(x => { m[x.id] = valor(x.data()); });
          (d as Record<string, unknown>)[clave] = m;
          listo();
        },
        () => { fallo = true; setEstado({ estado: 'error' }); }
      );
    const cortes = [
      mapa(COL.ajustes, 'ajustes', x => x as unknown as Ajuste),
      mapa(COL.pagos, 'pagos', x => x as unknown as Pago),
      mapa(COL.bonos, 'bonos', x => x as unknown as Bono),
      mapa(COL.rangoManual, 'rangoManual', x => String(x.rangoKey ?? '')),
      onSnapshot(
        collection(db, COL.historial),
        s => { d.historial = s.docs.map(x => ({ ...(x.data() as Ajuste), id: x.id })); listo(); },
        () => { fallo = true; setEstado({ estado: 'error' }); }
      ),
      // Configuración de Admin: si no se puede leer, se calcula con los valores de siempre.
      onSnapshot(
        collection(db, 'configuracionVersiones'),
        s => { d.config = s.docs.map(x => x.data() as VersionConfig); listo(); },
        () => { d.config = []; listo(); }
      )
    ];
    return () => cortes.forEach(c => c());
  }, [db]);
  return estado;
}

/** Compras importadas de Aronium por quincena (la fuente oficial en las quincenas que la tienen). */
export function useAronium(db: Firestore): Aronium | null {
  const [importadas, setImportadas] = useState<Set<string> | null>(null);
  const [montos, setMontos] = useState<Record<string, Record<string, number>> | null>(null);
  useEffect(() => {
    const a = onSnapshot(
      doc(db, 'comprasAroniumMeta', 'estado'),
      s => setImportadas(new Set(s.exists() && Array.isArray(s.data().quincenas) ? (s.data().quincenas as string[]) : [])),
      () => setImportadas(new Set())
    );
    const b = onSnapshot(
      collection(db, 'comprasAronium'),
      s => {
        const m: Record<string, Record<string, number>> = {};
        s.docs.forEach(x => { m[x.id] = (x.data().montos as Record<string, number>) ?? {}; });
        setMontos(m);
      },
      () => setMontos({})
    );
    return () => { a(); b(); };
  }, [db]);
  return useMemo(() => (importadas && montos ? { importadas, montos } : null), [importadas, montos]);
}

class ErrorComision extends Error {}

async function ejecutar(db: Firestore, fn: Parameters<typeof runTransaction>[1]): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Sin conexión a internet. Para guardar se necesita conexión.';
  try {
    await runTransaction(db, fn);
    return null;
  } catch (e) {
    if (e instanceof ErrorComision) return e.message;
    if (e instanceof FirebaseError && e.code === 'permission-denied') return 'Firebase rechazó el guardado. Comisiones es solo de Administración.';
    if (e instanceof FirebaseError && (e.code === 'unavailable' || e.code === 'failed-precondition')) return 'Sin conexión a internet. Para guardar se necesita conexión.';
    return 'No se pudo guardar. No se cambió nada; inténtalo de nuevo.';
  }
}

const actividad = (perfil: PerfilUsuario, equipo: string, accion: string, texto: string, ahora: Date) =>
  nuevoRegistroActividad(perfil, 'comisiones', accion, conOrigen(texto, equipo), equipo, ahora);

/** Ajuste manual de una comisión (queda el valor vigente y su historial). */
export function guardarAjuste(db: Firestore, ajuste: Ajuste, sub: SubPeriodo, periodoKey: string, perfil: PerfilUsuario, equipo: string) {
  return ejecutar(db, async tx => {
    const ahora = new Date();
    const clave = claveAjuste(ajuste.liderId, ajuste.emprendedoraId, periodoKey, sub);
    const ref = doc(db, COL.ajustes, clave);
    const actual = await tx.get(ref);
    // El "valor anterior" sale del servidor, por si alguien lo cambió mientras tanto.
    const registro: Ajuste = { ...ajuste, valorAnterior: actual.exists() ? Number(actual.data().valorNuevo) : ajuste.valorCalculado };
    tx.set(ref, registro);
    const id = `AJU-${ahora.getTime()}-${Math.round(Math.random() * 1e6)}`;
    tx.set(doc(db, COL.historial, id), { ...registro, tipo: 'ajusteComision', id });
    const r = actividad(perfil, equipo, 'ajuste_manual', `Ajuste de comisión (${registro.periodo}): $${registro.valorAnterior.toFixed(2)} → $${registro.valorNuevo.toFixed(2)}${registro.motivo ? ` — ${registro.motivo}` : ''}`, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
  });
}

export function restaurarCalculo(db: Firestore, liderId: string, personaId: string, periodoKey: string, sub: SubPeriodo, perfil: PerfilUsuario, equipo: string) {
  return ejecutar(db, async tx => {
    const ahora = new Date();
    const ref = doc(db, COL.ajustes, claveAjuste(liderId, personaId, periodoKey, sub));
    const actual = await tx.get(ref);
    if (!actual.exists()) return;
    tx.delete(ref);
    const r = actividad(perfil, equipo, 'restaurar_calculo', `Se restauró el cálculo automático de comisión (${periodoKey}-${sub}), antes ajustada a $${Number(actual.data().valorNuevo).toFixed(2)}`, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
  });
}

/**
 * Registrar el pago de una quincena (el pago en dinero se hace por fuera) y
 * avisarle a la líder. Una parte (o todo) puede guardarse como saldo a favor
 * para su próxima compra: se suma a brilloSaldos en la misma transacción.
 */
export function registrarPago(
  db: Firestore,
  liderId: string,
  periodoKey: string,
  sub: SubPeriodo,
  enDinero: number,
  perfil: PerfilUsuario,
  equipo: string,
  aSaldo = 0,
  nombre = ''
) {
  return ejecutar(db, async tx => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    if (enDinero < 0 || aSaldo < 0) throw new ErrorComision('Los montos no pueden ser negativos.');
    const dinero = Number.isFinite(enDinero) && enDinero > 0 ? r2(enDinero) : 0;
    const saldo = Number.isFinite(aSaldo) && aSaldo > 0 ? r2(aSaldo) : 0;
    const monto = r2(dinero + saldo);
    if (!(monto > 0)) throw new ErrorComision('Escribe el monto pagado.');
    const ahora = new Date();
    const fecha = ahora.toISOString();
    const ref = doc(db, COL.pagos, clavePago(liderId, periodoKey, sub));
    const actual = await tx.get(ref);
    if (actual.exists() && actual.data().estado === 'pagada') throw new ErrorComision('Ese periodo ya estaba registrado como pagado.');
    const saldoRef = saldo > 0 ? doc(db, COL_SALDOS, liderId) : null;
    const saldoSnap = saldoRef ? await tx.get(saldoRef) : null;
    const periodo = `${periodoKey}-${sub}`;
    tx.set(ref, { estado: 'pagada', fechaPago: fecha, registradoPor: perfil.nombre, montoPagado: monto, montoDinero: dinero, montoSaldo: saldo, periodo });
    if (saldoRef) {
      const antes = Number(saldoSnap?.exists() ? saldoSnap.data().saldo : 0) || 0;
      tx.set(saldoRef, { personaId: liderId, ...(nombre ? { personaNombre: nombre } : {}), saldo: r2(antes + saldo), actualizadoEn: fecha }, { merge: true });
      tx.set(doc(db, COL_SALDO_MOVIMIENTOS, `comision__${liderId}__${periodo}`), {
        personaId: liderId, tipo: 'abono', origen: 'comision', monto: saldo, referencia: `Comisión ${periodo}`, fecha, por: perfil.nombre
      });
    }
    const partes = [dinero > 0 ? `$${dinero.toFixed(2)} en dinero` : '', saldo > 0 ? `$${saldo.toFixed(2)} a saldo a favor` : ''].filter(Boolean).join(' y ');
    const r = actividad(perfil, equipo, 'registrar_pago', `Pago de comisión registrado (${periodo}) por $${monto.toFixed(2)}: ${partes}`, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
    const cuando = `${mesLabel(periodoKey)} (${sub === 'p1' ? 'Periodo 1' : 'Periodo 2'})`;
    const texto = saldo > 0 && dinero > 0
      ? `Se pagó tu comisión del periodo ${cuando}: $${dinero.toFixed(2)} MXN en dinero y $${saldo.toFixed(2)} MXN se guardaron como saldo a favor.`
      : saldo > 0
        ? `Tu comisión del periodo ${cuando} ($${saldo.toFixed(2)} MXN) se guardó como saldo a favor para tu próxima compra.`
        : `Se pagó tu comisión del periodo ${cuando}: $${dinero.toFixed(2)} MXN.`;
    const n = nuevoAviso({ texto, link: 'cuenta', paraId: liderId, rolDestino: 'emprendedora_lider', origen: 'admin' }, ahora);
    tx.set(doc(db, 'notificaciones', n.id), n);
  });
}

export function pagarBono(db: Firestore, clave: string, perfil: PerfilUsuario, equipo: string) {
  return ejecutar(db, async tx => {
    const ahora = new Date();
    const ref = doc(db, COL.bonos, clave);
    if ((await tx.get(ref)).exists()) throw new ErrorComision('Ese bono ya estaba registrado como pagado.');
    tx.set(ref, { fechaPago: ahora.toISOString(), registradoPor: perfil.nombre });
    const r = actividad(perfil, equipo, 'pagar_bono_rango', `Bono por rango registrado como pagado (${clave})`, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
  });
}

/** Rango manual solo para ese mes de pago (null = volver al automático). */
export function guardarRangoManual(db: Firestore, personaId: string, nombre: string, periodoKey: string, rangoKey: string | null, perfil: PerfilUsuario, equipo: string) {
  return ejecutar(db, async tx => {
    const ahora = new Date();
    const ref = doc(db, COL.rangoManual, claveRangoManual(personaId, periodoKey));
    await tx.get(ref);
    if (rangoKey) tx.set(ref, { rangoKey });
    else tx.delete(ref);
    const r = actividad(perfil, equipo, 'rango_manual', rangoKey ? `Rango manual de ${nombre} para ${periodoKey}: ${rangoKey}` : `Se quitó el rango manual de ${nombre} para ${periodoKey}`, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
  });
}
