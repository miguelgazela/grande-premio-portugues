import { VersionTag } from './ui/VersionTag';
import { PRIVACY_CONTACT, isPlaceholder } from './privacyConfig';

/** Política de privacidade em linguagem simples (alunos e encarregados de educação). */
export function Privacidade() {
  const { responsavel, email, dias } = PRIVACY_CONTACT;
  const missing = isPlaceholder(responsavel) || isPlaceholder(email);
  return (
    <div className="center" style={{ alignItems: 'start' }}>
      <VersionTag />
      <article className="card privacy" style={{ width: 'min(100%, 720px)' }}>
        <h1>Privacidade</h1>
        <p className="muted">Grande Prémio de Português, um jogo de perguntas para a aula.</p>

        <h2>Que dados guardamos</h2>
        <ul>
          <li><b>A alcunha</b> que escreves ao entrar (não precisas de dar o teu nome verdadeiro; usa uma alcunha).</li>
          <li><b>As tuas respostas</b> e <b>o tempo</b> que demoraste a responder.</li>
          <li>Um código aleatório do teu aparelho, só para voltares ao jogo se a página recarregar. Não diz quem és.</li>
        </ul>
        <p>Não há contas, palavras-passe, email, fotografias, localização nem cookies de publicidade ou de seguimento. Não vendemos nem partilhamos dados com ninguém.</p>

        <h2>Para que servem</h2>
        <p>Para fazer o jogo funcionar e para a professora ver como a turma foi (por exemplo, que perguntas correram pior). As alcunhas aparecem no ecrã da sala durante o jogo.</p>

        <h2>Onde ficam</h2>
        <p>Na plataforma Supabase, num servidor na União Europeia (Irlanda, <code>eu-west-1</code>). Só a professora acede às respostas da sua turma.</p>

        <h2>Quanto tempo</h2>
        <p>Passados {dias} dias depois do fim do jogo, as alcunhas são apagadas e substituídas por “Aluno 1”, “Aluno 2”… e o código do aparelho também. Ficam apenas números da turma (por exemplo, a percentagem de respostas certas), que já não ligam a ninguém.</p>

        <h2>No teu aparelho</h2>
        <p>O jogo guarda no navegador a tua alcunha, o avatar e o código do aparelho, só para o jogo funcionar. Podes limpar isto a qualquer momento nas definições do navegador. Não usamos cookies de publicidade.</p>

        <h2>Os teus direitos</h2>
        <p>Tu, ou o teu encarregado de educação, podem pedir para ver ou apagar a tua alcunha e respostas antes do prazo. Basta falar com a professora ou escrever para o contacto abaixo.</p>

        <h2>Contacto</h2>
        <div className={missing ? 'privacy-todo' : 'privacy-contact'}>
          <div><b>Responsável:</b> {responsavel}</div>
          <div><b>Email:</b> {email}</div>
          {missing && <div><b>Atenção:</b> estes campos estão por preencher (ficheiro <code>src/app/privacyConfig.ts</code>).</div>}
        </div>

        <p><a href="#/">← Voltar</a></p>
      </article>
    </div>
  );
}
