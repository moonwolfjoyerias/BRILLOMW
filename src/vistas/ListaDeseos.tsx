// Lista de deseos y Solicitudes de resurtido: lo mismo que Staff,
// Encargado y Admin tienen en la página (portal/*/…-lista-deseos.html),
// sobre las mismas colecciones. Lo que se haga aquí se ve al instante en
// la página y al revés.
import { useMemo, useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useCatalogo } from '../pagina/useCatalogo';
import type { Producto } from '../pagina/producto';
import { buscarPersonas, nombreCompleto, usePersonas, type Persona } from '../pagina/persona';
import { COL_DESEOS, COL_RESURTIDO, guardarDeseo, useListaDeseos } from '../deseos/acciones';
import {
  ESTADOS_DESEO,
  ESTADOS_RESURTIDO,
  ROLES_CREADOR,
  administraResurtido,
  agregarObservacion,
  cambiarEstado,
  crearResurtido,
  crearSolicitud,
  filtrarDeseos,
  marcarAtendida,
  marcarRevisada,
  puedeSolicitarResurtido,
  resumenPiezas,
  type FiltrosDeseos,
  type SolicitudDeseo,
  type SolicitudResurtido
} from '../deseos/modelo';
import { MarcoModal, useEnvio } from './Modal';

const fechaHora = (iso: string) =>
  iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const plural = (n: number) => `${n} solicitud${n === 1 ? '' : 'es'}`;
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const CLASE_DESEO: Record<string, string> = { pendiente: 'pendiente', en_seguimiento: 'neutro', disponible: 'ok', atendida: 'ok', cancelada: 'agotado' };
const CLASE_RESURTIDO: Record<string, string> = { pendiente: 'pendiente', revisada: 'neutro', atendida: 'ok' };
const etiquetaDeseo = (e: string) => ESTADOS_DESEO[e as keyof typeof ESTADOS_DESEO] ?? e;
const etiquetaResurtido = (e: string) => ESTADOS_RESURTIDO[e as keyof typeof ESTADOS_RESURTIDO] ?? e;
const para = (s: SolicitudDeseo) => (s.destinatario === 'emprendedora' ? s.personaNombre || '(sin nombre)' : 'Público en general');

type Modal =
  | { tipo: 'nueva' }
  | { tipo: 'detalle'; id: string }
  | { tipo: 'nuevoResurtido' }
  | { tipo: 'resurtido'; id: string };

type Hecho = (mensaje: string) => void;

export function ListaDeseos({ perfil }: { perfil: PerfilUsuario }) {
  const datos = useListaDeseos(db);
  const catalogo = useCatalogo();
  const personas = usePersonas();
  const [vista, setVista] = useState<'deseos' | 'resurtido'>('deseos');
  const [f, setF] = useState<FiltrosDeseos>({ texto: '', estado: '', destinatario: '', creador: '', desde: '', hasta: '' });
  const [resTexto, setResTexto] = useState('');
  const [resEstado, setResEstado] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const deseos = datos.estado === 'listo' ? datos.deseos : [];
  const resurtidoTodo = datos.estado === 'listo' ? datos.resurtido : [];
  const productos = catalogo.estado === 'listo' ? catalogo.productos : [];
  const filtrados = useMemo(() => filtrarDeseos(deseos, f), [deseos, f]);
  const esAdmin = administraResurtido(perfil.rol);
  // Igual que la página: Staff y Encargado ven las solicitudes de resurtido
  // de su propio rol; Administración las ve y atiende todas.
  const resurtido = useMemo(() => {
    const t = resTexto.trim().toLowerCase();
    return resurtidoTodo
      .filter(s => esAdmin || s.solicitadoPorRol === perfil.rol)
      .filter(s => !t || s.producto.toLowerCase().includes(t))
      .filter(s => !resEstado || s.estado === resEstado)
      .sort((a, b) => b.fechaSolicitud.localeCompare(a.fechaSolicitud));
  }, [resurtidoTodo, resTexto, resEstado, esAdmin, perfil.rol]);

  const hecho: Hecho = mensaje => {
    setModal(null);
    setAviso(mensaje);
    setTimeout(() => setAviso(null), 5000);
  };
  const cambiarFiltro = (k: keyof FiltrosDeseos, v: string) => setF(prev => ({ ...prev, [k]: v }));

  const detalle = modal?.tipo === 'detalle' ? deseos.find(s => s.id === modal.id) : undefined;
  const detalleRes = modal?.tipo === 'resurtido' ? resurtidoTodo.find(s => s.id === modal.id) : undefined;

  return (
    <section className="deseos">
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Lista de deseos</h1>
          <p className="muted">Las mismas solicitudes que en la página.</p>
        </div>
        <nav className="pestanas" aria-label="Secciones de Lista de deseos">
          <button className={vista === 'deseos' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('deseos')}>Listas de deseos</button>
          <button className={vista === 'resurtido' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('resurtido')}>
            {esAdmin ? 'Solicitudes de resurtido' : 'Solicitar resurtido'}
          </button>
        </nav>
      </div>

      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {datos.estado === 'cargando' && <p className="muted">Cargando…</p>}
      {datos.estado === 'error' && <p className="error" role="alert">{datos.mensaje}</p>}

      {datos.estado === 'listo' && vista === 'deseos' && (
        <>
          <div className="filtros-deseos">
            <input type="search" placeholder="Buscar por persona o producto…" value={f.texto} onChange={e => cambiarFiltro('texto', e.target.value)} aria-label="Buscar" />
            <select value={f.destinatario} onChange={e => cambiarFiltro('destinatario', e.target.value)} aria-label="Para quién">
              <option value="">Emprendedora y público</option>
              <option value="emprendedora">Emprendedora</option>
              <option value="publico">Público en general</option>
            </select>
            <select value={f.estado} onChange={e => cambiarFiltro('estado', e.target.value)} aria-label="Estado">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_DESEO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.creador} onChange={e => cambiarFiltro('creador', e.target.value)} aria-label="Creada por">
              <option value="">Creada por cualquiera</option>
              {Object.entries(ROLES_CREADOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="campo-en-linea"><span>Desde</span><input type="date" value={f.desde} onChange={e => cambiarFiltro('desde', e.target.value)} /></label>
            <label className="campo-en-linea"><span>Hasta</span><input type="date" value={f.hasta} onChange={e => cambiarFiltro('hasta', e.target.value)} /></label>
            <button className="btn primario" onClick={() => setModal({ tipo: 'nueva' })}>+ Nueva solicitud</button>
          </div>
          <p className="muted small">{plural(filtrados.length)}</p>
          {!filtrados.length ? (
            <p className="muted vacio">No hay solicitudes. Prueba con otro filtro o crea una nueva.</p>
          ) : (
            <ul className="lista-filas">
              {filtrados.map(s => (
                <li key={s.id}>
                  <button className="fila-deseo" onClick={() => setModal({ tipo: 'detalle', id: s.id })}>
                    <span className="fila-principal">
                      <strong>{para(s)}</strong>
                      <span className="muted small">{resumenPiezas(s.piezas)}</span>
                    </span>
                    <span className="small">{s.creadoPorNombre}<span className="muted bloque">{ROLES_CREADOR[s.creadoPorRol] ?? s.creadoPorRol}</span></span>
                    <span className={`chip ${CLASE_DESEO[s.estado] ?? 'neutro'}`}>{etiquetaDeseo(s.estado)}</span>
                    <span className="muted small">{fechaHora(s.fechaCreacion)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {datos.estado === 'listo' && vista === 'resurtido' && (
        <>
          <p className="muted small">
            {esAdmin
              ? 'Aquí llegan las solicitudes que envían Staff y Encargado.'
              : 'Avisa a Administración que hace falta resurtir una pieza o tipo de pieza.'}
          </p>
          <div className="filtros">
            <input type="search" placeholder="Buscar producto…" value={resTexto} onChange={e => setResTexto(e.target.value)} aria-label="Buscar producto" />
            <select value={resEstado} onChange={e => setResEstado(e.target.value)} aria-label="Estado">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADOS_RESURTIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {puedeSolicitarResurtido(perfil.rol) ? (
              <button className="btn primario" onClick={() => setModal({ tipo: 'nuevoResurtido' })}>+ Solicitar resurtido</button>
            ) : <span />}
          </div>
          <p className="muted small">{plural(resurtido.length)}</p>
          {!resurtido.length ? (
            <p className="muted vacio">No hay solicitudes de resurtido.</p>
          ) : (
            <ul className="lista-filas">
              {resurtido.map(s => (
                <li key={s.id}>
                  <button className="fila-deseo" onClick={() => setModal({ tipo: 'resurtido', id: s.id })}>
                    <span className="fila-principal">
                      <strong>{s.producto}</strong>
                      <span className="muted small">{[s.variante, s.cantidadSugerida ? `${s.cantidadSugerida} pzas sugeridas` : ''].filter(Boolean).join(' · ') || '—'}</span>
                    </span>
                    <span className="small">{s.solicitadoPorNombre}<span className="muted bloque">{ROLES_CREADOR[s.solicitadoPorRol] ?? s.solicitadoPorRol}</span></span>
                    <span className={`chip ${CLASE_RESURTIDO[s.estado] ?? 'neutro'}`}>{etiquetaResurtido(s.estado)}</span>
                    <span className="muted small">{fechaHora(s.fechaSolicitud)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {modal?.tipo === 'nueva' && (
        <NuevaSolicitud personas={personas.estado === 'listo' ? personas.personas : []} perfil={perfil} onHecho={hecho} onCerrar={() => setModal(null)} />
      )}
      {detalle && <DetalleSolicitud s={detalle} productos={productos} perfil={perfil} onHecho={hecho} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'nuevoResurtido' && <NuevoResurtido perfil={perfil} onHecho={hecho} onCerrar={() => setModal(null)} />}
      {detalleRes && <DetalleResurtido s={detalleRes} perfil={perfil} onHecho={hecho} onAviso={setAviso} onCerrar={() => setModal(null)} />}
    </section>
  );
}

// ------------------------------------------------------------ nueva solicitud

function NuevaSolicitud({ personas, perfil, onHecho, onCerrar }: { personas: Persona[]; perfil: PerfilUsuario; onHecho: Hecho; onCerrar: () => void }) {
  const [destinatario, setDestinatario] = useState<'emprendedora' | 'publico'>('emprendedora');
  const [busqueda, setBusqueda] = useState('');
  const [persona, setPersona] = useState<Persona | null>(null);
  const [piezas, setPiezas] = useState([{ producto: '', cantidad: '1' }]);
  const { enviando, error, setError, enviar } = useEnvio();
  // Igual que la página: se busca entre Emprendedoras (nombre o número de cuenta).
  const resultados = busqueda.trim() ? buscarPersonas(personas.filter(p => p.tipo === 'emprendedora'), busqueda, 8) : [];

  const cambiarPieza = (i: number, campo: 'producto' | 'cantidad', v: string) => setPiezas(ps => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  function guardar(e: FormEvent) {
    e.preventDefault();
    const datos = { destinatario, persona: persona ? { id: persona.id, nombre: nombreCompleto(persona) } : null, piezas };
    const previa = crearSolicitud(datos, perfil);
    if (!previa.ok) return setError(previa.error);
    void enviar(async () => {
      const r = await guardarDeseo(db, COL_DESEOS, null, () => crearSolicitud(datos, perfil), perfil, equipoActual());
      if (!r.ok) return r.error;
      onHecho('Solicitud creada. Ya aparece en la página y en Actividad.');
      return null;
    });
  }

  return (
    <MarcoModal titulo="Nueva solicitud de lista de deseos" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <label className="campo">
        <span>¿Para quién es esta solicitud?</span>
        <select value={destinatario} onChange={e => { setDestinatario(e.target.value as 'emprendedora' | 'publico'); setPersona(null); }}>
          <option value="emprendedora">Para una Emprendedora</option>
          <option value="publico">Público en general</option>
        </select>
      </label>
      {destinatario === 'emprendedora' && (
        persona ? (
          <p className="persona-elegida">
            <strong>{nombreCompleto(persona)}</strong> <span className="muted small">{persona.usuario}</span>
            <button type="button" className="btn mini" onClick={() => setPersona(null)}>Cambiar</button>
          </p>
        ) : (
          <>
            <label className="campo">
              <span>Buscar Emprendedora (nombre o número de cuenta)</span>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Ej. Valeria Ramírez o MW0012" autoComplete="off" autoFocus />
            </label>
            {busqueda.trim() && (
              resultados.length ? (
                <ul className="resultados-cliente">
                  {resultados.map(p => (
                    <li key={p.id}>
                      <button type="button" className="btn izq" onClick={() => { setPersona(p); setBusqueda(''); }}>
                        <strong>{nombreCompleto(p)}</strong>
                        <span className="muted small">{p.usuario || 'sin cuenta'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small">Sin coincidencias.</p>
            )}
          </>
        )
      )}
      <h3>Piezas solicitadas</h3>
      {piezas.map((p, i) => (
        <div key={i} className="fila-pieza-deseo">
          <input value={p.producto} onChange={e => cambiarPieza(i, 'producto', e.target.value)} placeholder="Descripción del producto" aria-label="Producto" />
          <input value={p.cantidad} onChange={e => cambiarPieza(i, 'cantidad', e.target.value)} inputMode="numeric" aria-label="Piezas" placeholder="Piezas" />
          {piezas.length > 1 && <button type="button" className="btn mini" onClick={() => setPiezas(ps => ps.filter((_, j) => j !== i))}>Quitar</button>}
        </div>
      ))}
      <button type="button" className="btn" onClick={() => setPiezas(ps => [...ps, { producto: '', cantidad: '1' }])}>+ Agregar otra pieza</button>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Crear solicitud'}</button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ detalle y estado

function DetalleSolicitud({ s, productos, perfil, onHecho, onCerrar }: { s: SolicitudDeseo; productos: Producto[]; perfil: PerfilUsuario; onHecho: Hecho; onCerrar: () => void }) {
  const [estado, setEstado] = useState(s.estado);
  const [comentario, setComentario] = useState('');
  const [productoId, setProductoId] = useState<string>(s.productoId ?? '');
  const [qProducto, setQProducto] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const elegido = productos.find(p => p.id === productoId) ?? null;
  const candidatos = useMemo(() => {
    const t = normal(qProducto);
    return t ? productos.filter(p => normal(`${p.nombre} ${p.codigo}`).includes(t)).slice(0, 8) : [];
  }, [productos, qProducto]);

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (estado === 'disponible' && !elegido) return setError('Elige el producto del catálogo para marcarla disponible.');
    const datos = { comentario, productoId: estado === 'disponible' ? productoId : null };
    void enviar(async () => {
      const r = await guardarDeseo(db, COL_DESEOS, s.id, a => (a ? cambiarEstado(a, estado, datos, perfil) : { ok: false, error: 'Esa solicitud ya no existe.' }), perfil, equipoActual());
      if (!r.ok) return r.error;
      onHecho(estado === 'disponible' && s.destinatario === 'emprendedora' ? `Marcada disponible. Se le avisó a ${s.personaNombre}.` : 'Estado actualizado.');
      return null;
    });
  }

  return (
    <MarcoModal titulo="Detalle de la solicitud" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <dl className="datos">
        <dt>Para</dt><dd>{para(s)}</dd>
        <dt>Creada por</dt><dd>{s.creadoPorNombre} ({ROLES_CREADOR[s.creadoPorRol] ?? s.creadoPorRol})</dd>
        <dt>Fecha</dt><dd>{fechaHora(s.fechaCreacion)}</dd>
        <dt>Estado</dt><dd><span className={`chip ${CLASE_DESEO[s.estado] ?? 'neutro'}`}>{etiquetaDeseo(s.estado)}</span></dd>
      </dl>
      <h3>Piezas</h3>
      <ul className="historial">
        {s.piezas.map(p => (
          <li key={p.id}>
            <strong>{p.producto}{p.variante ? ` — ${p.variante}` : ''}</strong>
            <span className="muted small bloque">Cantidad: {p.cantidad}{p.observaciones ? ` · ${p.observaciones}` : ''}</span>
          </li>
        ))}
      </ul>
      {s.comentarioEstado && <p className="nota-apartado"><strong>Comentario:</strong> {s.comentarioEstado}</p>}
      <h3>Actualizar estado</h3>
      <select value={estado} onChange={e => setEstado(e.target.value)} aria-label="Nuevo estado">
        {Object.entries(ESTADOS_DESEO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {estado === 'disponible' && (
        <div className="campo producto-disponible">
          <span>Producto del catálogo *</span>
          {elegido ? (
            <p className="persona-elegida">
              <strong>{elegido.nombre}</strong> <span className="muted small">{elegido.codigo}</span>
              <button type="button" className="btn mini" onClick={() => setProductoId('')}>Cambiar</button>
            </p>
          ) : (
            <>
              <input value={qProducto} onChange={e => setQProducto(e.target.value)} placeholder="Empieza a escribir el nombre o código" autoComplete="off" />
              {candidatos.length > 0 && (
                <ul className="resultados-cliente">
                  {candidatos.map(p => (
                    <li key={p.id}>
                      <button type="button" className="btn izq" onClick={() => { setProductoId(p.id); setQProducto(''); }}>
                        <strong>{p.nombre}</strong>
                        <span className="muted small">{p.codigo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <span className="muted small">Así el aviso la lleva directo a apartarlo.</span>
        </div>
      )}
      <label className="campo">
        <span>Comentario (opcional)</span>
        <input value={comentario} onChange={e => setComentario(e.target.value)} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar estado'}</button>
      </div>
    </MarcoModal>
  );
}

// ------------------------------------------------------------ resurtido

function NuevoResurtido({ perfil, onHecho, onCerrar }: { perfil: PerfilUsuario; onHecho: Hecho; onCerrar: () => void }) {
  const [d, setD] = useState({ producto: '', variante: '', cantidadSugerida: '', comentario: '' });
  const { enviando, error, setError, enviar } = useEnvio();
  const set = (k: keyof typeof d, v: string) => setD(prev => ({ ...prev, [k]: v }));

  function guardar(e: FormEvent) {
    e.preventDefault();
    const previa = crearResurtido(d, perfil);
    if (!previa.ok) return setError(previa.error);
    void enviar(async () => {
      const r = await guardarDeseo(db, COL_RESURTIDO, null, () => crearResurtido(d, perfil), perfil, equipoActual());
      if (!r.ok) return r.error;
      onHecho('Solicitud de resurtido enviada: se notificó a Administración.');
      return null;
    });
  }

  return (
    <MarcoModal titulo="Solicitar resurtido" onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p className="muted small">Puede ser por categoría, sin necesidad de una persona específica.</p>
      <label className="campo"><span>Producto o tipo de pieza *</span><input value={d.producto} onChange={e => set('producto', e.target.value)} placeholder="Ej. Cadenas blancas" autoFocus /></label>
      <div className="rejilla-form">
        <label className="campo"><span>Variante (opcional)</span><input value={d.variante} onChange={e => set('variante', e.target.value)} placeholder="Ej. 45cm eslabón fino" /></label>
        <label className="campo"><span>Cantidad sugerida (opcional)</span><input value={d.cantidadSugerida} onChange={e => set('cantidadSugerida', e.target.value)} inputMode="numeric" placeholder="Ej. 20" /></label>
      </div>
      <label className="campo">
        <span>Motivo / comentario</span>
        <textarea rows={3} value={d.comentario} onChange={e => set('comentario', e.target.value)} placeholder="Ej. Varias Emprendedoras han solicitado este modelo y no hay disponibilidad." />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>
      </div>
    </MarcoModal>
  );
}

function DetalleResurtido({ s, perfil, onHecho, onAviso, onCerrar }: { s: SolicitudResurtido; perfil: PerfilUsuario; onHecho: Hecho; onAviso: (m: string) => void; onCerrar: () => void }) {
  const [obs, setObs] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const admin = administraResurtido(perfil.rol);

  function correr(accion: (a: SolicitudResurtido) => ReturnType<typeof marcarAtendida>, exito: string, cerrar: boolean) {
    void enviar(async () => {
      const r = await guardarDeseo(db, COL_RESURTIDO, s.id, a => (a ? accion(a) : { ok: false, error: 'Esa solicitud ya no existe.' }), perfil, equipoActual());
      if (!r.ok) return r.error;
      if (cerrar) onHecho(exito);
      else {
        setObs('');
        onAviso(exito);
      }
      return null;
    });
  }

  return (
    <MarcoModal titulo="Solicitud de resurtido" onCerrar={onCerrar} enviando={enviando}>
      <dl className="datos">
        <dt>Producto</dt><dd>{s.producto}</dd>
        <dt>Variante</dt><dd>{s.variante || '—'}</dd>
        <dt>Cantidad sugerida</dt><dd>{s.cantidadSugerida || '—'}</dd>
        <dt>Motivo</dt><dd>{s.comentario || '—'}</dd>
        <dt>Solicitado por</dt><dd>{s.solicitadoPorNombre} ({ROLES_CREADOR[s.solicitadoPorRol] ?? s.solicitadoPorRol})</dd>
        <dt>Fecha</dt><dd>{fechaHora(s.fechaSolicitud)}</dd>
        <dt>Estado</dt><dd><span className={`chip ${CLASE_RESURTIDO[s.estado] ?? 'neutro'}`}>{etiquetaResurtido(s.estado)}</span></dd>
        {s.revisadoPorNombre && <><dt>Revisada por</dt><dd>{s.revisadoPorNombre} · {fechaHora(s.fechaRevisado ?? '')}</dd></>}
        {s.atendidoPorNombre && <><dt>Atendida por</dt><dd>{s.atendidoPorNombre} · {fechaHora(s.fechaAtendido ?? '')}</dd></>}
      </dl>
      <h3>{admin ? 'Observaciones' : 'Observaciones de Administración'}</h3>
      {!s.observaciones.length && <p className="muted small">Todavía sin observaciones.</p>}
      <ul className="historial">
        {s.observaciones.map((o, i) => (
          <li key={i}>
            <strong>{o.texto}</strong>
            <span className="muted small bloque">{o.usuarioNombre} · {fechaHora(o.fecha)}</span>
          </li>
        ))}
      </ul>
      {admin && (
        <>
          <label className="campo">
            <span>Agregar observación</span>
            <textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ej. Ya se apartó con el proveedor, llega la próxima semana." />
          </label>
          <button
            type="button"
            className="btn"
            disabled={enviando}
            onClick={() => (obs.trim() ? correr(a => agregarObservacion(a, obs, perfil), 'Observación agregada.', false) : setError('Escribe una observación.'))}
          >
            Agregar observación
          </button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {admin && s.estado !== 'atendida' && (
        <div className="acciones">
          {s.estado === 'pendiente' && (
            <button className="btn" disabled={enviando} onClick={() => correr(a => marcarRevisada(a, perfil), 'Solicitud marcada como revisada.', true)}>Marcar como revisada</button>
          )}
          <button className="btn primario" disabled={enviando} onClick={() => correr(a => marcarAtendida(a, perfil), 'Solicitud marcada como atendida. Se le avisó a quien la pidió.', true)}>
            Marcar como atendida
          </button>
        </div>
      )}
    </MarcoModal>
  );
}
