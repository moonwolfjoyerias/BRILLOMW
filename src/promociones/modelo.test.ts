import { describe, expect, it } from 'vitest';
import { calcularPromociones, descuentoDe, validarPromocion, type Promocion } from './modelo';
import { PUBLICO_GENERAL, type ClienteVenta, type LineaCarrito } from '../venta/carrito';

const ana: ClienteVenta = { tipo: 'emprendedora', personaId: 'ana', nombre: 'Ana', membresia: 'MW1' };
const linea = (clave: string, precio: number, cantidad = 1, extra: Partial<LineaCarrito> = {}) => ({
  clave, productoId: clave, varianteId: 'v', descripcion: clave, nombre: clave, categoria: 'Anillos', colorOro: '', variante: '', codigo: clave,
  material: 'oro-laminado', cantidad, precioEtiqueta: precio, descuentoMayoreo: 60, esServicio: false, disponible: 9, ...extra
}) as LineaCarrito;
const promo = (extra: Partial<Promocion> = {}): Promocion => ({
  id: 'p1', nombre: '10% anillos', tipo: 'porcentaje', valor: 10, alcance: { todo: false, productos: [], categorias: ['Anillos'], materiales: [] },
  paraQuien: 'ambos', inicio: '2026-11-01', fin: '2026-11-30', activa: true, combinable: false, usos: 0, ...extra
});
const hoy = '2026-11-03';

describe('Promociones', () => {
  it('% sobre el precio de cada quien (e/l sobre mayoreo); no a servicios ni garantías', () => {
    const c = [linea('a', 500), linea('s', 100, 1, { esServicio: true }), linea('g', 300, 1, { garantia: { diferencia: 80 } as never })];
    expect(descuentoDe(promo(), c, PUBLICO_GENERAL)).toEqual({ a: 50 });
    expect(descuentoDe(promo(), c, ana)).toEqual({ a: 20 }); // 10% de 200
  });
  it('N×M: 3×2 regala la más barata por cada 3', () => {
    const c = [linea('a', 500), linea('b', 300, 2), linea('c', 100, 3)];
    const r = descuentoDe(promo({ tipo: 'nxm', n: 3, m: 2, valor: 0 }), c, PUBLICO_GENERAL);
    expect(r).toEqual({ c: 200 }); // 6 piezas → 2 gratis, las de $100
  });
  it('precio especial: baja al precio fijo', () => {
    expect(descuentoDe(promo({ tipo: 'precio', valor: 350 }), [linea('a', 500, 2)], PUBLICO_GENERAL)).toEqual({ a: 300 });
  });
  it('fechas, pausada, para quién, límite de usos, compra mínima y un uso por e/l', () => {
    const c = [linea('a', 500)];
    expect(calcularPromociones(c, PUBLICO_GENERAL, [promo({ fin: '2026-11-02' })], { hoy }).total).toBe(0);
    expect(calcularPromociones(c, PUBLICO_GENERAL, [promo({ activa: false })], { hoy }).total).toBe(0);
    expect(calcularPromociones(c, PUBLICO_GENERAL, [promo({ paraQuien: 'el' })], { hoy }).total).toBe(0);
    expect(calcularPromociones(c, PUBLICO_GENERAL, [promo({ limiteUsos: 3, usos: 3 })], { hoy }).total).toBe(0);
    expect(calcularPromociones(c, PUBLICO_GENERAL, [promo({ compraMinima: 600 })], { hoy }).total).toBe(0);
    expect(calcularPromociones(c, ana, [promo({ unUsoPorPersona: true })], { hoy, yaUsadas: ['p1'] }).total).toBe(0);
    expect(calcularPromociones(c, ana, [promo({ unUsoPorPersona: true })], { hoy, yaUsadas: [] }).total).toBe(20);
  });
  it('cupón: solo con el código escrito; avisa por qué no aplica', () => {
    const c = [linea('a', 500)];
    const p = promo({ cupon: 'BRILLO10', compraMinima: 1000 });
    expect(calcularPromociones(c, PUBLICO_GENERAL, [p], { hoy }).total).toBe(0);
    const r = calcularPromociones(c, PUBLICO_GENERAL, [p], { hoy, cupones: ['brillo10', 'NOEXISTE'] });
    expect(r.total).toBe(0);
    expect(r.avisos).toEqual(['El cupón BRILLO10 no aplica: la compra mínima es de $1000.', 'No existe el cupón NOEXISTE.']);
    expect(calcularPromociones(c, PUBLICO_GENERAL, [promo({ cupon: 'BRILLO10' })], { hoy, cupones: [' brillo10 '] }).aplicadas).toEqual([{ id: 'p1', nombre: '10% anillos', cupon: 'BRILLO10', monto: 50 }]);
  });
  it('combinables se suman sin pasar del precio; una no combinable gana si ahorra más', () => {
    const c = [linea('a', 500)];
    const p10 = promo({ id: 'p10', nombre: '10%', combinable: true });
    const p20 = promo({ id: 'p20', nombre: '20%', valor: 20, combinable: true });
    expect(calcularPromociones(c, PUBLICO_GENERAL, [p10, p20], { hoy }).total).toBe(150);
    const sola40 = promo({ id: 's40', nombre: '40% sola', valor: 40 });
    expect(calcularPromociones(c, PUBLICO_GENERAL, [p10, p20, sola40], { hoy }).aplicadas.map(a => a.id)).toEqual(['s40']);
    const sola25 = promo({ id: 's25', nombre: '25% sola', valor: 25 });
    expect(calcularPromociones(c, PUBLICO_GENERAL, [p10, p20, sola25], { hoy }).aplicadas.map(a => a.id)).toEqual(['p10', 'p20']);
    const tope = calcularPromociones(c, PUBLICO_GENERAL, [promo({ id: 'x', valor: 80, combinable: true }), promo({ id: 'y', valor: 50, combinable: true })], { hoy });
    expect(tope.total).toBe(500);
  });
  it('validar', () => {
    const base = { ...promo() } as Omit<Promocion, 'id' | 'usos'>;
    expect(validarPromocion(base)).toBeNull();
    expect(validarPromocion({ ...base, tipo: 'nxm', n: 2, m: 2 })).toMatch(/N debe ser mayor/);
    expect(validarPromocion({ ...base, alcance: { todo: false, productos: [], categorias: [], materiales: [] } })).toMatch(/a qué piezas/);
    expect(validarPromocion({ ...base, cupon: 'con espacio largo largo largo' })).toMatch(/cupón/);
  });
});
