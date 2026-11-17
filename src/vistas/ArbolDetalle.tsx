// Ventanas de detalle del árbol: auditoría de rango, resumen por línea y
// comisiones de una líder. Mismos textos y números que mi-equipo.
import { MarcoModal } from './Modal';
import { excelComisiones, excelEquipo } from '../arbol/excel';
import {
  comisionesDelMes,
  etiquetaMes,
  MIN_ACTIVA,
  MIN_CALIFICADA,
  mesAnterior,
  mesSiguiente,
  nivelesQueCobra,
  rangoDelMes,
  rangoHistorico,
  resumenPorLinea,
  tasasTexto,
  TOPE_LINEA,
  type ComisionPeriodo,
  type Miembro
} from '../arbol/modelo';

export const pts = (n: number) => Math.round(n).toLocaleString('es-MX');
export const mxn = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Ok = ({ si }: { si: boolean }) => <span className={si ? 'ra-ok' : 'ra-no'}>{si ? '✓' : '✗'}</span>;
const Dato = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <div className="arbol-dato"><span className="muted small">{t}</span><strong>{children}</strong></div>
);

export function AuditoriaRango({ miembros, id, mk, onCerrar }: { miembros: Miembro[]; id: string; mk: string; onCerrar: () => void }) {
  const lider = miembros.find(m => m.id === id);
  if (!lider) return null;
  const info = rangoDelMes(miembros, id, mk);
  const historico = rangoHistorico(miembros, id, mk);
  const vig = comisionesDelMes(miembros, id, mk)!;
  const sig = mesSiguiente(mk);
  return (
    <MarcoModal titulo={`Auditoría de rango — ${lider.fullName} (${etiquetaMes(mk)})`} onCerrar={onCerrar}>
      <div className="arbol-datos">
        <Dato t="Rango histórico">{historico.label}</Dato>
        <Dato t="Rango recalificado este mes">{info.rango.label}{info.consolidaEn ? ` (consolida en P${info.consolidaEn})` : ''}</Dato>
        <Dato t="Producción P1">{pts(info.produccionP1)} pts</Dato>
        <Dato t="Producción P2">{pts(info.produccionP2)} pts</Dato>
        <Dato t="Producción mensual">{pts(info.produccion)} pts</Dato>
        <Dato t={`Activas (≥${MIN_ACTIVA} pts en P1 y P2)`}>{info.activas}</Dato>
        <Dato t={`Calificadas (≥${MIN_CALIFICADA} pts en P1 y P2)`}>{info.calificadas}</Dato>
        <Dato t="Calificadas por periodo (informativo)">P1: {info.calificadasP1} · P2: {info.calificadasP2}</Dato>
        <Dato t="Compra personal P1">{mxn(info.compraP1)}</Dato>
        <Dato t="Compra personal P2">{mxn(info.compraP2)}</Dato>
        <Dato t="Línea más fuerte (solo su equipo)">{info.lineaMasFuerte ? `${pts(info.lineaMasFuerte.totalSinLider)} pts · ${info.lineaMasFuerte.nombre}` : '—'}</Dato>
        <Dato t="Puntos válidos para rango">{pts(info.validaMes)} pts</Dato>
        <Dato t={`Niveles que puede cobrar (desde ${etiquetaMes(sig)})`}>{nivelesQueCobra(info.rango.key)} · {tasasTexto(info.rango.key)}</Dato>
        <Dato t={`Comisión total de ${etiquetaMes(mk)} (neto sin IVA)`}>
          {mxn(vig.total)} <span className="muted small">Rango vigente: {vig.rangoInfo.rango.label}{vig.esManual ? ' (manual)' : ` (recalificado en ${etiquetaMes(mesAnterior(mk))})`}</span>
        </Dato>
      </div>
      <p className="muted small">El rango recalificado en {etiquetaMes(mk)} se aplica a las comisiones de {etiquetaMes(sig)}. Las comisiones de {etiquetaMes(mk)} se pagan con el rango vigente de este mes.</p>
      <h3>Prueba de rangos (de mayor a menor)</h3>
      <div className="tabla-desplazable">
        <table className="tabla">
          <thead><tr><th>Rango</th><th>Producción válida</th><th>Activas</th><th>Calificadas</th><th>Compra personal</th><th>Resultado</th></tr></thead>
          <tbody>
            {info.evaluaciones.map(e => (
              <tr key={e.rango.key} className={e.rango.key === info.rango.key ? 'fila-ganadora' : ''}>
                <td><strong>{e.rango.label}</strong></td>
                <td><Ok si={e.okProduccion} /> {pts(e.validaMes)} / {pts(e.rango.produccion)}{e.consolidaEn && <div className="muted small">consolida en P{e.consolidaEn}</div>}</td>
                <td><Ok si={e.okActivas} /> {info.activas} / {e.rango.activas}</td>
                <td><Ok si={e.okCalificadas} /> {info.calificadas} / {e.rango.calificadas}</td>
                <td><Ok si={e.okCompra} /> {mxn(e.valorCompra)} / {mxn(e.rango.compraLider)}<div className="muted small">{e.soloUnPeriodo ? 'el mayor de P1 o P2' : 'el menor de P1 y P2 (ambos periodos)'}</div></td>
                <td>{e.rango.key === info.rango.key ? <strong className="ra-ok">Recalifica</strong> : e.califica ? <span className="muted small">También cumple</span> : <span className="ra-no">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details open={!info.lines.length}>
        <summary>Producción por líneas ({info.lines.length} patrocinada(s) directa(s))</summary>
        {info.lines.length ? (
          <div className="tabla-desplazable">
            <table className="tabla">
              <thead><tr><th>Patrocinada directa</th><th className="num">Personas</th><th className="num">P1</th><th className="num">P2</th><th className="num">Producción</th><th className="num">Válidos para rango</th></tr></thead>
              <tbody>
                {info.lines.map((l, i) => {
                  const propia = l.total - l.totalSinLider;
                  return (
                    <tr key={l.id}>
                      <td>{l.nombre}{i === 0 && <span className="muted small"> (más fuerte)</span>}</td>
                      <td className="num">{l.personas}</td>
                      <td className="num">{pts(l.p1)}</td>
                      <td className="num">{pts(l.p2)}</td>
                      <td className="num"><strong>{pts(l.total)}</strong></td>
                      <td className="num">{pts(i === 0 ? propia + l.totalSinLider * TOPE_LINEA : l.total)}{i === 0 && <div className="muted small">100% compra propia ({pts(propia)}) + 50% equipo ({pts(l.totalSinLider)})</div>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">No tiene patrocinadas directas.</p>
        )}
      </details>
    </MarcoModal>
  );
}

export function ResumenLineas({ miembros, id, mk, onCerrar }: { miembros: Miembro[]; id: string; mk: string; onCerrar: () => void }) {
  const p = miembros.find(m => m.id === id);
  if (!p) return null;
  const niveles = resumenPorLinea(miembros, id, mk);
  return (
    <MarcoModal titulo={`Resumen por línea — ${p.fullName} (${etiquetaMes(mk)})`} onCerrar={onCerrar}>
      {!niveles.length && <p className="muted">Todavía no hay nadie en líneas debajo de esta persona.</p>}
      {niveles.map(n => (
        <details key={n.linea} className={`nivel-arbol color-${((n.linea - 1) % 6) + 1}`} open={n.linea === 1}>
          <summary><strong>Línea {n.linea}</strong> <span className="muted small">{n.personas.length} persona(s) · {pts(n.total)} pts total</span></summary>
          <ul className="personas-nivel">
            {n.personas.map(x => (
              <li key={x.miembro.id}>
                <span>{x.miembro.fullName}</span>
                <span className="muted small">P1 <b>{pts(x.p1)}</b> · P2 <b>{pts(x.p2)}</b> · Total <b>{pts(x.p1 + x.p2)}</b></span>
              </li>
            ))}
          </ul>
        </details>
      ))}
      <div className="acciones"><button className="btn" onClick={() => excelEquipo(miembros, id, mk)}>Descargar Excel del equipo</button></div>
    </MarcoModal>
  );
}

function BloquePeriodo({ n, p, rango }: { n: 1 | 2; p: ComisionPeriodo; rango: string }) {
  return (
    <>
      <h3>Periodo {n}</h3>
      {p.gated && <p className="error small">No se le calculará comisión en el Periodo {n}: su compra personal fue {mxn(p.compraLiderPeriodo)}, no alcanzó el mínimo de {mxn(p.minRequerido)} que pide su rango ({rango}) en este periodo.</p>}
      <div className="tabla-desplazable">
        <table className="tabla">
          <thead><tr><th>Línea</th><th className="num">Personas</th><th className="num">Puntos</th><th className="num">Tasa</th><th className="num">Comisión neta</th></tr></thead>
          <tbody>
            {p.resumenLineas.map(r => <tr key={r.linea}><td>{r.linea}</td><td className="num">{r.personas}</td><td className="num">{pts(r.puntos)}</td><td className="num">{r.rate}%</td><td className="num">{mxn(r.comision)}</td></tr>)}
            <tr><td colSpan={4}>Bruto</td><td className="num">{mxn(p.totalBruta)}</td></tr>
            <tr><td colSpan={4}>IVA (16%)</td><td className="num">−{mxn(p.totalIva)}</td></tr>
            <tr><td colSpan={4}><strong>Neto Periodo {n}</strong></td><td className="num"><strong>{mxn(p.totalComision)}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ComisionesLider({ miembros, id, mk, onCerrar }: { miembros: Miembro[]; id: string; mk: string; onCerrar: () => void }) {
  const d = comisionesDelMes(miembros, id, mk);
  if (!d) return null;
  return (
    <MarcoModal titulo={`Comisiones de ${d.lider.fullName} — ${etiquetaMes(mk)}`} onCerrar={onCerrar}>
      <div className="arbol-datos">
        <Dato t="Rango vigente">{d.rangoInfo.rango.label}{d.esManual ? ' (capturado a mano)' : ''}</Dato>
        <Dato t={d.esManual ? 'Rango base' : 'Logrado en'}>{d.esManual ? 'Manual' : etiquetaMes(d.mesBase)}</Dato>
        <Dato t="Personas en el equipo">{d.equipo.length}</Dato>
        <Dato t="Tasas">{tasasTexto(d.rangoInfo.rango.key)}</Dato>
      </div>
      <BloquePeriodo n={1} p={d.periodo1} rango={d.rangoInfo.rango.label} />
      <BloquePeriodo n={2} p={d.periodo2} rango={d.rangoInfo.rango.label} />
      <p className="total-arbol">Total neto a pagar: <strong>{mxn(d.total)}</strong></p>
      <div className="acciones"><button className="btn" onClick={() => excelComisiones(miembros, id, mk)}>Descargar Excel de comisiones</button></div>
    </MarcoModal>
  );
}
