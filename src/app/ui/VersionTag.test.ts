import { describe, expect, it } from 'vitest';
import { versionLabel } from './VersionTag';

describe('versionLabel', () => {
  it('mostra só a versão', () => {
    expect(versionLabel('d1a126f')).toBe('v d1a126f');
  });
});
