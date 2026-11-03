import { useEffect, useState } from 'react';
import { CARS, MODELS, carDef, carsOfModel, type StyleVote, type TeamStyle } from '../../game/teamStyle';
import { assetUrl } from '../../render/assets';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** O carro escolhido (asset original, com as listas e os pneus). */
export function CarPreview({ car, size = 120 }: { car: string; size?: number }) {
  return <img className="carprev" src={assetUrl(`${car}.png`)} alt={carDef(car)?.label ?? ''} draggable={false} style={{ width: size, height: size / 2 }} />;
}

/** Modelo e cor do carro da turma: cada escolha de um aluno é um voto. */
export function TeamPicker({ value, onPick }: { value: TeamStyle; onPick(v: StyleVote): void }) {
  const cur = carDef(value.car) ?? CARS[0];
  const [model, setModel] = useState(cur.model);
  useEffect(() => setModel(cur.model), [cur.model]); // o carro pode mudar por fora (voto de outro aluno)
  const colors = carsOfModel(model);
  return (
    <div className="picker">
      <div className="row" style={{ justifyContent: 'center' }}>
        <CarPreview car={cur.key} size={160} />
      </div>
      <div className="opts">
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
      <div className="opts">
        {colors.map((c) => (
          <button key={c.key} type="button" aria-label={c.label} className={`swatch ${value.car === c.key ? 'on' : ''}`} style={{ background: hex(c.color) }} onClick={() => onPick({ car: c.key })} />
        ))}
      </div>
    </div>
  );
}
