import { useState } from 'react';
import { VEHICLE_WORDS, carDef, carsOfModel, modelDef, modelShowcase, modelsOf, type Category } from '../../game/teamStyle';
import { assetUrl } from '../../render/assets';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** O carro escolhido (asset original, com as listas e os pneus). */
export function CarPreview({ car, size = 120 }: { car: string; size?: number }) {
  return <img className="carprev" src={assetUrl(`${car}.png`)} alt={carDef(car)?.label ?? ''} draggable={false} style={{ width: size, height: size / 2 }} />;
}

/** Escolha em 2 passos: modelo, depois cor. Só a cor conta como voto. */
type Step = { k: 'done' } | { k: 'models' } | { k: 'colors'; model: string };

export function CarPicker({ value, onPick, cat = 'carro' }: { value: string | null; onPick(car: string): void; cat?: Category }) {
  const [step, setStep] = useState<Step>(() => (value ? { k: 'done' } : { k: 'models' }));
  const found = carDef(value ?? undefined);
  const voted = found?.cat === cat ? found : undefined; // um voto de outra categoria (sessão antiga) não conta

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
      <div className="modelgrid" role="radiogroup" aria-label={VEHICLE_WORDS[cat].model}>
        {modelsOf(cat).map((m) => {
          const show = modelShowcase(m.id)!;
          const cur = voted?.model === m.id;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={cur} aria-label={m.colors.length > 1 ? `${m.label}, ${m.colors.length} cores` : m.label} className={`carpick ${cur ? 'on' : ''}`} onClick={() => (m.colors.length > 1 ? setStep({ k: 'colors', model: m.id }) : (onPick(show.key), setStep({ k: 'done' })))}>
              <CarPreview car={cur && voted ? voted.key : show.key} size={156} />
              <small>{m.label}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
