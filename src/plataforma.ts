// Desde qué equipo se está usando BRILLO, para registrarlo en Actividad.
// Por ahora se deduce de la pantalla (táctil = tablet). Cuando existan las
// apps de escritorio (Tauri) y tablet (Capacitor), se tomará de ellas.
export type Equipo = 'PC' | 'Tablet';

export function equipoActual(): Equipo {
  if (typeof window === 'undefined' || !window.matchMedia) return 'PC';
  return window.matchMedia('(pointer: coarse)').matches ? 'Tablet' : 'PC';
}

export function origenTexto(equipo: Equipo = equipoActual()): string {
  return `BRILLO (${equipo})`;
}
