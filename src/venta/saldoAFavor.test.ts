import { describe, expect, it } from 'vitest';
import { abonosRecientes, origenDe, type MovimientoSaldo } from './saldoAFavor';

const m = (id: string, tipo: string, fecha: string, extra: Partial<MovimientoSaldo> = {}): MovimientoSaldo => ({ id, personaId: 'ana', tipo, monto: 100, fecha, por: 'Fer', ...extra });

describe('saldo a favor', () => {
  it('origen: el de antes sin origen y con ticket salió de un cambio físico', () => {
    expect(origenDe(m('a', 'abono', '2026-10-01', { folio: '26-200-1' }))).toBe('cambio_fisico');
    expect(origenDe(m('b', 'abono', '2026-10-01', { origen: 'transferencia' }))).toBe('transferencia');
    expect(origenDe(m('c', 'abono', '2026-10-01'))).toBe('otro');
    expect(origenDe(m('d', 'uso', '2026-10-01'))).toBeNull();
  });
  it('abonos del más reciente al más viejo, sin los usos', () => {
    const r = abonosRecientes([m('1', 'abono', '2026-10-01'), m('2', 'uso', '2026-10-05'), m('3', 'abono', '2026-10-03')]);
    expect(r.map(x => x.id)).toEqual(['3', '1']);
  });
});
