import { useState } from 'react';
import { TEAM_COLORS, TEAM_MODELS, TEAM_NAMES, type StyleVote, type TeamStyle } from '../../game/teamStyle';
import { assetUrl } from '../../render/assets';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Carro tingido (multiplicação sobre o corpo cinzento, como o `sprite.tint` do jogo). */
export function CarPreview({ model, color, size = 120 }: { model: string; color: number; size?: number }) {
  const url = assetUrl(`${model}.png`);
  return (
    <span className="carprev" style={{ width: size, height: size / 2, background: hex(color), maskImage: `url(${url})`, WebkitMaskImage: `url(${url})` }}>
      <img src={url} alt="" draggable={false} />
    </span>
  );
}

/**
 * Cor, modelo e nome do carro da turma. Nos alunos `onPick` é um voto; no anfitrião fixa o campo
 * (`fixed` diz quais), e o ✕ larga a escolha da professora.
 */
export function TeamPicker({ value, fixed, onPick, host }: { value: TeamStyle; fixed?: StyleVote; onPick(v: StyleVote): void; host?: boolean }) {
  const [custom, setCustom] = useState('');
  const mark = (k: keyof TeamStyle) => (host && fixed?.[k] !== undefined ? ' fixed' : '');
  return (
    <div className="picker">
      <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
        <CarPreview model={value.model} color={value.color} size={host ? 130 : 150} />
        <b className="team-name">{value.name}</b>
      </div>
      <div className={`opts${mark('color')}`}>
        {TEAM_COLORS.map((c) => (
          <button key={c.value} type="button" aria-label={c.label} className={`swatch ${value.color === c.value ? 'on' : ''}`} style={{ background: hex(c.value) }} onClick={() => onPick({ color: c.value })} />
        ))}
      </div>
      <div className={`opts${mark('model')}`}>
        {TEAM_MODELS.map((m) => (
          <button key={m.key} type="button" className={`model ${value.model === m.key ? 'on' : ''}`} onClick={() => onPick({ model: m.key })}>
            <CarPreview model={m.key} color={value.color} size={56} />
            <small>{m.label}</small>
          </button>
        ))}
      </div>
      <div className={`opts${mark('name')}`}>
        {TEAM_NAMES.map((n) => (
          <button key={n} type="button" className={`chipbtn ${value.name === n ? 'on' : ''}`} onClick={() => onPick({ name: n })}>{n}</button>
        ))}
      </div>
      {host && (
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <input value={custom} maxLength={16} placeholder="Outro nome…" onChange={(e) => setCustom(e.target.value)} style={{ maxWidth: 200 }} />
          <button type="button" disabled={!custom.trim()} onClick={() => { onPick({ name: custom }); setCustom(''); }}>Fixar nome</button>
          {fixed && Object.keys(fixed).length > 0 && <button type="button" onClick={() => onPick({ name: undefined, color: undefined, model: undefined })}>Voltar à votação</button>}
        </div>
      )}
    </div>
  );
}
