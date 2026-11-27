// Inventario → "Importar de Aronium": sube el CSV del inventario de
// Aronium, enseña qué se va a hacer, pregunta por los códigos parecidos y
// escribe todo. Se puede volver a subir el archivo cuando se quiera: lo que
// ya existe se actualiza y no se duplica.
import { useMemo, useState } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import type { Producto } from '../pagina/producto';
import { useCatalogo } from '../pagina/useCatalogo';
import { leerInventario, planear, type FilaAronium, type PlanImportacion } from '../importar/aronium';
import { aplicarImportacion, type Avance, type Decision } from '../importar/aplicar';
import { MarcoModal } from './Modal';

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-MX')} ${n === 1 ? uno : varios}`;

function ModalImportar({ perfil, onCerrar }: { perfil: PerfilUsuario; onCerrar: () => void }) {
  const catalogo = useCatalogo();
  const [archivo, setArchivo] = useState('');
  const [plan, setPlan] = useState<PlanImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Respuesta de cada código parecido: id del producto de BRILLO, o 'otro'. */
  const [respuestas, setRespuestas] = useState<Record<number, string>>({});
  const [avance, setAvance] = useState<Avance | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const enviando = avance !== null && resultado === null && error === null;

  async function leer(f: File | undefined) {
    setError(null); setPlan(null); setRespuestas({}); setResultado(null); setAvance(null);
    if (!f) return;
    if (catalogo.estado !== 'listo') { setError('Espera a que cargue el catálogo y vuelve a elegir el archivo.'); return; }
    setArchivo(f.name);
    const r = leerInventario(await f.text());
    if ('error' in r) { setError(r.error); return; }
    setPlan(planear(r.filas, catalogo.productos));
  }

  const cuenta = useMemo(() => {
    const c = { nuevo: 0, actualizar: 0, igual: 0, parecido: 0 };
    plan?.acciones.forEach(a => c[a.tipo]++);
    return c;
  }, [plan]);
  const parecidos = useMemo(() => (plan?.acciones ?? []).flatMap(a => (a.tipo === 'parecido' ? [a] : [])), [plan]);
  const pendiente = parecidos.find(a => !respuestas[a.fila.renglon]);
  const faltan = parecidos.filter(a => !respuestas[a.fila.renglon]).length;

  function responder(fila: FilaAronium, valor: string, todos = false) {
    setRespuestas(r => {
      const n = { ...r, [fila.renglon]: valor };
      if (todos) parecidos.forEach(a => { if (!n[a.fila.renglon]) n[a.fila.renglon] = valor === 'otro' ? 'otro' : a.candidatos[0].id; });
      return n;
    });
  }

  async function importar() {
    if (!plan || faltan) return;
    const productos = new Map<string, Producto>(catalogo.estado === 'listo' ? catalogo.productos.map(p => [p.id, p]) : []);
    const decisiones: Decision[] = [];
    for (const a of plan.acciones) {
      if (a.tipo === 'igual') continue;
      if (a.tipo === 'nuevo') decisiones.push({ fila: a.fila, producto: null });
      else if (a.tipo === 'actualizar') decisiones.push({ fila: a.fila, producto: a.producto });
      else {
        const r = respuestas[a.fila.renglon];
        decisiones.push({ fila: a.fila, producto: r === 'otro' ? null : productos.get(r) ?? null });
      }
    }
    if (!decisiones.length) { setResultado('No hay nada que cambiar: BRILLO ya tiene el inventario igual que el archivo.'); return; }
    setError(null);
    setAvance({ hechos: 0, total: decisiones.length });
    const r = await aplicarImportacion(db, decisiones, perfil, equipoActual(), setAvance);
    if (r.ok) setResultado(`Listo: ${plural(r.nuevos, 'producto nuevo', 'productos nuevos')} y ${plural(r.actualizados, 'actualizado', 'actualizados')}. Los nuevos quedaron como "solo tienda" (no salen en el catálogo).`);
    else setError(r.error);
  }

  return (
    <MarcoModal titulo="Importar inventario de Aronium" onCerrar={onCerrar} enviando={enviando} clase="modal-amplio">
      {!resultado && (
        <>
          <p className="muted small">
            Sube el archivo CSV que exporta Aronium (Productos → Exportar). Si el código ya existe se actualizan precio, existencia y mínimo
            (fotos, nombre y "mostrar en catálogo" se quedan igual); si no existe se da de alta como <strong>solo tienda</strong>. Las existencias
            negativas se ponen en 0. Puedes volver a subirlo cuando quieras: no se duplica nada.
          </p>
          <label className="campo">
            <span>Archivo de inventario (.csv)</span>
            <input type="file" accept=".csv,text/csv" disabled={enviando} onChange={e => void leer(e.target.files?.[0])} />
          </label>
        </>
      )}
      {catalogo.estado === 'cargando' && <p className="muted">Cargando catálogo…</p>}

      {plan && !resultado && (
        <>
          <ul className="resumen-importacion">
            <li><strong>{cuenta.nuevo.toLocaleString('es-MX')}</strong> nuevos</li>
            <li><strong>{cuenta.actualizar.toLocaleString('es-MX')}</strong> se actualizan</li>
            <li><strong>{cuenta.igual.toLocaleString('es-MX')}</strong> ya están igual</li>
            <li><strong>{cuenta.parecido.toLocaleString('es-MX')}</strong> con código parecido</li>
          </ul>
          <p className="muted small">
            {archivo} · {plural(plan.acciones.length + plan.repetidos.length, 'renglón', 'renglones')}
            {plan.negativos ? ` · ${plural(plan.negativos, 'existencia negativa queda', 'existencias negativas quedan')} en 0` : ''}
            {plan.repetidos.length ? ` · ${plural(plan.repetidos.length, 'renglón se omite', 'renglones se omiten')} porque su código ya venía antes en el archivo (${plan.repetidos.slice(0, 5).map(f => f.codigo).join(', ')}${plan.repetidos.length > 5 ? '…' : ''})` : ''}
          </p>
          {plan.danados > 0 && (
            <p className="aviso-sin-stock small">
              {plural(plan.danados, 'producto trae', 'productos traen')} el código dañado por Excel (por ejemplo "4.12103E+11"): se importan sin código y se reconocen por su nombre.
              Para conservar esos códigos, exporta de Aronium y sube el archivo sin abrirlo ni guardarlo en Excel.
            </p>
          )}

          {pendiente && (
            <div className="tarjeta parecido">
              <p><strong>¿Es el mismo producto?</strong> <span className="muted small">({faltan} por revisar)</span></p>
              <p>En el archivo: <strong>{pendiente.fila.nombre}</strong> · código <code>{pendiente.fila.codigo}</code> · ${pendiente.fila.precio}</p>
              {pendiente.candidatos.map(p => (
                <div key={p.id} className="fila-parecido">
                  <span>En BRILLO: <strong>{p.nombre}</strong> · código <code>{p.codigo}</code> · ${p.precioEtiqueta}</span>
                  <button className="btn primario" onClick={() => responder(pendiente.fila, p.id)}>Es el mismo</button>
                </div>
              ))}
              <div className="acciones">
                <button className="btn" onClick={() => responder(pendiente.fila, 'otro')}>Es otro producto</button>
                {faltan > 1 && <button className="btn" onClick={() => responder(pendiente.fila, pendiente.candidatos[0].id, true)}>Todos son el mismo</button>}
                {faltan > 1 && <button className="btn" onClick={() => responder(pendiente.fila, 'otro', true)}>Todos son otros</button>}
              </div>
            </div>
          )}

          {cuenta.actualizar > 0 && (
            <details>
              <summary>Ver lo que se actualiza</summary>
              <ul className="lista-cambios">
                {plan.acciones.flatMap(a => (a.tipo === 'actualizar' ? [a] : [])).slice(0, 200).map(a => (
                  <li key={a.fila.renglon}><strong>{a.producto.nombre}</strong> <span className="muted small">({a.fila.codigo}): {a.cambios.join(', ')}</span></li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {avance && !resultado && !error && <p role="status">Importando… {avance.hechos.toLocaleString('es-MX')} de {avance.total.toLocaleString('es-MX')}</p>}
      {resultado && <p className="aviso-ok" role="status">{resultado}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={onCerrar} disabled={enviando}>{resultado ? 'Cerrar' : 'Cancelar'}</button>
        {plan && !resultado && (
          <button className="btn primario" disabled={enviando || faltan > 0} onClick={() => void importar()}>
            {enviando ? 'Importando…' : faltan ? `Revisa ${faltan} parecido${faltan === 1 ? '' : 's'}` : 'Importar'}
          </button>
        )}
      </div>
    </MarcoModal>
  );
}

export function BotonImportarAronium({ perfil }: { perfil: PerfilUsuario }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setAbierto(true)}>Importar de Aronium</button>
      {abierto && <ModalImportar perfil={perfil} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
