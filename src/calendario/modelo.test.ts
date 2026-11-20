import { describe, expect, it } from 'vitest';
import * as C from './modelo';
import type { PerfilUsuario } from '../sesion/perfil';

const staff: PerfilUsuario = { uid: 'u', usuario: 'ana', nombre: 'Ana López', rol: 'staff' };
const ahora = new Date('2026-10-27T15:00:00Z');
const datos = (x: Partial<C.DatosEvento> = {}): C.DatosEvento => ({ titulo: ' Desayuno + Rifa ', descripcion: 'Con premios', tipo: 'presencial', fecha: '2026-11-08', hora: '9:30 a.m.', lugarTexto: 'Local 21', enlace: '', imagen: '', acompanantes: C.SIN_ACOMPANANTES, ...x });

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
    expect(csv.split('\r\n')).toEqual([
      '﻿"Evento","Fecha del evento","Nombre","Tipo","Acompañante de","Teléfono","Prospecto","Fecha de confirmación"',
      '"Rifa ""MW""","2026-11-08","Ana","Emprendedora/Líder","","","","F:a"',
      '"Rifa ""MW""","2026-11-08","Zoe","Emprendedora/Líder","","","","F:z"'
    ]);
  });

  it('acompañantes: valida límite y motivo, y guarda solo lo necesario', () => {
    const acomp = (x: Partial<C.ConfigAcompanantes>) => ({ ...C.SIN_ACOMPANANTES, permitido: true, ...x });
    expect(C.validarEvento(datos({ acompanantes: acomp({ limite: 0, prospectos: true }) }))).toEqual({ ok: false, error: 'El máximo de acompañantes por e/l va de 1 a 20.' });
    expect(C.validarEvento(datos({ acompanantes: acomp({ limite: 2, prospectos: false, motivo: ' ' }) }))).toEqual({ ok: false, error: 'Escribe por qué van los acompañantes.' });
    const ok = C.validarEvento(datos({ acompanantes: acomp({ limite: 2, prospectos: true, motivo: 'se ignora' }) }));
    expect(ok.ok).toBe(true);
    const ev = C.nuevoEvento(ok.ok ? ok.datos : datos(), staff, ahora);
    expect(ev.acompanantes).toEqual({ permitido: true, limite: 2, prospectos: true, motivo: '' });
    expect(C.configAcompanantes(ev)).toEqual({ permitido: true, limite: 2, prospectos: true, motivo: '' });
    const sin = C.eventoEditado(ev, datos(), staff, ahora);
    expect(sin.acompanantes).toEqual({ permitido: false });
    expect(C.configAcompanantes(sin)).toBeNull();
  });

  it('lista de asistencia: junta confirmaciones nuevas y viejas, con acompañantes en el CSV', () => {
    const ev = { ...C.nuevoEvento(datos({ acompanantes: { permitido: true, limite: 2, prospectos: true, motivo: '' } }), staff, ahora), asistentes: [{ personaId: 'p1', nombre: 'Zoe', fecha: '2026-10-01T00:00:00Z' }] };
    const base = [C.normalizarAsistencia({ eventoId: ev.id, personaId: 'p2', nombre: 'Ana', fecha: '2026-10-02T00:00:00Z', acompanantes: [{ nombre: 'Luis', telefono: '444' }, { nombre: '' }] })];
    const lista = C.asistentesOrdenados(ev, base);
    expect(lista.map(a => a.nombre)).toEqual(['Ana', 'Zoe']);
    expect(lista[0].acompanantes).toEqual([{ nombre: 'Luis', telefono: '444' }]);
    const csv = C.csvAsistencia(ev, iso => iso.slice(0, 10), base).split('\r\n');
    expect(csv[0]).toContain('"Acompañante de"');
    expect(csv[2]).toBe(`"${ev.titulo}","2026-11-08","Luis","Acompañante","Ana","444","Sí",""`);
  });
});
