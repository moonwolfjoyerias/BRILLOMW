import { describe, expect, it } from 'vitest';
import { normalizarProducto } from '../pagina/producto';
import { calcularTotales, PUBLICO_GENERAL, validarPagos, type ClienteVenta } from './carrito';
import * as C from './cambios';
import * as G from './garantias';
import * as H from './historial';
import { lineasVendidas } from './registrarVenta';

const anillo = normalizarProducto('A', { nombre: 'Anillo luna', codigo: 'ANIX0001', precioEtiqueta: 500, descuento: 60, variantes: [{ id: 'v1', stock: 2, talla: '7' }] });
const pulsera = normalizarProducto('P', { nombre: 'Pulsera sol', codigo: 'PULX0002', precioEtiqueta: 900, descuento: 60, variantes: [{ id: 'v1', stock: 1 }] });
const arete = normalizarProducto('R', { nombre: 'Arete estrella', codigo: 'AREX0003', precioEtiqueta: 300, descuento: 60, variantes: [{ id: 'v1', stock: 3 }] });
const ana: ClienteVenta = { tipo: 'emprendedora', personaId: 'E1', nombre: 'Ana', membresia: 'MW0001' };

describe('Cambio físico', () => {
  it('cada pieza vale su precio de hoy con su descuento de mayoreo', () => {
    const p = C.piezaDeCambio(anillo, 'v1');
    expect(p).toMatchObject({ codigo: 'ANIX0001', precioEtiqueta: 500, descuento: 60, valor: 200 });
    expect(C.valorCambio([p, C.piezaDeCambio(arete, 'v1')])).toBe(320);
    expect(C.piezaManual('Anillo viejo', 400, 60).valor).toBe(160);
  });

  it('se usa primero el cambio; si sobra, queda como saldo a favor', () => {
    expect(C.aplicarCreditos(150, 320, 0, false)).toEqual({ usarCambio: 150, usarSaldo: 0, sobrante: 170, porPagar: 0 });
    expect(C.aplicarCreditos(400, 320, 0, false)).toEqual({ usarCambio: 320, usarSaldo: 0, sobrante: 0, porPagar: 80 });
    // Con saldo guardado: cubre lo que falte (si el cajero lo usa).
    expect(C.aplicarCreditos(400, 320, 50, true)).toEqual({ usarCambio: 320, usarSaldo: 50, sobrante: 0, porPagar: 30 });
    expect(C.aplicarCreditos(400, 0, 1000, true)).toEqual({ usarCambio: 0, usarSaldo: 400, sobrante: 0, porPagar: 0 });
  });

  it('si no queda nada por pagar, el cobro no pide pagos', () => {
    expect(validarPagos(0, [])).toEqual({ ok: true, recibido: 0, cambio: 0, pagos: [] });
    expect(C.pagosDeCreditos({ usarCambio: 150, usarSaldo: 20 }).map(p => p.metodo)).toEqual(['cambio_fisico', 'saldo_favor']);
  });

  it('regresar al inventario suma 1 por pieza; las piezas fuera de catálogo no se regresan', () => {
    const piezas = [C.piezaDeCambio(anillo, 'v1'), C.piezaDeCambio(anillo, 'v1', 1), C.piezaManual('Viejo', 100, 0)];
    expect(C.piezasRegresables(piezas)).toHaveLength(2);
    const r = C.sumarExistencias(new Map([['A', [{ id: 'v1', stock: 0 }]]]), C.piezasRegresables(piezas), 1);
    expect(r.ok && r.cambios.get('A')).toEqual([{ id: 'v1', stock: 2 }]);
    expect(C.sumarExistencias(new Map([['A', [{ id: 'v1', stock: 0 }]]]), [piezas[0]], -1).ok).toBe(false);
  });
});

describe('Garantías', () => {
  const regresada = G.piezaGarantia(anillo, 'v1', ana);

  it('la diferencia es lo que cuesta la nueva menos el valor original (con descuento si es e/l)', () => {
    const l = G.lineaDeGarantia(pulsera, 'v1', 'CERT-1', 1, regresada, regresada.valor, ana);
    expect(l.garantia).toMatchObject({ valorOriginal: 200, valorNueva: 360, diferencia: 160 });
    expect(calcularTotales([l], ana)).toMatchObject({ total: 160, totalEtiqueta: 160, descuentoMayoreo: 0 });
    // Más barata: no se paga ni se deja saldo.
    expect(G.lineaDeGarantia(arete, 'v1', 'CERT-1', 1, regresada, regresada.valor, ana).garantia!.diferencia).toBe(0);
    // Público general: a precio etiqueta.
    const pub = G.piezaGarantia(anillo, 'v1', PUBLICO_GENERAL);
    expect(G.lineaDeGarantia(pulsera, 'v1', 'CERT-2', 1, pub, pub.valor, PUBLICO_GENERAL).garantia!.diferencia).toBe(400);
  });

  it('primer cambio una vez; el segundo confirma la pieza y la garantía se termina', () => {
    expect(G.validarCambio(1, null, 'ANIX0001')).toBeNull();
    expect(G.validarCambio(2, null, 'X')).toMatch(/No hay un primer cambio/);
    const l1 = G.lineaDeGarantia(pulsera, 'v1', 'CERT-1', 1, regresada, regresada.valor, ana);
    const g1 = G.garantiaDespues(null, l1, ana, '26-200-000001', 'Fer', '2026-10-30T10:00:00Z');
    expect(g1).toMatchObject({ folio: 'CERT-1', valorOriginal: 200, estado: 'abierta' });
    expect(G.validarCambio(1, g1, 'ANIX0001')).toMatch(/ya tiene un primer cambio/);
    expect(G.validarCambio(2, g1, 'ANIX0001')).toMatch(/no es la que se llevó/);
    expect(G.validarCambio(2, g1, 'pulx0002')).toBeNull();
    // El segundo cambio sigue usando el valor original (200), no el de la pulsera.
    const vuelta = G.piezaGarantia(pulsera, 'v1', ana);
    const l2 = G.lineaDeGarantia(pulsera, 'v1', 'CERT-1', 2, vuelta, g1.valorOriginal, ana);
    expect(l2.garantia!.diferencia).toBe(160);
    const g2 = G.garantiaDespues(g1, l2, ana, '26-200-000002', 'Fer', '2026-11-05T10:00:00Z');
    expect(g2.estado).toBe('terminada');
    expect(G.validarCambio(2, g2, 'PULX0002')).toMatch(/dos cambios/);
    expect(G.normalizarFolio(' cert 1 ')).toBe('CERT1');
  });

  it('en la venta la línea de garantía guarda sus datos y no muestra descuento', () => {
    const l = G.lineaDeGarantia(pulsera, 'v1', 'CERT-1', 1, regresada, regresada.valor, ana);
    const [v] = lineasVendidas([l], ana);
    expect(v).toMatchObject({ importe: 160, descuentoAplicado: 0, garantia: { folio: 'CERT-1', numero: 1 } });
  });
});

describe('Historial por persona', () => {
  it('un documento por mes; se busca por fecha, pieza o folio', () => {
    expect(H.idIndicePersona('E1', '2026-10-30')).toBe('E1__2026-10');
    expect(H.mesesEntre('2026-11-15', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    const t = (folio: string, fechaDia: string, nombre: string, codigo: string): H.ResumenTicket => ({
      folio, fechaDia, fechaLocal: `${fechaDia}T12:00:00Z`, total: 100, estado: 'completada', cambioFisico: 0, garantias: [],
      piezas: [{ productoId: null, codigo, nombre, variante: '', cantidad: 1, importe: 100 }]
    });
    const lista = [t('26-200-1', '2026-10-02', 'Anillo luna', 'ANIX0001'), t('26-200-2', '2026-10-20', 'Pulsera sol', 'PULX0002')];
    expect(H.filtrarTickets(lista, '2026-10-01', '2026-10-31', '').map(x => x.folio)).toEqual(['26-200-2', '26-200-1']);
    expect(H.filtrarTickets(lista, '2026-10-01', '2026-10-31', 'anillo').map(x => x.folio)).toEqual(['26-200-1']);
    expect(H.filtrarTickets(lista, '2026-10-01', '2026-10-31', 'pulx').map(x => x.folio)).toEqual(['26-200-2']);
    expect(H.filtrarTickets(lista, '2026-10-10', '2026-10-31', 'anillo')).toEqual([]);
  });
});
