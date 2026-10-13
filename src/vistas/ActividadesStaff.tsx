// Actividades del Staff: lo mismo que la página en los 3 portales.
// - Staff: "Mis actividades" de la semana y botón "Enterado".
// - Encargado y Admin: organizar la semana (actividades base precargadas,
//   crear, editar, sortear zonas, anunciar, firmar, eliminar, reportes).
// - Admin además: "Todas las actividades" de todas las semanas.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { asegurarSemana, guardarActividades, leerHistorial, useActividadesStaff } from '../actividadesStaff/acciones';
import {
  DIAS,
  ESTADOS,
  ORDEN_DIAS,
  PERIODICIDADES,
  TIPOS,
  agruparPorZona,
  anunciar,
  aplicarSorteo,
  crearActividad,
  deLaSemana,
  editarActividad,
  eliminar,
  empleadoDeCuenta,
  estadoIndividual,
  fechaCorta,
  fechaISO,
  filasReporteOrganizacion,
  filasReporteSemanal,
  firmar,
  marcarEnterado,
  misActividades,
  nombresResponsables,
  rangoSemana,
  semanaKeyDe,
  sortear,
  staffActivos,
  textoDias,
  vigenciaTemporal,
  zonasDe,
  type ActividadCatalogo,
  type Asignacion,
  type DatosActividad,
  type EmpleadoNomina,
  type GrupoSorteo,
  type RegistroHistorial,
  type Resultado
} from '../actividadesStaff/modelo';
import { MarcoModal, useEnvio } from './Modal';

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const CLASE: Record<string, string> = { borrador: 'pendiente', anunciado: 'neutro', enterado: 'ok', firmado_encargado: 'ok' };
const Estado = ({ e }: { e: string }) => <span className={`chip ${CLASE[e] ?? 'neutro'}`}>{ESTADOS[e as keyof typeof ESTADOS] ?? e}</span>;
const plural = (n: number) => `${n} actividad${n === 1 ? '' : 'es'}`;

type Avisar = (m: string) => void;
type Datos = { catalogo: ActividadCatalogo[]; asignaciones: Asignacion[]; empleados: EmpleadoNomina[] };

export function ActividadesStaff({ perfil }: { perfil: PerfilUsuario }) {
  const datos = useActividadesStaff(db);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vista, setVista] = useState<'semana' | 'todas'>('semana');
  const avisar: Avisar = m => {
    setAviso(m);
    setTimeout(() => setAviso(null), 5000);
  };
  const organiza = perfil.rol === 'encargado' || perfil.rol === 'admin';

  return (
    <section className="actividades-staff">
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>{organiza ? 'Actividades del Staff' : 'Mis actividades'}</h1>
          <p className="muted">Las mismas actividades que en la página. Se actualizan solas.</p>
        </div>
        {perfil.rol === 'admin' && (
          <nav className="pestanas" aria-label="Vistas">
            <button className={vista === 'semana' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('semana')}>Semana en organización</button>
            <button className={vista === 'todas' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('todas')}>Todas las actividades</button>
          </nav>
        )}
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {datos.estado === 'cargando' && <p className="muted">Cargando…</p>}
      {datos.estado === 'error' && <p className="error" role="alert">{datos.mensaje}</p>}
      {datos.estado === 'listo' && !organiza && <MisActividades d={datos} perfil={perfil} avisar={avisar} />}
      {datos.estado === 'listo' && organiza && vista === 'semana' && <Organizar d={datos} perfil={perfil} avisar={avisar} />}
      {datos.estado === 'listo' && perfil.rol === 'admin' && vista === 'todas' && <Todas d={datos} />}
    </section>
  );
}

// ------------------------------------------------------------ Staff: mis actividades

function MisActividades({ d, perfil, avisar }: { d: Datos; perfil: PerfilUsuario; avisar: Avisar }) {
  const empleado = empleadoDeCuenta(perfil, d.empleados);
  const [confirmar, setConfirmar] = useState<Asignacion | null>(null);
  if (!empleado || empleado.cargo !== 'staff' || empleado.estado !== 'activo') {
    return <p className="nota-apartado">No encontramos un empleado de Staff activo ligado a tu cuenta en Nómina. Pide a Administración que lo revise.</p>;
  }
  const lista = misActividades(d.asignaciones, empleado.id);
  const conteo = (e: string) => lista.filter(a => estadoIndividual(a, empleado.id) === e).length;
  return (
    <>
      <p className="muted">Hola, {empleado.nombre} · Semana del {rangoSemana(semanaKeyDe())}</p>
      <div className="resumen-apartados">
        <div className="dato"><span>Asignadas</span><strong>{lista.length}</strong></div>
        <div className="dato"><span>Por confirmar</span><strong>{conteo('anunciado')}</strong></div>
        <div className="dato"><span>Enterado</span><strong>{conteo('enterado')}</strong></div>
        <div className="dato"><span>Completadas</span><strong>{conteo('firmado_encargado')}</strong></div>
      </div>
      {!lista.length ? (
        <p className="muted vacio">Todavía no tienes actividades anunciadas para esta semana. Encargado avisará aquí en cuanto te asignen alguna.</p>
      ) : (
        agruparPorZona(lista, d.catalogo).map(g => (
          <div key={g.zona} className="zona-actividades">
            <h3>{g.zona}</h3>
            <ul className="lista-filas">
              {g.items.map(a => {
                const propio = estadoIndividual(a, empleado.id);
                const otros = a.encargados.filter(e => e.id !== empleado.id).map(e => e.nombre);
                return (
                  <li key={a.id} className="fila-actividad-staff">
                    <span className="fila-principal">
                      <strong>{a.nombre}</strong>
                      {a.tipo === 'temporal' && <span className="muted small">Temporal · hasta {fechaCorta(a.fechaFinTemporal)}</span>}
                      <span className="muted small">{otros.length ? `Tú, ${otros.join(', ')}` : 'Tú'}</span>
                    </span>
                    <span className="small">{a.periodicidad ? PERIODICIDADES[a.periodicidad] : 'Sin definir'}<span className="muted bloque">{textoDias(a)}</span></span>
                    <Estado e={propio} />
                    {propio === 'anunciado' ? <button className="btn primario mini" onClick={() => setConfirmar(a)}>Enterado</button> : <span />}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      {confirmar && (
        <Confirmar
          titulo="Confirmar actividad"
          mensaje={<>Confirmas que te enteraste de "{confirmar.nombre}" ({confirmar.zona}) para la semana del {rangoSemana(confirmar.semanaKey)}. Se registrará tu nombre, fecha y hora; Encargado revisará después que se haya realizado.</>}
          boton="Confirmar"
          ids={[confirmar.id]}
          accion={m => marcarEnterado(m.get(confirmar.id)!, { id: empleado.id, nombre: empleado.nombre })}
          perfil={perfil}
          onListo={() => { setConfirmar(null); avisar('Confirmado, gracias.'); }}
          onCerrar={() => setConfirmar(null)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------ Encargado / Admin: organizar

type Modal =
  | { tipo: 'crear' }
  | { tipo: 'editar'; a: Asignacion }
  | { tipo: 'detalle'; a: Asignacion }
  | { tipo: 'sorteo' }
  | { tipo: 'reporte' }
  | { tipo: 'confirmar'; titulo: string; mensaje: ReactNode; boton: string; peligrosa?: boolean; ids: string[]; accion: (m: Map<string, Asignacion>) => Resultado; exito: string };

function Organizar({ d, perfil, avisar }: { d: Datos; perfil: PerfilUsuario; avisar: Avisar }) {
  const [fecha, setFecha] = useState(fechaISO(new Date()));
  const semana = semanaKeyDe(fecha);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const aseguradas = useRef(new Set<string>());

  // Como la página: al abrir una semana se precargan las actividades base.
  useEffect(() => {
    if (aseguradas.current.has(semana) || !d.catalogo.length) return;
    aseguradas.current.add(semana);
    asegurarSemana(db, d.catalogo, d.asignaciones, semana).catch(() => aseguradas.current.delete(semana));
  }, [semana, d.catalogo, d.asignaciones]);

  const semanaLista = deLaSemana(d.asignaciones, semana);
  const t = texto.trim().toLowerCase();
  const filtradas = semanaLista
    .filter(a => !t || a.nombre.toLowerCase().includes(t) || a.zona.toLowerCase().includes(t) || a.encargadoNombre.toLowerCase().includes(t))
    .filter(a => !estado || a.estado === estado);
  const porAnunciar = semanaLista.filter(a => a.estado === 'borrador' && a.encargados.length);
  const listo = (m: string) => { setModal(null); avisar(m); };

  return (
    <>
      <div className="filtros-deseos">
        <input type="search" placeholder="Buscar actividad, zona o responsable…" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Buscar" />
        <label className="campo-en-linea"><span>Semana</span><input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} /></label>
        <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="barra-acciones">
        <strong>Semana del {rangoSemana(semana)}</strong>
        <span className="acciones">
          <button className="btn" onClick={() => setModal({ tipo: 'reporte' })}>Generar reporte</button>
          <button className="btn" onClick={() => setModal({ tipo: 'sorteo' })}>Sortear</button>
          <button className="btn" onClick={() => setModal({ tipo: 'crear' })}>+ Crear actividad</button>
          {porAnunciar.length > 0 && (
            <button
              className="btn primario"
              onClick={() =>
                setModal({
                  tipo: 'confirmar',
                  titulo: 'Anunciar actividades',
                  mensaje: `Vas a anunciar ${plural(porAnunciar.length)} para la semana del ${rangoSemana(semana)}. Aparecerán de inmediato en "Mis actividades" de cada responsable.`,
                  boton: 'Anunciar',
                  ids: porAnunciar.map(a => a.id),
                  accion: m => anunciar([...m.values()], semana, perfil),
                  exito: 'Actividades anunciadas: se avisó a cada responsable.'
                })
              }
            >
              Anunciar ({porAnunciar.length})
            </button>
          )}
        </span>
      </div>
      <p className="muted small">{plural(filtradas.length)}</p>
      {!filtradas.length ? (
        <p className="muted vacio">No hay actividades para esta semana con estos filtros.</p>
      ) : (
        agruparPorZona(filtradas, d.catalogo).map(g => (
          <div key={g.zona} className="zona-actividades">
            <h3>{g.zona}</h3>
            <ul className="lista-filas">
              {g.items.map(a => {
                const v = vigenciaTemporal(a);
                return (
                  <li key={a.id} className="fila-actividad-staff organizar">
                    <span className="fila-principal">
                      <strong>{a.nombre}</strong>
                      {a.tipo === 'temporal' && (
                        <span className={`chip ${v.vencida ? 'pendiente' : 'neutro'}`}>Temporal · {fechaCorta(a.fechaInicioTemporal)} – {fechaCorta(a.fechaFinTemporal)}{v.vencida ? ' · Vencida' : ''}</span>
                      )}
                    </span>
                    <span className="small">{a.periodicidad ? PERIODICIDADES[a.periodicidad] : 'Sin definir'}<span className="muted bloque">{textoDias(a)}</span></span>
                    <span className="small">{nombresResponsables(a)}</span>
                    <Estado e={a.estado} />
                    <span className="acciones-fila">
                      <button className="btn mini" onClick={() => setModal({ tipo: 'editar', a })}>Editar</button>
                      <button className="btn mini" onClick={() => setModal({ tipo: 'detalle', a })}>Detalle</button>
                      {a.estado === 'enterado' && (
                        <button
                          className="btn primario mini"
                          onClick={() =>
                            setModal({
                              tipo: 'confirmar',
                              titulo: 'Firmar actividad',
                              mensaje: `Confirmas que revisaste físicamente que "${a.nombre}" (${a.zona}) fue realizada por ${nombresResponsables(a)}.`,
                              boton: 'Firmar',
                              ids: [a.id],
                              accion: m => firmar(m.get(a.id)!, perfil),
                              exito: 'Actividad firmada.'
                            })
                          }
                        >
                          Firmar
                        </button>
                      )}
                      <button
                        className="btn peligro mini"
                        onClick={() =>
                          setModal({
                            tipo: 'confirmar',
                            titulo: a.tipo === 'temporal' ? '¿Eliminar actividad temporal?' : '¿Eliminar actividad?',
                            mensaje: `"${a.nombre}" (${a.zona}) dejará de aparecer en la organización. El historial se conserva para auditoría.`,
                            boton: 'Eliminar actividad',
                            peligrosa: true,
                            ids: [a.id],
                            accion: m => eliminar(m.get(a.id)!, perfil),
                            exito: 'Actividad eliminada.'
                          })
                        }
                      >
                        Eliminar
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      {modal?.tipo === 'crear' && <FormActividad d={d} perfil={perfil} semana={semana} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'editar' && <FormActividad d={d} perfil={perfil} semana={semana} a={d.asignaciones.find(x => x.id === modal.a.id) ?? modal.a} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'detalle' && <Detalle a={d.asignaciones.find(x => x.id === modal.a.id) ?? modal.a} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'sorteo' && <Sorteo d={d} semanaLista={semanaLista} semana={semana} perfil={perfil} onListo={listo} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'reporte' && <Reporte d={d} semana={semana} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'confirmar' && (
        <Confirmar {...modal} perfil={perfil} onListo={() => listo(modal.exito)} onCerrar={() => setModal(null)} />
      )}
    </>
  );
}

function Confirmar({ titulo, mensaje, boton, peligrosa, ids, accion, perfil, onListo, onCerrar }: {
  titulo: string;
  mensaje: ReactNode;
  boton: string;
  peligrosa?: boolean;
  ids: string[];
  accion: (m: Map<string, Asignacion>) => Resultado;
  perfil: PerfilUsuario;
  onListo: () => void;
  onCerrar: () => void;
}) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo={titulo} onCerrar={onCerrar} enviando={enviando}>
      <p>{mensaje}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={onCerrar} disabled={enviando}>Volver</button>
        <button
          className={peligrosa ? 'btn peligro-lleno' : 'btn primario'}
          disabled={enviando}
          autoFocus
          onClick={() =>
            enviar(async () => {
              const r = await guardarActividades(db, ids, accion, perfil, equipoActual());
              if (!r.ok) return r.error;
              onListo();
              return null;
            })
          }
        >
          {enviando ? 'Guardando…' : boton}
        </button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ crear / editar

function FormActividad({ d, perfil, semana, a, onListo, onCerrar }: {
  d: Datos;
  perfil: PerfilUsuario;
  semana: string;
  a?: Asignacion;
  onListo: (m: string) => void;
  onCerrar: () => void;
}) {
  const zonas = zonasDe(d.catalogo);
  const staff = staffActivos(d.empleados);
  const [f, setF] = useState<DatosActividad>(() => ({
    nombre: a?.nombre ?? '',
    zona: a?.zona ?? zonas[0] ?? '',
    tipo: a?.tipo ?? 'permanente',
    fechaInicioTemporal: a?.fechaInicioTemporal ?? null,
    fechaFinTemporal: a?.fechaFinTemporal ?? null,
    periodicidad: a?.periodicidad ?? null,
    dias: a?.dias ?? [],
    responsables: a?.encargados.map(e => e.id) ?? [],
    semanaKey: a?.semanaKey ?? semana,
    observaciones: a?.observaciones ?? ''
  }));
  const [zonaNueva, setZonaNueva] = useState(false);
  const { enviando, error, setError, enviar } = useEnvio();
  const set = <K extends keyof DatosActividad>(k: K, v: DatosActividad[K]) => setF(prev => ({ ...prev, [k]: v }));
  const todos = staff.length > 0 && staff.every(e => f.responsables.includes(e.id));
  const alternarResp = (id: string) => set('responsables', f.responsables.includes(id) ? f.responsables.filter(x => x !== id) : [...f.responsables, id]);
  const alternarDia = (dia: string) => set('dias', f.dias.includes(dia) ? f.dias.filter(x => x !== dia) : [...f.dias, dia]);

  function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = { ...f, semanaKey: semanaKeyDe(f.semanaKey) };
    if (a) {
      const previa = editarActividad(a, datos, d.empleados, perfil);
      if (!previa.ok) return setError(previa.error);
      if (!previa.asignaciones.length) return onCerrar();
      void enviar(async () => {
        const r = await guardarActividades(db, [a.id], m => editarActividad(m.get(a.id)!, datos, d.empleados, perfil), perfil, equipoActual());
        if (!r.ok) return r.error;
        onListo('Actividad actualizada.');
        return null;
      });
      return;
    }
    if (!datos.zona.trim()) return setError('Indica la zona/vitrina.');
    const previa = crearActividad(datos, d.catalogo, d.empleados, perfil);
    if (!previa.ok) return setError(previa.error);
    void enviar(async () => {
      const r = await guardarActividades(db, [], () => crearActividad(datos, d.catalogo, d.empleados, perfil), perfil, equipoActual());
      if (!r.ok) return r.error;
      onListo('Actividad creada.');
      return null;
    });
  }

  return (
    <MarcoModal titulo={a ? 'Editar actividad' : 'Crear actividad'} onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      {a ? (
        <p className="muted">{a.nombre} — {a.zona}</p>
      ) : (
        <>
          <p className="muted small">Para agregar una actividad que no está en la lista base, escribe su nombre.</p>
          <label className="campo"><span>Nombre de la actividad *</span><input value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Limpiar puerta de entrada" autoFocus /></label>
          <label className="campo">
            <span>Zona / vitrina</span>
            {zonaNueva ? (
              <input value={f.zona} onChange={e => set('zona', e.target.value)} placeholder="Ej. Vitrina de relojes" />
            ) : (
              <select value={f.zona} onChange={e => (e.target.value === '__nueva__' ? (setZonaNueva(true), set('zona', '')) : set('zona', e.target.value))}>
                {zonas.map(z => <option key={z} value={z}>{z}</option>)}
                <option value="__nueva__">+ Otra zona (especificar)</option>
              </select>
            )}
          </label>
        </>
      )}
      <div className="rejilla-form">
        <label className="campo">
          <span>Tipo de actividad</span>
          <select value={f.tipo} onChange={e => set('tipo', e.target.value as DatosActividad['tipo'])}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {f.tipo === 'temporal' && (
          <>
            <label className="campo"><span>Fecha de inicio</span><input type="date" value={f.fechaInicioTemporal ?? ''} onChange={e => set('fechaInicioTemporal', e.target.value || null)} /></label>
            <label className="campo"><span>Fecha límite</span><input type="date" value={f.fechaFinTemporal ?? ''} onChange={e => set('fechaFinTemporal', e.target.value || null)} /></label>
          </>
        )}
      </div>
      <div className="rejilla-form">
        <label className="campo">
          <span>Periodicidad</span>
          <select value={f.periodicidad ?? ''} onChange={e => setF(prev => ({ ...prev, periodicidad: e.target.value || null, dias: [] }))}>
            <option value="">Sin definir</option>
            {Object.entries(PERIODICIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {f.periodicidad === 'semanal' && (
          <label className="campo">
            <span>Día de la semana</span>
            <select value={f.dias[0] ?? ''} onChange={e => set('dias', e.target.value ? [e.target.value] : [])}>
              <option value="">Selecciona…</option>
              {ORDEN_DIAS.map(dd => <option key={dd} value={dd}>{DIAS[dd]}</option>)}
            </select>
          </label>
        )}
      </div>
      {f.periodicidad === 'x_dias' && (
        <fieldset className="dias-semana">
          <legend>Días de la semana</legend>
          {ORDEN_DIAS.map(dd => (
            <label key={dd} className="check"><input type="checkbox" checked={f.dias.includes(dd)} onChange={() => alternarDia(dd)} /> {DIAS[dd]}</label>
          ))}
        </fieldset>
      )}
      <fieldset className="piezas-liquidar responsables">
        <legend>Responsables</legend>
        <label className="check"><input type="checkbox" checked={todos} onChange={() => set('responsables', todos ? [] : staff.map(e => e.id))} /> <strong>Todos</strong></label>
        {staff.map(e => (
          <label key={e.id} className="check"><input type="checkbox" checked={f.responsables.includes(e.id)} onChange={() => alternarResp(e.id)} /> {e.nombre}</label>
        ))}
        {!staff.length && <p className="muted small">No hay empleados de Staff activos en Nómina.</p>}
      </fieldset>
      <p className="muted small">Puedes dejarla sin responsable por ahora y definirlo después.</p>
      <label className="campo"><span>Semana</span><input type="date" value={f.semanaKey} onChange={e => e.target.value && set('semanaKey', e.target.value)} /></label>
      <label className="campo"><span>Observaciones (opcional)</span><textarea rows={2} value={f.observaciones} onChange={e => set('observaciones', e.target.value)} /></label>
      {a && a.estado !== 'borrador' && <p className="nota-apartado">Esta actividad ya fue anunciada: cualquier cambio quedará registrado en el historial.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : a ? 'Guardar cambios' : 'Crear actividad'}</button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ detalle

function Detalle({ a, onCerrar }: { a: Asignacion; onCerrar: () => void }) {
  const [historial, setHistorial] = useState<RegistroHistorial[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    leerHistorial(db, a.id).then(setHistorial, () => setError(true));
  }, [a.id, a.estado]);
  return (
    <MarcoModal titulo={a.nombre} onCerrar={onCerrar}>
      {a.eliminada && <p className="nota-apartado">Eliminada por {a.eliminadaPorNombre} el {fechaHora(a.fechaEliminacion)}. Se conserva solo para auditoría.</p>}
      <dl className="datos">
        <dt>Zona</dt><dd>{a.zona}</dd>
        <dt>Tipo</dt><dd>{TIPOS[a.tipo]}{a.tipo === 'temporal' ? ` (${fechaCorta(a.fechaInicioTemporal)} – ${fechaCorta(a.fechaFinTemporal)})` : ''}</dd>
        <dt>Periodicidad</dt><dd>{a.periodicidad ? PERIODICIDADES[a.periodicidad] : 'Sin definir'}</dd>
        <dt>Día</dt><dd>{textoDias(a)}</dd>
        <dt>Semana</dt><dd>{rangoSemana(a.semanaKey)}</dd>
        <dt>Estado</dt><dd><Estado e={a.estado} /></dd>
        {a.observaciones && <><dt>Observaciones</dt><dd>{a.observaciones}</dd></>}
        {a.fechaFirmaEncargado && <><dt>Firmada</dt><dd>{a.firmadoPorNombre} · {fechaHora(a.fechaFirmaEncargado)}</dd></>}
      </dl>
      <h3>Responsables</h3>
      <dl className="datos">
        {a.encargados.length ? a.encargados.map(e => {
          const ind = a.estadosPorEncargado?.[e.id];
          return (
            <div key={e.id} className="contenido-par">
              <dt>{e.nombre}</dt>
              <dd>{ind?.estado === 'enterado' ? `Enterado (${fechaHora(ind.fecha)})` : a.estado === 'borrador' ? 'Sin anunciar' : 'Anunciado'}</dd>
            </div>
          );
        }) : <><dt>Sin asignar</dt><dd>—</dd></>}
      </dl>
      <h3>Historial</h3>
      {error && <p className="error">No se pudo cargar el historial.</p>}
      {!historial && !error && <p className="muted small">Cargando…</p>}
      {historial && !historial.length && <p className="muted small">Sin cambios registrados todavía.</p>}
      {historial && historial.length > 0 && (
        <ul className="historial">
          {historial.map(h => (
            <li key={h.id}>
              <strong>{h.comentario}</strong>
              <span className="muted small bloque">{h.usuarioNombre || '—'} · {fechaHora(h.fecha)}</span>
            </li>
          ))}
        </ul>
      )}
    </MarcoModal>
  );
}

// ------------------------------------------------------------ sorteo

function Sorteo({ d, semanaLista, semana, perfil, onListo, onCerrar }: {
  d: Datos;
  semanaLista: Asignacion[];
  semana: string;
  perfil: PerfilUsuario;
  onListo: (m: string) => void;
  onCerrar: () => void;
}) {
  const disponibles = zonasDe(d.catalogo).filter(z => semanaLista.some(a => a.zona === z && a.estado === 'borrador'));
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [resultado, setResultado] = useState<GrupoSorteo[] | null>(null);
  const { enviando, error, setError, enviar } = useEnvio();
  const staff = staffActivos(d.empleados);

  function correrSorteo(zonas: string[]) {
    const r = sortear(semanaLista, zonas, d.empleados);
    if (!r.ok) return setError(r.error);
    setError(null);
    setResultado(r.resultado);
  }

  function guardarReparto() {
    const res = resultado!;
    const ids = res.flatMap(g => g.actividades.map(x => x.asignacionId));
    void enviar(async () => {
      const r = await guardarActividades(db, ids, m => aplicarSorteo(m, res, semana, perfil), perfil, equipoActual());
      if (!r.ok) return r.error;
      onListo('Reparto guardado. Actividades listas para anunciar.');
      return null;
    });
  }

  return (
    <MarcoModal titulo={resultado ? 'Resultado del sorteo' : 'Sortear actividades'} onCerrar={onCerrar} enviando={enviando}>
      {!resultado ? (
        <>
          <p className="muted small">El sorteo reparte ZONAS completas entre el Staff activo para la semana del {rangoSemana(semana)}: todas las actividades de una zona quedan con la misma persona.</p>
          {!disponibles.length ? (
            <p className="muted">No hay zonas con actividades pendientes de organizar esta semana.</p>
          ) : (
            <fieldset className="piezas-liquidar">
              <legend>Zonas</legend>
              <label className="check">
                <input type="checkbox" checked={elegidas.length === disponibles.length} onChange={() => setElegidas(elegidas.length === disponibles.length ? [] : disponibles)} /> <strong>Seleccionar todo</strong>
              </label>
              {disponibles.map(z => (
                <label key={z} className="check">
                  <input type="checkbox" checked={elegidas.includes(z)} onChange={() => setElegidas(es => (es.includes(z) ? es.filter(x => x !== z) : [...es, z]))} /> {z}
                </label>
              ))}
            </fieldset>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button className="btn primario" disabled={!disponibles.length} onClick={() => (elegidas.length ? correrSorteo(elegidas) : setError('Selecciona al menos una zona/vitrina.'))}>Sortear</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">Revisa el reparto por zona antes de guardarlo. Puedes cambiar a la persona a mano.</p>
          {resultado.map((g, i) => (
            <div key={g.zona} className="tarjeta-sorteo">
              <div className="tarjeta-sorteo-cabeza">
                <strong>{g.zona}</strong>
                <select
                  value={g.encargadoId}
                  aria-label={`Responsable de ${g.zona}`}
                  onChange={e => {
                    const emp = staff.find(x => x.id === e.target.value);
                    if (emp) setResultado(rs => rs!.map((x, j) => (j === i ? { ...x, encargadoId: emp.id, encargadoNombre: emp.nombre } : x)));
                  }}
                >
                  {staff.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <ul className="muted small">{g.actividades.map(x => <li key={x.asignacionId}>{x.nombre}</li>)}</ul>
            </div>
          ))}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button className="btn" disabled={enviando} onClick={() => correrSorteo(resultado.map(g => g.zona))}>Repetir sorteo</button>
            <button className="btn primario" disabled={enviando} onClick={guardarReparto}>{enviando ? 'Guardando…' : 'Guardar reparto'}</button>
          </div>
        </>
      )}
    </MarcoModal>
  );
}

// ------------------------------------------------------------ reportes

function imprimirCarta() {
  let estilo = document.getElementById('pagina-ticket');
  if (!estilo) {
    estilo = document.createElement('style');
    estilo.id = 'pagina-ticket';
    document.head.appendChild(estilo);
  }
  estilo.textContent = '@media print { @page { size: letter; margin: 12mm; } }';
  window.print();
}

function Reporte({ d, semana, onCerrar }: { d: Datos; semana: string; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<'semanal' | 'organizacion' | null>(null);
  const generado = useMemo(() => new Date().toLocaleString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }), [tipo]);
  const hoja = tipo && <HojaReporte d={d} semana={semana} tipo={tipo} generado={generado} />;
  return (
    <MarcoModal titulo="Generar reporte" onCerrar={onCerrar}>
      {!tipo ? (
        <div className="eleccion-reporte">
          <button className="btn izq" onClick={() => setTipo('semanal')}>
            <strong>Reporte semanal</strong>
            <span className="muted small">Qué se anunció, quién confirmó y qué se firmó.</span>
          </button>
          <button className="btn izq" onClick={() => setTipo('organizacion')}>
            <strong>Reporte de organización</strong>
            <span className="muted small">Cómo están organizadas las actividades ahora (no anuncia nada).</span>
          </button>
        </div>
      ) : (
        <>
          <div className="reporte-vista">{hoja}</div>
          <div className="acciones">
            <button className="btn" onClick={() => setTipo(null)}>Otro reporte</button>
            <button className="btn primario" onClick={imprimirCarta}>Imprimir / guardar PDF</button>
          </div>
          {/* Fuera del modal (que tiene scroll) para que se imprima completo. */}
          {createPortal(<div className="reporte-impresion" aria-hidden="true">{hoja}</div>, document.body)}
        </>
      )}
    </MarcoModal>
  );
}

function HojaReporte({ d, semana, tipo, generado }: { d: Datos; semana: string; tipo: 'semanal' | 'organizacion'; generado: string }) {
  const semanal = tipo === 'semanal';
  const filas: (Asignacion & { estadoReporte?: string; listaParaAnunciar?: boolean })[] = semanal
    ? filasReporteSemanal(d.asignaciones, semana)
    : filasReporteOrganizacion(d.asignaciones, semana);
  const grupos = agruparPorZona(filas, d.catalogo);
  const columnas = semanal
    ? ['Actividad', 'Periodicidad', 'Día', 'Encargado', 'Estado final', 'Fecha de confirmación', 'Encargado que verificó']
    : ['Actividad', 'Responsable(s)', 'Periodicidad', 'Día', 'Estado'];
  return (
    <div className="hoja-reporte">
      <div className="hoja-cabeza">
        <div>
          <h2>{semanal ? 'Reporte semanal de actividades del Staff' : 'Reporte de organización — vista previa'}</h2>
          <p>Semana del {rangoSemana(semana)}</p>
          <p className="hoja-nota">Generado el {generado}{semanal ? '' : ' — este reporte todavía NO anuncia las actividades.'}</p>
        </div>
        <img src="./imagotipo-ticket.jpg" alt="MW JOYERÍA" />
      </div>
      <table>
        <thead><tr>{columnas.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {!grupos.length && <tr><td colSpan={columnas.length}>{semanal ? 'No se anunciaron actividades esta semana.' : 'No hay actividades en organización para esta semana.'}</td></tr>}
          {grupos.map(g => (
            <FilasZona key={g.zona} zona={g.zona} columnas={columnas.length}>
              {g.items.map(f =>
                semanal ? (
                  <tr key={f.id}>
                    <td>{f.nombre}</td>
                    <td>{f.periodicidad ? PERIODICIDADES[f.periodicidad] : 'Sin definir'}</td>
                    <td>{textoDias(f)}</td>
                    <td>{f.encargadoNombre || '—'}</td>
                    <td className={f.estadoReporte === 'No se realizó' ? 'mal' : 'bien'}>{f.estadoReporte}</td>
                    <td>{f.fechaEnterado ? fechaHora(f.fechaEnterado) : '—'}</td>
                    <td>{f.firmadoPorNombre || '—'}</td>
                  </tr>
                ) : (
                  <tr key={f.id}>
                    <td>{f.nombre}{f.tipo === 'temporal' ? ' (Temporal)' : ''}</td>
                    <td>{nombresResponsables(f)}</td>
                    <td>{f.periodicidad ? PERIODICIDADES[f.periodicidad] : 'Sin definir'}</td>
                    <td>{textoDias(f)}</td>
                    <td className={f.listaParaAnunciar ? 'bien' : 'mal'}>{f.listaParaAnunciar ? 'Lista para anunciar' : 'Falta responsable'}</td>
                  </tr>
                )
              )}
            </FilasZona>
          ))}
        </tbody>
      </table>
      <p className="hoja-nota">
        {semanal
          ? 'Enterado = el empleado confirmó que conocía la actividad. Firmado por Encargado = Encargado confirmó que se realizó. No se realizó = al cierre de la semana no había confirmación de cumplimiento.'
          : 'Esta es una VISTA PREVIA: ninguna actividad se anuncia ni se notifica al generar este reporte. Usa "Anunciar" para publicarlas.'}
      </p>
    </div>
  );
}

function FilasZona({ zona, columnas, children }: { zona: string; columnas: number; children: ReactNode }) {
  return (
    <>
      <tr className="fila-zona"><td colSpan={columnas}>{zona}</td></tr>
      {children}
    </>
  );
}

// ------------------------------------------------------------ Admin: todas

function Todas({ d }: { d: Datos }) {
  const [f, setF] = useState({ texto: '', empleado: '', zona: '', estado: '', desde: '', hasta: '' });
  const [detalle, setDetalle] = useState<Asignacion | null>(null);
  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }));
  const t = f.texto.trim().toLowerCase();
  const lista = d.asignaciones
    .filter(a => a.estado !== 'borrador' && !a.eliminada)
    .filter(a => !t || a.nombre.toLowerCase().includes(t) || a.zona.toLowerCase().includes(t))
    .filter(a => !f.empleado || a.encargados.some(e => e.id === f.empleado))
    .filter(a => !f.zona || a.zona === f.zona)
    .filter(a => !f.estado || a.estado === f.estado)
    .filter(a => !f.desde || a.semanaKey >= f.desde)
    .filter(a => !f.hasta || a.semanaKey <= f.hasta)
    .sort((a, b) => b.semanaKey.localeCompare(a.semanaKey));
  return (
    <>
      <div className="filtros-deseos">
        <input type="search" placeholder="Buscar actividad o zona…" value={f.texto} onChange={e => set('texto', e.target.value)} aria-label="Buscar" />
        <select value={f.empleado} onChange={e => set('empleado', e.target.value)} aria-label="Empleado">
          <option value="">Todo el Staff</option>
          {staffActivos(d.empleados).map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <select value={f.zona} onChange={e => set('zona', e.target.value)} aria-label="Zona">
          <option value="">Todas las zonas</option>
          {zonasDe(d.catalogo).map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select value={f.estado} onChange={e => set('estado', e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).filter(([k]) => k !== 'borrador').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="campo-en-linea"><span>Desde</span><input type="date" value={f.desde} onChange={e => set('desde', e.target.value ? semanaKeyDe(e.target.value) : '')} /></label>
        <label className="campo-en-linea"><span>Hasta</span><input type="date" value={f.hasta} onChange={e => set('hasta', e.target.value ? semanaKeyDe(e.target.value) : '')} /></label>
      </div>
      <p className="muted small">{plural(lista.length)}</p>
      {!lista.length ? (
        <p className="muted vacio">No hay actividades con estos filtros.</p>
      ) : (
        <ul className="lista-filas">
          {lista.map(a => (
            <li key={a.id}>
              <button className="fila-deseo" onClick={() => setDetalle(a)}>
                <span className="fila-principal"><strong>{a.nombre}</strong><span className="muted small">{a.zona}</span></span>
                <span className="small">{rangoSemana(a.semanaKey)}<span className="muted bloque">{textoDias(a)}</span></span>
                <Estado e={a.estado} />
                <span className="small">{nombresResponsables(a)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {detalle && <Detalle a={d.asignaciones.find(x => x.id === detalle.id) ?? detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}
