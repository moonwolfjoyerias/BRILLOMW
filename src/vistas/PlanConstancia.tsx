// Plan de Constancia (solo Administración): cuánto lleva cada e/l en su reto,
// cuánto le falta este mes y para su siguiente premio. Se arranca importando
// la hoja "PLAN DE CONSTANCIA" del Excel de Administración, y luego Admin
// carga "lo que va del mes" al corte del día 14 y al cierre de cada mes.
import { useMemo, useState, type ReactNode } from 'react';
import { db, dbEquipo } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { usePersonasAdmin } from '../personas/acciones';
import { HITOS_CONSTANCIA, nombreCompletoPersona, type PersonaAdmin } from '../personas/modelo';
import { useArbol } from '../arbol/acciones';
import { leerLibroXlsx, leerObjetosXlsx } from '../exportar/leerXlsx';
import { cambiarPlan, emparejarPersona, guardarPlanes, usePlanesConstancia } from '../constancia/acciones';
import {
  aplicarMonto,
  calcularPlan,
  columnasCarga,
  dinero,
  etiquetaMes,
  leerHojaConstancia,
  mesKey,
  META_COMPRA,
  planNuevo,
  sumarMeses,
  type FilaImportada,
  type PlanConstancia,
  type ResultadoPlan
} from '../constancia/plan';
import { MarcoModal, useEnvio } from './Modal';

const hitos = () => HITOS_CONSTANCIA.map(h => ({ meses: h.meses, premio: h.premio }));
type Filtro = 'todas' | 'activas' | 'caidas' | 'entregar';

export function PlanConstanciaVista({ perfil, embebido = false }: { perfil: PerfilUsuario; /** Dentro de otra sección con pestañas: el título va como h2. */ embebido?: boolean }) {
  const Titulo = embebido ? 'h2' : 'h1';
  const planes = usePlanesConstancia(db);
  const personas = usePersonasAdmin(db, false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ventana, setVentana] = useState<'importar' | 'cargar' | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const hoy = mesKey(new Date());

  const filas = useMemo(() => {
    if (!planes) return [];
    return [...planes.values()].map(p => ({ p, r: calcularPlan(p, hitos(), hoy) })).sort((a, b) => a.p.personaNombre.localeCompare(b.p.personaNombre));
  }, [planes, hoy]);

  if (perfil.rol !== 'admin') return <p className="muted">Solo Administración maneja el Plan de constancia.</p>;
  if (!planes || personas.estado === 'cargando') return <p className="muted">Cargando el plan de constancia…</p>;
  const lista = personas.estado === 'listo' ? personas.personas : [];

  const q = busca.trim().toLowerCase();
  const vistas = filas.filter(({ p, r }) =>
    (!q || p.personaNombre.toLowerCase().includes(q)) &&
    (filtro === 'todas' || (filtro === 'activas' && r.estado === 'activa') || (filtro === 'caidas' && r.estado === 'caida') || (filtro === 'entregar' && r.porEntregar.length > 0)));
  const activas = filas.filter(f => f.r.estado === 'activa').length;
  const porEntregar = filas.reduce((s, f) => s + f.r.porEntregar.length, 0);
  const avisar = (t: string) => { setAviso(t); setTimeout(() => setAviso(null), 6000); };

  return (
    <section className="plan-constancia">
      <div className="encabezado-seccion con-accion">
        <div>
          <Titulo>Plan de constancia</Titulo>
          <p className="muted">Cada {dinero(META_COMPRA)} acumulados es una compra. Cada mes del reto pide {dinero(META_COMPRA)}; lo que sobra cubre los meses siguientes, y un mes sin compras hace perder el reto.</p>
        </div>
        <div className="acciones izquierda sin-margen">
          <button className="btn" onClick={() => setVentana('importar')}>Importar hoja del Excel</button>
          <button className="btn primario" onClick={() => setVentana('cargar')}>Cargar compras del mes</button>
        </div>
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <div className="filtros-estadisticas no-fija">
        <label className="campo"><span>Buscar</span><input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nombre" /></label>
        <label className="campo"><span>Mostrar</span>
          <select value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
            <option value="todas">Todas ({filas.length})</option>
            <option value="activas">En su reto ({activas})</option>
            <option value="caidas">Perdieron su reto ({filas.length - activas})</option>
            <option value="entregar">Premios por entregar ({porEntregar})</option>
          </select>
        </label>
        <div className="muted small arbol-meta"><span>Mes en curso: <b>{etiquetaMes(hoy)}</b></span></div>
      </div>
      {!filas.length ? (
        <p className="muted">Todavía no hay planes. Empieza con <b>Importar hoja del Excel</b>.</p>
      ) : (
        <div className="tabla-desplazable">
          <table className="tabla tabla-constancia">
            <thead><tr><th>Persona</th><th className="num">Acumulado</th><th className="num">Compras</th><th>Este mes</th><th>Siguiente premio</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {vistas.map(({ p, r }) => (
                <tr key={p.personaId}>
                  <td><strong>{p.personaNombre}</strong><div className="muted small">Desde {etiquetaMes(p.inicio)} · mes {r.mesDelReto} del reto</div></td>
                  <td className="num">{dinero(r.acumulado)}</td>
                  <td className="num"><strong>{r.compras}</strong></td>
                  <td>{r.estado === 'caida' ? '—' : <>{dinero(r.montoMesActual)}{r.faltaMes > 0 ? <div className="error small">Le faltan {dinero(r.faltaMes)}</div> : <div className="muted small">Mes cubierto</div>}</>}</td>
                  <td>{r.siguiente ? <>{r.siguiente.premio}<div className="muted small">Faltan {dinero(r.faltaSiguiente)}</div></> : <span className="chip ok">Completó el reto</span>}</td>
                  <td>
                    {r.estado === 'caida' ? <span className="chip agotado" title={r.motivoCaida ?? ''}>Perdió el reto</span> : <span className="chip ok">En su reto</span>}
                    {r.porEntregar.length > 0 && <div><span className="chip pendiente">Entregar: {r.porEntregar.map(h => h.premio).join(', ')}</span></div>}
                  </td>
                  <td><button className="btn mini" onClick={() => setDetalle(p.personaId)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ventana === 'importar' && <Importar personas={lista} planes={planes} perfil={perfil} onCerrar={t => { setVentana(null); if (t) avisar(t); }} />}
      {ventana === 'cargar' && <Cargar personas={lista} planes={planes} perfil={perfil} onCerrar={t => { setVentana(null); if (t) avisar(t); }} />}
      {detalle && planes.get(detalle) && <Detalle plan={planes.get(detalle)!} perfil={perfil} onCerrar={() => setDetalle(null)} />}
    </section>
  );
}

// ------------------------------------------------------------ detalle

function Detalle({ plan, perfil, onCerrar }: { plan: PlanConstancia; perfil: PerfilUsuario; onCerrar: () => void }) {
  const hoy = mesKey(new Date());
  const r = calcularPlan(plan, hitos(), hoy);
  const { enviando, error, enviar } = useEnvio();
  const [editando, setEditando] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [reiniciar, setReiniciar] = useState(false);
  const guardar = (f: (p: PlanConstancia) => PlanConstancia, accion: string, descripcion: string) =>
    void enviar(() => cambiarPlan(db, plan.personaId, p => (p ? f(p) : 'Ese plan ya no existe.'), perfil, equipoActual(), { accion, descripcion: `Plan de constancia de ${plan.personaNombre}: ${descripcion}` }));
  // Todos los meses del reto, del inicio al mes en curso.
  const meses: string[] = [];
  for (let mk = plan.inicio, i = 0; mk <= hoy && i < 600; mk = sumarMeses(mk, 1), i++) meses.push(mk);
  const calc = new Map(r.meses.map(m => [m.mesKey, m]));
  return (
    <MarcoModal titulo={`Plan de constancia — ${plan.personaNombre}`} onCerrar={onCerrar} enviando={enviando}>
      <Resumen r={r} />
      {r.estado === 'caida' && <p className="error">{r.motivoCaida} Perdió el reto en {etiquetaMes(r.caidaEn!)}.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <h3>Premios</h3>
      <ul className="lista-filas">
        {hitos().map(h => {
          const alcanzado = r.compras >= h.meses;
          const entrega = plan.entregados[String(h.meses)];
          return (
            <li key={h.meses} className="fila-premio">
              <span><strong>{h.meses} compras — {h.premio}</strong> <span className="muted small">({dinero(h.meses * META_COMPRA)})</span></span>
              <span>
                {entrega ? <span className="chip ok">Entregado {new Date(entrega.fecha).toLocaleDateString('es-MX')}</span> : alcanzado ? <span className="chip pendiente">Por entregar</span> : <span className="muted small">Faltan {dinero(h.meses * META_COMPRA - r.acumulado)}</span>}
                {(alcanzado || entrega) && (
                  <button className="btn mini" disabled={enviando} onClick={() => guardar(p => {
                    const e = { ...p.entregados };
                    if (entrega) delete e[String(h.meses)]; else e[String(h.meses)] = { fecha: new Date().toISOString(), porNombre: perfil.nombre };
                    return { ...p, entregados: e };
                  }, entrega ? 'quitar_entrega' : 'entregar_premio', entrega ? `se quitó la entrega de ${h.premio}` : `${h.premio} entregado`)}>{entrega ? 'Quitar entrega' : 'Marcar entregado'}</button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <h3>Meses del reto</h3>
      <div className="tabla-desplazable">
        <table className="tabla">
          <thead><tr><th>Mes</th><th className="num">Mes del reto</th><th className="num">Compras del mes</th><th className="num">Acumulado</th><th className="num">Pide</th><th></th></tr></thead>
          <tbody>
            {meses.map(mk => {
              const m = plan.meses[mk];
              const c = calc.get(mk);
              return (
                <tr key={mk} className={c && !c.cumplido && !c.enCurso ? 'fila-sin-coincidir' : ''}>
                  <td>{etiquetaMes(mk)}{mk === hoy && <span className="muted small"> (en curso)</span>}{m?.origen === 'excel-hueco' && <div className="muted small">La hoja se brincaba este mes</div>}</td>
                  <td className="num">{m?.libre ? <span className="chip">Libre</span> : c?.numero ?? '—'}</td>
                  <td className="num">
                    {editando === mk ? (
                      <span className="en-linea">
                        <input type="number" min="0" className="input-puntos" value={monto} onChange={e => setMonto(e.target.value)} autoFocus />
                        <button className="btn mini primario" disabled={enviando} onClick={() => { const v = Number(monto) || 0; setEditando(null); guardar(p => aplicarMonto(p, mk, v, 'a mano'), 'editar_mes', `${etiquetaMes(mk)}: ${dinero(v)}`); }}>Guardar</button>
                      </span>
                    ) : (
                      <button className="btn-texto" onClick={() => { setEditando(mk); setMonto(String(m?.monto ?? 0)); }}>{dinero(m?.monto ?? 0)} ✎</button>
                    )}
                  </td>
                  <td className="num">{c ? dinero(c.acumulado) : '—'}</td>
                  <td className="num">{c && !m?.libre ? dinero(c.requerido) : '—'}</td>
                  <td>
                    <button className="btn mini" disabled={enviando} onClick={() => guardar(p => ({ ...p, meses: { ...p.meses, [mk]: { ...(p.meses[mk] ?? { monto: 0 }), libre: !p.meses[mk]?.libre, origen: p.meses[mk]?.origen === 'excel-hueco' ? 'a mano' : p.meses[mk]?.origen } } }), 'mes_libre', `${etiquetaMes(mk)} ${m?.libre ? 'ya no es libre' : 'marcado como libre'}`)}>{m?.libre ? 'Quitar libre' : 'Mes libre'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {plan.anteriores && plan.anteriores.length > 0 && <p className="muted small">Retos anteriores: {plan.anteriores.map(a => `${etiquetaMes(a.inicio)}–${etiquetaMes(a.fin)} (${dinero(a.acumulado)}, ${a.compras} compras)`).join(' · ')}</p>}
      <div className="acciones">
        {r.estado === 'caida' && <button className="btn" onClick={() => setReiniciar(true)}>Empezar un reto nuevo</button>}
      </div>
      {reiniciar && (
        <MarcoModal titulo="Empezar un reto nuevo" onCerrar={() => setReiniciar(false)} enviando={enviando}>
          <p>{plan.personaNombre} perdió su reto en {etiquetaMes(r.caidaEn!)} con {dinero(r.acumulado)} ({r.compras} compras). Su reto nuevo empieza en {etiquetaMes(hoy)} desde $0; el anterior queda en su historial.</p>
          <div className="acciones">
            <button className="btn primario" disabled={enviando} onClick={() => { setReiniciar(false); guardar(p => ({ ...planNuevo(p.personaId, p.personaNombre, hoy), anteriores: [...(p.anteriores ?? []), { inicio: p.inicio, fin: r.caidaEn!, acumulado: r.acumulado, compras: r.compras }] }), 'reiniciar_reto', `reto nuevo desde ${etiquetaMes(hoy)}`); }}>Sí, empezar de nuevo</button>
          </div>
        </MarcoModal>
      )}
    </MarcoModal>
  );
}

function Resumen({ r }: { r: ResultadoPlan }) {
  const dato = (t: string, v: ReactNode) => <div className="arbol-dato"><span className="muted small">{t}</span><strong>{v}</strong></div>;
  return (
    <div className="arbol-datos">
      {dato('Acumulado', dinero(r.acumulado))}
      {dato('Compras', r.compras)}
      {dato('Mes del reto', r.mesDelReto)}
      {dato('Este mes lleva', dinero(r.montoMesActual))}
      {dato('Le falta este mes', r.estado === 'caida' ? '—' : dinero(r.faltaMes))}
      {dato('Siguiente premio', r.siguiente ? `${r.siguiente.premio} · faltan ${dinero(r.faltaSiguiente)}` : 'Completó el reto')}
    </div>
  );
}

// ------------------------------------------------------------ buscar persona (escribiendo)

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Buscador de e/l: se escribe parte del nombre o del usuario y se elige de la lista (flechas + Enter). */
function BuscarPersona({ personas, valor, onCambiar, ocupadas }: { personas: PersonaAdmin[]; valor: string; onCambiar: (id: string) => void; ocupadas?: Set<string> }) {
  const activas = useMemo(() => personas.filter(p => p.estado !== 'baja').sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b))), [personas]);
  const elegida = activas.find(p => p.id === valor);
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [i, setI] = useState(0);
  const q = sinAcentos(texto.trim());
  const opciones = (q ? activas.filter(p => sinAcentos(`${nombreCompletoPersona(p)} ${p.usuario}`).includes(q)) : activas).slice(0, 8);
  const elegir = (id: string) => { onCambiar(id); setTexto(''); setAbierto(false); };
  if (elegida && !abierto) {
    return (
      <div className="buscar-persona elegida">
        <span className="bp-avatar" aria-hidden="true">{nombreCompletoPersona(elegida).split(' ').slice(0, 2).map(w => w[0]).join('')}</span>
        <span className="bp-nombre"><strong>{nombreCompletoPersona(elegida)}</strong><small>{elegida.usuario || 'sin usuario'} · {elegida.tipo === 'lider' ? 'Líder' : 'Emprendedora'}</small></span>
        <button type="button" className="btn mini" onClick={() => { setAbierto(true); setTexto(''); setI(0); }}>Cambiar</button>
        <button type="button" className="btn mini" aria-label="Quitar" onClick={() => onCambiar('')}>×</button>
      </div>
    );
  }
  return (
    <div className="buscar-persona">
      <input
        type="search"
        value={texto}
        autoFocus={abierto}
        placeholder="Escribe el nombre o el usuario…"
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={e => { setTexto(e.target.value); setI(0); setAbierto(true); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, opciones.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (opciones[i]) elegir(opciones[i].id); }
          else if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false); }
        }}
      />
      {abierto && (
        <ul className="bp-sugerencias" role="listbox">
          {opciones.length ? opciones.map((p, j) => (
            <li key={p.id}>
              <button type="button" className={j === i ? 'activa' : ''} onMouseDown={e => e.preventDefault()} onClick={() => elegir(p.id)}>
                <strong>{nombreCompletoPersona(p)}</strong>
                <small>{p.usuario || 'sin usuario'}{ocupadas?.has(p.id) && p.id !== valor ? ' · ya elegida en otro renglón' : ''}</small>
              </button>
            </li>
          )) : <li className="bp-vacio">Nadie coincide con "{texto}".</li>}
        </ul>
      )}
    </div>
  );
}

type Filtro2 = 'todas' | 'pendientes' | 'avisos';

function Filtros({ filtro, setFiltro, busca, setBusca, cuentas }: { filtro: Filtro2; setFiltro: (f: Filtro2) => void; busca: string; setBusca: (t: string) => void; cuentas: { todas: number; pendientes: number; avisos?: number } }) {
  return (
    <div className="importar-filtros">
      <div className="chips-eleccion" role="group" aria-label="Mostrar">
        <button type="button" className={`chip-elegir${filtro === 'todas' ? ' activo' : ''}`} onClick={() => setFiltro('todas')}>Todas ({cuentas.todas})</button>
        <button type="button" className={`chip-elegir${filtro === 'pendientes' ? ' activo' : ''}`} onClick={() => setFiltro('pendientes')}>Por elegir ({cuentas.pendientes})</button>
        {cuentas.avisos !== undefined && <button type="button" className={`chip-elegir${filtro === 'avisos' ? ' activo' : ''}`} onClick={() => setFiltro('avisos')}>Con avisos ({cuentas.avisos})</button>}
      </div>
      <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar en el Excel…" aria-label="Buscar en el Excel" />
    </div>
  );
}

// ------------------------------------------------------------ importar hoja

type FilaVista = FilaImportada & { personaId: string; marcarViaje: boolean };

function Importar({ personas, planes, perfil, onCerrar }: { personas: PersonaAdmin[]; planes: Map<string, PlanConstancia>; perfil: PerfilUsuario; onCerrar: (t?: string) => void }) {
  const arbol = useArbol(dbEquipo);
  const miembros = arbol.estado === 'listo' ? arbol.miembros : [];
  const [filas, setFilas] = useState<FilaVista[] | null>(null);
  const [hoja, setHoja] = useState('');
  const [filtro, setFiltro] = useState<Filtro2>('todas');
  const [busca, setBusca] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const hoy = mesKey(new Date());
  const ultimo = HITOS_CONSTANCIA[HITOS_CONSTANCIA.length - 1].meses;

  async function leer(f: File) {
    setError(null);
    try {
      const libro = await leerLibroXlsx(await f.arrayBuffer());
      const h = libro.find(x => /constan/i.test(x.nombre)) ?? libro[0];
      const r = leerHojaConstancia(h.filas, hoy, perfil.nombre);
      if (typeof r === 'string') return setError(r);
      setHoja(h.nombre);
      setFilas(r.map(x => ({ ...x, personaId: emparejarPersona(x.nombreExcel, x.codigo, personas, miembros), marcarViaje: x.listo })));
    } catch (e) {
      setError((e as Error)?.message || 'No pude leer ese archivo. Verifica que sea un Excel (.xlsx).');
    }
  }
  const cambiar = (i: number, c: Partial<FilaVista>) => setFilas(fs => fs && fs.map((f, j) => (j === i ? { ...f, ...c } : f)));
  const elegidas = filas?.filter(f => f.personaId) ?? [];
  const ocupadas = new Set(elegidas.map(f => f.personaId));
  const repetidas = new Set(elegidas.map(f => f.personaId).filter((id, i, a) => a.indexOf(id) !== i));
  const q = sinAcentos(busca.trim());
  // "Por elegir" fija los renglones pendientes al aplicarse: al elegir a alguien no desaparece de golpe.
  const [fijos, setFijos] = useState<Set<number>>(new Set());
  const ponerFiltro = (fl: Filtro2) => { setFiltro(fl); if (fl === 'pendientes') setFijos(new Set((filas ?? []).map((f, i) => (!f.personaId || repetidas.has(f.personaId) ? i : -1)).filter(i => i >= 0))); };
  const visibles = (filas ?? []).map((f, i) => ({ f, i })).filter(({ f, i }) =>
    (filtro === 'todas' || (filtro === 'pendientes' && fijos.has(i)) || (filtro === 'avisos' && f.avisos.length > 0)) &&
    (!q || sinAcentos(f.nombreExcel).includes(q)));

  return (
    <MarcoModal titulo="Importar hoja del Excel" onCerrar={() => onCerrar()} enviando={enviando} clase="modal-amplio">
      <p className="muted small">Se lee la hoja "PLAN DE CONSTANCIA". Revisa a quién corresponde cada renglón antes de guardar. Lo que ya estuviera guardado de esas personas se reemplaza con lo del Excel; los premios entregados se conservan.</p>
      <label className="archivo-excel">
        <input type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer(f); }} />
        <span className="btn">{filas ? 'Elegir otro archivo' : 'Elegir archivo (.xlsx)'}</span>
        <span className="muted small">{filas ? `Hoja "${hoja}" · ${filas.length} personas` : 'Ningún archivo todavía'}</span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {filas && (
        <>
          <Filtros filtro={filtro} setFiltro={ponerFiltro} busca={busca} setBusca={setBusca}
            cuentas={{ todas: filas.length, pendientes: filas.filter(f => !f.personaId || repetidas.has(f.personaId)).length, avisos: filas.filter(f => f.avisos.length).length }} />
          <ul className="filas-importar">
            {visibles.map(({ f, i }) => {
              const r = calcularPlan({ inicio: f.inicio, meses: f.meses, entregados: f.entregados }, hitos(), hoy);
              const pendiente = !f.personaId || repetidas.has(f.personaId);
              const entregados = hitos().filter(h => f.entregados[String(h.meses)]).map(h => h.premio);
              return (
                <li key={i} className={`fila-importar${pendiente ? ' pendiente' : ''}`}>
                  <div className="fi-excel">
                    <span className="fi-etiqueta">En el Excel</span>
                    <strong>{f.nombreExcel}</strong>
                    {f.avisos.length > 0 && <ul className="fi-avisos">{f.avisos.map((a, j) => <li key={j}>{a}</li>)}</ul>}
                  </div>
                  <div className="fi-persona">
                    <span className="fi-etiqueta">e/l del portal</span>
                    <BuscarPersona personas={personas} valor={f.personaId} ocupadas={ocupadas} onCambiar={id => cambiar(i, { personaId: id })} />
                    {repetidas.has(f.personaId) && <span className="error small">Está elegida en otro renglón.</span>}
                    <label className="fi-inicio"><span>Empezó su reto</span><input type="month" value={f.inicio} max={hoy} onChange={e => e.target.value && cambiar(i, { inicio: e.target.value })} /></label>
                  </div>
                  <div className="fi-cifras">
                    <span className="fi-etiqueta">Cómo va</span>
                    <strong className="fi-monto">{dinero(r.acumulado)}</strong>
                    <span className="muted small">{r.compras} compras · mes {r.mesDelReto}</span>
                    {r.estado === 'caida'
                      ? <span className="chip agotado" title={r.motivoCaida ?? ''}>Perdió el reto ({etiquetaMes(r.caidaEn!)})</span>
                      : <span className="chip ok">{r.completado ? 'Completó el reto' : 'En su reto'}</span>}
                    {entregados.length > 0 && <span className="muted small">Entregados: {entregados.join(', ')}</span>}
                    {f.listo && <label className="check small"><input type="checkbox" checked={f.marcarViaje} onChange={e => cambiar(i, { marcarViaje: e.target.checked })} /> LISTO: marcar el último premio como entregado</label>}
                  </div>
                </li>
              );
            })}
            {!visibles.length && <li className="muted fi-vacio">Nada que mostrar con este filtro.</li>}
          </ul>
          <div className="pie-fijo">
            <span className="muted small">{elegidas.length} de {filas.length} con su e/l elegida{repetidas.size ? ' · hay e/l repetidas' : ''}</span>
            <button className="btn primario" disabled={enviando || !elegidas.length || repetidas.size > 0} onClick={() => void enviar(async () => {
              const ahora = new Date().toISOString();
              const nuevos = elegidas.map(f => {
                const persona = personas.find(p => p.id === f.personaId)!;
                const antes = planes.get(f.personaId);
                const entregados = { ...(antes?.entregados ?? {}), ...f.entregados };
                if (f.marcarViaje && !entregados[String(ultimo)]) entregados[String(ultimo)] = { fecha: ahora, porNombre: perfil.nombre, nota: 'LISTO en el Excel' };
                // Lo cargado después en BRILLO (meses que el Excel no trae) se conserva.
                const cargados = Object.fromEntries(Object.entries(antes?.meses ?? {}).filter(([mk, m]) => !f.meses[mk] && m.origen !== 'excel' && m.origen !== 'excel-hueco'));
                return { ...(antes ?? {}), personaId: f.personaId, personaNombre: nombreCompletoPersona(persona), inicio: f.inicio, meses: { ...cargados, ...f.meses }, entregados } as PlanConstancia;
              });
              const err = await guardarPlanes(db, nuevos, perfil, equipoActual(), { accion: 'importar_excel', descripcion: `Plan de constancia: se importaron ${nuevos.length} personas desde el Excel` });
              if (!err) onCerrar(`Se importó el plan de constancia de ${nuevos.length} personas.`);
              return err;
            })}>{enviando ? 'Guardando…' : `Guardar ${elegidas.length} personas`}</button>
          </div>
        </>
      )}
    </MarcoModal>
  );
}

// ------------------------------------------------------------ cargar compras del mes

interface FilaCarga { nombreExcel: string; personaId: string; monto: number }

function Cargar({ personas, planes, perfil, onCerrar }: { personas: PersonaAdmin[]; planes: Map<string, PlanConstancia>; perfil: PerfilUsuario; onCerrar: (t?: string) => void }) {
  const arbol = useArbol(dbEquipo);
  const miembros = arbol.estado === 'listo' ? arbol.miembros : [];
  const hoy = mesKey(new Date());
  const [mk, setMk] = useState(hoy);
  const [corte, setCorte] = useState(new Date().getDate() <= 15 ? 'corte del 14' : 'cierre de mes');
  const [filas, setFilas] = useState<FilaCarga[] | null>(null);
  const [nuevasReto, setNuevasReto] = useState(true);
  const [filtro, setFiltro] = useState<Filtro2>('todas');
  const [busca, setBusca] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();

  async function leer(f: File) {
    setError(null);
    try {
      const objs = await leerObjetosXlsx(await f.arrayBuffer());
      if (!objs.length) return setError('El archivo no tiene filas con datos.');
      const { nombre, monto } = columnasCarga(objs[0]);
      if (!nombre || !monto) return setError('Necesito una columna con el nombre (Nombre / Cliente) y otra con el monto (Monto / Total / Compras).');
      setFilas(objs.map(o => ({ nombreExcel: String(o[nombre] ?? '').trim(), monto: Number(o[monto]) || 0 })).filter(x => x.nombreExcel)
        .map(x => ({ ...x, personaId: emparejarPersona(x.nombreExcel, '', personas, miembros) })));
    } catch (e) {
      setError((e as Error)?.message || 'No pude leer ese archivo. Verifica que sea un Excel (.xlsx).');
    }
  }
  const cambiar = (i: number, c: Partial<FilaCarga>) => setFilas(fs => fs && fs.map((f, j) => (j === i ? { ...f, ...c } : f)));
  const elegidas = (filas ?? []).filter(f => f.personaId && (planes.has(f.personaId) || nuevasReto));
  const ocupadas = new Set((filas ?? []).map(f => f.personaId).filter(Boolean));
  const meses = [hoy, sumarMeses(hoy, -1)];
  const q = sinAcentos(busca.trim());
  const [fijos, setFijos] = useState<Set<number>>(new Set());
  const ponerFiltro = (fl: Filtro2) => { setFiltro(fl); if (fl === 'pendientes') setFijos(new Set((filas ?? []).map((f, i) => (!f.personaId ? i : -1)).filter(i => i >= 0))); };
  const visibles = (filas ?? []).map((f, i) => ({ f, i })).filter(({ f, i }) => (filtro !== 'pendientes' || fijos.has(i)) && (!q || sinAcentos(f.nombreExcel).includes(q)));

  return (
    <MarcoModal titulo="Cargar compras del mes" onCerrar={() => onCerrar()} enviando={enviando} clase="modal-amplio">
      <p className="muted small">Al corte del día 14 y al cierre de cada mes, sube un Excel con el nombre y lo que va comprado en el mes por cada e/l (solo compras normales, sin souvenirs ni cambios físicos). Cada carga reemplaza la anterior de ese mes.</p>
      <div className="opciones-puntos">
        <label className="campo"><span>Mes</span><select value={mk} onChange={e => setMk(e.target.value)}>{meses.map(m => <option key={m} value={m}>{etiquetaMes(m)}</option>)}</select></label>
        <label className="campo"><span>Carga</span><select value={corte} onChange={e => setCorte(e.target.value)}><option value="corte del 14">Corte del día 14</option><option value="cierre de mes">Cierre de mes</option></select></label>
      </div>
      <label className="archivo-excel">
        <input type="file" accept=".xlsx" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer(f); }} />
        <span className="btn">{filas ? 'Elegir otro archivo' : 'Elegir archivo (.xlsx)'}</span>
        <span className="muted small">{filas ? `${filas.length} renglones` : 'Columnas: Nombre y Monto'}</span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {filas && (
        <>
          <label className="check"><input type="checkbox" checked={nuevasReto} onChange={e => setNuevasReto(e.target.checked)} /> A quien todavía no tiene plan, empezarle su reto en {etiquetaMes(mk)}</label>
          <Filtros filtro={filtro} setFiltro={ponerFiltro} busca={busca} setBusca={setBusca} cuentas={{ todas: filas.length, pendientes: filas.filter(f => !f.personaId).length }} />
          <ul className="filas-importar">
            {visibles.map(({ f, i }) => {
              const plan = f.personaId ? planes.get(f.personaId) : undefined;
              const base = plan ?? (f.personaId ? planNuevo(f.personaId, '', mk) : null);
              const r = base ? calcularPlan(aplicarMonto(base, mk, f.monto, corte), hitos(), hoy) : null;
              return (
                <li key={i} className={`fila-importar${f.personaId ? '' : ' pendiente'}`}>
                  <div className="fi-excel"><span className="fi-etiqueta">En el Excel</span><strong>{f.nombreExcel}</strong></div>
                  <div className="fi-persona">
                    <span className="fi-etiqueta">e/l del portal</span>
                    <BuscarPersona personas={personas} valor={f.personaId} ocupadas={ocupadas} onCambiar={id => cambiar(i, { personaId: id })} />
                    {f.personaId && !plan && <span className="muted small">{nuevasReto ? `Empieza su reto en ${etiquetaMes(mk)}` : 'No tiene plan: no se carga'}</span>}
                  </div>
                  <div className="fi-cifras">
                    <label className="fi-inicio"><span>Lo que va del mes</span><input type="number" min="0" value={f.monto} onChange={e => cambiar(i, { monto: Number(e.target.value) || 0 })} /></label>
                    {r && <><span className="muted small">Queda en {dinero(r.acumulado)} · {r.compras} compras</span>{r.faltaMes > 0 && mk === hoy && <span className="error small">Le faltan {dinero(r.faltaMes)} este mes</span>}</>}
                  </div>
                </li>
              );
            })}
            {!visibles.length && <li className="muted fi-vacio">Nada que mostrar con este filtro.</li>}
          </ul>
          <div className="pie-fijo">
            <span className="muted small">{elegidas.length} de {filas.length} se van a cargar</span>
            <button className="btn primario" disabled={enviando || !elegidas.length} onClick={() => void enviar(async () => {
              const nuevos = elegidas.map(f => {
                const persona = personas.find(p => p.id === f.personaId)!;
                const base = planes.get(f.personaId) ?? planNuevo(f.personaId, nombreCompletoPersona(persona), mk);
                return { ...aplicarMonto(base, mk, f.monto, corte), personaNombre: nombreCompletoPersona(persona) };
              });
              const err = await guardarPlanes(db, nuevos, perfil, equipoActual(), { accion: 'cargar_compras', descripcion: `Plan de constancia: ${corte} de ${etiquetaMes(mk)} para ${nuevos.length} personas` });
              if (!err) onCerrar(`Se cargó el ${corte} de ${etiquetaMes(mk)} para ${nuevos.length} personas.`);
              return err;
            })}>{enviando ? 'Guardando…' : `Guardar ${elegidas.length}`}</button>
          </div>
        </>
      )}
    </MarcoModal>
  );
}
