import { TIENDA } from './tienda';
import { code128B } from './code128';
import { fechaTicket, renglonCantidad, renglonPieza } from './ticketFormato';
import type { MetodoPago } from './carrito';
import type { VentaRegistrada } from './registrarVenta';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const ETIQUETA_PAGO: Record<MetodoPago, string> = {
  efectivo: 'EFECTIVO',
  // En la tienda la terminal bancaria se llama así (igual que en Aronium).
  tarjeta: 'TERMINAL',
  transferencia: 'TRANSFERENCIA',
  gala: 'GALA',
  regalo: 'REGALO',
  souvenir: 'SOUVENIR',
  cambio_fisico: 'CAMBIO FISICO',
  saldo_favor: 'SALDO A FAVOR'
};

/** Renglón con texto a la izquierda e importe cargado a la derecha. */
export function Fila({ izq, der, fuerte }: { izq: string; der: string; fuerte?: boolean }) {
  return (
    <div className={fuerte ? 't-fila t-fuerte' : 't-fila'}>
      <span>{izq}</span>
      <span>{der}</span>
    </div>
  );
}

function CodigoBarras({ texto }: { texto: string }) {
  const anchos = code128B(texto);
  const quieta = 10; // margen en blanco a cada lado que exige el estándar
  const total = anchos.reduce((a, b) => a + b, 0) + quieta * 2;
  let x = quieta;
  const barras = anchos.map((w, i) => {
    const r = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={40} /> : null;
    x += w;
    return r;
  });
  return (
    <svg className="t-barras" viewBox={`0 0 ${total} 40`} preserveAspectRatio="none" role="img" aria-label={`Código de barras ${texto}`}>
      {barras}
    </svg>
  );
}

export type AnchoTicket = 58 | 80;

/** Ticket con el formato de la tienda, para papel de 58 u 80 mm. */
/** Encabezado de la tienda (lema, logo y datos), igual en todos los tickets. */
export function EncabezadoTienda() {
  return (
    <div className="t-centro">
      <div className="t-lema">{TIENDA.lema}</div>
      <img src="./imagotipo-ticket.jpg" alt="" className="t-imagotipo" />
      <div className="t-tienda">{TIENDA.nombre}</div>
      {TIENDA.lineasEncabezado.map(l => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

export function Ticket({ venta: v, ancho = 80 }: { venta: VentaRegistrada; ancho?: AnchoTicket }) {
  const ahorro = Math.round((v.totales.totalEtiqueta - v.totales.total) * 100) / 100;
  const normales = v.lineas.filter(l => !l.garantia);
  const garantias = v.lineas.filter(l => l.garantia);
  return (
    <div className={ancho === 58 ? 'ticket t58' : 'ticket'}>
      {v.estado === 'cancelada' && <div className="t-centro t-fuerte">*** VENTA CANCELADA ***</div>}
      <EncabezadoTienda />
      <div className="t-espacio" />
      <div>N° Recibo: {v.folio}</div>
      <div>{fechaTicket(v.fechaLocal)}</div>
      <div>Usuario: {v.cobradoPor.nombre}</div>
      {v.orden != null && <div>Orden N°: {v.orden}</div>}
      <div className="t-linea" />
      <div className="t-fuerte">Cliente:</div>
      <div>{v.cliente.nombre.toUpperCase()}</div>
      {v.cliente.membresia && <div>{v.cliente.membresia}</div>}
      {v.cliente.codigoTarjeta && <div><span className="t-fuerte">Código:</span> {v.cliente.codigoTarjeta}</div>}
      <div className="t-linea" />
      {normales.map((l, i) => (
        <div key={i} className="t-art">
          <div>{renglonPieza({ categoria: l.categoria, colorOro: l.colorOro, nombre: l.nombre, variante: l.variante })}</div>
          <Fila izq={renglonCantidad(l)} der={MXN.format(l.importe)} />
        </div>
      ))}
      {garantias.length > 0 && (
        <>
          {normales.length > 0 && <div className="t-linea" />}
          <div className="t-centro t-fuerte">GARANTIA</div>
          {garantias.map((l, i) => (
            <div key={i} className="t-art">
              <div>Folio cert.: {l.garantia!.folio} · {l.garantia!.numero === 1 ? '1er' : '2o'} cambio</div>
              <div>{renglonPieza({ categoria: l.categoria, colorOro: l.colorOro, nombre: l.nombre, variante: l.variante })}</div>
              <Fila izq="Precio etiqueta" der={MXN.format(l.precioEtiqueta)} />
              <Fila izq="Diferencia a pagar" der={MXN.format(l.importe)} />
              <div className="t-sangria">Regresa: {l.garantia!.regresada.nombre}{l.garantia!.regresada.codigo ? ` (${l.garantia!.regresada.codigo})` : ''}</div>
            </div>
          ))}
        </>
      )}
      {v.cambioFisico && (
        <>
          <div className="t-linea" />
          <div className="t-centro t-fuerte">CAMBIO FISICO</div>
          {v.cambioFisico.piezas.map((p, i) => (
            <div key={i} className="t-art">
              <div>{renglonPieza({ categoria: p.categoria, colorOro: p.colorOro, nombre: p.nombre, variante: p.variante })}</div>
              <Fila izq={`1 PZ x ${MXN.format(p.precioEtiqueta)}${p.descuento ? ` (-${p.descuento}%)` : ''}`} der={MXN.format(p.valor)} />
            </div>
          ))}
          <Fila izq="Total a favor:" der={MXN.format(v.cambioFisico.valor)} fuerte />
        </>
      )}
      <div className="t-linea" />
      <div>Cantidad de artículos: {v.totales.piezas}</div>
      <div className="t-linea" />
      <Fila izq="Subtotal" der={MXN.format(v.totales.baseSinIva)} />
      <Fila izq="Impuestos 16%:" der={MXN.format(v.totales.iva)} />
      <Fila izq="TOTAL:" der={MXN.format(v.totales.total)} fuerte />
      <div className="t-linea" />
      {v.pagos.map((p, i) => (
        <div key={i}>
          <Fila izq={`${ETIQUETA_PAGO[p.metodo]}:`} der={MXN.format(p.monto)} />
          {p.referencia && <div className="t-sangria">Ref. {p.referencia}</div>}
        </div>
      ))}
      <Fila izq="Recibido:" der={MXN.format(v.recibido)} />
      {v.cambio > 0 && <Fila izq="Cambio:" der={MXN.format(v.cambio)} />}
      {v.saldoAFavor && v.saldoAFavor.guardado > 0 && (
        <>
          <div className="t-linea" />
          <Fila izq="SALDO A FAVOR GUARDADO:" der={MXN.format(v.saldoAFavor.guardado)} fuerte />
        </>
      )}
      {v.saldoAFavor && <Fila izq="Tu saldo a favor:" der={MXN.format(v.saldoAFavor.saldoFinal)} />}
      {v.cancelada && (
        <>
          <div className="t-linea" />
          <div>Cancelada por {v.cancelada.por}: {v.cancelada.motivo}</div>
        </>
      )}
      {ahorro > 0 && (
        <>
          <div className="t-linea" />
          <Fila izq="Ahorraste:" der={MXN.format(ahorro)} fuerte />
        </>
      )}
      <div className="t-espacio" />
      <div className="t-centro">
        <CodigoBarras texto={v.folio} />
        <div>{v.folio}</div>
      </div>
      <div className="t-espacio" />
      {TIENDA.avisosGarantia.map(t => (
        <p key={t} className="t-aviso">"{t}"</p>
      ))}
    </div>
  );
}
