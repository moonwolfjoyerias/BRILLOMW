// Piezas extra de la caja: cambio físico (con su preticket), cambios
// abiertos, garantías (primer y segundo cambio), ticket falso/presupuesto y
// ticket de verificación. La venta misma vive en Vender.tsx.
import { useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import type { Producto } from '../pagina/producto';
import { etiquetaVariante } from '../pagina/producto';
import { leerMonto } from '../caja/turno';
import { calcularTotales, precioUnitario, type ClienteVenta, type LineaCarrito } from '../venta/carrito';
import { piezaDeCambio, piezaManual, valorCambio, type CambioFisico, type PiezaCambio } from '../venta/cambios';
import { COL_GARANTIAS, lineaDeGarantia, normalizarFolio, piezaGarantia, validarCambio, valorPara, type Garantia, type PiezaGarantia } from '../venta/garantias';
import { descartarCambio, guardarCambio } from '../venta/accionesVenta';
import { EncabezadoTienda, Fila, type AnchoTicket } from '../venta/Ticket';
import { fechaTicket, renglonPieza } from '../venta/ticketFormato';
import { doc, getDoc } from '../datos/firestore';
import { BotonCamara } from '../escaner/EscanerQR';
import { limpiarCodigo } from '../pagina/codigoProducto';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Productos con ese código exacto (lo que lleva el QR). Normalmente uno; si se repite, se pregunta cuál. */
export const porCodigo = (productos: Producto[], codigo: string) => {
  const c = normal(codigo);
  return c ? productos.filter(p => p.codigo && normal(p.codigo) === c) : [];
};

/** Campo "código de la pieza": escanear o escribir, y elegir variante si tiene varias. */
function CampoPieza({ etiqueta, productos, soloConExistencias, onPieza, autoFocus }: {
  etiqueta: string;
  productos: Producto[];
  soloConExistencias?: boolean;
  onPieza: (p: Producto, varianteId: string) => void;
  autoFocus?: boolean;
}) {
  const [codigo, setCodigo] = useState('');
  const [elegir, setElegir] = useState<Producto | null>(null);
  const [repetidos, setRepetidos] = useState<Producto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tomar = (e: FormEvent) => {
    e.preventDefault();
    buscar(codigo);
  };
  const buscar = (texto: string) => {
    const encontrados = porCodigo(productos, texto);
    if (!encontrados.length) return setError('No hay ningún producto con ese código.');
    if (encontrados.length > 1) {
      setError(null);
      return setRepetidos(encontrados);
    }
    usar(encontrados[0]);
  };
  const usar = (p: Producto) => {
    setRepetidos([]);
    const vs = p.variantes.filter(v => !soloConExistencias || v.stock > 0);
    if (!vs.length) return setError('Ese producto ya no tiene existencias.');
    setError(null);
    if (vs.length === 1) {
      onPieza(p, vs[0].id);
      setCodigo('');
    } else setElegir(p);
  };
  return (
    <form className="campo-pieza" onSubmit={tomar}>
      <label className="campo">
        <span>{etiqueta}</span>
        <span className="en-linea">
          <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Escanea o escribe el código" autoFocus={autoFocus} />
          <BotonCamara titulo={etiqueta} onCodigo={t => { const c = limpiarCodigo(t); setCodigo(c); buscar(c); }} />
          <button className="btn" type="submit">Agregar</button>
        </span>
      </label>
      {repetidos.length > 0 && (
        <div className="variantes-eleccion">
          <span className="muted small">Ese código lo tienen varios productos: ¿cuál es?</span>
          {repetidos.map(p => <button type="button" key={p.id} className="btn mini" onClick={() => usar(p)}>{p.nombre}</button>)}
        </div>
      )}
      {elegir && (
        <div className="variantes-eleccion">
          <span className="muted small">{elegir.nombre}: elige la variante</span>
          {elegir.variantes.filter(v => !soloConExistencias || v.stock > 0).map(v => (
            <button type="button" key={v.id} className="btn mini" onClick={() => { onPieza(elegir, v.id); setElegir(null); setCodigo(''); }}>
              {etiquetaVariante(v) || 'Única'}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </form>
  );
}

// ------------------------------------------------------------ cambio físico

/** Arma o edita el cambio físico de la e/l. Se guarda abierto hasta cerrar la venta. */
export function CambioFisicoModal({ cliente, inicial, productos, perfil, onGuardado, onCerrar, onImprimir }: {
  cliente: ClienteVenta;
  inicial: { id: string | null; piezas: PiezaCambio[] };
  productos: Producto[];
  perfil: PerfilUsuario;
  onGuardado: (c: { id: string; piezas: PiezaCambio[] } | null) => void;
  onCerrar: () => void;
  onImprimir: (piezas: PiezaCambio[]) => void;
}) {
  const [piezas, setPiezas] = useState<PiezaCambio[]>(inicial.piezas);
  const [manual, setManual] = useState(false);
  const [m, setM] = useState({ nombre: '', precio: '', descuento: '60' });
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const total = valorCambio(piezas);

  async function guardar(imprimir: boolean) {
    setEnviando(true);
    // El id se fija aquí para que el siguiente guardado actualice el mismo cambio.
    const r = await guardarCambio(db, { id: inicial.id, cliente, piezas }, perfil, equipoActual());
    setEnviando(false);
    if (r.error) return setError(r.error);
    if (imprimir) onImprimir(piezas);
    onGuardado({ id: r.id, piezas });
  }

  return (
    <div className="modal-fondo">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Cambio físico">
        <div className="modal-cabeza">
          <h2>Cambio físico · {cliente.nombre}</h2>
          <button className="btn" onClick={onCerrar} disabled={enviando}>Cerrar</button>
        </div>
        <p className="muted small">Solo piezas intactas y con etiqueta. Cada pieza vale su precio de hoy con su descuento. El cambio queda abierto hasta cerrar la venta: se pueden agregar más piezas.</p>
        <CampoPieza etiqueta="Pieza que deja" productos={productos} onPieza={(p, v) => setPiezas(x => [...x, piezaDeCambio(p, v)])} autoFocus />
        {!manual ? (
          <button className="btn mini" onClick={() => setManual(true)}>La pieza ya no está en el catálogo</button>
        ) : (
          <form className="fila-manual" onSubmit={e => {
            e.preventDefault();
            const precio = leerMonto(m.precio);
            const desc = Number(m.descuento);
            if (!m.nombre.trim() || precio === null || precio <= 0) return setError('Escribe el nombre y el precio etiqueta de la pieza.');
            if (!Number.isFinite(desc) || desc < 0 || desc > 100) return setError('El descuento va de 0 a 100.');
            setPiezas(x => [...x, piezaManual(m.nombre, precio, desc)]);
            setM({ nombre: '', precio: '', descuento: m.descuento });
            setError(null);
          }}>
            <input placeholder="Nombre de la pieza" value={m.nombre} onChange={e => setM({ ...m, nombre: e.target.value })} />
            <input placeholder="Precio etiqueta" inputMode="decimal" value={m.precio} onChange={e => setM({ ...m, precio: e.target.value })} />
            <input placeholder="% desc." inputMode="numeric" value={m.descuento} onChange={e => setM({ ...m, descuento: e.target.value })} aria-label="Descuento" />
            <button className="btn" type="submit">Agregar</button>
          </form>
        )}
        <ul className="lineas">
          {piezas.map(p => (
            <li key={p.clave} className="linea">
              <div className="linea-desc">
                <strong>{p.nombre}{p.variante ? ` · ${p.variante}` : ''}</strong>
                <span className="muted small">{p.codigo || 'Fuera de catálogo (no regresa al inventario)'} · {dinero(p.precioEtiqueta)}{p.descuento ? ` −${p.descuento}%` : ''}</span>
              </div>
              <strong className="linea-importe">{dinero(p.valor)}</strong>
              <button className="btn mini" onClick={() => setPiezas(x => x.filter(y => y.clave !== p.clave))}>Quitar</button>
            </li>
          ))}
          {!piezas.length && <li className="muted vacio">Escanea las piezas que deja.</li>}
        </ul>
        <dl className="totales"><dt className="total">A su favor</dt><dd className="total">{dinero(total)}</dd></dl>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button className="btn" disabled={enviando || !piezas.length} onClick={() => void guardar(false)}>Guardar</button>
          <button className="btn primario" disabled={enviando || !piezas.length} onClick={() => void guardar(true)}>{enviando ? 'Guardando…' : 'Guardar e imprimir preticket'}</button>
        </div>
      </div>
    </div>
  );
}

/** Cambios físicos que siguen abiertos: se retoman al cerrar la venta de esa e/l. */
export function CambiosAbiertosModal({ cambios, perfil, onRetomar, onCerrar }: {
  cambios: CambioFisico[];
  perfil: PerfilUsuario;
  onRetomar: (c: CambioFisico) => void;
  onCerrar: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Cambios físicos abiertos" onClick={e => e.stopPropagation()}>
        <div className="modal-cabeza">
          <h2>Cambios físicos abiertos</h2>
          <button className="btn" onClick={onCerrar}>Cerrar</button>
        </div>
        {error && <p className="error">{error}</p>}
        <ul className="lineas">
          {cambios.map(c => (
            <li key={c.id} className="linea">
              <div className="linea-desc">
                <strong>{c.cliente.nombre}{c.cliente.membresia ? ` · ${c.cliente.membresia}` : ''}</strong>
                <span className="muted small">{c.piezas.length} pieza(s) · {fechaTicket(c.actualizadoEn)} · por {c.creadoPor.nombre}</span>
              </div>
              <strong className="linea-importe">{dinero(valorCambio(c.piezas))}</strong>
              <span className="acciones-fila">
                <button className="btn mini primario" onClick={() => onRetomar(c)}>Retomar</button>
                <button className="btn mini peligro" onClick={async () => {
                  if (!window.confirm(`¿Descartar el cambio físico de ${c.cliente.nombre}? Úsalo solo si se registró por error.`)) return;
                  setError(await descartarCambio(db, c, perfil, equipoActual()));
                }}>Descartar</button>
              </span>
            </li>
          ))}
          {!cambios.length && <li className="muted vacio">No hay cambios físicos abiertos.</li>}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ garantía

/** Garantía desde la caja: primer o segundo cambio. Agrega una línea a la venta. */
export function GarantiaModal({ cliente, productos, onAgregar, onCerrar }: {
  cliente: ClienteVenta;
  productos: Producto[];
  onAgregar: (l: LineaCarrito, cliente: ClienteVenta) => string | null;
  onCerrar: () => void;
}) {
  const [numero, setNumero] = useState<1 | 2>(1);
  const [folio, setFolio] = useState('');
  const [previa, setPrevia] = useState<Garantia | null>(null);
  const [regresada, setRegresada] = useState<PiezaGarantia | null>(null);
  const [manual, setManual] = useState({ nombre: '', precio: '', descuento: cliente.tipo === 'publico' ? '0' : '60' });
  const [nueva, setNueva] = useState<{ p: Producto; v: string } | null>(null);
  const [confirmada, setConfirmada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  const clienteG = numero === 2 && previa ? previa.cliente : cliente;
  const valorOriginal = numero === 2 && previa ? previa.valorOriginal : regresada?.valor ?? null;
  const linea = nueva && regresada && valorOriginal !== null ? lineaDeGarantia(nueva.p, nueva.v, normalizarFolio(folio), numero, regresada, valorOriginal, clienteG) : null;

  function cambiarNumero(n: 1 | 2) {
    setNumero(n);
    setPrevia(null);
    setRegresada(null);
    setNueva(null);
    setConfirmada(false);
    setError(null);
  }

  async function buscarFolio() {
    const f = normalizarFolio(folio);
    if (!f) return setError('Escribe el folio del certificado.');
    setBuscando(true);
    try {
      const s = await getDoc(doc(db, COL_GARANTIAS, f));
      const g = s.exists() ? (s.data() as Garantia) : null;
      const err = validarCambio(numero, g, numero === 2 && g ? g.cambios[g.cambios.length - 1].nueva.codigo : '');
      if (err) return setError(err);
      setError(null);
      if (numero === 2 && g) {
        setPrevia(g);
        setRegresada(g.cambios[g.cambios.length - 1].nueva);
      } else setPrevia(null);
    } catch {
      setError('No se pudo consultar el folio. Revisa la conexión.');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="modal-fondo">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Garantía">
        <div className="modal-cabeza">
          <h2>Garantía</h2>
          <button className="btn" onClick={onCerrar}>Cerrar</button>
        </div>
        <nav className="pestanas" aria-label="Tipo de cambio">
          <button className={numero === 1 ? 'nav-boton activo' : 'nav-boton'} onClick={() => cambiarNumero(1)}>Primer cambio</button>
          <button className={numero === 2 ? 'nav-boton activo' : 'nav-boton'} onClick={() => cambiarNumero(2)}>Segundo cambio</button>
        </nav>
        <label className="campo">
          <span>Folio del certificado de garantía</span>
          <span className="en-linea">
            <input value={folio} onChange={e => { setFolio(e.target.value); setPrevia(null); setConfirmada(false); }} autoFocus />
            <button className="btn" onClick={() => void buscarFolio()} disabled={buscando}>{buscando ? 'Revisando…' : numero === 1 ? 'Validar' : 'Buscar'}</button>
          </span>
        </label>

        {numero === 1 && (
          <>
            <CampoPieza etiqueta="Pieza que regresa (defectuosa)" productos={productos} onPieza={(p, v) => setRegresada(piezaGarantia(p, v, cliente))} />
            <details className="detalle-manual">
              <summary className="muted small">La pieza que regresa ya no está en el catálogo</summary>
              <div className="fila-manual">
                <input placeholder="Nombre" value={manual.nombre} onChange={e => setManual({ ...manual, nombre: e.target.value })} />
                <input placeholder="Precio etiqueta" inputMode="decimal" value={manual.precio} onChange={e => setManual({ ...manual, precio: e.target.value })} />
                <input placeholder="% desc." inputMode="numeric" value={manual.descuento} onChange={e => setManual({ ...manual, descuento: e.target.value })} aria-label="Descuento" />
                <button className="btn" onClick={() => {
                  const precio = leerMonto(manual.precio);
                  const desc = Number(manual.descuento) || 0;
                  if (!manual.nombre.trim() || precio === null || precio <= 0) return setError('Escribe el nombre y el precio etiqueta.');
                  setRegresada({ productoId: null, varianteId: null, codigo: '', nombre: manual.nombre.trim(), variante: '', precioEtiqueta: precio, valor: valorPara({ precioEtiqueta: precio, descuento: desc }, cliente) });
                  setError(null);
                }}>Usar</button>
              </div>
            </details>
            {regresada && <p className="nota-apartado small">Regresa: <strong>{regresada.nombre}</strong> {regresada.codigo && `(${regresada.codigo})`} · valor original {dinero(regresada.valor)}</p>}
          </>
        )}

        {numero === 2 && previa && (
          <div className="nota-apartado small">
            <p><strong>{previa.cliente.nombre}</strong> · valor original {dinero(previa.valorOriginal)}</p>
            <p>Primera pieza: {previa.cambios[0].regresada.nombre} {previa.cambios[0].regresada.codigo && `(${previa.cambios[0].regresada.codigo})`}</p>
            <p>Se llevó en el primer cambio: <strong>{regresada?.nombre}</strong> {regresada?.codigo && `(${regresada.codigo})`}</p>
            {!confirmada ? (
              <CampoPieza etiqueta="Confirma la pieza que regresa (escanea su etiqueta)" productos={productos} onPieza={p => {
                const err = validarCambio(2, previa, p.codigo);
                if (err) setError(err);
                else { setConfirmada(true); setError(null); }
              }} />
            ) : <p className="chip ok">Pieza confirmada</p>}
          </div>
        )}

        {regresada && (numero === 1 || confirmada) && (
          <CampoPieza etiqueta="Pieza que se lleva" productos={productos} soloConExistencias onPieza={(p, v) => setNueva({ p, v })} />
        )}

        {linea?.garantia && (
          <dl className="totales">
            <dt>Se lleva</dt><dd>{linea.nombre}{linea.variante ? ` · ${linea.variante}` : ''}</dd>
            <dt>Precio etiqueta</dt><dd>{dinero(linea.precioEtiqueta)}</dd>
            <dt>Valor original</dt><dd>{dinero(linea.garantia.valorOriginal)}</dd>
            <dt className="total">Diferencia a pagar</dt><dd className="total">{dinero(linea.garantia.diferencia)}</dd>
          </dl>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button className="btn primario" disabled={!linea || !normalizarFolio(folio) || (numero === 2 && !previa)} onClick={async () => {
            if (!linea) return;
            // Se vuelve a validar el folio justo antes de agregarlo.
            const s = await getDoc(doc(db, COL_GARANTIAS, normalizarFolio(folio))).catch(() => null);
            const err = validarCambio(numero, s?.exists() ? (s.data() as Garantia) : null, regresada?.codigo ?? '');
            if (err) return setError(err);
            const e2 = onAgregar(linea, clienteG);
            if (e2) setError(e2);
          }}>Agregar a la venta</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ tickets para imprimir

/** Ticket falso / presupuesto: piezas del cambio físico, artículos y cuánto queda a favor o por pagar. */
export function TicketPresupuesto({ cliente, carrito, cambio, saldo, ancho }: {
  cliente: ClienteVenta;
  carrito: LineaCarrito[];
  cambio: PiezaCambio[];
  saldo: number;
  ancho: AnchoTicket;
}) {
  const totales = calcularTotales(carrito, cliente);
  const aFavor = valorCambio(cambio);
  const diferencia = Math.round((totales.total - aFavor) * 100) / 100;
  return (
    <div className={ancho === 58 ? 'ticket t58' : 'ticket'}>
      <EncabezadoTienda />
      <div className="t-espacio" />
      <div className="t-centro t-fuerte">{carrito.length ? 'PRESUPUESTO' : 'CAMBIO FISICO'}</div>
      <div className="t-centro">No es comprobante de pago</div>
      <div>{fechaTicket(new Date().toISOString())}</div>
      <div className="t-linea" />
      <div className="t-fuerte">Cliente:</div>
      <div>{cliente.nombre.toUpperCase()}</div>
      {cliente.membresia && <div>{cliente.membresia}</div>}
      {cambio.length > 0 && (
        <>
          <div className="t-linea" />
          <div className="t-fuerte">Piezas que deja:</div>
          {cambio.map((p, i) => (
            <div key={i} className="t-art">
              <div>{renglonPieza({ categoria: p.categoria, colorOro: p.colorOro, nombre: p.nombre, variante: p.variante })}</div>
              <Fila izq={`1 PZ x ${MXN.format(p.precioEtiqueta)}${p.descuento ? ` (-${p.descuento}%)` : ''}`} der={MXN.format(p.valor)} />
            </div>
          ))}
          <Fila izq="A tu favor:" der={MXN.format(aFavor)} fuerte />
        </>
      )}
      {carrito.length > 0 && (
        <>
          <div className="t-linea" />
          <div className="t-fuerte">Artículos:</div>
          {carrito.map((l, i) => (
            <div key={i} className="t-art">
              <div>{l.garantia ? 'GARANTIA · ' : ''}{renglonPieza({ categoria: l.categoria, colorOro: l.colorOro, nombre: l.nombre, variante: l.variante })}</div>
              <Fila izq={`${l.cantidad} PZ x ${MXN.format(precioUnitario(l, cliente))}`} der={MXN.format(precioUnitario(l, cliente) * l.cantidad)} />
            </div>
          ))}
          <Fila izq="Total:" der={MXN.format(totales.total)} fuerte />
        </>
      )}
      <div className="t-linea" />
      {cambio.length > 0 && carrito.length > 0 && (
        diferencia >= 0 ? <Fila izq="Por pagar:" der={MXN.format(diferencia)} fuerte /> : <Fila izq="Te queda a favor:" der={MXN.format(-diferencia)} fuerte />
      )}
      {saldo > 0 && <Fila izq="Saldo a favor guardado:" der={MXN.format(saldo)} />}
    </div>
  );
}

/** Ticket de verificación: una casilla por cada pieza (no por modelo) y línea para quien verificó. */
export function TicketVerificacion({ cliente, carrito, ancho }: { cliente: ClienteVenta; carrito: LineaCarrito[]; ancho: AnchoTicket }) {
  const piezas = carrito.filter(l => !l.esServicio).flatMap(l => Array.from({ length: l.cantidad }, () => l));
  return (
    <div className={ancho === 58 ? 'ticket t58' : 'ticket'}>
      <div className="t-centro">
        <img src="./imagotipo-ticket.jpg" alt="" className="t-imagotipo" />
        <div className="t-fuerte">TICKET DE VERIFICACION</div>
      </div>
      <div>{fechaTicket(new Date().toISOString())} · {cliente.nombre}</div>
      <div className="t-espacio" />
      <div>Verificó: ______________________</div>
      <div className="t-linea" />
      {piezas.map((l, i) => (
        <div key={i} className="t-fila t-verifica">
          <span><span className="t-casilla">☐</span> {renglonPieza({ categoria: l.categoria, colorOro: l.colorOro, nombre: l.nombre, variante: l.variante })}</span>
          <span>{MXN.format(l.precioEtiqueta)}</span>
        </div>
      ))}
      <div className="t-linea" />
      <div>Piezas: {piezas.length}</div>
    </div>
  );
}
