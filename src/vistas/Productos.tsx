// Productos: TODO lo que está a la venta en la joyería (el Catálogo muestra
// solo lo premium, marcado "Mostrar en catálogo"). Aquí se ve cada pieza con
// su existencia, se prende o apaga si va al catálogo, se edita y se ve su
// historial de existencia.
import { puede } from '../sesion/permisos';
import { useMemo, useState } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { useCatalogo } from '../pagina/useCatalogo';
import { fotoMostrable, NOMBRE_MATERIAL, nombreMaterial, stockTotal, type Producto } from '../pagina/producto';
import { cambiarMostrarEnCatalogo } from '../pagina/mostrarEnCatalogo';
import { estadoStock, minimoDe } from '../stock/modelo';
import { useStockMinimo } from '../stock/acciones';
import { ProductoForm } from './ProductoForm';
import { HistorialModal } from './Stock';
import { BotonCamara } from '../escaner/EscanerQR';
import { limpiarCodigo } from '../pagina/codigoProducto';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function Productos({ perfil }: { perfil: PerfilUsuario }) {
  const catalogo = useCatalogo();
  const minimo = useStockMinimo(db);
  const [q, setQ] = useState('');
  const [material, setMaterial] = useState('');
  const [enCatalogo, setEnCatalogo] = useState<'' | 'si' | 'no'>('');
  const [existencia, setExistencia] = useState<'' | 'con' | 'sin'>('');
  const [editando, setEditando] = useState<string | null | undefined>(undefined);
  const [historial, setHistorial] = useState<Producto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const productos = catalogo.estado === 'listo' ? catalogo.productos : [];
  const filtrados = useMemo(() => {
    const t = normal(q);
    return productos.filter(p =>
      (!t || normal(`${p.nombre} ${p.codigo} ${p.categoria}`).includes(t)) &&
      (!material || p.material === material) &&
      (!enCatalogo || (enCatalogo === 'si') === p.mostrarEnCatalogo) &&
      (!existencia || (existencia === 'con') === stockTotal(p) > 0)
    );
  }, [productos, q, material, enCatalogo, existencia]);

  async function alternar(p: Producto) {
    setGuardando(p.id);
    const err = await cambiarMostrarEnCatalogo(db, p, !p.mostrarEnCatalogo, perfil, equipoActual());
    setGuardando(null);
    setAviso(err ?? `${p.nombre}: ${!p.mostrarEnCatalogo ? 'ahora se muestra en el catálogo.' : 'ya no se muestra en el catálogo (sigue a la venta en la tienda).'}`);
  }

  if (catalogo.estado === 'cargando') return <p className="muted">Cargando productos…</p>;
  if (catalogo.estado === 'error') return <p className="error">{catalogo.mensaje}</p>;

  const enCat = productos.filter(p => p.mostrarEnCatalogo).length;
  return (
    <section>
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Productos</h1>
          <p className="muted">{productos.length} productos a la venta · {enCat} en el catálogo · {productos.length - enCat} solo en tienda</p>
        </div>
        {puede(perfil, 'editarProductos') && <button className="btn primario" onClick={() => setEditando(null)}>+ Agregar producto</button>}
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      <div className="filtros-productos">
        <div className="en-linea">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, código o categoría" aria-label="Buscar" />
          <BotonCamara titulo="Buscar por etiqueta" onCodigo={t => setQ(limpiarCodigo(t))} />
        </div>
        <select value={material} onChange={e => setMaterial(e.target.value)} aria-label="Material">
          <option value="">Todos los materiales</option>
          {Object.entries(NOMBRE_MATERIAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={enCatalogo} onChange={e => setEnCatalogo(e.target.value as '' | 'si' | 'no')} aria-label="Catálogo">
          <option value="">Catálogo y solo tienda</option>
          <option value="si">En el catálogo (premium)</option>
          <option value="no">Solo en tienda</option>
        </select>
        <select value={existencia} onChange={e => setExistencia(e.target.value as '' | 'con' | 'sin')} aria-label="Existencia">
          <option value="">Con y sin existencia</option>
          <option value="con">Con existencia</option>
          <option value="sin">Agotados</option>
        </select>
      </div>
      {!filtrados.length ? (
        <p className="muted vacio">No hay productos con ese filtro.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla tabla-productos">
            <thead>
              <tr><th aria-label="Foto" /><th>Código</th><th>Producto</th><th className="num">Precio</th><th className="num">Existencia</th><th>Catálogo</th><th aria-label="Acciones" /></tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 300).map(p => {
                const total = stockTotal(p);
                // Agotado si no queda nada; poco si alguna variante llegó al mínimo.
                const est = total <= 0 ? 'agotado' : p.variantes.some(v => estadoStock(v.stock, minimoDe(p, minimo)) !== 'ok') ? 'poco' : 'ok';
                const foto = fotoMostrable(p.imagen);
                return (
                  <tr key={p.id}>
                    <td>{foto ? <img className="miniatura" src={foto} alt="" /> : <span className="miniatura sin-foto" />}</td>
                    <td className="mono">{p.codigo}</td>
                    <td>
                      <strong>{p.nombre}</strong>
                      <span className="muted small bloque">{nombreMaterial(p.material)}{p.categoria ? ` · ${p.categoria}` : ''} · {p.variantes.length} {p.variantes.length === 1 ? 'variante' : 'variantes'}</span>
                    </td>
                    <td className="num">{MXN.format(p.precioEtiqueta)}</td>
                    <td className="num">
                      <strong>{total}</strong>
                      {est !== 'ok' && <span className={`chip ${est === 'agotado' ? 'agotado' : 'pendiente'} bloque`}>{est === 'agotado' ? 'Agotado' : 'Poco'}</span>}
                    </td>
                    <td>
                      <label className="interruptor" title="Mostrar en el catálogo (premium)">
                        <input type="checkbox" checked={p.mostrarEnCatalogo} disabled={guardando === p.id || !puede(perfil, 'editarProductos')} onChange={() => void alternar(p)} />
                        <span>{p.mostrarEnCatalogo ? 'En catálogo' : 'Solo tienda'}</span>
                      </label>
                    </td>
                    <td><div className="acciones-fila">
                      {puede(perfil, 'editarProductos') && <button className="btn mini" onClick={() => setEditando(p.id)}>Editar</button>}
                      <button className="btn mini" onClick={() => setHistorial(p)}>Historial</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtrados.length > 300 && <p className="muted small">Se muestran 300 de {filtrados.length}. Usa el buscador.</p>}
        </div>
      )}
      {editando !== undefined && (
        <ProductoForm
          producto={editando ? productos.find(p => p.id === editando) ?? null : null}
          catalogo={productos}
          perfil={perfil}
          onCerrar={guardado => {
            setEditando(undefined);
            if (guardado) setAviso('Producto guardado.');
          }}
        />
      )}
      {historial && <HistorialModal producto={historial} onCerrar={() => setHistorial(null)} />}
    </section>
  );
}
