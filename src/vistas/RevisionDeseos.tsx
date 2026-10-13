// Al dar de alta un producto: "¿Alguien pedía algo como esto?" — el mismo
// paso que la página (js/catalogo-notificar-deseos.js). Revisión MANUAL:
// ninguna solicitud se marca sola; las elegidas pasan a "Disponible" y se
// le avisa a quien la pidió.
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { equipoActual } from '../plataforma';
import type { PerfilUsuario } from '../sesion/perfil';
import { COL_DESEOS, guardarDeseo, useListaDeseos } from '../deseos/acciones';
import { cambiarEstado } from '../deseos/modelo';
import { MarcoModal, useEnvio } from './Modal';

export function RevisionDeseos({
  producto,
  perfil,
  onCerrar
}: {
  producto: { id: string; nombre: string };
  perfil: PerfilUsuario;
  onCerrar: (marcadas: number) => void;
}) {
  const datos = useListaDeseos(db);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const { enviando, error, enviar } = useEnvio();
  const pendientes = datos.estado === 'listo' ? datos.deseos.filter(s => s.estado === 'pendiente' || s.estado === 'en_seguimiento') : [];
  const nada = datos.estado === 'error' || (datos.estado === 'listo' && !pendientes.length);

  // Nada que revisar: no hace falta un modal vacío.
  useEffect(() => {
    if (nada) onCerrar(0);
  }, [nada, onCerrar]);
  if (datos.estado !== 'listo' || nada) return null;

  const alternar = (id: string) => setElegidas(es => (es.includes(id) ? es.filter(x => x !== id) : [...es, id]));

  function marcar() {
    if (!elegidas.length) return onCerrar(0);
    void enviar(async () => {
      let hechas = 0;
      for (const id of elegidas) {
        const r = await guardarDeseo(
          db,
          COL_DESEOS,
          id,
          a => (a ? cambiarEstado(a, 'disponible', { comentario: `Coincide con el producto nuevo: ${producto.nombre}`, productoId: producto.id }, perfil) : { ok: false, error: 'Esa solicitud ya no existe.' }),
          perfil,
          equipoActual()
        );
        if (!r.ok) return hechas ? `Se marcaron ${hechas}; la siguiente falló: ${r.error}` : r.error;
        hechas++;
      }
      onCerrar(hechas);
      return null;
    });
  }

  return (
    <MarcoModal titulo={`¿Alguien pedía algo como "${producto.nombre}"?`} onCerrar={() => onCerrar(0)} enviando={enviando}>
      <p className="muted">
        Hay {pendientes.length} solicitud{pendientes.length === 1 ? '' : 'es'} pendiente{pendientes.length === 1 ? '' : 's'} en la Lista de deseos.
        Marca las que de verdad coincidan con esta pieza; ninguna se marca sola.
      </p>
      <fieldset className="piezas-liquidar revision-deseos">
        <legend>Solicitudes pendientes</legend>
        {pendientes.map(s => (
          <label key={s.id} className="check">
            <input type="checkbox" checked={elegidas.includes(s.id)} onChange={() => alternar(s.id)} />
            <span>
              <strong>{s.destinatario === 'emprendedora' ? s.personaNombre || '(sin nombre)' : 'Público en general'}</strong>
              <span className="muted small bloque">{s.piezas.map(p => p.producto).join(', ')}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button className="btn" onClick={() => onCerrar(0)} disabled={enviando}>Omitir</button>
        <button className="btn primario" onClick={marcar} disabled={enviando}>{enviando ? 'Guardando…' : 'Marcar como disponibles'}</button>
      </div>
    </MarcoModal>
  );
}
