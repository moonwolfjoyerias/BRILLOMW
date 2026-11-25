import { describe, expect, it } from 'vitest';
import { etiquetarTabla } from './tablasTarjetas';

// Tabla de mentira con lo mínimo que usa etiquetarTabla (las pruebas corren sin navegador).
function clases() {
  const s = new Set<string>();
  return { add: (c: string) => s.add(c), remove: (c: string) => s.delete(c), contains: (c: string) => s.has(c) };
}
function celda(colSpan = 1) {
  const attrs: Record<string, string> = {};
  return { colSpan, classList: clases(), getAttribute: (k: string) => attrs[k] ?? null, setAttribute: (k: string, v: string) => { attrs[k] = v; }, attrs };
}
function tabla(cols: string[], filas: ReturnType<typeof celda>[][]) {
  return {
    classList: clases(),
    tHead: { rows: [{ cells: cols.map(c => ({ textContent: c })) }] },
    tBodies: [{ rows: filas.map(cells => ({ cells })) }]
  };
}

describe('tablas como tarjetas', () => {
  it('copia el título de la columna a cada celda', () => {
    const fila = [celda(), celda(), celda(), celda()];
    const t = tabla(['Código', 'Producto', 'Precio', ''], [fila]);
    etiquetarTabla(t as unknown as HTMLTableElement);
    expect(t.classList.contains('tabla-tarjetas')).toBe(true);
    expect(fila.map(c => c.attrs['data-label'])).toEqual(['Código', 'Producto', 'Precio', '']);
  });
  it('respeta celdas que ocupan varias columnas', () => {
    const fila = [celda(4)];
    etiquetarTabla(tabla(['A', 'B', 'C', 'D'], [fila]) as unknown as HTMLTableElement);
    expect(fila[0].classList.contains('celda-completa')).toBe(true);
  });
  it('tablas de menos de 4 columnas se quedan como tabla', () => {
    const t = tabla(['A', 'B', 'C'], [[celda(), celda(), celda()]]);
    etiquetarTabla(t as unknown as HTMLTableElement);
    expect(t.classList.contains('tabla-tarjetas')).toBe(false);
  });
});
