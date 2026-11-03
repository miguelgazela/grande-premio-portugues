import { describe, expect, it } from 'vitest';
import { versionLabel } from './VersionTag';

describe('versionLabel', () => {
  it('formata versão e hora de Lisboa', () => {
    expect(versionLabel('d1a126f', '2026-11-03T19:55:00Z')).toBe('v d1a126f · 3 nov 19:55');
    expect(versionLabel('d1a126f', '2026-07-03T19:55:00Z')).toBe('v d1a126f · 3 jul 20:55');
  });
  it('sem data válida mostra só a versão', () => {
    expect(versionLabel('dev', 'x')).toBe('v dev');
  });
});
