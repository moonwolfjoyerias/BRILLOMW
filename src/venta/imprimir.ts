// Impresión de tickets (venta y corte) en papel de 58 u 80 mm. El ancho
// elegido se recuerda en este equipo.
import type { AnchoTicket } from './Ticket';

const CLAVE_ANCHO = 'brillo.anchoTicket';

export function anchoGuardado(): AnchoTicket {
  try {
    return localStorage.getItem(CLAVE_ANCHO) === '58' ? 58 : 80;
  } catch {
    return 80;
  }
}

export function guardarAncho(a: AnchoTicket) {
  try {
    localStorage.setItem(CLAVE_ANCHO, String(a));
  } catch {
    /* noop */
  }
}

/** Ajusta el tamaño de hoja al papel elegido justo antes de imprimir. */
export function imprimirTicket(ancho: AnchoTicket) {
  let estilo = document.getElementById('pagina-ticket');
  if (!estilo) {
    estilo = document.createElement('style');
    estilo.id = 'pagina-ticket';
    document.head.appendChild(estilo);
  }
  estilo.textContent = `@media print { @page { size: ${ancho}mm auto; margin: 0; } }`;
  window.print();
}
