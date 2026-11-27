import { describe, expect, it } from 'vitest';
import { acomodarEnArbol, leerClientes, leerFechaNacimiento, planearClientes } from './clientes';
import { preparar } from './aplicarClientes';
import type { PersonaAdmin } from '../personas/modelo';
import type { Miembro } from '../arbol/modelo';

const CAB = 'Name,Code,TaxNumber,StreetName,BuildingNumber,AdditionalStreetName,PlotIdentification,PostalCode,City,CitySubdivisionName,CountrySubentity,Country,Email,Phone,IsEnabled,IsCustomer,IsTaxExempt';
const fila = (nombre: string, code: string, tax: string, invito: string, fecha = '', tel = '') => `${nombre},${code},${tax},,,${invito},${fecha},,,,,,,${tel},1,1,0`;
const persona = (id: string, nombre: string, apellidos: string, extra: Partial<PersonaAdmin> = {}): PersonaAdmin => ({
  id, nombre, apellidos, tipo: 'emprendedora', categoria: 'normal', estado: 'activa', telefono: '', correo: '', usuario: '', numeroCuenta: '', fechaAlta: '', liderId: null, invitadaPor: null,
  rangoActualKey: 'sin_rango', firebaseUid: null, ascensoPendiente: null, recompensaPendiente: null, solicitudCambioRamaPendiente: null, alertaInactividad: false, crudo: {}, ...extra
});

describe('importar clientes de Aronium', () => {
  it('fechas de nacimiento', () => {
    const hoy = new Date('2026-11-27');
    expect(leerFechaNacimiento('5/09/86', hoy)).toBe('1986-09-05');
    expect(leerFechaNacimiento('12/MAY/90', hoy)).toBe('1990-05-12');
    expect(leerFechaNacimiento('3/4/2001', hoy)).toBe('2001-04-03');
    expect(leerFechaNacimiento('15 de Agosto de 1980', hoy)).toBe('1980-08-15');
    expect(leerFechaNacimiento('12-mar', hoy)).toBe('');
    expect(leerFechaNacimiento('APARTADO', hoy)).toBe('');
  });
  it('reconoce, invita y acomoda (sin nadie → Celia; líder del portal = primera líder hacia arriba)', () => {
    const csv = [CAB, fila('CELIA ESCAMILLA', '000001', '', ''), fila('ANA LOPEZ', '000002', 'MW25001', 'CELIA ESCAMILLA', '1/2/90'), fila('BETY RUIZ', '000003', '', '000002', '', '4441234567'), fila('CARLA DIAZ', '000004', '', 'NADIE')].join('\n');
    const r = leerClientes(csv);
    if ('error' in r) throw new Error(r.error);
    expect(r.filas[1]).toMatchObject({ etiquetaMW: 'MW25001', fechaNacimiento: '1990-02-01' });
    const celia = persona('pc', 'Celia', 'Escamilla', { tipo: 'lider', usuario: 'MW0001' });
    const ana = persona('pa', 'Ana', 'Lopez', { usuario: 'MW0002' });
    const plan = planearClientes(r.filas, [celia, ana]);
    expect(plan.clientes.map(c => c.persona?.id ?? null)).toEqual(['pc', 'pa', null, null]);
    expect(plan.clientes[2].invitoIdx).toBe(1);
    const miembros: Miembro[] = [{ id: 'm1', fullName: 'Celia Escamilla', leaderId: null }];
    const p = preparar(plan, [celia, ana], miembros, new Date(1000));
    expect(p.invito).toEqual([null, 'pc', 'pa', 'pc']);
    // Bety la invitó Ana (emprendedora): su líder del portal es Celia.
    expect(p.lider).toEqual([null, 'pc', 'pc', 'pc']);
    expect(p.cambios.get('pa')).toMatchObject({ aroniumClienteIds: ['000002'], etiquetaMW: 'MW25001', invitadaPor: 'pc', liderId: 'pc' });
    expect(p.arbol).toMatchObject({ nuevos: 3, vinculados: 1, ciclos: 0 });
  });
  it('árbol: no hace ciclos', () => {
    const m: Miembro[] = [{ id: 'a', fullName: 'A', leaderId: null, portalPersonaId: 'pa' }, { id: 'b', fullName: 'B', leaderId: 'a', portalPersonaId: 'pb' }];
    const r = acomodarEnArbol(m, [{ personaId: 'pa', nombre: 'A', etiquetaMW: '', codigo: '', invitoId: 'pb' }], '2026-11-27');
    expect(r.ciclos).toBe(1);
    expect(m[0].leaderId).toBe(null);
  });
});
