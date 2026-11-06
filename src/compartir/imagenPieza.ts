// Imagen de una pieza para mandar por WhatsApp (Catálogo → Compartir por
// WhatsApp): la foto de la variante con el isotipo blanco en la esquina y,
// debajo, categoría, color de oro, descripción, color/talla y precio
// etiqueta. Se arma en el navegador; no se sube ni se guarda nada.
// La página hace la misma imagen en js/compartir-pieza.js; si cambia una,
// cambia la otra.
import { doc, getDoc, type Firestore } from '../datos/firestore';
import type { Producto, VarianteProducto } from '../pagina/producto';

const ANCHO = 1080;
const MORADO = '#5E1A8A';
const MORADO_OSCURO = '#43125F';
const DORADO = '#C9A227';
const LILA = '#E4D6F7';
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

export interface DatosImagen { categoria: string; colorOro: string; descripcion: string; colorTalla: string; precio: string }

export function datosImagen(p: Pick<Producto, 'categoria' | 'colorOro' | 'descripcion' | 'precioEtiqueta'>, v: Pick<VarianteProducto, 'color' | 'talla'> | null): DatosImagen {
  return {
    categoria: p.categoria.trim(),
    colorOro: p.colorOro.trim(),
    descripcion: p.descripcion.trim(),
    colorTalla: [v?.color ? `Color: ${v.color}` : '', v?.talla ? `Talla: ${v.talla}` : ''].filter(Boolean).join('   ·   '),
    precio: `${MXN.format(p.precioEtiqueta || 0)} MXN`
  };
}

export function nombreArchivo(p: Pick<Producto, 'codigo' | 'nombre'>, v: Pick<VarianteProducto, 'color' | 'talla'> | null): string {
  const base = ['mw', p.codigo || p.nombre || 'pieza', v?.color, v?.talla].filter(Boolean).join('-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${base || 'mw-pieza'}.jpg`;
}

/** Corta el texto en renglones que quepan; el último lleva "…" si sobra. */
export function partirEnLineas(medir: (s: string) => number, texto: string, ancho: number, maxLineas: number): string[] {
  const palabras = texto.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (medir(prueba) <= ancho || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  if (lineas.length <= maxLineas) return lineas;
  const cortadas = lineas.slice(0, maxLineas);
  let ultima = cortadas[maxLineas - 1];
  while (ultima && medir(`${ultima}…`) > ancho) ultima = ultima.slice(0, -1);
  cortadas[maxLineas - 1] = `${ultima.trimEnd()}…`;
  return cortadas;
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}

interface Isotipo { img: HTMLImageElement; sx: number; sy: number; sw: number; sh: number }
let isotipo: Promise<Isotipo | null> | null = null;
/** El PNG del isotipo trae mucho margen transparente: se recorta una vez. */
function isotipoRecortado(): Promise<Isotipo | null> {
  isotipo ??= cargarImagen('./isotipo-blanco.png').then(img => {
    const k = 4;
    const w = Math.ceil(img.width / k);
    const h = Math.ceil(img.height / k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      if (d[(y * w + i) * 4 + 3] > 16) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
    const sx = Math.max(0, (x0 - 1) * k), sy = Math.max(0, (y0 - 1) * k);
    return { img, sx, sy, sw: Math.min(img.width - sx, (x1 - x0 + 3) * k), sh: Math.min(img.height - sy, (y1 - y0 + 3) * k) };
  }).catch(() => null);
  return isotipo;
}

async function fuentesListas() {
  try {
    await Promise.all(['600 72px Cinzel', '400 34px Poppins', '500 30px Poppins', '600 24px Poppins'].map(f => document.fonts.load(f)));
  } catch { /* sin fuentes de Google se usan las del sistema */ }
}

/**
 * Foto en tamaño completo de la variante (o la principal). Si la página ya
 * movió las fotos a productosFotos/{id}, se leen de ahí.
 */
export async function fotoDe(db: Firestore, p: Producto, v: VarianteProducto | null): Promise<string> {
  let galeria = p.galeria.filter(f => f.src);
  if (!galeria.length) {
    try {
      const s = await getDoc(doc(db, 'productosFotos', p.id));
      const g = s.exists() ? s.data().galeria : null;
      galeria = Array.isArray(g) ? g.filter(f => f && typeof f.src === 'string' && f.src).map((f, i) => ({ id: String(f.id ?? `foto-${i}`), src: String(f.src) })) : [];
    } catch {
      galeria = [];
    }
  }
  return ((v?.fotoId && galeria.find(f => f.id === v.fotoId)) || galeria[0])?.src ?? '';
}

export async function crearImagen(db: Firestore, p: Producto, v: VarianteProducto | null): Promise<Blob> {
  const [src, iso] = await Promise.all([fotoDe(db, p, v), isotipoRecortado(), fuentesListas()]);
  const foto = src ? await cargarImagen(src).catch(() => null) : null;
  const d = datosImagen(p, v);
  const M = 72;
  const util = ANCHO - M * 2;

  const medir = document.createElement('canvas').getContext('2d')!;
  medir.font = '400 34px Poppins, sans-serif';
  const lineasDesc = d.descripcion ? partirEnLineas(s => medir.measureText(s).width, d.descripcion, util, 4) : [];
  const columnas = ([['CATEGORÍA', d.categoria], ['COLOR DE ORO', d.colorOro]] as const).filter(c => c[1]);

  let alto = ANCHO + M;
  if (columnas.length) alto += 34 + 54 + 40;
  if (columnas.length && (lineasDesc.length || d.colorTalla)) alto += 36;
  alto += lineasDesc.length * 50;
  if (d.colorTalla) alto += (lineasDesc.length ? 20 : 0) + 44;
  alto += 40 + 30 + 92 + M - 10;

  const c = document.createElement('canvas');
  c.width = ANCHO;
  c.height = Math.round(alto);
  const x = c.getContext('2d')! as CanvasRenderingContext2D & { letterSpacing?: string };

  x.fillStyle = '#FCFAF8';
  x.fillRect(0, 0, ANCHO, ANCHO);
  if (foto) {
    const r = foto.width / foto.height;
    const cubrir = r > 0.8 && r < 1.25;
    let w: number, h: number;
    if (cubrir ? r > 1 : r < 1) { h = ANCHO; w = ANCHO * r; } else { w = ANCHO; h = ANCHO / r; }
    if (cubrir) { const k = ANCHO / Math.min(w, h); w *= k; h *= k; }
    x.drawImage(foto, (ANCHO - w) / 2, (ANCHO - h) / 2, w, h);
  } else {
    x.fillStyle = '#F1EBFA';
    x.fillRect(0, 0, ANCHO, ANCHO);
    x.fillStyle = MORADO;
    x.font = '500 40px Poppins, sans-serif';
    x.textAlign = 'center';
    x.fillText('Sin foto', ANCHO / 2, ANCHO / 2);
    x.textAlign = 'left';
  }

  if (iso) {
    const h = 150;
    const w = h * (iso.sw / iso.sh);
    x.save();
    x.shadowColor = 'rgba(0, 0, 0, 0.45)';
    x.shadowBlur = 22;
    x.drawImage(iso.img, iso.sx, iso.sy, iso.sw, iso.sh, ANCHO - w - 40, ANCHO - h - 40, w, h);
    x.restore();
  }

  const g = x.createLinearGradient(0, ANCHO, 0, alto);
  g.addColorStop(0, MORADO);
  g.addColorStop(1, MORADO_OSCURO);
  x.fillStyle = g;
  x.fillRect(0, ANCHO, ANCHO, alto - ANCHO);
  x.fillStyle = DORADO;
  x.fillRect(0, ANCHO, ANCHO, 6);

  let y = ANCHO + M;
  x.textBaseline = 'top';
  const etiqueta = (t: string, cx: number) => {
    x.fillStyle = DORADO;
    x.font = '600 24px Poppins, sans-serif';
    x.letterSpacing = '4px';
    x.fillText(t, cx, y);
    x.letterSpacing = '0px';
  };
  if (columnas.length) {
    const anchoCol = util / columnas.length;
    columnas.forEach(([titulo, valor], i) => {
      const cx = M + i * anchoCol;
      etiqueta(titulo, cx);
      x.fillStyle = '#FFFFFF';
      x.font = '600 46px Cinzel, Georgia, serif';
      let t: string = valor;
      while (t.length > 1 && x.measureText(t).width > anchoCol - 24) t = t.slice(0, -1);
      x.fillText(t === valor ? t : `${t.trimEnd()}…`, cx, y + 34);
    });
    y += 34 + 54 + 40;
    if (lineasDesc.length || d.colorTalla) {
      x.fillStyle = 'rgba(201, 162, 39, 0.55)';
      x.fillRect(M, y - 20, util, 2);
      y += 36;
    }
  }
  if (lineasDesc.length) {
    x.fillStyle = '#FFFFFF';
    x.font = '400 34px Poppins, sans-serif';
    for (const l of lineasDesc) { x.fillText(l, M, y); y += 50; }
  }
  if (d.colorTalla) {
    if (lineasDesc.length) y += 20;
    x.fillStyle = LILA;
    x.font = '500 30px Poppins, sans-serif';
    x.fillText(d.colorTalla, M, y);
    y += 44;
  }
  y += 40;
  etiqueta('PRECIO', M);
  y += 30;
  x.fillStyle = '#FFFFFF';
  x.font = '700 76px Cinzel, Georgia, serif';
  x.fillText(d.precio, M, y);

  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('No se pudo crear la imagen');
  return blob;
}

/** Tablet o celular: se abre el menú de compartir; en la PC se descarga. */
export const enCelular = () =>
  !!window.matchMedia?.('(pointer: coarse)').matches && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export function descargarImagen(blob: Blob, nombre: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export async function compartirImagen(blob: Blob, nombre: string) {
  const archivo = new File([blob], nombre, { type: 'image/jpeg' });
  if (enCelular() && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') descargarImagen(blob, nombre);
    }
  } else descargarImagen(blob, nombre);
}
