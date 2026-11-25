// ============================================================================
// CONTROLADOR DA INTERFACE HUD E ACESSIBILIDADE — GENIUS 3D WEB (UNICAP)
// Gerencia menus HTML (Local e Multiplayer Online), placar em tempo real,
// faixa de turnos multiplayer, modo daltonismo/alto contraste, modal de fim
// de jogo e atalhos de teclado.
// Atende aos requisitos RF-04, RF-05, RNF-02 e RNF-03.
// ============================================================================

import { CorGenius, EstadoPartidaSnapshot, Jogador } from '../core/gameEngine';
import {
  CATALOGO_CENARIOS,
  Cenario3D,
  cenarioEstaDesbloqueado,
  CorCarcaca,
  Dificuldade,
  PreferenciasSalvas,
  TemaVisual,
} from '../core/storage';
import { FiltroRanking, ResultadoRanking } from '../network/leaderboardService';
import { PapelOnline } from '../network/onlineManager';
import { EstadoLobbyOnline, normalizarCodigoSala } from '../network/onlineProtocol';
import { AreaSeguraHud } from '../scene/cameraController';

export type TipoStatusVisual = 'padrao' | 'aguardando' | 'sucesso' | 'erro';
export type AbaMenu = 'local' | 'online';

export interface CallbacksHud {
  onIniciarPartida: (quantidadeJogadores: number, dificuldade: Dificuldade) => void;
  onReiniciarPartida: () => void;
  onVoltarMenu: () => void;
  onAlternarSom: () => void;
  onAlternarTema: () => void;
  onAlternarDaltonismo: () => void;
  onAlterarDificuldade: (dificuldade: Dificuldade) => void;
  onAlterarQuantidadeJogadores: (quantidade: number) => void;
  onTeclaQuadrante: (cor: CorGenius) => void;
  onAlterarCorCarcaca: (cor: CorCarcaca) => void;
  onAlterarCenario: (cenario: Cenario3D) => void;

  // Callbacks do Multiplayer Online (WebRTC / PeerJS)
  onCriarSalaOnline: (apelido: string, dificuldade: Dificuldade) => void;
  onEntrarSalaOnline: (codigo: string, apelido: string) => void;
  onSairSalaOnline: () => void;
  onIniciarPartidaOnline: () => void;
  onAlterarDificuldadeOnline: (dificuldade: Dificuldade) => void;
  onCopiarLinkConvite: () => void;

  // Callbacks de feedback sonoro lúdico da interface (Tomodachi / Nintendo feel)
  onSomHoverUI: () => void;
  onSomCliqueUI: () => void;
  onSomConfirmarUI: () => void;
  onSomVoltarUI: () => void;

  // Callback disparado sempre que a área livre entre elementos do HUD muda
  onAreaSeguraAlterada: (area: AreaSeguraHud) => void;

  // Callbacks do Ranking Global (Supabase)
  onAbrirRanking: (filtro: FiltroRanking) => void;
  onEnviarPontuacaoRanking: (apelido: string) => void;
}

/**
 * Mapeamento de atalhos de teclado para os 4 quadrantes (RNF-02):
 * - Números: 1 (Verde), 2 (Vermelho), 3 (Amarelo), 4 (Azul)
 * - Letras ergonômicas: Q (Verde), W (Vermelho), A (Amarelo), S (Azul)
 * - Setas direcionais: Cima (Verde), Direita (Vermelho), Baixo (Amarelo), Esquerda (Azul)
 */
const MAPA_TECLAS_QUADRANTES: Record<string, CorGenius> = {
  '1': 'verde',
  q: 'verde',
  arrowup: 'verde',
  '2': 'vermelho',
  w: 'vermelho',
  arrowright: 'vermelho',
  '3': 'amarelo',
  a: 'amarelo',
  arrowdown: 'amarelo',
  '4': 'azul',
  s: 'azul',
  arrowleft: 'azul',
};

export class HudController {
  private readonly callbacks: CallbacksHud;

  // Referências aos elementos principais do DOM
  private readonly elRodada: HTMLElement;
  private readonly elRecorde: HTMLElement;
  private readonly btnSom: HTMLButtonElement;
  private readonly iconeSom: HTMLElement;
  private readonly btnTema: HTMLButtonElement;
  private readonly iconeTema: HTMLElement;
  private readonly labelTema: HTMLElement;
  private readonly btnCustomizar: HTMLButtonElement;
  private readonly btnDaltonismo: HTMLButtonElement;
  private readonly btnMenu: HTMLButtonElement;
  private readonly elStatusBanner: HTMLElement;
  private readonly elMultiplayerStrip: HTMLElement;
  private readonly elMenuPanel: HTMLElement;
  private readonly elHudFooter: HTMLElement;
  private readonly btnIniciar: HTMLButtonElement;
  private readonly elModal: HTMLElement;
  private readonly elModalBadge: HTMLElement;
  private readonly elModalTitulo: HTMLElement;
  private readonly elModalSubtitulo: HTMLElement;
  private readonly elModalRanking: HTMLElement;
  private readonly btnReiniciar: HTMLButtonElement;
  private readonly btnModalMenu: HTMLButtonElement;

  // Referências do Modal de Customização Visual
  private readonly elCustomModal: HTMLElement;
  private readonly elCustomPontos: HTMLElement;
  private readonly elCenarioGrid: HTMLElement;
  private readonly btnFecharCustom: HTMLButtonElement;
  private readonly botoesCarcaca: HTMLButtonElement[];

  // Referências do Ranking Global e envio no Game Over
  private readonly btnRanking: HTMLButtonElement;
  private readonly elRankingModal: HTMLElement;
  private readonly elRankingOrigemBadge: HTMLElement;
  private readonly elRankingAviso: HTMLElement;
  private readonly elRankingLista: HTMLElement;
  private readonly btnAtualizarRanking: HTMLButtonElement;
  private readonly btnFecharRanking: HTMLButtonElement;
  private readonly botoesFiltroRanking: HTMLButtonElement[];
  private readonly elGameOverSubmitBox: HTMLElement;
  private readonly inputApelidoRanking: HTMLInputElement;
  private readonly btnEnviarRanking: HTMLButtonElement;
  private readonly elGameOverSubmitFeedback: HTMLElement;
  private filtroRankingAtual: FiltroRanking = 'todas';

  // Referências das abas e painel Online
  private readonly tabLocal: HTMLButtonElement;
  private readonly tabOnline: HTMLButtonElement;
  private readonly panelLocal: HTMLElement;
  private readonly panelOnline: HTMLElement;
  private readonly onlineConnectView: HTMLElement;
  private readonly onlineLobbyView: HTMLElement;
  private readonly inputApelido: HTMLInputElement;
  private readonly inputCodigoSala: HTMLInputElement;
  private readonly btnCriarSala: HTMLButtonElement;
  private readonly btnEntrarSala: HTMLButtonElement;
  private readonly elLobbyCodigo: HTMLElement;
  private readonly btnCopiarConvite: HTMLButtonElement;
  private readonly btnSairSala: HTMLButtonElement;
  private readonly elLobbyJogadores: HTMLElement;
  private readonly elLobbyDificuldadeBox: HTMLElement;
  private readonly btnIniciarOnline: HTMLButtonElement;
  private readonly elLobbyGuestHint: HTMLElement;
  private readonly elOnlineFeedback: HTMLElement;

  private readonly botoesJogadores: HTMLButtonElement[];
  private readonly botoesDificuldade: HTMLButtonElement[];
  private readonly botoesDificuldadeOnline: HTMLButtonElement[];

  private quantidadeSelecionada = 1;
  private dificuldadeSelecionada: Dificuldade = 'medio';
  private abaAtiva: AbaMenu = 'local';
  private estadoAtual: EstadoPartidaSnapshot['estado'] = 'MENU';
  private emPartidaOnline = false;
  private papelOnline: PapelOnline = 'NENHUM';
  private rafMedicaoId: number | null = null;
  private readonly resizeObserver: ResizeObserver | null = null;

  constructor(preferenciasIniciais: PreferenciasSalvas, callbacks: CallbacksHud) {
    this.callbacks = callbacks;
    this.quantidadeSelecionada = preferenciasIniciais.quantidadeJogadores;
    this.dificuldadeSelecionada = preferenciasIniciais.dificuldade;

    this.elRodada = this.obterElemento('valor-rodada');
    this.elRecorde = this.obterElemento('valor-recorde');
    this.btnSom = this.obterElemento('btn-som') as HTMLButtonElement;
    this.iconeSom = this.obterElemento('icone-som');
    this.btnTema = this.obterElemento('btn-tema') as HTMLButtonElement;
    this.iconeTema = this.obterElemento('icone-tema');
    this.labelTema = this.obterElemento('label-tema');
    this.btnCustomizar = this.obterElemento('btn-customizar') as HTMLButtonElement;
    this.btnDaltonismo = this.obterElemento('btn-daltonismo') as HTMLButtonElement;
    this.btnMenu = this.obterElemento('btn-menu') as HTMLButtonElement;
    this.elStatusBanner = this.obterElemento('status-banner');
    this.elMultiplayerStrip = this.obterElemento('multiplayer-strip');
    this.elMenuPanel = this.obterElemento('menu-panel');
    this.elHudFooter = this.obterElemento('hud-footer');
    this.btnIniciar = this.obterElemento('btn-iniciar') as HTMLButtonElement;
    this.elModal = this.obterElemento('gameover-modal');
    this.elModalBadge = this.obterElemento('modal-badge');
    this.elModalTitulo = this.obterElemento('modal-titulo');
    this.elModalSubtitulo = this.obterElemento('modal-subtitulo');
    this.elModalRanking = this.obterElemento('modal-ranking');
    this.btnReiniciar = this.obterElemento('btn-reiniciar') as HTMLButtonElement;
    this.btnModalMenu = this.obterElemento('btn-modal-menu') as HTMLButtonElement;

    this.elCustomModal = this.obterElemento('custom-modal');
    this.elCustomPontos = this.obterElemento('custom-pontos');
    this.elCenarioGrid = this.obterElemento('cenario-grid');
    this.btnFecharCustom = this.obterElemento('btn-fechar-custom') as HTMLButtonElement;
    this.botoesCarcaca = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-carcaca]'));

    this.btnRanking = this.obterElemento('btn-ranking') as HTMLButtonElement;
    this.elRankingModal = this.obterElemento('ranking-modal');
    this.elRankingOrigemBadge = this.obterElemento('ranking-origem-badge');
    this.elRankingAviso = this.obterElemento('ranking-aviso');
    this.elRankingLista = this.obterElemento('ranking-global-lista');
    this.btnAtualizarRanking = this.obterElemento('btn-atualizar-ranking') as HTMLButtonElement;
    this.btnFecharRanking = this.obterElemento('btn-fechar-ranking') as HTMLButtonElement;
    this.botoesFiltroRanking = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-filtro-ranking]')
    );
    this.elGameOverSubmitBox = this.obterElemento('gameover-submit-box');
    this.inputApelidoRanking = this.obterElemento('input-apelido-ranking') as HTMLInputElement;
    this.btnEnviarRanking = this.obterElemento('btn-enviar-ranking') as HTMLButtonElement;
    this.elGameOverSubmitFeedback = this.obterElemento('gameover-submit-feedback');

    this.tabLocal = this.obterElemento('tab-local') as HTMLButtonElement;
    this.tabOnline = this.obterElemento('tab-online') as HTMLButtonElement;
    this.panelLocal = this.obterElemento('panel-local');
    this.panelOnline = this.obterElemento('panel-online');
    this.onlineConnectView = this.obterElemento('online-connect-view');
    this.onlineLobbyView = this.obterElemento('online-lobby-view');
    this.inputApelido = this.obterElemento('input-apelido') as HTMLInputElement;
    this.inputCodigoSala = this.obterElemento('input-codigo-sala') as HTMLInputElement;
    this.btnCriarSala = this.obterElemento('btn-criar-sala') as HTMLButtonElement;
    this.btnEntrarSala = this.obterElemento('btn-entrar-sala') as HTMLButtonElement;
    this.elLobbyCodigo = this.obterElemento('lobby-codigo');
    this.btnCopiarConvite = this.obterElemento('btn-copiar-convite') as HTMLButtonElement;
    this.btnSairSala = this.obterElemento('btn-sair-sala') as HTMLButtonElement;
    this.elLobbyJogadores = this.obterElemento('lobby-jogadores');
    this.elLobbyDificuldadeBox = this.obterElemento('lobby-dificuldade-box');
    this.btnIniciarOnline = this.obterElemento('btn-iniciar-online') as HTMLButtonElement;
    this.elLobbyGuestHint = this.obterElemento('lobby-guest-hint');
    this.elOnlineFeedback = this.obterElemento('online-feedback');

    this.botoesJogadores = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-jogadores]'));
    this.botoesDificuldade = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-dificuldade]'));
    this.botoesDificuldadeOnline = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-dificuldade-online]')
    );

    this.aplicarPreferenciasIniciais(preferenciasIniciais);
    this.registrarEventos();

    // Observa mudanças de tamanho em todos os blocos do HUD (DPI, fonte, abas, rotação)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.agendarMedicaoAreaSegura());
      const alvosObservados = [
        document.querySelector('.topbar'),
        document.querySelector('.brand'),
        document.querySelector('.topbar-right'),
        this.elMenuPanel,
        this.elStatusBanner,
        this.elMultiplayerStrip,
        this.elHudFooter,
      ];
      for (const el of alvosObservados) {
        if (el) this.resizeObserver.observe(el);
      }
    }

    window.addEventListener('resize', () => this.agendarMedicaoAreaSegura());
    window.visualViewport?.addEventListener('resize', () => this.agendarMedicaoAreaSegura());
    this.agendarMedicaoAreaSegura();
  }

  private obterElemento(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Elemento obrigatório do HUD não encontrado: #${id}`);
    }
    return el;
  }

  private aplicarPreferenciasIniciais(prefs: PreferenciasSalvas): void {
    this.atualizarBotaoSom(prefs.somAtivo);
    this.atualizarBotaoTema(prefs.tema);
    this.atualizarBotaoDaltonismo(prefs.modoDaltonismo);
    this.atualizarCustomizacao(prefs.corCarcaca, prefs.cenario, prefs.pontosTotais);
    if (prefs.apelidoSalvo) {
      this.inputApelidoRanking.value = prefs.apelidoSalvo;
      this.inputApelido.value = prefs.apelidoSalvo;
    }
    this.marcarBotaoJogadores(prefs.quantidadeJogadores);
    this.marcarBotaoDificuldade(prefs.dificuldade);
    this.marcarBotaoDificuldadeOnline(prefs.dificuldade);
    this.elRecorde.textContent = this.formatarNumero(
      prefs.quantidadeJogadores > 1 ? prefs.recordeMultiplayer : prefs.recordeSolo
    );
  }

  /**
   * Registra todos os ouvintes de clique dos controles e atalhos globais de teclado.
   */
  private registrarEventos(): void {
    // Som sutil de hover estilo Tomodachi Life em todos os botões habilitados do HUD
    const hudRaiz = document.getElementById('hud');
    if (hudRaiz) {
      hudRaiz.addEventListener('pointerenter', (evento) => {
        const alvo = evento.target;
        if (alvo instanceof HTMLButtonElement && !alvo.disabled) {
          this.callbacks.onSomHoverUI();
        }
      }, true);
    }

    this.tabLocal.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.selecionarAba('local');
    });
    this.tabOnline.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.selecionarAba('online');
    });

    this.btnIniciar.addEventListener('click', () => {
      this.callbacks.onSomConfirmarUI();
      this.callbacks.onIniciarPartida(this.quantidadeSelecionada, this.dificuldadeSelecionada);
    });

    this.btnReiniciar.addEventListener('click', () => {
      this.callbacks.onSomConfirmarUI();
      this.callbacks.onReiniciarPartida();
    });

    this.btnMenu.addEventListener('click', () => {
      this.callbacks.onSomVoltarUI();
      this.callbacks.onVoltarMenu();
    });

    this.btnModalMenu.addEventListener('click', () => {
      this.callbacks.onSomVoltarUI();
      this.callbacks.onVoltarMenu();
    });

    this.btnSom.addEventListener('click', () => {
      this.callbacks.onAlternarSom();
      this.callbacks.onSomCliqueUI();
    });

    this.btnTema.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.callbacks.onAlternarTema();
    });

    this.btnCustomizar.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.elCustomModal.classList.remove('hidden');
    });

    this.btnFecharCustom.addEventListener('click', () => {
      this.callbacks.onSomVoltarUI();
      this.elCustomModal.classList.add('hidden');
    });

    this.elCustomModal.addEventListener('click', (evento) => {
      if (evento.target === this.elCustomModal) {
        this.callbacks.onSomVoltarUI();
        this.elCustomModal.classList.add('hidden');
      }
    });

    for (const btn of this.botoesCarcaca) {
      btn.addEventListener('click', () => {
        this.callbacks.onSomCliqueUI();
        const cor = (btn.dataset.carcaca as CorCarcaca) || 'creme';
        this.callbacks.onAlterarCorCarcaca(cor);
      });
    }

    // Eventos do Modal de Ranking Global
    this.btnRanking.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.abrirModalRanking();
    });

    this.btnFecharRanking.addEventListener('click', () => {
      this.callbacks.onSomVoltarUI();
      this.elRankingModal.classList.add('hidden');
    });

    this.elRankingModal.addEventListener('click', (evento) => {
      if (evento.target === this.elRankingModal) {
        this.callbacks.onSomVoltarUI();
        this.elRankingModal.classList.add('hidden');
      }
    });

    this.btnAtualizarRanking.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.mostrarCarregandoRanking();
      this.callbacks.onAbrirRanking(this.filtroRankingAtual);
    });

    for (const btn of this.botoesFiltroRanking) {
      btn.addEventListener('click', () => {
        this.callbacks.onSomCliqueUI();
        const filtro = (btn.dataset.filtroRanking as FiltroRanking) || 'todas';
        this.filtroRankingAtual = filtro;
        for (const b of this.botoesFiltroRanking) {
          b.classList.toggle('active', b.dataset.filtroRanking === filtro);
        }
        this.mostrarCarregandoRanking();
        this.callbacks.onAbrirRanking(filtro);
      });
    }

    this.btnEnviarRanking.addEventListener('click', () => {
      this.callbacks.onSomConfirmarUI();
      this.btnEnviarRanking.disabled = true;
      this.callbacks.onEnviarPontuacaoRanking(this.inputApelidoRanking.value);
    });

    this.btnDaltonismo.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.callbacks.onAlternarDaltonismo();
    });

    for (const btn of this.botoesJogadores) {
      btn.addEventListener('click', () => {
        this.callbacks.onSomCliqueUI();
        const qtd = Number(btn.dataset.jogadores || '1');
        this.quantidadeSelecionada = qtd;
        this.marcarBotaoJogadores(qtd);
        this.callbacks.onAlterarQuantidadeJogadores(qtd);
      });
    }

    for (const btn of this.botoesDificuldade) {
      btn.addEventListener('click', () => {
        this.callbacks.onSomCliqueUI();
        const dif = (btn.dataset.dificuldade as Dificuldade) || 'medio';
        this.dificuldadeSelecionada = dif;
        this.marcarBotaoDificuldade(dif);
        this.callbacks.onAlterarDificuldade(dif);
      });
    }

    // Eventos da aba Online
    this.inputCodigoSala.addEventListener('input', () => {
      this.inputCodigoSala.value = normalizarCodigoSala(this.inputCodigoSala.value);
    });

    this.btnCriarSala.addEventListener('click', () => {
      this.callbacks.onSomConfirmarUI();
      this.callbacks.onCriarSalaOnline(this.inputApelido.value, this.dificuldadeSelecionada);
    });

    this.btnEntrarSala.addEventListener('click', () => {
      this.callbacks.onSomConfirmarUI();
      this.callbacks.onEntrarSalaOnline(this.inputCodigoSala.value, this.inputApelido.value);
    });

    this.btnSairSala.addEventListener('click', () => {
      this.callbacks.onSomVoltarUI();
      this.callbacks.onSairSalaOnline();
    });

    this.btnCopiarConvite.addEventListener('click', () => {
      this.callbacks.onSomCliqueUI();
      this.callbacks.onCopiarLinkConvite();
    });

    this.btnIniciarOnline.addEventListener('click', () => {
      this.callbacks.onSomConfirmarUI();
      this.callbacks.onIniciarPartidaOnline();
    });

    for (const btn of this.botoesDificuldadeOnline) {
      btn.addEventListener('click', () => {
        this.callbacks.onSomCliqueUI();
        const dif = (btn.dataset.dificuldadeOnline as Dificuldade) || 'medio';
        this.marcarBotaoDificuldadeOnline(dif);
        this.callbacks.onAlterarDificuldadeOnline(dif);
      });
    }

    window.addEventListener('keydown', this.tratarTeclado);
  }

  /**
   * Alterna entre a aba Local (Solo / 2–4P) e a aba Online (Sala P2P).
   */
  public selecionarAba(aba: AbaMenu): void {
    this.abaAtiva = aba;
    const ehLocal = aba === 'local';

    this.tabLocal.classList.toggle('active', ehLocal);
    this.tabLocal.setAttribute('aria-selected', String(ehLocal));
    this.tabOnline.classList.toggle('active', !ehLocal);
    this.tabOnline.setAttribute('aria-selected', String(!ehLocal));

    this.panelLocal.classList.toggle('hidden', !ehLocal);
    this.panelOnline.classList.toggle('hidden', ehLocal);
    this.agendarMedicaoAreaSegura();
  }

  /**
   * Preenche o código de sala vindo de um link de convite (?sala=XXXXXX).
   */
  public preencherCodigoConvite(codigo: string): void {
    this.selecionarAba('online');
    this.inputCodigoSala.value = normalizarCodigoSala(codigo);
    this.exibirFeedbackOnline(`Convite detectado! Informe seu apelido e clique em Entrar na sala ${codigo}.`, false);
  }

  /**
   * Exibe mensagem de status ou erro dentro do painel Online.
   */
  public exibirFeedbackOnline(mensagem: string | null, ehErro = false): void {
    if (!mensagem) {
      this.elOnlineFeedback.classList.add('hidden');
      this.elOnlineFeedback.textContent = '';
      return;
    }
    this.elOnlineFeedback.textContent = mensagem;
    this.elOnlineFeedback.classList.toggle('erro', ehErro);
    this.elOnlineFeedback.classList.remove('hidden');
    this.agendarMedicaoAreaSegura();
  }

  /**
   * Atualiza o painel do lobby online (conectado ou desconectado).
   */
  public atualizarLobbyOnline(lobby: EstadoLobbyOnline | null, papel: PapelOnline, meuJogadorId: number): void {
    this.papelOnline = papel;

    if (!lobby || papel === 'NENHUM') {
      this.onlineConnectView.classList.remove('hidden');
      this.onlineLobbyView.classList.add('hidden');
      this.agendarMedicaoAreaSegura();
      return;
    }

    this.selecionarAba('online');
    this.onlineConnectView.classList.add('hidden');
    this.onlineLobbyView.classList.remove('hidden');
    this.elLobbyCodigo.textContent = lobby.codigoSala;
    this.marcarBotaoDificuldadeOnline(lobby.dificuldade);

    // Renderiza lista de participantes conectados
    this.elLobbyJogadores.innerHTML = '';
    for (const p of lobby.participantes) {
      const badge = document.createElement('span');
      badge.className = `lobby-player-badge ${p.jogadorId === meuJogadorId ? 'voce' : ''}`;
      const tags: string[] = [];
      if (p.ehHost) tags.push('Host');
      if (p.jogadorId === meuJogadorId) tags.push('Você');
      const sufixo = tags.length > 0 ? ` (${tags.join(' • ')})` : '';
      badge.textContent = `${p.jogadorId}. ${p.nome}${sufixo}`;
      this.elLobbyJogadores.appendChild(badge);
    }

    const ehHost = papel === 'HOST';
    this.elLobbyDificuldadeBox.classList.toggle('hidden', !ehHost);
    this.btnIniciarOnline.classList.toggle('hidden', !ehHost);
    this.elLobbyGuestHint.classList.toggle('hidden', ehHost);

    if (ehHost) {
      const total = lobby.participantes.length;
      const pronto = total >= 2;
      this.btnIniciarOnline.disabled = !pronto;
      this.btnIniciarOnline.textContent = pronto
        ? `Iniciar Partida Online (${total} jogadores)`
        : `Aguardando jogadores (${total}/4)...`;
    }
    this.agendarMedicaoAreaSegura();
  }

  public mostrarConfirmacaoCopia(): void {
    const original = this.btnCopiarConvite.textContent;
    this.btnCopiarConvite.textContent = 'Copiado!';
    window.setTimeout(() => {
      this.btnCopiarConvite.textContent = original || 'Copiar Link';
    }, 1800);
  }

  /**
   * Tratamento unificado de atalhos de teclado (RNF-02), ignorando teclas quando
   * o usuário está digitando apelido ou código de sala em um campo de texto.
   */
  private readonly tratarTeclado = (evento: KeyboardEvent): void => {
    if (evento.repeat) return;

    // Nunca intercepta atalhos enquanto o usuário digita em um input
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
      return;
    }

    const tecla = evento.key.toLowerCase();

    if (tecla === 'm') {
      evento.preventDefault();
      this.callbacks.onAlternarSom();
      return;
    }

    if (tecla === 'd') {
      evento.preventDefault();
      this.callbacks.onAlternarDaltonismo();
      return;
    }

    if (tecla === 't') {
      evento.preventDefault();
      this.callbacks.onAlternarTema();
      return;
    }

    if (tecla === 'c') {
      evento.preventDefault();
      const estaFechado = this.elCustomModal.classList.contains('hidden');
      this.elCustomModal.classList.toggle('hidden', !estaFechado);
      return;
    }

    if (tecla === 'r') {
      evento.preventDefault();
      if (this.elRankingModal.classList.contains('hidden')) {
        this.abrirModalRanking();
      } else {
        this.elRankingModal.classList.add('hidden');
      }
      return;
    }

    if (tecla === 'escape') {
      if (!this.elRankingModal.classList.contains('hidden')) {
        evento.preventDefault();
        this.elRankingModal.classList.add('hidden');
        return;
      }
      if (!this.elCustomModal.classList.contains('hidden')) {
        evento.preventDefault();
        this.elCustomModal.classList.add('hidden');
        return;
      }
      if (this.estadoAtual !== 'MENU') {
        evento.preventDefault();
        this.callbacks.onVoltarMenu();
        return;
      }
    }

    if (tecla === ' ' || tecla === 'enter') {
      const focoEmBotao = document.activeElement instanceof HTMLButtonElement;
      if (!focoEmBotao && this.estadoAtual === 'MENU' && this.abaAtiva === 'local') {
        evento.preventDefault();
        this.callbacks.onIniciarPartida(this.quantidadeSelecionada, this.dificuldadeSelecionada);
        return;
      }
      if (!focoEmBotao && this.estadoAtual === 'GAME_OVER' && (!this.emPartidaOnline || this.papelOnline === 'HOST')) {
        evento.preventDefault();
        this.callbacks.onReiniciarPartida();
        return;
      }
    }

    const corMapeada = MAPA_TECLAS_QUADRANTES[tecla];
    if (corMapeada && this.estadoAtual === 'AGUARDANDO_JOGADOR') {
      evento.preventDefault();
      this.callbacks.onTeclaQuadrante(corMapeada);
    }
  };

  private marcarBotaoJogadores(qtd: number): void {
    for (const btn of this.botoesJogadores) {
      btn.classList.toggle('active', Number(btn.dataset.jogadores) === qtd);
    }
  }

  private marcarBotaoDificuldade(dif: Dificuldade): void {
    for (const btn of this.botoesDificuldade) {
      btn.classList.toggle('active', btn.dataset.dificuldade === dif);
    }
  }

  private marcarBotaoDificuldadeOnline(dif: Dificuldade): void {
    for (const btn of this.botoesDificuldadeOnline) {
      btn.classList.toggle('active', btn.dataset.dificuldadeOnline === dif);
    }
  }

  private formatarNumero(valor: number): string {
    return String(Math.max(0, valor)).padStart(2, '0');
  }

  public atualizarBotaoSom(ativo: boolean): void {
    this.btnSom.setAttribute('aria-pressed', String(ativo));
    this.iconeSom.textContent = ativo ? '🔊' : '🔇';
  }

  public atualizarBotaoTema(tema: TemaVisual): void {
    const ehClaro = tema === 'claro';
    this.btnTema.setAttribute('aria-pressed', String(ehClaro));
    this.iconeTema.textContent = ehClaro ? '☀️' : '🌙';
    this.labelTema.textContent = ehClaro ? 'Claro' : 'Escuro';
    document.body.classList.toggle('tema-claro', ehClaro);
  }

  public atualizarBotaoDaltonismo(ativo: boolean): void {
    this.btnDaltonismo.setAttribute('aria-pressed', String(ativo));
    document.body.classList.toggle('alto-contraste', ativo);
  }

  /**
   * Atualiza o modal de customização (pontos acumulados, cor ativa da carcaça e cenários desbloqueados).
   */
  public atualizarCustomizacao(corAtiva: CorCarcaca, cenarioAtivo: Cenario3D, pontosTotais: number): void {
    this.elCustomPontos.textContent = `⭐ ${pontosTotais} pts`;

    for (const btn of this.botoesCarcaca) {
      btn.classList.toggle('active', btn.dataset.carcaca === corAtiva);
    }

    this.elCenarioGrid.innerHTML = '';
    for (const item of CATALOGO_CENARIOS) {
      const desbloqueado = cenarioEstaDesbloqueado(item.id, pontosTotais);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cenario-btn';
      if (item.id === cenarioAtivo) btn.classList.add('active');
      if (!desbloqueado) {
        btn.classList.add('bloqueado');
        btn.disabled = true;
      }

      const meta = desbloqueado
        ? item.id === cenarioAtivo
          ? 'Ativo'
          : 'Livre'
        : `🔒 ${item.pontosNecessarios} pts`;

      btn.innerHTML = `<span class="cenario-icone" aria-hidden="true">${item.icone}</span><span>${item.nome}</span><span class="cenario-meta">${meta}</span>`;

      if (desbloqueado) {
        btn.addEventListener('click', () => {
          this.callbacks.onSomCliqueUI();
          this.callbacks.onAlterarCenario(item.id);
        });
      }

      this.elCenarioGrid.appendChild(btn);
    }
  }

  public atualizarRecordeExibido(recorde: number): void {
    this.elRecorde.textContent = this.formatarNumero(recorde);
  }

  /**
   * Atualiza o texto e a cor de destaque do banner de status (aria-live="polite").
   */
  public definirMensagemStatus(texto: string, tipo: TipoStatusVisual = 'padrao'): void {
    this.elStatusBanner.textContent = texto;
    this.elStatusBanner.classList.remove('status-sucesso', 'status-erro', 'status-aguardando');

    if (tipo === 'sucesso') this.elStatusBanner.classList.add('status-sucesso');
    if (tipo === 'erro') this.elStatusBanner.classList.add('status-erro');
    if (tipo === 'aguardando') this.elStatusBanner.classList.add('status-aguardando');
    this.agendarMedicaoAreaSegura();
  }

  /**
   * Agenda a medição da área livre do HUD no próximo frame de renderização,
   * garantindo que o layout CSS já tenha sido recalculado pelo navegador.
   */
  public agendarMedicaoAreaSegura(): void {
    if (this.rafMedicaoId !== null) return;
    this.rafMedicaoId = window.requestAnimationFrame(() => {
      this.rafMedicaoId = null;
      this.callbacks.onAreaSeguraAlterada(this.medirAreaSegura());
    });
  }

  /**
   * Calcula o retângulo livre real entre os elementos visíveis do HUD
   * (barra superior, menu, banner de status, jogadores e rodapé),
   * mantendo o Genius 3D sempre centralizado e visível em qualquer DPI/resolução.
   */
  public medirAreaSegura(): AreaSeguraHud {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const margem = 10;

    let esquerda = margem;
    let direita = w - margem;
    let topo = margem;
    let base = h - margem;

    const ehDesktopLateral = w >= 901 && h >= 520;

    const visivel = (el: Element | null): DOMRect | null => {
      if (!el || el.classList.contains('hidden')) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return null;
      return rect;
    };

    if (ehDesktopLateral) {
      // Desktop: marca/status no topo, atalhos na base, menu/jogadores à esquerda, barra vertical à direita
      const rectStatus = visivel(this.elStatusBanner);
      if (rectStatus) topo = Math.max(topo, rectStatus.bottom + margem);

      const rectFooter = visivel(this.elHudFooter);
      if (rectFooter) base = Math.min(base, rectFooter.top - margem);

      const rectMenu = visivel(this.elMenuPanel);
      if (rectMenu) esquerda = Math.max(esquerda, rectMenu.right + margem);

      const rectPlayers = visivel(this.elMultiplayerStrip);
      if (rectPlayers) esquerda = Math.max(esquerda, rectPlayers.right + margem);

      const rectRight = visivel(document.querySelector('.topbar-right'));
      if (rectRight) direita = Math.min(direita, rectRight.left - margem);
    } else {
      // Mobile / Tablet: topbar + status no topo, menu ou jogadores na base
      const rectTopbar = visivel(document.querySelector('.topbar'));
      if (rectTopbar) topo = Math.max(topo, rectTopbar.bottom + margem);

      const rectStatus = visivel(this.elStatusBanner);
      if (rectStatus) topo = Math.max(topo, rectStatus.bottom + margem);

      const rectMenu = visivel(this.elMenuPanel);
      if (rectMenu) base = Math.min(base, rectMenu.top - margem);

      const rectPlayers = visivel(this.elMultiplayerStrip);
      if (rectPlayers) base = Math.min(base, rectPlayers.top - margem);

      const rectFooter = visivel(this.elHudFooter);
      if (rectFooter) base = Math.min(base, rectFooter.top - margem);
    }

    const larguraLivre = Math.max(w * 0.25, direita - esquerda);
    const alturaLivre = Math.max(h * 0.22, base - topo);

    return {
      esquerda,
      topo,
      largura: larguraLivre,
      altura: alturaLivre,
      viewportLargura: w,
      viewportAltura: h,
    };
  }

  /**
   * Sincroniza visibilidade dos painéis, placar e faixa de jogadores com o snapshot da partida.
   */
  public sincronizarEstado(
    snapshot: EstadoPartidaSnapshot,
    opcoesOnline?: { emPartidaOnline: boolean; meuJogadorId: number }
  ): void {
    this.estadoAtual = snapshot.estado;
    this.emPartidaOnline = Boolean(opcoesOnline?.emPartidaOnline);

    const estaNoMenu = snapshot.estado === 'MENU';
    const estaEmGameOver = snapshot.estado === 'GAME_OVER';

    this.elRodada.textContent = this.formatarNumero(snapshot.rodadaAtual);
    this.elRecorde.textContent = this.formatarNumero(snapshot.recordeAtual);

    this.elMenuPanel.classList.toggle('hidden', !estaNoMenu);
    this.btnMenu.classList.toggle('hidden', estaNoMenu);
    this.elStatusBanner.classList.toggle('hidden', estaNoMenu);
    this.elHudFooter.classList.toggle('hidden', estaNoMenu);

    if (!estaEmGameOver) {
      this.elModal.classList.add('hidden');
    }

    // Faixa de jogadores no modo Multiplayer (Local ou Online)
    const mostrarMultiplayer = !estaNoMenu && snapshot.modoMultiplayer;
    this.elMultiplayerStrip.classList.toggle('hidden', !mostrarMultiplayer);
    if (mostrarMultiplayer) {
      this.renderizarFaixaMultiplayer(
        snapshot.jogadores,
        snapshot.jogadorAtual.id,
        opcoesOnline?.emPartidaOnline ? opcoesOnline.meuJogadorId : 0
      );
    }

    this.agendarMedicaoAreaSegura();
  }

  private renderizarFaixaMultiplayer(
    jogadores: readonly Jogador[],
    idJogadorAtual: number,
    meuJogadorId: number
  ): void {
    this.elMultiplayerStrip.innerHTML = '';
    for (const j of jogadores) {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      if (!j.ativo) {
        chip.classList.add('eliminado');
      } else if (j.id === idJogadorAtual) {
        chip.classList.add('ativo');
      }
      const marcaVoce = meuJogadorId > 0 && j.id === meuJogadorId ? ' (Você)' : '';
      chip.textContent = `${j.nome}${marcaVoce}: ${j.pontuacao} pts`;
      this.elMultiplayerStrip.appendChild(chip);
    }
  }

  /**
   * Exibe o modal acessível de Game Over (Solo) ou Vencedor + Ranking (Local/Online).
   */
  public exibirModalFimDeJogo(opcoes: {
    snapshot: EstadoPartidaSnapshot;
    ranking: Jogador[];
    novoRecorde: boolean;
    emPartidaOnline?: boolean;
    papelOnline?: PapelOnline;
  }): void {
    const { snapshot, ranking, novoRecorde, emPartidaOnline = false, papelOnline = 'NENHUM' } = opcoes;
    this.elModalBadge.classList.toggle('hidden', !novoRecorde);

    const ehConvidadoOnline = emPartidaOnline && papelOnline === 'CONVIDADO';
    this.btnReiniciar.classList.toggle('hidden', ehConvidadoOnline);
    this.btnModalMenu.textContent = emPartidaOnline
      ? ehConvidadoOnline
        ? 'Sair da Sala'
        : 'Voltar ao Lobby'
      : 'Voltar ao Menu 3D';

    if (snapshot.modoMultiplayer) {
      const vencedor = snapshot.vencedor;
      this.elModalTitulo.textContent = vencedor ? `🏆 ${vencedor.nome} Venceu!` : 'Fim de Partida!';
      this.elModalSubtitulo.textContent = ehConvidadoOnline
        ? `Partida encerrada na rodada ${snapshot.rodadaAtual}. Aguarde o anfitrião reiniciar ou saia da sala.`
        : `Partida encerrada na rodada ${snapshot.rodadaAtual}.`;

      this.elModalRanking.innerHTML = '';
      ranking.forEach((jogador, pos) => {
        const linha = document.createElement('div');
        linha.className = `ranking-row ${pos === 0 && jogador.ativo ? 'vencedor' : ''}`;
        const statusTxt = jogador.ativo ? '🏆 Vencedor' : 'Eliminado';
        linha.innerHTML = `<span>#${pos + 1} ${jogador.nome}</span><span>${jogador.pontuacao} pts • ${statusTxt}</span>`;
        this.elModalRanking.appendChild(linha);
      });
      this.elModalRanking.classList.remove('hidden');
    } else {
      const pontos = snapshot.jogadores[0]?.pontuacao ?? 0;
      this.elModalTitulo.textContent = 'Game Over!';
      this.elModalSubtitulo.textContent =
        pontos === 1
          ? `Você completou 1 rodada! Recorde atual: ${snapshot.recordeAtual}.`
          : `Você completou ${pontos} rodadas! Recorde atual: ${snapshot.recordeAtual}.`;
      this.elModalRanking.classList.add('hidden');
    }

    this.elModal.classList.remove('hidden');

    // Exibe caixa de envio ao Ranking Global quando houve >= 1 rodada completada
    const melhorPontuacao = Math.max(0, ...snapshot.jogadores.map((j) => j.pontuacao));
    const podeEnviarRanking = melhorPontuacao >= 1 && !ehConvidadoOnline;
    this.elGameOverSubmitBox.classList.toggle('hidden', !podeEnviarRanking);
    this.btnEnviarRanking.disabled = false;
    this.btnEnviarRanking.textContent = 'Enviar 🏆';
    this.elGameOverSubmitFeedback.classList.add('hidden');
    this.elGameOverSubmitFeedback.textContent = '';

    if (!ehConvidadoOnline) {
      this.btnReiniciar.focus();
    } else {
      this.btnModalMenu.focus();
    }
  }

  public abrirModalRanking(): void {
    this.elRankingModal.classList.remove('hidden');
    this.mostrarCarregandoRanking();
    this.callbacks.onAbrirRanking(this.filtroRankingAtual);
  }

  private mostrarCarregandoRanking(): void {
    this.elRankingLista.innerHTML = '<p class="ranking-vazio">Carregando ranking...</p>';
  }

  /**
   * Renderiza a lista do Ranking Global (ou fallback local) no modal.
   */
  public renderizarRankingGlobal(resultado: ResultadoRanking): void {
    this.elRankingOrigemBadge.textContent =
      resultado.origem === 'global' ? '🌐 Global' : '💾 Local';

    if (resultado.aviso) {
      this.elRankingAviso.textContent = resultado.aviso;
      this.elRankingAviso.classList.remove('hidden', 'erro');
    } else {
      this.elRankingAviso.classList.add('hidden');
    }

    if (resultado.registros.length === 0) {
      this.elRankingLista.innerHTML =
        '<p class="ranking-vazio">Nenhum recorde registrado ainda. Seja o primeiro!</p>';
      return;
    }

    const rotuloDif: Record<Dificuldade, string> = {
      facil: 'Fácil',
      medio: 'Médio',
      dificil: 'Difícil',
    };

    this.elRankingLista.innerHTML = '';
    resultado.registros.forEach((reg, idx) => {
      const linha = document.createElement('div');
      linha.className = `ranking-item-global ${idx === 0 ? 'top-1' : ''}`;

      const medalha = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

      const esq = document.createElement('div');
      esq.className = 'ranking-item-esquerda';
      const posSpan = document.createElement('span');
      posSpan.textContent = medalha;
      const nomeSpan = document.createElement('span');
      nomeSpan.className = 'ranking-nome';
      nomeSpan.textContent = reg.apelido;
      esq.append(posSpan, nomeSpan);

      const dir = document.createElement('div');
      dir.className = 'ranking-item-direita';
      const difTag = document.createElement('span');
      difTag.className = 'ranking-dif-tag';
      difTag.textContent = rotuloDif[reg.dificuldade] ?? reg.dificuldade;
      const ptsSpan = document.createElement('strong');
      ptsSpan.textContent = `${reg.pontos} pts`;
      dir.append(difTag, ptsSpan);

      linha.append(esq, dir);
      this.elRankingLista.appendChild(linha);
    });
  }

  /**
   * Exibe o resultado do envio de pontuação dentro do modal de Game Over.
   */
  public exibirResultadoEnvioRanking(ok: boolean, mensagem: string): void {
    this.elGameOverSubmitFeedback.textContent = mensagem;
    this.elGameOverSubmitFeedback.classList.toggle('erro', !ok);
    this.elGameOverSubmitFeedback.classList.remove('hidden');
    this.btnEnviarRanking.disabled = ok;
    this.btnEnviarRanking.textContent = ok ? 'Enviado ✓' : 'Enviar 🏆';
  }
}
