// Modo claro / oscuro. La elección se guarda en este equipo; si nunca se ha
// elegido, sigue al sistema (tableta o PC). index.html lo aplica antes de
// pintar para que no parpadee en blanco al abrir.
import { useEffect, useState } from 'react';

export type Tema = 'claro' | 'oscuro';
export const CLAVE_TEMA = 'brillo.tema';

function guardado(): Tema | null {
  try {
    const t = localStorage.getItem(CLAVE_TEMA);
    return t === 'claro' || t === 'oscuro' ? t : null;
  } catch {
    return null;
  }
}

const sistema = (): Tema =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';

export function aplicarTema(t: Tema) {
  document.documentElement.dataset.tema = t;
}

export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => guardado() ?? sistema());
  useEffect(() => aplicarTema(tema), [tema]);
  // Mientras no se elija a mano, sigue los cambios del sistema (p. ej. modo noche automático).
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => guardado() === null && setTema(sistema());
    m.addEventListener('change', alCambiar);
    return () => m.removeEventListener('change', alCambiar);
  }, []);
  const alternar = () => {
    const t: Tema = tema === 'oscuro' ? 'claro' : 'oscuro';
    try {
      localStorage.setItem(CLAVE_TEMA, t);
    } catch {
      // Sin almacenamiento solo dura esta sesión.
    }
    setTema(t);
  };
  return [tema, alternar];
}
