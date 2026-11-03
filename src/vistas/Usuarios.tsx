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

interface Cuenta { uid: string; nombre: string; usuario: string; rol: Rol; activa: boolean; permisosBrillo: PermisosBrillo }

export function Usuarios({ perfil }: { perfil: PerfilUsuario }) {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

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
        <h1>Usuarios y seguridad</h1>
        <p className="muted">Qué ve y qué puede hacer cada persona del equipo en BRILLO. Parte de lo que tiene su rol; Administración siempre puede todo. Las cuentas y contraseñas se crean en Configuración de la página.</p>
      </div>
      <ul className="lista-usuarios">
        {cuentas.map(c => (
          <li key={c.uid}>
            <button className="fila-usuario" onClick={() => setAbierta(abierta === c.uid ? null : c.uid)} aria-expanded={abierta === c.uid}>
              <span><strong>{c.nombre}</strong> <span className="muted small">{c.usuario} · {ETIQUETA_ROL[c.rol]}{c.activa ? '' : ' · desactivada'}</span></span>
              <span className="muted small">{resumen(c)}</span>
            </button>
            {abierta === c.uid && <EditarPermisos c={c} perfil={perfil} onGuardado={() => void cargar()} />}
          </li>
        ))}
      </ul>
    </section>
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
