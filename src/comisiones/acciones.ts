// Lee y guarda Comisiones en las mismas colecciones que la página (solo
// Administración). Cada acción va en UNA transacción con su registro en
// Actividad (módulo comisiones) y, si aplica, el aviso a la líder.
import { FirebaseError } from 'firebase/app';
import { collection, doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { nuevoAviso } from '../pagina/avisos';
import type { Aronium, SubPeriodo } from '../planmw/modelo';
import { mesLabel } from '../planmw/modelo';
import { claveAjuste, clavePago, claveRangoManual, type Ajuste, type Bono, type DatosComisiones, type Pago, type VersionConfig } from './modelo';

export const COL = {
  ajustes: 'comisionesAjustes',
  historial: 'comisionesHistorialAjustes',
  pagos: 'comisionesPagos',
  bonos: 'comisionesBonos',
  rangoManual: 'comisionesRangoManual'
} as const;

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

/** Registrar el pago de una quincena (el pago en sí se hace por fuera) y avisarle a la líder. */
export function registrarPago(db: Firestore, liderId: string, periodoKey: string, sub: SubPeriodo, monto: number, perfil: PerfilUsuario, equipo: string) {
  return ejecutar(db, async tx => {
    if (!Number.isFinite(monto) || monto <= 0) throw new ErrorComision('Escribe el monto pagado.');
    const ahora = new Date();
    const ref = doc(db, COL.pagos, clavePago(liderId, periodoKey, sub));
    const actual = await tx.get(ref);
    if (actual.exists() && actual.data().estado === 'pagada') throw new ErrorComision('Ese periodo ya estaba registrado como pagado.');
    tx.set(ref, { estado: 'pagada', fechaPago: ahora.toISOString(), registradoPor: perfil.nombre, montoPagado: monto, periodo: `${periodoKey}-${sub}` });
    const r = actividad(perfil, equipo, 'registrar_pago', `Pago de comisión registrado (${periodoKey}-${sub}) por $${monto.toFixed(2)}`, ahora);
    tx.set(doc(db, 'auditoria', r.id), r);
    const n = nuevoAviso(
      { texto: `Se pagó tu comisión del periodo ${mesLabel(periodoKey)} (${sub === 'p1' ? 'Periodo 1' : 'Periodo 2'}): $${monto.toFixed(2)} MXN.`, link: 'cuenta', paraId: liderId, rolDestino: 'emprendedora_lider', origen: 'admin' },
      ahora
    );
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
