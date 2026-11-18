import { describe, expect, it } from 'vitest';
import { personaDeTarjeta, usuarioDeTarjeta, type Persona } from './persona';

const p = (id: string, usuario: string, estado = 'activa'): Persona => ({ id, nombre: 'Ana', apellidos: 'López', usuario, estado, tipo: 'emprendedora', categoria: 'normal', telefono: '', liderId: null, codigoTarjeta: null } as unknown as Persona);

describe('Tarjeta virtual', () => {
  it('lee el usuario del QR y no confunde códigos de producto', () => {
    expect([usuarioDeTarjeta('MWE:MW0003'), usuarioDeTarjeta(' mwe: mw25075 '), usuarioDeTarjeta('AR-0123'), usuarioDeTarjeta('MW0003')]).toEqual(['MW0003', 'MW25075', null, null]);
  });
  it('elige a la e/l por su tarjeta o su usuario exacto; avisa si está de baja', () => {
    const lista = [p('a', 'MW0003'), p('b', 'MW0004', 'baja')];
    expect(personaDeTarjeta(lista, 'MWE:mw0003')).toMatchObject({ persona: { id: 'a' } });
    expect(personaDeTarjeta(lista, 'mw0003')).toMatchObject({ persona: { id: 'a' } });
    expect(personaDeTarjeta(lista, 'MWE:MW0004')).toMatchObject({ error: expect.stringMatching(/baja/) });
    expect(personaDeTarjeta(lista, 'MWE:MW9999')).toMatchObject({ error: expect.stringMatching(/No hay/) });
    expect(personaDeTarjeta(lista, 'Ana')).toBeNull();
  });
});
