# Genius 3D Web (UNICAP — Design de Interface e Usabilidade)

> **Jogue agora online:** https://henrydslima.github.io/genius-web-3d/

Aplicação web interativa, responsiva e acessível do clássico jogo de memória sequencial **Genius (Simon)** em 3D com suporte a **Modo Solo (1P)**, **Multiplayer Local (2P a 4P)** e **Multiplayer Online P2P**, desenvolvida para a disciplina de **Design de Interface e Usabilidade (UNICAP)** seguindo o padrão **IEEE 830**, **Heurísticas de Nielsen**, **WCAG** e **TDD (Vitest)**.

## Recursos Principais

- **Modelo 3D Procedural (Three.js):** Corpo circular escuro, 4 quadrantes translúcidos extrudados com chanfros, iluminação PBR, brilho emissivo, luz pontual dinâmica, afundamento físico no eixo Y e display digital central.
- **Câmera Dinâmica (Showcase ↔ Top-Down):**
  - **Menu Inicial:** Rotação orbital suave (`autoRotate`) com controle livre via mouse ou toque (`OrbitControls`).
  - **Partida:** Transição animada suave para visão **Top-Down** travada, com ajuste automático de distância/FOV para telas retrato e paisagem (`360px` a `1920px+`).
- **Áudio Sintetizado (Web Audio API):** 4 notas musicais distintas, arpejo de vitória de rodada e sinal sonoro de erro, com desbloqueio automático no primeiro gesto (iOS/Android) e controle de mudo.
- **Multiplayer Local e Online (2 a 4 Jogadores):**
  - **Local por Turnos:** Alternância no mesmo dispositivo com aviso visual, pontuação individual, eliminação por erro e modal de vencedor/ranking.
  - **Online via WebRTC P2P (PeerJS):** Crie uma sala com código de 6 caracteres ou compartilhe o link de convite (`?sala=XXXXXX`) sem precisar de backend dedicado. Sincronização Host-Autoritativa em tempo real (todos os jogadores veem os quadrantes 3D acendendo e ouvem as notas ao vivo durante o turno de cada participante).
- **Acessibilidade (WCAG) & Interação Híbrida:**
  - Eventos `pointerdown` de baixa latência (`< 50ms`) sem duplo disparo em telas touch.
  - **Modo Daltonismo / Alto Contraste:** Símbolos geométricos de alto contraste diretamente sobre os quadrantes 3D (`1 ▲`, `2 ●`, `3 ■`, `4 ◆`).
  - **Atalhos de Teclado:** `1/2/3/4`, `Q/W/A/S` ou Setas direcionais para os quadrantes; `Espaço`/`Enter` para iniciar/reiniciar; `M` para mudo; `D` para modo daltonismo; `Esc` para voltar ao Menu 3D.
  - Área de toque mínima `48x48 px` e mensagens com `aria-live="polite"`.
- **Persistência (`localStorage`):** Recordes (Solo e Multiplayer) e preferências de som, dificuldade e acessibilidade.

## Estrutura do Projeto

```text
genius-web-3d/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.ts                 # Orquestração geral da aplicação
    ├── core/
    │   ├── gameEngine.ts       # Máquina de estados pura (regras, turnos, validação)
    │   ├── gameEngine.test.ts  # Suíte de testes unitários TDD (TST-01 a TST-05)
    │   └── storage.ts          # Persistência segura no localStorage
    ├── audio/
    │   └── soundEngine.ts      # Motor de síntese sonora (Web Audio API)
    ├── scene/
    │   ├── geniusScene.ts      # Setup Three.js, luzes, resize e Raycaster
    │   ├── geniusModel.ts      # Modelo 3D procedural + animações + símbolos 3D
    │   └── cameraController.ts # Transições suaves Orbital <-> Top-Down
    └── ui/
        ├── hudController.ts    # Controle do HUD, placar, acessibilidade e teclado
        └── styles.css          # Layout responsivo e tema de alto contraste
```

## Como Executar Localmente

Pré-requisito: **Node.js 18+** (com `npm`).

```bash
cd genius-web-3d

# 1. Instalar dependências
npm install

# 2. Executar suíte de testes unitários (TDD - Vitest)
npm test

# 3. Iniciar servidor de desenvolvimento
npm run dev

# 4. Gerar build estático de produção (Vercel / Netlify / GitHub Pages)
npm run build
```

## Deploy Estático

O arquivo `vite.config.ts` já utiliza `base: './'`, permitindo publicar a pasta `dist/` diretamente na **Vercel**, **Netlify** ou **GitHub Pages** sem configurações adicionais.
