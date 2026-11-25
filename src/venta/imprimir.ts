// Impresión de tickets (venta, corte, saldo a favor) en papel de 58 u 80 mm.
// Cada vez que se imprime se pregunta el papel (58 u 80 mm); la última
// elección queda marcada para la siguiente vez en este equipo.
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

/**
 * Pregunta en qué papel se imprime (58 u 80 mm). Resuelve con el ancho
 * elegido, o null si se cancela. La opción usada la última vez queda
 * marcada para que baste con Enter.
 */
export function preguntarAncho(): Promise<AnchoTicket | null> {
  return new Promise(resolve => {
    const previo = document.activeElement as HTMLElement | null;
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo pregunta-papel';
    fondo.innerHTML = `
      <div class="modal modal-papel" role="dialog" aria-modal="true" aria-labelledby="titulo-papel">
        <h2 id="titulo-papel">¿En qué papel lo imprimo?</h2>
        <div class="opciones-papel">
          <button type="button" class="btn" data-ancho="58"><strong>58 mm</strong><span>Impresora angosta</span></button>
          <button type="button" class="btn" data-ancho="80"><strong>80 mm</strong><span>Impresora ancha</span></button>
        </div>
        <div class="acciones"><button type="button" class="btn" data-cancelar>Cancelar</button></div>
      </div>`;
    const ultimo = anchoGuardado();
    const fin = (a: AnchoTicket | null) => {
      window.removeEventListener('keydown', tecla, true);
      fondo.remove();
      previo?.focus?.();
      if (a) guardarAncho(a);
      resolve(a);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fin(null); }
      else if (e.key === '5') fin(58);
      else if (e.key === '8') fin(80);
    };
    fondo.querySelectorAll<HTMLButtonElement>('[data-ancho]').forEach(b => {
      const a = Number(b.dataset.ancho) as AnchoTicket;
      if (a === ultimo) { b.classList.add('primario'); b.setAttribute('aria-label', `${a} milímetros (la última vez)`); }
      b.addEventListener('click', () => fin(a));
    });
    fondo.querySelector('[data-cancelar]')?.addEventListener('click', () => fin(null));
    fondo.addEventListener('click', e => { if (e.target === fondo) fin(null); });
    window.addEventListener('keydown', tecla, true);
    document.body.appendChild(fondo);
    fondo.querySelector<HTMLButtonElement>(`[data-ancho="${ultimo}"]`)?.focus();
  });
}

/**
 * Imprime el ticket que está listo. Antes pregunta el papel (58 u 80 mm),
 * salvo que se pase `ancho` ya elegido. El parámetro que recibían antes las
 * pantallas ya no decide el papel: siempre se pregunta.
 */
export async function imprimirTicket(_sugerido?: AnchoTicket): Promise<void> {
  // Se copia el ticket ANTES de preguntar: varias pantallas lo quitan en cuanto se manda a imprimir.
  const origen = ticketParaImprimir();
  if (!origen) { window.print(); return; }
  const html = origen.innerHTML;
  const ancho = await preguntarAncho();
  if (!ancho) return;
  imprimirEn(ancho, html);
}

function imprimirEn(ancho: AnchoTicket, html: string) {

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
</style></head><body class="${document.body.className}"><div class="ticket-impresion">${html}</div></body></html>`);
  doc.close();

  let hecho = false;
  const quitar = () => { if (!hecho) { hecho = true; setTimeout(() => marco.remove(), 500); } };

  void cargadas(doc).then(() => {
    const ticket = doc.querySelector<HTMLElement>('.ticket');
    doc.querySelectorAll('.ticket').forEach(t => t.classList.toggle('t58', ancho === 58));
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
