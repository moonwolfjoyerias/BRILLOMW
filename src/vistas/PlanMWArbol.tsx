// Partes de Plan MW que salen del árbol de mi-equipo (la verdad para rangos,
// comisiones y boletos):
// - Rangos y logros: quién está cerca de subir de rango (con lo que le falta
//   de cada requisito) y quién subió en el mes.
// - Pago y comprobante de la comisión de una líder: sus datos bancarios (de
//   su Mi cuenta en la página), registrar el pago de cada quincena (se le
//   avisa en su portal), el bono por rango la primera vez que lo logra y el
//   comprobante para imprimir o guardar en PDF.
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { db, dbEquipo } from '../firebase';
import { useArbol } from '../arbol/acciones';
import { usePlanesConstancia } from '../constancia/acciones';
import { calcularPlan } from '../constancia/plan';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { MarcoModal, useEnvio } from './Modal';
import { usePersonasAdmin } from '../personas/acciones';
import { HITOS_CONSTANCIA, nombreCompletoPersona } from '../personas/modelo';
import { pagarBono, registrarPago, useComisiones } from '../comisiones/acciones';
import { clavePago, infoSubPeriodo, montoBonoRango } from '../comisiones/modelo';
import { boletosPorPuntos, buscarPersonaEnArbol, comisionesDelMes, etiquetaMes, mesKey, puntosPeriodo, rangoDelMes, subarbol, type ComisionPeriodo, type Miembro } from '../arbol/modelo';
import { ascensoPrimeraVez, logrosDelMes, personasPorMiembro, proximosRangos, rangoSiguiente, requisitosPara } from '../arbol/planmw';
import { mxn, pts } from './ArbolDetalle';

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// ------------------------------------------------------------ Rangos y logros

export function RangosYLogros({ miembros, mk, abrirAuditoria }: { miembros: Miembro[]; mk: string; abrirAuditoria: (id: string) => void }) {
  const [verTodas, setVerTodas] = useState(false);
  const proximos = useMemo(() => proximosRangos(miembros, mk), [miembros, mk]);
  const logros = useMemo(() => logrosDelMes(miembros, mk), [miembros, mk]);
  const cerca = proximos.filter(p => p.listo || p.progresoPct >= 70);
  const lista = verTodas ? proximos : cerca;
  return (
    <div className="rangos-logros">
      <h3>Logros de {etiquetaMes(mk)}</h3>
      {logros.length ? (
        <ul className="lista-filas">
          {logros.map(l => (
            <li key={l.lider.id} className="logro-rango">
              <strong>{l.lider.fullName}</strong> subió de <span className={`rango-${l.antes.key}`}>{l.antes.label}</span> a <span className={`rango-${l.ahora.key}`}>{l.ahora.label}</span>
              {l.primeraVez && <span className="chip">Primera vez: lleva bono por rango</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Nadie subió de rango en {etiquetaMes(mk)} (con los puntos que hay cargados).</p>
      )}

      <div className="encabezado-seccion con-accion">
        <h3>Próximas a subir de rango</h3>
        <label className="check"><input type="checkbox" checked={verTodas} onChange={e => setVerTodas(e.target.checked)} /> Ver a todas las líderes ({proximos.length})</label>
      </div>
      <p className="muted small">Con los puntos de {etiquetaMes(mk)}: lo que lleva cada líder de cada requisito del rango que sigue. {verTodas ? '' : 'Se muestran las que ya cumplen o llevan 70% o más.'}</p>
      {!lista.length ? (
        <p className="muted small">{proximos.length ? 'Ninguna líder está todavía cerca del siguiente rango.' : 'Todavía no hay líderes con equipo en el árbol.'}</p>
      ) : (
        <ul className="rejilla proximos-rango">
          {lista.map(p => (
            <li key={p.lider.id} className={`proximo-rango${p.listo ? ' listo' : ''}`}>
              <div className="pr-cabeza">
                <strong>{p.lider.fullName}</strong>
                <span className="muted small">{p.actual.label} → <b>{p.siguiente.label}</b></span>
              </div>
              <div className="barra-progreso" aria-label={`${p.progresoPct}% hacia ${p.siguiente.label}`}><div style={{ width: `${p.progresoPct}%` }} /></div>
              <span className="small">{p.listo ? `Ya cumple todo para ${p.siguiente.label}.` : `${p.progresoPct}% hacia ${p.siguiente.label}`}</span>
              <ul className="lista-simple requisitos-rango">
                {p.requisitos.map(r => (
                  <li key={r.nombre} className={r.ok ? 'ra-ok' : 'ra-no'}>
                    {r.ok ? '✓' : '✗'} {r.nombre}: {r.dinero ? pts(r.lleva) : r.lleva} de {r.dinero ? pts(r.meta) : r.meta}
                    {!r.ok && <span className="muted"> · faltan {r.dinero ? pts(r.meta - r.lleva) : r.meta - r.lleva}</span>}
                  </li>
                ))}
              </ul>
              <div className="acciones izquierda sin-margen"><button className="btn mini" onClick={() => abrirAuditoria(p.lider.id)}>Auditoría de rango</button></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Pago y comprobante

type Sub = 'p1' | 'p2';

export function PagoComprobante({ miembros, liderId, mk, perfil, onCerrar }: { miembros: Miembro[]; liderId: string; mk: string; perfil: PerfilUsuario; onCerrar: () => void }) {
  const per = usePersonasAdmin(db, true);
  const com = useComisiones(db);
  const [imprimir, setImprimir] = useState<null | Sub | 'mes'>(null);
  const c = comisionesDelMes(miembros, liderId, mk);
  const persona = useMemo(
    () => (per.estado === 'listo' ? personasPorMiembro(miembros, per.personas).get(liderId) ?? null : null),
    [per, miembros, liderId]
  );
  if (!c) return null;
  const cargando = per.estado === 'cargando' || com.estado === 'cargando';
  const banco = persona && per.estado === 'listo' ? per.financiero.get(persona.id)?.datosBancarios : null;
  const ascenso = ascensoPrimeraVez(miembros, liderId, c.mesBase);
  const bono = ascenso && com.estado === 'listo' && persona
    ? { rango: ascenso, monto: montoBonoRango(ascenso.key, mk, com.config), clave: `${persona.id}__${ascenso.key}`, pago: com.bonos[`${persona.id}__${ascenso.key}`] }
    : null;
  return (
    <MarcoModal titulo="Pago y comprobante" onCerrar={onCerrar} clase="modal-amplio">
      <p className="muted">{c.lider.fullName} · {etiquetaMes(mk)} · Rango aplicado: <b>{c.rangoInfo.rango.label}</b>{c.esManual ? ' (manual)' : ` (logrado en ${etiquetaMes(c.mesBase)})`}</p>
      {cargando && <p className="muted small">Cargando datos de la página…</p>}
      {per.estado === 'listo' && !persona && (
        <p className="nota-apartado">Esta persona del árbol no está vinculada con su cuenta de la página: vincúlala en la pestaña "Vincular con la página" para ver sus datos bancarios, registrar el pago y avisarle.</p>
      )}
      {persona && (
        <>
          <h3>Datos bancarios</h3>
          {banco && (banco.titular || banco.banco || banco.clabe) ? (
            <dl className="datos"><dt>Titular</dt><dd>{banco.titular || '—'}</dd><dt>Banco</dt><dd>{banco.banco || '—'}</dd><dt>CLABE</dt><dd className="mono">{banco.clabe || '—'}</dd></dl>
          ) : (
            <p className="muted small">{nombreCompletoPersona(persona)} todavía no registró sus datos bancarios en su Mi cuenta.</p>
          )}
          {com.estado === 'listo' && (['p1', 'p2'] as Sub[]).map(sub => (
            <BloquePago key={sub} sub={sub} mk={mk} periodo={sub === 'p1' ? c.periodo1 : c.periodo2} personaId={persona.id} pago={com.pagos[clavePago(persona.id, mk, sub)]} perfil={perfil} />
          ))}
          {bono && <BloqueBono bono={bono} perfil={perfil} />}
        </>
      )}
      <h3>Comprobante</h3>
      <div className="acciones izquierda">
        <button className="btn" onClick={() => setImprimir('p1')}>Periodo 1</button>
        <button className="btn" onClick={() => setImprimir('p2')}>Periodo 2</button>
        <button className="btn" onClick={() => setImprimir('mes')}>Mes completo</button>
      </div>
      {imprimir && (
        <Comprobante
          lider={c.lider}
          cuenta={persona?.usuario || c.lider.clientCode || '—'}
          rango={`${c.rangoInfo.rango.label}${c.esManual ? ' (manual)' : ''}`}
          mk={mk}
          periodos={imprimir === 'mes' ? [['p1', c.periodo1], ['p2', c.periodo2]] : [[imprimir, imprimir === 'p1' ? c.periodo1 : c.periodo2]]}
          pagos={com.estado === 'listo' && persona ? com.pagos : {}}
          personaId={persona?.id ?? ''}
          onListo={() => setImprimir(null)}
        />
      )}
    </MarcoModal>
  );
}

function BloquePago({ sub, mk, periodo, personaId, pago, perfil }: { sub: Sub; mk: string; periodo: ComisionPeriodo; personaId: string; pago?: { estado: string; fechaPago?: string; registradoPor?: string; montoPagado?: number }; perfil: PerfilUsuario }) {
  const [monto, setMonto] = useState((Math.round(periodo.totalComision * 100) / 100).toFixed(2));
  const { enviando, error, enviar } = useEnvio();
  const info = infoSubPeriodo(mk, sub);
  return (
    <div className="bloque-pago">
      <h3>{info.label} <span className="muted small">· se paga el {info.fechaPago}</span></h3>
      {pago?.estado === 'pagada' ? (
        <dl className="datos">
          <dt>Estado</dt><dd>Pagada</dd>
          <dt>Fecha de pago</dt><dd>{fecha(pago.fechaPago)}</dd>
          <dt>Registrado por</dt><dd>{pago.registradoPor}</dd>
          <dt>Monto pagado</dt><dd>{mxn(pago.montoPagado ?? 0)}</dd>
        </dl>
      ) : (
        <>
          <p className="small">Comisión del árbol: <strong>{mxn(periodo.totalComision)}</strong>{periodo.gated && <span className="error small"> · sin compra mínima ({pts(periodo.compraLiderPeriodo)} de {pts(periodo.minRequerido)})</span>}</p>
          <div className="acciones izquierda">
            <input type="number" step="0.01" min="0" value={monto} onChange={e => setMonto(e.target.value)} aria-label={`Monto pagado ${info.label}`} />
            <button className="btn primario" disabled={enviando || !(parseFloat(monto) > 0)} onClick={() => window.confirm(`¿Registrar el pago de ${info.label} por ${mxn(parseFloat(monto))}? Se le avisa a la líder.`) && void enviar(() => registrarPago(db, personaId, mk, sub, parseFloat(monto), perfil, equipoActual()))}>Registrar pago</button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function BloqueBono({ bono, perfil }: { bono: { rango: { label: string }; monto: number; clave: string; pago?: { fechaPago: string; registradoPor: string } }; perfil: PerfilUsuario }) {
  const { enviando, error, enviar } = useEnvio();
  return (
    <div className="bloque-pago">
      <h3>Bono por rango · {bono.rango.label}</h3>
      <p className="small">Lo logró por primera vez: bono de <strong>{mxn(bono.monto)}</strong>.</p>
      {bono.pago ? (
        <p className="small">Pagado el {fecha(bono.pago.fechaPago)} por {bono.pago.registradoPor}.</p>
      ) : (
        <button className="btn" disabled={enviando} onClick={() => window.confirm('¿Marcar este bono por rango como pagado?') && void enviar(() => pagarBono(db, bono.clave, perfil, equipoActual()))}>Marcar bono como pagado</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** Comprobante de comisión con los números del árbol, para imprimir o guardar en PDF. */
function Comprobante({ lider, cuenta, rango, mk, periodos, pagos, personaId, onListo }: {
  lider: Miembro;
  cuenta: string;
  rango: string;
  mk: string;
  periodos: [Sub, ComisionPeriodo][];
  pagos: Record<string, { estado: string; fechaPago?: string; registradoPor?: string }>;
  personaId: string;
  onListo: () => void;
}) {
  const hoja = (
    <div className="hoja-reporte comprobante-comision">
      {periodos.map(([sub, p]) => {
        const info = infoSubPeriodo(mk, sub);
        const pago = personaId ? pagos[clavePago(personaId, mk, sub)] : undefined;
        return (
          <div key={sub} className="periodo-comprobante">
            <div className="hoja-cabeza">
              <div>
                <h2>Comprobante de comisión</h2>
                <p>{etiquetaMes(mk)} · {info.label}</p>
                <p className="hoja-nota">Generado el {new Date().toLocaleString('es-MX')}</p>
              </div>
              <img src="./isotipo.png" alt="MW Joyería" />
            </div>
            <p><strong>Líder:</strong> {lider.fullName} · <strong>Cuenta:</strong> {cuenta}</p>
            <p><strong>Rango aplicado:</strong> {rango}{p.gated ? ` · Sin compra mínima en el periodo (${pts(p.compraLiderPeriodo)} de ${pts(p.minRequerido)}): no cobra comisión.` : ''}</p>
            <table>
              <thead><tr><th>Línea</th><th>%</th><th>Personas</th><th>Puntos</th><th>Comisión neta</th></tr></thead>
              <tbody>{p.resumenLineas.map(r => <tr key={r.linea}><td>{r.linea}</td><td>{r.rate}%</td><td>{r.personas}</td><td>{pts(r.puntos)}</td><td>{mxn(r.comision)}</td></tr>)}</tbody>
            </table>
            <table>
              <thead><tr><th>Línea</th><th>Persona</th><th>Puntos</th><th>%</th><th>Bruta</th><th>IVA</th><th>Neta</th></tr></thead>
              <tbody>
                {p.detalle.filter(d => d.comision > 0).sort((a, b) => a.linea - b.linea || a.nombre.localeCompare(b.nombre)).map(d => (
                  <tr key={d.id}><td>{d.linea}</td><td>{d.nombre}</td><td>{pts(d[sub])}</td><td>{d.rate}%</td><td>{mxn(d.comisionBruta)}</td><td>{mxn(d.iva)}</td><td><strong>{mxn(d.comision)}</strong></td></tr>
                ))}
              </tbody>
            </table>
            <div className="total-comprobante"><span>COMISIÓN DE ESTE PERIODO (NETA, SIN IVA)</span><strong>{mxn(p.totalComision)}</strong></div>
            <p className="hoja-nota">Estado del pago: {pago?.estado === 'pagada' ? `pagada el ${fecha(pago.fechaPago)} por ${pago.registradoPor}` : 'pendiente de pago'} · Se paga el {info.fechaPago}.</p>
          </div>
        );
      })}
      {periodos.length > 1 && <div className="total-comprobante"><span>COMISIÓN DEL MES</span><strong>{mxn(periodos.reduce((s, [, p]) => s + p.totalComision, 0))}</strong></div>}
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

// ------------------------------------------------------------ Perfil de una e/l (Emprendedoras y Líderes)

/** Plan MW de una persona con los datos del árbol y su Plan de constancia. */
export function PlanMWPersona({ personaId, usuario, nombre, esLider }: { personaId: string; usuario: string; nombre: string; esLider: boolean }) {
  const arbol = useArbol(dbEquipo);
  const planes = usePlanesConstancia(db);
  const mk = mesKey(new Date());
  if (arbol.estado === 'cargando' || !planes) return <p className="muted">Cargando su Plan MW…</p>;
  const miembros = arbol.estado === 'listo' ? arbol.miembros : [];
  const enArbol = buscarPersonaEnArbol(miembros, { id: personaId, usuario, nombre });
  const plan = planes.get(personaId);
  const r = plan ? calcularPlan(plan, HITOS_CONSTANCIA.map(h => ({ meses: h.meses, premio: h.premio })), mk) : null;
  const m = enArbol?.miembro;
  const p = m ? puntosPeriodo(m, mk) : null;
  const total = p ? p.p1 + p.p2 : 0;
  const boletos = boletosPorPuntos(total);
  const metaBoleto = total < 3000 ? 3000 : 3000 + boletos * 1000;
  const equipo = m ? subarbol(miembros, m.id).size - 1 : 0;
  const info = m && equipo > 0 ? rangoDelMes(miembros, m.id, mk) : null;
  const c = m && equipo > 0 ? comisionesDelMes(miembros, m.id, mk) : null;
  const siguiente = info ? rangoSiguiente(info.rango.key) : null;
  const barra = (v: number, meta: number) => <div className="barra-progreso"><div style={{ width: `${Math.min(100, (v / (meta || 1)) * 100)}%` }} /></div>;
  return (
    <>
      <h3>Rango y puntos · {etiquetaMes(mk)}</h3>
      {arbol.estado === 'error' && <p className="error small">No se pudo leer el árbol de mi-equipo.</p>}
      {!m ? (
        <p className="nota-apartado">No está en el árbol de mi-equipo (o no está vinculada): su rango, comisiones y boletos salen del árbol. Vincúlala en Plan MW → "Vincular con la página".</p>
      ) : (
        <>
          <div className="resumen-apartados">
            <div className="dato"><span>Puntos P1</span><strong>{pts(p!.p1)}</strong></div>
            <div className="dato"><span>Puntos P2</span><strong>{pts(p!.p2)}</strong></div>
            {(esLider || equipo > 0) && <div className="dato"><span>Rango logrado este mes</span><strong>{info?.rango.label ?? 'Sin rango'}</strong><span className="small">{equipo} en su equipo</span></div>}
            {c && <div className="dato"><span>Comisión de este mes</span><strong>{mxn(c.total)}</strong><span className="small">con rango {c.rangoInfo.rango.label}</span></div>}
          </div>
          {info && siguiente && (
            <ul className="lista-simple requisitos-rango">
              <li className="muted small">Para {siguiente.label}:</li>
              {requisitosPara(info, siguiente).map(q => (
                <li key={q.nombre} className={q.ok ? 'ra-ok' : 'ra-no'}>{q.ok ? '✓' : '✗'} {q.nombre}: {q.dinero ? pts(q.lleva) : q.lleva} de {q.dinero ? pts(q.meta) : q.meta}</li>
              ))}
            </ul>
          )}
          <h3>Boletos de rifa (mes en curso)</h3>
          <div className="resumen-apartados">
            <div className="dato"><span>Boletos ganados</span><strong>{boletos}</strong></div>
            <div className="dato"><span>Puntos del mes</span><strong>{pts(total)}</strong><span className="small">{`le faltan ${pts(metaBoleto - total)} para ${boletos ? 'otro boleto' : 'su primer boleto'}`}</span></div>
          </div>
          {barra(total, metaBoleto)}
        </>
      )}
      <h3>Plan de constancia</h3>
      {!r ? (
        <p className="muted small">No tiene Plan de constancia cargado (se carga en Plan MW → Constancia).</p>
      ) : (
        <>
          <div className="resumen-apartados">
            <div className="dato"><span>Estado</span><strong>{r.estado === 'activa' ? 'Activa' : 'Perdió el reto'}</strong>{r.motivoCaida && <span className="small">{r.motivoCaida}</span>}</div>
            <div className="dato"><span>Compras cumplidas</span><strong>{r.compras}</strong><span className="small">Mes {r.mesDelReto} del reto</span></div>
            <div className="dato"><span>Este mes</span><strong>{mxn(r.montoMesActual)}</strong><span className="small">{r.faltaMes ? `le faltan ${mxn(r.faltaMes)}` : 'ya cubierto'}</span></div>
            {r.siguiente && <div className="dato"><span>Siguiente premio</span><strong className="texto-normal">{r.siguiente.premio}</strong><span className="small">faltan {mxn(r.faltaSiguiente)}</span></div>}
          </div>
          {r.porEntregar.length > 0 && <p className="nota-apartado">Por entregar: {r.porEntregar.map(h => h.premio).join(', ')} (se confirma en Plan MW → Constancia).</p>}
        </>
      )}
    </>
  );
}
