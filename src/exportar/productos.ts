// Excel de productos: código, nombre, piezas (suma de variantes) y precios.
import { precioMayoreo, stockTotal, type Producto } from '../pagina/producto';
import { descargarXlsx, type Hoja } from './xlsx';

export function hojaProductos(productos: Producto[], nombre: string): Hoja {
  return {
    nombre,
    columnas: [
      { titulo: 'Código', ancho: 20 },
      { titulo: 'Nombre', ancho: 40 },
      { titulo: '# de piezas', ancho: 12 },
      { titulo: 'Precio etiqueta', ancho: 16 },
      { titulo: 'Precio emprendedora', ancho: 20 }
    ],
    filas: [...productos]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo))
      .map(p => [p.codigo, p.nombre, stockTotal(p), { dinero: p.precioEtiqueta }, { dinero: precioMayoreo(p) }])
  };
}

export function descargarProductos(productos: Producto[], nombre: string, archivo: string, hoy = new Date()) {
  const f = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  descargarXlsx(hojaProductos(productos, nombre), `${archivo}-${f}.xlsx`);
}
