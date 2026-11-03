export interface StoredPlayer {
  session_id: string;
  player_id: string;
  nickname: string;
  pin: string;
}

// `?tab=a` (só para testes em várias abas do mesmo browser) separa o armazenamento de cada aluno.
// Só vale em desenvolvimento com `?mock`: em produção, várias abas do mesmo browser são o mesmo aluno.
const params = new URLSearchParams(location.search);
const tabParam = import.meta.env.DEV && params.has('mock') ? params.get('tab') : null;
if (tabParam) sessionStorage.setItem('gpp.tab', tabParam);
const suffix = sessionStorage.getItem('gpp.tab') ? `.${sessionStorage.getItem('gpp.tab')}` : '';
const PLAYER = 'gpp.player' + suffix;
const DEVICE = 'gpp.device' + suffix;

let volatileToken = '';

export function deviceToken(): string {
  try {
    let t = localStorage.getItem(DEVICE);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(DEVICE, t);
    }
    return t;
  } catch {
    volatileToken ||= 'volatile-' + crypto.randomUUID(); // sem armazenamento: o mesmo em toda a página
    return volatileToken;
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
