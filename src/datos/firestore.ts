// Única puerta de BRILLO a Firestore. Todo el código importa de aquí, nunca
// de 'firebase/firestore' directo (lo revisa datos/puerta.test.ts).
//
// En la app normal son las funciones de Firebase, tal cual.
//
// En BRILLO PILOTO (ver piloto.ts) se lee lo real, pero cada escritura
// (setDoc, updateDoc, transacciones, lotes…) se queda en una capa en memoria
// encima de los datos reales: las pantallas la ven como si se hubiera
// guardado (baja el inventario, sale el folio, aparece en las listas), pero
// a Firebase no llega nada. Al recargar la página se borra.
import * as F from 'firebase/firestore';
import { PILOTO } from '../piloto';

export type {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
  QueryConstraint,
  QuerySnapshot,
  Transaction,
  Unsubscribe,
  WriteBatch
} from 'firebase/firestore';
export { Timestamp } from 'firebase/firestore';

type Datos = Record<string, unknown>;
type Ref = F.DocumentReference;
type Consulta = F.Query | F.CollectionReference;

// ------------------------------------------------------------ capa en memoria (solo piloto)

/** ruta del documento → datos (null = se borró en la práctica). */
const capa = new Map<string, Datos | null>();
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(f => f());

/** Avisa cada vez que cambia algo en la práctica (para la franja del piloto). */
export function alCambiarPractica(f: () => void): () => void {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

/** Cuántos documentos se han "guardado" en esta práctica. */
export const cambiosDePractica = () => capa.size;

/** Borra todo lo hecho en la práctica y vuelve a los datos reales. */
export function reiniciarPractica() {
  capa.clear();
  avisar();
}

const esPlano = (v: unknown): v is Datos => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/** Copia profunda que conserva Timestamps y demás objetos de Firebase. */
function copia<T>(v: T): T {
  if (Array.isArray(v)) return v.map(copia) as T;
  if (esPlano(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copia(x)])) as T;
  return v;
}

function campo(d: Datos, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Datos)[k] : undefined), d);
}

/** Aplica cambios (con "a.b" como ruta anidada) sobre una copia de los datos. */
function aplicar(base: Datos, cambios: Datos, mezclar: boolean): Datos {
  const out = copia(base);
  for (const [k, v] of Object.entries(cambios)) {
    const partes = k.split('.');
    let o = out;
    for (const p of partes.slice(0, -1)) {
      if (!esPlano(o[p])) o[p] = {};
      o = o[p] as Datos;
    }
    const ult = partes[partes.length - 1];
    if ((v as unknown) === BORRAR) {
      delete o[ult];
      continue;
    }
    o[ult] = mezclar && esPlano(v) && esPlano(o[ult]) ? aplicar(o[ult] as Datos, v, true) : copia(v);
  }
  return out;
}

const metaLocal = { fromCache: true, hasPendingWrites: false, isEqual: () => false } as unknown as F.SnapshotMetadata;

/** Documento de la práctica con la misma forma que el de Firebase. */
function snapDoc(ref: Ref, datos: Datos | null | undefined, metadata = metaLocal): F.QueryDocumentSnapshot {
  return {
    id: ref.id,
    ref,
    metadata,
    exists: () => datos != null,
    data: () => (datos != null ? copia(datos) : undefined),
    get: (c: string) => (datos != null ? campo(datos, c) : undefined)
  } as unknown as F.QueryDocumentSnapshot;
}

async function datosActuales(ref: Ref): Promise<Datos | null> {
  if (capa.has(ref.path)) return capa.get(ref.path) ?? null;
  const s = await F.getDoc(ref);
  return s.exists() ? s.data() : null;
}

// Filtros de las consultas: se recuerdan para aplicarlos a lo de la práctica.
interface Filtro { tipo: 'where'; campo: string; op: F.WhereFilterOp; valor: unknown }
interface Orden { tipo: 'orderBy'; campo: string; dir: 'asc' | 'desc' }
interface Limite { tipo: 'limit'; n: number }
type Restriccion = Filtro | Orden | Limite;
const RESTR = Symbol('piloto');
const RUTA = Symbol('piloto-ruta');
const restricciones = (q: Consulta): Restriccion[] => ((q as unknown as Record<symbol, Restriccion[]>)[RESTR] ?? []);
/** Ruta de la colección: la de la referencia, o la que se guardó al armar la consulta. */
const rutaColeccion = (q: Consulta): string => (q instanceof F.CollectionReference ? q.path : (q as unknown as Record<symbol, string>)[RUTA]);
const coleccionDe = (ruta: string) => ruta.split('/').slice(0, -1).join('/');

function cumple(d: Datos, f: Filtro): boolean {
  const v = campo(d, f.campo) as never;
  const x = f.valor as never;
  switch (f.op) {
    case '==': return v === x;
    case '!=': return v !== x;
    case '<': return v < x;
    case '<=': return v <= x;
    case '>': return v > x;
    case '>=': return v >= x;
    case 'in': return (x as unknown[]).includes(v);
    case 'not-in': return !(x as unknown[]).includes(v);
    case 'array-contains': return Array.isArray(v) && (v as unknown[]).includes(x);
    case 'array-contains-any': return Array.isArray(v) && (v as unknown[]).some(e => (x as unknown[]).includes(e));
    default: return true;
  }
}

/** Resultado real + lo hecho en la práctica, con los mismos filtros, orden y límite. */
function mezclar(q: Consulta, reales: F.QueryDocumentSnapshot[], metadata: F.SnapshotMetadata): F.QuerySnapshot {
  const ruta = rutaColeccion(q);
  const rs = restricciones(q);
  const filtros = rs.filter((r): r is Filtro => r.tipo === 'where');
  let docs: F.QueryDocumentSnapshot[] = reales.filter(s => !capa.has(s.ref.path));
  capa.forEach((d, p) => {
    if (d && coleccionDe(p) === ruta && filtros.every(f => cumple(d, f))) docs.push(snapDoc(F.doc(q.firestore, p), d));
  });
  const ordenes = rs.filter((r): r is Orden => r.tipo === 'orderBy');
  if (ordenes.length) {
    docs = [...docs].sort((a, b) => {
      for (const o of ordenes) {
        const x = campo(a.data(), o.campo) as never, y = campo(b.data(), o.campo) as never;
        if (x !== y) return (x < y ? -1 : 1) * (o.dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }
  const lim = rs.find((r): r is Limite => r.tipo === 'limit');
  if (lim) docs = docs.slice(0, lim.n);
  return { docs, size: docs.length, empty: !docs.length, metadata, query: q, forEach: (cb: (d: F.QueryDocumentSnapshot) => void) => docs.forEach(cb), docChanges: () => [] } as unknown as F.QuerySnapshot;
}

// ------------------------------------------------------------ funciones de lectura

export const collection = F.collection;
export const doc = F.doc;

export const where: typeof F.where = PILOTO
  ? (((c: string, op: F.WhereFilterOp, valor: unknown) => Object.assign(F.where(c, op, valor), { [RESTR]: { tipo: 'where', campo: c, op, valor } })) as typeof F.where)
  : F.where;
export const orderBy: typeof F.orderBy = PILOTO
  ? (((c: string, dir: 'asc' | 'desc' = 'asc') => Object.assign(F.orderBy(c, dir), { [RESTR]: { tipo: 'orderBy', campo: c, dir } })) as typeof F.orderBy)
  : F.orderBy;
export const limit: typeof F.limit = PILOTO ? (((n: number) => Object.assign(F.limit(n), { [RESTR]: { tipo: 'limit', n } })) as typeof F.limit) : F.limit;

export const query: typeof F.query = PILOTO
  ? (((base: Consulta, ...cs: F.QueryConstraint[]) => {
      const q = F.query(base, ...cs);
      const previas = restricciones(base);
      const nuevas = cs.map(c => (c as unknown as Record<symbol, Restriccion>)[RESTR]).filter(Boolean);
      return Object.assign(q, { [RESTR]: [...previas, ...nuevas], [RUTA]: rutaColeccion(base) });
    }) as unknown as typeof F.query)
  : F.query;

export const getDoc: typeof F.getDoc = PILOTO
  ? (((ref: Ref) => (capa.has(ref.path) ? Promise.resolve(snapDoc(ref, capa.get(ref.path))) : F.getDoc(ref))) as typeof F.getDoc)
  : F.getDoc;

export const getDocs: typeof F.getDocs = PILOTO
  ? ((async (q: Consulta) => {
      const s = await F.getDocs(q);
      return mezclar(q, s.docs, s.metadata);
    }) as typeof F.getDocs)
  : F.getDocs;

/** onSnapshot(ref | consulta, [opciones], siguiente, [error]) con lo de la práctica encima. */
export const onSnapshot: typeof F.onSnapshot = PILOTO
  ? (((objetivo: Ref | Consulta, ...args: unknown[]) => {
      const opciones = typeof args[0] === 'object' && args[0] !== null && typeof args[0] !== 'function' ? (args.shift() as F.SnapshotListenOptions) : {};
      const siguiente = args[0] as (s: unknown) => void;
      const error = args[1] as ((e: F.FirestoreError) => void) | undefined;
      const esDoc = objetivo instanceof F.DocumentReference;
      let ultimo: F.DocumentSnapshot | F.QuerySnapshot | null = null;
      const emitir = () => {
        if (!ultimo) return;
        if (esDoc) {
          const ref = objetivo as Ref;
          siguiente(capa.has(ref.path) ? snapDoc(ref, capa.get(ref.path), ultimo.metadata) : ultimo);
        } else {
          siguiente(mezclar(objetivo as Consulta, (ultimo as F.QuerySnapshot).docs, ultimo.metadata));
        }
      };
      oyentes.add(emitir);
      const cortar = F.onSnapshot(
        objetivo as F.Query,
        opciones,
        (s: F.DocumentSnapshot | F.QuerySnapshot) => {
          ultimo = s;
          emitir();
        },
        error
      );
      return () => {
        oyentes.delete(emitir);
        cortar();
      };
    }) as unknown as typeof F.onSnapshot)
  : F.onSnapshot;

// ------------------------------------------------------------ escrituras

/** "Borrar este campo": en la práctica, una marca que aplicar() entiende. */
const BORRAR = Symbol('piloto-borrar');
export const deleteField: typeof F.deleteField = PILOTO ? ((() => BORRAR) as unknown as typeof F.deleteField) : F.deleteField;

/** Valor de "hora del servidor": en la práctica, la hora del equipo. */
export const serverTimestamp: typeof F.serverTimestamp = PILOTO ? ((() => F.Timestamp.now()) as unknown as typeof F.serverTimestamp) : F.serverTimestamp;

type Operacion =
  | { tipo: 'set'; ref: Ref; datos: Datos; mezclar: boolean }
  | { tipo: 'update'; ref: Ref; datos: Datos }
  | { tipo: 'delete'; ref: Ref };

/** Aplica operaciones a la capa (todas o ninguna), como una transacción. */
async function aplicarOperaciones(ops: Operacion[]) {
  const nuevo = new Map<string, Datos | null>();
  const actual = async (ref: Ref) => (nuevo.has(ref.path) ? nuevo.get(ref.path)! : await datosActuales(ref));
  for (const op of ops) {
    if (op.tipo === 'delete') nuevo.set(op.ref.path, null);
    else if (op.tipo === 'set') nuevo.set(op.ref.path, op.mezclar ? aplicar((await actual(op.ref)) ?? {}, op.datos, true) : aplicar({}, op.datos, false));
    else {
      const base = await actual(op.ref);
      if (!base) throw new Error(`No existe ${op.ref.path}`);
      nuevo.set(op.ref.path, aplicar(base, op.datos, false));
    }
  }
  nuevo.forEach((d, p) => capa.set(p, d));
  avisar();
}

const opSet = (ref: Ref, datos: unknown, o?: F.SetOptions): Operacion => ({ tipo: 'set', ref, datos: datos as Datos, mezclar: !!(o && 'merge' in o && o.merge) });

export const setDoc: typeof F.setDoc = PILOTO
  ? (((ref: Ref, datos: unknown, o?: F.SetOptions) => aplicarOperaciones([opSet(ref, datos, o)])) as typeof F.setDoc)
  : F.setDoc;
export const updateDoc: typeof F.updateDoc = PILOTO
  ? (((ref: Ref, datos: Datos) => aplicarOperaciones([{ tipo: 'update', ref, datos }])) as unknown as typeof F.updateDoc)
  : F.updateDoc;
export const deleteDoc: typeof F.deleteDoc = PILOTO ? (((ref: Ref) => aplicarOperaciones([{ tipo: 'delete', ref }])) as typeof F.deleteDoc) : F.deleteDoc;
export const addDoc: typeof F.addDoc = PILOTO
  ? ((async (c: F.CollectionReference, datos: unknown) => {
      const ref = F.doc(c);
      await aplicarOperaciones([opSet(ref, datos)]);
      return ref;
    }) as typeof F.addDoc)
  : F.addDoc;

export const runTransaction: typeof F.runTransaction = PILOTO
  ? ((async <T,>(_db: F.Firestore, fn: (tx: F.Transaction) => Promise<T>) => {
      const ops: Operacion[] = [];
      const tx = {
        get: async (ref: Ref) => snapDoc(ref, await datosActuales(ref)),
        set(ref: Ref, datos: unknown, o?: F.SetOptions) { ops.push(opSet(ref, datos, o)); return tx; },
        update(ref: Ref, datos: Datos) { ops.push({ tipo: 'update', ref, datos }); return tx; },
        delete(ref: Ref) { ops.push({ tipo: 'delete', ref }); return tx; }
      };
      const r = await fn(tx as unknown as F.Transaction);
      await aplicarOperaciones(ops);
      return r;
    }) as typeof F.runTransaction)
  : F.runTransaction;

export const writeBatch: typeof F.writeBatch = PILOTO
  ? (((_db: F.Firestore) => {
      const ops: Operacion[] = [];
      const lote = {
        set(ref: Ref, datos: unknown, o?: F.SetOptions) { ops.push(opSet(ref, datos, o)); return lote; },
        update(ref: Ref, datos: Datos) { ops.push({ tipo: 'update', ref, datos }); return lote; },
        delete(ref: Ref) { ops.push({ tipo: 'delete', ref }); return lote; },
        commit: () => aplicarOperaciones(ops)
      };
      return lote;
    }) as unknown as typeof F.writeBatch)
  : F.writeBatch;
