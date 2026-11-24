// Usuarios y seguridad (Administración): por cada persona del equipo, qué
// módulos ve en el menú y qué acciones puede hacer, a partir de lo que ya
// tiene su rol. Se guarda en users/{uid}.permisosBrillo y queda en Actividad.
// Lo que las reglas de Firebase no permiten a un rol no aparece (fallaría).
import { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, runTransaction, where } from '../datos/firestore';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import { ETIQUETA_ROL, type PerfilUsuario, type Rol } from '../sesion/perfil';
import { conOrigen, nuevoRegistroActividad } from '../pagina/actividad';
import { ACCIONES, leerPermisos, limpiarPermisos, MODULOS_CONFIGURABLES, puede, veModulo, type Accion, type PermisosBrillo } from '../sesion/permisos';
import { app } from '../firebase';
import { crearAccesoCon } from '../sesion/crearAcceso';
import { usePersonasAdmin } from '../personas/acciones';
import { nombreCompletoPersona, type PersonaAdmin } from '../personas/modelo';
import { crearCuentaEL, crearCuentaInterna, fijarAccesoInterno, restablecerPassword, type Resultado } from '../cuentas/acciones';
import { categoriaPorSLP, ROLES_INTERNOS, type DatosEL, type DatosInterna } from '../cuentas/modelo';
import { MarcoModal, useEnvio } from './Modal';
import type { FormEvent } from 'react';

const crearAcceso = crearAccesoCon(app);
type Ventana = null | { tipo: 'interna' } | { tipo: 'el' } | { tipo: 'password'; cuenta: { uid: string; usuario: string; nombre: string; tipo: 'interna' | 'persona' } } | { tipo: 'passwordEL' } | { tipo: 'listo'; r: Extract<Resultado, { ok: true }>; que: string };

interface Cuenta { uid: string; nombre: string; usuario: string; rol: Rol; activa: boolean; permisosBrillo: PermisosBrillo }

export function Usuarios({ perfil }: { perfil: PerfilUsuario }) {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ventana, setVentana] = useState<Ventana>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = () =>
    getDocs(query(collection(db, 'users'), where('rol', 'in', ['admin', 'encargado', 'staff'])))
      .then(s => setCuentas(s.docs.map(d => {
        const x = d.data();
        return { uid: d.id, nombre: String(x.nombre ?? x.usuario ?? ''), usuario: String(x.usuario ?? ''), rol: x.rol as Rol, activa: x.activa !== false, permisosBrillo: leerPermisos(x.permisosBrillo) ?? {} };
      }).sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre, 'es'))))
      .catch(() => setError('No se pudieron leer las cuentas.'));
  useEffect(() => { void cargar(); }, []);

  if (perfil.rol !== 'admin') return <p className="muted">Solo Administración puede ver Usuarios y seguridad.</p>;
  if (error) return <p className="error">{error}</p>;
  if (!cuentas) return <p className="muted">Cargando cuentas…</p>;

  return (
    <section>
      <div className="encabezado-seccion">
        <h1>Cuentas y seguridad</h1>
        <p className="muted">Crea cuentas del equipo y de Emprendedoras/Líderes, restablece contraseñas, quita o devuelve el acceso, y decide qué ve y qué puede hacer cada persona del equipo en BRILLO. Lo mismo que Configuración de la página.</p>
      </div>
      <div className="acciones izquierda">
        <button className="btn primario" onClick={() => setVentana({ tipo: 'interna' })}>+ Cuenta del equipo</button>
        <button className="btn primario" onClick={() => setVentana({ tipo: 'el' })}>+ Cuenta de Emprendedora/Líder</button>
        <button className="btn" onClick={() => setVentana({ tipo: 'passwordEL' })}>Contraseña de una Emprendedora/Líder</button>
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <h2>Equipo interno</h2>
      <ul className="lista-usuarios">
        {cuentas.map(c => (
          <li key={c.uid}>
            <button className="fila-usuario" onClick={() => setAbierta(abierta === c.uid ? null : c.uid)} aria-expanded={abierta === c.uid}>
              <span><strong>{c.nombre}</strong> <span className="muted small">{c.usuario} · {ETIQUETA_ROL[c.rol]}{c.activa ? '' : ' · desactivada'}</span></span>
              <span className="muted small">{resumen(c)}</span>
            </button>
            {abierta === c.uid && (
              <>
                <AccesoCuenta c={c} perfil={perfil} onPassword={() => setVentana({ tipo: 'password', cuenta: { uid: c.uid, usuario: c.usuario, nombre: c.nombre, tipo: 'interna' } })} onCambio={t => { setAviso(t); void cargar(); }} />
                <EditarPermisos c={c} perfil={perfil} onGuardado={() => void cargar()} />
              </>
            )}
          </li>
        ))}
      </ul>
      {ventana?.tipo === 'interna' && <NuevaInterna perfil={perfil} onCerrar={() => setVentana(null)} onListo={r => { void cargar(); setVentana({ tipo: 'listo', r, que: 'Cuenta del equipo creada' }); }} />}
      {ventana?.tipo === 'el' && <NuevaEL perfil={perfil} onCerrar={() => setVentana(null)} onListo={r => setVentana({ tipo: 'listo', r, que: 'Cuenta de Emprendedora/Líder creada' })} />}
      {ventana?.tipo === 'passwordEL' && <ElegirEL onCerrar={() => setVentana(null)} onElegir={cuenta => setVentana({ tipo: 'password', cuenta })} />}
      {ventana?.tipo === 'password' && <NuevaPassword cuenta={ventana.cuenta} perfil={perfil} onCerrar={() => setVentana(null)} onListo={t => { setVentana(null); setAviso(t); }} />}
      {ventana?.tipo === 'listo' && (
        <MarcoModal titulo={ventana.que} onCerrar={() => setVentana(null)}>
          <p className="muted">{ventana.r.nombre}</p>
          <dl className="datos"><dt>Usuario</dt><dd className="mono">{ventana.r.usuario}</dd><dt>Contraseña</dt><dd className="mono">{ventana.r.password}</dd></dl>
          <p className="muted small">Anótalo o compártelo ahora: la contraseña no se vuelve a mostrar (si se olvida, se restablece aquí mismo).</p>
          <div className="acciones"><button className="btn primario" onClick={() => setVentana(null)}>Listo</button></div>
        </MarcoModal>
      )}
    </section>
  );
}

function AccesoCuenta({ c, perfil, onPassword, onCambio }: { c: Cuenta; perfil: PerfilUsuario; onPassword: () => void; onCambio: (t: string) => void }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <div className="detalle-usuario">
      <h3>Acceso</h3>
      <p className="small">{c.activa ? 'Puede entrar a BRILLO y a la página.' : 'Sin acceso: no puede entrar a BRILLO ni a la página (su historial se conserva).'}</p>
      <div className="acciones izquierda">
        <button className="btn" onClick={onPassword}>Restablecer contraseña</button>
        {c.uid !== perfil.uid && (
          <button className={c.activa ? 'btn peligro' : 'btn'} disabled={enviando} onClick={() => {
            if (c.activa && !window.confirm(`¿Quitarle el acceso a ${c.nombre}? Ya no podrá entrar a BRILLO ni a la página hasta que se lo devuelvas.`)) return;
            void enviar(async () => {
              const err = await fijarAccesoInterno(db, c, !c.activa, perfil, equipoActual());
              if (!err) onCambio(c.activa ? `${c.nombre} ya no tiene acceso.` : `${c.nombre} ya tiene acceso otra vez.`);
              return err;
            });
          }}>{c.activa ? 'Quitar acceso' : 'Devolver acceso'}</button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function NuevaInterna({ perfil, onCerrar, onListo }: { perfil: PerfilUsuario; onCerrar: () => void; onListo: (r: Extract<Resultado, { ok: true }>) => void }) {
  const [d, setD] = useState<DatosInterna>({ usuario: '', nombre: '', rol: 'staff', password: '', telefono: '', correo: '' });
  const { enviando, error, enviar } = useEnvio();
  const set = <K extends keyof DatosInterna>(k: K, v: DatosInterna[K]) => setD(x => ({ ...x, [k]: v }));
  function guardar(e: FormEvent) {
    e.preventDefault();
    void enviar(async () => {
      const r = await crearCuentaInterna(db, crearAcceso, d, perfil, equipoActual());
      if (r.ok) onListo(r);
      return r.ok ? null : r.error;
    });
  }
  return (
    <MarcoModal titulo="Nueva cuenta del equipo" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <div className="rejilla-form">
        <label className="campo"><span>Nombre completo</span><input value={d.nombre} onChange={e => set('nombre', e.target.value)} autoFocus /></label>
        <label className="campo"><span>Usuario (para entrar)</span><input value={d.usuario} onChange={e => set('usuario', e.target.value)} autoCapitalize="none" autoComplete="off" /></label>
        <label className="campo"><span>Rol</span>
          <select value={d.rol} onChange={e => set('rol', e.target.value as DatosInterna['rol'])}>{ROLES_INTERNOS.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
        </label>
        <label className="campo"><span>Contraseña inicial</span><input value={d.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres" /></label>
        <label className="campo"><span>Teléfono (opcional)</span><input value={d.telefono} onChange={e => set('telefono', e.target.value)} inputMode="tel" /></label>
        <label className="campo"><span>Correo (opcional)</span><input value={d.correo} onChange={e => set('correo', e.target.value)} type="email" /></label>
      </div>
      <p className="muted small">Si es para Nómina, después vincúlala con su empleado en Configuración de la página.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Creando…' : 'Crear cuenta'}</button></div>
    </MarcoModal>
  );
}

function NuevaEL({ perfil, onCerrar, onListo }: { perfil: PerfilUsuario; onCerrar: () => void; onListo: (r: Extract<Resultado, { ok: true }>) => void }) {
  const per = usePersonasAdmin(db, false);
  const [d, setD] = useState<DatosEL>({ nombre: '', apellidos: '', telefono: '', correo: '', tipo: 'emprendedora', categoria: 'normal', viveEnSLP: null, liderId: null, password: '' });
  const [buscaLider, setBuscaLider] = useState('');
  const [ascender, setAscender] = useState(false);
  const { enviando, error, enviar } = useEnvio();
  const set = <K extends keyof DatosEL>(k: K, v: DatosEL[K]) => setD(x => ({ ...x, [k]: v }));
  const personas = per.estado === 'listo' ? per.personas.filter(p => p.estado !== 'baja') : [];
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const opciones = personas
    .filter(p => !buscaLider || norm(`${nombreCompletoPersona(p)} ${p.usuario}`).includes(norm(buscaLider)))
    .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'lider' ? -1 : 1) || nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'))
    .slice(0, 80);
  const lider = d.liderId ? personas.find(p => p.id === d.liderId) : undefined;
  function guardar(e: FormEvent) {
    e.preventDefault();
    if (per.estado !== 'listo') return;
    void enviar(async () => {
      const r = await crearCuentaEL(db, crearAcceso, d, per.personas, perfil, equipoActual(), ascender);
      if (r.ok) onListo(r);
      return r.ok ? null : r.error;
    });
  }
  return (
    <MarcoModal titulo="Nueva cuenta de Emprendedora/Líder" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar} clase="modal-amplio">
      <div className="rejilla-form">
        <label className="campo"><span>Nombre(s)</span><input value={d.nombre} onChange={e => set('nombre', e.target.value)} autoFocus /></label>
        <label className="campo"><span>Apellidos</span><input value={d.apellidos} onChange={e => set('apellidos', e.target.value)} /></label>
        <label className="campo"><span>Teléfono</span><input value={d.telefono} onChange={e => set('telefono', e.target.value)} inputMode="tel" /></label>
        <label className="campo"><span>Correo (opcional)</span><input value={d.correo} onChange={e => set('correo', e.target.value)} type="email" /></label>
        <label className="campo"><span>Tipo</span>
          <select value={d.tipo} onChange={e => set('tipo', e.target.value as DatosEL['tipo'])}><option value="emprendedora">Emprendedora</option><option value="lider">Líder</option></select>
        </label>
        <label className="campo"><span>Categoría</span>
          <select value={d.categoria} onChange={e => set('categoria', e.target.value as DatosEL['categoria'])}><option value="normal">Normal</option><option value="foranea">Foránea</option><option value="vip">VIP</option></select>
        </label>
      </div>
      <fieldset className="campo">
        <legend>¿Vive en el municipio de San Luis Potosí o zonas cercanas?</legend>
        <div className="en-linea">
          {[true, false].map(v => (
            <label key={String(v)} className="check"><input type="radio" name="viveEnSLP" checked={d.viveEnSLP === v} onChange={() => setD(x => ({ ...x, viveEnSLP: v, categoria: categoriaPorSLP(x.categoria, v) }))} /> {v ? 'Sí' : 'No'}</label>
          ))}
        </div>
        <span className="muted small">Si contesta que no, la categoría cambia a Foránea (puedes elegir VIP si aplica).</span>
      </fieldset>
      <label className="campo"><span>Líder directa</span>
        <input type="search" value={buscaLider} onChange={e => setBuscaLider(e.target.value)} placeholder="Buscar por nombre o usuario…" />
        <select value={d.liderId ?? ''} onChange={e => { set('liderId', e.target.value || null); setAscender(false); }}>
          <option value="">— Ninguna (es líder raíz) —</option>
          {lider && !opciones.includes(lider) && <option value={lider.id}>{nombreCompletoPersona(lider)}</option>}
          {opciones.map(p => <option key={p.id} value={p.id}>{nombreCompletoPersona(p)} · {p.usuario}{p.tipo === 'lider' ? '' : ' — Emprendedora'}</option>)}
        </select>
      </label>
      {lider && lider.tipo !== 'lider' && (
        <label className="check nota-apartado"><input type="checkbox" checked={ascender} onChange={e => setAscender(e.target.checked)} /> {lider.nombre} todavía es Emprendedora: convertir su cuenta a Líder para inscribir a esta persona en su equipo.</label>
      )}
      <p className="muted small">Se creará una contraseña automática: <strong>MW#### + iniciales del nombre</strong> (MW#### es su número de usuario). Te la mostramos al terminar para que se la compartas. La persona aparece al instante en la página y en BRILLO.</p>
      {per.estado === 'error' && <p className="error">No se pudieron cargar las Emprendedoras y Líderes.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button type="submit" className="btn primario" disabled={enviando || per.estado !== 'listo'}>{enviando ? 'Creando…' : 'Crear cuenta'}</button></div>
    </MarcoModal>
  );
}

function ElegirEL({ onCerrar, onElegir }: { onCerrar: () => void; onElegir: (c: { uid: string; usuario: string; nombre: string; tipo: 'persona' }) => void }) {
  const per = usePersonasAdmin(db, false);
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const lista = per.estado === 'listo' && q.trim()
    ? per.personas.filter(p => norm(`${nombreCompletoPersona(p)} ${p.usuario} ${p.telefono}`).includes(norm(q.trim()))).slice(0, 30)
    : [];
  async function elegir(p: PersonaAdmin) {
    setError(null);
    setBuscando(p.id);
    let uid = p.firebaseUid;
    if (!uid) {
      try {
        const s = await getDocs(query(collection(db, 'users'), where('personaId', '==', p.id)));
        uid = s.docs[0]?.id ?? null;
      } catch { /* sigue abajo */ }
    }
    setBuscando(null);
    if (!uid) return setError(`${nombreCompletoPersona(p)} no tiene acceso real todavía (su cuenta no tiene usuario de inicio de sesión).`);
    onElegir({ uid, usuario: p.usuario, nombre: nombreCompletoPersona(p), tipo: 'persona' });
  }
  return (
    <MarcoModal titulo="Contraseña de una Emprendedora/Líder" onCerrar={onCerrar}>
      <label className="campo"><span>Buscar</span><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, usuario MW o teléfono" autoFocus /></label>
      {per.estado === 'cargando' && <p className="muted small">Cargando…</p>}
      <ul className="lista-filas">
        {lista.map(p => (
          <li key={p.id}><button className="btn ancho izq" disabled={buscando === p.id} onClick={() => void elegir(p)}><strong>{nombreCompletoPersona(p)}</strong> <span className="muted small">{p.usuario} · {p.tipo === 'lider' ? 'Líder' : 'Emprendedora'}</span></button></li>
        ))}
      </ul>
      {q.trim() && per.estado === 'listo' && !lista.length && <p className="muted small">Nadie coincide con la búsqueda.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </MarcoModal>
  );
}

function NuevaPassword({ cuenta, perfil, onCerrar, onListo }: { cuenta: { uid: string; usuario: string; nombre: string; tipo: 'interna' | 'persona' }; perfil: PerfilUsuario; onCerrar: () => void; onListo: (t: string) => void }) {
  const [password, setPassword] = useState('');
  const { enviando, error, enviar } = useEnvio();
  function guardar(e: FormEvent) {
    e.preventDefault();
    void enviar(async () => {
      const err = await restablecerPassword(db, cuenta, password, perfil, equipoActual());
      if (!err) onListo(`Listo: ${cuenta.nombre} ya entra con la contraseña nueva.`);
      return err;
    });
  }
  return (
    <MarcoModal titulo="Restablecer contraseña" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p className="muted">{cuenta.nombre} · <span className="mono">{cuenta.usuario}</span></p>
      <label className="campo"><span>Contraseña nueva</span><input value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres" autoFocus /></label>
      <p className="muted small">La contraseña actual no se puede ver (nadie la guarda). Compártele la nueva a la persona.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button type="submit" className="btn primario" disabled={enviando || password.length < 6}>{enviando ? 'Guardando…' : 'Cambiar contraseña'}</button></div>
    </MarcoModal>
  );
}

function resumen(c: Cuenta): string {
  if (c.rol === 'admin') return 'Todo';
  const ocultos = MODULOS_CONFIGURABLES.filter(m => !veModulo(c, m.id)).length;
  const cambios = Object.keys(c.permisosBrillo.acciones ?? {}).length;
  return ocultos || cambios ? `${ocultos ? `${ocultos} módulo(s) ocultos` : ''}${ocultos && cambios ? ' · ' : ''}${cambios ? `${cambios} permiso(s) cambiados` : ''}` : 'Lo de su rol';
}

function EditarPermisos({ c, perfil, onGuardado }: { c: Cuenta; perfil: PerfilUsuario; onGuardado: () => void }) {
  const [p, setP] = useState<PermisosBrillo>(c.permisosBrillo);
  const [estado, setEstado] = useState<{ guardando?: boolean; error?: string; ok?: string }>({});
  if (c.rol === 'admin') return <p className="muted small detalle-usuario">Administración siempre puede todo.</p>;
  const yo = { rol: c.rol, permisosBrillo: p };
  const acciones = ACCIONES.filter(a => a.roles.includes(c.rol));

  async function guardar() {
    setEstado({ guardando: true });
    const limpio = limpiarPermisos(c.rol, p);
    try {
      await runTransaction(db, async tx => {
        const ahora = new Date();
        tx.update(doc(db, 'users', c.uid), { permisosBrillo: limpio });
        const desc = `Permisos de BRILLO de ${c.nombre}: ${[
          ...MODULOS_CONFIGURABLES.filter(m => limpio.modulos?.[m.id] === false).map(m => `sin ${m.nombre}`),
          ...ACCIONES.filter(a => limpio.acciones?.[a.id] !== undefined).map(a => `${limpio.acciones![a.id] ? 'puede' : 'no puede'} ${a.nombre.toLowerCase()}`)
        ].join(', ') || 'los de su rol'}`;
        const r = nuevoRegistroActividad(perfil, 'configuracion', 'permisos_usuario', conOrigen(desc, equipoActual()), equipoActual(), ahora);
        tx.set(doc(db, 'auditoria', r.id), r);
      });
      setEstado({ ok: 'Guardado. Se aplica la próxima vez que esa persona entre a BRILLO.' });
      onGuardado();
    } catch {
      setEstado({ error: 'No se pudo guardar. Inténtalo de nuevo.' });
    }
  }

  return (
    <div className="detalle-usuario">
      <h3>Módulos que ve</h3>
      <div className="rejilla-permisos">
        {MODULOS_CONFIGURABLES.map(m => (
          <label key={m.id} className="check">
            <input type="checkbox" checked={veModulo(yo, m.id)} onChange={e => setP(x => ({ ...x, modulos: { ...x.modulos, [m.id]: e.target.checked } }))} /> {m.nombre}
          </label>
        ))}
      </div>
      <p className="muted small">Ocultar un módulo solo lo quita del menú; lo que su rol no tiene (por ejemplo, la Caja para Staff) no aparece aunque esté marcado.</p>
      <h3>Qué puede hacer</h3>
      <div className="rejilla-permisos">
        {acciones.map(a => (
          <label key={a.id} className="check">
            <input type="checkbox" checked={puede(yo, a.id)} onChange={e => setP(x => ({ ...x, acciones: { ...x.acciones, [a.id as Accion]: e.target.checked } }))} />
            {a.nombre}{a.porOmision.includes(c.rol) ? '' : ' (no lo tiene su rol)'}
          </label>
        ))}
      </div>
      {estado.error && <p className="error">{estado.error}</p>}
      {estado.ok && <p className="aviso-ok">{estado.ok}</p>}
      <div className="acciones">
        <button className="btn" onClick={() => setP({})}>Volver a lo de su rol</button>
        <button className="btn primario" disabled={estado.guardando} onClick={() => void guardar()}>{estado.guardando ? 'Guardando…' : 'Guardar permisos'}</button>
      </div>
    </div>
  );
}
