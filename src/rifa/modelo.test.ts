import { describe, expect, it } from 'vitest';
import { asignarFolios, conteoVotos, fechaSorteo, foliosLocales, mesAnterior, normalizarConfig, nuevaOpcion, resumenPorPersona } from './modelo';

const T = new Date('2026-11-17T12:00:00Z');

describe('Rifa del mes', () => {
  it('mes anterior y fecha de sorteo (día 15 del mes siguiente)', () => {
    expect([mesAnterior('2026-01'), mesAnterior('2026-11')]).toEqual(['2025-12', '2026-10']);
    expect([fechaSorteo('2026-10'), fechaSorteo('2026-12')]).toEqual(['15 de noviembre 2026', '15 de enero 2027']);
  });
  it('folios: agrega los que faltan por nombre y nunca renumera', () => {
    const uno = asignarFolios([], [{ personaId: 'b', personaNombre: 'Zoe', boletos: 1 }, { personaId: 'a', personaNombre: 'Ana', boletos: 2 }], '2026-10', T);
    expect(uno.map(b => [b.folio, b.personaId])).toEqual([[1, 'a'], [2, 'a'], [3, 'b']]);
    const dos = asignarFolios(uno, [{ personaId: 'a', personaNombre: 'Ana', boletos: 2 }, { personaId: 'b', personaNombre: 'Zoe', boletos: 2 }, { personaId: 'c', personaNombre: 'Bety', boletos: 1 }], '2026-10', T);
    expect(dos.map(b => [b.folio, b.personaId])).toEqual([[1, 'a'], [2, 'a'], [3, 'b'], [4, 'c'], [5, 'b']]);
    expect(resumenPorPersona(dos).map(r => [r.personaNombre, r.boletos.length])).toEqual([['Ana', 2], ['Bety', 1], ['Zoe', 2]]);
    expect([...foliosLocales(dos).entries()]).toEqual([[1, 1], [2, 2], [3, 1], [4, 1], [5, 2]]);
  });
  it('votos solo de opciones vivas y del mes', () => {
    const c = normalizarConfig('2026-11', { modo: 'votacion', opciones: [{ id: 'o1', nombre: 'Bolsa' }, { id: 'o2', nombre: 'Reloj' }] });
    const votos = [
      { personaId: 'a', personaNombre: 'Ana', mesKey: '2026-11', opcionId: 'o1' },
      { personaId: 'b', personaNombre: 'Bety', mesKey: '2026-11', opcionId: 'borrada' },
      { personaId: 'c', personaNombre: 'Cris', mesKey: '2026-10', opcionId: 'o1' }
    ];
    expect(conteoVotos(c, votos).map(x => [x.opcion.nombre, x.votos.length])).toEqual([['Bolsa', 1], ['Reloj', 0]]);
    expect(normalizarConfig('2026-11', { modo: 'otro' }).modo).toBeNull();
  });
  it('opción nueva pide nombre', () => {
    expect(nuevaOpcion({ nombre: ' ', descripcion: '', fotoUrl: '' })).toEqual({ error: 'Escribe el nombre del regalo.' });
    expect(nuevaOpcion({ nombre: ' Bolsa ', descripcion: ' piel ', fotoUrl: '' }, T)).toMatchObject({ nombre: 'Bolsa', descripcion: 'piel' });
  });
});
