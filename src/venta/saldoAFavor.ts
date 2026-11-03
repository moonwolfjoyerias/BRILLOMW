// Saldo a favor de una emprendedora/líder: de dónde salió (sobrante de un
// cambio físico, transferencia u otro), quién lo confirmó y cuánto tiene.
// El saldo vive en brilloSaldos/{personaId} y cada movimiento en
// brilloSaldoMovimientos (los de las ventas los escribe registrarVenta).
import { puede } from '../sesion/permisos';
import { collection, doc, getDocs, query, runTransaction, where, type Firestore } from '../datos/firestore';
import type { PerfilUsuario } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { COL_SALDO_MOVIMIENTOS, COL_SALDOS } from './cambios';

export type OrigenSaldo = 'cambio_fisico' | 'transferencia' | 'otro';

export const ORIGENES_SALDO: Record<OrigenSaldo, string> = {
  cambio_fisico: 'Sobrante de cambio físico',
  transferencia: 'Transferencia',
  otro: 'Otro'
};

export interface MovimientoSaldo {
  id: string;
  personaId: string;
  /** abono = entra saldo; uso = se usó en una venta; los demás, ajustes. */
  tipo: string;
  origen?: OrigenSaldo;
  monto: number;
  folio?: string;
  referencia?: string;
  nota?: string;
  fecha: string;
  /** Quién lo registró o confirmó. */
  por: string;
}

/** De dónde salió un abono (los de antes de guardar el origen salieron de un cambio físico). */
export function origenDe(m: Pick<MovimientoSaldo, 'tipo' | 'origen' | 'folio'>): OrigenSaldo | null {
  if (m.tipo !== 'abono') return null;
  return m.origen ?? (m.folio ? 'cambio_fisico' : 'otro');
}

/** Abonos ordenados del más reciente al más viejo. */
export function abonosRecientes(movs: MovimientoSaldo[], cuantos = 8): MovimientoSaldo[] {
  return movs.filter(m => m.tipo === 'abono').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, cuantos);
}

export async function leerMovimientosSaldo(db: Firestore, personaId: string): Promise<MovimientoSaldo[]> {
  const s = await getDocs(query(collection(db, COL_SALDO_MOVIMIENTOS), where('personaId', '==', personaId)));
  return s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MovimientoSaldo, 'id'>) }));
}

export const puedeAbonarSaldo = (p: Pick<PerfilUsuario, 'rol' | 'permisosBrillo'>) => puede(p, 'abonarSaldo');

/** Registra saldo a favor que no viene de una venta (por ejemplo, una transferencia). */
export async function abonarSaldo(
  db: Firestore,
  datos: { personaId: string; nombre: string; monto: number; origen: OrigenSaldo; referencia?: string; nota?: string },
  perfil: PerfilUsuario,
  equipo: string,
  ahora = new Date()
): Promise<string | null> {
  if (!puedeAbonarSaldo(perfil)) return 'Solo Encargado y Administración pueden agregar saldo a favor.';
  const monto = Math.round(datos.monto * 100) / 100;
  if (!(monto > 0)) return 'Escribe un monto mayor a 0.';
  if (datos.origen === 'transferencia' && !datos.referencia?.trim()) return 'Escribe la referencia de la transferencia.';
  if (datos.origen === 'otro' && !datos.nota?.trim()) return 'Escribe de dónde sale este saldo.';
  try {
    await runTransaction(db, async tx => {
      const ref = doc(db, COL_SALDOS, datos.personaId);
      const s = await tx.get(ref);
      const actual = Number(s.exists() ? s.data().saldo : 0) || 0;
      const fecha = ahora.toISOString();
      tx.set(ref, { personaId: datos.personaId, personaNombre: datos.nombre, saldo: Math.round((actual + monto) * 100) / 100, actualizadoEn: fecha }, { merge: true });
      tx.set(doc(db, COL_SALDO_MOVIMIENTOS, `manual__${datos.personaId}__${ahora.getTime()}`), {
        personaId: datos.personaId,
        tipo: 'abono',
        origen: datos.origen,
        monto,
        ...(datos.referencia?.trim() ? { referencia: datos.referencia.trim() } : {}),
        ...(datos.nota?.trim() ? { nota: datos.nota.trim() } : {}),
        fecha,
        por: perfil.nombre
      });
      const registro = nuevoRegistroActividad(
        perfil,
        'caja',
        'abonar_saldo_favor',
        conOrigen(`Agregó $${monto} de saldo a favor a ${datos.nombre} (${ORIGENES_SALDO[datos.origen]}${datos.referencia ? ` · ref. ${datos.referencia.trim()}` : ''})`, equipo),
        equipo,
        ahora
      );
      tx.set(doc(db, 'auditoria', registro.id), registro);
    });
    return null;
  } catch {
    return 'No se pudo guardar el saldo a favor. No se cambió nada; inténtalo de nuevo.';
  }
}
