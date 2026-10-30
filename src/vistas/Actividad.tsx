// Actividad: la misma bitácora que la pestaña "Actividad" de la página
// (`auditoria`), en vivo. Muestra quién hizo qué, cuándo y desde dónde
// (página o BRILLO, PC o tablet).
import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from '../datos/firestore';
import { db } from '../firebase';
import type { PerfilUsuario } from '../sesion/perfil';
import {
  LIMITE_ACTIVIDAD,
  MODULOS_ACTIVIDAD,
  MODULOS_VISIBLES_STAFF,
  ROLES_ACTIVIDAD,
  actividadVisible,
  normalizarRegistro,
  type FiltrosActividad,
  type RegistroLeido
} from '../pagina/actividad';

type Estado = { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; registros: RegistroLeido[] };

function useActividad(): Estado {
  const [estado, setEstado] = useState<Estado>({ estado: 'cargando' });
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'auditoria'), orderBy('fecha', 'desc'), limit(LIMITE_ACTIVIDAD)),
        s => setEstado({ estado: 'listo', registros: s.docs.map(d => normalizarRegistro(d.id, d.data())) }),
        () => setEstado({ estado: 'error' })
      ),
    []
  );
  return estado;
}

const fecha = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** La descripción ya trae " · desde BRILLO (…)"; se muestra aparte como etiqueta. */
const sinOrigen = (d: string) => d.replace(/ · desde BRILLO \((PC|Tablet)\)$/, '');

export function Actividad({ perfil }: { perfil: PerfilUsuario }) {
  const datos = useActividad();
  const [f, setF] = useState<FiltrosActividad>({ rol: '', modulo: '', origen: '', texto: '' });
  const registros = datos.estado === 'listo' ? datos.registros : [];
  const visibles = useMemo(() => actividadVisible(registros, perfil.rol, f), [registros, perfil.rol, f]);
  const set = (k: keyof FiltrosActividad, v: string) => setF(prev => ({ ...prev, [k]: v }));
  const modulos = Object.entries(MODULOS_ACTIVIDAD).filter(([k]) => perfil.rol !== 'staff' || MODULOS_VISIBLES_STAFF.includes(k));
  const roles = Object.entries(ROLES_ACTIVIDAD).filter(([k]) => perfil.rol === 'admin' || k !== 'admin');
  const recortada = registros.length >= LIMITE_ACTIVIDAD;

  return (
    <section className="actividad">
      <div className="encabezado-seccion">
        <h1>Actividad</h1>
        <p className="muted">Quién hizo qué y cuándo, en la página y en BRILLO. Se actualiza sola.</p>
      </div>
      {datos.estado === 'cargando' && <p className="muted">Cargando…</p>}
      {datos.estado === 'error' && <p className="error" role="alert">No se pudo cargar la actividad. Revisa la conexión.</p>}
      {datos.estado === 'listo' && (
        <>
          <div className="filtros-deseos">
            <input type="search" placeholder="Buscar persona o acción…" value={f.texto} onChange={e => set('texto', e.target.value)} aria-label="Buscar" />
            <select value={f.rol} onChange={e => set('rol', e.target.value)} aria-label="Rol">
              <option value="">Todos los roles</option>
              {roles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.modulo} onChange={e => set('modulo', e.target.value)} aria-label="Sección">
              <option value="">Todas las secciones</option>
              {modulos.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.origen} onChange={e => set('origen', e.target.value)} aria-label="Desde dónde">
              <option value="">Página y BRILLO</option>
              <option value="pagina">Solo la página</option>
              <option value="brillo">Solo BRILLO</option>
            </select>
          </div>
          <p className="muted small">
            {visibles.length} {visibles.length === 1 ? 'acción' : 'acciones'}
            {recortada ? ` (de las últimas ${LIMITE_ACTIVIDAD})` : ''}
          </p>
          {!visibles.length ? (
            <p className="muted vacio">Todavía no hay acciones registradas con estos filtros.</p>
          ) : (
            <ul className="lista-filas">
              {visibles.map(r => (
                <li key={r.id} className="fila-actividad">
                  <span className="fila-principal">
                    <strong>{r.usuarioNombre || 'Usuario'}</strong>
                    <span className="muted small">{ROLES_ACTIVIDAD[r.rol] ?? r.rol}</span>
                  </span>
                  <span className="fila-principal">
                    <span className="small enlace">{MODULOS_ACTIVIDAD[r.modulo] ?? r.modulo}</span>
                    <span>{sinOrigen(r.descripcion)}</span>
                  </span>
                  <span className="fila-cuando">
                    <span className="muted small">{fecha(r.fecha)}</span>
                    {r.origen === 'brillo'
                      ? <span className="chip neutro">BRILLO{r.equipo ? ` · ${r.equipo}` : ''}</span>
                      : <span className="chip pendiente">Página</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
