// Corte del día: por caja y general. Mientras la caja está abierta se ve el
// corte parcial en vivo; al cerrarla se cuenta el efectivo y queda el corte
// final (esperado contra contado). También aquí se registran las entradas y
// salidas de efectivo durante el día.
import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../firebase';
import type { PerfilUsuario } from '../sesion/perfil';
import { CAJAS, fechaLocal, leerMonto, nombreCaja, type IdCaja, type TurnoCaja } from '../caja/turno';
import { cerrarCaja, registrarMovimiento, useTurnosDelDia, useVentasDelDia } from '../caja/turnos';
import { metodosDelCorte, calcularCorte, diferenciaCierre, sumarCortes, textoDiferencia, type ResumenCorte } from '../caja/corte';
import { TicketCorte } from '../caja/TicketCorte';
import { NOMBRE_METODO } from '../venta/carrito';
import type { VentaRegistrada } from '../venta/registrarVenta';
import type { AnchoTicket } from '../venta/Ticket';
import { anchoGuardado, guardarAncho, imprimirTicket } from '../venta/imprimir';
import { MarcoModal, useEnvio } from './Modal';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const $ = (n: number) => MXN.format(n);
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

type Impresion = { titulo: string; resumen: ResumenCorte; turno?: TurnoCaja; general?: { nombre: string; turno?: TurnoCaja }[] };

export function Corte({ perfil }: { perfil: PerfilUsuario }) {
  const hoy = fechaLocal();
  const turnos = useTurnosDelDia(hoy);
  const ventas = useVentasDelDia(hoy);
  const [cerrando, setCerrando] = useState<IdCaja | null>(null);
  const [movimiento, setMovimiento] = useState<IdCaja | null>(null);
  const [imprimir, setImprimir] = useState<Impresion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (turnos.estado === 'cargando' || ventas.estado === 'cargando') return <p className="muted">Calculando el corte…</p>;
  if (turnos.estado === 'error' || ventas.estado === 'error') return <p className="error" role="alert">No se pudo consultar el corte. Revisa la conexión.</p>;

  const todas = ventas.ventas;
  const filas = CAJAS.map(c => {
    const turno = turnos.turnos.find(t => t.caja === c.id);
    const propias = todas.filter(v => v.caja === c.id);
    return { caja: c.id, nombre: c.nombre, turno, ventas: propias, resumen: turno ? calcularCorte(turno, propias) : null };
  });
  const abiertas = filas.filter(f => f.resumen);
  const general = sumarCortes(abiertas.map(f => f.resumen!));
  const listo = (m: string) => {
    setAviso(m);
    setTimeout(() => setAviso(null), 6000);
  };

  return (
    <>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <div className="cortes">
        {filas.map(f => (
          <article key={f.caja} className={f.turno?.estado === 'cerrada' ? 'tarjeta-caja' : 'tarjeta-caja abierta'}>
            <header>
              <h2>{f.nombre}</h2>
              <span className={!f.turno ? 'chip agotado' : f.turno.estado === 'abierta' ? 'chip ok' : 'chip neutro'}>
                {!f.turno ? 'Sin abrir' : f.turno.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
              </span>
            </header>
            {!f.turno || !f.resumen ? (
              <p className="muted">Esta caja no se abrió hoy.</p>
            ) : (
              <>
                <p className="muted small">
                  Abrió {f.turno.abiertaPor.nombre}{f.turno.abiertaEn ? ` a las ${hora(f.turno.abiertaEn)}` : ''}
                  {f.turno.cierre ? ` · cerró ${f.turno.cierre.cerradaPor.nombre} a las ${hora(f.turno.cierre.cerradaEnLocal)}` : ''}
                </p>
                <Resumen r={f.resumen} />
                {f.turno.movimientos.length > 0 && (
                  <ul className="historial movimientos">
                    {f.turno.movimientos.map(m => (
                      <li key={m.id}>
                        <strong>{m.tipo === 'retiro' ? 'Salida' : 'Entrada'} de {$(m.monto)}</strong> · {m.motivo}
                        <span className="muted small bloque">{m.por.nombre} · {hora(m.fecha)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {f.turno.cierre && (
                  <dl className="totales cierre">
                    <dt>Efectivo contado</dt>
                    <dd>{$(f.turno.cierre.efectivoContado)}</dd>
                    <dt className="total">Resultado</dt>
                    <dd className={f.turno.cierre.diferencia < 0 ? 'total peligro-texto' : 'total'}>{textoDiferencia(f.turno.cierre.diferencia, $)}</dd>
                    {f.turno.cierre.nota && <><dt>Nota</dt><dd>{f.turno.cierre.nota}</dd></>}
                  </dl>
                )}
                <div className="acciones">
                  <button className="btn" onClick={() => setImprimir({ titulo: `CORTE ${f.nombre.toUpperCase()}`, resumen: f.resumen!, turno: f.turno })}>
                    {f.turno.estado === 'abierta' ? 'Imprimir corte parcial' : 'Reimprimir corte'}
                  </button>
                  {f.turno.estado === 'abierta' && (
                    <>
                      <button className="btn" onClick={() => setMovimiento(f.caja)}>Entrada / salida de efectivo</button>
                      <button className="btn primario" onClick={() => setCerrando(f.caja)}>Cerrar caja</button>
                    </>
                  )}
                </div>
              </>
            )}
          </article>
        ))}
      </div>

      <article className="tarjeta-caja corte-general">
        <header>
          <h2>Corte general del día</h2>
          <span className={abiertas.length && abiertas.every(f => f.turno?.estado === 'cerrada') ? 'chip neutro' : 'chip ok'}>
            {!abiertas.length ? 'Sin cajas abiertas' : abiertas.every(f => f.turno?.estado === 'cerrada') ? 'Final' : 'Parcial'}
          </span>
        </header>
        <Resumen r={general} />
        {general.referencias.length > 0 && (
          <details className="referencias">
            <summary>Referencias de tarjeta y transferencia ({general.referencias.length})</summary>
            <ul className="historial">
              {general.referencias.map((r, i) => (
                <li key={i}>
                  <strong>{NOMBRE_METODO[r.metodo]} {r.referencia}</strong> · {$(r.monto)}
                  <span className="muted small bloque">Recibo {r.folio}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="acciones">
          <button
            className="btn"
            disabled={!abiertas.length}
            onClick={() => setImprimir({ titulo: 'CORTE GENERAL', resumen: general, general: filas.filter(f => f.turno).map(f => ({ nombre: f.nombre, turno: f.turno })) })}
          >
            Imprimir corte general
          </button>
        </div>
      </article>

      {cerrando && (
        <CerrarCaja
          caja={cerrando}
          fecha={hoy}
          turno={filas.find(f => f.caja === cerrando)!.turno!}
          ventas={todas}
          perfil={perfil}
          onListo={(m, turno) => {
            setCerrando(null);
            listo(m);
            const r = calcularCorte(turno, todas.filter(v => v.caja === turno.caja));
            setImprimir({ titulo: `CORTE ${nombreCaja(turno.caja).toUpperCase()}`, resumen: r, turno });
          }}
          onCerrar={() => setCerrando(null)}
        />
      )}
      {movimiento && (
        <Movimiento caja={movimiento} fecha={hoy} perfil={perfil} onListo={m => { setMovimiento(null); listo(m); }} onCerrar={() => setMovimiento(null)} />
      )}
      {imprimir && <ImprimirCorte datos={imprimir} fecha={hoy} turnos={turnos.turnos} onCerrar={() => setImprimir(null)} />}
    </>
  );
}

function Resumen({ r }: { r: ResumenCorte }) {
  return (
    <dl className="totales">
      <dt>Ventas</dt>
      <dd>{r.ventas} · {r.piezas} art.</dd>
      {r.descuentoMayoreo > 0 && (
        <>
          <dt>Descuento mayoreo</dt>
          <dd>−{$(r.descuentoMayoreo)}</dd>
        </>
      )}
      <dt className="muted small">IVA incluido (16%)</dt>
      <dd className="muted small">{$(r.iva)}</dd>
      <dt className="total">Total vendido</dt>
      <dd className="total">{$(r.total)}</dd>
      {metodosDelCorte(r).map(m => (
        <div key={m} className="contenido-par">
          <dt>{NOMBRE_METODO[m]} ({r.porMetodo[m].pagos})</dt>
          <dd>{$(r.porMetodo[m].monto)}</dd>
        </div>
      ))}
      <dt>Fondo inicial</dt>
      <dd>{$(r.fondoInicial)}</dd>
      {(r.ingresos > 0 || r.retiros > 0) && (
        <>
          <dt>Entradas / salidas</dt>
          <dd>+{$(r.ingresos)} / −{$(r.retiros)}</dd>
        </>
      )}
      <dt className="total">Efectivo esperado</dt>
      <dd className="total">{$(r.efectivoEsperado)}</dd>
    </dl>
  );
}

function CerrarCaja({ caja, fecha, turno, ventas, perfil, onListo, onCerrar }: {
  caja: IdCaja;
  fecha: string;
  turno: TurnoCaja;
  ventas: VentaRegistrada[];
  perfil: PerfilUsuario;
  onListo: (m: string, turno: TurnoCaja) => void;
  onCerrar: () => void;
}) {
  const [contado, setContado] = useState('');
  const [nota, setNota] = useState('');
  const [revisar, setRevisar] = useState<number | null>(null);
  const { enviando, error, setError, enviar } = useEnvio();
  const resumen = calcularCorte(turno, ventas.filter(v => v.caja === caja));
  const monto = leerMonto(contado);
  const dif = monto === null || contado.trim() === '' ? null : diferenciaCierre(monto, resumen.efectivoEsperado);

  function continuar(e: FormEvent) {
    e.preventDefault();
    if (contado.trim() === '' || monto === null) return setError('Escribe el efectivo que contaste, por ejemplo 1,250.50.');
    if (dif !== 0 && !nota.trim()) return setError('No cuadra: escribe una nota que explique la diferencia.');
    setError(null);
    setRevisar(monto);
  }

  function cerrar() {
    void enviar(async () => {
      const err = await cerrarCaja(db, caja, fecha, ventas, revisar!, nota, perfil);
      if (err) {
        setRevisar(null);
        return err;
      }
      onListo(`${nombreCaja(caja)} cerrada. ${textoDiferencia(dif ?? 0, $)}.`, {
        ...turno,
        estado: 'cerrada',
        cierre: {
          cerradaPor: { uid: perfil.uid, nombre: perfil.nombre, rol: perfil.rol },
          cerradaEnLocal: new Date().toISOString(),
          efectivoContado: revisar!,
          efectivoEsperado: resumen.efectivoEsperado,
          diferencia: dif ?? 0,
          nota: nota.trim()
        }
      });
      return null;
    });
  }

  return (
    <MarcoModal titulo={`Cerrar ${nombreCaja(caja)}`} onCerrar={onCerrar} enviando={enviando} onEnviar={continuar}>
      <Resumen r={resumen} />
      {revisar === null ? (
        <>
          <label className="campo">
            <span>Efectivo contado en caja</span>
            <input inputMode="decimal" value={contado} onChange={e => setContado(e.target.value)} placeholder="0.00" autoFocus />
          </label>
          {dif !== null && (
            <p className={dif === 0 ? 'resumen-cobro' : 'resumen-cobro falta'}>{textoDiferencia(dif, $)}</p>
          )}
          <label className="campo">
            <span>Nota {dif !== null && dif !== 0 ? '(obligatoria si no cuadra)' : '(opcional)'}</span>
            <textarea rows={2} value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. Se dio cambio de más en una venta." />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button type="submit" className="btn primario">Revisar cierre</button>
          </div>
        </>
      ) : (
        <div className="confirmar-peligro">
          <p>
            ¿Cerrar <strong>{nombreCaja(caja)}</strong> con <strong>{$(revisar)}</strong> contados? Esperado {$(resumen.efectivoEsperado)}:{' '}
            <strong>{textoDiferencia(dif ?? 0, $)}</strong>. Después de cerrarla ya no se puede cobrar en esta caja hoy.
          </p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="acciones">
            <button type="button" className="btn" onClick={() => setRevisar(null)} disabled={enviando}>Corregir</button>
            <button type="button" className="btn peligro-lleno" onClick={cerrar} disabled={enviando}>{enviando ? 'Cerrando…' : 'Sí, cerrar caja'}</button>
          </div>
        </div>
      )}
    </MarcoModal>
  );
}

function Movimiento({ caja, fecha, perfil, onListo, onCerrar }: { caja: IdCaja; fecha: string; perfil: PerfilUsuario; onListo: (m: string) => void; onCerrar: () => void }) {
  const [tipo, setTipo] = useState<'retiro' | 'ingreso'>('retiro');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const { enviando, error, enviar } = useEnvio();
  function guardar(e: FormEvent) {
    e.preventDefault();
    const m = leerMonto(monto) ?? -1;
    void enviar(async () => {
      const err = await registrarMovimiento(db, caja, fecha, { tipo, monto: monto.trim() ? m : 0, motivo }, perfil);
      if (err) return err;
      onListo(`${tipo === 'retiro' ? 'Salida' : 'Entrada'} de ${$(m)} registrada en ${nombreCaja(caja)}.`);
      return null;
    });
  }
  return (
    <MarcoModal titulo={`Efectivo · ${nombreCaja(caja)}`} onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <label className="campo">
        <span>Movimiento</span>
        <select value={tipo} onChange={e => setTipo(e.target.value as 'retiro' | 'ingreso')}>
          <option value="retiro">Salida de efectivo (retiro, pago, depósito al banco)</option>
          <option value="ingreso">Entrada de efectivo (más cambio)</option>
        </select>
      </label>
      <label className="campo"><span>Monto</span><input inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" autoFocus /></label>
      <label className="campo"><span>Motivo</span><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Pago a proveedor de bolsas" /></label>
      <p className="muted small">Queda registrado a nombre de {perfil.nombre} y entra en el corte de esta caja.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Registrar'}</button>
      </div>
    </MarcoModal>
  );
}

function ImprimirCorte({ datos, fecha, turnos, onCerrar }: { datos: Impresion; fecha: string; turnos: TurnoCaja[]; onCerrar: () => void }) {
  const [ancho, setAncho] = useState<AnchoTicket>(anchoGuardado);
  // El turno más reciente (por si se acaba de cerrar y la suscripción ya lo trajo).
  const turno = datos.turno ? turnos.find(t => t.id === datos.turno!.id && t.cierre) ?? datos.turno : undefined;
  const ticket = (
    <TicketCorte
      titulo={datos.titulo}
      fecha={fecha}
      resumen={datos.resumen}
      cierre={turno?.cierre}
      movimientos={turno ? turno.movimientos : turnos.flatMap(t => t.movimientos)}
      abiertaPor={turno?.abiertaPor.nombre}
      cierres={datos.general?.map(g => ({ nombre: g.nombre, cierre: turnos.find(t => t.id === g.turno?.id)?.cierre ?? null }))}
      ancho={ancho}
    />
  );
  return (
    <MarcoModal titulo="Imprimir corte" onCerrar={onCerrar}>
      <div className="ticket-vista">{ticket}</div>
      <div className="acciones">
        <label className="campo-en-linea">
          <span>Papel</span>
          <select value={ancho} onChange={e => { const a = Number(e.target.value) as AnchoTicket; setAncho(a); guardarAncho(a); }}>
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </label>
        <button className="btn primario" onClick={() => imprimirTicket(ancho)} autoFocus>Imprimir</button>
      </div>
      {createPortal(<div className="ticket-impresion" aria-hidden="true">{ticket}</div>, document.body)}
    </MarcoModal>
  );
}
