import { describe, expect, it } from 'vitest';
import { ascensoPrimeraVez, logrosDelMes, personasPorMiembro, proximosRangos, rangoSiguiente } from './planmw';
import type { Miembro } from './modelo';

/** Líder con 5 directas (con una nieta cada una); en 2026-11 alcanza Plata, en 2026-10 no. */
function equipo(): Miembro[] {
  const l: Miembro[] = [{ id: 'L', fullName: 'Lucía Líder', leaderId: null, clientCode: 'MW0001', pointsHistory: { '2026-10': { p1: 2000, p2: 2000 }, '2026-11': { p1: 2000, p2: 2000 } } }];
  for (let i = 1; i <= 5; i++) {
    l.push({ id: `d${i}`, fullName: `Directa ${i}`, leaderId: 'L', pointsHistory: { '2026-10': { p1: 1600, p2: 1600 }, '2026-11': { p1: 1600, p2: 1600 } } });
    l.push({ id: `n${i}`, fullName: `Nieta ${i}`, leaderId: `d${i}`, pointsHistory: { '2026-10': { p1: 600, p2: 600 }, '2026-11': { p1: 800, p2: 800 } } });
  }
  return l;
}

describe('Plan MW desde el árbol', () => {
  it('rango siguiente', () => {
    expect(rangoSiguiente('sinRango')?.key).toBe('plata');
    expect(rangoSiguiente('diamante')?.key).toBe('corona');
    expect(rangoSiguiente('corona')).toBeNull();
  });
  it('próximos a subir: requisitos del siguiente rango con lo que lleva', () => {
    const [p] = proximosRangos(equipo(), '2026-10');
    expect([p.lider.id, p.actual.key, p.siguiente.key, p.listo]).toEqual(['L', 'sinRango', 'plata', false]);
    const prod = p.requisitos[0];
    expect([prod.lleva, prod.meta, prod.ok]).toEqual([21400, 22500, false]);
    expect(p.requisitos.slice(1).every(r => r.ok)).toBe(true);
    expect(p.progresoPct).toBe(Math.round(((21400 / 22500) + 3) / 4 * 100));
    // En noviembre ya es Plata: lo siguiente es Oro.
    expect(proximosRangos(equipo(), '2026-11')[0].siguiente.key).toBe('oro');
  });
  it('logros del mes y bono por la primera vez', () => {
    const l = equipo();
    const [g] = logrosDelMes(l, '2026-11');
    expect([g.lider.id, g.antes.key, g.ahora.key, g.primeraVez]).toEqual(['L', 'sinRango', 'plata', true]);
    expect(ascensoPrimeraVez(l, 'L', '2026-11')?.key).toBe('plata');
    expect(logrosDelMes(l, '2026-10')).toEqual([]);
    // Si ya había sido Plata a mano antes, no es primera vez.
    l[0].manualRank = { '2026-09': 'plata' };
    l[0].pointsHistory!['2026-09'] = { p1: 0, p2: 0 };
    expect(ascensoPrimeraVez(l, 'L', '2026-11')).toBeNull();
    expect(logrosDelMes(l, '2026-11')[0].primeraVez).toBe(false);
  });
  it('vincula personas del árbol con su cuenta de la página', () => {
    const l = equipo();
    l[1].portalPersonaId = 'P-D1';
    const m = personasPorMiembro(l, [{ id: 'P-L', usuario: 'mw0001' }, { id: 'P-D1' }, { id: 'P-N2', nombre: 'Nieta', apellidos: '2' }]);
    expect([m.get('L')?.id, m.get('d1')?.id, m.get('n2')?.id, m.get('n3')]).toEqual(['P-L', 'P-D1', 'P-N2', undefined]);
  });
});
