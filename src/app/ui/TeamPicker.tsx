import { useState } from 'react';
import { MODELS, carDef, carsOfModel, modelDef, modelShowcase } from '../../game/teamStyle';
import { assetUrl } from '../../render/assets';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** O carro escolhido (asset original, com as listas e os pneus). */
export function CarPreview({ car, size = 120 }: { car: string; size?: number }) {
  return <img className="carprev" src={assetUrl(`${car}.png`)} alt={carDef(car)?.label ?? ''} draggable={false} style={{ width: size, height: size / 2 }} />;
}

/** Escolha em 2 passos: modelo, depois cor. Só a cor conta como voto. */
type Step = { k: 'done' } | { k: 'models' } | { k: 'colors'; model: string };

export function CarPicker({ value, onPick }: { value: string | null; onPick(car: string): void }) {
  const [step, setStep] = useState<Step>(() => (value ? { k: 'done' } : { k: 'models' }));
  const voted = carDef(value ?? undefined);

  if (step.k === 'done' && voted) {
    return (
      <div className="vote-done" data-step="done">
        <CarPreview car={voted.key} size={168} />
        <div>
          <small>O teu voto</small>
          <b>{voted.label}</b>
        </div>
        <button type="button" onClick={() => setStep({ k: 'models' })}>Mudar</button>
      </div>
    );
  }

  if (step.k === 'colors') {
    const model = modelDef(step.model)!;
    const cars = carsOfModel(model.id);
    return (
      <div className="step" data-step="colors">
        <div className="step-head">
          <button type="button" className="back" onClick={() => setStep({ k: 'models' })}>‹ Modelos</button>
          <b>{model.label}: escolhe a cor</b>
        </div>
        <div className={`colorgrid n${cars.length}`} role="radiogroup" aria-label={`Cor do ${model.label}`}>
          {cars.map((c) => (
            <button key={c.key} type="button" role="radio" aria-checked={value === c.key} aria-label={c.label} className={`carpick ${value === c.key ? 'on' : ''}`} onClick={() => { onPick(c.key); setStep({ k: 'done' }); }}>
              <CarPreview car={c.key} size={cars.length > 3 ? 120 : 156} />
              <small>{c.label.slice(model.label.length + 1).replace(/^./, (x) => x.toUpperCase())}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="step" data-step="models">
      {voted && (
        <div className="step-head">
          <button type="button" className="back" onClick={() => setStep({ k: 'done' })}>‹ Voltar</button>
          <b>Escolhe o modelo</b>
        </div>
      )}
      <div className="modelgrid" role="radiogroup" aria-label="Modelo do carro">
        {MODELS.map((m) => {
          const show = modelShowcase(m.id)!;
          const cur = voted?.model === m.id;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={cur} aria-label={`${m.label}, ${m.colors.length} cores`} className={`carpick ${cur ? 'on' : ''}`} onClick={() => setStep({ k: 'colors', model: m.id })}>
              <CarPreview car={cur && voted ? voted.key : show.key} size={156} />
              <small>{m.label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
