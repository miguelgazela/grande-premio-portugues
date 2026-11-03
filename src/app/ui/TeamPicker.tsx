import { CARS, carDef } from '../../game/teamStyle';
import { assetUrl } from '../../render/assets';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** O carro escolhido (asset original, com as listas e os pneus). */
export function CarPreview({ car, size = 120 }: { car: string; size?: number }) {
  return <img className="carprev" src={assetUrl(`${car}.png`)} alt={carDef(car)?.label ?? ''} draggable={false} style={{ width: size, height: size / 2 }} />;
}

/** Todos os carros: o aluno toca num para votar (sem escolha inicial; só o toque conta como voto). */
export function CarGrid({ value, onPick }: { value: string | null; onPick(car: string): void }) {
  return (
    <div className="cargrid" role="radiogroup" aria-label="Carro da turma">
      {CARS.map((c) => (
        <button key={c.key} type="button" role="radio" aria-checked={value === c.key} className={`carpick ${value === c.key ? 'on' : ''}`} onClick={() => onPick(c.key)}>
          <CarPreview car={c.key} size={104} />
          <small>{c.label}</small>
        </button>
      ))}
    </div>
  );
}
