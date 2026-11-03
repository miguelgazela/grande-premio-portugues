import { useEffect, useRef, useState } from 'react';
import { Asset } from '../ui/Asset';

const GROUPS = [
  { id: 'animais', label: 'Animais', test: (k: string) => !k.startsWith('avatar-robot-') && !k.startsWith('avatar-hero-') },
  { id: 'robos', label: 'Robôs', test: (k: string) => k.startsWith('avatar-robot-') },
  { id: 'herois', label: 'Heróis', test: (k: string) => k.startsWith('avatar-hero-') },
] as const;

const NAMES: Record<string, string> = {
  bear: 'urso', cat: 'gato', chick: 'pintainho', dog: 'cão', elephant: 'elefante', fox: 'raposa', frog: 'rã', lion: 'leão',
  monkey: 'macaco', octopus: 'polvo', owl: 'coruja', panda: 'panda', penguin: 'pinguim', pig: 'porco', rabbit: 'coelho', tiger: 'tigre',
  blue: 'azul', green: 'verde', mask: 'máscara', ninja: 'ninja', orange: 'laranja', pilot: 'piloto', pink: 'rosa', purple: 'roxo',
  red: 'vermelho', shield: 'escudo', teal: 'turquesa', yellow: 'amarelo', gold: 'dourado', lime: 'lima', silver: 'prateado', space: 'espacial',
};
export const avatarLabel = (key: string) => {
  const rest = key.replace('avatar-', '');
  if (rest.startsWith('robot-')) return `Robô ${NAMES[rest.slice(6)] ?? rest.slice(6)}`;
  if (rest.startsWith('hero-')) return `Herói ${NAMES[rest.slice(5)] ?? rest.slice(5)}`;
  return NAMES[rest] ?? rest;
};

/** Botão com o avatar atual (grande) que abre uma folha com a lista por categorias. */
export function AvatarPicker({ avatars, value, onChange }: { avatars: string[]; value: string | null; onChange: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  if (!value) return null;
  const close = () => { setOpen(false); opener.current?.focus(); };
  return (
    <>
      <button type="button" ref={opener} className="avatar-current" onClick={() => setOpen(true)} aria-haspopup="dialog"
        aria-label={`Avatar: ${avatarLabel(value)}. Tocar para escolher outro entre ${avatars.length}`}>
        <Asset name={value} alt="" />
        <span className="avatar-change">Mudar</span>
      </button>
      {open && <AvatarSheet avatars={avatars} value={value} onPick={(k) => { onChange(k); close(); }} onClose={close} />}
    </>
  );
}

function AvatarSheet({ avatars, value, onPick, onClose }: { avatars: string[]; value: string; onPick: (k: string) => void; onClose: () => void }) {
  const groups = GROUPS.map((g) => ({ ...g, keys: avatars.filter(g.test) })).filter((g) => g.keys.length);
  const [tab, setTab] = useState(() => groups.find((g) => g.keys.includes(value))?.id ?? groups[0]?.id);
  const current = groups.find((g) => g.id === tab) ?? groups[0];
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" ref={sheet} role="dialog" aria-modal="true" aria-label="Escolhe o teu avatar" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>Escolhe o teu avatar</strong>
          <button type="button" className="sheet-close" onClick={onClose}>Fechar</button>
        </div>
        <div className="avatar-tabs" role="tablist" aria-label="Categorias">
          {groups.map((g) => (
            <button type="button" key={g.id} role="tab" aria-selected={g.id === current.id} className={g.id === current.id ? 'on' : ''} onClick={() => setTab(g.id)}>
              {g.label} <span>{g.keys.length}</span>
            </button>
          ))}
        </div>
        <div className="avatar-grid" role="radiogroup" aria-label={current.label}>
          {current.keys.map((k) => (
            <button type="button" key={k} role="radio" aria-checked={k === value} aria-label={avatarLabel(k)} className={k === value ? 'on' : ''} onClick={() => onPick(k)}>
              <Asset name={k} alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
