// Candado de BRILLO PILOTO: todo BRILLO usa Firestore a través de
// datos/firestore.ts. Si algún archivo importara 'firebase/firestore'
// directo, sus escrituras se saltarían el piloto y llegarían a los datos
// reales; esta prueba lo impide (y la publicación falla si no pasa).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const PERMITIDOS = ['firebase.ts', 'datos/firestore.ts'];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('Puerta única a Firestore', () => {
  it('ningún archivo importa firebase/firestore directo (salvo la conexión y la puerta)', () => {
    const directos = archivos(SRC)
      .map(p => relative(SRC, p).replace(/\\/g, '/'))
      .filter(p => !PERMITIDOS.includes(p))
      .filter(p => /from\s+['"]firebase\/firestore['"]/.test(readFileSync(join(SRC, p), 'utf8')));
    expect(directos).toEqual([]);
  });

  it('ningún archivo crea cuentas de Firebase Auth fuera de crearAcceso', () => {
    const otros = archivos(SRC)
      .map(p => relative(SRC, p).replace(/\\/g, '/'))
      .filter(p => p !== 'sesion/crearAcceso.ts')
      .filter(p => /createUserWithEmailAndPassword|updatePassword|deleteUser/.test(readFileSync(join(SRC, p), 'utf8')));
    expect(otros).toEqual([]);
  });
});
