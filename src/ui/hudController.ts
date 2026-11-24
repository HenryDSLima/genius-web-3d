// ============================================================================
// CONTROLADOR DA INTERFACE HUD E ACESSIBILIDADE — GENIUS 3D WEB (UNICAP)
// Gerencia menus HTML (Local e Multiplayer Online), placar em tempo real,
// faixa de turnos multiplayer, modo daltonismo/alto contraste, modal de fim
// de jogo e atalhos de teclado.
// Atende aos requisitos RF-04, RF-05, RNF-02 e RNF-03.
// ============================================================================

import { CorGenius, EstadoPartidaSnapshot, Jogador } from '../core/gameEngine';
import { Dificuldade, PreferenciasSalvas, TemaVisual } from '../core/storage';
import { PapelOnline } from '../network/onlineManager';
import { EstadoLobbyOnline, normalizarCodigoSala } from '../network/onlineProtocol';

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

  // Callbacks do Multiplayer Online (WebRTC / PeerJS)
  onCriarSalaOnline: (apelido: string, dificuldade: Dificuldade) => void;
  onEntrarSalaOnline: (codigo: string, apelido: string) => void;
  onSairSalaOnline: () => void;
  onIniciarPartidaOnline: () => void;
  onAlterarDificuldadeOnline: (dificuldade: Dificuldade) => void;
  onCopiarLinkConvite: () => void;
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
    this.tabLocal.addEventListener('click', () => this.selecionarAba('local'));
    this.tabOnline.addEventListener('click', () => this.selecionarAba('online'));

    this.btnIniciar.addEventListener('click', () => {
      this.callbacks.onIniciarPartida(this.quantidadeSelecionada, this.dificuldadeSelecionada);
    });

    this.btnReiniciar.addEventListener('click', () => {
      this.callbacks.onReiniciarPartida();
    });

    this.btnMenu.addEventListener('click', () => {
      this.callbacks.onVoltarMenu();
    });

    this.btnModalMenu.addEventListener('click', () => {
      this.callbacks.onVoltarMenu();
    });

    this.btnSom.addEventListener('click', () => {
      this.callbacks.onAlternarSom();
    });

    this.btnTema.addEventListener('click', () => {
      this.callbacks.onAlternarTema();
    });

    this.btnDaltonismo.addEventListener('click', () => {
      this.callbacks.onAlternarDaltonismo();
    });

    for (const btn of this.botoesJogadores) {
      btn.addEventListener('click', () => {
        const qtd = Number(btn.dataset.jogadores || '1');
        this.quantidadeSelecionada = qtd;
        this.marcarBotaoJogadores(qtd);
        this.callbacks.onAlterarQuantidadeJogadores(qtd);
      });
    }

    for (const btn of this.botoesDificuldade) {
      btn.addEventListener('click', () => {
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
      this.callbacks.onCriarSalaOnline(this.inputApelido.value, this.dificuldadeSelecionada);
    });

    this.btnEntrarSala.addEventListener('click', () => {
      this.callbacks.onEntrarSalaOnline(this.inputCodigoSala.value, this.inputApelido.value);
    });

    this.btnSairSala.addEventListener('click', () => {
      this.callbacks.onSairSalaOnline();
    });

    this.btnCopiarConvite.addEventListener('click', () => {
      this.callbacks.onCopiarLinkConvite();
    });

    this.btnIniciarOnline.addEventListener('click', () => {
      this.callbacks.onIniciarPartidaOnline();
    });

    for (const btn of this.botoesDificuldadeOnline) {
      btn.addEventListener('click', () => {
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
  }

  /**
   * Atualiza o painel do lobby online (conectado ou desconectado).
   */
  public atualizarLobbyOnline(lobby: EstadoLobbyOnline | null, papel: PapelOnline, meuJogadorId: number): void {
    this.papelOnline = papel;

    if (!lobby || papel === 'NENHUM') {
      this.onlineConnectView.classList.remove('hidden');
      this.onlineLobbyView.classList.add('hidden');
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

    if (tecla === 'escape' && this.estadoAtual !== 'MENU') {
      evento.preventDefault();
      this.callbacks.onVoltarMenu();
      return;
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
    if (!ehConvidadoOnline) {
      this.btnReiniciar.focus();
    } else {
      this.btnModalMenu.focus();
    }
  }
}
