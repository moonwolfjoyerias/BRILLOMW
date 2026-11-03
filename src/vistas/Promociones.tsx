// Promociones: crear, editar y pausar (Encargado y Administración). La caja
// las aplica solas; las de cupón, cuando se escribe el código.
import { useState, type FormEvent } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { fechaLocal } from '../caja/turno';
import { useCatalogo } from '../pagina/useCatalogo';
import { CATEGORIAS } from '../pagina/opciones';
import { NOMBRE_MATERIAL, type Producto } from '../pagina/producto';
import { guardarPromocion, puedeEditarPromociones, usePromociones } from '../promociones/acciones';
import { motivoNoVigente, NOMBRES_PARA, NOMBRES_TIPO, type ParaQuien, type Promocion, type TipoPromocion } from '../promociones/modelo';
import { MarcoModal, useEnvio } from './Modal';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function describir(p: Promocion): string {
  const que = p.tipo === 'porcentaje' ? `${p.valor}% de descuento` : p.tipo === 'nxm' ? `${p.n}×${p.m}` : `precio especial ${MXN.format(p.valor)}`;
  const a = p.alcance;
  const en = a.todo ? 'en todo' : [...a.categorias, ...a.materiales.map(m => NOMBRE_MATERIAL[m as keyof typeof NOMBRE_MATERIAL] ?? m), a.productos.length ? `${a.productos.length} producto(s)` : ''].filter(Boolean).join(', ');
  return `${que} · ${en} · ${NOMBRES_PARA[p.paraQuien]}`;
}

function estado(p: Promocion, hoy: string): { texto: string; clase: string } {
  const m = motivoNoVigente(p, hoy);
  if (!m) return { texto: 'Vigente', clase: 'ok' };
  if (!p.activa) return { texto: 'Pausada', clase: 'neutro' };
  if (hoy < p.inicio) return { texto: 'Programada', clase: 'pendiente' };
  if (hoy > p.fin) return { texto: 'Terminada', clase: 'neutro' };
  return { texto: 'Sin usos', clase: 'agotado' };
}

export function Promociones({ perfil }: { perfil: PerfilUsuario }) {
  const promos = usePromociones(db, false);
  const hoy = fechaLocal();
  const [editando, setEditando] = useState<Promocion | null | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);
  const puede = puedeEditarPromociones(perfil.rol);

  async function pausar(p: Promocion) {
    const { id, usos: _u, ...datos } = p;
    const err = await guardarPromocion(db, id, { ...datos, activa: !p.activa }, perfil, equipoActual());
    setAviso(err ?? `${p.nombre}: ${p.activa ? 'pausada' : 'activada'}.`);
  }

  if (!promos) return <p className="muted">Cargando promociones…</p>;
  const ordenadas = [...promos].sort((a, b) => b.fin.localeCompare(a.fin));
  return (
    <section>
      <div className="encabezado-seccion con-accion">
        <div>
          <h1>Promociones</h1>
          <p className="muted">La caja las aplica solas; las de cupón, cuando se escribe el código. Las no combinables nunca se juntan con otra: se usa la que más le ahorra a la clienta.</p>
        </div>
        {puede && <button className="btn primario" onClick={() => setEditando(null)}>+ Nueva promoción</button>}
      </div>
      {aviso && <p className="aviso-ok" role="status">{aviso}</p>}
      {!ordenadas.length ? <p className="muted vacio">Todavía no hay promociones.</p> : (
        <ul className="lineas">
          {ordenadas.map(p => {
            const e = estado(p, hoy);
            return (
              <li key={p.id} className="linea">
                <div>
                  <strong>{p.nombre}</strong> <span className={`chip ${e.clase}`}>{e.texto}</span>{p.cupon && <span className="chip neutro">Cupón {p.cupon}</span>}{p.combinable && <span className="chip neutro">Combinable</span>}
                  <span className="muted small bloque">{describir(p)}</span>
                  <span className="muted small bloque">
                    {p.inicio} a {p.fin} · usada {p.usos} {p.usos === 1 ? 'vez' : 'veces'}{p.limiteUsos ? ` de ${p.limiteUsos}` : ''}{p.unUsoPorPersona ? ' · un uso por e/l' : ''}{p.compraMinima ? ` · compra mínima ${MXN.format(p.compraMinima)}` : ''}
                  </span>
                </div>
                {puede && (
                  <div className="acciones-fila">
                    <button className="btn mini" onClick={() => void pausar(p)}>{p.activa ? 'Pausar' : 'Activar'}</button>
                    <button className="btn mini" onClick={() => setEditando(p)}>Editar</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editando !== undefined && <FormPromocion p={editando} perfil={perfil} onCerrar={() => setEditando(undefined)} onListo={t => { setEditando(undefined); setAviso(t); }} />}
    </section>
  );
}

function FormPromocion({ p, perfil, onCerrar, onListo }: { p: Promocion | null; perfil: PerfilUsuario; onCerrar: () => void; onListo: (t: string) => void }) {
  const hoy = fechaLocal();
  const catalogo = useCatalogo();
  const productos: Producto[] = catalogo.estado === 'listo' ? catalogo.productos : [];
  const [d, setD] = useState(() => ({
    nombre: p?.nombre ?? '',
    tipo: (p?.tipo ?? 'porcentaje') as TipoPromocion,
    valor: String(p?.valor ?? ''),
    n: String(p?.n ?? 3),
    m: String(p?.m ?? 2),
    todo: p?.alcance.todo ?? false,
    categorias: p?.alcance.categorias ?? [],
    materiales: p?.alcance.materiales ?? [],
    productos: p?.alcance.productos ?? [],
    paraQuien: (p?.paraQuien ?? 'ambos') as ParaQuien,
    inicio: p?.inicio ?? hoy,
    fin: p?.fin ?? hoy,
    activa: p?.activa ?? true,
    combinable: p?.combinable ?? false,
    cupon: p?.cupon ?? '',
    limiteUsos: p?.limiteUsos != null ? String(p.limiteUsos) : '',
    unUsoPorPersona: p?.unUsoPorPersona ?? false,
    compraMinima: p?.compraMinima != null ? String(p.compraMinima) : ''
  }));
  const [buscar, setBuscar] = useState('');
  const { enviando, error, enviar } = useEnvio();
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD(x => ({ ...x, [k]: v }));
  const alternar = (k: 'categorias' | 'materiales' | 'productos', v: string) => set(k, d[k].includes(v) ? d[k].filter(x => x !== v) : [...d[k], v]);
  const encontrados = buscar.trim() ? productos.filter(x => normal(`${x.nombre} ${x.codigo}`).includes(normal(buscar))).slice(0, 8) : [];

  function guardar(e: FormEvent) {
    e.preventDefault();
    const num = (t: string) => (t.trim() === '' ? null : Number(t));
    void enviar(async () => {
      const err = await guardarPromocion(
        db,
        p?.id ?? null,
        {
          nombre: d.nombre,
          tipo: d.tipo,
          valor: d.tipo === 'nxm' ? 0 : Number(d.valor),
          ...(d.tipo === 'nxm' ? { n: Number(d.n), m: Number(d.m) } : {}),
          alcance: { todo: d.todo, categorias: d.todo ? [] : d.categorias, materiales: d.todo ? [] : d.materiales, productos: d.todo ? [] : d.productos },
          paraQuien: d.paraQuien,
          inicio: d.inicio,
          fin: d.fin,
          activa: d.activa,
          combinable: d.combinable,
          cupon: d.cupon,
          limiteUsos: num(d.limiteUsos),
          unUsoPorPersona: d.unUsoPorPersona,
          compraMinima: num(d.compraMinima)
        },
        perfil,
        equipoActual()
      );
      if (!err) onListo(`Promoción "${d.nombre.trim()}" guardada.`);
      return err;
    });
  }

  return (
    <MarcoModal titulo={p ? `Editar · ${p.nombre}` : 'Nueva promoción'} onCerrar={onCerrar} enviando={enviando} onEnviar={guardar}>
      <div className="rejilla-form">
        <label className="campo ancho-2"><span>Nombre *</span><input value={d.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Buen Fin 15%" autoFocus /></label>
        <label className="campo">
          <span>Tipo *</span>
          <select value={d.tipo} onChange={e => set('tipo', e.target.value as TipoPromocion)}>
            {(Object.keys(NOMBRES_TIPO) as TipoPromocion[]).map(t => <option key={t} value={t}>{NOMBRES_TIPO[t]}</option>)}
          </select>
        </label>
        {d.tipo === 'nxm' ? (
          <>
            <label className="campo"><span>Lleva (N)</span><input inputMode="numeric" value={d.n} onChange={e => set('n', e.target.value)} /></label>
            <label className="campo"><span>Paga (M)</span><input inputMode="numeric" value={d.m} onChange={e => set('m', e.target.value)} /></label>
          </>
        ) : (
          <label className="campo"><span>{d.tipo === 'porcentaje' ? '% de descuento *' : 'Precio especial *'}</span><input inputMode="decimal" value={d.valor} onChange={e => set('valor', e.target.value)} /></label>
        )}
        <label className="campo">
          <span>Para quién</span>
          <select value={d.paraQuien} onChange={e => set('paraQuien', e.target.value as ParaQuien)}>
            {(Object.keys(NOMBRES_PARA) as ParaQuien[]).map(x => <option key={x} value={x}>{NOMBRES_PARA[x]}</option>)}
          </select>
        </label>
        <label className="campo"><span>Desde *</span><input type="date" value={d.inicio} onChange={e => set('inicio', e.target.value)} /></label>
        <label className="campo"><span>Hasta *</span><input type="date" value={d.fin} min={d.inicio} onChange={e => set('fin', e.target.value)} /></label>
      </div>
      {d.paraQuien !== 'publico' && <p className="muted small">A las emprendedoras y líderes se les aplica sobre su precio de mayoreo.</p>}

      <h3>¿A qué piezas aplica?</h3>
      <label className="check"><input type="checkbox" checked={d.todo} onChange={e => set('todo', e.target.checked)} /> A todo (menos servicios y garantías)</label>
      {!d.todo && (
        <>
          <div className="chips-eleccion">
            {Object.entries(NOMBRE_MATERIAL).map(([k, v]) => (
              <button type="button" key={k} className={d.materiales.includes(k) ? 'chip-elegir activo' : 'chip-elegir'} onClick={() => alternar('materiales', k)}>{v}</button>
            ))}
          </div>
          <div className="chips-eleccion">
            {CATEGORIAS.map(c => (
              <button type="button" key={c} className={d.categorias.includes(c) ? 'chip-elegir activo' : 'chip-elegir'} onClick={() => alternar('categorias', c)}>{c}</button>
            ))}
          </div>
          <label className="campo"><span>Productos en específico</span><input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o código" /></label>
          {encontrados.length > 0 && (
            <div className="chips-eleccion">
              {encontrados.map(x => <button type="button" key={x.id} className={d.productos.includes(x.id) ? 'chip-elegir activo' : 'chip-elegir'} onClick={() => alternar('productos', x.id)}>{x.nombre} · {x.codigo}</button>)}
            </div>
          )}
          {d.productos.length > 0 && (
            <p className="small">Productos: {d.productos.map(id => productos.find(x => x.id === id)?.nombre ?? id).join(', ')} <button type="button" className="btn mini" onClick={() => set('productos', [])}>Quitar todos</button></p>
          )}
        </>
      )}

      <h3>Reglas</h3>
      <div className="rejilla-form">
        <label className="campo"><span>Cupón (opcional)</span><input value={d.cupon} onChange={e => set('cupon', e.target.value.toUpperCase())} placeholder="Ej. BUENFIN" /></label>
        <label className="campo"><span>Límite total de usos</span><input inputMode="numeric" value={d.limiteUsos} onChange={e => set('limiteUsos', e.target.value)} placeholder="Sin límite" /></label>
        <label className="campo"><span>Compra mínima</span><input inputMode="decimal" value={d.compraMinima} onChange={e => set('compraMinima', e.target.value)} placeholder="Sin mínimo" /></label>
      </div>
      <label className="check"><input type="checkbox" checked={d.unUsoPorPersona} onChange={e => set('unUsoPorPersona', e.target.checked)} /> Un uso por emprendedora/líder</label>
      <label className="check"><input type="checkbox" checked={d.combinable} onChange={e => set('combinable', e.target.checked)} /> Se puede combinar con otras promociones</label>
      <label className="check"><input type="checkbox" checked={d.activa} onChange={e => set('activa', e.target.checked)} /> Activa</label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones"><button type="submit" className="btn primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar promoción'}</button></div>
    </MarcoModal>
  );
}
