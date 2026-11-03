import { TEAM_COLORS, carKeyFor, type StyleVote, type TeamStyle } from '../../game/teamStyle';
import { assetUrl } from '../../render/assets';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** O carro da cor escolhida (o asset original, com as listas e os pneus). */
export function CarPreview({ color, size = 120 }: { color: number; size?: number }) {
  return <img className="carprev" src={assetUrl(`${carKeyFor(color)}.png`)} alt="" draggable={false} style={{ width: size, height: size / 2 }} />;
}

/**
 * Cor do carro da turma. Nos alunos `onPick` é um voto; no anfitrião fixa a cor
 * (`fixed`), e "Voltar à votação" larga a escolha da professora.
 */
export function TeamPicker({ value, fixed, onPick, host }: { value: TeamStyle; fixed?: StyleVote; onPick(v: StyleVote): void; host?: boolean }) {
  return (
    <div className="picker">
      <div className="row" style={{ justifyContent: 'center' }}>
        <CarPreview color={value.color} size={host ? 130 : 150} />
      </div>
      <div className={`opts${host && fixed?.color !== undefined ? ' fixed' : ''}`}>
        {TEAM_COLORS.map((c) => (
          <button key={c.value} type="button" aria-label={c.label} className={`swatch ${value.color === c.value ? 'on' : ''}`} style={{ background: hex(c.value) }} onClick={() => onPick({ color: c.value })} />
        ))}
      </div>
      {host && fixed?.color !== undefined && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" onClick={() => onPick({ color: undefined })}>Voltar à votação</button>
        </div>
      )}
    </div>
  );
}
