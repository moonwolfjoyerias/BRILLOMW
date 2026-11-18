// Lectura de Excel (.xlsx) sin librerías: un .xlsx es un ZIP con XML. Se
// abre el ZIP (DecompressionStream, nativo), se leen los textos compartidos
// y la primera hoja. Misma idea que js/aronium-xlsx.js de la página.

export type ValorLeido = string | number | null;

async function inflar(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este equipo no puede abrir archivos de Excel. Actualiza el navegador.');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function entradasZip(buffer: ArrayBuffer): Map<string, () => Promise<string>> {
  const datos = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (datos.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const total = datos.getUint16(fin + 10, true);
  let p = datos.getUint32(fin + 16, true);
  const entradas = new Map<string, () => Promise<string>>();
  const dec = new TextDecoder('utf-8');
  for (let n = 0; n < total; n++) {
    if (datos.getUint32(p, true) !== 0x02014b50) break;
    const metodo = datos.getUint16(p + 10, true);
    const tam = datos.getUint32(p + 20, true);
    const ln = datos.getUint16(p + 28, true);
    const le = datos.getUint16(p + 30, true);
    const lc = datos.getUint16(p + 32, true);
    const off = datos.getUint32(p + 42, true);
    const nombre = dec.decode(bytes.subarray(p + 46, p + 46 + ln));
    entradas.set(nombre, async () => {
      const inicio = off + 30 + datos.getUint16(off + 26, true) + datos.getUint16(off + 28, true);
      const c = bytes.subarray(inicio, inicio + tam);
      return dec.decode(metodo === 0 ? c : await inflar(c));
    });
    p += 46 + ln + le + lc;
  }
  return entradas;
}

const desXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (_, e: string) => {
    const l = e.toLowerCase();
    if (l === 'lt') return '<';
    if (l === 'gt') return '>';
    if (l === 'quot') return '"';
    if (l === 'apos') return "'";
    if (l === 'amp') return '&';
    return String.fromCodePoint(l.startsWith('#x') ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
  });

/** Texto de todos los <t> dentro de un fragmento (ignora la fonética <rPh>). */
const textos = (x: string) => [...x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)].map(m => desXml(m[1] ?? '')).join('');

function columnaANumero(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

async function textosCompartidos(entradas: Map<string, () => Promise<string>>): Promise<string[]> {
  const compartidos: string[] = [];
  const ss = entradas.get('xl/sharedStrings.xml');
  if (ss) for (const m of (await ss()).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) compartidos.push(textos(m[1] ?? ''));
  return compartidos;
}

function filasDeHoja(hoja: string, compartidos: string[]): ValorLeido[][] {
  const filas: ValorLeido[][] = [];
  let siguiente = 0;
  for (const f of hoja.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = /\br="(\d+)"/.exec(f[1]);
    const iFila = r ? Number(r[1]) - 1 : siguiente;
    siguiente = iFila + 1;
    const celdas: ValorLeido[] = [];
    let col = 0;
    for (const c of (f[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+)\d*"/.exec(attrs);
      if (ref) col = columnaANumero(ref[1]);
      const tipo = /\bt="(\w+)"/.exec(attrs)?.[1];
      const cuerpo = c[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor: ValorLeido = null;
      if (tipo === 's' && v != null) valor = compartidos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textos(cuerpo);
      else if ((tipo === 'str' || tipo === 'e') && v != null) valor = desXml(v);
      else if (tipo === 'b' && v != null) valor = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null && v !== '') valor = Number(v);
      celdas[col] = valor;
      col++;
    }
    filas[iFila] = Array.from({ length: celdas.length }, (_, i) => celdas[i] ?? null);
  }
  return Array.from({ length: filas.length }, (_, i) => filas[i] || []);
}

/** Todas las hojas del libro, en su orden, con su nombre y sus filas (fórmulas = su último valor guardado). */
export async function leerLibroXlsx(buffer: ArrayBuffer): Promise<{ nombre: string; filas: ValorLeido[][] }[]> {
  const entradas = entradasZip(buffer);
  const compartidos = await textosCompartidos(entradas);
  const libro = entradas.get('xl/workbook.xml');
  const rels = entradas.get('xl/_rels/workbook.xml.rels');
  const destinos = new Map<string, string>();
  if (rels) for (const m of (await rels()).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const t = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && t) destinos.set(id, t.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const hojas: { nombre: string; ruta: string }[] = [];
  if (libro) for (const m of (await libro()).matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const nombre = desXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    const destino = rid ? destinos.get(rid) : undefined;
    if (destino) hojas.push({ nombre, ruta: 'xl/' + destino });
  }
  if (!hojas.length) {
    for (const n of [...entradas.keys()].filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()) hojas.push({ nombre: n, ruta: n });
  }
  const out: { nombre: string; filas: ValorLeido[][] }[] = [];
  for (const h of hojas) {
    const leer = entradas.get(h.ruta);
    if (leer) out.push({ nombre: h.nombre, filas: filasDeHoja(await leer(), compartidos) });
  }
  if (!out.length) throw new Error('El Excel no tiene ninguna hoja.');
  return out;
}

/** Primera hoja → filas (arreglos de celdas; null donde no hay nada). */
export async function leerFilasXlsx(buffer: ArrayBuffer): Promise<ValorLeido[][]> {
  return (await leerLibroXlsx(buffer))[0].filas;
}

/**
 * Filas como objetos con los títulos de la primera fila no vacía como
 * llaves (celdas vacías = ''). Como sheet_to_json(…, { defval: '' }).
 */
export async function leerObjetosXlsx(buffer: ArrayBuffer): Promise<Record<string, string | number>[]> {
  const filas = await leerFilasXlsx(buffer);
  const iEnc = filas.findIndex(f => f.some(v => v !== null && String(v).trim() !== ''));
  if (iEnc < 0) return [];
  const titulos = filas[iEnc].map((v, i) => (v === null || String(v).trim() === '' ? `__EMPTY${i ? '_' + i : ''}` : String(v).trim()));
  const out: Record<string, string | number>[] = [];
  for (const f of filas.slice(iEnc + 1)) {
    if (!f.some(v => v !== null && String(v).trim() !== '')) continue;
    const o: Record<string, string | number> = {};
    titulos.forEach((t, i) => { o[t] = f[i] ?? ''; });
    out.push(o);
  }
  return out;
}

/** Número de serie de Excel (días desde 1899-12-30) → AAAA-MM-DD. */
export function fechaDeSerieExcel(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}
