import { useEffect, useMemo, useState } from 'react';
import { useCatalogo } from '../pagina/useCatalogo';
import {
  NOMBRE_MATERIAL,
  etiquetaVariante,
  fotoMostrable,
  nombreMaterial,
  precioMayoreo,
  stockTotal,
  type Producto
} from '../pagina/producto';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n: number) => MXN.format(n);

/** Sin acentos ni mayúsculas, para buscar "anillo" y encontrar "Anillo Corazón". */
const normal = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function Catalogo() {
  const catalogo = useCatalogo();
  const [busqueda, setBusqueda] = useState('');
  const [material, setMaterial] = useState('');
  const [soloConExistencias, setSoloConExistencias] = useState(false);
  const [abierto, setAbierto] = useState<Producto | null>(null);

  const productos = catalogo.estado === 'listo' ? catalogo.productos : [];
  const filtrados = useMemo(() => {
    const q = normal(busqueda);
    return productos.filter(
      p =>
        (!material || p.material === material) &&
        (!soloConExistencias || stockTotal(p) > 0) &&
        (!q || normal(`${p.nombre} ${p.codigo} ${p.categoria}`).includes(q))
    );
  }, [productos, busqueda, material, soloConExistencias]);

  if (catalogo.estado === 'cargando') return <p className="muted">Cargando catálogo…</p>;
  if (catalogo.estado === 'error') return <p className="error">{catalogo.mensaje}</p>;

  return (
    <section>
      <div className="encabezado-seccion">
        <h1>Catálogo</h1>
        <p className="muted">
          {filtrados.length} de {productos.length} modelos · solo lectura
          {catalogo.desdeCache && ' · sin conexión, mostrando la última copia'}
        </p>
      </div>

      <div className="filtros">
        <input
          type="search"
          placeholder="Buscar por nombre, código o categoría"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          aria-label="Buscar"
        />
        <select value={material} onChange={e => setMaterial(e.target.value)} aria-label="Material">
          <option value="">Todos los materiales</option>
          {Object.entries(NOMBRE_MATERIAL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={soloConExistencias}
            onChange={e => setSoloConExistencias(e.target.checked)}
          />
          Solo con existencias
        </label>
      </div>

      {filtrados.length === 0 ? (
        <p className="muted vacio">
          {productos.length === 0 ? 'El catálogo está vacío.' : 'Ningún producto coincide con la búsqueda.'}
        </p>
      ) : (
        <ul className="rejilla">
          {filtrados.map(p => (
            <li key={p.id}>
              <button className="tarjeta" onClick={() => setAbierto(p)}>
                <Foto src={p.imagen} alt={p.nombre} />
                <div className="tarjeta-cuerpo">
                  <strong className="tarjeta-nombre">{p.nombre || 'Sin nombre'}</strong>
                  <span className="muted small">
                    {[p.codigo, nombreMaterial(p.material), p.colorOro].filter(Boolean).join(' · ')}
                  </span>
                  <span className="precio">{dinero(p.precioEtiqueta)}</span>
                  <Existencias n={stockTotal(p)} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierto && <Detalle producto={abierto} onCerrar={() => setAbierto(null)} />}
    </section>
  );
}

function Foto({ src: original, alt }: { src: string; alt: string }) {
  const src = fotoMostrable(original);
  return src ? (
    <img className="foto" src={src} alt={alt} loading="lazy" />
  ) : (
    <div className="foto foto-vacia" aria-hidden="true">
      <img src="./isotipo.png" alt="" />
    </div>
  );
}

function Existencias({ n }: { n: number }) {
  return <span className={n > 0 ? 'chip ok' : 'chip agotado'}>{n > 0 ? `${n} en existencia` : 'Agotado'}</span>;
}

function Detalle({ producto: p, onCerrar }: { producto: Producto; onCerrar: () => void }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={p.nombre}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-cabeza">
          <h2>{p.nombre || 'Sin nombre'}</h2>
          <button className="btn" onClick={onCerrar} autoFocus>
            Cerrar
          </button>
        </div>
        {p.galeria.some(f => fotoMostrable(f.src)) && (
          <div className="galeria">
            {p.galeria
              .filter(f => fotoMostrable(f.src))
              .map(f => (
                <img key={f.id} src={f.src} alt="" />
              ))}
          </div>
        )}
        <dl className="datos">
          <dt>Código</dt>
          <dd>{p.codigo || '—'}</dd>
          <dt>Material</dt>
          <dd>{nombreMaterial(p.material)}</dd>
          {p.colorOro && (
            <>
              <dt>Color de oro</dt>
              <dd>{p.colorOro}</dd>
            </>
          )}
          {p.categoria && (
            <>
              <dt>Categoría</dt>
              <dd>{p.categoria}</dd>
            </>
          )}
          <dt>Precio etiqueta</dt>
          <dd>{dinero(p.precioEtiqueta)}</dd>
          <dt>Precio emprendedora</dt>
          <dd>
            {dinero(precioMayoreo(p))} <span className="muted">({p.descuento}% de descuento)</span>
          </dd>
        </dl>
        {p.descripcion && <p>{p.descripcion}</p>}
        <h3>Variantes</h3>
        <table className="tabla">
          <thead>
            <tr>
              <th>Variante</th>
              <th className="num">Existencias</th>
            </tr>
          </thead>
          <tbody>
            {p.variantes.map(v => (
              <tr key={v.id}>
                <td>{etiquetaVariante(v)}</td>
                <td className="num">{v.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
