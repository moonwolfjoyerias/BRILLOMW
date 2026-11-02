// Stock: cuánto hay de cada pieza (por variante), poco stock, entradas de
// mercancía, ajustes con motivo e historial de cada pieza.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useCatalogo } from '../pagina/useCatalogo';
import { etiquetaVariante, nombreMaterial, type Producto } from '../pagina/producto';
import { filasStock, MOTIVOS_AJUSTE, NOMBRES_MOVIMIENTO, type FilaStock, type MovimientoStock } from '../stock/modelo';
import { guardarStockMinimo, leerHistorial, moverStock, puedeMoverStock, useStockMinimo } from '../stock/acciones';
import { MarcoModal, useEnvio } from './Modal';
import { CampoPieza } from './CajaExtras';
import { BotonCamara } from '../escaner/EscanerQR';
import { limpiarCodigo } from '../pagina/codigoProducto';
import { fechaTicket } from '../venta/ticketFormato';

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ETIQUETA_ESTADO = { agotado: 'Agotado', poco: 'Poco stock', ok: 'Con existencia' } as const;
const CLASE_ESTADO = { agotado: 'agotado', poco: 'pendiente', ok: 'ok' } as const;

type Modal =
  | { tipo: 'entrada'; producto?: Producto; varianteId?: string }
  | { tipo: 'ajuste'; fila: FilaStock }
  | { tipo: 'historial'; producto: Producto }
  | { tipo: 'minimo' };

export function Stock({ perfil, productoInicial }: { perfil: PerfilUsuario; productoInicial?: string }) {
  const catalogo = useCatalogo();
  const minimo = useStockMinimo(db);
  const [q, setQ] = useState(productoInicial ?? '');
  const [vista, setVista] = useState<'todo' | 'poco' | 'agotado'>('todo');
  const [modal, setModal] = useState<Modal | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const puede = puedeMoverStock(perfil.rol);

  const productos = catalogo.estado === 'listo' ? catalogo.productos : [];
  const filas = useMemo(() => filasStock(productos, minimo), [productos, minimo]);
  const conteo = { poco: filas.filter(f => f.estado === 'poco').length, agotado: filas.filter(f => f.estado === 'agotado').length };
  const visibles = useMemo(() => {
    const t = normal(q);
    return filas
      .filter(f => vista === 'todo' || f.estado === vista)
      .filter(f => !t || normal(`${f.producto.nombre} ${f.producto.codigo} ${f.variante} ${f.producto.categoria}`).includes(t))
      .sort((a, b) => a.stock - b.stock || a.producto.nombre.localeCompare(b.producto.nombre, 'es'));
  }, [filas, q, vista]);
  const totalPiezas = filas.reduce((s, f) => s + f.stock, 0);

  if (catalogo.estado === 'cargando') return <p className="muted">Cargando existencias…</p>;
  if (catalogo.estado === 'error') return <p className="error">{catalogo.mensaje}</p>;

  return (
    <section>
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Stock</h1>
          <p className="muted">{totalPiezas} piezas en {filas.length} variantes · aviso de poco stock con {minimo} o menos</p>
        </div>
        {puede && (
          <div className="acciones">
            <button className="btn" onClick={() => setModal({ tipo: 'minimo' })}>Mínimo: {minimo}</button>
            <button className="btn primario" onClick={() => setModal({ tipo: 'entrada' })}>+ Entrada de mercancía</button>
          </div>
        )}
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <nav className="pestanas" aria-label="Ver">
        <button className={vista === 'todo' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('todo')}>Todo</button>
        <button className={vista === 'poco' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('poco')}>Poco stock ({conteo.poco})</button>
        <button className={vista === 'agotado' ? 'nav-boton activo' : 'nav-boton'} onClick={() => setVista('agotado')}>Agotado ({conteo.agotado})</button>
      </nav>
      <div className="filtros-stock en-linea">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, código, variante o categoría" aria-label="Buscar" />
        <BotonCamara titulo="Buscar por etiqueta" onCodigo={t => setQ(limpiarCodigo(t))} />
      </div>
      {!visibles.length ? (
        <p className="muted vacio">No hay piezas con ese filtro.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla tabla-stock">
            <thead>
              <tr><th>Código</th><th>Producto</th><th>Variante</th><th className="num">Existencia</th><th>Estado</th><th aria-label="Acciones" /></tr>
            </thead>
            <tbody>
              {visibles.slice(0, 300).map(f => (
                <tr key={`${f.producto.id}|${f.varianteId}`}>
                  <td className="mono">{f.producto.codigo}</td>
                  <td>
                    <strong>{f.producto.nombre}</strong>
                    <span className="muted small bloque">{nombreMaterial(f.producto.material)}{f.producto.categoria ? ` · ${f.producto.categoria}` : ''}{f.producto.mostrarEnCatalogo ? '' : ' · solo tienda'}</span>
                  </td>
                  <td>{f.variante}</td>
                  <td className="num"><strong>{f.stock}</strong></td>
                  <td><span className={`chip ${CLASE_ESTADO[f.estado]}`}>{ETIQUETA_ESTADO[f.estado]}</span></td>
                  <td><div className="acciones-fila">
                    {puede && <button className="btn mini" onClick={() => setModal({ tipo: 'entrada', producto: f.producto, varianteId: f.varianteId })}>+ Entrada</button>}
                    {puede && <button className="btn mini" onClick={() => setModal({ tipo: 'ajuste', fila: f })}>Ajustar</button>}
                    <button className="btn mini" onClick={() => setModal({ tipo: 'historial', producto: f.producto })}>Historial</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length > 300 && <p className="muted small">Se muestran 300 de {visibles.length}. Usa el buscador para encontrar una pieza.</p>}
        </div>
      )}
      {modal?.tipo === 'entrada' && (
        <EntradaModal productos={productos} inicial={modal} perfil={perfil} onCerrar={() => setModal(null)} onListo={t => { setModal(null); setAviso(t); }} />
      )}
      {modal?.tipo === 'ajuste' && <AjusteModal fila={modal.fila} perfil={perfil} onCerrar={() => setModal(null)} onListo={t => { setModal(null); setAviso(t); }} />}
      {modal?.tipo === 'historial' && <HistorialModal producto={modal.producto} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'minimo' && <MinimoModal actual={minimo} onCerrar={() => setModal(null)} onListo={t => { setModal(null); setAviso(t); }} />}
    </section>
  );
}

function EntradaModal({ productos, inicial, perfil, onCerrar, onListo }: {
  productos: Producto[];
  inicial: { producto?: Producto; varianteId?: string };
  perfil: PerfilUsuario;
  onCerrar: () => void;
  onListo: (aviso: string) => void;
}) {
  const [elegida, setElegida] = useState<{ p: Producto; v: string } | null>(inicial.producto && inicial.varianteId ? { p: inicial.producto, v: inicial.varianteId } : null);
  const [cantidad, setCantidad] = useState('1');
  const [proveedor, setProveedor] = useState('');
  const [nota, setNota] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const variante = elegida?.p.variantes.find(x => x.id === elegida.v);

  function guardar() {
    if (!elegida) return setError('Escanea o escribe el código de la pieza que llegó.');
    const n = Number(cantidad);
    void enviar(async () => {
      const err = await moverStock(db, { productoId: elegida.p.id, varianteId: elegida.v, tipo: 'entrada', cambio: { sumar: n }, proveedor, nota }, perfil, equipoActual());
      if (!err) onListo(`Entrada guardada: ${n} pza de ${elegida.p.nombre} (${variante ? etiquetaVariante(variante) : ''}).`);
      return err;
    });
  }

  return (
    // Sin <form> aquí: el campo de pieza ya es un formulario (escanear + Enter).
    <MarcoModal titulo="Entrada de mercancía" onCerrar={onCerrar} enviando={enviando}>
      {elegida && variante ? (
        <p className="pieza-elegida">
          <strong>{elegida.p.nombre}</strong> · {etiquetaVariante(variante)} · {elegida.p.codigo}
          <span className="muted small bloque">Hay {variante.stock} hoy.</span>
          <button type="button" className="btn mini" onClick={() => setElegida(null)}>Cambiar pieza</button>
        </p>
      ) : (
        <CampoPieza etiqueta="Pieza que llegó" productos={productos} onPieza={(p, v) => setElegida({ p, v })} autoFocus />
      )}
      <div className="rejilla-form">
        <label className="campo"><span>Cantidad *</span><input inputMode="numeric" value={cantidad} onChange={e => setCantidad(e.target.value)} /></label>
        <label className="campo ancho-2"><span>Proveedor (opcional)</span><input value={proveedor} onChange={e => setProveedor(e.target.value)} /></label>
        <label className="campo ancho-3"><span>Nota (opcional)</span><input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. factura 1234" /></label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="button" className="btn primario" disabled={enviando} onClick={guardar}>{enviando ? 'Guardando…' : 'Guardar entrada'}</button>
      </div>
    </MarcoModal>
  );
}

function AjusteModal({ fila, perfil, onCerrar, onListo }: { fila: FilaStock; perfil: PerfilUsuario; onCerrar: () => void; onListo: (aviso: string) => void }) {
  const [modo, setModo] = useState<'contar' | 'restar' | 'sumar'>('contar');
  const [valor, setValor] = useState(String(fila.stock));
  const [motivo, setMotivo] = useState<string>('Conteo físico');
  const [nota, setNota] = useState('');
  const { enviando, error, setError, enviar } = useEnvio();
  const n = Number(valor);
  const queda = modo === 'contar' ? n : modo === 'sumar' ? fila.stock + n : fila.stock - n;

  function guardar(e: FormEvent) {
    e.preventDefault();
    if (!Number.isInteger(n) || n < 0) return setError('Escribe un número entero, 0 o más.');
    const cambio = modo === 'contar' ? { fijar: n } : { sumar: modo === 'sumar' ? n : -n };
    void enviar(async () => {
      const err = await moverStock(db, { productoId: fila.producto.id, varianteId: fila.varianteId, tipo: 'ajuste', cambio, motivo, nota }, perfil, equipoActual());
      if (!err) onListo(`Existencia de ${fila.producto.nombre} (${fila.variante}) ajustada: ${fila.stock} → ${queda}.`);
      return err;
    });
  }

  return (
    <MarcoModal titulo={`Ajustar existencia · ${fila.producto.nombre}`} onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <p className="muted">{fila.variante} · {fila.producto.codigo} · hoy hay <strong>{fila.stock}</strong></p>
      <nav className="pestanas" aria-label="Tipo de ajuste">
        {(['contar', 'restar', 'sumar'] as const).map(m => (
          <button type="button" key={m} className={modo === m ? 'nav-boton activo' : 'nav-boton'} onClick={() => { setModo(m); setValor(m === 'contar' ? String(fila.stock) : '1'); }}>
            {m === 'contar' ? 'Conteo físico (hay…)' : m === 'restar' ? 'Quitar piezas' : 'Agregar piezas'}
          </button>
        ))}
      </nav>
      <div className="rejilla-form">
        <label className="campo"><span>{modo === 'contar' ? 'Piezas que hay' : 'Cuántas'}</span><input inputMode="numeric" value={valor} onChange={e => setValor(e.target.value)} autoFocus /></label>
        <label className="campo ancho-2">
          <span>Motivo *</span>
          <select value={motivo} onChange={e => setMotivo(e.target.value)}>
            {MOTIVOS_AJUSTE.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="campo ancho-3"><span>Nota{motivo === 'Otro' ? ' *' : ' (opcional)'}</span><input value={nota} onChange={e => setNota(e.target.value)} /></label>
      </div>
      {Number.isInteger(n) && n >= 0 && <p className={queda < 0 ? 'error' : 'muted'}>Queda en: <strong>{queda}</strong></p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar ajuste'}</button>
      </div>
    </MarcoModal>
  );
}

export function HistorialModal({ producto, onCerrar }: { producto: Producto; onCerrar: () => void }) {
  const [movs, setMovs] = useState<(MovimientoStock & { id: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variante, setVariante] = useState('');
  useEffect(() => {
    let vivo = true;
    leerHistorial(db, producto.id).then(m => vivo && setMovs(m)).catch(() => vivo && setError('No se pudo leer el historial. Revisa la conexión.'));
    return () => { vivo = false; };
  }, [producto.id]);
  const lista = (movs ?? []).filter(m => !variante || m.varianteId === variante);
  return (
    <MarcoModal titulo={`Historial · ${producto.nombre}`} onCerrar={onCerrar}>
      <p className="muted">{producto.codigo} · hoy: {producto.variantes.map(v => `${etiquetaVariante(v)} ${v.stock}`).join(' · ')}</p>
      {producto.variantes.length > 1 && (
        <select value={variante} onChange={e => setVariante(e.target.value)} aria-label="Variante">
          <option value="">Todas las variantes</option>
          {producto.variantes.map(v => <option key={v.id} value={v.id}>{etiquetaVariante(v)}</option>)}
        </select>
      )}
      {error && <p className="error">{error}</p>}
      {!movs && !error && <p className="muted">Cargando…</p>}
      {movs && !lista.length && <p className="muted">Sin movimientos registrados todavía. (Se registran desde que se agregó Stock.)</p>}
      {lista.length > 0 && (
        <ul className="lineas historial-stock">
          {lista.map(m => (
            <li key={m.id} className="linea">
              <div>
                <strong>{NOMBRES_MOVIMIENTO[m.tipo] ?? m.tipo}{m.motivo ? ` · ${m.motivo}` : ''}</strong>
                <span className="muted small bloque">
                  {fechaTicket(m.fecha)} · {m.variante} · {m.por}{m.referencia ? ` · ${m.referencia}` : ''}{m.proveedor ? ` · ${m.proveedor}` : ''}{m.nota ? ` · ${m.nota}` : ''}
                </span>
              </div>
              <span className="linea-importe">
                <strong className={m.cantidad < 0 ? 'peligro-texto' : 'ok-texto'}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</strong>
                {m.antes != null && m.despues != null && <span className="muted small bloque">{m.antes} → {m.despues}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </MarcoModal>
  );
}

function MinimoModal({ actual, onCerrar, onListo }: { actual: number; onCerrar: () => void; onListo: (aviso: string) => void }) {
  const [valor, setValor] = useState(String(actual));
  const { enviando, error, enviar } = useEnvio();
  return (
    <MarcoModal
      titulo="Aviso de poco stock"
      onCerrar={onCerrar}
      enviando={enviando}
      onEnviar={e => {
        e.preventDefault();
        void enviar(async () => {
          const err = await guardarStockMinimo(db, Number(valor));
          if (!err) onListo(`Ahora se avisa con ${valor} pieza(s) o menos.`);
          return err;
        });
      }}
    >
      <label className="campo"><span>Avisar cuando una variante tenga esta cantidad o menos</span><input inputMode="numeric" value={valor} onChange={e => setValor(e.target.value)} autoFocus /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></div>
    </MarcoModal>
  );
}
