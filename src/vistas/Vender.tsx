import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useCatalogo } from '../pagina/useCatalogo';
import { etiquetaVariante, fotoMostrable, stockTotal, type Producto } from '../pagina/producto';
import { buscarPersonas, nombreCompleto, usePersonas } from '../pagina/persona';
import { CAJAS, fechaLocal, leerMonto, nombreCaja, type IdCaja } from '../caja/turno';
import { useTurnosDelDia } from '../caja/turnos';
import {
  NOMBRE_METODO,
  PUBLICO_GENERAL,
  agregarLinea,
  calcularTotales,
  cambiarCantidad,
  clienteDesdePersona,
  lineaDeProducto,
  lineaDeServicio,
  precioUnitario,
  validarPagos,
  type ClienteVenta,
  type LineaCarrito,
  type MetodoPago,
  type PagoCaptura,
  type PagoRegistrado
} from '../venta/carrito';
import { registrarVenta, type VentaRegistrada } from '../venta/registrarVenta';
import { Ticket, type AnchoTicket } from '../venta/Ticket';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CLAVE_CAJA = 'brillo.cajaDelEquipo';
const CLAVE_ANCHO = 'brillo.anchoTicket';

function anchoGuardado(): AnchoTicket {
  try {
    return localStorage.getItem(CLAVE_ANCHO) === '58' ? 58 : 80;
  } catch {
    return 80;
  }
}

/** Ajusta el tamaño de hoja al papel elegido justo antes de imprimir. */
function imprimirTicket(ancho: AnchoTicket) {
  let estilo = document.getElementById('pagina-ticket');
  if (!estilo) {
    estilo = document.createElement('style');
    estilo.id = 'pagina-ticket';
    document.head.appendChild(estilo);
  }
  estilo.textContent = `@media print { @page { size: ${ancho}mm auto; margin: 0; } }`;
  window.print();
}

function cajaGuardada(): IdCaja {
  try {
    const c = localStorage.getItem(CLAVE_CAJA);
    if (CAJAS.some(x => x.id === c)) return c as IdCaja;
  } catch {
    /* sin almacenamiento local: se usa Caja 1 */
  }
  return 'caja1';
}

export function Vender({ perfil, irACaja }: { perfil: PerfilUsuario; irACaja: () => void }) {
  const hoy = fechaLocal();
  const [caja, setCaja] = useState<IdCaja>(cajaGuardada);
  const turnos = useTurnosDelDia(hoy);
  const catalogo = useCatalogo();
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [cliente, setCliente] = useState<ClienteVenta>(PUBLICO_GENERAL);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [ticket, setTicket] = useState<VentaRegistrada | null>(null);

  const turno = turnos.estado === 'listo' ? turnos.turnos.find(t => t.caja === caja) : undefined;
  const cajaAbierta = turno?.estado === 'abierta';
  const totales = calcularTotales(carrito, cliente);
  const productos = catalogo.estado === 'listo' ? catalogo.productos : [];

  function elegirCaja(c: IdCaja) {
    setCaja(c);
    try {
      localStorage.setItem(CLAVE_CAJA, c);
    } catch {
      /* noop */
    }
  }

  function agregar(l: LineaCarrito) {
    const r = agregarLinea(carrito, l);
    setCarrito(r.carrito);
    setAviso(r.error ?? null);
  }

  function nuevaVenta() {
    setTicket(null);
    setCarrito([]);
    setCliente(PUBLICO_GENERAL);
    setAviso(null);
  }

  return (
    <section className="vender">
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Vender</h1>
          <p className="muted">
            {nombreCaja(caja)} ·{' '}
            {turnos.estado !== 'listo'
              ? 'consultando…'
              : cajaAbierta
                ? `abierta por ${turno!.abiertaPor.nombre}`
                : 'sin abrir hoy'}
          </p>
        </div>
        <label className="campo-en-linea">
          <span>Este equipo es</span>
          <select value={caja} onChange={e => elegirCaja(e.target.value as IdCaja)}>
            {CAJAS.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
      </div>

      {turnos.estado === 'listo' && !cajaAbierta ? (
        <div className="tarjeta-caja vacio-caja">
          <p>
            Para cobrar, primero abre la <strong>{nombreCaja(caja)}</strong> del día.
          </p>
          <button className="btn primario" onClick={irACaja}>
            Ir a Caja
          </button>
        </div>
      ) : (
        <div className="vender-columnas">
          <BuscadorProductos productos={productos} cargando={catalogo.estado === 'cargando'} enCarrito={carrito} onAgregar={agregar} />
          <div className="panel-venta">
            <SelectorCliente cliente={cliente} onCambiar={setCliente} />
            {aviso && <p className="error" role="alert">{aviso}</p>}
            {carrito.length === 0 ? (
              <p className="muted vacio">Agrega productos para empezar la venta.</p>
            ) : (
              <ul className="lineas">
                {carrito.map(l => {
                  const pu = precioUnitario(l, cliente);
                  return (
                    <li key={l.clave} className="linea">
                      <div className="linea-desc">
                        <strong>{l.descripcion}</strong>
                        <span className="muted small">
                          {l.codigo && `${l.codigo} · `}
                          {pu !== l.precioEtiqueta && <s>{dinero(l.precioEtiqueta)}</s>} {dinero(pu)} c/u
                        </span>
                      </div>
                      <div className="cantidad">
                        <button className="btn mini" aria-label="Quitar uno" onClick={() => { const r = cambiarCantidad(carrito, l.clave, l.cantidad - 1); setCarrito(r.carrito); setAviso(r.error ?? null); }}>−</button>
                        <span aria-label="Cantidad">{l.cantidad}</span>
                        <button className="btn mini" aria-label="Agregar uno" onClick={() => { const r = cambiarCantidad(carrito, l.clave, l.cantidad + 1); setCarrito(r.carrito); setAviso(r.error ?? null); }}>+</button>
                      </div>
                      <strong className="linea-importe">{dinero(pu * l.cantidad)}</strong>
                    </li>
                  );
                })}
              </ul>
            )}
            <dl className="totales">
              <dt>Artículos</dt>
              <dd>{totales.piezas}</dd>
              {totales.descuentoMayoreo > 0 && (
                <>
                  <dt>Precio etiqueta</dt>
                  <dd>{dinero(totales.totalEtiqueta)}</dd>
                  <dt>Descuento mayoreo</dt>
                  <dd>−{dinero(totales.descuentoMayoreo)}</dd>
                </>
              )}
              <dt className="muted small">IVA incluido (16%)</dt>
              <dd className="muted small">{dinero(totales.iva)}</dd>
              <dt className="total">Total</dt>
              <dd className="total">{dinero(totales.total)}</dd>
            </dl>
            <div className="acciones">
              <button className="btn" onClick={nuevaVenta} disabled={!carrito.length}>
                Vaciar
              </button>
              <button className="btn primario cobrar" onClick={() => setCobrando(true)} disabled={!carrito.length}>
                Cobrar {dinero(totales.total)}
              </button>
            </div>
          </div>
        </div>
      )}

      {cobrando && (
        <Cobro
          total={totales.total}
          onCancelar={() => setCobrando(false)}
          onConfirmar={async (pagos, recibido, cambio) => {
            const r = await registrarVenta(db, { caja, fechaDia: hoy, cliente, carrito, pagos, recibido, cambio, perfil, equipo: equipoActual() });
            if (!r.ok) return r.error;
            setCobrando(false);
            setTicket(r.venta);
            return null;
          }}
        />
      )}
      {ticket && <VentaTerminada venta={ticket} onNueva={nuevaVenta} />}
    </section>
  );
}

// ------------------------------------------------------------ productos

function BuscadorProductos({
  productos,
  cargando,
  enCarrito,
  onAgregar
}: {
  productos: Producto[];
  cargando: boolean;
  enCarrito: LineaCarrito[];
  onAgregar: (l: LineaCarrito) => void;
}) {
  const [q, setQ] = useState('');
  const [elegir, setElegir] = useState<Producto | null>(null);
  const [servicio, setServicio] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const resultados = useMemo(() => {
    const t = normal(q);
    const lista = t ? productos.filter(p => normal(`${p.nombre} ${p.codigo} ${p.categoria}`).includes(t)) : productos;
    return lista.filter(p => stockTotal(p) > 0).slice(0, 40);
  }, [productos, q]);

  function tomar(p: Producto) {
    const conStock = p.variantes.filter(v => v.stock > 0);
    if (conStock.length === 1) onAgregar(lineaDeProducto(p, conStock[0].id));
    else setElegir(p);
  }

  // Lector de QR o código de barras tipo teclado: escribe el código y da Enter.
  function alEnviar(e: FormEvent) {
    e.preventDefault();
    const codigo = normal(q);
    const exacto = productos.find(p => p.codigo && normal(p.codigo) === codigo);
    if (exacto) {
      tomar(exacto);
      setQ('');
    } else if (resultados.length === 1) {
      tomar(resultados[0]);
      setQ('');
    }
    entrada.current?.focus();
  }

  const cantidadEnCarrito = (p: Producto) => enCarrito.filter(l => l.productoId === p.id).reduce((s, l) => s + l.cantidad, 0);

  return (
    <div className="panel-productos">
      <form onSubmit={alEnviar} className="buscador">
        <input
          ref={entrada}
          type="search"
          placeholder="Buscar o escanear código"
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label="Buscar producto"
          autoFocus
        />
        <button type="button" className="btn" onClick={() => setServicio(true)}>
          + Servicio
        </button>
      </form>
      {cargando ? (
        <p className="muted">Cargando catálogo…</p>
      ) : (
        <ul className="lista-venta">
          {resultados.map(p => {
            const foto = fotoMostrable(p.imagen);
            const ya = cantidadEnCarrito(p);
            return (
              <li key={p.id}>
                <button className="item-venta" onClick={() => tomar(p)}>
                  {foto ? <img src={foto} alt="" /> : <span className="sin-foto" />}
                  <span className="item-texto">
                    <strong>{p.nombre}</strong>
                    <span className="muted small">{[p.codigo, p.colorOro].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="item-precio">
                    {dinero(p.precioEtiqueta)}
                    <span className="muted small">{stockTotal(p)} disp.{ya ? ` · ${ya} en venta` : ''}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {!resultados.length && <li className="muted vacio">{q ? 'Ningún producto con existencias coincide.' : 'No hay productos con existencias.'}</li>}
        </ul>
      )}

      {elegir && (
        <div className="modal-fondo" onClick={() => setElegir(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Elegir variante" onClick={e => e.stopPropagation()}>
            <div className="modal-cabeza">
              <h2>{elegir.nombre}</h2>
              <button className="btn" onClick={() => setElegir(null)}>Cerrar</button>
            </div>
            <p className="muted">Elige la variante:</p>
            <div className="variantes-eleccion">
              {elegir.variantes.filter(v => v.stock > 0).map(v => (
                <button
                  key={v.id}
                  className="btn"
                  onClick={() => {
                    onAgregar(lineaDeProducto(elegir, v.id));
                    setElegir(null);
                    entrada.current?.focus();
                  }}
                >
                  {etiquetaVariante(v)} <span className="muted small">({v.stock})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {servicio && (
        <FormServicio
          onCancelar={() => setServicio(false)}
          onAgregar={(desc, precio) => {
            onAgregar(lineaDeServicio(`${Date.now()}`, desc, precio));
            setServicio(false);
          }}
        />
      )}
    </div>
  );
}

function FormServicio({ onCancelar, onAgregar }: { onCancelar: () => void; onAgregar: (d: string, p: number) => void }) {
  const [desc, setDesc] = useState('');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="modal-fondo">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agregar servicio"
        onSubmit={e => {
          e.preventDefault();
          const p = leerMonto(precio);
          if (!desc.trim()) return setError('Describe el servicio (ej. Grabado de nombre).');
          if (p === null || p <= 0) return setError('Escribe el precio.');
          onAgregar(desc.trim(), p);
        }}
      >
        <div className="modal-cabeza">
          <h2>Servicio o artículo libre</h2>
        </div>
        <p className="muted small">Grabado, reparación, ajuste… No descuenta inventario ni lleva descuento de mayoreo.</p>
        <label className="campo">
          <span>Descripción</span>
          <input value={desc} onChange={e => setDesc(e.target.value)} autoFocus />
        </label>
        <label className="campo">
          <span>Precio</span>
          <input inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="0.00" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button type="button" className="btn" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn primario">Agregar</button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------ cliente

function SelectorCliente({ cliente, onCambiar }: { cliente: ClienteVenta; onCambiar: (c: ClienteVenta) => void }) {
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState('');
  const personas = usePersonas();
  const resultados = personas.estado === 'listo' ? buscarPersonas(personas.personas, q) : [];

  if (!buscando) {
    return (
      <div className="cliente">
        <div>
          <span className="muted small">Cliente</span>
          <strong>
            {cliente.nombre}
            {cliente.membresia && <span className="muted"> · {cliente.membresia}</span>}
          </strong>
          {cliente.tipo !== 'publico' && <span className="chip ok">{cliente.tipo === 'lider' ? 'Líder' : 'Emprendedora'} · precio mayoreo</span>}
        </div>
        <div className="acciones">
          {cliente.tipo !== 'publico' && (
            <button className="btn mini" onClick={() => onCambiar(PUBLICO_GENERAL)}>Público general</button>
          )}
          <button className="btn mini" onClick={() => setBuscando(true)}>
            {cliente.tipo === 'publico' ? 'Emprendedora / líder' : 'Cambiar'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="cliente buscando">
      <input
        type="search"
        placeholder="Nombre, membresía (MW0001) o teléfono"
        value={q}
        onChange={e => setQ(e.target.value)}
        autoFocus
        aria-label="Buscar emprendedora o líder"
      />
      {personas.estado === 'error' && <p className="error">No se pudieron cargar las emprendedoras.</p>}
      <ul className="resultados-cliente">
        {resultados.map(p => (
          <li key={p.id}>
            <button
              className="btn ancho izq"
              onClick={() => {
                onCambiar(clienteDesdePersona(p, nombreCompleto(p)));
                setBuscando(false);
                setQ('');
              }}
            >
              <strong>{nombreCompleto(p)}</strong>
              <span className="muted small">
                {p.tipo === 'lider' ? 'Líder' : 'Emprendedora'}
                {p.usuario && ` · ${p.usuario}`}
                {p.estado !== 'activa' && ` · ${p.estado}`}
              </span>
            </button>
          </li>
        ))}
        {q && personas.estado === 'listo' && !resultados.length && <li className="muted">Nadie coincide.</li>}
      </ul>
      <button className="btn mini" onClick={() => setBuscando(false)}>Cancelar</button>
    </div>
  );
}

// ------------------------------------------------------------ cobro

function Cobro({
  total,
  onCancelar,
  onConfirmar
}: {
  total: number;
  onCancelar: () => void;
  onConfirmar: (pagos: PagoRegistrado[], recibido: number, cambio: number) => Promise<string | null>;
}) {
  const [filas, setFilas] = useState<{ metodo: MetodoPago; monto: string; referencia: string }[]>([
    { metodo: 'efectivo', monto: String(total), referencia: '' }
  ]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && onCancelar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [enviando, onCancelar]);

  const capturados: PagoCaptura[] = filas.map(f => ({ metodo: f.metodo, monto: leerMonto(f.monto) ?? NaN, referencia: f.referencia }));
  const montosValidos = capturados.every(p => Number.isFinite(p.monto));
  const recibido = montosValidos ? capturados.reduce((s, p) => s + p.monto, 0) : 0;
  const diferencia = Math.round((recibido - total) * 100) / 100;

  const cambiarFila = (i: number, cambio: Partial<(typeof filas)[number]>) => setFilas(fs => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!montosValidos) return setError('Revisa los montos: escribe cantidades como 500 o 1,250.50.');
    const r = validarPagos(total, capturados);
    if (!r.ok) return setError(r.error);
    setError(null);
    setEnviando(true);
    const err = await onConfirmar(r.pagos, r.recibido, r.cambio);
    setEnviando(false);
    if (err) setError(err);
  }

  return (
    <div className="modal-fondo">
      <form className="modal" role="dialog" aria-modal="true" aria-label="Cobrar" onSubmit={confirmar} noValidate>
        <div className="modal-cabeza">
          <h2>Cobrar {dinero(total)}</h2>
          <button type="button" className="btn" onClick={onCancelar} disabled={enviando}>Volver</button>
        </div>
        {filas.map((f, i) => (
          <div key={i} className="fila-pago">
            <select value={f.metodo} onChange={e => cambiarFila(i, { metodo: e.target.value as MetodoPago })} aria-label="Método de pago">
              {(Object.keys(NOMBRE_METODO) as MetodoPago[]).map(m => (
                <option key={m} value={m}>{NOMBRE_METODO[m]}</option>
              ))}
            </select>
            <input inputMode="decimal" value={f.monto} onChange={e => cambiarFila(i, { monto: e.target.value })} aria-label="Monto" placeholder="Monto" />
            {f.metodo !== 'efectivo' ? (
              <input value={f.referencia} onChange={e => cambiarFila(i, { referencia: e.target.value })} aria-label="Número de referencia" placeholder="Núm. de referencia *" />
            ) : (
              <span className="muted small">Si pagan con más, escribe lo recibido.</span>
            )}
            {filas.length > 1 && (
              <button type="button" className="btn mini" onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))}>Quitar</button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() => setFilas(fs => [...fs, { metodo: 'tarjeta', monto: diferencia < 0 ? String(-diferencia) : '', referencia: '' }])}
        >
          + Otro método de pago
        </button>
        <p className={diferencia < 0 ? 'resumen-cobro falta' : 'resumen-cobro'}>
          {!montosValidos ? 'Revisa los montos.' : diferencia < 0 ? `Faltan ${dinero(-diferencia)}` : diferencia > 0 ? `Cambio: ${dinero(diferencia)}` : 'Pago exacto'}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button type="submit" className="btn primario cobrar" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Confirmar cobro'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------ ticket

function VentaTerminada({ venta, onNueva }: { venta: VentaRegistrada; onNueva: () => void }) {
  const [ancho, setAncho] = useState<AnchoTicket>(anchoGuardado);
  function elegirAncho(a: AnchoTicket) {
    setAncho(a);
    try {
      localStorage.setItem(CLAVE_ANCHO, String(a));
    } catch {
      /* noop */
    }
  }
  return (
    <div className="modal-fondo">
      <div className="modal modal-ticket" role="dialog" aria-modal="true" aria-label="Venta registrada">
        <div className="modal-cabeza">
          <h2>Venta {venta.folio}</h2>
          {venta.cambio > 0 && <span className="chip ok grande">Cambio: {dinero(venta.cambio)}</span>}
        </div>
        <div className="ticket-vista">
          <Ticket venta={venta} ancho={ancho} />
        </div>
        <div className="acciones">
          <label className="campo-en-linea">
            <span>Papel</span>
            <select value={ancho} onChange={e => elegirAncho(Number(e.target.value) as AnchoTicket)}>
              <option value={80}>80 mm</option>
              <option value={58}>58 mm</option>
            </select>
          </label>
          <button className="btn" onClick={() => imprimirTicket(ancho)}>Imprimir ticket</button>
          <button className="btn primario" onClick={onNueva} autoFocus>Nueva venta</button>
        </div>
      </div>
      <div className="ticket-impresion" aria-hidden="true">
        <Ticket venta={venta} ancho={ancho} />
      </div>
    </div>
  );
}
