import { describe, expect, it } from 'vitest';
import { armarDocumento, borradorDesde, borradorVacio, describirCambios, textoEstable, validarBorrador, type BorradorProducto } from './edicion';
import { normalizarProducto } from './producto';

const valido = (): BorradorProducto => ({
  ...borradorVacio(),
  nombre: ' Anillo Corazón ',
  descripcion: 'Anillo con zirconia',
  material: 'oro-laminado',
  codigo: ' AN-045 ',
  colorOro: 'Amarillo',
  precioEtiqueta: '200',
  descuento: '60',
  variantes: [
    { id: 'v1', color: 'Roja ', talla: '6', stock: '3', fotoId: 'f2' },
    { id: 'v2', color: '', talla: '7', stock: '0', fotoId: 'f-borrada' }
  ],
  galeria: [{ id: 'f1', src: 'data:image/jpeg;base64,AAA' }, { id: 'f2', src: 'data:image/jpeg;base64,BBB' }]
});

describe('validarBorrador (mismas reglas que la página)', () => {
  it('arma los datos con la forma de la página', () => {
    const r = validarBorrador(valido());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos).toMatchObject({
      nombre: 'Anillo Corazón',
      codigo: 'AN-045',
      precioEtiqueta: 200,
      descuento: 60,
      disponible: true,
      imagen: 'data:image/jpeg;base64,AAA'
    });
    expect(r.datos.variantes).toEqual([
      { id: 'v1', color: 'Roja', talla: '6', stock: 3, fotoId: 'f2' },
      // la foto asignada ya no existe → vuelve a la principal
      { id: 'v2', color: '', talla: '7', stock: 0, fotoId: null }
    ]);
  });

  it('exige nombre, descripción y material', () => {
    expect(validarBorrador({ ...valido(), nombre: ' ' })).toEqual({ ok: false, error: 'Escribe el nombre del producto.' });
    expect(validarBorrador({ ...valido(), descripcion: '' })).toEqual({ ok: false, error: 'Agrega una descripción.' });
    expect(validarBorrador({ ...valido(), material: '' }).ok).toBe(false);
  });

  it('rechaza existencias, precio o descuento inválidos', () => {
    const conStock = (stock: string) => ({ ...valido(), variantes: [{ id: 'v', color: '', talla: '', stock, fotoId: null }] });
    expect(validarBorrador(conStock('-1')).ok).toBe(false);
    expect(validarBorrador(conStock('2.5')).ok).toBe(false);
    expect(validarBorrador(conStock('')).ok).toBe(false);
    expect(validarBorrador({ ...valido(), precioEtiqueta: 'abc' }).ok).toBe(false);
    expect(validarBorrador({ ...valido(), descuento: '101' }).ok).toBe(false);
  });

  it('respeta el máximo de fotos y su peso', () => {
    const foto = (i: number) => ({ id: `f${i}`, src: 'data:x' });
    expect(validarBorrador({ ...valido(), galeria: [0, 1, 2, 3, 4, 5].map(foto) }).ok).toBe(false);
    expect(validarBorrador({ ...valido(), galeria: [{ id: 'g', src: 'x'.repeat(700001) }] }).ok).toBe(false);
  });
});

describe('armarDocumento', () => {
  it('en una edición conserva los campos que BRILLO no maneja', () => {
    const r = validarBorrador(valido());
    if (!r.ok) throw new Error();
    const docu = armarDocumento('prod-1', r.datos, { tipo: 'Editado', empleado: 'Ana', fecha: 'f', origen: 'BRILLO (PC)' }, {
      id: 'prod-1',
      campoDeLaPagina: 'se queda',
      nombre: 'viejo'
    });
    expect(docu.campoDeLaPagina).toBe('se queda');
    expect(docu.nombre).toBe('Anillo Corazón');
    expect(docu.ultimaAccion).toEqual({ tipo: 'Editado', empleado: 'Ana', fecha: 'f', origen: 'BRILLO (PC)' });
  });
});

describe('describirCambios', () => {
  const original = normalizarProducto('p', {
    nombre: 'Anillo', descripcion: 'd', material: 'oro-laminado', precioEtiqueta: 200, descuento: 60,
    variantes: [{ id: 'v1', color: '', talla: '6', stock: 5 }]
  });
  it('lista lo que cambió, con existencias antes → después', () => {
    const b = borradorDesde(original);
    b.precioEtiqueta = '250';
    b.variantes[0].stock = '7';
    const r = validarBorrador(b);
    if (!r.ok) throw new Error(r.error);
    expect(describirCambios(original, r.datos)).toEqual(['precio', 'existencias 5 → 7']);
  });
  it('sin cambios no lista nada', () => {
    const r = validarBorrador(borradorDesde(original));
    if (!r.ok) throw new Error(r.error);
    expect(describirCambios(original, r.datos)).toEqual([]);
  });
});

describe('textoEstable', () => {
  it('no depende del orden de las claves', () => {
    expect(textoEstable({ a: 1, b: [{ y: 2, x: 1 }] })).toBe(textoEstable({ b: [{ x: 1, y: 2 }], a: 1 }));
  });
});
