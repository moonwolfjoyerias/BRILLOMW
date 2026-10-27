// Nómina para Encargado y Administrativo: lo mismo que encargado-nomina.html
// y admin-nomina.html de la página, sobre los mismos documentos.
// - Semana: todos los empleados con el estado y total de esa semana.
// - Detalle: captura de conceptos (cantidad × importe), desfase de horas,
//   fecha y método de pago, historial y comprobante; Encargado la envía a
//   validación y Administración valida, pide corrección o registra el pago.
// - Datos: empleados y catálogo de conceptos.
// - Solicitudes: altas y bajas que Encargado pide y Administración resuelve.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import { puedeEditarNomina, type PerfilUsuario } from '../sesion/perfil';
import { MarcoModal, useEnvio } from './Modal';
import { comprimirFoto } from '../pagina/fotos';
import {
  aplicarDesfase,
  cambiarConcepto,
  cambiarEstadoEmpleado,
  crearSolicitud,
  guardarConcepto,
  guardarEmpleado,
  guardarSemana,
  moverSemana,
  periodoDe,
  quienDe,
  rechazarSolicitud,
  useNomina,
  type AccionFlujo,
  type DatosNomina
} from '../nomina/acciones';
import {
  agregarFila,
  CARGOS_NOMINA,
  calcularTotales,
  conceptoEnUso,
  diasDesfaseInicio,
  editarFila,
  ESTADOS_EMPLEADO,
  ESTADOS_NOMINA_PERIODO,
  etiquetaConcepto,
  filaDesfaseHoras,
  METODOS_PAGO,
  nombreDeSolicitud,
  nuevaSolicitudAlta,
  nuevaSolicitudBaja,
  periodoKeyDe,
  puedeAplicarDesfaseInicio,
  quitarFila,
  rangoSemanaNomina,
  salarioDiario,
  semanaEditable,
  tarifaHoraExtra,
  tarifaHoraNormal,
  textoDesfaseInicio,
  textoEstado,
  validarConcepto,
  validarEmpleado,
  type CambioCaptura,
  type ConceptoCatalogo,
  type DatosEmpleado,
  type Empleado,
  type FilaNomina,
  type Periodo
} from '../nomina/modelo';

const $ = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const CHIP_ESTADO: Record<string, string> = {
  pendiente: 'chip pendiente',
  necesita_validacion_admin: 'chip neutro',
  validado_admin: 'chip ok',
  correccion_solicitada: 'chip agotado',
  pagado: 'chip ok'
};
const ChipEstado = ({ estado }: { estado: string }) => <span className={CHIP_ESTADO[estado] ?? 'chip neutro'}>{textoEstado(estado)}</span>;

type Vista = 'semana' | 'datos' | 'solicitudes';

export function Nomina({ perfil }: { perfil: PerfilUsuario }) {
  const nomina = useNomina(db);
  const [vista, setVista] = useState<Vista>('semana');
  const [semana, setSemana] = useState(periodoKeyDe());
  const [empleadoId, setEmpleadoId] = useState<string | null>(null);
  const edita = puedeEditarNomina(perfil);
  const admin = perfil.rol === 'admin';

  if (nomina.estado === 'cargando') return <p className="muted">Cargando Nómina…</p>;
  if (nomina.estado === 'error') return <p className="error">No se pudo cargar Nómina. Revisa la conexión.</p>;
  const pendientes = nomina.solicitudes.filter(s => s.estado === 'pendiente').length;
  const empleado = empleadoId ? nomina.empleados.find(e => e.id === empleadoId) : undefined;

  return (
    <section className="nomina">
      <div className="encabezado-seccion">
        <h1>Nómina</h1>
        <p className="muted">Semanal, de lunes a domingo. Lo mismo que Nómina de la página: lo que se cambie aquí o allá se ve en los dos.</p>
      </div>
      {!edita && (
        <p className="aviso-pendiente">Tu cuenta no tiene permiso de Nómina: puedes consultar, pero no guardar. Administración lo asigna en la página (Configuración → Cuentas).</p>
      )}
      <nav className="pestanas" aria-label="Vistas de Nómina">
        <button className={vista === 'semana' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('semana')}>Nómina de la semana</button>
        <button className={vista === 'datos' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('datos')}>Datos</button>
        <button className={vista === 'solicitudes' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('solicitudes')}>
          {admin ? 'Solicitudes' : 'Mis solicitudes de empleados'}{pendientes ? ` (${pendientes})` : ''}
        </button>
      </nav>
      {vista === 'semana' &&
        (empleado ? (
          <DetalleSemana key={`${empleado.id}-${semana}`} d={nomina} e={empleado} semana={semana} setSemana={setSemana} perfil={perfil} edita={edita} onVolver={() => setEmpleadoId(null)} />
        ) : (
          <ListaSemana d={nomina} semana={semana} setSemana={setSemana} onAbrir={setEmpleadoId} />
        ))}
      {vista === 'datos' && <Datos d={nomina} perfil={perfil} edita={edita} />}
      {vista === 'solicitudes' && <Solicitudes d={nomina} perfil={perfil} edita={edita} />}
    </section>
  );
}

// ------------------------------------------------------------ semana

function semanasDisponibles(d: DatosNomina, empleadoId?: string): string[] {
  const set = new Set<string>();
  const hoy = new Date();
  for (let i = 0; i < 12; i++) set.add(periodoKeyDe(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 7 * i)));
  d.periodos.filter(p => !empleadoId || p.empleadoId === empleadoId).forEach(p => p.periodoKey && set.add(p.periodoKey));
  return [...set].sort((a, b) => b.localeCompare(a));
}

function SelectorSemana({ d, semana, setSemana, empleadoId }: { d: DatosNomina; semana: string; setSemana: (s: string) => void; empleadoId?: string }) {
  const semanas = semanasDisponibles(d, empleadoId);
  if (!semanas.includes(semana)) semanas.unshift(semana);
  return (
    <select value={semana} onChange={e => setSemana(e.target.value)} aria-label="Semana">
      {semanas.map(s => (
        <option key={s} value={s}>{rangoSemanaNomina(s)}{s === periodoKeyDe() ? ' (actual)' : ''}</option>
      ))}
    </select>
  );
}

function ListaSemana({ d, semana, setSemana, onAbrir }: { d: DatosNomina; semana: string; setSemana: (s: string) => void; onAbrir: (id: string) => void }) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState('todos');
  const [cargo, setCargo] = useState('todos');
  const filas = d.empleados
    .filter(e => e.estado === 'activo' || d.periodos.some(p => p.empleadoId === e.id && p.periodoKey === semana))
    .filter(e => cargo === 'todos' || e.cargo === cargo)
    .filter(e => {
      const t = texto.trim().toLowerCase();
      return !t || e.nombre.toLowerCase().includes(t) || e.numeroEmpleado.toLowerCase().includes(t) || (CARGOS_NOMINA[e.cargo] ?? '').toLowerCase().includes(t);
    })
    .map(e => ({ e, p: periodoDe(d, e, semana) }))
    .filter(f => estado === 'todos' || f.p.estadoNomina === estado)
    .sort((a, b) => a.e.nombre.localeCompare(b.e.nombre));
  const total = filas.reduce((s, f) => s + f.p.totalAPagar, 0);
  const porValidar = filas.filter(f => f.p.estadoNomina === 'necesita_validacion_admin').length;
  return (
    <>
      <div className="filtros-deseos">
        <input type="search" placeholder="Buscar por nombre, número o cargo…" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Buscar" />
        <SelectorSemana d={d} semana={semana} setSemana={setSemana} />
        <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Estado">
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADOS_NOMINA_PERIODO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={cargo} onChange={e => setCargo(e.target.value)} aria-label="Cargo">
          <option value="todos">Todos los cargos</option>
          {Object.entries(CARGOS_NOMINA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="resumen-apartados">
        <div className="dato"><span>Semana</span><strong>{rangoSemanaNomina(semana)}</strong></div>
        <div className="dato"><span>Total de la semana</span><strong>{$(total)}</strong><span className="small">{filas.length} empleado{filas.length === 1 ? '' : 's'}</span></div>
        <div className="dato"><span>Esperando validación</span><strong>{porValidar}</strong></div>
      </div>
      {!d.empleados.length ? (
        <p className="muted">Todavía no hay empleados de nómina. Se agregan en Datos (Administración) o con una solicitud de alta.</p>
      ) : !filas.length ? (
        <p className="muted">No se encontraron empleados con ese filtro.</p>
      ) : (
        <div className="lista-nomina">
          {filas.map(({ e, p }) => (
            <button key={e.id} className="fila-nomina" onClick={() => onAbrir(e.id)}>
              <span className="fila-principal">
                <strong>{e.nombre}</strong>
                <span className="muted small">{e.numeroEmpleado} · {CARGOS_NOMINA[e.cargo] ?? e.cargo}{e.estado === 'inactivo' ? ' · Inactivo' : ''}{p.guardado ? '' : ' · Sin capturar'}</span>
              </span>
              <ChipEstado estado={p.estadoNomina} />
              <strong className="monto">{$(p.totalAPagar)}</strong>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function DetalleSemana({ d, e, semana, setSemana, perfil, edita, onVolver }: {
  d: DatosNomina;
  e: Empleado;
  semana: string;
  setSemana: (s: string) => void;
  perfil: PerfilUsuario;
  edita: boolean;
  onVolver: () => void;
}) {
  const p = useMemo(() => periodoDe(d, e, semana), [d, e, semana]);
  const huella = JSON.stringify([p.conceptos, p.fechaPagoProgramada, p.metodoPago, p.guardado]);
  const [base, setBase] = useState<FilaNomina[]>(p.conceptos);
  const [filas, setFilas] = useState<FilaNomina[]>(p.conceptos);
  const [cambios, setCambios] = useState<CambioCaptura[]>([]);
  const [fecha, setFecha] = useState(p.fechaPagoProgramada);
  const [metodo, setMetodo] = useState(p.metodoPago);
  const [modal, setModal] = useState<null | 'agregar' | 'desfase' | 'historial' | 'corregir' | 'pago' | 'comprobante'>(null);
  const { enviando, error, setError, enviar } = useEnvio();
  const sucio = cambios.length > 0 || fecha !== p.fechaPagoProgramada || metodo !== p.metodoPago;
  const editable = edita && semanaEditable(p);
  const admin = perfil.rol === 'admin';
  const totales = calcularTotales(filas);

  // Lo que cambie la página u otro equipo llega solo, salvo que haya cambios sin guardar aquí.
  useEffect(() => {
    if (sucio) return;
    setBase(p.conceptos);
    setFilas(p.conceptos);
    setFecha(p.fechaPagoProgramada);
    setMetodo(p.metodoPago);
  }, [huella]);

  const aplicar = (r: { filas: FilaNomina[]; cambio: CambioCaptura | null }) => {
    setFilas(r.filas);
    if (r.cambio) setCambios(c => [...c, r.cambio!]);
  };
  const salir = (accion: () => void) => {
    if (sucio && !window.confirm('Hay cambios sin guardar en esta semana. ¿Salir sin guardarlos?')) return;
    accion();
  };
  const guardar = () =>
    enviar(async () => {
      const err = await guardarSemana(db, e.id, semana, base, filas, cambios, { fechaPagoProgramada: fecha, metodoPago: metodo }, perfil, equipoActual());
      if (!err) {
        setCambios([]);
        setBase(filas);
      }
      return err;
    });
  const descartar = () => {
    setFilas(p.conceptos);
    setBase(p.conceptos);
    setCambios([]);
    setFecha(p.fechaPagoProgramada);
    setMetodo(p.metodoPago);
    setError(null);
  };
  const mover = (accion: AccionFlujo) => enviar(() => moverSemana(db, e.id, semana, accion, perfil, equipoActual()));
  const puedeEnviar = !admin && (p.estadoNomina === 'pendiente' || p.estadoNomina === 'correccion_solicitada');
  const puedeValidar = admin && p.estadoNomina === 'necesita_validacion_admin';
  const vistaPeriodo: Periodo = { ...p, conceptos: filas, ...totales, fechaPagoProgramada: fecha, metodoPago: metodo };

  return (
    <div className="detalle-nomina">
      <div className="acciones izq">
        <button className="btn" onClick={() => salir(onVolver)}>← Volver a la lista</button>
        <SelectorSemana d={d} semana={semana} setSemana={s => salir(() => setSemana(s))} empleadoId={e.id} />
      </div>

      <div className="tarjeta-caja">
        <div className="fila-titulo">
          <h2>Estado de la nómina — {rangoSemanaNomina(semana)}</h2>
          <ChipEstado estado={p.estadoNomina} />
        </div>
        {p.validacionEncargado && <p className="muted small">Enviada a validación por {p.validacionEncargado.usuarioNombre} el {fechaHora(p.validacionEncargado.fecha)}</p>}
        {p.validacionAdmin && <p className="muted small">Validada por {p.validacionAdmin.usuarioNombre} el {fechaHora(p.validacionAdmin.fecha)}</p>}
        {p.estadoNomina === 'correccion_solicitada' && p.comentarioCorreccion && (
          <p className="aviso-pendiente"><strong>Comentario de Administración:</strong> {p.comentarioCorreccion}</p>
        )}
        {p.estadoNomina === 'necesita_validacion_admin' && !admin && <p className="muted small">Esperando revisión de Administración.</p>}
        {p.estadoPago.estado === 'pagada' && (
          <p className="aviso-ok">Pagada el {fechaCorta(p.estadoPago.fechaPago)} por {p.estadoPago.registradoPor} — {$(p.estadoPago.montoPagado ?? 0)}</p>
        )}
        {edita && (
          <div className="acciones izq">
            {puedeEnviar && (
              <button className="btn primario" disabled={enviando || sucio} title={sucio ? 'Primero guarda los cambios' : undefined} onClick={() => {
                if (window.confirm(`¿Enviar la nómina de ${e.nombre} a validación de Administración?`)) void mover({ tipo: 'enviar' });
              }}>Validar nómina (enviar a Administración)</button>
            )}
            {puedeValidar && (
              <>
                <button className="btn" disabled={enviando || sucio} onClick={() => setModal('corregir')}>Solicitar revisión nuevamente</button>
                <button className="btn primario" disabled={enviando || sucio} onClick={() => {
                  if (window.confirm(`¿Validar la nómina de ${e.nombre}? Encargado será notificado y podrá registrarse el pago.`)) void mover({ tipo: 'validar' });
                }}>Validar</button>
              </>
            )}
            {admin && p.estadoNomina === 'validado_admin' && (
              <button className="btn primario" disabled={enviando || sucio} onClick={() => setModal('pago')}>Registrar pago</button>
            )}
          </div>
        )}
      </div>

      <div className="cuenta-columnas">
        <div className="tarjeta-caja">
          <h3>{e.nombre}</h3>
          <dl className="datos">
            <dt>Número de empleado</dt><dd>{e.numeroEmpleado}</dd>
            <dt>Cargo</dt><dd>{CARGOS_NOMINA[e.cargo] ?? e.cargo} · {ESTADOS_EMPLEADO[e.estado] ?? e.estado}</dd>
            <dt>Fecha de inicio</dt><dd>{fechaCorta(e.fechaInicio)}</dd>
            <dt>Salario base semanal</dt><dd>{$(e.salarioBase)}</dd>
            <dt>Pago por hora extra</dt><dd>{$(e.pagoHoraExtra)}</dd>
            <dt>Horario</dt><dd>{e.diasPorSemana} días/semana · {e.horasPorDia} hrs/turno</dd>
            <dt>Desfase de inicio</dt><dd>{textoDesfaseInicio(e)}</dd>
            {e.fechaBaja && <><dt>Fecha de baja</dt><dd>{fechaCorta(e.fechaBaja)}</dd></>}
          </dl>
        </div>

        <div className="tarjeta-caja">
          <h3>Nómina — {rangoSemanaNomina(semana)}</h3>
          <div className="rejilla-form">
            <label className="campo"><span>Fecha de pago</span><input type="date" value={fecha} disabled={!editable} onChange={ev => setFecha(ev.target.value)} /></label>
            <label className="campo">
              <span>Método de pago</span>
              <select value={metodo} disabled={!editable} onChange={ev => setMetodo(ev.target.value)}>
                {[...new Set([...METODOS_PAGO, metodo])].map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <table className="tabla conceptos-nomina">
            <thead><tr><th>Concepto</th><th>Cantidad</th><th>Importe</th><th>Total</th><th aria-label="Quitar" /></tr></thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.filaId}>
                  <td>{f.nombre}<span className="muted small bloque">{f.tipo === 'percepcion' ? 'Percepción' : 'Deducción'}</span></td>
                  <td><CeldaNumero valor={f.cantidad} editable={editable} etiqueta={`Cantidad de ${f.nombre}`} onCambio={v => aplicar(editarFila(filas, f.filaId, 'cantidad', v))} /></td>
                  <td><CeldaNumero valor={f.importe} editable={editable} etiqueta={`Importe de ${f.nombre}`} dinero onCambio={v => aplicar(editarFila(filas, f.filaId, 'importe', v))} /></td>
                  <td><strong>{f.tipo === 'deduccion' ? '−' : ''}{$(f.total)}</strong></td>
                  <td>
                    {editable && f.conceptoId !== 'sueldo_base' && (
                      <button className="btn peligro mini" onClick={() => window.confirm(`¿Quitar "${f.nombre}" (${$(f.total)}) de esta semana?`) && aplicar(quitarFila(filas, f.filaId))}>Quitar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <div className="acciones izq">
              <button className="btn" onClick={() => setModal('agregar')}>+ Agregar concepto</button>
              <button className="btn" onClick={() => setModal('desfase')}>+ Desfase de horas</button>
            </div>
          )}
          <dl className="totales">
            <dt>Percepciones</dt><dd>{$(totales.totalPercepciones)}</dd>
            <dt>Deducciones</dt><dd>−{$(totales.totalDeducciones)}</dd>
            <dt className="total">Total a pagar</dt><dd className="total">{$(totales.totalAPagar)}</dd>
          </dl>
          {error && <p className="error">{error}</p>}
          <div className="acciones">
            <button className="btn" onClick={() => setModal('historial')}>Historial</button>
            <button className="btn" onClick={() => setModal('comprobante')}>Comprobante</button>
            {editable && sucio && <button className="btn" disabled={enviando} onClick={descartar}>Descartar</button>}
            {editable && (
              <button className="btn primario" disabled={enviando || (!sucio && p.guardado)} onClick={() => void guardar()}>
                {enviando ? 'Guardando…' : p.guardado ? 'Guardar cambios' : 'Guardar semana'}
              </button>
            )}
          </div>
          {!semanaEditable(p) && <p className="muted small">Esta semana ya se pagó: el recibo queda como se pagó.</p>}
        </div>
      </div>

      {modal === 'agregar' && <AgregarConcepto conceptos={d.conceptos} onCerrar={() => setModal(null)} onAgregar={f => { aplicar(agregarFila(filas, f)); setModal(null); }} />}
      {modal === 'desfase' && (
        <DesfaseHoras
          e={e}
          perfil={perfil}
          onCerrar={() => setModal(null)}
          sucio={sucio}
          onAgregar={f => { aplicar(agregarFila(filas, f)); setModal(null); }}
          onInicioAplicado={k => { setModal(null); setSemana(k); }}
        />
      )}
      {modal === 'historial' && <Historial d={d} e={e} semana={semana} onCerrar={() => setModal(null)} />}
      {modal === 'corregir' && <Corregir onCerrar={() => setModal(null)} onEnviar={async c => { const err = await moverSemana(db, e.id, semana, { tipo: 'corregir', comentario: c }, perfil, equipoActual()); if (!err) setModal(null); return err; }} />}
      {modal === 'pago' && <RegistrarPago total={p.totalAPagar} onCerrar={() => setModal(null)} onEnviar={async m => { const err = await moverSemana(db, e.id, semana, { tipo: 'pagar', monto: m }, perfil, equipoActual()); if (!err) setModal(null); return err; }} />}
      {modal === 'comprobante' && <Comprobante e={e} p={vistaPeriodo} sucio={sucio} onCerrar={() => setModal(null)} />}
    </div>
  );
}

/** Número que se edita en su lugar: se aplica al salir del campo o con Enter. */
function CeldaNumero({ valor, editable, etiqueta, dinero, onCambio }: { valor: number; editable: boolean; etiqueta: string; dinero?: boolean; onCambio: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  if (!editable) return <>{dinero ? $(valor) : valor}</>;
  const aplicar = () => {
    const v = parseFloat(texto);
    if (Number.isNaN(v)) setTexto(String(valor));
    else if (v !== valor) onCambio(v);
  };
  return (
    <input
      className="celda-numero"
      type="number"
      step="0.01"
      inputMode="decimal"
      aria-label={etiqueta}
      value={texto}
      onChange={ev => setTexto(ev.target.value)}
      onBlur={aplicar}
      onKeyDown={ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); aplicar(); }
        if (ev.key === 'Escape') setTexto(String(valor));
      }}
    />
  );
}

function AgregarConcepto({ conceptos, onCerrar, onAgregar }: { conceptos: ConceptoCatalogo[]; onCerrar: () => void; onAgregar: (f: Omit<FilaNomina, 'filaId' | 'total'>) => void }) {
  const disponibles = conceptos.filter(c => c.activo && !c.fijo).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const [id, setId] = useState(disponibles[0]?.id ?? '');
  const [cantidad, setCantidad] = useState('1');
  const [importe, setImporte] = useState('0');
  const c = disponibles.find(x => x.id === id);
  const enviar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!c) return;
    onAgregar({ conceptoId: c.id, nombre: c.nombre, tipo: c.tipo, cantidad: parseFloat(cantidad) || 0, importe: parseFloat(importe) || 0 });
  };
  return (
    <MarcoModal titulo="Agregar concepto" onCerrar={onCerrar} onEnviar={enviar}>
      {!disponibles.length ? (
        <p className="muted">No hay conceptos activos para agregar. Se crean en Datos → Conceptos.</p>
      ) : (
        <>
          <label className="campo">
            <span>Concepto</span>
            <select value={id} onChange={ev => setId(ev.target.value)}>
              {disponibles.map(x => <option key={x.id} value={x.id}>{etiquetaConcepto(x)}</option>)}
            </select>
          </label>
          <div className="rejilla-form">
            <label className="campo"><span>Cantidad</span><input type="number" step="0.01" value={cantidad} onChange={ev => setCantidad(ev.target.value)} /></label>
            <label className="campo"><span>Importe</span><input type="number" step="0.01" value={importe} onChange={ev => setImporte(ev.target.value)} /></label>
          </div>
          <p className="muted small">Total: {$((parseFloat(cantidad) || 0) * (parseFloat(importe) || 0))}. Se guarda al tocar "Guardar cambios".</p>
          <div className="acciones"><button className="btn primario" type="submit">Agregar</button></div>
        </>
      )}
    </MarcoModal>
  );
}

function DesfaseHoras({ e, perfil, sucio, onCerrar, onAgregar, onInicioAplicado }: {
  e: Empleado;
  perfil: PerfilUsuario;
  sucio: boolean;
  onCerrar: () => void;
  onAgregar: (f: Omit<FilaNomina, 'filaId' | 'total'>) => void;
  onInicioAplicado: (periodoKey: string) => void;
}) {
  const [tipo, setTipo] = useState<'inicio' | 'normal'>(puedeAplicarDesfaseInicio(e) ? 'inicio' : 'normal');
  const [modo, setModo] = useState<'pagar_parcial' | 'acumular_siguiente'>('pagar_parcial');
  const [horas, setHoras] = useState('1');
  const [extra, setExtra] = useState(false);
  const { enviando, error, setError, enviar } = useEnvio();
  const dias = diasDesfaseInicio(e.fechaInicio);
  const diario = salarioDiario(e);
  const h = parseFloat(horas) || 0;
  const tarifa = extra ? tarifaHoraExtra(e) : tarifaHoraNormal(e);
  const razonSinInicio = e.desfaseInicioEstado
    ? e.desfaseInicioEstado.pagado
      ? 'Ya se pagó su desfase de inicio; no se puede volver a aplicar.'
      : `Ya está aplicado (semana ${rangoSemanaNomina(e.desfaseInicioEstado.periodoAplicado)}), pendiente de pago.`
    : 'Este empleado no tiene desfase de inicio: su fecha de inicio coincide con el arranque de la semana de referencia (miércoles).';

  const confirmar = (ev: FormEvent) => {
    ev.preventDefault();
    if (tipo === 'normal') {
      if (h <= 0) { setError('Captura cuántas horas fueron.'); return; }
      onAgregar(filaDesfaseHoras(e, h, extra));
      return;
    }
    if (sucio) { setError('Primero guarda o descarta los cambios de esta semana.'); return; }
    void enviar(async () => {
      const err = await aplicarDesfase(db, e.id, modo, perfil, equipoActual());
      if (!err) {
        const inicio = periodoKeyDe(new Date(`${e.fechaInicio}T00:00:00`));
        const siguiente = new Date(`${inicio}T00:00:00`);
        siguiente.setDate(siguiente.getDate() + 7);
        onInicioAplicado(modo === 'pagar_parcial' ? inicio : periodoKeyDe(siguiente));
      }
      return err;
    });
  };

  return (
    <MarcoModal titulo="Desfase de horas" onCerrar={onCerrar} onEnviar={confirmar} enviando={enviando}>
      <p className="muted">{e.nombre}</p>
      <label className="campo">
        <span>Tipo</span>
        <select value={tipo} onChange={ev => setTipo(ev.target.value as 'inicio' | 'normal')}>
          <option value="inicio">De inicio (primera semana incompleta)</option>
          <option value="normal">Normal (cambio de turno / horas de más o de menos)</option>
        </select>
      </label>
      {tipo === 'inicio' ? (
        puedeAplicarDesfaseInicio(e) ? (
          <>
            <p className="nota-apartado">Entró el {fechaCorta(e.fechaInicio)}: le tocan <strong>{dias} día{dias === 1 ? '' : 's'}</strong> sueltos ({$(diario * dias)}). Se aplica una sola vez y se guarda en ese momento.</p>
            <label className="campo">
              <span>¿Cómo se paga?</span>
              <select value={modo} onChange={ev => setModo(ev.target.value as typeof modo)}>
                <option value="pagar_parcial">Pagar esa semana incompleta ({$(diario * dias)} en vez del sueldo completo)</option>
                <option value="acumular_siguiente">Acumular con la semana siguiente (sueldo completo + {dias} día{dias === 1 ? '' : 's'})</option>
              </select>
            </label>
          </>
        ) : (
          <p className="nota-apartado">{razonSinInicio}</p>
        )
      ) : (
        <>
          <div className="rejilla-form">
            <label className="campo"><span>¿Cuántas horas?</span><input type="number" step="0.5" min="0.5" value={horas} onChange={ev => setHoras(ev.target.value)} /></label>
            <label className="campo">
              <span>¿Se pagan como…?</span>
              <select value={extra ? 'extra' : 'normal'} onChange={ev => setExtra(ev.target.value === 'extra')}>
                <option value="normal">Horas normales</option>
                <option value="extra">Horas extra (doble)</option>
              </select>
            </label>
          </div>
          <p className="nota-apartado">{h} hora{h === 1 ? '' : 's'} × {$(tarifa)} = {$(h * tarifa)}</p>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button className="btn primario" type="submit" disabled={enviando || (tipo === 'inicio' && !puedeAplicarDesfaseInicio(e))}>
          {tipo === 'inicio' ? 'Aplicar desfase' : 'Agregar'}
        </button>
      </div>
    </MarcoModal>
  );
}

function Historial({ d, e, semana, onCerrar }: { d: DatosNomina; e: Empleado; semana: string; onCerrar: () => void }) {
  const ajustes = d.ajustes.filter(a => a.empleadoId === e.id && a.periodoKey === semana).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const estados = d.estados.filter(a => a.empleadoId === e.id && a.periodoKey === semana).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <MarcoModal titulo="Historial de la semana" onCerrar={onCerrar}>
      <p className="muted">{e.nombre} · {rangoSemanaNomina(semana)}</p>
      <h3>Estados</h3>
      {!estados.length ? <p className="muted small">Sin cambios de estado.</p> : (
        <ul className="historial">
          {estados.map(h => (
            <li key={h.id}>
              <strong>{textoEstado(h.estadoAnterior)} → {textoEstado(h.estadoNuevo)}</strong>
              <span className="muted small bloque">{h.usuarioNombre} · {fechaHora(h.fecha)}{h.comentario ? ` · ${h.comentario}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      <h3>Ajustes</h3>
      {!ajustes.length ? <p className="muted small">Todavía no hay ajustes registrados en esta semana.</p> : (
        <ul className="historial">
          {ajustes.map(a => (
            <li key={a.id}>
              <strong>{a.concepto} — {a.campo}</strong>
              <span className="muted small bloque">{a.valorAnterior} → {a.valorNuevo} · {fechaHora(a.fecha)} · {a.usuarioAdminNombre}{a.motivo ? ` · ${a.motivo}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </MarcoModal>
  );
}

function Corregir({ onCerrar, onEnviar }: { onCerrar: () => void; onEnviar: (comentario: string) => Promise<string | null> }) {
  const [comentario, setComentario] = useState('');
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Solicitar revisión nuevamente" onCerrar={onCerrar} enviando={enviando} onEnviar={ev => { ev.preventDefault(); void enviar(() => onEnviar(comentario)); }}>
      <label className="campo"><span>¿Qué debe corregir Encargado?</span><textarea rows={4} value={comentario} onChange={ev => setComentario(ev.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>Enviar a Encargado</button></div>
    </MarcoModal>
  );
}

function RegistrarPago({ total, onCerrar, onEnviar }: { total: number; onCerrar: () => void; onEnviar: (monto: number) => Promise<string | null> }) {
  const [monto, setMonto] = useState(total.toFixed(2));
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Registrar pago de nómina" onCerrar={onCerrar} enviando={enviando} onEnviar={ev => { ev.preventDefault(); void enviar(() => onEnviar(parseFloat(monto))); }}>
      <label className="campo"><span>Monto pagado</span><input type="number" step="0.01" value={monto} onChange={ev => setMonto(ev.target.value)} /></label>
      <p className="nota-apartado"><strong>Recordatorio.</strong> El pago se hace por fuera; aquí solo se registra que ya ocurrió.</p>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>Registrar pago</button></div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ comprobante

function imprimirCarta() {
  let estilo = document.getElementById('pagina-ticket');
  if (!estilo) {
    estilo = document.createElement('style');
    estilo.id = 'pagina-ticket';
    document.head.appendChild(estilo);
  }
  estilo.textContent = '@media print { @page { size: letter; margin: 8mm; } }';
  window.print();
}

function Comprobante({ e, p, sucio, onCerrar }: { e: Empleado; p: Periodo; sucio: boolean; onCerrar: () => void }) {
  const hoja = (
    <div className="hoja-recibo">
      <ReciboNomina e={e} p={p} />
      <hr className="corte-recibo" />
      <ReciboNomina e={e} p={p} />
    </div>
  );
  return (
    <MarcoModal titulo="Comprobante de pago" onCerrar={onCerrar}>
      {sucio && <p className="aviso-pendiente">Hay cambios sin guardar: el comprobante los incluye, pero todavía no están guardados.</p>}
      <div className="reporte-vista"><ReciboNomina e={e} p={p} /></div>
      <p className="muted small">Se imprime en hoja carta con dos copias (una para la tienda y otra para el colaborador), como en la página.</p>
      <div className="acciones"><button className="btn primario" onClick={imprimirCarta}>Imprimir / guardar PDF</button></div>
      {createPortal(<div className="reporte-impresion" aria-hidden="true">{hoja}</div>, document.body)}
    </MarcoModal>
  );
}

const dmy = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const f = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(f.getTime()) ? '—' : `${f.getDate()}/${f.getMonth() + 1}/${f.getFullYear()}`;
};

/** Mismo machote que el comprobante de la página (franjas lila, tres pares concepto/importe por fila). */
function ReciboNomina({ e, p }: { e: Empleado; p: Periodo }) {
  const domingo = new Date(`${p.periodoKey}T00:00:00`);
  domingo.setDate(domingo.getDate() + 6);
  const enFilas = (lista: FilaNomina[]) => {
    const filas: (FilaNomina | null)[][] = [];
    const n = Math.max(2, Math.ceil(lista.length / 3));
    for (let i = 0; i < n; i++) filas.push([lista[i * 3] ?? null, lista[i * 3 + 1] ?? null, lista[i * 3 + 2] ?? null]);
    return filas;
  };
  const percepciones = enFilas(p.conceptos.filter(c => c.tipo === 'percepcion'));
  const deducciones = enFilas(p.conceptos.filter(c => c.tipo === 'deduccion'));
  const pagada = p.estadoPago.estado === 'pagada';
  const fila = (f: (FilaNomina | null)[], i: number) => (
    <tr key={i}>
      {f.flatMap((c, j) => [<td key={`n${j}`} className="c">{c?.nombre ?? ''}</td>, <td key={`t${j}`} className="c">{c ? $(c.total) : ''}</td>])}
    </tr>
  );
  return (
    <div className="recibo-nomina">
      <table>
        <colgroup>{['17%', '12.5%', '15.5%', '12.5%', '13.5%', '10.5%', '7%', '11.5%'].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <tbody>
          <tr>
            <td colSpan={6} className="sin chico">Ignacio Aldama #400 Local 21, Centro Histórico, San Luis Potosí, San Luis Potosí, CP 78000</td>
            <td colSpan={2} rowSpan={4} className="sin logo"><img src="./isotipo.png" alt="MW Joyería" /></td>
          </tr>
          <tr><td colSpan={6} className="sin"><strong>Colaborador(a):</strong> {e.nombre}</td></tr>
          <tr>
            <td className="sin"><strong>Inicio de labores:</strong></td><td className="sin">{dmy(e.fechaInicio)}</td>
            <td className="sin"><strong>ID EMPLEADO</strong></td><td className="sin">{e.numeroEmpleado}</td><td colSpan={2} className="sin" />
          </tr>
          <tr>
            <td className="sin"><strong>Fecha de pago</strong></td><td className="sin">{pagada ? dmy(p.estadoPago.fechaPago) : `${dmy(p.fechaPagoProgramada)} (programada)`}</td>
            <td className="sin"><strong>Metodo de pago</strong></td><td className="sin">{p.metodoPago || e.metodoPago}</td><td colSpan={2} className="sin" />
          </tr>
          <tr><td colSpan={8} className="lila titulo">RECIBO DE PAGO</td></tr>
          <tr>
            <td className="lila c"><strong>FECHA INICIAL:</strong></td><td className="lila c">{dmy(p.periodoKey)}</td>
            <td className="lila c"><strong>FECHA FINAL:</strong></td><td className="lila c">{dmy(domingo.toISOString().slice(0, 10))}</td>
            <td className="lila c"><strong>DIAS:</strong></td><td className="lila c">7</td>
            <td rowSpan={3 + percepciones.length + deducciones.length} className="c"><strong>TOTAL</strong></td>
            <td rowSpan={3 + percepciones.length + deducciones.length} className="c total">{$(p.totalAPagar)}</td>
          </tr>
          <tr><td colSpan={6} className="lila c"><strong>PERCEPCIONES</strong></td></tr>
          {percepciones.map(fila)}
          <tr><td colSpan={6} className="lila c"><strong>DEDUCIONES</strong></td></tr>
          {deducciones.map(fila)}
        </tbody>
      </table>
      <p className="leyenda">Recibí el total anotado, quedando la empresa al corriente con el pago correspondiente al periodo arriba indicado, y estoy de acuerdo con el total recibido.</p>
      <div className="firma">Nombre y Firma</div>
    </div>
  );
}

// ------------------------------------------------------------ datos

function Datos({ d, perfil, edita }: { d: DatosNomina; perfil: PerfilUsuario; edita: boolean }) {
  const [tab, setTab] = useState<'empleados' | 'conceptos'>('empleados');
  return (
    <>
      <nav className="pestanas" aria-label="Datos de Nómina">
        <button className={tab === 'empleados' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setTab('empleados')}>Empleados</button>
        <button className={tab === 'conceptos' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setTab('conceptos')}>Conceptos</button>
      </nav>
      {tab === 'empleados' ? <Empleados d={d} perfil={perfil} edita={edita} /> : <Conceptos d={d} perfil={perfil} edita={edita} />}
    </>
  );
}

function Empleados({ d, perfil, edita }: { d: DatosNomina; perfil: PerfilUsuario; edita: boolean }) {
  const admin = perfil.rol === 'admin';
  const [editando, setEditando] = useState<Empleado | 'nuevo' | null>(null);
  const [baja, setBaja] = useState<Empleado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lista = [...d.empleados].sort((a, b) => (a.estado === b.estado ? a.nombre.localeCompare(b.nombre) : a.estado === 'activo' ? -1 : 1));
  return (
    <>
      <p className="muted small">
        {admin
          ? 'Dar de baja nunca borra: el empleado queda inactivo y su historial de nómina se conserva.'
          : 'Puedes ver y editar sus datos. Las altas y bajas siempre requieren aprobación de Administración.'}
      </p>
      {edita && admin && <div className="acciones izq"><button className="btn primario" onClick={() => setEditando('nuevo')}>+ Agregar empleado</button></div>}
      {error && <p className="error">{error}</p>}
      <div className="lista-nomina">
        {lista.map(e => (
          <div key={e.id} className="fila-nomina estatica">
            <span className="fila-principal">
              <strong>{e.nombre}</strong>
              <span className="muted small">{e.numeroEmpleado} · {CARGOS_NOMINA[e.cargo] ?? e.cargo} · desde {fechaCorta(e.fechaInicio)} · {$(e.salarioBase)}/semana · hora extra {$(e.pagoHoraExtra)}</span>
            </span>
            <span className={e.estado === 'activo' ? 'chip ok' : 'chip pendiente'}>{ESTADOS_EMPLEADO[e.estado] ?? e.estado}</span>
            {edita && (
              <span className="acciones-fila">
                <button className="btn mini" onClick={() => setEditando(e)}>Editar</button>
                {e.estado === 'activo' ? (
                  <button className="btn peligro mini" onClick={() => setBaja(e)}>{admin ? 'Dar de baja' : 'Solicitar baja'}</button>
                ) : (
                  admin && (
                    <button className="btn mini" onClick={async () => {
                      setError(await cambiarEstadoEmpleado(db, e.id, true, perfil, equipoActual()));
                    }}>Reactivar</button>
                  )
                )}
              </span>
            )}
          </div>
        ))}
      </div>
      {editando && <FormEmpleado e={editando === 'nuevo' ? null : editando} empleados={d.empleados} perfil={perfil} onCerrar={() => setEditando(null)} />}
      {baja && admin && <BajaDirecta e={baja} perfil={perfil} onCerrar={() => setBaja(null)} />}
      {baja && !admin && <SolicitudBaja e={baja} perfil={perfil} onCerrar={() => setBaja(null)} />}
    </>
  );
}

function BajaDirecta({ e, perfil, onCerrar }: { e: Empleado; perfil: PerfilUsuario; onCerrar: () => void }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Dar de baja" onCerrar={onCerrar} enviando={enviando}>
      <p>Vas a dar de baja a <strong>{e.nombre}</strong>. Su historial de nómina se conserva completo; solo deja de aparecer como activo.</p>
      <p className="muted small">Su cuenta de acceso no cambia; si también hay que quitarle el acceso, hazlo en la página (Configuración → Cuentas).</p>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button className="btn peligro" disabled={enviando} onClick={() => void enviar(async () => { const err = await cambiarEstadoEmpleado(db, e.id, false, perfil, equipoActual()); if (!err) onCerrar(); return err; })}>Dar de baja</button>
      </div>
    </MarcoModal>
  );
}

function FormEmpleado({ e, empleados, perfil, onCerrar }: { e: Empleado | null; empleados: Empleado[]; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [f, setF] = useState<DatosEmpleado>({
    numeroEmpleado: e?.numeroEmpleado ?? '',
    nombre: e?.nombre ?? '',
    cargo: e?.cargo ?? 'staff',
    fechaInicio: e?.fechaInicio ?? new Date().toISOString().slice(0, 10),
    salarioBase: e?.salarioBase ?? 0,
    diasPorSemana: e?.diasPorSemana ?? 6,
    horasPorDia: e?.horasPorDia ?? 8,
    metodoPago: e?.metodoPago ?? 'Efectivo',
    fotoUrl: e?.fotoUrl ?? ''
  });
  const { enviando, error, setError, enviar } = useEnvio();
  const set = <K extends keyof DatosEmpleado>(k: K, v: DatosEmpleado[K]) => setF(x => ({ ...x, [k]: v }));
  const enviarForm = (ev: FormEvent) => {
    ev.preventDefault();
    const err = validarEmpleado(f, empleados, e?.id ?? null);
    if (err) { setError(err); return; }
    void enviar(async () => {
      const r = await guardarEmpleado(db, e?.id ?? null, f, perfil, equipoActual());
      if (!r) onCerrar();
      return r;
    });
  };
  return (
    <MarcoModal titulo={e ? 'Editar empleado' : 'Agregar empleado'} onCerrar={onCerrar} onEnviar={enviarForm} enviando={enviando}>
      <div className="rejilla-form">
        <label className="campo"><span>Nombre</span><input value={f.nombre} onChange={ev => set('nombre', ev.target.value)} /></label>
        <label className="campo"><span>Número de empleado</span><input value={f.numeroEmpleado} onChange={ev => set('numeroEmpleado', ev.target.value)} /></label>
        <label className="campo">
          <span>Cargo</span>
          <select value={f.cargo} onChange={ev => set('cargo', ev.target.value)}>{Object.entries(CARGOS_NOMINA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="campo"><span>Fecha de inicio</span><input type="date" value={f.fechaInicio} onChange={ev => set('fechaInicio', ev.target.value)} /></label>
        <label className="campo"><span>Salario base semanal</span><input type="number" step="0.01" value={f.salarioBase} onChange={ev => set('salarioBase', parseFloat(ev.target.value) || 0)} /></label>
        <label className="campo">
          <span>Método de pago</span>
          <select value={f.metodoPago} onChange={ev => set('metodoPago', ev.target.value)}>{METODOS_PAGO.map(m => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="campo"><span>Días por semana</span><input type="number" min="1" max="7" value={f.diasPorSemana} onChange={ev => set('diasPorSemana', parseFloat(ev.target.value) || 6)} /></label>
        <label className="campo"><span>Horas por turno</span><input type="number" min="1" max="24" value={f.horasPorDia} onChange={ev => set('horasPorDia', parseFloat(ev.target.value) || 8)} /></label>
      </div>
      <p className="muted small">Salario diario {$(salarioDiario(f))} · hora normal {$(tarifaHoraNormal(f))} · hora extra (doble) {$(tarifaHoraExtra(f))}</p>
      <label className="campo">
        <span>Foto (opcional)</span>
        <input type="file" accept="image/*" onChange={async ev => {
          const archivo = ev.target.files?.[0];
          if (!archivo) return;
          try { set('fotoUrl', await comprimirFoto(archivo, 400, 0.8)); } catch { setError('No se pudo leer la foto.'); }
        }} />
      </label>
      {f.fotoUrl && <img className="foto-empleado" src={f.fotoUrl} alt="Foto del empleado" />}
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></div>
    </MarcoModal>
  );
}

function Conceptos({ d, perfil, edita }: { d: DatosNomina; perfil: PerfilUsuario; edita: boolean }) {
  const [editando, setEditando] = useState<ConceptoCatalogo | 'nuevo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lista = [...d.conceptos].sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === 'percepcion' ? -1 : 1));
  const accion = async (c: ConceptoCatalogo, a: 'activar' | 'desactivar' | 'eliminar') => {
    const enUso = conceptoEnUso(c.id, d.periodos);
    if (a === 'eliminar' && !window.confirm(enUso ? `"${c.nombre}" ya se usó en recibos: se desactivará (los recibos no cambian). ¿Continuar?` : `¿Eliminar "${c.nombre}"? Nunca se ha usado en una nómina.`)) return;
    setError(await cambiarConcepto(db, c.id, a, enUso, perfil, equipoActual()));
  };
  return (
    <>
      <p className="muted small">Sueldo base, horas extra y falta son parte del cálculo base y no se eliminan. Un concepto que ya se usó solo se desactiva, para no cambiar recibos anteriores.</p>
      {edita && <div className="acciones izq"><button className="btn primario" onClick={() => setEditando('nuevo')}>+ Nuevo concepto</button></div>}
      {error && <p className="error">{error}</p>}
      <div className="lista-nomina">
        {lista.map(c => (
          <div key={c.id} className="fila-nomina estatica">
            <span className="fila-principal">
              <strong>{c.nombre}</strong>
              <span className="muted small">{c.tipo === 'percepcion' ? 'Percepción' : 'Deducción'}{c.fijo ? ' · Fijo' : ''}</span>
            </span>
            <span className={c.activo ? 'chip ok' : 'chip pendiente'}>{c.activo ? 'Activo' : 'Inactivo'}</span>
            {edita && (
              <span className="acciones-fila">
                {!c.fijo && <button className="btn mini" onClick={() => setEditando(c)}>Editar</button>}
                {!c.fijo && (c.activo ? <button className="btn mini" onClick={() => void accion(c, 'desactivar')}>Desactivar</button> : <button className="btn mini" onClick={() => void accion(c, 'activar')}>Activar</button>)}
                {!c.fijo && <button className="btn peligro mini" onClick={() => void accion(c, 'eliminar')}>Eliminar</button>}
              </span>
            )}
          </div>
        ))}
      </div>
      {editando && <FormConcepto c={editando === 'nuevo' ? null : editando} conceptos={d.conceptos} perfil={perfil} onCerrar={() => setEditando(null)} />}
    </>
  );
}

function FormConcepto({ c, conceptos, perfil, onCerrar }: { c: ConceptoCatalogo | null; conceptos: ConceptoCatalogo[]; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(c?.nombre ?? '');
  const [tipo, setTipo] = useState<'percepcion' | 'deduccion'>(c?.tipo ?? 'percepcion');
  const { enviando, error, setError, enviar } = useEnvio();
  return (
    <MarcoModal
      titulo={c ? 'Editar concepto' : 'Nuevo concepto'}
      onCerrar={onCerrar}
      enviando={enviando}
      onEnviar={ev => {
        ev.preventDefault();
        const err = validarConcepto(nombre, tipo, conceptos, c?.id ?? null);
        if (err) { setError(err); return; }
        void enviar(async () => { const r = await guardarConcepto(db, c?.id ?? null, nombre, tipo, perfil, equipoActual()); if (!r) onCerrar(); return r; });
      }}
    >
      <label className="campo"><span>Nombre</span><input value={nombre} onChange={ev => setNombre(ev.target.value)} /></label>
      <label className="campo">
        <span>Tipo</span>
        <select value={tipo} onChange={ev => setTipo(ev.target.value as typeof tipo)}>
          <option value="percepcion">Percepción</option>
          <option value="deduccion">Deducción</option>
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>Guardar</button></div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ solicitudes

function Solicitudes({ d, perfil, edita }: { d: DatosNomina; perfil: PerfilUsuario; edita: boolean }) {
  const admin = perfil.rol === 'admin';
  const [filtro, setFiltro] = useState<'pendientes' | 'todas'>('pendientes');
  const [nueva, setNueva] = useState<'alta' | 'baja' | null>(null);
  const [rechazar, setRechazar] = useState<string | null>(null);
  const lista = d.solicitudes.filter(s => filtro === 'todas' || s.estado === 'pendiente').sort((a, b) => b.fechaSolicitud.localeCompare(a.fechaSolicitud));
  const activos = d.empleados.filter(e => e.estado === 'activo');
  return (
    <>
      <div className="acciones izq">
        <select value={filtro} onChange={ev => setFiltro(ev.target.value as typeof filtro)} aria-label="Filtro">
          <option value="pendientes">Pendientes</option>
          <option value="todas">Todas</option>
        </select>
        {edita && !admin && (
          <>
            <button className="btn primario" onClick={() => setNueva('alta')}>Solicitar alta</button>
            <button className="btn" disabled={!activos.length} onClick={() => setNueva('baja')}>Solicitar baja</button>
          </>
        )}
      </div>
      {admin && <p className="muted small">Para aprobar usa Nómina de la página: al aprobar se crea (alta) o se desactiva (baja) la cuenta de acceso. Aquí puedes revisarlas y rechazarlas.</p>}
      {!lista.length ? (
        <p className="muted">{filtro === 'pendientes' ? 'No hay solicitudes pendientes.' : 'Todavía no hay solicitudes.'}</p>
      ) : (
        <ul className="historial">
          {lista.map(s => {
            const nombre = nombreDeSolicitud(s, d.empleados);
            return (
              <li key={s.id} className="solicitud-nomina">
                <div className="fila-titulo">
                  <strong>{s.tipo === 'alta' ? 'Alta' : 'Baja'} · {nombre}</strong>
                  <span className={s.estado === 'pendiente' ? 'chip pendiente' : s.estado === 'aprobada' ? 'chip ok' : 'chip agotado'}>
                    {s.estado === 'pendiente' ? 'Pendiente' : s.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                  </span>
                </div>
                <span className="muted small bloque">
                  {s.tipo === 'alta' && s.datosAlta
                    ? `${s.datosAlta.numeroEmpleado} · ${CARGOS_NOMINA[s.datosAlta.cargo] ?? s.datosAlta.cargo} · inicia ${fechaCorta(s.datosAlta.fechaInicio)} · ${$(s.datosAlta.salarioBase)}/semana`
                    : `Motivo: ${s.motivoBaja ?? '—'} · efectiva ${fechaCorta(s.fechaEfectivaBaja)}${s.observaciones ? ` · ${s.observaciones}` : ''}`}
                </span>
                <span className="muted small bloque">Pidió {s.solicitadoPor || 'Encargado'} el {fechaCorta(s.fechaSolicitud)}{s.revisadoPor ? ` · resolvió ${s.revisadoPor} el ${fechaCorta(s.fechaResolucion)}` : ''}</span>
                {s.motivoRechazo && <span className="small bloque peligro-texto">Motivo del rechazo: {s.motivoRechazo}</span>}
                {admin && edita && s.estado === 'pendiente' && (
                  <div className="acciones izq"><button className="btn peligro mini" onClick={() => setRechazar(s.id)}>Rechazar</button></div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {nueva === 'alta' && <SolicitudAlta d={d} perfil={perfil} onCerrar={() => setNueva(null)} />}
      {nueva === 'baja' && <SolicitudBaja e={null} activos={activos} perfil={perfil} onCerrar={() => setNueva(null)} />}
      {rechazar && (
        <Rechazar
          onCerrar={() => setRechazar(null)}
          onEnviar={async motivo => {
            const s = d.solicitudes.find(x => x.id === rechazar)!;
            const err = await rechazarSolicitud(db, rechazar, motivo, nombreDeSolicitud(s, d.empleados), perfil, equipoActual());
            if (!err) setRechazar(null);
            return err;
          }}
        />
      )}
    </>
  );
}

function SolicitudAlta({ d, perfil, onCerrar }: { d: DatosNomina; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [f, setF] = useState({ nombre: '', numeroEmpleado: '', cargo: 'staff', fechaInicio: new Date().toISOString().slice(0, 10), salarioBase: 0, correo: '', celular: '' });
  const { enviando, error, setError, enviar } = useEnvio();
  const set = (k: keyof typeof f, v: string | number) => setF(x => ({ ...x, [k]: v }));
  return (
    <MarcoModal
      titulo="Solicitar alta de empleado"
      onCerrar={onCerrar}
      enviando={enviando}
      onEnviar={ev => {
        ev.preventDefault();
        const r = nuevaSolicitudAlta(f, d.empleados, quienDe(perfil), new Date());
        if (!r.ok) { setError(r.error); return; }
        void enviar(async () => { const err = await crearSolicitud(db, r.doc, f.nombre.trim(), perfil, equipoActual()); if (!err) onCerrar(); return err; });
      }}
    >
      <div className="rejilla-form">
        <label className="campo"><span>Nombre</span><input value={f.nombre} onChange={ev => set('nombre', ev.target.value)} /></label>
        <label className="campo"><span>Número de empleado</span><input value={f.numeroEmpleado} onChange={ev => set('numeroEmpleado', ev.target.value)} /></label>
        <label className="campo">
          <span>Cargo</span>
          <select value={f.cargo} onChange={ev => set('cargo', ev.target.value)}>{Object.entries(CARGOS_NOMINA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="campo"><span>Fecha de inicio</span><input type="date" value={f.fechaInicio} onChange={ev => set('fechaInicio', ev.target.value)} /></label>
        <label className="campo"><span>Salario base semanal</span><input type="number" step="0.01" value={f.salarioBase} onChange={ev => set('salarioBase', parseFloat(ev.target.value) || 0)} /></label>
        <label className="campo"><span>Celular</span><input value={f.celular} onChange={ev => set('celular', ev.target.value)} /></label>
        <label className="campo"><span>Correo</span><input type="email" value={f.correo} onChange={ev => set('correo', ev.target.value)} /></label>
      </div>
      <p className="muted small">Administración la revisa; al aprobarla se crea el empleado y su cuenta de acceso.</p>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>Enviar solicitud</button></div>
    </MarcoModal>
  );
}

function SolicitudBaja({ e, activos, perfil, onCerrar }: { e: Empleado | null; activos?: Empleado[]; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [id, setId] = useState(e?.id ?? activos?.[0]?.id ?? '');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const elegido = e ?? activos?.find(x => x.id === id) ?? null;
  return (
    <MarcoModal
      titulo="Solicitar baja de empleado"
      onCerrar={onCerrar}
      enviando={enviando}
      onEnviar={ev => {
        ev.preventDefault();
        if (!elegido) { setError('Elige al empleado.'); return; }
        const r = nuevaSolicitudBaja(elegido, { motivoBaja: motivo, fechaEfectivaBaja: fecha, observaciones: obs }, quienDe(perfil), new Date());
        if (!r.ok) { setError(r.error); return; }
        void enviar(async () => { const err = await crearSolicitud(db, r.doc, elegido.nombre, perfil, equipoActual()); if (!err) onCerrar(); return err; });
      }}
    >
      {e ? (
        <p><strong>{e.nombre}</strong> · {e.numeroEmpleado}</p>
      ) : (
        <label className="campo">
          <span>Empleado</span>
          <select value={id} onChange={ev => setId(ev.target.value)}>{activos?.map(x => <option key={x.id} value={x.id}>{x.nombre} ({x.numeroEmpleado})</option>)}</select>
        </label>
      )}
      <label className="campo"><span>Motivo de baja</span><input value={motivo} onChange={ev => setMotivo(ev.target.value)} /></label>
      <label className="campo"><span>Fecha efectiva</span><input type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} /></label>
      <label className="campo"><span>Observaciones</span><textarea rows={3} value={obs} onChange={ev => setObs(ev.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>Enviar solicitud</button></div>
    </MarcoModal>
  );
}

function Rechazar({ onCerrar, onEnviar }: { onCerrar: () => void; onEnviar: (motivo: string) => Promise<string | null> }) {
  const [motivo, setMotivo] = useState('');
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Rechazar solicitud" onCerrar={onCerrar} enviando={enviando} onEnviar={ev => { ev.preventDefault(); void enviar(() => onEnviar(motivo)); }}>
      <label className="campo"><span>Motivo del rechazo</span><textarea rows={3} value={motivo} onChange={ev => setMotivo(ev.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn peligro" type="submit" disabled={enviando}>Rechazar</button></div>
    </MarcoModal>
  );
}
