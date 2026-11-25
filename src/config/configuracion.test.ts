import { afterEach, describe, expect, it } from 'vitest';
import { fijarConfiguracion, numeroConfig } from './configuracion';
import { depositoMinimo, regla } from '../apartados/modelo';
import { HITOS_CONSTANCIA, RANGOS_MW } from '../personas/modelo';

const v = (tipo: string, parametro: string, valor: unknown, vigenteDesde: string, vigenteHasta: string | null = null) => ({ tipo, parametro, valor, vigenteDesde, vigenteHasta });

describe('Configuración de Admin en BRILLO', () => {
  afterEach(() => fijarConfiguracion([]));
  it('sin configuración usa los valores de siempre', () => {
    expect([depositoMinimo({ categoria: 'normal' }), depositoMinimo({ categoria: 'foranea' })]).toEqual([50, 200]);
    expect([regla('normal').dias, regla('foranea').dias, regla('vip').dias]).toEqual([3, 5, null]);
  });
  it('usa la versión vigente hoy (no la vieja ni la futura)', () => {
    fijarConfiguracion([
      v('apartado', 'deposito_base', 80, '2020-01-01', '2026-01-01'),
      v('apartado', 'deposito_base', 100, '2026-01-01'),
      v('apartado', 'deposito_foranea', 999, '2999-01-01'),
      v('apartado', 'ventana_normal_dias', 5, '2025-06-01')
    ]);
    expect([depositoMinimo({ categoria: 'normal' }), depositoMinimo({ categoria: 'foranea' }), regla('normal').dias]).toEqual([100, 200, 5]);
    expect(numeroConfig('apartado', 'deposito_base', 0, '2025-03-01')).toBe(80);
  });
  it('rangos y premios de constancia vigentes; vuelve a los originales sin versión', () => {
    fijarConfiguracion([v('rango', 'plata_produccion', 30000, '2025-01-01'), v('constancia', 'hito_6_meses', 'Celular', '2025-01-01')]);
    expect(RANGOS_MW.find(r => r.key === 'plata')!.produccion).toBe(30000);
    expect(HITOS_CONSTANCIA[0].premio).toBe('Celular');
    fijarConfiguracion([]);
    expect(RANGOS_MW.find(r => r.key === 'plata')!.produccion).toBe(22500);
    expect(HITOS_CONSTANCIA[0].premio).toBe('Tablet');
  });
});
