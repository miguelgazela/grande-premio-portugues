# Backlog: acertos depois do teste

Problemas vistos nos testes, com o diagnóstico e a proposta de solução. Resolvem-se em conjunto.

## Pista (render)

### 1. Curbs partidos nas curvas ✅ RESOLVIDO
**Resolvido**: Curb gerado em código (base laranja + quads brancos por normais de vértice); nova pista 1800×1140 com raio mínimo ~90; testes de geometria em `engine.test.ts`.

**Visto**: na parte de fora das curvas os blocos laranja/brancos abrem buracos; na parte de dentro sobrepõem-se e encavalitam. No gancho apertado cruzam-se com a estrada vizinha.
**Causa**: os curbs são sprites retangulares rígidos colocados ao longo da borda. Um retângulo reto não acompanha a curva. Além disso, no gancho o raio da curva é menor que meia largura da estrada + curb, por isso a borda de dentro "dobra-se" sobre si própria.
**Solução**:
- Desenhar os curbs como uma **faixa contínua gerada em código**, com quads entre amostras consecutivas da borda (lado de dentro e lado de fora da faixa ao longo da normal) e as cores laranja/branco a alternar por distância percorrida. Fica sem buracos e sem sobreposições em qualquer curva.
- Garantir um **raio mínimo** da pista, suavizando/afastando os pontos de controlo, para a borda de dentro nunca se dobrar.
- Testar que a borda não se auto-interseta (teste no motor da pista).

### 2. Plateia pequena e só uma ✅ RESOLVIDO
**Resolvido**: 3 bancadas (a principal junto à meta), nas retas mais direitas, do lado de fora, validadas contra todos os troços.

**Visto**: uma única bancada, pequena para a escala da pista.
**Solução**: bancadas maiores, 2–3 ao longo das retas (a principal junto à partida/meta) e talvez público dos dois lados da reta da meta. Com a câmara a seguir o carro (ponto 4) a escala relativa muda, por isso afina-se depois disso.

### 3. Props por cima ou por baixo da pista ✅ RESOLVIDO
**Resolvido**: Props só aceites longe de todos os troços, numa camada acima da estrada ordenada por y.

**Visto**: cones e pneus em cima dos curbs ou entre duas partes da estrada que ficam perto (ex.: no gancho).
**Causa**: os props são espalhados aleatoriamente e só se verifica a distância à estrada num sentido, não a todos os troços. Também partilham a ordem de desenho com a estrada.
**Solução**: um prop só é aceite se estiver longe de **todos** os troços da pista (meia largura + curb + raio do prop + margem). Os props ficam sempre numa camada acima da estrada, e a ordem por y dá profundidade.

## Câmara

### 4. Câmara a seguir o carro da turma ✅ RESOLVIDO
**Resolvido**: Zoom 2,2×, lerp + look-ahead, zoom-out no turbo/nitro, tremor no despiste, minimapa no canto inferior direito do palco. `sim.html` mantém a vista global.

**Visto**: a vista da pista inteira fica pequena e pouco emocionante no projetor.
**Solução**:
- Câmara com **zoom de ~2–2,5×**, centrada no carro da turma e a segui-lo com suavização (lerp), sem rodar.
- Mantém um pouco de avanço ("look-ahead") na direção do movimento, para se ver o que vem.
- **Minimapa** num canto com a pista inteira e um ponto por carro (como no Turbo Times Tables), para não se perder a noção das posições.
- Zoom ligeiramente para fora no turbo/nitro (sensação de velocidade) e pequeno tremor no despiste.
- Com a câmara a seguir, a pista pode ser maior e mais variada (mais retas e curvas largas), o que também ajuda o ponto 1.

## Sessões

### 5. Terminar sessões ativas ✅ RESOLVIDO
**Resolvido**: `abortSession` (supabase + mock), botões Terminar/Terminar todas, diálogo no lobby e na pausa, mensagem `aborted`, limpeza >12 h ao listar. Sem SQL novo.

**Visto**: em "Sessões em curso" (`Jogar.tsx`) só existe "Abrir". O "← Sair" do lobby volta ao menu mas a sessão continua em `lobby`/`running` e o PIN fica ocupado.
**Solução**:
- Botão **"Terminar"** em cada sessão da lista e, com confirmação, no lobby e no menu de pausa da corrida.
- Terminar põe `status = 'aborted'` e `finished_at`, e envia aos alunos uma mensagem `aborted`. No iPad deles aparece "A professora terminou a sessão" e o botão para voltar ao início.
- Não grava `race_record`, porque uma corrida incompleta não serve de fantasma. As respostas já dadas ficam guardadas, mas **as sessões terminadas a meio ficam fora do histórico e do relatório** (decidido).
- **"Terminar todas"** quando houver mais de uma.
- **Limpeza automática**: sessões em `lobby` ou `running` há mais de ~12 h passam a `aborted` (ao abrir a lista, ou com uma função SQL), para não ficarem PINs presos.
- Ao clicar em "← Sair" no lobby, perguntar se é para terminar a sessão ou só voltar ao menu.
