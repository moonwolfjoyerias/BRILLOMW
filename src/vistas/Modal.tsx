// Marco común de los modales de BRILLO (cerrar con Esc, formulario o no)
// y el estado de "guardando… / error" de cada envío.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

export function MarcoModal({ titulo, onCerrar, enviando, children, onEnviar }: {
  titulo: string;
  onCerrar: () => void;
  enviando?: boolean;
  children: ReactNode;
  onEnviar?: (e: FormEvent) => void;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar, enviando]);
  const cabeza = (
    <div className="modal-cabeza">
      <h2>{titulo}</h2>
      <button type="button" className="btn" onClick={onCerrar} disabled={enviando}>Cerrar</button>
    </div>
  );
  return (
    <div className="modal-fondo">
      {onEnviar ? (
        <form className="modal" role="dialog" aria-modal="true" aria-label={titulo} onSubmit={onEnviar} noValidate>
          {cabeza}
          {children}
        </form>
      ) : (
        <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
          {cabeza}
          {children}
        </div>
      )}
    </div>
  );
}

export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function enviar(f: () => Promise<string | null>) {
    setError(null);
    setEnviando(true);
    const err = await f();
    setEnviando(false);
    if (err) setError(err);
  }
  return { enviando, error, setError, enviar };
}
