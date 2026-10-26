import { describe, expect, it } from 'vitest';
import * as C from './modelo';
import type { PerfilUsuario } from '../sesion/perfil';

const staff: PerfilUsuario = { uid: 'u', usuario: 'ana', nombre: 'Ana López', rol: 'staff' };
const ahora = new Date('2026-10-27T15:00:00Z');
const datos = (x: Partial<C.DatosEvento> = {}): C.DatosEvento => ({ titulo: ' Desayuno + Rifa ', descripcion: 'Con premios', tipo: 'presencial', fecha: '2026-11-08', hora: '9:30 a.m.', lugarTexto: 'Local 21', enlace: '', imagen: '', ...x });

describe('Calendario', () => {
  it('valida con los mismos mensajes que la página', () => {
    expect(C.validarEvento(datos({ titulo: ' ' }))).toEqual({ ok: false, error: 'Escribe el título del evento.' });
    expect(C.validarEvento(datos({ descripcion: '' }))).toEqual({ ok: false, error: 'Agrega una descripción.' });
    expect(C.validarEvento(datos({ fecha: '' }))).toEqual({ ok: false, error: 'Selecciona la fecha del evento.' });
    expect(C.validarEvento(datos({ hora: '' }))).toEqual({ ok: false, error: 'Escribe la hora del evento.' });
    expect(C.validarEvento(datos({ lugarTexto: '' }))).toEqual({ ok: false, error: 'Escribe el lugar del evento.' });
    const r = C.validarEvento(datos());
    expect(r.ok && r.datos.titulo).toBe('Desayuno + Rifa');
  });

  it('nuevo evento con la misma forma que la página', () => {
    const r = C.validarEvento(datos({ imagen: 'data:image/jpeg;base64,x' }));
    if (!r.ok) throw new Error();
    const ev = C.nuevoEvento(r.datos, staff, ahora);
    expect(ev).toMatchObject({ id: `ev-${ahora.getTime()}`, titulo: 'Desayuno + Rifa', tieneFoto: true, asistentes: [], ultimaAccion: { tipo: 'Agregado', empleado: 'Ana López' } });
  });

  it('editar conserva asistentes, origen y campos desconocidos', () => {
    const actual = C.normalizarEvento('ev-1', { titulo: 'A', descripcion: 'b', tipo: 'virtual', fecha: '2026-11-01', hora: '5pm', lugarTexto: 'Zoom', origen: 'emprendedora_lider', asistentes: [{ personaId: 'p1', nombre: 'Vale', fecha: 'f' }], extra: 7 });
    const ed = C.eventoEditado(actual, datos(), staff, ahora);
    expect(ed).toMatchObject({ id: 'ev-1', origen: 'emprendedora_lider', extra: 7, asistentes: [{ nombre: 'Vale' }], tieneFoto: false, ultimaAccion: { tipo: 'Editado' } });
  });

  it('filtra, ordena y resume', () => {
    const a = C.normalizarEvento('a', { titulo: 'Taller', fecha: '2026-12-01', tipo: 'virtual', lugarTexto: 'Zoom' });
    const b = C.normalizarEvento('b', { titulo: 'Desayuno', fecha: '2026-10-01', tipo: 'presencial', lugarTexto: 'Local 21' });
    expect(C.filtrarEventos([a, b], '', '').map(e => e.id)).toEqual(['b', 'a']);
    expect(C.filtrarEventos([a, b], 'zoom', '').map(e => e.id)).toEqual(['a']);
    expect(C.filtrarEventos([a, b], '', 'presencial').map(e => e.id)).toEqual(['b']);
    expect(C.resumenEventos([a, b], '2026-10-27')).toEqual({ total: 2, proximos: 1, presenciales: 1, virtuales: 1 });
  });

  it('CSV de asistencia igual que la página', () => {
    const ev = C.normalizarEvento('e', { titulo: 'Rifa "MW"', fecha: '2026-11-08', asistentes: [{ nombre: 'Zoe', fecha: 'z' }, { nombre: 'Ana', fecha: 'a' }] });
    const csv = C.csvAsistencia(ev, f => `F:${f}`);
    expect(csv.split('\r\n')).toEqual(['﻿"Evento","Fecha del evento","Nombre","Fecha de confirmación"', '"Rifa ""MW""","2026-11-08","Ana","F:a"', '"Rifa ""MW""","2026-11-08","Zoe","F:z"']);
  });
});
