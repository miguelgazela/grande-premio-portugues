import { useEffect, useState } from 'react';
import { CARS, MODELS, carDef, carsOfModel, type StyleVote, type TeamStyle } from '../../game/teamStyle';
import { assetUrl } from '../../render/assets';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** O carro escolhido (asset original, com as listas e os pneus). */
export function CarPreview({ car, size = 120 }: { car: string; size?: number }) {
  return <img className="carprev" src={assetUrl(`${car}.png`)} alt={carDef(car)?.label ?? ''} draggable={false} style={{ width: size, height: size / 2 }} />;
}

/**
 * Modelo e cor do carro da turma. Nos alunos `onPick` é um voto; no anfitrião fixa o carro
 * (`fixed`), e "Voltar à votação" larga a escolha da professora.
 */
export function TeamPicker({ value, fixed, onPick, host }: { value: TeamStyle; fixed?: StyleVote; onPick(v: StyleVote): void; host?: boolean }) {
  const cur = carDef(value.car) ?? CARS[0];
  const [model, setModel] = useState(cur.model);
  useEffect(() => setModel(cur.model), [cur.model]); // o carro pode mudar por fora (voto de outro aluno, professora)
  const colors = carsOfModel(model);
  const isFixed = host && fixed?.car !== undefined;
  return (
    <div className="picker">
      <div className="row" style={{ justifyContent: 'center' }}>
        <CarPreview car={cur.key} size={host ? 130 : 160} />
      </div>
      <div className={`opts${isFixed ? ' fixed' : ''}`}>
        {MODELS.map((m) => {
          const first = carsOfModel(m.id).find((c) => c.key === value.car) ?? carsOfModel(m.id)[0];
          return (
            <button key={m.id} type="button" className={`model ${model === m.id ? 'on' : ''}`} onClick={() => { setModel(m.id); onPick({ car: first.key }); }}>
              <CarPreview car={first.key} size={64} />
              <small>{m.label}</small>
            </button>
          );
        })}
      </div>
      <div className={`opts${isFixed ? ' fixed' : ''}`}>
        {colors.map((c) => (
          <button key={c.key} type="button" aria-label={c.label} className={`swatch ${value.car === c.key ? 'on' : ''}`} style={{ background: hex(c.color) }} onClick={() => onPick({ car: c.key })} />
        ))}
      </div>
      {isFixed && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" onClick={() => onPick({ car: undefined })}>Voltar à votação</button>
        </div>
      )}
    </div>
  );
}
