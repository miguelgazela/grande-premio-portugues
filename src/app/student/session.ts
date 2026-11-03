export interface StoredPlayer {
  session_id: string;
  player_id: string;
  nickname: string;
  pin: string;
}

// `?tab=a` (só para testes em várias abas do mesmo browser) separa o armazenamento de cada aluno.
const tabParam = new URLSearchParams(location.search).get('tab');
if (tabParam) sessionStorage.setItem('gpp.tab', tabParam);
const suffix = sessionStorage.getItem('gpp.tab') ? `.${sessionStorage.getItem('gpp.tab')}` : '';
const PLAYER = 'gpp.player' + suffix;
const DEVICE = 'gpp.device' + suffix;

export function deviceToken(): string {
  try {
    let t = localStorage.getItem(DEVICE);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(DEVICE, t);
    }
    return t;
  } catch {
    return 'volatile-' + Math.random().toString(36).slice(2);
  }
}

export function loadPlayer(): StoredPlayer | null {
  try {
    return JSON.parse(localStorage.getItem(PLAYER) ?? 'null') as StoredPlayer | null;
  } catch {
    return null;
  }
}
export const savePlayer = (p: StoredPlayer) => localStorage.setItem(PLAYER, JSON.stringify(p));
export const clearPlayer = () => localStorage.removeItem(PLAYER);

const AVATAR = 'gpp.avatar' + suffix;
export const loadAvatar = (): string | null => {
  try {
    return localStorage.getItem(AVATAR);
  } catch {
    return null;
  }
};
export const saveAvatar = (a: string) => {
  try {
    localStorage.setItem(AVATAR, a);
  } catch { /* sem armazenamento */ }
};
