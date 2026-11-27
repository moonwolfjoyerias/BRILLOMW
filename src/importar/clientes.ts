// Importar los clientes de Aronium (CSV: Name, Code, TaxNumber,
// AdditionalStreetName, PlotIdentification, Email, Phone…). Puro, para
// probarlo; la escritura está en importar/aplicarClientes.ts.
//
// Reglas acordadas con Admin:
// - Todas son emprendedoras/líderes. Se reconocen con las de BRILLO por su
//   número de cliente de Aronium, su teléfono o su nombre completo; las
//   demás se dan de alta (sin cuenta: las cuentas se crean después).
// - TaxNumber ("MW25…") es solo una etiqueta para buscarla (ya no es su usuario).
// - PlotIdentification = fecha de nacimiento.
// - AdditionalStreetName = quién la invitó (nombre o número de cliente). En
//   el árbol de mi-equipo queda debajo de quien la invitó; su líder del
//   portal es la primera líder hacia arriba. Sin nadie → Celia Escamilla.
import { leerCsv } from './aronium';
import { normalizarNombre, nuevoId, type Miembro } from '../arbol/modelo';
import type { PersonaAdmin } from '../personas/modelo';

export interface FilaCliente {
  renglon: number;
  nombre: string;
  /** Número de cliente de Aronium (su tarjeta). */
  codigo: string;
  /** Código MW de Aronium (TaxNumber), solo como etiqueta. */
  etiquetaMW: string;
  /** Quién la invitó, tal como viene. */
  invito: string;
  fechaNacimiento: string;
  fechaNacimientoTexto: string;
  telefono: string;
  correo: string;
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

/** Fecha de nacimiento en AAAA-MM-DD si se puede leer con año ("5/09/86", "12/MAY/90", "3/4/1985"); si no, ''. */
export function leerFechaNacimiento(t: string, hoy = new Date()): string {
  const s = t.trim().toLowerCase();
  const m = /^(\d{1,2})\s*[/.\- ]\s*(?:de\s+)?([a-z]+|\d{1,2})\s*[/.\- ]\s*(?:de\s+)?(\d{2}|\d{4})$/.exec(s);
  if (!m) return '';
  const dia = Number(m[1]);
  const mes = /^\d+$/.test(m[2]) ? Number(m[2]) : MESES[m[2].slice(0, 3)] ?? 0;
  let anio = Number(m[3]);
  if (m[3].length === 2) anio += anio > hoy.getFullYear() % 100 ? 1900 : 2000;
  if (!mes || mes > 12 || !dia || dia > 31 || anio < 1920 || anio > hoy.getFullYear()) return '';
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCMonth() !== mes - 1) return '';
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export const soloDigitos = (s: string) => s.replace(/\D/g, '');
/** Teléfono para comparar: los últimos 10 dígitos (sin lada de país). */
export const telefonoComparable = (s: string) => { const d = soloDigitos(s); return d.length >= 10 ? d.slice(-10) : ''; };

export function leerClientes(texto: string): { filas: FilaCliente[] } | { error: string } {
  const tabla = leerCsv(texto);
  if (!tabla.length) return { error: 'El archivo está vacío.' };
  const cab = tabla[0].map(h => h.trim().toLowerCase());
  const col = (n: string) => cab.indexOf(n.toLowerCase());
  if (col('Name') < 0 || col('Code') < 0 || col('AdditionalStreetName') < 0) {
    return { error: 'Este archivo no parece la lista de clientes de Aronium (faltan las columnas Name, Code o AdditionalStreetName).' };
  }
  const dato = (f: string[], n: string) => { const i = col(n); return i < 0 ? '' : String(f[i] ?? '').trim(); };
  const filas: FilaCliente[] = [];
  tabla.slice(1).forEach((f, i) => {
    const nombre = dato(f, 'Name').replace(/\s+/g, ' ');
    if (!nombre) return;
    const tax = dato(f, 'TaxNumber').toUpperCase();
    const fecha = dato(f, 'PlotIdentification');
    filas.push({
      renglon: i + 1,
      nombre,
      codigo: dato(f, 'Code'),
      etiquetaMW: /^MW\d/.test(tax) ? tax : '',
      invito: dato(f, 'AdditionalStreetName'),
      fechaNacimiento: leerFechaNacimiento(fecha),
      fechaNacimientoTexto: fecha,
      telefono: dato(f, 'Phone'),
      correo: /@/.test(dato(f, 'Email')) ? dato(f, 'Email') : ''
    });
  });
  return { filas };
}

const nombrePersona = (p: Pick<PersonaAdmin, 'nombre' | 'apellidos'>) => normalizarNombre(`${p.nombre} ${p.apellidos}`);
const codigosAronium = (p: PersonaAdmin) => (Array.isArray(p.crudo.aroniumClienteIds) ? (p.crudo.aroniumClienteIds as unknown[]).map(String) : []);

/** Separa "Nombre Apellido Apellido" como lo hace la página: la primera palabra es el nombre. */
export function partirNombre(completo: string): { nombre: string; apellidos: string } {
  const partes = completo.trim().split(/\s+/);
  return { nombre: partes[0] ?? '', apellidos: partes.slice(1).join(' ') };
}

export interface Cliente {
  fila: FilaCliente;
  /** Persona de BRILLO que ya existe, o null si se da de alta. */
  persona: PersonaAdmin | null;
  como: 'aronium' | 'telefono' | 'nombre' | null;
  /** Índice (en `clientes`) de quien la invitó, o null. */
  invitoIdx: number | null;
  /** Quien la invitó es una persona de BRILLO que no viene en el archivo. */
  invitoPersona: PersonaAdmin | null;
}

export interface PlanClientes {
  clientes: Cliente[];
  /** Celia Escamilla (para quien no tiene a nadie arriba). */
  celia: { idx: number | null; persona: PersonaAdmin | null } | null;
  /** Renglones con "invitó" que no se encontró (van con Celia). */
  invitoSinEncontrar: number;
}

const esCelia = (n: string) => /\bcelia\b/.test(n) && /\bescamilla\b/.test(n);

export function planearClientes(filas: FilaCliente[], personas: PersonaAdmin[]): PlanClientes {
  const tomadas = new Set<string>();
  const unica = (lista: PersonaAdmin[]) => {
    const libres = lista.filter(p => !tomadas.has(p.id));
    return libres.length === 1 ? libres[0] : null;
  };
  const clientes: Cliente[] = filas.map(fila => {
    const n = normalizarNombre(fila.nombre);
    const tel = telefonoComparable(fila.telefono);
    let persona: PersonaAdmin | null = null;
    let como: Cliente['como'] = null;
    if (fila.codigo) { persona = unica(personas.filter(p => codigosAronium(p).includes(fila.codigo))); if (persona) como = 'aronium'; }
    if (!persona && tel) { persona = unica(personas.filter(p => telefonoComparable(p.telefono) === tel && nombrePersona(p).split(' ')[0] === n.split(' ')[0])); if (persona) como = 'telefono'; }
    if (!persona && n) { persona = unica(personas.filter(p => nombrePersona(p) === n)); if (persona) como = 'nombre'; }
    if (persona) tomadas.add(persona.id);
    return { fila, persona, como, invitoIdx: null, invitoPersona: null };
  });

  const porNombre = new Map<string, number[]>();
  const porCodigo = new Map<string, number>();
  clientes.forEach((c, i) => {
    const n = normalizarNombre(c.fila.nombre);
    porNombre.set(n, [...(porNombre.get(n) ?? []), i]);
    if (c.fila.codigo) porCodigo.set(c.fila.codigo, i);
  });
  let invitoSinEncontrar = 0;
  clientes.forEach((c, i) => {
    const t = c.fila.invito;
    if (!t) return;
    const n = normalizarNombre(t);
    const enArchivo = porCodigo.get(t) ?? ((porNombre.get(n) ?? []).length === 1 ? porNombre.get(n)![0] : undefined);
    if (enArchivo !== undefined && enArchivo !== i) { c.invitoIdx = enArchivo; return; }
    const p = personas.filter(x => nombrePersona(x) === n);
    if (p.length === 1 && p[0].id !== c.persona?.id) { c.invitoPersona = p[0]; return; }
    invitoSinEncontrar++;
  });

  const idxCelia = clientes.findIndex(c => esCelia(normalizarNombre(c.fila.nombre)));
  const personaCelia = personas.find(p => esCelia(nombrePersona(p))) ?? null;
  const celia = idxCelia >= 0 || personaCelia ? { idx: idxCelia >= 0 ? idxCelia : null, persona: idxCelia >= 0 ? clientes[idxCelia].persona ?? personaCelia : personaCelia } : null;
  return { clientes, celia, invitoSinEncontrar };
}

/**
 * Ids de persona de cada cliente (las nuevas reciben el que se les dará) y
 * quién la invitó (id de persona), con Celia por omisión. Sin ciclos.
 */
export function invitadoras(plan: PlanClientes, ids: string[]): (string | null)[] {
  const celiaId = plan.celia ? (plan.celia.idx !== null ? ids[plan.celia.idx] : plan.celia.persona?.id ?? null) : null;
  return plan.clientes.map((c, i) => {
    const inv = c.invitoIdx !== null ? ids[c.invitoIdx] : c.invitoPersona?.id ?? null;
    const id = ids[i];
    if (inv && inv !== id) return inv;
    return celiaId && celiaId !== id ? celiaId : null;
  });
}

/** Su líder del portal: la primera líder hacia arriba en la cadena de invitación (o Celia). */
export function lideresPortal(
  ids: string[],
  invito: (string | null)[],
  tipoDe: (id: string) => 'lider' | 'emprendedora',
  invitoDeFuera: (id: string) => string | null,
  celiaId: string | null
): (string | null)[] {
  const arriba = new Map<string, string | null>();
  ids.forEach((id, i) => arriba.set(id, invito[i]));
  return ids.map(id => {
    const vistos = new Set([id]);
    let actual = arriba.has(id) ? arriba.get(id)! : invitoDeFuera(id);
    while (actual && !vistos.has(actual)) {
      if (tipoDe(actual) === 'lider') return actual;
      vistos.add(actual);
      actual = arriba.has(actual) ? arriba.get(actual)! : invitoDeFuera(actual);
    }
    return celiaId && celiaId !== id ? celiaId : null;
  });
}

export interface CambiosArbol { nuevos: number; vinculados: number; cambianLider: number; ciclos: number }

/**
 * Pone a cada clienta en el árbol de mi-equipo, debajo de quien la invitó.
 * Cambia la lista que recibe. `personas`: id de persona, nombre, etiqueta MW,
 * número de Aronium e id de persona de quien la invitó.
 */
export function acomodarEnArbol(
  miembros: Miembro[],
  personas: { personaId: string; nombre: string; etiquetaMW: string; codigo: string; invitoId: string | null; invitoNombre?: string }[],
  hoy: string
): CambiosArbol {
  const r: CambiosArbol = { nuevos: 0, vinculados: 0, cambianLider: 0, ciclos: 0 };
  const deMiembro = new Map<string, Miembro>();
  const usados = new Set<string>();
  for (const p of personas) {
    let m = miembros.find(x => x.portalPersonaId === p.personaId);
    const libres = miembros.filter(x => !x.portalPersonaId && !usados.has(x.id));
    if (!m && p.etiquetaMW) { const c = libres.filter(x => String(x.clientCode ?? '').trim().toUpperCase() === p.etiquetaMW); if (c.length === 1) m = c[0]; }
    if (!m) { const c = libres.filter(x => normalizarNombre(x.fullName) === normalizarNombre(p.nombre)); if (c.length === 1) m = c[0]; }
    if (m) {
      if (!m.portalPersonaId) { m.portalPersonaId = p.personaId; r.vinculados++; }
    } else {
      m = { id: nuevoId(), fullName: p.nombre, clientCode: p.etiquetaMW || null, ticketNumber: p.codigo || 'Aronium', leaderId: null, joinedAt: hoy, firstPurchaseAt: null, portalPersonaId: p.personaId };
      miembros.push(m);
      r.nuevos++;
    }
    usados.add(m.id);
    deMiembro.set(p.personaId, m);
  }
  const porId = new Map(miembros.map(m => [m.id, m]));
  const subeA = (desde: string | null | undefined, buscado: string) => {
    const vistos = new Set<string>();
    let a = desde;
    while (a && !vistos.has(a)) { if (a === buscado) return true; vistos.add(a); a = porId.get(a)?.leaderId ?? null; }
    return false;
  };
  for (const p of personas) {
    const m = deMiembro.get(p.personaId)!;
    const porNombre = () => { const c = p.invitoNombre ? miembros.filter(x => normalizarNombre(x.fullName) === normalizarNombre(p.invitoNombre)) : []; return c.length === 1 ? c[0] : undefined; };
    const lider = p.invitoId ? deMiembro.get(p.invitoId) ?? miembros.find(x => x.portalPersonaId === p.invitoId) ?? porNombre() : undefined;
    if (!lider || lider.id === m.leaderId) continue;
    if (subeA(lider.id, m.id)) { r.ciclos++; continue; }
    m.leaderId = lider.id;
    r.cambianLider++;
  }
  return r;
}
