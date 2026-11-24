// Impresión de tickets (venta, corte, saldo a favor) en papel de 58 u 80 mm.
// El ancho elegido se recuerda en este equipo; la tienda usa 58 mm.
//
// El ticket se imprime en un marco aparte que solo contiene el ticket, con
// una hoja exactamente del ancho del papel y del alto del ticket. Antes se
// imprimía la página completa (todo el sistema, ancho de pantalla) con
// `size: 80mm auto`, que el navegador no acepta: salía en hoja carta y la
// impresora la encogía hasta el rollo, por eso la letra salía diminuta.
import type { AnchoTicket } from './Ticket';

const CLAVE_ANCHO = 'brillo.anchoTicket';

export function anchoGuardado(): AnchoTicket {
  try {
    return localStorage.getItem(CLAVE_ANCHO) === '80' ? 80 : 58;
  } catch {
    return 58;
  }
}

export function guardarAncho(a: AnchoTicket) {
  try {
    localStorage.setItem(CLAVE_ANCHO, String(a));
  } catch {
    /* noop */
  }
}

const PX_A_MM = 25.4 / 96;

/** Alto de la hoja (mm) para un ticket de `altoPx` pixeles CSS, con un pequeño margen para el corte. */
export function altoHojaMm(altoPx: number): number {
  return Math.ceil(altoPx * PX_A_MM) + 6;
}

/** El ticket que está listo para imprimirse (el último con contenido). */
function ticketParaImprimir(): HTMLElement | null {
  const listos = [...document.querySelectorAll<HTMLElement>('.ticket-impresion')].filter(e => e.querySelector('.ticket'));
  return listos[listos.length - 1] ?? null;
}

function cargadas(doc: Document): Promise<void> {
  const imgs = [...doc.images].filter(i => !i.complete);
  return Promise.all(imgs.map(i => new Promise<void>(r => { i.onload = i.onerror = () => r(); }))).then(() => undefined);
}

export function imprimirTicket(ancho: AnchoTicket) {
  const origen = ticketParaImprimir();
  if (!origen) { window.print(); return; }

  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.tabIndex = -1;
  marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:400px;border:0;visibility:hidden;';
  document.body.appendChild(marco);
  const win = marco.contentWindow;
  const doc = marco.contentDocument;
  if (!win || !doc) { marco.remove(); window.print(); return; }

  const estilos = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map(n => n.outerHTML).join('');
  doc.open();
  doc.write(`<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><base href="${document.baseURI}">${estilos}
<style id="hoja-ticket">
  html, body { margin: 0; padding: 0; background: #fff; }
  body > .ticket-impresion { display: block !important; position: static !important; }
</style></head><body class="${document.body.className}"><div class="ticket-impresion">${origen.innerHTML}</div></body></html>`);
  doc.close();

  let hecho = false;
  const quitar = () => { if (!hecho) { hecho = true; setTimeout(() => marco.remove(), 500); } };

  void cargadas(doc).then(() => {
    const ticket = doc.querySelector<HTMLElement>('.ticket');
    const alto = ticket ? ticket.getBoundingClientRect().height : 0;
    const hoja = doc.getElementById('hoja-ticket');
    if (hoja) {
      hoja.textContent += `
  @page { size: ${ancho}mm ${altoHojaMm(alto)}mm; margin: 0; }
  @media print { html, body { width: ${ancho}mm; } }`;
    }
    win.addEventListener('afterprint', quitar);
    win.focus();
    win.print();
    setTimeout(quitar, 60000);
  });
}
