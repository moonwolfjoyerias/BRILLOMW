import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import {
  borradorDesde,
  borradorVacio,
  nuevoIdFoto,
  nuevoIdVariante,
  validarBorrador,
  type BorradorProducto
} from '../pagina/edicion';
import { comprimirFoto } from '../pagina/fotos';
import { crearProducto, editarProducto } from '../pagina/guardarProducto';
import {
  CALIDADES,
  CATEGORIAS,
  COLORES_ORO,
  DESCUENTO_SUGERIDO,
  GALERIA_MAX_FOTOS,
  MATERIALES
} from '../pagina/opciones';
import { precioMayoreo, type Material, type Producto } from '../pagina/producto';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function ProductoForm({
  producto,
  perfil,
  onCerrar
}: {
  /** null = producto nuevo. */
  producto: Producto | null;
  perfil: PerfilUsuario;
  onCerrar: (guardado: boolean) => void;
}) {
  const [b, setB] = useState<BorradorProducto>(() => (producto ? borradorDesde(producto) : borradorVacio()));
  const [descuentoTocado, setDescuentoTocado] = useState(Boolean(producto));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [procesandoFotos, setProcesandoFotos] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !guardando && onCerrar(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [guardando, onCerrar]);

  const set = <K extends keyof BorradorProducto>(k: K, v: BorradorProducto[K]) => setB(prev => ({ ...prev, [k]: v }));

  function cambiarMaterial(material: Material | '') {
    setB(prev => ({
      ...prev,
      material,
      // Igual que la página: el descuento sugerido sale del material, pero
      // si ya lo cambiaron a mano no se pisa.
      descuento: !descuentoTocado && material ? String(DESCUENTO_SUGERIDO[material]) : prev.descuento
    }));
  }

  function cambiarVariante(id: string, campo: 'color' | 'talla' | 'stock' | 'fotoId', valor: string | null) {
    setB(prev => ({ ...prev, variantes: prev.variantes.map(v => (v.id === id ? { ...v, [campo]: valor } : v)) }));
  }

  async function agregarFotos(e: ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (!archivos.length) return;
    const lugares = GALERIA_MAX_FOTOS - b.galeria.length;
    if (archivos.length > lugares) {
      setError(`Un producto admite máximo ${GALERIA_MAX_FOTOS} fotos.`);
      if (lugares <= 0) return;
    }
    setProcesandoFotos(true);
    try {
      const nuevas = await Promise.all(archivos.slice(0, lugares).map(async f => ({ id: nuevoIdFoto(), src: await comprimirFoto(f) })));
      setB(prev => ({ ...prev, galeria: [...prev.galeria, ...nuevas] }));
    } catch {
      setError('No se pudo procesar alguna foto. Intenta con otra.');
    } finally {
      setProcesandoFotos(false);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const r = validarBorrador(b);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setGuardando(true);
    const equipo = equipoActual();
    const err = producto
      ? await editarProducto(db, producto, r.datos, perfil, equipo)
      : await crearProducto(db, r.datos, perfil, equipo).then(x => (x.ok ? null : x.error));
    setGuardando(false);
    if (err) setError(err);
    else onCerrar(true);
  }

  const precio = Number(b.precioEtiqueta) || 0;
  const descuento = Number(b.descuento) || 0;

  return (
    <div className="modal-fondo">
      <form className="modal modal-ancho" role="dialog" aria-modal="true" aria-label={producto ? 'Editar producto' : 'Agregar producto'} onSubmit={guardar} noValidate>
        <div className="modal-cabeza">
          <h2>{producto ? 'Editar producto' : 'Agregar producto'}</h2>
          <button type="button" className="btn" onClick={() => onCerrar(false)} disabled={guardando}>
            Cancelar
          </button>
        </div>

        <h3>Fotos</h3>
        <div className="fotos-form">
          {b.galeria.map((f, i) => (
            <figure key={f.id} className="foto-form">
              <img src={f.src} alt={`Foto ${i + 1}`} />
              {i === 0 && <span className="chip ok principal">Principal</span>}
              <div className="foto-acciones">
                {i > 0 && (
                  <button type="button" className="btn mini" onClick={() => set('galeria', [f, ...b.galeria.filter(x => x.id !== f.id)])}>
                    Principal
                  </button>
                )}
                <button type="button" className="btn mini" onClick={() => set('galeria', b.galeria.filter(x => x.id !== f.id))}>
                  Quitar
                </button>
              </div>
            </figure>
          ))}
          {b.galeria.length < GALERIA_MAX_FOTOS && (
            <button type="button" className="foto-agregar" onClick={() => archivoRef.current?.click()} disabled={procesandoFotos}>
              {procesandoFotos ? 'Procesando…' : '+ Agregar foto'}
            </button>
          )}
          <input ref={archivoRef} type="file" accept="image/*" multiple hidden onChange={agregarFotos} />
        </div>
        <p className="muted small">Máximo {GALERIA_MAX_FOTOS} fotos. En la tablet puedes tomarlas con la cámara.</p>

        <h3>Datos</h3>
        <div className="rejilla-form">
          <label className="campo ancho-2">
            <span>Nombre *</span>
            <input value={b.nombre} onChange={e => set('nombre', e.target.value)} />
          </label>
          <label className="campo">
            <span>Código</span>
            <input value={b.codigo} onChange={e => set('codigo', e.target.value)} placeholder="Ej. AN-045" autoCapitalize="characters" />
          </label>
          <label className="campo ancho-3">
            <span>Descripción *</span>
            <textarea rows={2} value={b.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </label>
          <label className="campo">
            <span>Material *</span>
            <select value={b.material} onChange={e => cambiarMaterial(e.target.value as Material | '')}>
              <option value="">Elige…</option>
              {MATERIALES.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Categoría</span>
            <select value={b.categoria} onChange={e => set('categoria', e.target.value)}>
              <option value="">Sin categoría</option>
              {[...CATEGORIAS, ...(b.categoria && !CATEGORIAS.includes(b.categoria) ? [b.categoria] : [])].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Calidad</span>
            <select value={b.calidad} onChange={e => set('calidad', e.target.value)}>
              {b.calidad === '' && <option value="">Sin especificar</option>}
              {CALIDADES.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Color de oro</span>
            <select value={b.colorOro} onChange={e => set('colorOro', e.target.value)}>
              <option value="">No aplica</option>
              {[...COLORES_ORO, ...(b.colorOro && !COLORES_ORO.includes(b.colorOro) ? [b.colorOro] : [])].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Precio etiqueta *</span>
            <input inputMode="decimal" value={b.precioEtiqueta} onChange={e => set('precioEtiqueta', e.target.value)} placeholder="0" />
          </label>
          <label className="campo">
            <span>Descuento (%) *</span>
            <input
              inputMode="numeric"
              value={b.descuento}
              onChange={e => {
                setDescuentoTocado(true);
                set('descuento', e.target.value);
              }}
              placeholder="0"
            />
          </label>
        </div>
        <p className="muted small">
          Precio emprendedora: <strong>{MXN.format(precioMayoreo({ precioEtiqueta: precio, descuento }))}</strong>
        </p>

        <h3>Variantes y existencias</h3>
        <p className="muted small">Una fila por cada combinación de color de piedra y talla. Deja vacío lo que no aplique.</p>
        <div className="variantes-form">
          <div className="variante-fila encabezado">
            <span>Color / piedra</span>
            <span>Talla</span>
            <span>Existencias *</span>
            <span>Foto</span>
            <span />
          </div>
          {b.variantes.map(v => (
            <div className="variante-fila" key={v.id}>
              <input aria-label="Color o piedra" value={v.color} onChange={e => cambiarVariante(v.id, 'color', e.target.value)} placeholder="Ej. Zirconia roja" />
              <input aria-label="Talla" value={v.talla} onChange={e => cambiarVariante(v.id, 'talla', e.target.value)} placeholder="Ej. 7" />
              <input aria-label="Existencias" inputMode="numeric" value={v.stock} onChange={e => cambiarVariante(v.id, 'stock', e.target.value)} />
              <select aria-label="Foto de la variante" value={v.fotoId ?? ''} onChange={e => cambiarVariante(v.id, 'fotoId', e.target.value || null)}>
                <option value="">Principal</option>
                {b.galeria.map((f, i) => (
                  <option key={f.id} value={f.id}>Foto {i + 1}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn mini"
                disabled={b.variantes.length === 1}
                onClick={() => set('variantes', b.variantes.filter(x => x.id !== v.id))}
                aria-label="Quitar variante"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => set('variantes', [...b.variantes, { id: nuevoIdVariante(), color: '', talla: '', stock: '0', fotoId: null }])}
        >
          + Agregar variante
        </button>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones pie-form">
          <button type="button" className="btn" onClick={() => onCerrar(false)} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn primario" disabled={guardando || procesandoFotos}>
            {guardando ? 'Guardando…' : producto ? 'Guardar cambios' : 'Agregar al catálogo'}
          </button>
        </div>
        <p className="muted small">Se registrará en Actividad a nombre de {perfil.nombre}, desde BRILLO.</p>
      </form>
    </div>
  );
}
