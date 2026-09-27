import { describe, expect, it, vi } from 'vitest';

describe('registerServiceWorker', () => {
  it('배포 빌드가 아니면 등록하지 않고 예외도 없다', async () => {
    const register = vi.fn(async () => ({}));
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    const { registerServiceWorker } = await import('../../src/sw-register');
    expect(() => registerServiceWorker()).not.toThrow();
    expect(register).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
