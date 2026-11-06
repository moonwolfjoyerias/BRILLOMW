// Catálogo → "Compartir por WhatsApp": elige la variante, muestra la imagen
// que se va a mandar y la comparte (tablet/celular) o la descarga (PC).
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { etiquetaVariante, type Producto } from '../pagina/producto';
import { compartirImagen, crearImagen, descargarImagen, enCelular, nombreArchivo } from '../compartir/imagenPieza';
import { MarcoModal } from './Modal';

export function CompartirPieza({ producto: p, onCerrar }: { producto: Producto; onCerrar: () => void }) {
  const variantes = p.variantes.length ? p.variantes : [null];
  const [i, setI] = useState(0);
  const [img, setImg] = useState<{ blob: Blob; url: string; nombre: string } | null>(null);
  const [error, setError] = useState(false);
  const celular = enCelular();

  useEffect(() => {
    let vigente = true;
    let url = '';
    setImg(null);
    setError(false);
    crearImagen(db, p, variantes[i])
      .then(blob => {
        if (!vigente) return;
        url = URL.createObjectURL(blob);
        setImg({ blob, url, nombre: nombreArchivo(p, variantes[i]) });
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, i]);

  return (
    <MarcoModal titulo="Compartir por WhatsApp" onCerrar={onCerrar}>
      <p className="muted"><strong>{p.nombre || 'Sin nombre'}</strong>{p.codigo ? ` · ${p.codigo}` : ''}</p>
      {variantes.length > 1 && (
        <>
          <p className="muted small">Elige la variante:</p>
          <div className="chips-variantes">
            {variantes.map((v, n) => (
              <button key={v?.id ?? n} type="button" className={`chip-elegir${n === i ? ' activo' : ''}`} onClick={() => setI(n)}>
                {v ? etiquetaVariante(v) : 'Única'} <span className="small">{v?.stock ?? 0} pza</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="vista-compartir">
        {img ? <img src={img.url} alt={`Imagen para compartir de ${p.nombre || 'la pieza'}`} /> : !error && <p className="muted small">Preparando la imagen…</p>}
      </div>
      {error && <p className="error" role="alert">No se pudo preparar la imagen. Revisa la conexión e inténtalo de nuevo.</p>}
      <div className="acciones">
        {celular && <button type="button" className="btn" disabled={!img} onClick={() => img && descargarImagen(img.blob, img.nombre)}>Descargar</button>}
        <button type="button" className="btn primario" disabled={!img} onClick={() => img && void compartirImagen(img.blob, img.nombre)}>
          {celular ? 'Compartir por WhatsApp' : 'Descargar imagen'}
        </button>
      </div>
      {!celular && <p className="muted small">En la computadora se descarga la imagen: arrástrala al chat de WhatsApp Web.</p>}
    </MarcoModal>
  );
}
