import { describe, expect, it } from 'vitest';
import { validarContacto } from './Clientes';

describe('Clientes: datos de contacto', () => {
  const otras = [{ id: 'b', telefono: '444 123 4567', correo: 'Ana@x.com' }];
  const d = { nombre: 'Valeria', apellidos: 'Ramírez', telefono: '4440001111', correo: 'vale@x.com' };
  it('pide nombre, 10 dígitos y correo válido', () => {
    expect(validarContacto({ ...d, nombre: ' ' }, 'a', otras)).toMatch(/nombre/);
    expect(validarContacto({ ...d, telefono: '12345' }, 'a', otras)).toMatch(/10 dígitos/);
    expect(validarContacto({ ...d, correo: 'mal' }, 'a', otras)).toMatch(/correo/);
    expect(validarContacto(d, 'a', otras)).toBeNull();
  });
  it('no repite teléfono ni correo de otra persona (sí el suyo)', () => {
    expect(validarContacto({ ...d, telefono: '(444) 123-4567' }, 'a', otras)).toMatch(/otra cuenta/);
    expect(validarContacto({ ...d, correo: 'ana@X.com' }, 'a', otras)).toMatch(/otra cuenta/);
    expect(validarContacto({ ...d, correo: 'ana@x.com' }, 'b', otras)).toBeNull();
  });
});
