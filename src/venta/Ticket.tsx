import { TIENDA } from './tienda';
import { NOMBRE_METODO } from './carrito';
import type { VentaRegistrada } from './registrarVenta';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Ticket de 80 mm. Se imprime con la impresora del sistema (window.print). */
export function Ticket({ venta: v }: { venta: VentaRegistrada }) {
  const fecha = new Date(v.fechaLocal).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  return (
    <div className="ticket">
      <div className="t-centro">
        <img src="./isotipo.png" alt="" className="t-logo" />
        <div className="t-tienda">{TIENDA.nombre}</div>
        {TIENDA.lineasEncabezado.map(l => (
          <div key={l}>{l}</div>
        ))}
      </div>
      <div className="t-linea" />
      <div className="t-fila"><span>Folio</span><strong>{v.folio}</strong></div>
      <div className="t-fila"><span>Fecha</span><span>{fecha}</span></div>
      <div className="t-fila"><span>Cobró</span><span>{v.cobradoPor.nombre}</span></div>
      <div className="t-fila">
        <span>Cliente</span>
        <span>{v.cliente.nombre}{v.cliente.membresia ? ` (${v.cliente.membresia})` : ''}</span>
      </div>
      <div className="t-linea" />
      {v.lineas.map((l, i) => (
        <div key={i} className="t-art">
          <div>{l.descripcion}{l.codigo ? ` [${l.codigo}]` : ''}</div>
          <div className="t-fila">
            <span>
              {l.cantidad} × {MXN.format(l.precioUnitario)}
              {l.descuentoAplicado > 0 && ` (-${l.descuentoAplicado}%)`}
            </span>
            <span>{MXN.format(l.importe)}</span>
          </div>
        </div>
      ))}
      <div className="t-linea" />
      {v.totales.descuentoMayoreo > 0 && (
        <div className="t-fila"><span>Descuento mayoreo</span><span>-{MXN.format(v.totales.descuentoMayoreo)}</span></div>
      )}
      <div className="t-fila"><span>Subtotal (sin IVA)</span><span>{MXN.format(v.totales.baseSinIva)}</span></div>
      <div className="t-fila"><span>IVA 16%</span><span>{MXN.format(v.totales.iva)}</span></div>
      <div className="t-fila t-total"><span>TOTAL</span><span>{MXN.format(v.totales.total)}</span></div>
      <div className="t-linea" />
      {v.pagos.map((p, i) => (
        <div key={i} className="t-fila">
          <span>{NOMBRE_METODO[p.metodo]}{p.referencia ? ` · Ref. ${p.referencia}` : ''}</span>
          <span>{MXN.format(p.monto)}</span>
        </div>
      ))}
      {v.cambio > 0 && (
        <>
          <div className="t-fila"><span>Recibido</span><span>{MXN.format(v.recibido)}</span></div>
          <div className="t-fila"><span>Cambio</span><span>{MXN.format(v.cambio)}</span></div>
        </>
      )}
      <div className="t-linea" />
      <div className="t-centro">{v.totales.piezas} {v.totales.piezas === 1 ? 'artículo' : 'artículos'}</div>
      <div className="t-centro t-pie">{TIENDA.mensajePie}</div>
    </div>
  );
}
