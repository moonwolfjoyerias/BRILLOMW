// Ticket del corte de caja (por caja o general), en papel de 58 u 80 mm.
import { Fila, type AnchoTicket } from '../venta/Ticket';
import { TIENDA } from '../venta/tienda';
import { fechaTicket } from '../venta/ticketFormato';
import { NOMBRE_METODO } from '../venta/carrito';
import { METODOS, textoDiferencia, type ResumenCorte } from './corte';
import type { CierreCaja, MovimientoEfectivo } from './turno';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const $ = (n: number) => MXN.format(n);

export function TicketCorte({
  titulo,
  fecha,
  resumen: c,
  cierre,
  cierres,
  movimientos = [],
  abiertaPor,
  ancho = 80
}: {
  /** "CORTE CAJA 1", "CORTE GENERAL"… */
  titulo: string;
  /** Día del corte, 'YYYY-MM-DD'. */
  fecha: string;
  resumen: ResumenCorte;
  /** Cierre de esta caja (corte final); sin él, el corte es parcial. */
  cierre?: CierreCaja | null;
  /** En el corte general: el cierre de cada caja. */
  cierres?: { nombre: string; cierre: CierreCaja | null }[];
  movimientos?: MovimientoEfectivo[];
  abiertaPor?: string;
  ancho?: AnchoTicket;
}) {
  const final = cierres ? cierres.every(x => x.cierre) : !!cierre;
  return (
    <div className={ancho === 58 ? 'ticket t58' : 'ticket'}>
      <div className="t-centro">
        <div className="t-tienda">{TIENDA.nombre}</div>
        <div className="t-fuerte">{titulo}</div>
        <div>{final ? 'CORTE FINAL' : 'CORTE PARCIAL (caja abierta)'}</div>
      </div>
      <div className="t-espacio" />
      <div>Día: {fecha.split('-').reverse().join('/')}</div>
      <div>Impreso: {fechaTicket(new Date().toISOString())}</div>
      {abiertaPor && <div>Abrió: {abiertaPor}</div>}
      {cierre && <div>Cerró: {cierre.cerradaPor.nombre} · {fechaTicket(cierre.cerradaEnLocal)}</div>}
      <div className="t-linea" />
      <Fila izq="Ventas:" der={String(c.ventas)} />
      <Fila izq="Artículos:" der={String(c.piezas)} />
      {c.primerFolio && <div>Folios: {c.primerFolio} a {c.ultimoFolio}</div>}
      <div className="t-linea" />
      <Fila izq="Precio etiqueta:" der={$(c.totalEtiqueta)} />
      <Fila izq="Descuento mayoreo:" der={`-${$(c.descuentoMayoreo)}`} />
      <Fila izq="Subtotal:" der={$(c.baseSinIva)} />
      <Fila izq="Impuestos 16%:" der={$(c.iva)} />
      <Fila izq="TOTAL VENDIDO:" der={$(c.total)} fuerte />
      <Fila izq="E/L (mayoreo):" der={$(c.totalMayoreo)} />
      <Fila izq="Público general:" der={$(c.totalPublico)} />
      {c.souvenirs > 0 && <Fila izq="Souvenirs:" der={$(c.souvenirs)} />}
      <div className="t-linea" />
      {METODOS.map(m => (
        <Fila key={m} izq={`${NOMBRE_METODO[m].toUpperCase()} (${c.porMetodo[m].pagos}):`} der={$(c.porMetodo[m].monto)} />
      ))}
      {c.referencias.length > 0 && (
        <>
          <div className="t-linea" />
          <div>Referencias:</div>
          {c.referencias.map((r, i) => (
            <div key={i} className="t-sangria">
              {r.metodo === 'tarjeta' ? 'TAR' : 'TRA'} {r.referencia} · {$(r.monto)} · {r.folio.slice(-6)}
            </div>
          ))}
        </>
      )}
      <div className="t-linea" />
      <div className="t-fuerte">EFECTIVO EN CAJA</div>
      <Fila izq="Fondo inicial:" der={$(c.fondoInicial)} />
      <Fila izq="Ventas en efectivo:" der={$(c.porMetodo.efectivo.monto)} />
      <Fila izq="Entradas:" der={$(c.ingresos)} />
      <Fila izq="Salidas:" der={`-${$(c.retiros)}`} />
      <Fila izq="Esperado:" der={$(c.efectivoEsperado)} fuerte />
      {movimientos.map(m => (
        <div key={m.id} className="t-sangria">
          {m.tipo === 'retiro' ? 'Salida' : 'Entrada'} {$(m.monto)} · {m.motivo}
        </div>
      ))}
      {cierre && (
        <>
          <Fila izq="Contado:" der={$(cierre.efectivoContado)} fuerte />
          <div className="t-fuerte">{textoDiferencia(cierre.diferencia, $).toUpperCase()}</div>
          {cierre.nota && <div>Nota: {cierre.nota}</div>}
        </>
      )}
      {cierres && (
        <>
          <div className="t-linea" />
          {cierres.map(x => (
            <div key={x.nombre}>
              {x.nombre}:{' '}
              {x.cierre ? `contado ${$(x.cierre.efectivoContado)} · ${textoDiferencia(x.cierre.diferencia, $)}` : 'sin cerrar'}
            </div>
          ))}
        </>
      )}
      <div className="t-espacio" />
      <div className="t-espacio" />
      <div className="t-centro">______________________</div>
      <div className="t-centro">Firma</div>
    </div>
  );
}
