// Mantém o ecrã ligado enquanto a corrida corre (Safari 16.4+). Volta a pedir ao regressar à página.
type Sentinel = { release(): Promise<void> };

export function keepAwake(): () => void {
  let sentinel: Sentinel | null = null;
  let active = true;
  const request = async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
      if (active && wl && document.visibilityState === 'visible') sentinel = await wl.request('screen');
    } catch { /* sem suporte ou recusado */ }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void request();
  };
  document.addEventListener('visibilitychange', onVisible);
  void request();
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release().catch(() => {});
  };
}

export const wakeLockSupported = () => 'wakeLock' in navigator;
