import { describe, expect, it } from 'vitest';

import { studentPathFor } from './classroom-session';

const ID = '0b9f6f8e-6f0a-4a43-9c0e-2c5d7d2b1a11';

describe('studentPathFor', () => {
  it('sends students to a read-only view of the teacher game', () => {
    expect(studentPathFor(`/app/partida/${ID}`)).toBe(`/app/sala/partida/${ID}`);
    expect(studentPathFor(`/app/partida/${ID}?sy=40`)).toBe(`/app/sala/partida/${ID}`);
  });

  it('keeps the demo board and other pages as they are', () => {
    expect(studentPathFor('/app/partida/demo')).toBe('/app/partida/demo');
    expect(studentPathFor('/app/biblioteca/abc?ply=3')).toBe('/app/biblioteca/abc?ply=3');
  });

  it('turns the teacher training exercise into the read-only exercise view with its moves', () => {
    expect(studentPathFor(`/app/treinamento?cx=${ID}&cm=e2e4-e7e5`)).toBe(
      `/app/sala/exercicio/${ID}?m=e2e4-e7e5`,
    );
    expect(studentPathFor(`/app/treinamento?cx=${ID}`)).toBe(`/app/sala/exercicio/${ID}`);
    expect(studentPathFor('/app/treinamento')).toBe('/app/treinamento');
    expect(studentPathFor('/app/treinamento?cx=not-an-id')).toBe('/app/treinamento?cx=not-an-id');
  });
});
