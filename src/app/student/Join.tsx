import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../lib/api';
import { loadAvatarKeys } from '../../render/assets';
import { Asset } from '../ui/Asset';
import { AvatarPicker } from './AvatarPicker';
import { useApi } from '../useApi';
import { deviceToken, loadAvatar, loadPlayer, saveAvatar, savePlayer } from './session';

export function Join() {
  const api = useApi();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState<'pin' | 'nick'>(params.get('pin') ? 'nick' : 'pin');
  const [pin, setPin] = useState((params.get('pin') ?? '').replace(/\D/g, '').slice(0, 6));
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previous = loadPlayer();
  const [avatars, setAvatars] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string | null>(loadAvatar());

  useEffect(() => {
    void loadAvatarKeys().then((keys) => {
      setAvatars(keys);
      setAvatar((cur) => (cur && keys.includes(cur) ? cur : keys.length ? keys[Math.floor(Math.random() * keys.length)] : null));
    });
  }, []);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'pin') {
      if (pin.length === 6) setStep('nick');
      return;
    }
    if (!api) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.joinSession(pin, nick.trim(), deviceToken());
      if (avatar) saveAvatar(avatar);
      savePlayer({ session_id: r.session_id, player_id: r.player_id, nickname: r.nickname, pin });
      nav('/jogar');
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      if (msg === 'PIN inválido') setStep('pin');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card" onSubmit={join}>
        <Asset name="ui-logo" alt="Grande Prémio de Português" className="join-logo" fallback={<h1 style={{ textAlign: 'center' }}>🏎️ Grande Prémio</h1>} />
        {step === 'pin' ? (
          <>
            <input inputMode="numeric" autoComplete="off" placeholder="PIN do jogo" value={pin} maxLength={6} autoFocus
              style={{ fontSize: '2rem', textAlign: 'center', letterSpacing: '.2em' }}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
            <button className="primary big" disabled={pin.length !== 6}>Entrar</button>
          </>
        ) : (
          <>
            <div className="muted" style={{ textAlign: 'center' }}>PIN {pin} · <a href="#/" onClick={(e) => { e.preventDefault(); setStep('pin'); }} style={{ color: 'inherit' }}>mudar</a></div>
            <div className="nick-row">
              <AvatarPicker avatars={avatars} value={avatar} onChange={setAvatar} />
              <input placeholder="A tua alcunha" value={nick} maxLength={20} autoFocus autoComplete="off" style={{ fontSize: '1.6rem', textAlign: 'center' }}
                onChange={(e) => setNick(e.target.value)} />
            </div>
            <button className="primary big" disabled={busy || !api || !nick.trim()}>{busy ? 'A entrar…' : 'Vamos!'}</button>
          </>
        )}
        {error && <div className="error" style={{ textAlign: 'center' }}>{error}</div>}
        {previous && step === 'pin' && (
          <button type="button" onClick={() => nav('/jogar')}>Voltar a {previous.nickname} (PIN {previous.pin})</button>
        )}
        <a href="#/privacidade" className="privacy-link">Privacidade</a>
      </form>
    </div>
  );
}
