# Assets visuais

Gerados com Higgsfield (`gpt_image_2_5`, `background: transparent`), a 2026-11-02.

## Guia de estilo
- Referência escolhida: `source/style/style-opt1.png` (opção 1 de 4; as outras ficam em `source/style/`).
- Prompt base da referência: ver `source/style/prompt.txt`.
- Prompt base dos assets: "top-down cartoon, vibrant saturated colors, thick dark outlines, flat shading, kid-friendly", mais a imagem de referência (`image_references`) e "transparent background, no glow, no shadow, no text".
- Carros: referência extra = `car-team` (carro azul), "nose pointing RIGHT", "same shape and proportions".

## Conteúdo (`public/assets/`, descrito em `manifest.json`)
- Carros 256×128, virados para +x: `car-team` (azul), `car-red`, `car-orange`, `car-purple`, `car-teal`, `car-pink`, `car-grey`, `car-green`. Todos têm o número "1" pintado.
- `bg-grass` 512×512 (opaco, tile sem costura verificado com 2×2).
- Props: `prop-tree`, `prop-bush`, `prop-cone`, `prop-tires`, `prop-grandstand`, `prop-startline` (faixa axadrezada vertical; sem pórtico completo).
- FX: `fx-turbo`, `fx-nitro` (apontam para -x, anchor `[1,0.5]` no bocal), `fx-smoke`.
- Lote 2 temas: `bg-desert`, `bg-snow`, `bg-city` (tiles 512×512 opacos) e props equivalentes à árvore: `prop-cactus`, `prop-pine`, `prop-rooftop`.
- Lote 2 avatares 192×192: `avatar-` + dog, cat, rabbit, fox, bear, panda, lion, tiger, monkey, frog, pig, penguin, owl, elephant, chick, octopus (16).
- Lote 3 avatares (24): `avatar-robot-` red, blue, green, yellow, purple, orange, pink, teal, silver, space, lime, gold; `avatar-hero-` blue, red, green, yellow, purple, orange, pink, teal, shield, pilot, mask, ninja (heróis originais, sem personagens protegidos).
- Lote 3 pista: `track-asphalt` (tile 512), `track-curb` (faixa laranja/branca horizontal), `fx-skid`, `fx-oil`, `fx-confetti`.
- Lote 3 UI: `ui-check`, `ui-cross`, `ui-star`, `ui-banner` (faixa vazia, texto por cima), `ui-traffic-light`, `ui-count-3/2/1`, `ui-count-go` ("VAI!"), `ui-shield`, `ui-nitro`.
- Modelos de carro (tintáveis, corpo cinzento claro, sem número, 256×128, virados para +x): `cartype-coupe`, `cartype-kart`, `cartype-pickup`, `cartype-van`, `cartype-rally`. Usar `sprite.tint`; o kart é mais escuro e tinge menos.
- Lote 4 menus (JPEG 1920×1086): `menu-title` (centro livre para o logo), `menu-results` (centro livre para pódio/lista).
- Lote 4 temas completos: `track-asphalt-desert|snow|city` (512, opacos), `track-curb-desert|snow|city` (512 de largura, horizontais), props `prop-rocks-desert`, `prop-tumbleweed`, `prop-snowman`, `prop-ice`, `prop-rooftop2`, `prop-fountain`.
- UI: `ui-logo`, `ui-trophy`, `ui-medal-gold/silver/bronze`, `ui-flame`, `ui-podium`.

- Lote 5 carros por modelo (15, 256×128, cores originais com riscas de corrida, sem número, nariz para +x): `car-coupe-red|yellow|teal`, `car-rally-blue|orange|white`, `car-pickup-green|red|purple`, `car-van-yellow|pink|blue`, `car-kart-orange|green|purple`. Gerados com `gpt_image_2_5` a partir de `cartype-*` como referência; originais em `source/car-<modelo>-<cor>.png`. O jogo usa estes (e os `car-*` clássicos), já não usa `cartype-*` com tint.

## Processamento
Originais (1024px, com halo) em `source/`. Script (fora do repo) corta alpha < 100 (remove o halo), recorta margens e redimensiona (Pillow, venv na scratchpad). Não foi preciso `remove_background`: o modelo gera transparência.

## Créditos
Saldo inicial 174,75. Lote 1: 7,25 créditos (24 imagens). Lote 2: 5,5 (22 imagens). Lote 3: 10 (40 imagens). Modelos de carro: 2 (5 imagens). Lote 4 (menus + temas): 4 (14 imagens). Total 28,75; saldo final 146. Lote 5 (carros por modelo): 3,75 (15 imagens; saldo 134,25). Custo real ≈ 0,25–0,3/imagem.

## Fica por fazer
- Sem ícone "+1" (usar `ui-star` + texto do jogo). `track-asphalt`/`track-curb` não testados em tile.
- Tiles dos temas não testados 2×2 (relva sim). Os temas não têm estrada/bordas próprias.
- Bancada e start-line podem precisar de rotação conforme a pista; carros todos com "1".

## Backlog de assets (por gerar, decidir depois da integração da Fase 1)
1. ~~Carros: versão sem número e modelos diferentes~~ feito (`cartype-*`).
2. Pista: curvas, linha de partida em asfalto e transição relva/estrada (arte em vez de linhas desenhadas).
3. ~~Fundos de menu~~ feito.
4. ~~Temas completos~~ feito.
5. Mascote/piloto da turma para vitória e logo.
6. Mais avatares: dinossauros, alienígenas, monstros fofos, comida.
Custo estimado: ~0,25–0,3 créditos/imagem.
