import { describe, expect, it } from 'vitest';
import { codigoComparable, datosDeGrupo, leerCsv, leerInventario, planear } from './aronium';
import { normalizarProducto } from '../pagina/producto';

const CAB = 'Name,ProductGroup,SKU,Barcode,MeasurementUnit,Markup,Price,Tax,IsTaxInclusivePrice,IsPriceChangeAllowed,IsUsingDefaultQuantity,IsService,IsEnabled,Description,Quantity,Supplier,ReorderPoint,PreferredQuantity,LowStockWarning,WarningQuantity,';
const prod = (id: string, codigo: string, stock = 1, extra = {}) => normalizarProducto(id, { nombre: id, codigo, precioEtiqueta: 100, variantes: [{ id: 'v', stock }], ...extra });

describe('importar Aronium', () => {
  it('lee CSV con comillas y saltos de línea', () => {
    expect(leerCsv('a,"b,""c""",d\r\n1,"x\ny",3\n')).toEqual([['a', 'b,"c"', 'd'], ['1', 'x\ny', '3']]);
  });
  it('lee filas: negativos a 0, mínimo y servicio', () => {
    const r = leerInventario(`${CAB}\nHU OLA,60/HUGGIE,ABC-1,ABC-1,PZ,0,170,16,1,0,1,0,1,,-3,,2,,1,4,\nREP,reparaciones,R1,,PZ,0,50,16,1,0,1,1,1,,0,,,,,,\n`);
    if ('error' in r) throw new Error(r.error);
    expect(r.filas[0]).toMatchObject({ nombre: 'HU OLA', codigo: 'ABC-1', precio: 170, cantidad: 0, cantidadOriginal: -3, stockMinimo: 4 });
    expect(r.filas[1].servicio).toBe(true);
    const d = leerInventario(`${CAB}\nA,,4.12103E+11,,PZ,0,1,16,1,0,1,0,1,,1,,,,,,\n`);
    if ('error' in d) throw new Error(d.error);
    expect(d.filas[0]).toMatchObject({ codigo: '', codigoDanado: '4.12103E+11' });
    expect('error' in leerInventario('x,y\n1,2')).toBe(true);
  });
  it('grupos', () => {
    expect(datosDeGrupo('60/HUGGIE')).toMatchObject({ material: 'oro-laminado', categoria: 'Huggies', descuento: 60 });
    expect(datosDeGrupo('30/exhibidor')).toMatchObject({ material: 'exhibidores', categoria: 'Exhibidores', descuento: 30 });
    expect(datosDeGrupo('ACERO/GOTICO')).toMatchObject({ material: 'acero-inoxidable', subcategoria: 'Gótico', descuento: 40 });
    expect(datosDeGrupo('ACERO/GOTICO/FANTASIA').material).toBe('fantasia');
    expect(datosDeGrupo('NO COMISIONABLE').noComisionable).toBe(true);
    expect(datosDeGrupo('reparaciones').servicio).toBe(true);
    expect(datosDeGrupo('otro')).toMatchObject({ material: 'otros', descuento: 0 });
  });
  it('código parecido = solo mayúsculas o signos', () => {
    expect(codigoComparable('hu-12.3 a')).toBe(codigoComparable('HU123A'));
  });
  it('plan: igual, actualizar, parecido, nuevo y repetido', () => {
    const f = (codigo: string, cantidad: number, renglon: number) => ({ renglon, nombre: 'N' + codigo, grupo: '', codigo, precio: 100, cantidad, cantidadOriginal: cantidad, stockMinimo: null, descripcion: '', servicio: false });
    const plan = planear([f('A1', 1, 1), f('B1', 5, 2), f('c-1', 1, 3), f('Z9', 1, 4), f('A1', 9, 5)], [prod('pa', 'A1'), prod('pb', 'B1'), prod('pc', 'C1')]);
    expect(plan.acciones.map(a => a.tipo)).toEqual(['igual', 'actualizar', 'parecido', 'nuevo']);
    expect(plan.repetidos.map(x => x.renglon)).toEqual([5]);
    // Parecido ya confirmado: se reconoce por su código de Aronium.
    expect(planear([f('c-1', 1, 1)], [prod('pc', 'C1', 1, { codigoAronium: 'c-1' })]).acciones[0].tipo).toBe('igual');
  });
});
