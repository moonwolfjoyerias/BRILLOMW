// Escribe la importación de clientes de Aronium: personas (y su parte
// financiera las nuevas) en lotes, el árbol de mi-equipo en una transacción
// y un registro en Actividad. Las cuentas (usuario y contraseña) se crean
// después, una por una, con crearCuentasFaltantes().
import { doc, runTransaction, setDoc, writeBatch, type Firestore } from '../datos/firestore';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { armarPersonaNueva, generarCredenciales } from '../solicitudes/modelo';
import { perfilUsuarioPersona, type PersonaAdmin } from '../personas/modelo';
import { UsuarioOcupado, type CrearAcceso } from '../sesion/crearAcceso';
import { cambiarArbol } from '../arbol/acciones';
import type { Miembro } from '../arbol/modelo';
import type { PerfilUsuario } from '../sesion/perfil';
import { acomodarEnArbol, invitadoras, lideresPortal, partirNombre, type CambiosArbol, type PlanClientes } from './clientes';

type Doc = Record<string, unknown>;

export interface Preparado {
  ids: string[];
  invito: (string | null)[];
  lider: (string | null)[];
  /** Cambios por persona que ya existe (solo los campos que cambian). */
  cambios: Map<string, Doc>;
  /** Personas existentes a las que les cambia la líder del portal. */
  cambianLider: number;
  arbol: CambiosArbol;
  /** Nombre de cada persona de BRILLO (para hallar en el árbol a quien la invitó). */
  nombres: Map<string, string>;
}

/** Calcula todo lo que se va a escribir (también sirve para la vista previa). */
export function preparar(plan: PlanClientes, personas: PersonaAdmin[], miembros: Miembro[], ahora = new Date()): Preparado {
  const ids = plan.clientes.map((c, i) => c.persona?.id ?? `persona-${ahora.getTime() + i}`);
  const invito = invitadoras(plan, ids);
  const porId = new Map(personas.map(p => [p.id, p]));
  const celiaId = plan.celia ? (plan.celia.idx !== null ? ids[plan.celia.idx] : plan.celia.persona?.id ?? null) : null;
  const lider = lideresPortal(ids, invito, id => (porId.get(id)?.tipo === 'lider' ? 'lider' : 'emprendedora'), id => porId.get(id)?.invitadaPor ?? null, celiaId);
  const cambios = new Map<string, Doc>();
  let cambianLider = 0;
  plan.clientes.forEach((c, i) => {
    const p = c.persona;
    if (!p) return;
    const f = c.fila;
    const cr = p.crudo;
    const d: Doc = {};
    const actuales = Array.isArray(cr.aroniumClienteIds) ? (cr.aroniumClienteIds as unknown[]).map(String) : [];
    if (f.codigo && !actuales.includes(f.codigo)) d.aroniumClienteIds = [...actuales, f.codigo];
    if (f.etiquetaMW && cr.etiquetaMW !== f.etiquetaMW) d.etiquetaMW = f.etiquetaMW;
    if (!p.telefono && f.telefono) d.telefono = f.telefono;
    if (!p.correo && f.correo) d.correo = f.correo;
    if (!cr.fechaNacimiento && f.fechaNacimiento) d.fechaNacimiento = f.fechaNacimiento;
    if (!cr.fechaNacimientoTexto && f.fechaNacimientoTexto) d.fechaNacimientoTexto = f.fechaNacimientoTexto;
    if (invito[i] && p.invitadaPor !== invito[i]) d.invitadaPor = invito[i];
    if (lider[i] && p.liderId !== lider[i]) { d.liderId = lider[i]; cambianLider++; }
    if (Object.keys(d).length) cambios.set(p.id, d);
  });
  const copia = miembros.map(m => ({ ...m }));
  const nombres = new Map<string, string>(personas.map(p => [p.id, `${p.nombre} ${p.apellidos}`]));
  const arbol = acomodarEnArbol(copia, datosArbol(plan, ids, invito, nombres), ahora.toISOString().slice(0, 10));
  return { ids, invito, lider, cambios, cambianLider, arbol, nombres };
}

const datosArbol = (plan: PlanClientes, ids: string[], invito: (string | null)[], nombres: Map<string, string>) =>
  plan.clientes.map((c, i) => ({ personaId: ids[i], nombre: c.fila.nombre, etiquetaMW: c.fila.etiquetaMW, codigo: c.fila.codigo, invitoId: invito[i], invitoNombre: invito[i] ? nombres.get(invito[i]!) : undefined }));

const POR_LOTE = 200;

export async function aplicarClientes(
  db: Firestore,
  dbEquipo: Firestore,
  plan: PlanClientes,
  listo: Preparado,
  perfil: PerfilUsuario,
  equipo: string,
  alAvanzar: (hechos: number, total: number) => void = () => {}
): Promise<{ ok: true; nuevas: number; actualizadas: number; arbol: string | null } | { ok: false; error: string }> {
  const ahora = new Date();
  type Escritura = { id: string; nuevo: Doc | null; financiero: Doc | null; cambio: Doc | null };
  const escrituras: Escritura[] = [];
  plan.clientes.forEach((c, i) => {
    const id = listo.ids[i];
    if (c.persona) {
      const cambio = listo.cambios.get(id);
      if (cambio) escrituras.push({ id, nuevo: null, financiero: null, cambio });
      return;
    }
    const f = c.fila;
    const { nombre, apellidos } = partirNombre(f.nombre);
    const { persona, financiero } = armarPersonaNueva(
      { nombre, apellidos, tipo: 'emprendedora', categoria: 'normal', viveEnSLP: null, telefono: f.telefono, correo: f.correo, liderId: listo.lider[i], invitadaPor: listo.invito[i] },
      { usuario: '', numeroCuenta: '' },
      null,
      ahora
    );
    escrituras.push({
      id,
      nuevo: {
        ...persona,
        id,
        ...(f.codigo ? { aroniumClienteIds: [f.codigo] } : {}),
        ...(f.etiquetaMW ? { etiquetaMW: f.etiquetaMW } : {}),
        ...(f.fechaNacimiento ? { fechaNacimiento: f.fechaNacimiento } : {}),
        ...(f.fechaNacimientoTexto ? { fechaNacimientoTexto: f.fechaNacimientoTexto } : {}),
        importadaAronium: ahora.toISOString()
      },
      financiero,
      cambio: null
    });
  });

  let hechos = 0;
  try {
    for (let i = 0; i < escrituras.length; i += POR_LOTE) {
      const lote = writeBatch(db);
      escrituras.slice(i, i + POR_LOTE).forEach(e => {
        if (e.nuevo) {
          lote.set(doc(db, 'personas', e.id), e.nuevo);
          lote.set(doc(db, 'personasFinanciero', e.id), e.financiero ?? {}, { merge: true });
        } else lote.update(doc(db, 'personas', e.id), e.cambio!);
      });
      await lote.commit();
      hechos = Math.min(escrituras.length, i + POR_LOTE);
      alAvanzar(hechos, escrituras.length);
    }
  } catch {
    return { ok: false, error: `Se detuvo después de ${hechos} de ${escrituras.length} personas (sin conexión o sin permiso). Vuelve a subir el mismo archivo: las que ya se guardaron se reconocen y no se duplican.` };
  }
  const nuevas = escrituras.filter(e => e.nuevo).length;
  const actualizadas = escrituras.length - nuevas;

  // Árbol de mi-equipo: se recalcula sobre la versión más reciente.
  const arbol = await cambiarArbol(
    dbEquipo,
    db,
    lista => { acomodarEnArbol(lista, datosArbol(plan, listo.ids, listo.invito, listo.nombres), ahora.toISOString().slice(0, 10)); return null; },
    'arbol',
    perfil,
    equipo,
    { accion: 'importar_clientes_aronium', descripcion: `Árbol actualizado con los clientes de Aronium (quién invitó a quién)` }
  );
  const reg = nuevoRegistroActividad(perfil, 'personas', 'importar_clientes_aronium', conOrigen(`Importación de clientes de Aronium: ${nuevas} nuevas, ${actualizadas} actualizadas`, equipo), equipo, ahora);
  await setDoc(doc(db, 'auditoria', reg.id), reg).catch(() => {});
  return { ok: true, nuevas, actualizadas, arbol };
}

export interface CuentaCreada { personaId: string; nombre: string; usuario: string; password: string }

/**
 * Crea el acceso (usuario automático MW#### y contraseña como al aprobar una
 * solicitud) de cada persona sin cuenta, una por una. Firebase limita cuántas
 * cuentas se crean por hora desde un mismo equipo: si se llega al límite, se
 * detiene y se puede continuar más tarde.
 */
export async function crearCuentasFaltantes(
  db: Firestore,
  crearAcceso: CrearAcceso,
  sinCuenta: PersonaAdmin[],
  todas: PersonaAdmin[],
  perfil: PerfilUsuario,
  equipo: string,
  alCrear: (c: CuentaCreada) => void,
  detener: () => boolean = () => false
): Promise<{ creadas: number; error: string | null }> {
  const usuarios = todas.map(p => p.usuario).filter(Boolean);
  let creadas = 0;
  for (const p of sinCuenta) {
    if (detener()) break;
    const nombre = [p.nombre, p.apellidos].filter(Boolean).join(' ');
    let uid: string | null = null;
    let cred = generarCredenciales(nombre, usuarios, []);
    for (let intento = 0; intento < 5 && !uid; intento++) {
      cred = generarCredenciales(nombre, usuarios, [], intento);
      try {
        uid = await crearAcceso(cred.usuario, cred.passwordTemporal, nombre);
      } catch (e) {
        if (e instanceof UsuarioOcupado) continue;
        const code = String((e as { code?: string }).code ?? '');
        const limite = /too-many-requests|quota/i.test(code + (e as Error).message);
        return { creadas, error: limite
          ? `Firebase llegó a su límite de cuentas nuevas por hora (se crearon ${creadas}). Espera una hora y vuelve a presionar "Crear cuentas": continúa con las que faltan.`
          : `Se detuvo en ${nombre}: ${(e as Error)?.message || 'error desconocido'}. Se crearon ${creadas}.` };
      }
    }
    if (!uid) return { creadas, error: `Los siguientes usuarios MW ya están ocupados. Avisa a soporte. Se crearon ${creadas}.` };
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, 'personas', p.id);
        const s = await tx.get(ref);
        if (!s.exists()) throw new Error('no-existe');
        if (s.data().firebaseUid) throw new Error('ya-tiene');
        const nueva = { ...s.data(), id: p.id, usuario: cred.usuario, numeroCuenta: cred.numeroCuenta, firebaseUid: uid };
        tx.update(ref, { usuario: cred.usuario, numeroCuenta: cred.numeroCuenta, firebaseUid: uid });
        tx.set(doc(db, 'users', uid!), perfilUsuarioPersona(nueva), { merge: true });
        const r = nuevoRegistroActividad(perfil, 'cuentas', 'crear_cuenta_persona', conOrigen(`Cuenta creada para ${nombre} (${cred.usuario}) — importada de Aronium`, equipo), equipo, new Date());
        tx.set(doc(db, 'auditoria', r.id), r);
      });
    } catch (e) {
      if ((e as Error).message === 'ya-tiene' || (e as Error).message === 'no-existe') continue;
      return { creadas, error: `Se creó el acceso de ${nombre} pero no se pudo guardar. Vuelve a intentarlo (se recupera). Se crearon ${creadas}.` };
    }
    usuarios.push(cred.usuario);
    creadas++;
    alCrear({ personaId: p.id, nombre, usuario: cred.usuario, password: cred.passwordTemporal });
  }
  return { creadas, error: null };
}
