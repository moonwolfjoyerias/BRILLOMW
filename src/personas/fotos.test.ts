import { describe, expect, it } from 'vitest';
import { esFotoValida } from './fotos';

describe('esFotoValida', () => {
  it('acepta solo JPEG en base64', () => {
    expect(esFotoValida('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
    expect(esFotoValida('https://otro.sitio/foto.jpg')).toBe(false);
    expect(esFotoValida('javascript:alert(1)')).toBe(false);
    expect(esFotoValida('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(esFotoValida('data:image/jpeg;base64,AA"><script>')).toBe(false);
    expect(esFotoValida(undefined)).toBe(false);
  });
});
