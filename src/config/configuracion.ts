// Configuración de Administración (la misma de la página):
// `configuracionVersiones/{id}` — cada parámetro con su vigencia
// (js/configuracion-modelo.js). BRILLO la escucha una vez al entrar
// (useConfiguracion en Principal) y la deja aquí para que los modelos la
// lean sin pasarla de mano en mano. Sin configuración guardada se usan los
// valores de siempre (los mismos que siembra la página).
import { useEffect, useState } from 'react';
import { collection, onSnapshot, type Firestore } from '../datos/firestore';
import { HITOS_CONSTANCIA, RANGOS_MW } from '../personas/modelo';
import type { VersionConfig } from '../comisiones/modelo';

let versiones: VersionConfig[] = [];
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Valor vigente de un parámetro en una fecha (por omisión hoy), como obtenerValorVigente(). */
export function valorConfig(tipo: string, parametro: string, fecha = hoyISO()): unknown {
  const v = versiones
    .filter(x => x.tipo === tipo && x.parametro === parametro)
    .sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
    .find(x => x.vigenteDesde <= fecha && (!x.vigenteHasta || fecha < x.vigenteHasta));
  return v?.valor;
}

export function numeroConfig(tipo: string, parametro: string, porOmision: number, fecha?: string): number {
  const v = valorConfig(tipo, parametro, fecha);
  return typeof v === 'number' && Number.isFinite(v) ? v : porOmision;
}

export function versionesConfig(): VersionConfig[] {
  return versiones;
}

// Valores originales para poder volver a ellos si Admin borra una versión.
const RANGOS_ORIGINALES = RANGOS_MW.map(r => ({ ...r }));
const HITOS_ORIGINALES = HITOS_CONSTANCIA.map(h => ({ ...h }));

/**
 * Deja la configuración vigente. Los requisitos de rango y los premios de
 * constancia se aplican con su valor de HOY, igual que Plan MW de la página.
 */
export function fijarConfiguracion(lista: VersionConfig[]) {
  versiones = lista.filter(v => v && typeof v.tipo === 'string' && typeof v.parametro === 'string' && typeof v.vigenteDesde === 'string');
  RANGOS_MW.forEach((r, i) => {
    const o = RANGOS_ORIGINALES[i];
    if (r.key === 'sin_rango') return;
    r.personas = numeroConfig('rango', `${r.key}_personas`, o.personas);
    r.produccion = numeroConfig('rango', `${r.key}_produccion`, o.produccion);
    r.compra = numeroConfig('rango', `${r.key}_compra`, o.compra);
    r.calificado = numeroConfig('rango', `${r.key}_calificado`, o.calificado);
  });
  HITOS_CONSTANCIA.forEach((h, i) => {
    const premio = valorConfig('constancia', `hito_${h.meses}_meses`);
    h.premio = typeof premio === 'string' && premio.trim() ? premio : HITOS_ORIGINALES[i].premio;
  });
}

/** Escucha la configuración (una vez, en Principal). Devuelve cuántas versiones hay, para volver a pintar. */
export function useConfiguracion(db: Firestore): number {
  const [n, setN] = useState(0);
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'configuracionVersiones'),
        s => {
          fijarConfiguracion(s.docs.map(d => ({ ...(d.data() as VersionConfig) })));
          setN(c => c + 1);
        },
        () => {}
      ),
    [db]
  );
  return n;
}
