import { useState, type ReactNode } from 'react';
import { assetUrl } from '../../render/assets';

/** Imagem do manifest com fallback (emoji ou texto) se o ficheiro não existir. */
export function Asset({ name, fallback = null, alt = '', className, style }: { name: string; fallback?: ReactNode; alt?: string; className?: string; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <img src={assetUrl(`${name}.png`)} alt={alt} className={className} style={style} draggable={false} onError={() => setFailed(true)} />;
}

const MEDALS = ['ui-medal-gold', 'ui-medal-silver', 'ui-medal-bronze'];
const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];

/** Medalha para os 3 primeiros, senão "4º". */
export function Place({ index }: { index: number }) {
  if (index > 2) return <span className="place">{index + 1}º</span>;
  return <Asset name={MEDALS[index]} alt={`${index + 1}º`} className="medal" fallback={<span className="place">{MEDAL_EMOJI[index]}</span>} />;
}

/** Chamas de série de turbos (3 → nitro). */
export function Flames({ streak, nitro }: { streak: number; nitro: boolean }) {
  return (
    <span className={`flames ${nitro ? 'nitro' : ''}`} title="Série de turbos">
      {[0, 1, 2].map((i) => (
        <Asset key={i} name="ui-flame" className={`flame ${nitro || i < streak ? 'on' : ''}`} fallback={<span className={`flame ${nitro || i < streak ? 'on' : ''}`}>🔥</span>} />
      ))}
    </span>
  );
}

const COUNT = ['ui-count-go', 'ui-count-1', 'ui-count-2', 'ui-count-3'];
const COUNT_TEXT = ['VAI!', '1', '2', '3'];

/** 3-2-1-VAI! (value 3,2,1,0). */
export function Countdown({ value }: { value: number }) {
  return (
    <div className="overlay countdown" style={{ background: '#0008' }}>
      <div key={value} className="count-pop">
        <Asset name={COUNT[value]} alt={COUNT_TEXT[value]} className="count-img" fallback={<div className="count-text">{COUNT_TEXT[value]}</div>} />
      </div>
    </div>
  );
}
