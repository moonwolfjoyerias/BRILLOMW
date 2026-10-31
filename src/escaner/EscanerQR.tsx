// Escanear el QR de una etiqueta con la cámara (tablet, celular o la cámara
// de la PC). Usa el lector del navegador cuando lo tiene (Chrome en Android
// y Mac) y, si no, jsQR (Windows, iPad/iPhone), que se carga solo al abrir
// la cámara. El lector de mano tipo teclado sigue funcionando igual.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Leer = (video: HTMLVideoElement) => Promise<string | null>;

interface DetectorNativo { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> }
interface ClaseDetector {
  new (o: { formats: string[] }): DetectorNativo;
  getSupportedFormats(): Promise<string[]>;
}

async function crearLector(): Promise<Leer> {
  const Nativo = (window as unknown as { BarcodeDetector?: ClaseDetector }).BarcodeDetector;
  if (Nativo) {
    try {
      const formatos = await Nativo.getSupportedFormats();
      if (formatos.includes('qr_code')) {
        const d = new Nativo({ formats: ['qr_code', ...formatos.filter(f => f === 'code_128')] });
        return async v => (await d.detect(v))[0]?.rawValue ?? null;
      }
    } catch {
      /* se usa jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  return async v => {
    if (!v.videoWidth) return null;
    const escala = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    lienzo.width = Math.round(v.videoWidth * escala);
    lienzo.height = Math.round(v.videoHeight * escala);
    ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
    const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  };
}

function mensajeDeError(e: unknown): string {
  const n = (e as { name?: string })?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'No hay permiso para usar la cámara. Permítelo en el candado de la barra de direcciones y vuelve a intentar.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Este equipo no tiene cámara disponible.';
  if (n === 'NotReadableError') return 'La cámara la está usando otra aplicación. Ciérrala y vuelve a intentar.';
  return 'No se pudo abrir la cámara.';
}

export function EscanerQR({ titulo = 'Escanear etiqueta', onCodigo, onCerrar }: {
  titulo?: string;
  onCodigo: (texto: string) => void;
  onCerrar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const alCodigo = useRef(onCodigo);
  alCodigo.current = onCodigo;

  // Esc cierra solo el escáner (no el formulario de abajo).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCerrar();
    };
    document.addEventListener('keydown', alTeclear, true);
    return () => document.removeEventListener('keydown', alTeclear, true);
  }, [onCerrar]);

  useEffect(() => {
    let vivo = true;
    let flujo: MediaStream | null = null;
    let cuadro = 0;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no deja usar la cámara aquí (se necesita la página con https).');
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (e) {
        if (vivo) setError(mensajeDeError(e));
        return;
      }
      if (!vivo || !video.current) return flujo.getTracks().forEach(t => t.stop());
      video.current.srcObject = flujo;
      await video.current.play().catch(() => {});
      const leer = await crearLector();
      if (!vivo) return;
      setListo(true);
      let ultimo = 0;
      let ocupado = false;
      const paso = async (t: number) => {
        if (!vivo) return;
        cuadro = requestAnimationFrame(paso);
        if (ocupado || t - ultimo < 120 || !video.current) return;
        ultimo = t;
        ocupado = true;
        try {
          const texto = (await leer(video.current))?.trim();
          if (texto && vivo) {
            vivo = false;
            navigator.vibrate?.(80);
            alCodigo.current(texto);
          }
        } catch {
          /* cuadro ilegible: se intenta con el siguiente */
        } finally {
          ocupado = false;
        }
      };
      cuadro = requestAnimationFrame(paso);
    })();
    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return createPortal(
    <div className="modal-fondo escaner-fondo">
      <div className="modal escaner" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-cabeza">
          <h2>{titulo}</h2>
          <button type="button" className="btn" onClick={onCerrar}>Cerrar</button>
        </div>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <>
            <div className="escaner-cuadro">
              <video ref={video} playsInline muted />
              <span className="escaner-mira" aria-hidden="true" />
            </div>
            <p className="muted small centro">{listo ? 'Acerca el QR de la etiqueta al recuadro.' : 'Abriendo la cámara…'}</p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Botón con cámara que abre el escáner y entrega lo leído. */
export function BotonCamara({ onCodigo, titulo, etiqueta = 'Escanear con la cámara', className = 'btn' }: {
  onCodigo: (texto: string) => void;
  titulo?: string;
  etiqueta?: string;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={`${className} boton-camara`} onClick={() => setAbierto(true)} aria-label={etiqueta} title={etiqueta}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
          <rect x="8" y="8" width="8" height="8" rx="1" />
        </svg>
      </button>
      {abierto && (
        <EscanerQR
          titulo={titulo}
          onCerrar={() => setAbierto(false)}
          onCodigo={t => {
            setAbierto(false);
            onCodigo(t);
          }}
        />
      )}
    </>
  );
}
