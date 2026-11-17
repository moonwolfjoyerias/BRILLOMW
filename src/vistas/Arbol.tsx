// Árbol de equipo (solo Administración): el mismo árbol de mi-equipo, con sus
// puntos, rangos y comisiones. Lee y guarda en la base de mi-equipo, así que
// lo que se cambie aquí lo ven al instante en mi-equipo y viceversa.
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, dbEquipo } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { cambiarArbol, useArbol } from '../arbol/acciones';
import { excelComisiones, excelEquipo, excelHistorialComisiones, excelHistorialRangos, excelPagoComisiones, excelRifa } from '../arbol/excel';
import {
  comisionesDelMes,
  datosRifa,
  etiquetaMes,
  fechaSorteoRifa,
  fijarPagado,
  fijarRangoManual,
  fijarRastreo,
  historialComisiones,
  historialRangos,
  lideres,
  mapaHijos,
  mesesConPuntos,
  normalizarNombre,
  puntosPeriodo,
  RANGOS,
  redondear2,
  subarbol,
  type Miembro,
  type RangoKey
} from '../arbol/modelo';
import { AuditoriaRango, ComisionesLider, mxn, pts, ResumenLineas } from './ArbolDetalle';
import { EditarArbol, ElegirPersona, type Guardar } from './ArbolEditar';

type Pestana = 'arbol' | 'comisiones' | 'reportes' | 'editar';
type Ventana = { tipo: 'auditoria' | 'lineas' | 'comisiones'; id: string } | null;

const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin registros todavía');

export function Arbol({ perfil }: { perfil: PerfilUsuario }) {
  const arbol = useArbol(dbEquipo);
  const [pestana, setPestana] = useState<Pestana>('arbol');
  const [mk, setMk] = useState<string>('');
  const [ventana, setVentana] = useState<Ventana>(null);
  const miembros = arbol.estado === 'listo' ? arbol.miembros : null;
  const meses = useMemo(() => (miembros ? mesesConPuntos(miembros) : []), [miembros]);
  useEffect(() => { if (meses.length && !meses.includes(mk)) setMk(meses[0]); }, [meses, mk]);

  if (perfil.rol !== 'admin') return <p className="muted">Solo Administración maneja el Árbol.</p>;
  if (arbol.estado === 'error') return <p className="error" role="alert">{arbol.mensaje}</p>;
  if (arbol.estado !== 'listo' || !miembros || !mk) return <p className="muted">Cargando el árbol…</p>;

  const guardar: Guardar = (cambiar, tipo, accion, descripcion) => cambiarArbol(dbEquipo, db, cambiar, tipo, perfil, equipoActual(), { accion, descripcion });

  return (
    <section className="arbol">
      <div className="encabezado-seccion">
        <h1>Árbol</h1>
        <p className="muted">El árbol de mi-equipo: puntos, rangos y comisiones. Lo que cambies aquí se ve también en mi-equipo.</p>
      </div>
      <div className="filtros-estadisticas">
        <label className="campo"><span>Mes</span>
          <select value={mk} onChange={e => setMk(e.target.value)}>{meses.map(m => <option key={m} value={m}>{etiquetaMes(m)}</option>)}</select>
        </label>
        <div className="muted small arbol-meta">
          <span>{miembros.length} personas</span>
          <span>Árbol actualizado: {fechaHora(arbol.meta.lastTreeUpdate)}</span>
          <span>Puntos actualizados: {fechaHora(arbol.meta.lastPointsUpdate)}</span>
        </div>
      </div>
      <nav className="pestanas" aria-label="Secciones del árbol">
        {([['arbol', 'Árbol completo'], ['comisiones', 'Comisiones por líder'], ['reportes', 'Reportes e historiales'], ['editar', 'Editar árbol']] as [Pestana, string][]).map(([k, t]) => (
          <button key={k} className={pestana === k ? 'nav-boton activo' : 'nav-boton'} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </nav>
      {pestana === 'arbol' && <VistaArbol miembros={miembros} mk={mk} abrir={setVentana} />}
      {pestana === 'comisiones' && <Comisiones miembros={miembros} mk={mk} guardar={guardar} abrir={setVentana} />}
      {pestana === 'reportes' && <Reportes miembros={miembros} mk={mk} />}
      {pestana === 'editar' && <EditarArbol miembros={miembros} mk={mk} guardar={guardar} />}

      {ventana?.tipo === 'auditoria' && <AuditoriaRango miembros={miembros} id={ventana.id} mk={mk} onCerrar={() => setVentana(null)} />}
      {ventana?.tipo === 'lineas' && <ResumenLineas miembros={miembros} id={ventana.id} mk={mk} onCerrar={() => setVentana(null)} />}
      {ventana?.tipo === 'comisiones' && <ComisionesLider miembros={miembros} id={ventana.id} mk={mk} onCerrar={() => setVentana(null)} />}
    </section>
  );
}

// ------------------------------------------------------------ Árbol completo

function VistaArbol({ miembros, mk, abrir }: { miembros: Miembro[]; mk: string; abrir: (v: Ventana) => void }) {
  const hijos = useMemo(() => mapaHijos(miembros), [miembros]);
  const porId = useMemo(() => new Map(miembros.map(m => [m.id, m])), [miembros]);
  const [desde, setDesde] = useState('');
  const [zoom, setZoom] = useState(1);
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const [elegido, setElegido] = useState('');
  const [busca, setBusca] = useState('');
  const [iCoincidencia, setICoincidencia] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const raices = useMemo(() => {
    if (desde && porId.has(desde)) return [porId.get(desde)!];
    return miembros.filter(m => !m.leaderId || !porId.has(m.leaderId)).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [miembros, porId, desde]);
  const visibles = useMemo(() => {
    const s = new Set<string>();
    for (const r of raices) subarbol(miembros, r.id).forEach(id => s.add(id));
    return s;
  }, [miembros, raices]);
  const q = normalizarNombre(busca);
  const coincidencias = useMemo(() => (q ? miembros.filter(m => visibles.has(m.id) && (normalizarNombre(m.fullName).includes(q) || String(m.clientCode ?? '').toLowerCase().includes(q))) : []), [miembros, visibles, q]);

  // Abre el camino hasta la persona y la muestra.
  function irA(id: string) {
    const camino = new Set(abiertos);
    for (let p = porId.get(id); p?.leaderId && porId.has(p.leaderId); p = porId.get(p.leaderId)) camino.add(p.leaderId);
    setAbiertos(camino);
    setElegido(id);
    setTimeout(() => contenedor.current?.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }
  useEffect(() => { setICoincidencia(0); if (coincidencias[0]) irA(coincidencias[0].id); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const idsCoincidencias = useMemo(() => new Set(coincidencias.map(c => c.id)), [coincidencias]);
  const elegidoM = porId.get(elegido);
  const alternar = (id: string) => setAbiertos(a => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const nodo = (m: Miembro, nivel: number): React.ReactElement => {
    const hs = (hijos.get(m.id) ?? []).slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
    const abierto = abiertos.has(m.id) || nivel < 1;
    const p = puntosPeriodo(m, mk);
    const coincide = idsCoincidencias.has(m.id);
    return (
      <li key={m.id}>
        <div className={`nodo-arbol${elegido === m.id ? ' elegido' : ''}${coincide ? ' coincide' : ''}`} data-id={m.id}>
          {hs.length ? <button className="btn mini abrir-nodo" aria-label={abierto ? 'Cerrar equipo' : 'Abrir equipo'} onClick={() => alternar(m.id)}>{abierto ? '−' : '+'}</button> : <span className="abrir-nodo" />}
          <button className="nombre-nodo" onClick={() => setElegido(m.id)}>
            <strong>{m.fullName}</strong>
            <span className="muted small">{m.clientCode || 'sin membresía'} · P1 {pts(p.p1)} · P2 {pts(p.p2)}{hs.length ? ` · ${hs.length} directa(s)` : ''}</span>
          </button>
        </div>
        {abierto && hs.length > 0 && <ul>{hs.map(h => nodo(h, nivel + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="vista-arbol">
      <div className="filtros-estadisticas no-fija">
        <label className="campo"><span>Buscar persona</span><input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nombre o membresía" /></label>
        {q && (
          <div className="campo"><span>{coincidencias.length ? `${iCoincidencia + 1} de ${coincidencias.length}` : 'Sin coincidencias'}</span>
            <div className="en-linea">
              <button className="btn mini" disabled={!coincidencias.length} onClick={() => { const i = (iCoincidencia - 1 + coincidencias.length) % coincidencias.length; setICoincidencia(i); irA(coincidencias[i].id); }}>‹ Anterior</button>
              <button className="btn mini" disabled={!coincidencias.length} onClick={() => { const i = (iCoincidencia + 1) % coincidencias.length; setICoincidencia(i); irA(coincidencias[i].id); }}>Siguiente ›</button>
            </div>
          </div>
        )}
        <ElegirPersona miembros={miembros} valor={desde} onElegir={setDesde} etiqueta="Ver desde" placeholder="Todo el árbol" />
        <div className="campo"><span>Zoom</span>
          <div className="en-linea">
            <button className="btn mini" onClick={() => setZoom(z => Math.max(0.6, z - 0.1))} aria-label="Alejar">−</button>
            <button className="btn mini" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button className="btn mini" onClick={() => setZoom(z => Math.min(1.4, z + 0.1))} aria-label="Acercar">+</button>
          </div>
        </div>
        <div className="campo"><span>&nbsp;</span>
          <div className="en-linea">
            <button className="btn mini" onClick={() => setAbiertos(new Set(miembros.filter(m => hijos.has(m.id)).map(m => m.id)))}>Abrir todo</button>
            <button className="btn mini" onClick={() => setAbiertos(new Set())}>Cerrar todo</button>
          </div>
        </div>
      </div>
      {elegidoM && <FichaPersona miembros={miembros} m={elegidoM} mk={mk} abrir={abrir} verDesde={() => { setDesde(elegidoM.id); setAbiertos(a => new Set([...a, elegidoM.id])); }} />}
      {!miembros.length ? (
        <p className="muted">El árbol está vacío. Registra personas o importa el Excel en "Editar árbol".</p>
      ) : (
        <div className="arbol-lienzo" ref={contenedor} style={{ fontSize: `${zoom}rem` }}>
          <ul className="arbol-raiz">{raices.map(r => nodo(r, 0))}</ul>
        </div>
      )}
    </div>
  );
}

function FichaPersona({ miembros, m, mk, abrir, verDesde }: { miembros: Miembro[]; m: Miembro; mk: string; abrir: (v: Ventana) => void; verDesde: () => void }) {
  const lider = m.leaderId ? miembros.find(x => x.id === m.leaderId) : undefined;
  const p = puntosPeriodo(m, mk);
  const equipo = subarbol(miembros, m.id).size - 1;
  const c = comisionesDelMes(miembros, m.id, mk);
  return (
    <div className="ficha-arbol">
      <div>
        <strong>{m.fullName}</strong>
        <div className="muted small">
          {m.clientCode || 'Sin membresía'} · Ticket {m.ticketNumber || '—'} · Líder: {lider?.fullName ?? 'ninguno'}
          {m.joinedAt && ` · Se integró ${m.joinedAt}`}
        </div>
        <div className="small">P1 <b>{pts(p.p1)}</b> · P2 <b>{pts(p.p2)}</b> · Total <b>{pts(p.p1 + p.p2)}</b> · Equipo: <b>{equipo}</b>{c && equipo > 0 ? <> · Rango vigente: <b>{c.rangoInfo.rango.label}</b> · Comisión: <b>{mxn(c.total)}</b></> : null}</div>
      </div>
      <div className="acciones izquierda">
        <button className="btn mini" onClick={() => abrir({ tipo: 'lineas', id: m.id })}>Resumen por línea</button>
        <button className="btn mini" onClick={() => abrir({ tipo: 'auditoria', id: m.id })}>Auditoría de rango</button>
        {equipo > 0 && <button className="btn mini" onClick={() => abrir({ tipo: 'comisiones', id: m.id })}>Comisiones</button>}
        {equipo > 0 && <button className="btn mini" onClick={() => excelEquipo(miembros, m.id, mk)}>Excel del equipo</button>}
        {equipo > 0 && <button className="btn mini" onClick={verDesde}>Ver desde aquí</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Comisiones por líder

function Comisiones({ miembros, mk, guardar, abrir }: { miembros: Miembro[]; mk: string; guardar: Guardar; abrir: (v: Ventana) => void }) {
  const [busca, setBusca] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const filas = useMemo(() => lideres(miembros).map(m => ({ m, c: comisionesDelMes(miembros, m.id, mk)! })), [miembros, mk]);
  const q = normalizarNombre(busca);
  const vistas = q ? filas.filter(f => normalizarNombre(f.m.fullName).includes(q)) : filas;
  const total = filas.reduce((s, f) => s + redondear2(f.c.total), 0);
  const pagado = filas.filter(f => f.m.commissionPaid?.[mk]).reduce((s, f) => s + redondear2(f.c.total), 0);

  async function cambiar(m: Miembro, que: string, f: (l: Miembro[]) => string | null, desc: string) {
    setError(null);
    setGuardando(m.id + que);
    const err = await guardar(f, 'pagos', que, desc);
    setGuardando(null);
    if (err) setError(err);
  }

  return (
    <div>
      <div className="filtros-estadisticas no-fija">
        <label className="campo"><span>Buscar líder</span><input type="search" value={busca} onChange={e => setBusca(e.target.value)} /></label>
        <div className="muted small arbol-meta">
          <span>{filas.length} líderes</span>
          <span>Total neto: <b>{mxn(total)}</b></span>
          <span>Pagado: <b>{mxn(pagado)}</b> · Pendiente: <b>{mxn(total - pagado)}</b></span>
        </div>
        <button className="btn" onClick={() => setError(excelPagoComisiones(miembros, mk))}>Descargar pago de comisiones</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="muted small">Comisiones de {etiquetaMes(mk)} con el rango logrado en el mes anterior (o el capturado a mano). Montos netos, sin IVA.</p>
      <div className="tabla-desplazable">
        <table className="tabla tabla-comisiones-arbol">
          <thead><tr><th>Líder</th><th>Rango vigente</th><th>Rango manual</th><th className="num">Neto P1</th><th className="num">Neto P2</th><th className="num">Total</th><th>Pagado</th><th>Clave de rastreo</th><th></th></tr></thead>
          <tbody>
            {vistas.map(({ m, c }) => (
              <tr key={m.id}>
                <td><strong>{m.fullName}</strong><div className="muted small">{c.equipo.length} en su equipo</div></td>
                <td>{c.rangoInfo.rango.label}{c.esManual && <span className="muted small"> (manual)</span>}</td>
                <td>
                  <select value={m.manualRank?.[mk] ?? ''} disabled={guardando === m.id + 'rango_manual'} onChange={e => {
                    const k = e.target.value as RangoKey | '';
                    void cambiar(m, 'rango_manual', l => fijarRangoManual(l, m.id, mk, k), `Árbol: rango manual de ${m.fullName} en ${etiquetaMes(mk)}: ${k ? RANGOS.find(r => r.key === k)?.label : 'calculado'}`);
                  }}>
                    <option value="">Calculado</option>
                    {RANGOS.slice().reverse().map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </td>
                <td className="num">{mxn(c.periodo1.totalComision)}{c.periodo1.gated && <div className="error small">sin compra mínima</div>}</td>
                <td className="num">{mxn(c.periodo2.totalComision)}{c.periodo2.gated && <div className="error small">sin compra mínima</div>}</td>
                <td className="num"><strong>{mxn(c.total)}</strong></td>
                <td>
                  <label className="check"><input type="checkbox" checked={!!m.commissionPaid?.[mk]} disabled={guardando === m.id + 'pagado'} onChange={e => {
                    const v = e.target.checked;
                    void cambiar(m, 'pagado', l => fijarPagado(l, m.id, mk, v), `Árbol: comisión de ${m.fullName} (${etiquetaMes(mk)}) marcada como ${v ? 'pagada' : 'pendiente'}`);
                  }} /> {m.commissionPaid?.[mk] ? 'Pagado' : 'Pendiente'}</label>
                </td>
                <td>
                  <input className="input-rastreo" defaultValue={m.commissionTracking?.[mk] ?? ''} key={`${m.id}-${mk}-${m.commissionTracking?.[mk] ?? ''}`} placeholder="SPEI…" onBlur={e => {
                    const v = e.target.value.trim();
                    if (v === (m.commissionTracking?.[mk] ?? '')) return;
                    void cambiar(m, 'rastreo', l => fijarRastreo(l, m.id, mk, v), `Árbol: clave de rastreo de ${m.fullName} (${etiquetaMes(mk)}): ${v || 'borrada'}`);
                  }} />
                </td>
                <td>
                  <div className="acciones izquierda sin-margen">
                    <button className="btn mini" onClick={() => abrir({ tipo: 'comisiones', id: m.id })}>Ver</button>
                    <button className="btn mini" onClick={() => abrir({ tipo: 'auditoria', id: m.id })}>Auditoría</button>
                    <button className="btn mini" onClick={() => excelComisiones(miembros, m.id, mk)}>Excel</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!vistas.length && <p className="muted">{filas.length ? 'Ninguna líder coincide con la búsqueda.' : 'Todavía no hay ningún líder con equipo propio.'}</p>}
    </div>
  );
}

// ------------------------------------------------------------ Reportes e historiales

function Reportes({ miembros, mk }: { miembros: Miembro[]; mk: string }) {
  const [error, setError] = useState<string | null>(null);
  const rangos = useMemo(() => historialRangos(miembros, 6), [miembros]);
  const comisiones = useMemo(() => historialComisiones(miembros, 6), [miembros]);
  const rifa = useMemo(() => datosRifa(miembros, mk), [miembros, mk]);
  return (
    <div className="arbol-reportes">
      {error && <p className="error" role="alert">{error}</p>}
      <details className="tarjeta-caja" open>
        <summary><h3>Historial de rangos (6 meses)</h3></summary>
        <div className="tabla-desplazable">
          <table className="tabla">
            <thead><tr><th>Líder</th>{rangos.meses.map(m => <th key={m}>{etiquetaMes(m)}</th>)}</tr></thead>
            <tbody>{rangos.filas.map(f => <tr key={f.miembro.id}><td>{f.miembro.fullName}</td>{f.rangos.map((r, i) => <td key={i} className={`rango-${r.key}`}>{r.label}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <div className="acciones"><button className="btn" onClick={() => setError(excelHistorialRangos(miembros))}>Descargar Excel</button></div>
      </details>
      <details className="tarjeta-caja">
        <summary><h3>Historial de comisiones (6 meses)</h3></summary>
        <div className="tabla-desplazable">
          <table className="tabla">
            <thead><tr><th>Líder</th>{comisiones.meses.map(m => <th key={m} className="num">{etiquetaMes(m)}</th>)}<th className="num">Acumulado</th></tr></thead>
            <tbody>{comisiones.filas.map(f => <tr key={f.miembro.id}><td>{f.miembro.fullName}</td>{f.montos.map((x, i) => <td key={i} className="num">{mxn(x)}</td>)}<td className="num"><strong>{mxn(f.acumulado)}</strong></td></tr>)}</tbody>
          </table>
        </div>
        <div className="acciones"><button className="btn" onClick={() => setError(excelHistorialComisiones(miembros))}>Descargar Excel</button></div>
      </details>
      <details className="tarjeta-caja">
        <summary><h3>Rifa por puntos — compras de {etiquetaMes(mk)}</h3></summary>
        <p className="muted small">Un boleto al llegar a 3,000 puntos en el mes y uno más por cada 1,000 extra. Rifa del {fechaSorteoRifa(mk)}.</p>
        {rifa.filas.length ? (
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead><tr><th>Nombre</th><th className="num">Puntos del mes</th><th className="num">Boletos</th><th className="num">Números</th></tr></thead>
              <tbody>{rifa.filas.map(f => <tr key={f.miembro.id}><td>{f.miembro.fullName}</td><td className="num">{pts(f.total)}</td><td className="num">{f.boletos}</td><td className="num">{f.desde === f.hasta ? f.desde : `${f.desde}–${f.hasta}`}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">Nadie alcanzó los 3,000 puntos ese mes.</p>
        )}
        <p className="small">Total de boletos: <b>{rifa.totalBoletos}</b></p>
        <div className="acciones"><button className="btn" disabled={!rifa.filas.length} onClick={() => setError(excelRifa(miembros, mk))}>Descargar Excel</button></div>
      </details>
    </div>
  );
}
