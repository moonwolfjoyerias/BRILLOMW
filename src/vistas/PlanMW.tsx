// Plan MW para Administración: lo mismo que admin-plan-mw.html de la página
// (Seguimiento e Historial de rangos), con los mismos cálculos.
// - Próximos a lograr: Líderes cerca del siguiente rango y personas cerca de
//   un premio del Reto de Constancia; "Confirmar ahora" cuando ya cumplen.
// - Logros del mes: ascensos y recompensas ya confirmados.
// - Historial de rangos: el rango aplicado a cada líder en los últimos 6 meses.
import { useMemo, useState } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { MarcoModal, useEnvio } from './Modal';
import { useApartados } from '../apartados/acciones';
import { usePersonasAdmin } from '../personas/acciones';
import { nombreCompletoPersona, RANGOS_MW, rangoLabel, type Financiero, type PersonaAdmin } from '../personas/modelo';
import { useAronium, useComisiones } from '../comisiones/acciones';
import { csv, rangoAplicado, ultimosMeses } from '../comisiones/modelo';
import { confirmarAscenso, confirmarRecompensa } from '../planmw/acciones';
import {
  LibroCompras,
  logros,
  logrosDe,
  mesKeyDe,
  mesLabel,
  proximidadConstancia,
  proximidadRango,
  textoFaltante,
  UMBRAL_PROXIMIDAD_CONSTANCIA_MESES,
  UMBRAL_PROXIMIDAD_RANGO,
  type Contexto,
  type Logro,
  type Requisito
} from '../planmw/modelo';
import { useComprasBrillo } from '../compras/acciones';
import { ComprasBrillo } from '../compras/modelo';

const $ = (n: number) => `$${(Number(n) || 0).toLocaleString('es-MX')}`;
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

interface Proximo {
  persona: PersonaAdmin;
  tipo: 'rango' | 'constancia';
  listo: boolean;
  progresoPct: number;
  titulo: string;
  texto: string;
  siguienteRango?: string;
}

export function PlanMW({ perfil }: { perfil: PerfilUsuario }) {
  const per = usePersonasAdmin(db, true);
  const ap = useApartados(db);
  const aronium = useAronium(db);
  const com = useComisiones(db);
  const [vista, setVista] = useState<'seguimiento' | 'rangos'>('seguimiento');
  const [filtro, setFiltro] = useState<'todos' | 'rango' | 'constancia'>('todos');
  const [mes, setMes] = useState(mesKeyDe());
  const [detalle, setDetalle] = useState<string | null>(null);
  const ventanas = ap.estado === 'listo' ? ap.ventanas : null;
  const comprasBrillo = useComprasBrillo(db);
  const compras = comprasBrillo instanceof ComprasBrillo ? comprasBrillo : null;
  const libro = useMemo(() => (ventanas && aronium && compras ? new LibroCompras(ventanas, aronium, compras) : null), [ventanas, aronium, compras]);
  const personas = per.estado === 'listo' ? per.personas : null;
  const financiero = per.estado === 'listo' ? per.financiero : null;

  const proximos = useMemo<Proximo[]>(() => {
    if (!personas || !financiero || !libro) return [];
    const ctx: Contexto = { personas, libro };
    const lista: Proximo[] = [];
    personas.filter(p => p.estado !== 'baja').forEach(p => {
      if (p.tipo === 'lider') {
        const r = proximidadRango(ctx, p);
        if (r && (r.elegible || r.progresoPct / 100 >= UMBRAL_PROXIMIDAD_RANGO)) {
          lista.push({
            persona: p, tipo: 'rango', listo: r.elegible, progresoPct: r.progresoPct, siguienteRango: r.siguiente.key,
            titulo: r.elegible ? 'Lista para subir de rango' : 'Próximo rango',
            texto: r.elegible ? `Ya cumple todos los requisitos para ${r.siguiente.label}.` : textoFaltante(r.limitante, r.siguiente.label)
          });
        }
      }
      const c = proximidadConstancia(financiero.get(p.id));
      if (c && (c.elegible || c.mesesFaltantes <= UMBRAL_PROXIMIDAD_CONSTANCIA_MESES)) {
        lista.push({
          persona: p, tipo: 'constancia', listo: c.elegible, progresoPct: c.progresoPct,
          titulo: c.elegible ? 'Lista para su recompensa' : 'Próxima recompensa',
          texto: c.elegible
            ? `Ya cumplió ${c.siguienteHito.meses} compras. Premio: ${c.siguienteHito.premio}.`
            : `${c.mesesCumplidos} compras acumuladas. Le falta${c.mesesFaltantes === 1 ? '' : 'n'} ${c.mesesFaltantes} para obtener: ${c.siguienteHito.premio}.`
        });
      }
    });
    return lista.sort((a, b) => (a.listo !== b.listo ? (a.listo ? -1 : 1) : b.progresoPct - a.progresoPct));
  }, [personas, financiero, libro]);

  if (comprasBrillo === 'error' || per.estado === 'error' || ap.estado === 'error' || com.estado === 'error') return <p className="error">No se pudo cargar el Plan MW. Revisa la conexión.</p>;
  if (!personas || !financiero || !libro || com.estado !== 'listo') return <p className="muted">Calculando el Plan MW…</p>;

  const todosLogros = logros(personas);
  const meses = [...new Set([mesKeyDe(), ...todosLogros.map(l => l.logro.fecha.slice(0, 7))])].sort((a, b) => b.localeCompare(a));
  const delMes = todosLogros.filter(l => l.logro.fecha.slice(0, 7) === mes);
  const visibles = proximos.filter(p => filtro === 'todos' || p.tipo === filtro);
  const elegida = detalle ? personas.find(p => p.id === detalle) : undefined;

  return (
    <section className="planmw">
      <div className="encabezado-seccion">
        <h1>Plan MW</h1>
        <p className="muted">Quién está por subir de rango o ganar un premio del Reto de Constancia, y los logros ya confirmados. Mismos cálculos que la página.</p>
      </div>
      <nav className="pestanas" aria-label="Vistas del Plan MW">
        <button className={vista === 'seguimiento' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('seguimiento')}>Seguimiento</button>
        <button className={vista === 'rangos' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('rangos')}>Historial de rangos</button>
      </nav>

      {vista === 'seguimiento' ? (
        <>
          <div className="filtros-deseos">
            <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes de los logros">
              {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
            <nav className="pestanas" aria-label="Filtro">
              {(['todos', 'rango', 'constancia'] as const).map(f => (
                <button key={f} className={filtro === f ? 'nav-boton activo' : 'nav-boton'} onClick={() => setFiltro(f)}>{f === 'todos' ? 'Todo' : f === 'rango' ? 'Rangos' : 'Reto de Constancia'}</button>
              ))}
            </nav>
          </div>
          <div className="resumen-apartados">
            <div className="dato"><span>Logros del mes</span><strong>{delMes.length}</strong></div>
            <div className="dato"><span>Ascensos</span><strong>{delMes.filter(l => l.logro.tipo === 'ascenso_rango').length}</strong></div>
            <div className="dato"><span>Recompensas</span><strong>{delMes.filter(l => l.logro.tipo === 'recompensa_constancia').length}</strong></div>
            <div className="dato"><span>Próximos a lograr</span><strong>{proximos.length}</strong></div>
          </div>

          <h3>Próximos a lograr</h3>
          {!visibles.length ? (
            <p className="muted">Nadie está próximo a lograr algo ahora mismo. Cuando alguien esté cerca de subir de rango o ganar una recompensa, aparecerá aquí.</p>
          ) : (
            <div className="tarjetas-proximos">
              {visibles.map(p => <TarjetaProximo key={`${p.tipo}-${p.persona.id}`} p={p} perfil={perfil} onVer={() => setDetalle(p.persona.id)} />)}
            </div>
          )}

          <h3>Logros de {mesLabel(mes)}</h3>
          {!delMes.length ? (
            <p className="muted">Todavía no hay logros en este mes. Los ascensos y recompensas confirmados aparecen aquí.</p>
          ) : (
            <ul className="historial">
              {delMes.map(({ persona, logro }, i) => (
                <li key={i}>
                  <button className="boton-enlace" onClick={() => setDetalle(persona.id)}><strong>{nombreCompletoPersona(persona)}</strong></button>
                  <span className="muted small bloque">{textoLogro(logro)} · {fecha(logro.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <HistorialRangos personas={personas} rangoManual={com.rangoManual} />
      )}

      {elegida && (
        <DetallePersona p={elegida} ctx={{ personas, libro }} f={financiero.get(elegida.id)} onCerrar={() => setDetalle(null)} />
      )}
    </section>
  );
}

const textoLogro = (l: Logro) => (l.tipo === 'ascenso_rango' ? `Subió a ${rangoLabel(l.rangoNuevo ?? '')}` : `Ganó ${l.premio ?? 'su recompensa'}${l.hito ? ` (${l.hito} compras)` : ''}`);

function TarjetaProximo({ p, perfil, onVer }: { p: Proximo; perfil: PerfilUsuario; onVer: () => void }) {
  const { enviando, error, enviar } = useEnvio();
  const nombre = nombreCompletoPersona(p.persona);
  const confirmar = () => {
    if (p.tipo === 'rango' && p.siguienteRango) {
      if (!window.confirm(`${nombre} cumple los requisitos para subir a ${rangoLabel(p.siguienteRango)}. ¿Confirmas su ascenso? Se le avisará para que prepares sus premios.`)) return;
      void enviar(() => confirmarAscenso(db, p.persona.id, p.siguienteRango!, perfil, equipoActual()));
    } else {
      if (!window.confirm(`¿Confirmas la entrega del premio del Reto de Constancia a ${nombre}?`)) return;
      void enviar(() => confirmarRecompensa(db, p.persona.id, perfil, equipoActual()));
    }
  };
  return (
    <div className={p.listo ? 'tarjeta-caja proximo listo' : 'tarjeta-caja proximo'}>
      <span className={p.listo ? 'chip ok' : 'chip neutro'}>{p.titulo}</span>
      <button className="boton-enlace" onClick={onVer}><strong>{nombre}</strong></button>
      <span className="muted small">{p.persona.tipo === 'lider' ? 'Líder' : 'Emprendedora'} · {p.tipo === 'rango' ? `Rango ${rangoLabel(p.persona.rangoActualKey)}` : 'Reto de Constancia'}</span>
      <div className="barra-progreso"><div style={{ width: `${p.progresoPct}%` }} /></div>
      <p className="small">{p.texto}</p>
      {error && <p className="error small">{error}</p>}
      {p.listo && <button className="btn primario" disabled={enviando} onClick={confirmar}>{enviando ? 'Confirmando…' : 'Confirmar ahora'}</button>}
    </div>
  );
}

function DetallePersona({ p, ctx, f, onCerrar }: { p: PersonaAdmin; ctx: Contexto; f: Financiero | undefined; onCerrar: () => void }) {
  const ascenso = p.tipo === 'lider' ? proximidadRango(ctx, p) : null;
  const constancia = proximidadConstancia(f);
  const suyos = [...logrosDe(p)].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <MarcoModal titulo={nombreCompletoPersona(p)} onCerrar={onCerrar}>
      <p className="muted">{p.tipo === 'lider' ? `Líder · Rango ${rangoLabel(p.rangoActualKey)}` : 'Emprendedora'}</p>
      {ascenso && (
        <>
          <h3>Hacia {ascenso.siguiente.label} ({ascenso.progresoPct}%)</h3>
          <ul className="requisitos">
            {ascenso.items.map((it: Requisito) => (
              <li key={it.label} className={it.cumple ? 'cumple' : 'falta'}><span>{it.cumple ? '✓' : '✗'} {it.label}</span><span className="muted small">{it.valores}</span></li>
            ))}
          </ul>
        </>
      )}
      <h3>Reto de Constancia</h3>
      <dl className="datos">
        <dt>Compras cumplidas</dt><dd>{f?.constancia.mesesCumplidos ?? 0}</dd>
        <dt>Próxima recompensa</dt><dd>{constancia ? `${constancia.siguienteHito.premio} (${constancia.mesesFaltantes === 0 ? 'lista' : `faltan ${constancia.mesesFaltantes}`})` : 'Todos los hitos otorgados'}</dd>
        <dt>Compra del mes en curso</dt><dd>{$(f?.constancia.montoMesActual ?? 0)} de {$(f?.constancia.metaMes ?? 8000)}</dd>
      </dl>
      <h3>Logros obtenidos</h3>
      {!suyos.length ? <p className="muted small">Todavía no tiene logros confirmados.</p> : (
        <ul className="historial">{suyos.map((l, i) => <li key={i}><strong>{textoLogro(l)}</strong><span className="muted small bloque">{fecha(l.fecha)}</span></li>)}</ul>
      )}
    </MarcoModal>
  );
}

function HistorialRangos({ personas, rangoManual }: { personas: PersonaAdmin[]; rangoManual: Record<string, string> }) {
  const meses = ultimosMeses(6).reverse();
  const lideres = personas.filter(p => p.tipo === 'lider' && p.estado !== 'baja').sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));
  const filas = lideres.map(l => ({ l, porMes: meses.map(m => rangoAplicado(l, m, rangoManual).rangoKey) }));
  const orden = (k: string) => RANGOS_MW.findIndex(r => r.key === k);
  const exportar = () => {
    const datos = [['Líder', ...meses.map(mesLabel)], ...filas.map(f => [nombreCompletoPersona(f.l), ...f.porMes.map(rangoLabel)])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv(datos)], { type: 'text/csv;charset=utf-8' }));
    a.download = `historial-rangos-mw-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  if (!filas.length) return <p className="muted">Todavía no hay líderes registradas.</p>;
  return (
    <>
      <p className="muted small">Rango con el que se pagó (o se pagará) cada mes: el del último mes ya cerrado, o el manual de ese mes. ↑ subió, ↓ bajó respecto al mes anterior.</p>
      <div className="acciones izq"><button className="btn" onClick={exportar}>Exportar a Excel</button></div>
      <div className="tabla-desplazable">
        <table className="tabla">
          <thead><tr><th>Líder</th>{meses.map(m => <th key={m}>{mesLabel(m)}</th>)}</tr></thead>
          <tbody>
            {filas.map(({ l, porMes }) => (
              <tr key={l.id}>
                <td>{nombreCompletoPersona(l)}</td>
                {porMes.map((k, i) => {
                  const antes = i ? porMes[i - 1] : k;
                  const flecha = orden(k) > orden(antes) ? ' ↑' : orden(k) < orden(antes) ? ' ↓' : '';
                  return <td key={i}>{rangoLabel(k)}{flecha}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
