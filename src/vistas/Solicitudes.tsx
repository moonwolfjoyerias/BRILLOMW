// Solicitudes para Administración: lo mismo que admin-solicitudes.html de la
// página. Inscripciones (de Emprendedoras/Líderes o de quien se registra en
// el sitio) y eventos propuestos; ver detalle, aprobar o rechazar.
import { useEffect, useState } from 'react';
import { app, db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { crearAccesoCon } from '../sesion/crearAcceso';
import { MarcoModal, useEnvio } from './Modal';
import { usePersonasAdmin } from '../personas/acciones';
import { aprobarEvento, aprobarInscripcion, rechazarSolicitud, useSolicitudes, type ResultadoAprobar } from '../solicitudes/acciones';
import {
  ESTADOS_SOLICITUD,
  filtrarSolicitudes,
  RIESGO_EQUIPO_INFLADO_DIAS,
  tituloSolicitud,
  type FiltrosSolicitudes,
  type Solicitud,
  type SolicitudEvento,
  type SolicitudInscripcion
} from '../solicitudes/modelo';
import type { PersonaAdmin } from '../personas/modelo';

const crearAcceso = crearAccesoCon(app);
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const CHIP: Record<string, string> = { pendiente: 'chip pendiente', aprobada: 'chip ok', rechazada: 'chip agotado' };

export function Solicitudes({ perfil }: { perfil: PerfilUsuario }) {
  const sol = useSolicitudes(db);
  const per = usePersonasAdmin(db, false);
  const [f, setF] = useState<FiltrosSolicitudes>({ texto: '', tipo: '', estado: '', orden: 'reciente' });
  const [abierta, setAbierta] = useState<string | null>(null);

  if (sol.estado === 'cargando' || per.estado === 'cargando') return <p className="muted">Cargando solicitudes…</p>;
  if (sol.estado === 'error' || per.estado === 'error') return <p className="error">No se pudieron cargar las solicitudes. Revisa la conexión.</p>;
  const lista = filtrarSolicitudes(sol.solicitudes, f);
  const pendientes = sol.solicitudes.filter(s => s.estado === 'pendiente').length;
  const elegida = abierta ? sol.solicitudes.find(s => s.id === abierta) : undefined;
  const set = <K extends keyof FiltrosSolicitudes>(k: K, v: FiltrosSolicitudes[K]) => setF(x => ({ ...x, [k]: v }));

  return (
    <section className="solicitudes">
      <div className="encabezado-seccion">
        <h1>Solicitudes <span className="chip pendiente">{pendientes} pendiente{pendientes === 1 ? '' : 's'}</span></h1>
        <p className="muted">Inscripciones de nuevas Emprendedoras y eventos que proponen Emprendedoras y Líderes.</p>
      </div>
      <div className="filtros-deseos">
        <input type="search" placeholder="Buscar por nombre, evento o quien la envió…" value={f.texto} onChange={e => set('texto', e.target.value)} aria-label="Buscar" />
        <select value={f.tipo} onChange={e => set('tipo', e.target.value as FiltrosSolicitudes['tipo'])} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          <option value="inscripcion">Inscripción</option>
          <option value="evento">Evento</option>
        </select>
        <select value={f.estado} onChange={e => set('estado', e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_SOLICITUD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.orden} onChange={e => set('orden', e.target.value as FiltrosSolicitudes['orden'])} aria-label="Orden">
          <option value="reciente">Más recientes</option>
          <option value="antigua">Más antiguas</option>
        </select>
      </div>
      {!lista.length ? (
        <p className="muted">No hay solicitudes que coincidan. Prueba con otro nombre o cambia los filtros.</p>
      ) : (
        <div className="lista-nomina">
          {lista.map(s => (
            <button key={`${s.tipo}-${s.id}`} className="fila-nomina" onClick={() => setAbierta(s.id)}>
              <span className="fila-principal">
                <strong>{tituloSolicitud(s)}</strong>
                <span className="muted small">
                  {s.tipo === 'evento' ? 'Evento' : 'Inscripción'} · {s.tipo === 'inscripcion' && s.origen === 'publico'
                    ? `Se registró ella misma${s.liderIndicado ? ` (líder: ${s.liderIndicado})` : ' (sin líder)'}`
                    : `${s.solicitanteNombre}${s.tipo === 'inscripcion' && s.solicitanteRol ? ` · ${s.solicitanteRol === 'lider' ? 'Líder' : 'Emprendedora'}` : ''}`} · {fecha(s.fechaSolicitud)}
                </span>
              </span>
              <span className="etiquetas">
                {s.tipo === 'inscripcion' && s.riesgoEquipoInflado && <span className="chip agotado">⚠ Riesgo</span>}
                <span className={CHIP[s.estado] ?? 'chip neutro'}>{ESTADOS_SOLICITUD[s.estado] ?? s.estado}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {elegida?.tipo === 'inscripcion' && (
        <DetalleInscripcion s={elegida} personas={per.personas} solicitudes={sol.solicitudes} perfil={perfil} onCerrar={() => setAbierta(null)} />
      )}
      {elegida?.tipo === 'evento' && <DetalleEvento s={elegida} perfil={perfil} onCerrar={() => setAbierta(null)} />}
    </section>
  );
}

/** Foto de la INE guardada en Firebase Storage (como resolverSrcDocumento de la página). */
function FotoIne({ ruta, titulo }: { ruta: string; titulo: string }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    import('firebase/storage')
      .then(({ getStorage, getDownloadURL, ref }) => getDownloadURL(ref(getStorage(app), ruta)))
      .then(url => vivo && setSrc(url), () => vivo && setSrc(null));
    return () => { vivo = false; };
  }, [ruta]);
  return (
    <figure className="foto-ine">
      <figcaption className="muted small">{titulo}</figcaption>
      {src === undefined ? <p className="muted small">Cargando identificación…</p> : src ? <img src={src} alt={titulo} /> : <p className="muted small">No pudimos cargar la identificación.</p>}
    </figure>
  );
}

function Rechazo({ s, perfil, onListo }: { s: Solicitud; perfil: PerfilUsuario; onListo: () => void }) {
  const [motivo, setMotivo] = useState('');
  const { enviando, error, enviar } = useEnvio();
  return (
    <>
      <label className="campo"><span>Motivo del rechazo</span><textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button className="btn peligro" disabled={enviando} onClick={() => void enviar(async () => {
          const err = await rechazarSolicitud(db, s, motivo, perfil, equipoActual());
          if (!err) onListo();
          return err;
        })}>Rechazar solicitud</button>
      </div>
    </>
  );
}

function Resolucion({ s }: { s: Solicitud }) {
  if (s.estado === 'rechazada') {
    return (
      <div className="nota-apartado">
        <strong>Motivo del rechazo</strong>
        <p className="small">{s.motivoRechazo}</p>
        <p className="muted small">Revisado por {s.revisadoPor ?? '—'} · {fecha(s.fechaRevision)}</p>
      </div>
    );
  }
  if (s.estado === 'aprobada') {
    return (
      <div className="nota-apartado">
        {s.tipo === 'inscripcion' && s.credenciales ? (
          <dl className="datos">
            <dt>Usuario</dt><dd>{s.credenciales.usuario}</dd>
            <dt>Contraseña temporal</dt><dd>{s.credenciales.passwordTemporal}</dd>
          </dl>
        ) : (
          <p className="small">Publicado en el calendario.</p>
        )}
        <p className="muted small">Aprobada por {s.revisadoPor ?? '—'} · {fecha(s.fechaRevision)}</p>
      </div>
    );
  }
  return null;
}

function DetalleInscripcion({ s, personas, solicitudes, perfil, onCerrar }: {
  s: SolicitudInscripcion;
  personas: PersonaAdmin[];
  solicitudes: Solicitud[];
  perfil: PerfilUsuario;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<'ver' | 'rechazar'>('ver');
  const [creada, setCreada] = useState<Extract<ResultadoAprobar, { ok: true }> | null>(null);
  const { enviando, error, setError, enviar } = useEnvio();
  const publica = s.origen === 'publico';

  if (creada) return <Credenciales c={creada} s={s} onCerrar={onCerrar} />;

  const aprobar = () => {
    const pregunta =
      (publica
        ? `¿Aprobar? Se creará una cuenta de Emprendedora SIN líder asignada todavía${s.liderIndicado ? ` (indicó a "${s.liderIndicado}": verifícalo y asígnalo desde Emprendedoras/Líderes)` : ''}.`
        : `¿Aprobar? Se creará una cuenta de Emprendedora y ${s.solicitanteNombre} quedará como su líder directa.`) +
      (s.viveEnSLP === false ? ' Como no vive en San Luis Potosí ni zonas cercanas, la cuenta será foránea.' : '');
    if (!window.confirm(pregunta)) return;
    void enviar(async () => {
      const r = await aprobarInscripcion(db, s, personas, solicitudes, crearAcceso, perfil, equipoActual());
      if (r.ok) { setCreada(r); return null; }
      return r.error;
    });
  };

  return (
    <MarcoModal titulo="Solicitud de inscripción" onCerrar={onCerrar} enviando={enviando}>
      {publica ? (
        <>
          <h3>Cómo llegó</h3>
          {s.riesgoEquipoInflado && (
            <p className="aviso-pendiente">
              <strong>⚠ Posible riesgo de equipo inflado.</strong> Ya hay {s.riesgoEquipoInfladoConteo} solicitudes públicas recientes (pendientes, o aprobadas en los últimos {RIESGO_EQUIPO_INFLADO_DIAS} días) que indican a esta misma líder. Verifica antes de aprobar (por ejemplo, llámale a cada una).
            </p>
          )}
          <dl className="datos">
            <dt>Origen</dt><dd>Se registró directamente desde el sitio</dd>
            <dt>Líder que indicó</dt><dd>{s.liderIndicado ? `${s.liderIndicado} (sin verificar)` : 'No indicó; pidió que le asignen una'}</dd>
            <dt>Fecha</dt><dd>{fecha(s.fechaSolicitud)}</dd>
          </dl>
        </>
      ) : (
        <>
          <h3>Solicitante</h3>
          <dl className="datos">
            <dt>Nombre</dt><dd>{s.solicitanteNombre}</dd>
            <dt>Rol</dt><dd>{s.solicitanteRol === 'lider' ? 'Líder' : 'Emprendedora'}</dd>
            <dt>Fecha</dt><dd>{fecha(s.fechaSolicitud)}</dd>
          </dl>
        </>
      )}
      <h3>Nueva persona</h3>
      <dl className="datos">
        <dt>Nombre completo</dt><dd>{s.nombreCompleto}</dd>
        <dt>Celular</dt><dd>{s.telefono}</dd>
        <dt>Correo</dt><dd>{s.correo}</dd>
        <dt>¿Vive en SLP o cerca?</dt><dd>{s.viveEnSLP === true ? 'Sí' : s.viveEnSLP === false ? 'No — su cuenta será foránea' : 'Sin respuesta'}</dd>
        <dt>Estado</dt><dd>{ESTADOS_SOLICITUD[s.estado] ?? s.estado}</dd>
      </dl>
      {(s.ineFrenteUrl || s.ineReversoUrl) && (
        <>
          <p className="aviso-pendiente small">Información confidencial. Uso exclusivo administrativo.</p>
          <div className="fotos-ine">
            {s.ineFrenteUrl && <FotoIne ruta={s.ineFrenteUrl} titulo="INE (frente)" />}
            {s.ineReversoUrl && <FotoIne ruta={s.ineReversoUrl} titulo="INE (reverso)" />}
          </div>
        </>
      )}
      <Resolucion s={s} />
      {s.estado === 'pendiente' && (modo === 'rechazar' ? (
        <Rechazo s={s} perfil={perfil} onListo={onCerrar} />
      ) : (
        <>
          {error && <p className="error">{error}</p>}
          <div className="acciones">
            <button className="btn peligro" disabled={enviando} onClick={() => { setError(null); setModo('rechazar'); }}>Rechazar</button>
            <button className="btn primario" disabled={enviando} onClick={aprobar}>{enviando ? 'Creando cuenta…' : 'Aprobar solicitud'}</button>
          </div>
        </>
      ))}
    </MarcoModal>
  );
}

function Credenciales({ c, s, onCerrar }: { c: Extract<ResultadoAprobar, { ok: true }>; s: SolicitudInscripcion; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState('');
  const copiar = (texto: string, que: string) => {
    void navigator.clipboard?.writeText(texto).then(() => setCopiado(que), () => setCopiado(''));
  };
  return (
    <MarcoModal titulo="Cuenta creada correctamente" onCerrar={onCerrar}>
      <p className="muted">Entrega estas credenciales a la nueva Emprendedora. No se envían por correo automáticamente.</p>
      <dl className="datos">
        <dt>Nombre</dt><dd>{c.nombre}</dd>
        <dt>Usuario</dt><dd><strong>{c.usuario}</strong></dd>
        <dt>Contraseña temporal</dt><dd><strong>{c.passwordTemporal}</strong></dd>
        <dt>Rol</dt><dd>Emprendedora</dd>
        <dt>Líder</dt><dd>{s.origen === 'publico' ? (s.liderIndicado ? `${s.liderIndicado} (sin verificar — asígnala desde Emprendedoras/Líderes)` : 'Sin asignar') : s.solicitanteNombre}</dd>
      </dl>
      <div className="acciones">
        <button className="btn" onClick={() => copiar(c.usuario, 'usuario')}>{copiado === 'usuario' ? 'Copiado' : 'Copiar usuario'}</button>
        <button className="btn" onClick={() => copiar(c.passwordTemporal, 'contraseña')}>{copiado === 'contraseña' ? 'Copiada' : 'Copiar contraseña'}</button>
        <button className="btn" onClick={() => copiar(`Usuario: ${c.usuario}\nContraseña temporal: ${c.passwordTemporal}`, 'todo')}>{copiado === 'todo' ? 'Copiadas' : 'Copiar credenciales'}</button>
        <button className="btn primario" onClick={onCerrar}>Listo</button>
      </div>
    </MarcoModal>
  );
}

function DetalleEvento({ s, perfil, onCerrar }: { s: SolicitudEvento; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [modo, setModo] = useState<'ver' | 'rechazar'>('ver');
  const { enviando, error, setError, enviar } = useEnvio();
  return (
    <MarcoModal titulo="Solicitud de evento" onCerrar={onCerrar} enviando={enviando}>
      <dl className="datos">
        <dt>Propuesto por</dt><dd>{s.solicitanteNombre}</dd>
        <dt>Fecha de solicitud</dt><dd>{fecha(s.fechaSolicitud)}</dd>
        <dt>Título</dt><dd>{s.titulo}</dd>
        <dt>Fecha y hora</dt><dd>{s.fecha ? new Date(`${s.fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'} · {s.hora}</dd>
        <dt>Tipo</dt><dd>{s.tipoEvento === 'virtual' ? 'Virtual' : 'Presencial'}</dd>
        <dt>{s.tipoEvento === 'virtual' ? 'Cómo conectarse' : 'Lugar'}</dt><dd>{s.lugarTexto}</dd>
        {s.enlace && <><dt>Enlace</dt><dd><a href={s.enlace} target="_blank" rel="noopener noreferrer">{s.enlace}</a></dd></>}
        <dt>Descripción</dt><dd>{s.descripcion}</dd>
      </dl>
      <Resolucion s={s} />
      {s.estado === 'pendiente' && (modo === 'rechazar' ? (
        <Rechazo s={s} perfil={perfil} onListo={onCerrar} />
      ) : (
        <>
          {error && <p className="error">{error}</p>}
          <div className="acciones">
            <button className="btn peligro" disabled={enviando} onClick={() => { setError(null); setModo('rechazar'); }}>Rechazar</button>
            <button className="btn primario" disabled={enviando} onClick={() => {
              if (!window.confirm(`¿Aprobar y publicar "${s.titulo}" en el calendario?`)) return;
              void enviar(async () => {
                const err = await aprobarEvento(db, s, perfil, equipoActual());
                if (!err) onCerrar();
                return err;
              });
            }}>Aprobar y publicar</button>
          </div>
        </>
      ))}
    </MarcoModal>
  );
}
