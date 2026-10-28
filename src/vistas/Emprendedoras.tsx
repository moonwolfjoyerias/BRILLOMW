// Emprendedoras/Líderes para Administración: lo mismo que
// admin-emprendedoras-lideres.html de la página, sobre los mismos documentos.
// Buscar y filtrar; perfil con Información, Compras, Apartados, Plan MW y
// (si es Líder) Equipo y rango; editar, cambiar de líder, reactivar,
// convertir Emprendedora ↔ Líder (reasignando su equipo), confirmar o
// rechazar cambios de rama, armar el equipo y limpiar el historial de compras.
import { useMemo, useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { MarcoModal, useEnvio } from './Modal';
import { useApartados } from '../apartados/acciones';
import { regla, type Ventana } from '../apartados/modelo';
import { guardarPersonas, usePersonasAdmin, type CambioPersonas } from '../personas/acciones';
import {
  aplicarInfo,
  bajaRequiereReasignar,
  boletosRifa,
  CATEGORIAS_PERSONA,
  comprasDe,
  convertirEnEmprendedora,
  convertirEnLider,
  descendencia,
  equipoActivoDirecto,
  ESTADOS_CUENTA_PERSONA,
  filtrarPersonas,
  HITOS_CONSTANCIA,
  lideresDisponibles,
  limpiarComprasVentana,
  nombreCompletoPersona,
  RANGOS_MW,
  rangoLabel,
  reactivar,
  sinSolicitudRama,
  superiorSugerida,
  validarCambioLider,
  validarInfo,
  type DatosInfo,
  type Financiero,
  type FiltrosPersonas,
  type PersonaAdmin
} from '../personas/modelo';

const $ = (n: number) => `$${Number(n || 0).toLocaleString('es-MX')} MXN`;
const fecha = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ESTADOS_VENTANA: Record<string, string> = {
  pendiente_deposito: 'Pendiente de depósito',
  pendiente_aprobacion: 'Pendiente de aprobación VIP',
  activa: 'Ventana activa',
  vencida: 'Vencida',
  cerrada: 'Cerrada'
};
const ESTADOS_PIEZA: Record<string, string> = { activa: 'Apartada', liquidada: 'Liquidada', cancelada: 'Cancelada' };
const CHIP_ESTADO: Record<string, string> = { activa: 'chip ok', inactiva: 'chip pendiente', baja: 'chip agotado' };

type Tab = 'info' | 'compras' | 'apartados' | 'planmw' | 'equipo';

export function Emprendedoras({ perfil }: { perfil: PerfilUsuario }) {
  const datos = usePersonasAdmin(db, true);
  const apartados = useApartados(db);
  const [f, setF] = useState<FiltrosPersonas>({ texto: '', tipo: '', estado: '', categoria: '', liderId: '', rango: '' });
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [cambiarLider, setCambiarLider] = useState<PersonaAdmin | null>(null);

  if (datos.estado === 'cargando') return <p className="muted">Cargando emprendedoras y líderes…</p>;
  if (datos.estado === 'error') return <p className="error">No se pudieron cargar las emprendedoras y líderes. Revisa la conexión.</p>;
  const { personas, financiero } = datos;
  const ventanas = apartados.estado === 'listo' ? apartados.ventanas : [];
  const lista = filtrarPersonas(personas, f);
  const elegida = seleccion ? personas.find(p => p.id === seleccion) : undefined;
  const set = (k: keyof FiltrosPersonas, v: string) => setF(x => ({ ...x, [k]: v }));
  const lideres = personas.filter(p => p.tipo === 'lider').sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));

  return (
    <section className="emprendedoras">
      <div className="encabezado-seccion">
        <h1>Emprendedoras / Líderes</h1>
        <p className="muted">Busca, consulta su perfil completo y edita. Lo mismo que en la página: lo que se cambie aquí o allá se ve en los dos.</p>
      </div>
      <div className="filtros-personas">
        <input type="search" placeholder="Nombre, usuario o teléfono…" value={f.texto} onChange={e => set('texto', e.target.value)} aria-label="Buscar" />
        <select value={f.tipo} onChange={e => set('tipo', e.target.value)} aria-label="Tipo">
          <option value="">Emprendedoras y líderes</option>
          <option value="emprendedora">Emprendedoras</option>
          <option value="lider">Líderes</option>
        </select>
        <select value={f.estado} onChange={e => set('estado', e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS_CUENTA_PERSONA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.categoria} onChange={e => set('categoria', e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORIAS_PERSONA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.liderId} onChange={e => set('liderId', e.target.value)} aria-label="Líder">
          <option value="">Todas las líderes</option>
          {lideres.map(l => <option key={l.id} value={l.id}>{nombreCompletoPersona(l)}</option>)}
        </select>
        <select value={f.rango} onChange={e => set('rango', e.target.value)} aria-label="Rango">
          <option value="">Todos los rangos</option>
          {RANGOS_MW.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      <p className="muted small">{lista.length} persona{lista.length === 1 ? '' : 's'}</p>
      <div className={elegida ? 'personas-columnas con-detalle' : 'personas-columnas'}>
        <div className="lista-personas">
          {!lista.length ? (
            <p className="muted">No encontramos personas. Prueba con otro nombre, usuario o teléfono.</p>
          ) : (
            lista.map(p => {
              const lider = p.liderId ? personas.find(l => l.id === p.liderId) : undefined;
              return (
                <div key={p.id} className={p.id === seleccion ? 'tarjeta-persona activa' : 'tarjeta-persona'}>
                  <button className="tarjeta-persona-cuerpo" onClick={() => setSeleccion(p.id)}>
                    <span className="inicial">{(p.nombre || '?').trim().charAt(0).toUpperCase()}</span>
                    <span className="fila-principal">
                      <strong>{nombreCompletoPersona(p) || 'Sin nombre'}</strong>
                      <span className="etiquetas"><Insignias p={p} /></span>
                      <span className="muted small">{p.usuario}{lider ? ` · Líder: ${nombreCompletoPersona(lider)}` : ' · Sin líder asignada'}</span>
                    </span>
                  </button>
                  {p.tipo === 'emprendedora' && <button className="btn mini" onClick={() => setCambiarLider(p)}>Cambiar líder</button>}
                </div>
              );
            })
          )}
        </div>
        {elegida && (
          <Perfil
            key={elegida.id}
            p={elegida}
            personas={personas}
            financiero={financiero.get(elegida.id)}
            ventanas={ventanas}
            perfil={perfil}
            onCerrar={() => setSeleccion(null)}
          />
        )}
      </div>
      {cambiarLider && <CambiarLider p={cambiarLider} personas={personas} perfil={perfil} onCerrar={() => setCambiarLider(null)} />}
    </section>
  );
}

function Insignias({ p }: { p: PersonaAdmin }) {
  return (
    <>
      <span className="chip neutro">{p.tipo === 'lider' ? 'Líder' : 'Emprendedora'}</span>
      <span className={CHIP_ESTADO[p.estado] ?? 'chip neutro'}>{ESTADOS_CUENTA_PERSONA[p.estado] ?? p.estado}</span>
      <span className="chip neutro">{CATEGORIAS_PERSONA[p.categoria] ?? p.categoria}</span>
      {p.tipo === 'lider' && <span className="chip neutro">{rangoLabel(p.rangoActualKey)}</span>}
      {p.ascensoPendiente && <span className="chip pendiente">Sube de rango</span>}
      {p.recompensaPendiente && <span className="chip pendiente">Recompensa lista</span>}
      {p.solicitudCambioRamaPendiente && <span className="chip agotado">Solicitud de cambio de rama</span>}
    </>
  );
}

/** Ejecuta un cambio con confirmación, mostrando el error si lo hay. */
function useCambio(perfil: PerfilUsuario) {
  const { enviando, error, setError, enviar } = useEnvio();
  const aplicar = (c: CambioPersonas, pregunta?: string, alTerminar?: () => void) => {
    if (pregunta && !window.confirm(pregunta)) return;
    void enviar(async () => {
      const err = await guardarPersonas(db, c, perfil, equipoActual());
      if (!err) alTerminar?.();
      return err;
    });
  };
  return { enviando, error, setError, aplicar };
}

function Perfil({ p, personas, financiero, ventanas, perfil, onCerrar }: {
  p: PersonaAdmin;
  personas: PersonaAdmin[];
  financiero: Financiero | undefined;
  ventanas: Ventana[];
  perfil: PerfilUsuario;
  onCerrar: () => void;
}) {
  const [tab, setTab] = useState<Tab>('info');
  const [modal, setModal] = useState<null | 'editar' | 'convertir'>(null);
  const { enviando, error, aplicar } = useCambio(perfil);
  const esLider = p.tipo === 'lider';
  const nombre = nombreCompletoPersona(p);
  const lider = p.liderId ? personas.find(x => x.id === p.liderId) : undefined;
  const tabs: [Tab, string][] = [['info', 'Información'], ['compras', 'Compras'], ['apartados', 'Apartados'], ['planmw', 'Plan MW'], ...(esLider ? [['equipo', 'Equipo y rango'] as [Tab, string]] : [])];

  const convertirLider = () =>
    aplicar(
      { personas: [{ id: p.id, aplicar: convertirEnLider }], actividad: [{ accion: 'convertir_lider', descripcion: `${nombre} fue convertida de Emprendedora a Líder` }] },
      `¿Convertir a ${nombre} de Emprendedora a Líder?`
    );
  const convertirEmprendedora = () => {
    if (equipoActivoDirecto(personas, p.id).length) { setModal('convertir'); return; }
    aplicar(
      { personas: [{ id: p.id, aplicar: convertirEnEmprendedora }], actividad: [{ accion: 'convertir_emprendedora', descripcion: `${nombre} fue convertida de Líder a Emprendedora` }] },
      `¿Convertir a ${nombre} de Líder a Emprendedora?`
    );
  };

  return (
    <div className="tarjeta-caja perfil-persona">
      <div className="fila-titulo">
        <div>
          <h2>{nombre || 'Sin nombre'}</h2>
          <div className="etiquetas"><Insignias p={p} /></div>
        </div>
        <button className="btn" onClick={onCerrar}>Cerrar</button>
      </div>
      <nav className="pestanas" aria-label="Perfil">
        {tabs.map(([k, v]) => <button key={k} className={tab === k ? 'nav-boton activo' : 'nav-boton'} onClick={() => setTab(k)}>{v}</button>)}
      </nav>

      {tab === 'info' && (
        <>
          <dl className="datos">
            <dt>Nombre</dt><dd>{p.nombre}</dd>
            <dt>Apellidos</dt><dd>{p.apellidos || '—'}</dd>
            <dt>Teléfono</dt><dd>{p.telefono || '—'}</dd>
            <dt>Correo</dt><dd>{p.correo || '—'}</dd>
            <dt>Usuario</dt><dd>{p.usuario || '—'}</dd>
            <dt>Fecha de alta</dt><dd>{fecha(p.fechaAlta)}</dd>
            <dt>Categoría</dt><dd>{CATEGORIAS_PERSONA[p.categoria] ?? p.categoria}</dd>
            <dt>Estado de cuenta</dt><dd>{ESTADOS_CUENTA_PERSONA[p.estado] ?? p.estado}</dd>
            <dt>Líder actual</dt><dd>{lider ? nombreCompletoPersona(lider) : 'Sin líder asignada'}</dd>
            <dt>Tipo de cuenta</dt><dd>{esLider ? 'Líder' : 'Emprendedora'}</dd>
          </dl>
          {esLider && (
            <>
              <h3>Datos bancarios</h3>
              {financiero?.datosBancarios && (financiero.datosBancarios.titular || financiero.datosBancarios.banco || financiero.datosBancarios.clabe) ? (
                <dl className="datos">
                  <dt>Titular</dt><dd>{financiero.datosBancarios.titular || '—'}</dd>
                  <dt>Banco</dt><dd>{financiero.datosBancarios.banco || '—'}</dd>
                  <dt>CLABE</dt><dd>{financiero.datosBancarios.clabe || '—'}</dd>
                </dl>
              ) : (
                <p className="muted small">Todavía no registra sus datos bancarios. (La carátula de la CLABE se ve en la página.)</p>
              )}
            </>
          )}
          {p.estado === 'inactiva' && (
            <div className="nota-apartado">
              <strong>Cuenta inactiva</strong>
              <p className="small">No tuvo compra mínima de $500 en 6 meses seguidos (o Admin la marcó así). Al reactivarla queda sin líder asignada; luego puedes asignarle una.</p>
              <div className="acciones izq">
                <button className="btn primario" disabled={enviando} onClick={() => aplicar(
                  { personas: [{ id: p.id, aplicar: reactivar }], actividad: [{ accion: 'reactivar_cuenta', descripcion: `${nombre} reactivada manualmente por Admin — vuelve a la raíz del árbol, sin líder asignada` }] },
                  `¿Reactivar a ${nombre}? Quedará activa y sin líder asignada.`
                )}>Reactivar cuenta</button>
              </div>
            </div>
          )}
          {p.solicitudCambioRamaPendiente && (() => {
            const sol = p.solicitudCambioRamaPendiente;
            const propuesta = personas.find(x => x.id === sol.liderPropuestaId);
            const actual = sol.liderActualId ? personas.find(x => x.id === sol.liderActualId) : undefined;
            return (
              <div className="nota-apartado">
                <strong>Solicitud de cambio de rama pendiente</strong>
                <p className="small">
                  {sol.solicitadoPorNombre} solicitó cambiarla de {actual ? nombreCompletoPersona(actual) : 'sin líder'} a {propuesta ? nombreCompletoPersona(propuesta) : '—'}{sol.motivo ? `: "${sol.motivo}"` : ''}.
                </p>
                <div className="acciones izq">
                  <button className="btn" disabled={enviando} onClick={() => aplicar(
                    { personas: [{ id: p.id, aplicar: sinSolicitudRama }], actividad: [{ accion: 'rechazar_solicitud_cambio_rama', descripcion: `Solicitud de cambio de rama de ${nombre} rechazada` }] },
                    '¿Rechazar la solicitud de cambio de rama?'
                  )}>Rechazar</button>
                  <button className="btn primario" disabled={enviando || !propuesta} onClick={() => aplicar(
                    {
                      personas: [{ id: p.id, aplicar: c => ({ ...sinSolicitudRama(c), liderId: sol.liderPropuestaId }) }],
                      actividad: [{ accion: 'cambio_rama', descripcion: `${nombre} cambió de rama — ahora en el equipo de ${propuesta ? nombreCompletoPersona(propuesta) : ''}` }],
                      avisos: [{ texto: `Tu rama cambió — ahora perteneces al equipo de ${propuesta ? nombreCompletoPersona(propuesta) : ''}.`, link: 'cuenta', paraId: p.id, rolDestino: 'emprendedora_lider', origen: 'admin' }]
                    },
                    `${nombre} pasará al equipo de ${propuesta ? nombreCompletoPersona(propuesta) : ''}. ¿Confirmas el cambio?`
                  )}>Confirmar cambio</button>
                </div>
              </div>
            );
          })()}
          {error && <p className="error">{error}</p>}
          <div className="acciones">
            {esLider ? (
              <button className="btn" disabled={enviando} onClick={convertirEmprendedora}>Convertir en Emprendedora</button>
            ) : (
              <button className="btn" disabled={enviando} onClick={convertirLider}>Convertir en Líder</button>
            )}
            <button className="btn primario" disabled={enviando} onClick={() => setModal('editar')}>Editar</button>
          </div>
        </>
      )}
      {tab === 'compras' && <Compras p={p} ventanas={ventanas} perfil={perfil} />}
      {tab === 'apartados' && <Apartados p={p} ventanas={ventanas} />}
      {tab === 'planmw' && <PlanMW p={p} financiero={financiero} />}
      {tab === 'equipo' && esLider && <Equipo p={p} personas={personas} perfil={perfil} />}

      {modal === 'editar' && <EditarInfo p={p} personas={personas} ventanas={ventanas} perfil={perfil} onCerrar={() => setModal(null)} />}
      {modal === 'convertir' && (
        <Reasignar
          p={p}
          personas={personas}
          perfil={perfil}
          titulo={`Convertir a ${nombre} en Emprendedora — reasignar su equipo`}
          explicacion="Una Emprendedora no puede tener equipo propio: se pasa a otra líder antes de continuar, igual que al dar de baja a una líder."
          boton="Convertir y reasignar equipo"
          aplicarPersona={convertirEnEmprendedora}
          accion="convertir_emprendedora_comprimir_equipo"
          texto={(movidos, destino) => `${nombre} convertida de Líder a Emprendedora — equipo de ${movidos} persona${movidos === 1 ? '' : 's'} ${destino ? `reasignado a ${destino}` : 'dejado sin líder asignada (pendiente de decidir)'}`}
          onCerrar={() => setModal(null)}
        />
      )}
    </div>
  );
}

function EditarInfo({ p, personas, ventanas, perfil, onCerrar }: { p: PersonaAdmin; personas: PersonaAdmin[]; ventanas: Ventana[]; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [d, setD] = useState<DatosInfo>({ nombre: p.nombre, apellidos: p.apellidos, telefono: p.telefono, correo: p.correo, usuario: p.usuario, categoria: p.categoria, estado: p.estado, liderId: p.liderId });
  const [reasignar, setReasignar] = useState(false);
  const { enviando, error, setError, enviar } = useEnvio();
  const set = <K extends keyof DatosInfo>(k: K, v: DatosInfo[K]) => setD(x => ({ ...x, [k]: v }));
  const candidatas = personas.filter(x => x.tipo === 'lider' && x.id !== p.id).sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));
  const nombre = [d.nombre.trim(), d.apellidos.trim()].filter(Boolean).join(' ');

  const cambio = (): CambioPersonas => ({
    personas: [{ id: p.id, aplicar: c => aplicarInfo(c, d) }],
    actividad: [{ accion: 'editar_informacion', descripcion: `Información actualizada: ${nombre}` }],
    ...(d.categoria !== p.categoria ? { categoria: { personaId: p.id, categoria: d.categoria, ventanaIds: ventanas.filter(v => v.usuarioId === p.id).map(v => v.id) } } : {})
  });

  const guardar = (ev: FormEvent) => {
    ev.preventDefault();
    const err = validarInfo(d, p, personas);
    if (err) { setError(err); return; }
    if (bajaRequiereReasignar(p, d, personas)) { setReasignar(true); return; }
    void enviar(async () => {
      const r = await guardarPersonas(db, cambio(), perfil, equipoActual());
      if (!r) onCerrar();
      return r;
    });
  };

  if (reasignar) {
    return (
      <Reasignar
        p={p}
        personas={personas}
        perfil={perfil}
        titulo={`Dar de baja a ${nombre} — reasignar su equipo`}
        explicacion="Su equipo se comprime hacia la líder inmediata superior al darla de baja. Confirma o cambia el destino antes de continuar."
        boton="Dar de baja y reasignar"
        aplicarPersona={c => aplicarInfo(c, d)}
        accion="baja_lider_comprimir_equipo"
        texto={(movidos, destino) => `${nombre} dada de baja — equipo de ${movidos} persona${movidos === 1 ? '' : 's'} ${destino ? `reasignado a ${destino}` : 'dejado sin líder asignada (pendiente de decidir)'}`}
        extra={d.categoria !== p.categoria ? cambio().categoria : undefined}
        onCerrar={onCerrar}
      />
    );
  }

  return (
    <MarcoModal titulo={`Editar — ${nombreCompletoPersona(p)}`} onCerrar={onCerrar} onEnviar={guardar} enviando={enviando}>
      <div className="rejilla-form">
        <label className="campo"><span>Nombre *</span><input value={d.nombre} onChange={e => set('nombre', e.target.value)} /></label>
        <label className="campo"><span>Apellidos</span><input value={d.apellidos} onChange={e => set('apellidos', e.target.value)} /></label>
        <label className="campo"><span>Teléfono</span><input value={d.telefono} onChange={e => set('telefono', e.target.value)} /></label>
        <label className="campo"><span>Correo</span><input type="email" value={d.correo} onChange={e => set('correo', e.target.value)} /></label>
        <label className="campo"><span>Usuario</span><input value={d.usuario} onChange={e => set('usuario', e.target.value)} /></label>
        <label className="campo">
          <span>Categoría</span>
          <select value={d.categoria} onChange={e => set('categoria', e.target.value)}>{Object.entries(CATEGORIAS_PERSONA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="campo">
          <span>Estado de cuenta</span>
          <select value={d.estado} onChange={e => set('estado', e.target.value)}>{Object.entries(ESTADOS_CUENTA_PERSONA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="campo">
          <span>Líder actual</span>
          <select value={d.liderId ?? ''} onChange={e => set('liderId', e.target.value || null)}>
            <option value="">Sin líder asignada</option>
            {candidatas.map(l => <option key={l.id} value={l.id}>{nombreCompletoPersona(l)}</option>)}
          </select>
        </label>
      </div>
      {d.categoria !== p.categoria && <p className="nota-apartado small">Sus apartados abiertos toman las condiciones de {CATEGORIAS_PERSONA[d.categoria]} y se le avisa.</p>}
      {d.usuario.trim() !== p.usuario && <p className="muted small">El usuario cambia en su perfil; la contraseña de acceso no cambia.</p>}
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar cambios'}</button></div>
    </MarcoModal>
  );
}

/** Reasignar el equipo directo antes de dar de baja o convertir a Emprendedora (nunca automático). */
function Reasignar({ p, personas, perfil, titulo, explicacion, boton, aplicarPersona, accion, texto, extra, onCerrar }: {
  p: PersonaAdmin;
  personas: PersonaAdmin[];
  perfil: PerfilUsuario;
  titulo: string;
  explicacion: string;
  boton: string;
  aplicarPersona: (c: Record<string, unknown>) => Record<string, unknown>;
  accion: string;
  texto: (movidos: number, destino: string | null) => string;
  extra?: CambioPersonas['categoria'];
  onCerrar: () => void;
}) {
  const equipo = equipoActivoDirecto(personas, p.id);
  const sugerida = superiorSugerida(personas, p);
  const [destino, setDestino] = useState(sugerida?.id ?? '');
  const { enviando, error, enviar } = useEnvio();
  const opciones = lideresDisponibles(personas, p.id);
  const confirmar = () => {
    const d = destino ? personas.find(x => x.id === destino) : undefined;
    void enviar(async () => {
      const err = await guardarPersonas(
        db,
        {
          personas: [{ id: p.id, aplicar: aplicarPersona }, ...equipo.map(m => ({ id: m.id, aplicar: (c: Record<string, unknown>) => ({ ...c, liderId: destino || null }) }))],
          actividad: [{ accion, descripcion: texto(equipo.length, d ? nombreCompletoPersona(d) : null) }],
          ...(extra ? { categoria: extra } : {})
        },
        perfil,
        equipoActual()
      );
      if (!err) onCerrar();
      return err;
    });
  };
  return (
    <MarcoModal titulo={titulo} onCerrar={onCerrar} enviando={enviando}>
      <p>{equipo.length} persona{equipo.length === 1 ? '' : 's'} depende{equipo.length === 1 ? '' : 'n'} directamente de ella. {explicacion}</p>
      <ul className="lista-simple">{equipo.map(m => <li key={m.id}>{nombreCompletoPersona(m)}</li>)}</ul>
      <label className="campo">
        <span>Nueva líder para este equipo</span>
        <select value={destino} onChange={e => setDestino(e.target.value)}>
          <option value="">— Dejar sin líder por ahora (decidir después) —</option>
          {opciones.map(l => <option key={l.id} value={l.id}>{nombreCompletoPersona(l)}{l.id === sugerida?.id ? ' (líder superior — sugerida)' : ''}</option>)}
        </select>
      </label>
      {!sugerida && <p className="muted small">No tenía líder superior activa: elige a quién pasa su equipo, o déjalo sin asignar por ahora.</p>}
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn peligro" disabled={enviando} onClick={confirmar}>{boton}</button></div>
    </MarcoModal>
  );
}

function CambiarLider({ p, personas, perfil, onCerrar }: { p: PersonaAdmin; personas: PersonaAdmin[]; perfil: PerfilUsuario; onCerrar: () => void }) {
  const [liderId, setLiderId] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const nombre = nombreCompletoPersona(p);
  const anterior = p.liderId ? personas.find(x => x.id === p.liderId) : undefined;
  return (
    <MarcoModal
      titulo={`Cambiar líder de ${nombre}`}
      onCerrar={onCerrar}
      enviando={enviando}
      onEnviar={ev => {
        ev.preventDefault();
        const err = validarCambioLider(personas, p, liderId);
        if (err) { setError(err); return; }
        const nueva = personas.find(x => x.id === liderId)!;
        void enviar(async () => {
          const r = await guardarPersonas(
            db,
            {
              personas: [{ id: p.id, aplicar: c => ({ ...sinSolicitudRama(c), liderId }) }],
              actividad: [{ accion: 'cambiar_lider_directo', descripcion: `${nombre} pasó de ${anterior ? nombreCompletoPersona(anterior) : 'sin líder'} a ${nombreCompletoPersona(nueva)}` }],
              avisos: [{ texto: `Administración cambió tu equipo — ahora perteneces a la rama de ${nombreCompletoPersona(nueva)}.`, link: 'cuenta', paraId: p.id, rolDestino: 'emprendedora_lider', origen: 'admin' }]
            },
            perfil,
            equipoActual()
          );
          if (!r) onCerrar();
          return r;
        });
      }}
    >
      <p className="muted">Efecto inmediato, sin solicitud ni aprobación. Si tiene equipo propio, se mueve con ella.</p>
      <label className="campo">
        <span>Nueva líder</span>
        <select value={liderId} onChange={e => setLiderId(e.target.value)}>
          <option value="">Elige una líder…</option>
          {lideresDisponibles(personas, p.id).map(l => <option key={l.id} value={l.id}>{nombreCompletoPersona(l)}</option>)}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>Cambiar ahora</button></div>
    </MarcoModal>
  );
}

function Compras({ p, ventanas, perfil }: { p: PersonaAdmin; ventanas: Ventana[]; perfil: PerfilUsuario }) {
  const compras = comprasDe(ventanas, p.id);
  const total = compras.reduce((s, c) => s + c.total, 0);
  const { enviando, error, aplicar } = useCambio(perfil);
  if (!compras.length) return <p className="muted">Sin compras registradas todavía. Aquí aparecen las piezas que {p.nombre} liquide en Apartados.</p>;
  const ids = [...new Set(compras.map(c => c.ventanaId))];
  return (
    <>
      <div className="resumen-apartados">
        <div className="dato"><span>Compras liquidadas</span><strong>{compras.length}</strong></div>
        <div className="dato"><span>Total acumulado</span><strong>{$(total)}</strong></div>
      </div>
      <ul className="historial">
        {compras.map((c, i) => (
          <li key={i}>
            <strong>{c.producto} · {$(c.total)}</strong>
            <span className="muted small bloque">{c.detalle} · Ventana {c.ventanaId} · {fecha(c.fecha)}</span>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
      <div className="acciones">
        <button className="btn peligro" disabled={enviando} onClick={() => aplicar(
          {
            personas: [],
            limpiarCompras: { ventanaIds: ids, aplicar: v => limpiarComprasVentana(v, perfil.nombre, new Date())?.ventana ?? null },
            actividad: [{ accion: 'limpiar_historial_compras', descripcion: `Limpió el historial de compras de ${nombreCompletoPersona(p)}: ${compras.length} compra${compras.length === 1 ? '' : 's'} (${$(total)}).` }]
          },
          `Se quitarán las ${compras.length} compras de ${nombreCompletoPersona(p)} (${$(total)}). Dejarán de contar para su rango, comisiones, rifa y constancia. Sus apartados no se borran. ¿Continuar?`
        )}>Limpiar historial de compras</button>
      </div>
    </>
  );
}

function Apartados({ p, ventanas }: { p: PersonaAdmin; ventanas: Ventana[] }) {
  const suyas = ventanas.filter(v => v.usuarioId === p.id);
  if (!suyas.length) return <p className="muted">{p.nombre} no tiene ventanas de apartado activas ni anteriores.</p>;
  return (
    <div className="lista-nomina">
      {suyas.map(v => (
        <div key={v.id} className="tarjeta-caja">
          <div className="fila-titulo"><strong>Ventana {v.id}</strong><span className="chip neutro">{ESTADOS_VENTANA[v.estado] ?? v.estado}</span></div>
          <p className="muted small">
            Categoría: {regla(v.categoria).etiqueta} · Depósito: {$(v.depositoApartadoDisponible)}{v.metodoDeposito ? ` (${v.metodoDeposito})` : ''} · Desde {fecha(v.fechaInicio)}{v.fechaVencimiento ? ` hasta ${fecha(v.fechaVencimiento)}` : ''}
          </p>
          <ul className="historial">
            {v.apartados.length ? v.apartados.map(pz => (
              <li key={pz.id}>
                <strong>{pz.producto}{[pz.colorOro, pz.variante].filter(Boolean).length ? ` · ${[pz.colorOro, pz.variante].filter(Boolean).join(' · ')}` : ''}</strong>
                <span className="muted small bloque">{$(pz.saldo)} saldo · {ESTADOS_PIEZA[pz.estado] ?? pz.estado}</span>
              </li>
            )) : <li className="muted">Sin piezas registradas</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PlanMW({ p, financiero }: { p: PersonaAdmin; financiero: Financiero | undefined }) {
  if (!financiero) return <p className="muted">Todavía no hay datos de constancia ni de rifa para {p.nombre}.</p>;
  const { constancia, rifa } = financiero;
  const boletos = boletosRifa(rifa);
  const barra = (v: number, meta: number) => <div className="barra-progreso"><div style={{ width: `${Math.min(100, (v / (meta || 1)) * 100)}%` }} /></div>;
  return (
    <>
      <h3>Reto de Constancia</h3>
      <div className="resumen-apartados">
        <div className="dato"><span>Compras cumplidas</span><strong>{constancia.mesesCumplidos}</strong></div>
        <div className="dato"><span>Compra del mes en curso</span><strong>{$(constancia.montoMesActual)}</strong><span className="small">de {$(constancia.metaMes)}</span></div>
      </div>
      {barra(constancia.montoMesActual, constancia.metaMes)}
      <div className="resumen-apartados">
        {HITOS_CONSTANCIA.map(h => {
          const otorgado = constancia.hitosOtorgados.some(o => o.meses === h.meses);
          return (
            <div key={h.meses} className="dato">
              <span>{h.meses} compras</span>
              <strong>{h.premio}</strong>
              <span className="small">{otorgado ? 'Entregado' : constancia.mesesCumplidos >= h.meses ? 'Cumplido, por confirmar' : 'Pendiente'}</span>
            </div>
          );
        })}
      </div>
      {p.recompensaPendiente && <p className="nota-apartado">Cumplió {p.recompensaPendiente.meses} compras: falta confirmar la entrega de {p.recompensaPendiente.premio}. Se confirma en la pestaña Plan MW.</p>}
      <h3>Boletos de rifa (mes en curso)</h3>
      <div className="resumen-apartados">
        <div className="dato"><span>Próximo beneficio</span><strong className="texto-normal">{boletos.mensaje}</strong></div>
        <div className="dato"><span>Compra acumulada del mes</span><strong>{$(rifa.montoAcumuladoMes)}</strong><span className="small">de {$(rifa.meta)}</span></div>
      </div>
      {barra(rifa.montoAcumuladoMes, rifa.meta)}
    </>
  );
}

function Equipo({ p, personas, perfil }: { p: PersonaAdmin; personas: PersonaAdmin[]; perfil: PerfilUsuario }) {
  const { conNivel, porLider } = useMemo(() => descendencia(personas, p.id), [personas, p.id]);
  const [nivelAbierto, setNivelAbierto] = useState<number | null>(null);
  const [agregar, setAgregar] = useState('');
  const { enviando, error, aplicar } = useCambio(perfil);
  const directo = personas.filter(x => x.liderId === p.id);
  const nombre = nombreCompletoPersona(p);
  const porNivel = (n: number) => conNivel.filter(x => x.nivel === n).map(x => x.persona);
  // Nadie de su línea hacia arriba (quedaría siendo líder de su propia líder).
  const arriba = new Set<string>();
  for (let x = p.liderId ? personas.find(y => y.id === p.liderId) : undefined; x && !arriba.has(x.id); x = x.liderId ? personas.find(y => y.id === x!.liderId) : undefined) arriba.add(x.id);
  const candidatas = personas
    .filter(x => x.id !== p.id && x.liderId !== p.id && !arriba.has(x.id))
    .sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));
  const rangoActual = RANGOS_MW.findIndex(r => r.key === p.rangoActualKey);
  const siguiente = RANGOS_MW[rangoActual + 1];

  const Nodo = ({ x, nivel }: { x: PersonaAdmin; nivel: number }) => (
    <li>
      <span className={nivel === 0 ? 'nodo raiz' : 'nodo'}>
        <strong>{nombreCompletoPersona(x)}</strong>
        <span className="muted small"> · {nivel === 0 ? (x.tipo === 'lider' ? 'Líder' : 'Emprendedora') : `Nivel ${nivel}`}{x.alertaInactividad ? ' · Sin actividad' : ''}</span>
      </span>
      {(porLider[x.id] ?? []).length > 0 && nivel < 12 && <ul>{porLider[x.id].map(h => <Nodo key={h.id} x={h} nivel={nivel + 1} />)}</ul>}
    </li>
  );

  return (
    <>
      <h3>Rango</h3>
      <p>
        <strong>Rango actual: {rangoLabel(p.rangoActualKey)}</strong>
        {siguiente ? <span className="muted"> · Siguiente: {siguiente.label} ({siguiente.personas} personas activas, {siguiente.produccion.toLocaleString('es-MX')} puntos de producción grupal, {siguiente.calificado} calificadas)</span> : <span className="muted"> · Ya está en el rango más alto.</span>}
      </p>
      {p.ascensoPendiente && <p className="nota-apartado">Lista para subir a {rangoLabel(p.ascensoPendiente.rangoKey)}. El ascenso se confirma en la pestaña Plan MW (ahí se ve qué requisito le falta).</p>}
      <h3>Equipo</h3>
      <div className="resumen-apartados niveles">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} className={nivelAbierto === n ? 'dato dato-boton activo' : 'dato dato-boton'} onClick={() => setNivelAbierto(nivelAbierto === n ? null : n)}>
            <span>Nivel {n}</span><strong>{porNivel(n).length}</strong><span className="small">Toca para ver</span>
          </button>
        ))}
      </div>
      {nivelAbierto && (
        <ul className="historial">
          {porNivel(nivelAbierto).length ? porNivel(nivelAbierto).map(x => (
            <li key={x.id}><strong>{nombreCompletoPersona(x)}</strong> <span className="muted small">{x.tipo === 'lider' ? 'Líder' : 'Emprendedora'} · {ESTADOS_CUENTA_PERSONA[x.estado] ?? x.estado}{x.alertaInactividad ? ' · Sin actividad' : ''}</span></li>
          )) : <li className="muted">Todavía no hay integrantes en este nivel.</li>}
        </ul>
      )}
      <h3>Árbol del equipo</h3>
      <div className="arbol-equipo"><ul><Nodo x={p} nivel={0} /></ul></div>
      <h3>Equipo directo</h3>
      <div className="etiquetas">
        {directo.length ? directo.map(m => (
          <span key={m.id} className="chip neutro con-boton">
            {nombreCompletoPersona(m)}
            <button aria-label={`Quitar a ${nombreCompletoPersona(m)}`} disabled={enviando} onClick={() => aplicar(
              { personas: [{ id: m.id, aplicar: c => ({ ...c, liderId: null }) }], actividad: [{ accion: 'equipo_quitar', descripcion: `${nombreCompletoPersona(m)} removida del equipo de ${nombre}` }] },
              `¿Quitar a ${nombreCompletoPersona(m)} del equipo de ${nombre}? Quedará sin líder asignada.`
            )}>×</button>
          </span>
        )) : <span className="muted small">Sin integrantes directos todavía.</span>}
      </div>
      <div className="acciones izq">
        <select value={agregar} onChange={e => setAgregar(e.target.value)} aria-label="Agregar integrante">
          <option value="">Agregar integrante…</option>
          {candidatas.map(x => <option key={x.id} value={x.id}>{nombreCompletoPersona(x)}</option>)}
        </select>
        <button className="btn" disabled={!agregar || enviando} onClick={() => {
          const x = personas.find(y => y.id === agregar);
          if (!x) return;
          aplicar(
            { personas: [{ id: x.id, aplicar: c => ({ ...c, liderId: p.id }) }], actividad: [{ accion: 'equipo_agregar', descripcion: `${nombreCompletoPersona(x)} asignada al equipo de ${nombre}` }] },
            `¿Asignar a ${nombreCompletoPersona(x)} al equipo de ${nombre}?`,
            () => setAgregar('')
          );
        }}>Agregar</button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted small">Sus comisiones por nivel se ven en la pestaña Comisiones, y sus requisitos de rango en Plan MW.</p>
    </>
  );
}
