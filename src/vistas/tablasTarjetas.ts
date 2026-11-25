// Tablas como tarjetas en celular y tablet vertical (mismo criterio que la
// página): a cada celda se le copia el título de su columna en
// data-label, y el CSS (table.tabla-tarjetas) pinta cada renglón como
// una tarjeta "Etiqueta  valor". Solo tablas de 4 columnas o más; para
// dejar una como tabla, agrégale la clase "sin-tarjetas".
import { useEffect } from 'react';

const MIN_COLUMNAS = 4;

export function etiquetarTabla(tabla: HTMLTableElement) {
  const titulos = [...(tabla.tHead?.rows[0]?.cells ?? [])].map(c => (c.textContent ?? '').trim());
  if (titulos.length < MIN_COLUMNAS) { tabla.classList.remove('tabla-tarjetas'); return; }
  tabla.classList.add('tabla-tarjetas');
  for (const cuerpo of tabla.tBodies) {
    for (const fila of cuerpo.rows) {
      let col = 0;
      for (const celda of fila.cells) {
        const titulo = titulos[col] ?? '';
        if (celda.colSpan > 1) celda.classList.add('celda-completa');
        if (celda.getAttribute('data-label') !== titulo) celda.setAttribute('data-label', titulo);
        col += celda.colSpan || 1;
      }
    }
  }
}

/** Etiqueta las tablas dentro de `selector` y las sigue mientras cambian. */
export function useTablasTarjetas(selector = '.contenido') {
  useEffect(() => {
    const raiz = document.querySelector(selector);
    if (!raiz) return;
    let pendiente = 0;
    const revisar = () => {
      pendiente = 0;
      raiz.querySelectorAll<HTMLTableElement>('table.tabla:not(.sin-tarjetas)').forEach(etiquetarTabla);
    };
    revisar();
    const obs = new MutationObserver(() => { if (!pendiente) pendiente = requestAnimationFrame(revisar); });
    obs.observe(raiz, { childList: true, subtree: true });
    return () => { obs.disconnect(); if (pendiente) cancelAnimationFrame(pendiente); };
  }, [selector]);
}
