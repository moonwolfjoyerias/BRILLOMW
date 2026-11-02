// Saldo a favor de una e/l en la caja: cuánto tiene, de dónde salió,
// imprimir su ticket y (Encargado/Admin) agregar saldo que no viene de una
// venta, por ejemplo una transferencia.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import type { ClienteVenta } from '../venta/carrito';
import { leerMonto } from '../caja/turno';
import { EncabezadoTienda, Fila, type AnchoTicket } from '../venta/Ticket';
import { fechaTicket } from '../venta/ticketFormato';
import { anchoGuardado } from '../venta/imprimir';
import {
  abonarSaldo,
  abonosRecientes,
  leerMovimientosSaldo,
  origenDe,
  ORIGENES_SALDO,
  puedeAbonarSaldo,
  type MovimientoSaldo,
  type OrigenSaldo
} from '../venta/saldoAFavor';
import { MarcoModal, useEnvio } from './Modal';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function TicketSaldoAFavor({ cliente, saldo, movimientos, confirmo, ancho }: {
  cliente: ClienteVenta;
  saldo: number;
  movimientos: MovimientoSaldo[];
  /** Usuario que confirma el saldo al imprimir. */
  confirmo: string;
  ancho: AnchoTicket;
}) {
  const abonos = abonosRecientes(movimientos);
  return (
    <div className={ancho === 58 ? 'ticket t58' : 'ticket'}>
      <EncabezadoTienda />
      <div className="t-espacio" />
      <div className="t-centro t-fuerte">SALDO A FAVOR</div>
      <div>Fecha: {fechaTicket(new Date().toISOString())}</div>
      <div className="t-linea" />
      <div className="t-fuerte">{cliente.nombre.toUpperCase()}</div>
      {cliente.membresia && <div>Membresía: {cliente.membresia}</div>}
      <div className="t-linea" />
      <div className="t-fuerte">Cómo tiene saldo a favor:</div>
      {abonos.length ? (
        abonos.map(m => (
          <div key={m.id} className="t-art">
            <Fila izq={ORIGENES_SALDO[origenDe(m) ?? 'otro']} der={MXN.format(m.monto)} />
            <div>{fechaTicket(m.fecha)}{m.folio ? ` · Ticket ${m.folio}` : ''}{m.referencia ? ` · Ref. ${m.referencia}` : ''}</div>
            {m.nota && <div>{m.nota}</div>}
            <div>Registró: {m.por}</div>
          </div>
        ))
      ) : (
        <div>Sin movimientos registrados.</div>
      )}
      <div className="t-linea" />
      <Fila izq="SALDO DISPONIBLE:" der={MXN.format(saldo)} fuerte />
      <div className="t-espacio" />
      <div>Confirmó: {confirmo}</div>
      <div className="t-espacio" />
      <div>Firma: ______________________</div>
    </div>
  );
}

export function SaldoAFavorModal({ cliente, saldo, perfil, onImprimir, onCerrar }: {
  cliente: ClienteVenta;
  saldo: number;
  perfil: PerfilUsuario;
  onImprimir: (ticket: ReactNode) => void;
  onCerrar: () => void;
}) {
  const [movs, setMovs] = useState<MovimientoSaldo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const personaId = cliente.personaId!;

  useEffect(() => {
    let vivo = true;
    leerMovimientosSaldo(db, personaId)
      .then(m => vivo && setMovs(m))
      .catch(() => vivo && setError('No se pudieron leer los movimientos. Revisa la conexión.'));
    return () => { vivo = false; };
  }, [personaId, saldo]);

  const ordenados = (movs ?? []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <MarcoModal titulo={`Saldo a favor · ${cliente.nombre}`} onCerrar={onCerrar}>
      <p className="saldo-grande">{MXN.format(saldo)} <span className="muted small">disponible</span></p>
      {error && <p className="error">{error}</p>}
      {!movs && !error && <p className="muted">Cargando movimientos…</p>}
      {movs && (
        ordenados.length ? (
          <ul className="lineas">
            {ordenados.slice(0, 12).map(m => (
              <li key={m.id} className="linea">
                <div>
                  <strong>{m.tipo === 'abono' ? ORIGENES_SALDO[origenDe(m) ?? 'otro'] : m.tipo === 'uso' ? 'Se usó en una compra' : 'Ajuste'}</strong>
                  <span className="muted small bloque">
                    {fechaTicket(m.fecha)}{m.folio ? ` · Ticket ${m.folio}` : ''}{m.referencia ? ` · Ref. ${m.referencia}` : ''} · {m.por}{m.nota ? ` · ${m.nota}` : ''}
                  </span>
                </div>
                <strong className="linea-importe">{m.tipo === 'uso' ? '−' : '+'}{MXN.format(m.monto)}</strong>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Todavía no tiene movimientos de saldo a favor.</p>
      )}
      {agregando ? (
        <AgregarSaldo cliente={cliente} perfil={perfil} onListo={() => setAgregando(false)} />
      ) : (
        <div className="acciones">
          {puedeAbonarSaldo(perfil.rol) && <button className="btn" onClick={() => setAgregando(true)}>+ Agregar saldo a favor</button>}
          <button
            className="btn primario"
            disabled={!movs}
            onClick={() => onImprimir(<TicketSaldoAFavor cliente={cliente} saldo={saldo} movimientos={movs ?? []} confirmo={perfil.nombre} ancho={anchoGuardado()} />)}
          >
            Imprimir ticket de saldo a favor
          </button>
        </div>
      )}
    </MarcoModal>
  );
}

function AgregarSaldo({ cliente, perfil, onListo }: { cliente: ClienteVenta; perfil: PerfilUsuario; onListo: () => void }) {
  const [monto, setMonto] = useState('');
  const [origen, setOrigen] = useState<OrigenSaldo>('transferencia');
  const [referencia, setReferencia] = useState('');
  const [nota, setNota] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  function guardar(e: FormEvent) {
    e.preventDefault();
    const m = leerMonto(monto);
    if (m === null || m <= 0) return setError('Escribe un monto mayor a 0.');
    void enviar(async () => {
      const err = await abonarSaldo(db, { personaId: cliente.personaId!, nombre: cliente.nombre, monto: m, origen, referencia, nota }, perfil, equipoActual());
      if (!err) onListo();
      return err;
    });
  }
  return (
    <form className="formulario-saldo" onSubmit={guardar}>
      <h3>Agregar saldo a favor</h3>
      <div className="rejilla-form">
        <label className="campo"><span>Monto *</span><input inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} autoFocus /></label>
        <label className="campo">
          <span>Cómo tiene el saldo *</span>
          <select value={origen} onChange={e => setOrigen(e.target.value as OrigenSaldo)}>
            {(Object.keys(ORIGENES_SALDO) as OrigenSaldo[]).map(o => <option key={o} value={o}>{ORIGENES_SALDO[o]}</option>)}
          </select>
        </label>
        {origen === 'transferencia' && <label className="campo"><span>Referencia *</span><input value={referencia} onChange={e => setReferencia(e.target.value)} /></label>}
        <label className="campo ancho-3"><span>Nota{origen === 'otro' ? ' *' : ''}</span><input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. devolución acordada con Administración" /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="button" className="btn" onClick={onListo} disabled={enviando}>Volver</button>
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar saldo'}</button>
      </div>
    </form>
  );
}
