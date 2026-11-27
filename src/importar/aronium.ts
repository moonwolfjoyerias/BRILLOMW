// Importar el inventario exportado de Aronium (CSV: Name, ProductGroup, SKU,
// Barcode, Price, Quantity, IsService, ReorderPoint, LowStockWarning,
// WarningQuantity…). Todo puro para poder probarlo; la escritura está en
// importar/aplicar.ts.
//
// Reglas acordadas con Admin:
// - Mismo código (SKU) que un producto de BRILLO → se actualiza (precio,
//   existencia, mínimo); se conservan fotos, nombre y "mostrar en catálogo".
// - Código PARECIDO (solo cambian mayúsculas/minúsculas o algún signo) →
//   se pregunta si es el mismo.
// - Si no, se da de alta como "solo tienda" (no sale en el catálogo).
// - Existencias negativas → 0.
// - Grupo "60/HUGGIE" = 60 % de descuento + categoría Huggies, "ACERO" =
//   acero, "NO COMISIONABLE" no cuenta para comisiones, "reparaciones" =
//   servicio, "otro" = otros.
import type { Material, Producto } from '../pagina/producto';

export interface FilaAronium {
  /** Renglón del archivo (1 = primer producto), para los avisos. */
  renglon: number;
  nombre: string;
  grupo: string;
  codigo: string;
  precio: number;
  /** Existencia del archivo ya sin negativos. */
  cantidad: number;
  /** Existencia tal como venía (para avisar los negativos). */
  cantidadOriginal: number;
  stockMinimo: number | null;
  descripcion: string;
  servicio: boolean;
  /** El código venía dañado por Excel ("4.12103E+11") o era "0": se importa sin código y se reconoce por nombre. */
  codigoDanado?: string;
}

/** Códigos que Excel convierte a notación científica (pierden dígitos) o "0": no sirven para reconocer el producto. */
export const codigoInservible = (c: string) => /^\d+(\.\d+)?E[+-]?\d+$/i.test(c) || /^0+$/.test(c);

export interface DatosGrupo {
  material: Material;
  categoria: string;
  subcategoria: string;
  descuento: number;
  noComisionable: boolean;
  servicio: boolean;
}

/** Lee un CSV (comas, comillas dobles, saltos de línea dentro de comillas). */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(x => x.trim())) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some(x => x.trim())) filas.push(fila);
  return filas;
}

const numero = (v: string | undefined): number => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Filas del inventario de Aronium. Error si no parece ese archivo. */
export function leerInventario(texto: string): { filas: FilaAronium[] } | { error: string } {
  const tabla = leerCsv(texto);
  if (!tabla.length) return { error: 'El archivo está vacío.' };
  const cab = tabla[0].map(h => h.trim().toLowerCase());
  const col = (n: string) => cab.indexOf(n.toLowerCase());
  const iNombre = col('Name');
  const iSku = col('SKU');
  if (iNombre < 0 || iSku < 0 || col('Quantity') < 0) {
    return { error: 'Este archivo no parece el inventario de Aronium (faltan las columnas Name, SKU o Quantity).' };
  }
  const dato = (f: string[], n: string) => { const i = col(n); return i < 0 ? '' : String(f[i] ?? '').trim(); };
  const filas: FilaAronium[] = [];
  tabla.slice(1).forEach((f, i) => {
    const nombre = dato(f, 'Name');
    if (!nombre) return;
    const crudo = dato(f, 'SKU') || dato(f, 'Barcode');
    const danado = crudo && codigoInservible(crudo) ? crudo : '';
    const codigo = danado ? '' : crudo;
    const cantidadOriginal = numero(dato(f, 'Quantity'));
    const aviso = dato(f, 'LowStockWarning') === '1' ? numero(dato(f, 'WarningQuantity')) : 0;
    const reorden = numero(dato(f, 'ReorderPoint'));
    const minimo = aviso > 0 ? aviso : reorden > 0 ? reorden : null;
    filas.push({
      renglon: i + 1,
      nombre,
      grupo: dato(f, 'ProductGroup'),
      codigo,
      precio: Math.max(0, numero(dato(f, 'Price'))),
      cantidad: Math.max(0, Math.floor(cantidadOriginal)),
      cantidadOriginal,
      stockMinimo: minimo === null ? null : Math.floor(minimo),
      descripcion: dato(f, 'Description'),
      servicio: dato(f, 'IsService') === '1',
      ...(danado ? { codigoDanado: danado } : {})
    });
  });
  return { filas };
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Categorías de la tienda (grupo después de "60/") → categoría de BRILLO. */
const CATEGORIA_GRUPO: Record<string, string> = {
  HUGGIE: 'Huggies', HUGGIES: 'Huggies',
  PULSERA: 'Pulseras', PULSERAS: 'Pulseras',
  DIJE: 'Dijes', DIJES: 'Dijes',
  CADENA: 'Cadenas', CADENAS: 'Cadenas',
  ANILLO: 'Anillos', ANILLOS: 'Anillos', ALIANZA: 'Anillos',
  ARETE: 'Aretes', ARETES: 'Aretes',
  ARRACADA: 'Arracadas', ARRACADAS: 'Arracadas',
  COLLAR: 'Collares', COLLARES: 'Collares',
  BRAZALETE: 'Brazaletes', BRAZALETES: 'Brazaletes',
  JUEGO: 'Juegos', JUEGOS: 'Juegos',
  SIMULADOR: 'Simuladores', SIMULADORES: 'Simuladores',
  BROQUEL: 'Broqueles', BROQUELES: 'Broqueles',
  ROSARIO: 'Rosarios', ROSARIOS: 'Rosarios',
  TOBILLERA: 'Tobilleras', TOBILLERAS: 'Tobilleras',
  PRENDEDOR: 'Prendedores', PRENDEDORES: 'Prendedores',
  EXHIBIDOR: 'Exhibidores', EXHIBIDORES: 'Exhibidores', EXIBIDOR: 'Exhibidores',
  SEMANARIO: 'Semanarios', RELICARIO: 'Relicarios', TIARA: 'Tiaras',
  GOTICO: 'Gótico', FANTASIA: 'Fantasía'
};

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());

/** Qué significa el grupo de Aronium en BRILLO. */
export function datosDeGrupo(grupo: string): DatosGrupo {
  const partes = sinAcentos(grupo).toUpperCase().split('/').map(x => x.trim()).filter(Boolean);
  const base: DatosGrupo = { material: 'otros', categoria: '', subcategoria: '', descuento: 0, noComisionable: false, servicio: false };
  if (!partes.length || partes[0] === 'OTRO' || partes[0] === 'OTROS') return base;
  if (partes[0] === 'NO COMISIONABLE') return { ...base, noComisionable: true };
  if (partes[0] === 'REPARACIONES' || partes[0] === 'REPARACION') return { ...base, categoria: 'Reparaciones', servicio: true };
  const categoriaDe = (x: string | undefined) => (x ? CATEGORIA_GRUPO[x] ?? titulo(x) : '');
  if (/^\d+$/.test(partes[0])) {
    const descuento = Math.min(100, Number(partes[0]));
    const cat = categoriaDe(partes[1]);
    const material: Material = cat === 'Exhibidores' ? 'exhibidores' : descuento === 60 ? 'oro-laminado' : partes[1] === 'PRENDEDOR' || partes[1] === 'PRENDEDORES' ? 'oro-laminado' : 'otros';
    return { ...base, material, categoria: cat, descuento };
  }
  if (partes[0] === 'ACERO') {
    const fantasia = partes.includes('FANTASIA');
    const gotico = partes.includes('GOTICO');
    return { ...base, material: fantasia ? 'fantasia' : 'acero-inoxidable', subcategoria: gotico ? 'Gótico' : '', descuento: 40 };
  }
  return { ...base, categoria: titulo(grupo.trim()) };
}

/** Código para comparar "parecidos": sin mayúsculas/minúsculas, acentos, espacios ni signos. */
export const codigoComparable = (c: string) => sinAcentos(c).toUpperCase().replace(/[^A-Z0-9]/g, '');

export type Accion =
  | { tipo: 'nuevo'; fila: FilaAronium }
  | { tipo: 'actualizar'; fila: FilaAronium; producto: Producto; cambios: string[] }
  | { tipo: 'igual'; fila: FilaAronium; producto: Producto }
  | { tipo: 'parecido'; fila: FilaAronium; candidatos: Producto[] };

export interface PlanImportacion {
  acciones: Accion[];
  /** Renglones con un código que ya salió antes en el mismo archivo (se omiten). */
  repetidos: FilaAronium[];
  negativos: number;
  /** Renglones con el código dañado por Excel (se importan sin código). */
  danados: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Qué cambiaría en un producto que ya existe (precio, existencia, mínimo). */
export function cambiosDe(fila: FilaAronium, p: Producto): string[] {
  const c: string[] = [];
  if (r2(p.precioEtiqueta) !== r2(fila.precio)) c.push(`precio $${p.precioEtiqueta} → $${fila.precio}`);
  if (!p.servicio && p.variantes.length === 1 && p.variantes[0].stock !== fila.cantidad) c.push(`existencia ${p.variantes[0].stock} → ${fila.cantidad}`);
  if (fila.stockMinimo !== null && (p.stockMinimo ?? null) !== fila.stockMinimo) c.push(`mínimo ${p.stockMinimo ?? '—'} → ${fila.stockMinimo}`);
  const g = datosDeGrupo(fila.grupo);
  if (!!p.noComisionable !== g.noComisionable) c.push(g.noComisionable ? 'no comisionable' : 'sí comisionable');
  if (!!p.servicio !== (g.servicio || fila.servicio)) c.push(g.servicio || fila.servicio ? 'servicio' : 'con existencia');
  return c;
}

/**
 * Compara el archivo con los productos de BRILLO. Los productos sin código
 * se comparan por nombre exacto (así, volver a subir el archivo no los duplica).
 */
export function planear(filas: FilaAronium[], productos: Producto[]): PlanImportacion {
  const porCodigo = new Map<string, Producto>();
  const porComparable = new Map<string, Producto[]>();
  const porNombre = new Map<string, Producto>();
  for (const p of productos) {
    // Un parecido que ya se confirmó como el mismo se reconoce por su código de Aronium.
    if (p.codigoAronium) porCodigo.set(p.codigoAronium.trim(), p);
    if (p.codigo) {
      if (!porCodigo.has(p.codigo.trim())) porCodigo.set(p.codigo.trim(), p);
      const k = codigoComparable(p.codigo);
      if (k) porComparable.set(k, [...(porComparable.get(k) ?? []), p]);
    } else porNombre.set(sinAcentos(p.nombre).trim().toUpperCase(), p);
  }
  const vistos = new Set<string>();
  const acciones: Accion[] = [];
  const repetidos: FilaAronium[] = [];
  let negativos = 0;
  let danados = 0;
  for (const fila of filas) {
    if (fila.cantidadOriginal < 0) negativos++;
    if (fila.codigoDanado) danados++;
    const clave = fila.codigo ? `c:${fila.codigo}` : `n:${sinAcentos(fila.nombre).toUpperCase()}`;
    if (vistos.has(clave)) { repetidos.push(fila); continue; }
    vistos.add(clave);
    const exacto = fila.codigo ? porCodigo.get(fila.codigo) : porNombre.get(sinAcentos(fila.nombre).trim().toUpperCase());
    if (exacto) {
      const cambios = cambiosDe(fila, exacto);
      acciones.push(cambios.length ? { tipo: 'actualizar', fila, producto: exacto, cambios } : { tipo: 'igual', fila, producto: exacto });
      continue;
    }
    const candidatos = fila.codigo ? porComparable.get(codigoComparable(fila.codigo)) ?? [] : [];
    acciones.push(candidatos.length ? { tipo: 'parecido', fila, candidatos } : { tipo: 'nuevo', fila });
  }
  return { acciones, repetidos, negativos, danados };
}

/** Documento nuevo de `productos` para una fila (solo tienda: no sale en el catálogo). */
export function productoNuevo(id: string, varianteId: string, fila: FilaAronium, fecha: string, empleado: string, origen: string): Record<string, unknown> {
  const g = datosDeGrupo(fila.grupo);
  const servicio = g.servicio || fila.servicio;
  return {
    id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    material: g.material,
    categoria: g.categoria,
    ...(g.subcategoria ? { subcategoria: g.subcategoria } : {}),
    calidad: '',
    codigo: fila.codigo,
    colorOro: '',
    variantes: [{ id: varianteId, color: '', talla: '', stock: servicio ? 0 : fila.cantidad, fotoId: null }],
    precioEtiqueta: fila.precio,
    descuento: g.descuento,
    disponible: !servicio && fila.cantidad > 0,
    mostrarEnCatalogo: false,
    ...(fila.stockMinimo !== null ? { stockMinimo: fila.stockMinimo } : {}),
    ...(servicio ? { servicio: true } : {}),
    ...(g.noComisionable ? { noComisionable: true } : {}),
    galeria: [],
    imagen: '',
    // Sin fotos todavía: así las listas no intentan descargarlas.
    fotosIds: [],
    fechaAlta: fecha,
    grupoAronium: fila.grupo,
    ultimaAccion: { tipo: 'Agregado', empleado, fecha, origen }
  };
}

/**
 * Campos que cambian en un producto que ya existe. Nombre, fotos, material,
 * categoría y "mostrar en catálogo" se quedan como están en BRILLO
 * (material, categoría y descuento solo se llenan si estaban vacíos).
 */
export function cambiosProducto(actual: Record<string, unknown>, fila: FilaAronium, fecha: string, empleado: string, origen: string): Record<string, unknown> {
  const g = datosDeGrupo(fila.grupo);
  const servicio = g.servicio || fila.servicio;
  const variantes = Array.isArray(actual.variantes) ? (actual.variantes as Record<string, unknown>[]) : [];
  const cambio: Record<string, unknown> = {
    precioEtiqueta: fila.precio,
    grupoAronium: fila.grupo,
    // Si el código de Aronium no es idéntico (parecido confirmado), se recuerda para la próxima importación.
    ...(fila.codigo && fila.codigo !== String(actual.codigo ?? '').trim() ? { codigoAronium: fila.codigo } : {}),
    servicio,
    noComisionable: g.noComisionable,
    ultimaAccion: { tipo: 'Editado', empleado, fecha, origen }
  };
  // La existencia solo se toca si el producto tiene una sola variante (como en Aronium).
  if (variantes.length === 1 && !servicio) {
    cambio.variantes = [{ ...variantes[0], stock: fila.cantidad }];
    cambio.disponible = fila.cantidad > 0;
  }
  if (fila.stockMinimo !== null) cambio.stockMinimo = fila.stockMinimo;
  if (!actual.material) cambio.material = g.material;
  if (!actual.categoria && g.categoria) cambio.categoria = g.categoria;
  if (!Number(actual.descuento) && g.descuento) cambio.descuento = g.descuento;
  return cambio;
}
