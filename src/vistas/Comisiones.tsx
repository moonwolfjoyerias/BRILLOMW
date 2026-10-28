// Comisiones de Líderes para Administración: lo mismo que
// admin-comisiones.html de la página, sobre los mismos documentos.
// Por mes: cada líder con su rango aplicado, comisión de cada quincena,
// equipo por niveles con ajuste manual por persona, bono por rango, pago de
// cada quincena con comprobante, rango manual y exportar a Excel.
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { MarcoModal, useEnvio } from './Modal';
import { useApartados } from '../apartados/acciones';
import { usePersonasAdmin } from '../personas/acciones';
import { nombreCompletoPersona, RANGOS_MW, rangoLabel, type Financiero, type PersonaAdmin } from '../personas/modelo';
import { cumpleRangoActual, LibroCompras, mesKeyDe, mesLabel, type SubPeriodo } from '../planmw/modelo';
import { guardarAjuste, guardarRangoManual, pagarBono, registrarPago, restaurarCalculo, useAronium, useComisiones } from '../comisiones/acciones';
import {
  bonoDelPeriodo,
  claveAjuste,
  claveRangoManual,
  comisionesLider,
  csv,
  estadoPagoMes,
  infoSubPeriodo,
  nuevoAjuste,
  ultimosMeses,
  type DatosComisiones,
  type Fila,
  type ResultadoLider
} from '../comisiones/modelo';

const $ = (n: number) => (Number(n) || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

interface Ctx {
  personas: PersonaAdmin[];
  financiero: Map<string, Financiero>;
  libro: LibroCompras;
  d: DatosComisiones;
  mes: string;
  perfil: PerfilUsuario;
}

export function Comisiones({ perfil }: { perfil: PerfilUsuario }) {
  const per = usePersonasAdmin(db, true);
  const ap = useApartados(db);
  const aronium = useAronium(db);
  const com = useComisiones(db);
  const [mes, setMes] = useState(mesKeyDe());
  const [texto, setTexto] = useState('');
  const ventanas = ap.estado === 'listo' ? ap.ventanas : null;
  const libro = useMemo(() => (ventanas && aronium ? new LibroCompras(ventanas, aronium) : null), [ventanas, aronium]);

  if (per.estado === 'error' || ap.estado === 'error' || com.estado === 'error') return <p className="error">No se pudo cargar Comisiones. Revisa la conexión.</p>;
  if (per.estado !== 'listo' || com.estado !== 'listo' || !libro) return <p className="muted">Calculando comisiones…</p>;

  const ctx: Ctx = { personas: per.personas, financiero: per.financiero, libro, d: com, mes, perfil };
  const lideres = per.personas
    .filter(p => p.tipo === 'lider')
    .filter(p => !texto.trim() || nombreCompletoPersona(p).toLowerCase().includes(texto.trim().toLowerCase()))
    .sort((a, b) => nombreCompletoPersona(a).localeCompare(nombreCompletoPersona(b), 'es'));
  const resultados = lideres.map(l => ({ l, p1: comisionesLider(ctx.personas, libro, com, l, mes, 'p1'), p2: comisionesLider(ctx.personas, libro, com, l, mes, 'p2') }));
  const total = resultados.reduce((s, r) => s + r.p1.totalComision + r.p2.totalComision, 0);

  const exportar = () => {
    const filas: (string | number)[][] = [['Líder', 'Rango aplicado', 'Nivel', 'Emprendedora', 'Compra P1', 'Comisión P1', 'Compra P2', 'Comisión P2', 'Comisión final']];
    resultados.forEach(({ l, p1, p2 }) =>
      p1.niveles.forEach((n, i) =>
        n.filas.forEach(f1 => {
          const f2 = p2.niveles[i].filas.find(f => f.persona.id === f1.persona.id);
          filas.push([nombreCompletoPersona(l), rangoLabel(p1.rangoKey), n.nivel, nombreCompletoPersona(f1.persona), f1.compraNormal, f1.comisionFinal, f2?.compraNormal ?? 0, f2?.comisionFinal ?? 0, f1.comisionFinal + (f2?.comisionFinal ?? 0)]);
        })
      )
    );
    filas.push([]);
    filas.push(['Resumen de pago', '', '', '', '', 'P1', '', 'P2', 'Total']);
    resultados.forEach(({ l, p1, p2 }) => filas.push([nombreCompletoPersona(l), rangoLabel(p1.rangoKey), '', '', '', p1.totalComision, '', p2.totalComision, p1.totalComision + p2.totalComision]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv(filas)], { type: 'text/csv;charset=utf-8' }));
    a.download = `comisiones-mw-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="comisiones">
      <div className="encabezado-seccion">
        <h1>Comisiones</h1>
        <p className="muted">Comisión por quincena: compra normal sin IVA × % de cada nivel según el rango aplicado ese mes. Lo mismo que en la página.</p>
      </div>
      <div className="filtros-deseos">
        <input type="search" placeholder="Buscar líder…" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Buscar líder" />
        <select value={mes} onChange={e => setMes(e.target.value)} aria-label="Mes">
          {ultimosMeses(6).map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <button className="btn" onClick={exportar} disabled={!resultados.length}>Exportar a Excel</button>
      </div>
      <div className="resumen-apartados">
        <div className="dato"><span>Líderes</span><strong>{resultados.length}</strong></div>
        <div className="dato"><span>Comisión del mes</span><strong>{$(total)}</strong><span className="small">Periodo 1 + Periodo 2</span></div>
        <div className="dato"><span>Pendientes de pago</span><strong>{resultados.filter(r => r.p1.estadoPago.estado !== 'pagada' || r.p2.estadoPago.estado !== 'pagada').length}</strong></div>
      </div>
      {!resultados.length ? (
        <p className="muted">Todavía no hay líderes registradas. Se dan de alta en Emprendedoras/Líderes.</p>
      ) : (
        <div className="lista-nomina">
          {resultados.map(r => <TarjetaLider key={r.l.id} ctx={ctx} lider={r.l} p1={r.p1} p2={r.p2} />)}
        </div>
      )}
      <p className="muted small">Los porcentajes, el IVA y los bonos son los de siempre del Plan MW. Si Configuración de la página tiene valores distintos guardados en ese navegador, la página los usa ahí; BRILLO usa los de siempre.</p>
    </section>
  );
}

function TarjetaLider({ ctx, lider, p1, p2 }: { ctx: Ctx; lider: PersonaAdmin; p1: ResultadoLider; p2: ResultadoLider }) {
  const [abierto, setAbierto] = useState(false);
  const [modal, setModal] = useState<null | 'pago' | 'rango'>(null);
  const bono = bonoDelPeriodo(lider, ctx.mes, ctx.d.bonos);
  const estado = estadoPagoMes(p1.estadoPago, p2.estadoPago);
  const minimo = cumpleRangoActual({ personas: ctx.personas, libro: ctx.libro }, lider, p1.rangoKey, ctx.mes);
  const manual = ctx.d.rangoManual[claveRangoManual(lider.id, ctx.mes)];
  const { enviando, error, enviar } = useEnvio();
  return (
    <div className="tarjeta-caja tarjeta-comision">
      <div className="fila-titulo">
        <div>
          <h2>{nombreCompletoPersona(lider)}</h2>
          <div className="etiquetas">
            <span className="chip neutro">Rango aplicado: {rangoLabel(p1.rangoKey)}</span>
            <span className={estado === 'Pagado' ? 'chip ok' : 'chip pendiente'}>{estado}</span>
            {(p1.tieneAjustes || p2.tieneAjustes) && <span className="chip neutro">Con ajustes manuales</span>}
            {minimo.aplica && !minimo.cumple && (
              <span className="chip agotado" title={minimo.items.filter(i => !i.cumple).map(i => `${i.label}: ${i.valores}`).join(' · ')}>No alcanza el mínimo de {rangoLabel(p1.rangoKey)} este mes</span>
            )}
          </div>
          <span className="muted small">Origen: {p1.origenRango} · Equipo: {p1.totalEquipo}</span>
        </div>
        <div className="totales-comision">
          <div><span className="muted small">Periodo 1</span><strong>{$(p1.totalComision)}</strong></div>
          <div><span className="muted small">Periodo 2</span><strong>{$(p2.totalComision)}</strong></div>
          <div><span className="muted small">Total</span><strong>{$(p1.totalComision + p2.totalComision)}</strong></div>
        </div>
      </div>
      {bono && (
        <div className="nota-apartado">
          <strong>Bono por rango — {rangoLabel(bono.rango)}: {$(bono.monto)}</strong>
          <span className="small bloque">Una sola vez, por su ascenso del {fecha(bono.fechaAscenso)}. Se paga aparte, no se suma a la comisión.</span>
          {bono.pagado ? (
            <span className="chip ok">Pagado el {fecha(bono.fechaPago)} por {bono.registradoPor}</span>
          ) : (
            <div className="acciones izq">
              <button className="btn" disabled={enviando} onClick={() => window.confirm('¿Marcar este bono por rango como pagado?') && void enviar(() => pagarBono(db, bono.clave, ctx.perfil, equipoActual()))}>Marcar como pagado</button>
            </div>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="acciones izq">
        <button className="btn" onClick={() => setAbierto(!abierto)}>{abierto ? '− Ocultar equipo' : '+ Ver equipo'}</button>
        <button className="btn" onClick={() => setModal('rango')}>{manual ? `Rango manual: ${rangoLabel(manual)}` : 'Ajustar rango manual de este mes'}</button>
        <button className="btn primario" onClick={() => setModal('pago')}>Pago y comprobante</button>
      </div>
      {abierto && <Equipo ctx={ctx} lider={lider} p1={p1} p2={p2} />}
      {modal === 'pago' && <PagoComision ctx={ctx} lider={lider} p1={p1} p2={p2} onCerrar={() => setModal(null)} />}
      {modal === 'rango' && <RangoManual ctx={ctx} lider={lider} actual={manual ?? ''} onCerrar={() => setModal(null)} />}
    </div>
  );
}

function Equipo({ ctx, lider, p1, p2 }: { ctx: Ctx; lider: PersonaAdmin; p1: ResultadoLider; p2: ResultadoLider }) {
  const [historial, setHistorial] = useState<{ persona: PersonaAdmin; sub: SubPeriodo } | null>(null);
  return (
    <div className="niveles-comision">
      {p1.niveles.map((n, i) => {
        const n2 = p2.niveles[i];
        const totalNivel = n.totalNivel + n2.totalNivel;
        return (
          <details key={n.nivel} className="nivel-comision">
            <summary><strong>Nivel {n.nivel} · {n.pct}%</strong> · {n.filas.length} persona{n.filas.length === 1 ? '' : 's'} <span className="monto">{$(totalNivel)}</span></summary>
            {!n.filas.length ? (
              <p className="muted small">Todavía no hay integrantes en este nivel.</p>
            ) : (
              <div className="tabla-desplazable">
                <table className="tabla tabla-comision">
                  <thead>
                    <tr><th>Emprendedora</th><th>Compra P1</th><th>Base P1</th><th>Comisión P1</th><th>Compra P2</th><th>Base P2</th><th>Comisión P2</th><th>Final</th></tr>
                  </thead>
                  <tbody>
                    {n.filas.map(f1 => {
                      const f2 = n2.filas.find(f => f.persona.id === f1.persona.id) ?? null;
                      return (
                        <tr key={f1.persona.id}>
                          <td>{nombreCompletoPersona(f1.persona)}</td>
                          <td>{$(f1.compraNormal)}</td>
                          <td>{$(f1.base)}</td>
                          <td><CeldaComision ctx={ctx} lider={lider} f={f1} sub="p1" onHistorial={() => setHistorial({ persona: f1.persona, sub: 'p1' })} /></td>
                          <td>{f2 ? $(f2.compraNormal) : '—'}</td>
                          <td>{f2 ? $(f2.base) : '—'}</td>
                          <td>{f2 ? <CeldaComision ctx={ctx} lider={lider} f={f2} sub="p2" onHistorial={() => setHistorial({ persona: f2.persona, sub: 'p2' })} /> : '—'}</td>
                          <td><strong>{$(f1.comisionFinal + (f2?.comisionFinal ?? 0))}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        );
      })}
      {historial && <HistorialAjustes ctx={ctx} lider={lider} persona={historial.persona} sub={historial.sub} onCerrar={() => setHistorial(null)} />}
    </div>
  );
}

/** La comisión de una persona en una quincena: se ajusta a mano al salir del campo; ↺ vuelve al cálculo. */
function CeldaComision({ ctx, lider, f, sub, onHistorial }: { ctx: Ctx; lider: PersonaAdmin; f: Fila; sub: SubPeriodo; onHistorial: () => void }) {
  const [texto, setTexto] = useState(f.comisionFinal.toFixed(2));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valorServidor = f.comisionFinal.toFixed(2);
  const [ultimo, setUltimo] = useState(valorServidor);
  if (ultimo !== valorServidor && !guardando) { setUltimo(valorServidor); setTexto(valorServidor); }
  const aplicar = async () => {
    const v = Math.round(parseFloat(texto) * 100) / 100;
    if (Number.isNaN(v) || v.toFixed(2) === valorServidor) { setTexto(valorServidor); return; }
    setGuardando(true);
    const err = await guardarAjuste(db, nuevoAjuste(f, lider.id, ctx.mes, sub, v, '', ctx.perfil.nombre, new Date()), sub, ctx.mes, ctx.perfil, equipoActual());
    setGuardando(false);
    setError(err);
    if (err) setTexto(valorServidor);
  };
  return (
    <span className="celda-comision">
      <input
        className={f.ajuste ? 'celda-numero ajustada' : 'celda-numero'}
        type="number"
        step="0.01"
        inputMode="decimal"
        aria-label={`Comisión de ${nombreCompletoPersona(f.persona)} (${sub === 'p1' ? 'Periodo 1' : 'Periodo 2'})`}
        title={f.ajuste ? `Ajustada a mano (calculada: ${$(f.comisionCalculada)})` : 'Calculada automáticamente'}
        value={texto}
        disabled={guardando}
        onChange={e => setTexto(e.target.value)}
        onBlur={() => void aplicar()}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setTexto(valorServidor); }}
      />
      {f.ajuste && (
        <button className="btn mini" title="Restaurar cálculo automático" disabled={guardando} onClick={async () => {
          if (!window.confirm('¿Quitar el ajuste manual y volver al cálculo automático?')) return;
          setGuardando(true);
          setError(await restaurarCalculo(db, lider.id, f.persona.id, ctx.mes, sub, ctx.perfil, equipoActual()));
          setGuardando(false);
        }}>↺</button>
      )}
      <button className="btn mini" title="Historial de ajustes" onClick={onHistorial}>🕑</button>
      {error && <span className="error small bloque">{error}</span>}
    </span>
  );
}

function HistorialAjustes({ ctx, lider, persona, sub, onCerrar }: { ctx: Ctx; lider: PersonaAdmin; persona: PersonaAdmin; sub: SubPeriodo; onCerrar: () => void }) {
  const periodo = `${ctx.mes}-${sub}`;
  const lista = ctx.d.historial.filter(h => h.liderId === lider.id && h.emprendedoraId === persona.id && h.periodo === periodo).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const vigente = ctx.d.ajustes[claveAjuste(lider.id, persona.id, ctx.mes, sub)];
  return (
    <MarcoModal titulo="Historial de ajustes" onCerrar={onCerrar}>
      <p className="muted">{nombreCompletoPersona(persona)} · {mesLabel(ctx.mes)} · {sub === 'p1' ? 'Periodo 1' : 'Periodo 2'}</p>
      {vigente && <p className="nota-apartado small">Ajuste vigente: {$(vigente.valorNuevo)} (calculado {$(vigente.valorCalculado)})</p>}
      {!lista.length ? <p className="muted">Esta comisión no tiene ajustes manuales registrados en este periodo.</p> : (
        <ul className="historial">
          {lista.map(h => (
            <li key={h.id}>
              <strong>{$(h.valorAnterior)} → {$(h.valorNuevo)}</strong>
              <span className="muted small bloque">{new Date(h.fecha).toLocaleString('es-MX')} · {h.usuarioAdminId}{h.motivo ? ` · ${h.motivo}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </MarcoModal>
  );
}

function RangoManual({ ctx, lider, actual, onCerrar }: { ctx: Ctx; lider: PersonaAdmin; actual: string; onCerrar: () => void }) {
  const [valor, setValor] = useState(actual);
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal titulo={`Rango manual — ${nombreCompletoPersona(lider)}`} onCerrar={onCerrar} enviando={enviando} onEnviar={e => {
      e.preventDefault();
      void enviar(async () => {
        const err = await guardarRangoManual(db, lider.id, nombreCompletoPersona(lider), ctx.mes, valor || null, ctx.perfil, equipoActual());
        if (!err) onCerrar();
        return err;
      });
    }}>
      <p className="muted">Cambia solo el % que se paga en {mesLabel(ctx.mes)}. No modifica su rango histórico ni su recalificación del Plan MW.</p>
      <label className="campo">
        <span>Rango a aplicar este mes de pago</span>
        <select value={valor} onChange={e => setValor(e.target.value)}>
          <option value="">Usar el rango calculado automáticamente</option>
          {RANGOS_MW.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="acciones"><button className="btn primario" type="submit" disabled={enviando}>Guardar</button></div>
    </MarcoModal>
  );
}

function PagoComision({ ctx, lider, p1, p2, onCerrar }: { ctx: Ctx; lider: PersonaAdmin; p1: ResultadoLider; p2: ResultadoLider; onCerrar: () => void }) {
  const banco = ctx.financiero.get(lider.id)?.datosBancarios;
  const [imprimir, setImprimir] = useState<null | SubPeriodo | 'mes'>(null);
  return (
    <MarcoModal titulo="Pago y comprobante" onCerrar={onCerrar}>
      <p className="muted">{nombreCompletoPersona(lider)} · {mesLabel(ctx.mes)}</p>
      <h3>Datos bancarios</h3>
      {banco && (banco.titular || banco.banco || banco.clabe) ? (
        <dl className="datos"><dt>Titular</dt><dd>{banco.titular || '—'}</dd><dt>Banco</dt><dd>{banco.banco || '—'}</dd><dt>CLABE</dt><dd>{banco.clabe || '—'}</dd></dl>
      ) : (
        <p className="muted small">Esta líder todavía no registró sus datos bancarios en su Mi cuenta.</p>
      )}
      <BloquePago ctx={ctx} r={p1} />
      <BloquePago ctx={ctx} r={p2} />
      <h3>Comprobante</h3>
      <div className="acciones izq">
        <button className="btn" onClick={() => setImprimir('p1')}>Periodo 1</button>
        <button className="btn" onClick={() => setImprimir('p2')}>Periodo 2</button>
        <button className="btn" onClick={() => setImprimir('mes')}>Mes completo</button>
      </div>
      {imprimir && <Comprobante ctx={ctx} r={imprimir === 'mes' ? [p1, p2] : [imprimir === 'p1' ? p1 : p2]} onListo={() => setImprimir(null)} />}
    </MarcoModal>
  );
}

function BloquePago({ ctx, r }: { ctx: Ctx; r: ResultadoLider }) {
  const [monto, setMonto] = useState(r.totalComision.toFixed(2));
  const { enviando, error, enviar } = useEnvio();
  const info = infoSubPeriodo(ctx.mes, r.sub);
  return (
    <>
      <h3>{info.label} <span className="muted small">· se paga el {info.fechaPago}</span></h3>
      {r.estadoPago.estado === 'pagada' ? (
        <dl className="datos">
          <dt>Estado</dt><dd>Pagada</dd>
          <dt>Fecha de pago</dt><dd>{fecha(r.estadoPago.fechaPago)}</dd>
          <dt>Registrado por</dt><dd>{r.estadoPago.registradoPor}</dd>
          <dt>Monto pagado</dt><dd>{$(r.estadoPago.montoPagado ?? 0)}</dd>
        </dl>
      ) : (
        <>
          <p className="small">Comisión calculada: <strong>{$(r.totalComision)}</strong></p>
          <div className="acciones izq">
            <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} aria-label={`Monto pagado ${info.label}`} />
            <button className="btn primario" disabled={enviando} onClick={() => window.confirm(`¿Registrar el pago de ${info.label} por ${$(parseFloat(monto))}? Se le avisa a la líder.`) && void enviar(() => registrarPago(db, r.lider.id, ctx.mes, r.sub, parseFloat(monto), ctx.perfil, equipoActual()))}>Registrar pago</button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}

/** Comprobante de comisión para imprimir o guardar en PDF (como construirHTMLTicketPDF). */
function Comprobante({ ctx, r, onListo }: { ctx: Ctx; r: ResultadoLider[]; onListo: () => void }) {
  const hoja = (
    <div className="hoja-reporte comprobante-comision">
      {r.map(x => <ComprobantePeriodo key={x.sub} ctx={ctx} r={x} />)}
      {r.length > 1 && (
        <div className="total-comprobante"><span>COMISIÓN DEL MES</span><strong>{$(r.reduce((s, x) => s + x.totalComision, 0))}</strong></div>
      )}
    </div>
  );
  return (
    <>
      <div className="reporte-vista">{hoja}</div>
      <div className="acciones">
        <button className="btn" onClick={onListo}>Cerrar comprobante</button>
        <button className="btn primario" onClick={() => {
          let estilo = document.getElementById('pagina-ticket');
          if (!estilo) { estilo = document.createElement('style'); estilo.id = 'pagina-ticket'; document.head.appendChild(estilo); }
          estilo.textContent = '@media print { @page { size: letter; margin: 12mm; } }';
          window.print();
        }}>Imprimir / guardar PDF</button>
      </div>
      {createPortal(<div className="reporte-impresion" aria-hidden="true">{hoja}</div>, document.body)}
    </>
  );
}

function ComprobantePeriodo({ ctx, r }: { ctx: Ctx; r: ResultadoLider }) {
  const info = infoSubPeriodo(ctx.mes, r.sub);
  const filas = r.niveles.flatMap(n => n.filas);
  const ajustes = filas.filter(f => f.ajuste);
  const souvenirs = filas.reduce((s, f) => s + f.compraSouvenir, 0);
  return (
    <div className="periodo-comprobante">
      <div className="hoja-cabeza">
        <div>
          <h2>Comprobante de comisión</h2>
          <p>{mesLabel(ctx.mes)} · {info.label}</p>
          <p className="hoja-nota">Generado el {new Date().toLocaleString('es-MX')}</p>
        </div>
        <img src="./isotipo.png" alt="MW Joyería" />
      </div>
      <p><strong>Líder:</strong> {nombreCompletoPersona(r.lider)} · <strong>Cuenta:</strong> {r.lider.numeroCuenta || r.lider.usuario || '—'}</p>
      <p><strong>Rango aplicado:</strong> {rangoLabel(r.rangoKey)} ({r.origenRango})</p>
      <table>
        <thead><tr><th>Nivel</th><th>%</th><th>Personas con comisión</th><th>Comisión</th></tr></thead>
        <tbody>{r.niveles.map(n => <tr key={n.nivel}><td>Nivel {n.nivel}</td><td>{n.pct}%</td><td>{n.filas.filter(f => f.comisionFinal > 0).length}</td><td>{$(n.totalNivel)}</td></tr>)}</tbody>
      </table>
      <table>
        <thead><tr><th>Nivel</th><th>Emprendedora</th><th>Compra válida</th><th>Base</th><th>%</th><th>Calculada</th><th>Ajuste</th><th>Final</th></tr></thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.persona.id}>
              <td>{f.nivel}</td><td>{nombreCompletoPersona(f.persona)}</td><td>{$(f.compraNormal)}</td><td>{$(f.base)}</td><td>{f.pct}%</td>
              <td>{$(f.comisionCalculada)}</td><td>{f.ajuste ? $(f.comisionFinal - f.comisionCalculada) : '—'}</td><td><strong>{$(f.comisionFinal)}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      {ajustes.length > 0 && <p className="hoja-nota">Ajustes manuales aplicados: {ajustes.length} ({ajustes.map(f => `${nombreCompletoPersona(f.persona)}: ${$(f.comisionCalculada)} → ${$(f.comisionFinal)}`).join('; ')}).</p>}
      {souvenirs > 0 && <p className="hoja-nota">Souvenirs en las compras del equipo: {$(souvenirs)}. Los souvenirs no generan comisión.</p>}
      <div className="total-comprobante"><span>COMISIÓN DE ESTE PERIODO</span><strong>{$(r.totalComision)}</strong></div>
      <p className="hoja-nota">Estado del pago: {r.estadoPago.estado === 'pagada' ? `pagada el ${fecha(r.estadoPago.fechaPago)} por ${r.estadoPago.registradoPor}` : 'pendiente de pago'} · Se paga el {info.fechaPago}.</p>
    </div>
  );
}
