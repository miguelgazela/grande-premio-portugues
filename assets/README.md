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
- Lote 7 fundos de lobby por tema (JPEG 1920×1086, ampliados de 1344×752): `menu-title-desert|snow|city` (mesma composição do `menu-title`, que fica para a relva). 0,75 créditos.
- Lote 4 menus (JPEG 1920×1086): `menu-title` (centro livre para o logo), `menu-results` (centro livre para pódio/lista).
- Lote 4 temas completos: `track-asphalt-desert|snow|city` (512, opacos), `track-curb-desert|snow|city` (512 de largura, horizontais), props `prop-rocks-desert`, `prop-tumbleweed`, `prop-snowman`, `prop-ice`, `prop-rooftop2`, `prop-fountain`.
- Lote 5 props extra por tema (256 máx., anchor centro), prefixo `prop-g-` (relva), `prop-d-` (deserto), `prop-s-` (neve), `prop-c-` (cidade): g: cow, sheep, hay, pond, picnic, flowers, tractor, windmill; d: camel, oasis, pyramid, tent, cactus2, chest, fossil, balloon; s: igloo, penguins, polarbear, sled, pond, pine2, cabin, mound; c: glassroof, pool, helipad, foodtruck, bus, taxi, billboard, park. Veículos e animais com cabeça para +x (camelo, trator, urso, food truck, autocarro, táxi). Fracos: `prop-s-polarbear` (pouco legível) e `prop-d-camel` (achatado), candidatos a regenerar.
- Logo com escritores (Camões, Pessoa, Eça, Saramago, Sophia; 768 de largura): `ui-logo` = variante 3 (medalhões, em uso), `ui-logo-autores-1..4` (1 bustos, 2 pilotos, 3 medalhões com Gil Vicente, 4 Pessoa a conduzir), `ui-logo-classico` (original sem escritores). ~1 crédito.
- Piloto tema água (lote 8): barcos 256×128 virados para +x, um por modelo e uma cor: `boat-lancha` (vermelha), `boat-mota` (mota de água amarela), `boat-veleiro` (turquesa), `boat-dragao` (barco-dragão verde); `bg-water` (mar, tile 512), `track-asphalt-water` (canal, tile 512), `track-curb-water` (fila de boias, 512 de largura). Tiles ainda não testados 2×2. Resto do tema água: props `prop-w-` island, lighthouse, dolphin, whale, turtle, dock, rocks, cargo (256 máx.; golfinho, baleia, tartaruga e cargueiro com a cabeça/proa para +x), `fx-wake` e `fx-splash` (apontam para -x, anchor [1,0.5] na popa), `menu-title-water` (JPEG 1920×1086, ampliado de 1344×752). Total do tema ~5,25 créditos. O barco-dragão é para experimentar: os remadores não se mexem, decidir se fica.
- Tema doces (lote 9): `bg-candy` (refeito: 1ª versão com ondas e costura, rejeitada em `source/bg-candy-waves-rejected.png`), `track-asphalt-candy` (refeito: a 1ª versão trazia estrada e doces desenhados), `track-curb-candy` (bengalas), props `prop-ca-` cupcake, lollipop, donut, icecream, cake, gummies, gingerbread, cottoncandy (256 máx.) e `menu-title-candy` (JPEG 1920×1086, ampliado de 1344×752). 16 imagens, ~4,8 créditos.
- Tema Espaço (lote 9): 7 naves 256×128 vistas de cima, proa para +x, uma cor cada: `ship-cacador` (vermelho), `ship-disco` (amarelo), `ship-foguetao` (azul-petróleo), `ship-bolha` (roxo), `ship-delta` (verde), `ship-vaivem` (rosa), `ship-crescente` (azul); `bg-space`, `track-asphalt-space` (tiles 512, testados 2×2; o 1.º asfalto saiu estrada sinuosa e foi rejeitado), `track-curb-space` (balizas de néon, 512 de largura); props `prop-sp-` planet, asteroid, satellite, station, ufo, astronaut, comet, moon (256 máx.; astronauta e cometa com a cabeça para +x); `fx-trail-space` (aponta para -x, anchor [1,0.5]); `menu-title-space.jpg` (1920×1086, ampliado de 1344×752). O modelo devolve um xadrez falso em vez de transparência: o script faz flood-fill a partir das margens (claro e pouco saturado) antes de recortar. ~5,5 créditos.
- Lote 10 (2026-11-05, `gpt_image_2_5` medium, ~11 imagens, ~3 créditos): `prop-grandstand-desert|snow` (384 de largura; a cidade reutiliza a da relva), refeitos `prop-d-pyramid`, `prop-d-camel` (agora legíveis), `prop-cone`, `prop-tires` (pneus pretos, vista de cima), `prop-ice`, `prop-s-mound`, `prop-s-pond` (contorno azul-marinho mais forte), `bg-city` (calçada mais escura e menos contrastada), `track-asphalt-city` (sem manchas quadradas). O jogo usa `prop-grandstand-<sufixo>` se existir, senão `prop-grandstand`.
- UI: `ui-logo`, `ui-trophy`, `ui-medal-gold/silver/bronze`, `ui-flame`, `ui-podium`.

- Lote 5 carros por modelo (15, 256×128, cores originais com riscas de corrida, sem número, nariz para +x): `car-coupe-red|yellow|teal`, `car-rally-blue|orange|white`, `car-pickup-green|red|purple`, `car-van-yellow|pink|blue`, `car-kart-orange|green|purple`. Gerados com `gpt_image_2_5` a partir de `cartype-*` como referência; originais em `source/car-<modelo>-<cor>.png`. O jogo usa estes (e os `car-*` clássicos), já não usa `cartype-*` com tint.

## Processamento
Originais (1024px, com halo) em `source/`. Script (fora do repo) corta alpha < 100 (remove o halo), recorta margens e redimensiona (Pillow, venv na scratchpad). Não foi preciso `remove_background`: o modelo gera transparência.

## Créditos
Saldo inicial 174,75. Lote 1: 7,25 créditos (24 imagens). Lote 2: 5,5 (22 imagens). Lote 3: 10 (40 imagens). Modelos de carro: 2 (5 imagens). Lote 4 (menus + temas): 4 (14 imagens). Lote 5 (32 props): 8. Lote 6 (carros por modelo): 3,75 (15 imagens). Total 40,5; saldo final 134,25. Custo real ≈ 0,25–0,3/imagem.

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
