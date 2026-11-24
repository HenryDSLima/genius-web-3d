// ============================================================================
// ORQUESTRADOR PRINCIPAL — GENIUS 3D WEB (UNICAP - DESIGN DE INTERFACE E USABILIDADE)
// Integra a máquina de estados pura (GameEngine), a cena 3D (GeniusScene),
// o motor de áudio (SoundEngine), a persistência (RepositorioGenius),
// o Multiplayer Online P2P (OnlineManager) e o HUD (HudController).
// ============================================================================

import './ui/styles.css';
import { SoundEngine } from './audio/soundEngine';
import { ConfiguracaoTempo, CorGenius, EstadoPartidaSnapshot, GameEngine } from './core/gameEngine';
import { Cenario3D, CorCarcaca, Dificuldade, RepositorioGenius, TemaVisual } from './core/storage';
import { OnlineManager } from './network/onlineManager';
import {
  criarLinkConvite,
  extrairCodigoDaUrl,
  MensagemHostParaCliente,
  ParticipanteSala,
} from './network/onlineProtocol';
import { GeniusScene } from './scene/geniusScene';
import { HudController } from './ui/hudController';

/**
 * Helper assíncrono para aguardar intervalos durante a reprodução da sequência.
 */
function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

class GeniusApp {
  private readonly repositorio: RepositorioGenius;
  private readonly engine: GameEngine;
  private readonly sound: SoundEngine;
  private readonly scene: GeniusScene;
  private readonly hud: HudController;
  private readonly online: OnlineManager;

  // Token incremental que cancela com segurança qualquer sequência assíncrona anterior
  private tokenFluxo = 0;
  private modoDaltonismo = false;
  private temaAtual: TemaVisual = 'claro';
  private corCarcacaAtual: CorCarcaca = 'creme';
  private cenarioAtual: Cenario3D = 'estudio';
  private ultimaQtdJogadores = 1;
  private ultimaDificuldade: Dificuldade = 'medio';

  // Controle de partida Multiplayer Online
  private emPartidaOnline = false;
  private snapshotRemoto: EstadoPartidaSnapshot | null = null;

  constructor() {
    this.repositorio = new RepositorioGenius();
    const prefs = this.repositorio.carregar();

    this.modoDaltonismo = prefs.modoDaltonismo;
    this.temaAtual = prefs.tema;
    this.corCarcacaAtual = prefs.corCarcaca;
    this.cenarioAtual = prefs.cenario;
    this.ultimaQtdJogadores = prefs.quantidadeJogadores;
    this.ultimaDificuldade = prefs.dificuldade;

    this.engine = new GameEngine({ repositorio: this.repositorio });
    this.sound = new SoundEngine(prefs.somAtivo);

    const container = document.getElementById('canvas-container');
    if (!container) {
      throw new Error('Container #canvas-container não encontrado.');
    }

    this.scene = new GeniusScene(
      container,
      {
        onQuadrantePressionado: (cor) => this.tratarEntradaJogador(cor),
      },
      {
        corCarcaca: this.corCarcacaAtual,
        tema: this.temaAtual,
        cenario: this.cenarioAtual,
      }
    );
    this.scene.modelo.definirModoDaltonismo(this.modoDaltonismo);

    this.online = new OnlineManager({
      onStatusConexao: (msg) => this.hud.exibirFeedbackOnline(msg, false),
      onLobbyAtualizado: (lobby, papel, meuId) => {
        this.hud.exibirFeedbackOnline(null);
        this.hud.atualizarLobbyOnline(lobby, papel, meuId);
      },
      onMensagemDoHost: (msg) => this.tratarMensagemDoHost(msg),
      onJogadaRemotaRecebida: (jogadorId, cor) => this.tratarJogadaRemotaNoHost(jogadorId, cor),
      onParticipanteDesconectado: (participante) => this.tratarDesconexaoDurantePartida(participante),
      onErro: (msg) => {
        this.hud.exibirFeedbackOnline(msg, true);
        if (!this.online.estaConectado()) {
          this.hud.atualizarLobbyOnline(null, 'NENHUM', 0);
        }
      },
      onDesconectado: (motivo) => {
        this.encerrarPartidaOnlineLocalmente(motivo);
      },
    });

    this.hud = new HudController(prefs, {
      onIniciarPartida: (qtd, dif) => {
        this.emPartidaOnline = false;
        void this.iniciarNovaPartidaLocal(qtd, dif);
      },
      onReiniciarPartida: () => {
        if (this.emPartidaOnline && this.online.obterPapel() === 'HOST') {
          void this.iniciarPartidaOnlineComoHost();
        } else if (!this.emPartidaOnline) {
          void this.iniciarNovaPartidaLocal(this.ultimaQtdJogadores, this.ultimaDificuldade);
        }
      },
      onVoltarMenu: () => this.voltarAoMenuShowcase(),
      onAlternarSom: () => this.alternarSom(),
      onAlternarTema: () => this.alternarTema(),
      onAlternarDaltonismo: () => this.alternarDaltonismo(),
      onAlterarDificuldade: (dif) => {
        this.ultimaDificuldade = dif;
        this.engine.definirDificuldade(dif);
      },
      onAlterarQuantidadeJogadores: (qtd) => {
        this.ultimaQtdJogadores = qtd;
        this.repositorio.atualizar({ quantidadeJogadores: qtd });
        const atual = this.repositorio.carregar();
        this.hud.atualizarRecordeExibido(qtd > 1 ? atual.recordeMultiplayer : atual.recordeSolo);
      },
      onTeclaQuadrante: (cor) => this.tratarEntradaJogador(cor),
      onAlterarCorCarcaca: (cor) => this.alterarCorCarcaca(cor),
      onAlterarCenario: (cenario) => this.alterarCenario(cenario),

      // Ações da aba Multiplayer Online
      onCriarSalaOnline: (apelido, dif) => {
        this.sound.desbloquear();
        this.online.criarSala(apelido, dif);
      },
      onEntrarSalaOnline: (codigo, apelido) => {
        this.sound.desbloquear();
        this.online.entrarSala(codigo, apelido);
      },
      onSairSalaOnline: () => {
        this.online.sairDaSala();
        this.emPartidaOnline = false;
        this.snapshotRemoto = null;
        this.hud.atualizarLobbyOnline(null, 'NENHUM', 0);
        this.hud.exibirFeedbackOnline('Você saiu da sala.', false);
      },
      onIniciarPartidaOnline: () => {
        void this.iniciarPartidaOnlineComoHost();
      },
      onAlterarDificuldadeOnline: (dif) => {
        this.online.atualizarDificuldadeLobby(dif);
      },
      onCopiarLinkConvite: () => {
        void this.copiarLinkConvite();
      },
      onSomHoverUI: () => this.sound.tocarHoverUI(),
      onSomCliqueUI: () => this.sound.tocarCliqueUI(),
      onSomConfirmarUI: () => this.sound.tocarConfirmarUI(),
      onSomVoltarUI: () => this.sound.tocarVoltarUI(),
    });

    this.hud.sincronizarEstado(this.engine.obterEstado());

    // Detecta automaticamente links de convite (?sala=XXXXXX)
    const codigoUrl = extrairCodigoDaUrl(window.location.search);
    if (codigoUrl) {
      this.hud.preencherCodigoConvite(codigoUrl);
    }
  }

  private async copiarLinkConvite(): Promise<void> {
    const lobby = this.online.obterLobby();
    if (!lobby) return;
    const link = criarLinkConvite(window.location.href, lobby.codigoSala);
    try {
      await navigator.clipboard.writeText(link);
      this.hud.mostrarConfirmacaoCopia();
    } catch {
      this.hud.exibirFeedbackOnline(`Compartilhe o código: ${lobby.codigoSala}`, false);
    }
  }

  // ==========================================================================
  // FLUXO LOCAL (SOLO E MULTIPLAYER LOCAL 2–4P)
  // ==========================================================================

  private async iniciarNovaPartidaLocal(quantidadeJogadores: number, dificuldade: Dificuldade): Promise<void> {
    const token = ++this.tokenFluxo;
    this.emPartidaOnline = false;
    this.snapshotRemoto = null;
    this.ultimaQtdJogadores = quantidadeJogadores;
    this.ultimaDificuldade = dificuldade;

    this.sound.desbloquear();
    this.scene.definirInteracaoHabilitada(false);
    this.scene.modelo.apagarTodos();
    this.scene.definirModoCamera('JOGANDO');

    const snapshot = this.engine.iniciarPartida({
      quantidadeJogadores,
      dificuldade,
    });
    this.hud.sincronizarEstado(snapshot);
    this.scene.modelo.atualizarDisplay(
      String(snapshot.rodadaAtual).padStart(2, '0'),
      'PREPARE-SE',
      '#38bdf8'
    );

    if (snapshot.modoMultiplayer) {
      this.hud.definirMensagemStatus(`Vez de ${snapshot.jogadorAtual.nome}! Observe...`, 'padrao');
    } else {
      this.hud.definirMensagemStatus('Preparando tabuleiro...', 'padrao');
    }

    await aguardar(950);
    if (token !== this.tokenFluxo) return;

    await this.reproduzirSequenciaNoHostOuLocal(token);
  }

  // ==========================================================================
  // FLUXO MULTIPLAYER ONLINE (HOST-AUTORITATIVO VIA WEBRTC)
  // ==========================================================================

  private async iniciarPartidaOnlineComoHost(): Promise<void> {
    if (this.online.obterPapel() !== 'HOST') return;
    const lobby = this.online.obterLobby();
    if (!lobby || lobby.participantes.length < 2) {
      this.hud.exibirFeedbackOnline('Aguarde pelo menos 2 jogadores na sala para iniciar.', true);
      return;
    }

    const token = ++this.tokenFluxo;
    this.emPartidaOnline = true;
    this.snapshotRemoto = null;
    this.online.definirEmPartida(true);

    this.sound.desbloquear();
    this.scene.definirInteracaoHabilitada(false);
    this.scene.modelo.apagarTodos();
    this.scene.definirModoCamera('JOGANDO');

    const nomes = lobby.participantes.map((p) => p.nome);
    const snapshot = this.engine.iniciarPartida({
      quantidadeJogadores: lobby.participantes.length,
      nomesJogadores: nomes,
      dificuldade: lobby.dificuldade,
    });

    this.hud.sincronizarEstado(snapshot, {
      emPartidaOnline: true,
      meuJogadorId: this.online.obterMeuJogadorId(),
    });
    this.scene.modelo.atualizarDisplay(
      String(snapshot.rodadaAtual).padStart(2, '0'),
      'PREPARE-SE',
      '#38bdf8'
    );
    this.hud.definirMensagemStatus(`Vez de ${snapshot.jogadorAtual.nome}! Observe...`, 'padrao');

    // Sincroniza o início da partida com todos os convidados
    this.online.transmitirParaTodos({
      tipo: 'PARTIDA_INICIADA',
      snapshot,
    });

    await aguardar(950);
    if (token !== this.tokenFluxo) return;

    await this.reproduzirSequenciaNoHostOuLocal(token);
  }

  /**
   * Volta ao Menu 3D (ou ao Lobby Online se estiver em uma sala como Host).
   */
  private voltarAoMenuShowcase(): void {
    this.tokenFluxo += 1;
    this.scene.definirInteracaoHabilitada(false);
    this.scene.modelo.apagarTodos();
    this.scene.definirModoCamera('SHOWCASE');
    this.scene.modelo.atualizarDisplay('--', 'PRONTO', '#38bdf8');

    if (this.emPartidaOnline) {
      if (this.online.obterPapel() === 'HOST') {
        this.emPartidaOnline = false;
        this.online.definirEmPartida(false);
        const snapshotMenu = this.engine.voltarAoMenu();
        this.hud.sincronizarEstado(snapshotMenu);
        this.hud.selecionarAba('online');
      } else {
        // Convidado saindo durante ou após a partida desconecta da sala
        this.online.sairDaSala();
        this.emPartidaOnline = false;
        this.snapshotRemoto = null;
        const snapshotMenu = this.engine.voltarAoMenu();
        this.hud.sincronizarEstado(snapshotMenu);
        this.hud.atualizarLobbyOnline(null, 'NENHUM', 0);
        this.hud.selecionarAba('online');
      }
      return;
    }

    const snapshot = this.engine.voltarAoMenu();
    this.hud.sincronizarEstado(snapshot);

    const prefs = this.repositorio.carregar();
    this.hud.atualizarRecordeExibido(
      this.ultimaQtdJogadores > 1 ? prefs.recordeMultiplayer : prefs.recordeSolo
    );
  }

  private encerrarPartidaOnlineLocalmente(motivo: string): void {
    this.tokenFluxo += 1;
    this.emPartidaOnline = false;
    this.snapshotRemoto = null;
    this.scene.definirInteracaoHabilitada(false);
    this.scene.modelo.apagarTodos();
    this.scene.definirModoCamera('SHOWCASE');
    this.scene.modelo.atualizarDisplay('--', 'PRONTO', '#38bdf8');

    const snapshot = this.engine.voltarAoMenu();
    this.hud.sincronizarEstado(snapshot);
    this.hud.atualizarLobbyOnline(null, 'NENHUM', 0);
    this.hud.selecionarAba('online');
    this.hud.exibirFeedbackOnline(motivo, true);
  }

  /**
   * Reproduz visualmente e sonoramente a sequência atual (no modo Local ou como Host Online).
   */
  private async reproduzirSequenciaNoHostOuLocal(token: number): Promise<void> {
    this.engine.iniciarExibicaoSequencia();
    this.scene.definirInteracaoHabilitada(false);

    const snapshot = this.engine.obterEstado();
    const tempo = this.engine.obterConfiguracaoTempo();

    if (this.emPartidaOnline && this.online.obterPapel() === 'HOST') {
      this.online.transmitirParaTodos({
        tipo: 'REPRODUZIR_SEQUENCIA',
        sequencia: [...snapshot.sequenciaJogo],
        tempo,
        snapshot,
      });
    }

    await this.executarAnimacaoSequencia(token, snapshot.sequenciaJogo, tempo, snapshot);
    if (token !== this.tokenFluxo) return;

    // Libera a vez do jogador atual (RF-03)
    this.engine.liberarEntradaJogador();
    const estadoLiberado = this.engine.obterEstado();

    if (this.emPartidaOnline && this.online.obterPapel() === 'HOST') {
      this.online.transmitirParaTodos({
        tipo: 'LIBERAR_TURNO',
        snapshot: estadoLiberado,
      });
    }

    this.aplicarTurnoLiberadoNaInterface(estadoLiberado);
  }

  /**
   * Executa a animação 3D + áudio de cada cor da sequência (usado por Local, Host e Convidado).
   */
  private async executarAnimacaoSequencia(
    token: number,
    sequencia: readonly CorGenius[],
    tempo: ConfiguracaoTempo,
    snapshot: EstadoPartidaSnapshot
  ): Promise<void> {
    this.scene.definirInteracaoHabilitada(false);
    this.hud.sincronizarEstado(snapshot, {
      emPartidaOnline: this.emPartidaOnline,
      meuJogadorId: this.online.obterMeuJogadorId(),
    });

    const rotuloTurno = snapshot.modoMultiplayer
      ? `Vez de ${snapshot.jogadorAtual.nome} — Observe a sequência...`
      : 'Observe a sequência...';
    this.hud.definirMensagemStatus(rotuloTurno, 'padrao');
    this.scene.modelo.atualizarDisplay(
      String(snapshot.rodadaAtual).padStart(2, '0'),
      'OBSERVE',
      '#38bdf8'
    );

    await aguardar(360);
    if (token !== this.tokenFluxo) return;

    for (const cor of sequencia) {
      if (token !== this.tokenFluxo) return;

      this.scene.modelo.definirQuadranteAtivo(cor, true);
      this.sound.tocarNota(cor, tempo.duracaoNotaMs);

      await aguardar(tempo.duracaoNotaMs);
      if (token !== this.tokenFluxo) return;

      this.scene.modelo.definirQuadranteAtivo(cor, false);

      await aguardar(tempo.intervaloNotasMs);
      if (token !== this.tokenFluxo) return;
    }
  }

  /**
   * Atualiza o HUD e libera o Raycaster/Teclado somente se for a vez deste dispositivo.
   */
  private aplicarTurnoLiberadoNaInterface(snapshot: EstadoPartidaSnapshot): void {
    const meuId = this.online.obterMeuJogadorId();
    this.hud.sincronizarEstado(snapshot, {
      emPartidaOnline: this.emPartidaOnline,
      meuJogadorId: meuId,
    });

    const ehMinhaVez = !this.emPartidaOnline || snapshot.jogadorAtual.id === meuId;
    this.scene.definirInteracaoHabilitada(ehMinhaVez);

    if (ehMinhaVez) {
      const msgSuaVez = snapshot.modoMultiplayer
        ? `Sua vez! (${snapshot.jogadorAtual.nome})`
        : 'Sua vez!';
      this.hud.definirMensagemStatus(msgSuaVez, 'aguardando');
      this.scene.modelo.atualizarDisplay(
        String(snapshot.rodadaAtual).padStart(2, '0'),
        'SUA VEZ',
        '#facc15'
      );
    } else {
      this.hud.definirMensagemStatus(`Aguardando jogada de ${snapshot.jogadorAtual.nome}...`, 'padrao');
      this.scene.modelo.atualizarDisplay(
        String(snapshot.rodadaAtual).padStart(2, '0'),
        'AGUARDE',
        '#38bdf8'
      );
    }
  }

  /**
   * Aciona o feedback audiovisual imediato de um quadrante clicado/tocado.
   */
  private pulsarQuadrante(cor: CorGenius, duracaoMs = 240): void {
    this.scene.modelo.definirQuadranteAtivo(cor, true);
    this.sound.tocarNota(cor, duracaoMs);
    window.setTimeout(() => {
      this.scene.modelo.definirQuadranteAtivo(cor, false);
    }, duracaoMs);
  }

  /**
   * Entrada vinda do clique/toque 3D (Raycaster) ou teclado neste dispositivo.
   */
  private tratarEntradaJogador(cor: CorGenius): void {
    this.sound.desbloquear();

    // Convidado online envia a jogada para validação autoritativa no Host
    if (this.emPartidaOnline && this.online.obterPapel() === 'CONVIDADO') {
      if (
        this.snapshotRemoto &&
        this.snapshotRemoto.estado === 'AGUARDANDO_JOGADOR' &&
        this.snapshotRemoto.jogadorAtual.id === this.online.obterMeuJogadorId()
      ) {
        this.online.enviarJogadaParaHost(cor);
      }
      return;
    }

    // Host online só pode clicar diretamente quando for o turno do próprio Host (id === 1)
    if (this.emPartidaOnline && this.online.obterPapel() === 'HOST') {
      const estado = this.engine.obterEstado();
      if (estado.jogadorAtual.id !== this.online.obterMeuJogadorId()) {
        return;
      }
    }

    this.processarJogadaAutoritativa(cor);
  }

  /**
   * Recebe uma jogada remota enviada por um Convidado e valida na GameEngine do Host.
   */
  private tratarJogadaRemotaNoHost(jogadorId: number, cor: CorGenius): void {
    if (!this.emPartidaOnline || this.online.obterPapel() !== 'HOST') return;
    const estado = this.engine.obterEstado();
    if (estado.estado !== 'AGUARDANDO_JOGADOR' || estado.jogadorAtual.id !== jogadorId) {
      return;
    }
    this.processarJogadaAutoritativa(cor);
  }

  /**
   * Executa a validação na GameEngine (Local ou Host Online) e transmite resultados se Online.
   */
  private processarJogadaAutoritativa(cor: CorGenius): void {
    const jogadorAntes = this.engine.obterEstado().jogadorAtual;
    const resultado = this.engine.registrarJogada(cor);

    if (resultado.status === 'IGNORADO') {
      return;
    }

    const token = this.tokenFluxo;
    const ehHostOnline = this.emPartidaOnline && this.online.obterPapel() === 'HOST';

    if (resultado.status === 'ACERTO_PARCIAL') {
      this.pulsarQuadrante(cor, 210);
      if (ehHostOnline) {
        this.online.transmitirParaTodos({
          tipo: 'PULSAR_COR',
          cor,
          duracaoMs: 210,
          jogadorId: jogadorAntes.id,
        });
      }
      return;
    }

    if (resultado.status === 'RODADA_COMPLETA') {
      this.scene.definirInteracaoHabilitada(false);
      this.pulsarQuadrante(cor, 240);

      const snapshot = this.engine.obterEstado();
      if (ehHostOnline) {
        this.online.transmitirParaTodos({
          tipo: 'PULSAR_COR',
          cor,
          duracaoMs: 240,
          jogadorId: jogadorAntes.id,
        });
        this.online.transmitirParaTodos({
          tipo: 'RODADA_COMPLETA',
          snapshot,
          proximoJogador: resultado.proximoJogador,
        });
      }

      this.exibirFeedbackRodadaCompleta(snapshot, resultado.proximoJogador?.nome);

      void (async () => {
        await aguardar(260);
        if (token !== this.tokenFluxo) return;
        this.sound.tocarVitoriaRodada();

        await aguardar(720);
        if (token !== this.tokenFluxo) return;

        this.engine.avancarProximaRodada();
        await this.reproduzirSequenciaNoHostOuLocal(token);
      })();
      return;
    }

    if (resultado.status === 'JOGADOR_ELIMINADO') {
      this.scene.definirInteracaoHabilitada(false);
      this.sound.tocarErro();

      const snapshot = this.engine.obterEstado();
      if (ehHostOnline) {
        this.online.transmitirParaTodos({
          tipo: 'JOGADOR_ELIMINADO',
          snapshot,
          jogadorEliminado: resultado.jogadorEliminado,
          proximoJogador: resultado.proximoJogador,
          motivo: 'ERRO',
        });
      }

      this.exibirFeedbackEliminacao(
        snapshot,
        resultado.jogadorEliminado?.nome ?? 'Jogador',
        resultado.proximoJogador?.nome ?? 'Próximo jogador',
        'ERRO'
      );

      void (async () => {
        await aguardar(1450);
        if (token !== this.tokenFluxo) return;
        await this.reproduzirSequenciaNoHostOuLocal(token);
      })();
      return;
    }

    if (resultado.status === 'GAME_OVER') {
      this.scene.definirInteracaoHabilitada(false);
      this.sound.tocarErro();

      const snapshot = this.engine.obterEstado();
      const ranking = this.engine.obterRanking();
      const novoRecorde = Boolean(resultado.novoRecorde);

      if (ehHostOnline) {
        this.online.transmitirParaTodos({
          tipo: 'GAME_OVER',
          snapshot,
          ranking,
          novoRecorde,
        });
      }

      this.exibirFeedbackGameOver(token, snapshot, ranking, novoRecorde);
    }
  }

  /**
   * Trata desconexão de um Convidado durante uma partida Online em andamento no Host.
   */
  private tratarDesconexaoDurantePartida(participante: ParticipanteSala): void {
    if (!this.emPartidaOnline || this.online.obterPapel() !== 'HOST') return;

    const eraTurnoDele = this.engine.obterEstado().jogadorAtual.id === participante.jogadorId;
    const resultado = this.engine.eliminarJogadorPorId(participante.jogadorId);
    if (resultado.status === 'IGNORADO') return;

    const token = ++this.tokenFluxo;
    const snapshot = this.engine.obterEstado();

    if (resultado.status === 'GAME_OVER') {
      const ranking = this.engine.obterRanking();
      const novoRecorde = Boolean(resultado.novoRecorde);
      this.online.transmitirParaTodos({
        tipo: 'GAME_OVER',
        snapshot,
        ranking,
        novoRecorde,
      });
      this.exibirFeedbackGameOver(token, snapshot, ranking, novoRecorde);
      return;
    }

    if (resultado.status === 'JOGADOR_ELIMINADO') {
      this.online.transmitirParaTodos({
        tipo: 'JOGADOR_ELIMINADO',
        snapshot,
        jogadorEliminado: resultado.jogadorEliminado,
        proximoJogador: resultado.proximoJogador,
        motivo: 'DESCONEXAO',
      });

      this.exibirFeedbackEliminacao(
        snapshot,
        participante.nome,
        resultado.proximoJogador?.nome ?? 'Próximo jogador',
        'DESCONEXAO'
      );

      if (eraTurnoDele) {
        void (async () => {
          await aguardar(1400);
          if (token !== this.tokenFluxo) return;
          await this.reproduzirSequenciaNoHostOuLocal(token);
        })();
      }
    }
  }

  /**
   * Processa no Convidado as mensagens sincronizadas enviadas pelo Host.
   */
  private tratarMensagemDoHost(msg: MensagemHostParaCliente): void {
    if (this.online.obterPapel() !== 'CONVIDADO') return;

    switch (msg.tipo) {
      case 'PARTIDA_INICIADA': {
        this.tokenFluxo += 1;
        this.emPartidaOnline = true;
        this.snapshotRemoto = msg.snapshot;
        this.scene.definirInteracaoHabilitada(false);
        this.scene.modelo.apagarTodos();
        this.scene.definirModoCamera('JOGANDO');
        this.hud.sincronizarEstado(msg.snapshot, {
          emPartidaOnline: true,
          meuJogadorId: this.online.obterMeuJogadorId(),
        });
        this.scene.modelo.atualizarDisplay(
          String(msg.snapshot.rodadaAtual).padStart(2, '0'),
          'PREPARE-SE',
          '#38bdf8'
        );
        this.hud.definirMensagemStatus(`Vez de ${msg.snapshot.jogadorAtual.nome}! Observe...`, 'padrao');
        break;
      }

      case 'REPRODUZIR_SEQUENCIA': {
        const token = ++this.tokenFluxo;
        this.snapshotRemoto = msg.snapshot;
        void this.executarAnimacaoSequencia(token, msg.sequencia, msg.tempo, msg.snapshot);
        break;
      }

      case 'LIBERAR_TURNO': {
        this.snapshotRemoto = msg.snapshot;
        this.aplicarTurnoLiberadoNaInterface(msg.snapshot);
        break;
      }

      case 'PULSAR_COR': {
        this.pulsarQuadrante(msg.cor, msg.duracaoMs);
        break;
      }

      case 'RODADA_COMPLETA': {
        this.scene.definirInteracaoHabilitada(false);
        this.snapshotRemoto = msg.snapshot;
        this.exibirFeedbackRodadaCompleta(msg.snapshot, msg.proximoJogador?.nome);
        window.setTimeout(() => this.sound.tocarVitoriaRodada(), 260);
        break;
      }

      case 'JOGADOR_ELIMINADO': {
        this.scene.definirInteracaoHabilitada(false);
        this.sound.tocarErro();
        this.snapshotRemoto = msg.snapshot;
        this.exibirFeedbackEliminacao(
          msg.snapshot,
          msg.jogadorEliminado?.nome ?? 'Jogador',
          msg.proximoJogador?.nome ?? 'Próximo jogador',
          msg.motivo ?? 'ERRO'
        );
        break;
      }

      case 'GAME_OVER': {
        const token = ++this.tokenFluxo;
        this.scene.definirInteracaoHabilitada(false);
        this.sound.tocarErro();
        this.snapshotRemoto = msg.snapshot;
        this.exibirFeedbackGameOver(token, msg.snapshot, msg.ranking, msg.novoRecorde);
        break;
      }

      case 'VOLTAR_LOBBY': {
        this.tokenFluxo += 1;
        this.emPartidaOnline = false;
        this.snapshotRemoto = null;
        this.scene.definirInteracaoHabilitada(false);
        this.scene.modelo.apagarTodos();
        this.scene.definirModoCamera('SHOWCASE');
        this.scene.modelo.atualizarDisplay('--', 'PRONTO', '#38bdf8');
        this.hud.sincronizarEstado(this.engine.voltarAoMenu());
        this.hud.selecionarAba('online');
        break;
      }
    }
  }

  private exibirFeedbackRodadaCompleta(snapshot: EstadoPartidaSnapshot, nomeProximo?: string): void {
    const prefs = this.repositorio.carregar();
    this.hud.atualizarCustomizacao(this.corCarcacaAtual, this.cenarioAtual, prefs.pontosTotais);
    this.hud.sincronizarEstado(snapshot, {
      emPartidaOnline: this.emPartidaOnline,
      meuJogadorId: this.online.obterMeuJogadorId(),
    });
    const msgAcerto =
      snapshot.modoMultiplayer && nomeProximo
        ? `Correto! Próximo turno: ${nomeProximo}`
        : 'Correto! Próxima rodada...';
    this.hud.definirMensagemStatus(msgAcerto, 'sucesso');
    this.scene.modelo.atualizarDisplay(
      String(snapshot.rodadaAtual).padStart(2, '0'),
      'CORRETO!',
      '#22c55e'
    );
  }

  private exibirFeedbackEliminacao(
    snapshot: EstadoPartidaSnapshot,
    nomeEliminado: string,
    nomeProximo: string,
    motivo: 'ERRO' | 'DESCONEXAO'
  ): void {
    this.hud.sincronizarEstado(snapshot, {
      emPartidaOnline: this.emPartidaOnline,
      meuJogadorId: this.online.obterMeuJogadorId(),
    });
    const texto =
      motivo === 'DESCONEXAO'
        ? `${nomeEliminado} desconectou! Vez de ${nomeProximo}...`
        : `${nomeEliminado} eliminado! Vez de ${nomeProximo}...`;
    this.hud.definirMensagemStatus(texto, 'erro');
    this.scene.modelo.atualizarDisplay('XX', 'ELIMINADO', '#ef4444');
  }

  private exibirFeedbackGameOver(
    token: number,
    snapshot: EstadoPartidaSnapshot,
    ranking: ReturnType<GameEngine['obterRanking']>,
    novoRecorde: boolean
  ): void {
    this.hud.sincronizarEstado(snapshot, {
      emPartidaOnline: this.emPartidaOnline,
      meuJogadorId: this.online.obterMeuJogadorId(),
    });
    this.hud.definirMensagemStatus('Game Over!', 'erro');
    this.scene.modelo.atualizarDisplay('!!', 'FIM', '#ef4444');

    window.setTimeout(() => {
      if (token !== this.tokenFluxo) return;
      this.hud.exibirModalFimDeJogo({
        snapshot,
        ranking,
        novoRecorde,
        emPartidaOnline: this.emPartidaOnline,
        papelOnline: this.online.obterPapel(),
      });
    }, 480);
  }

  private alternarSom(): void {
    const novoEstado = !this.sound.estaAtivo();
    this.sound.definirSomAtivo(novoEstado);
    if (novoEstado) {
      this.sound.desbloquear();
    }
    this.repositorio.atualizar({ somAtivo: novoEstado });
    this.hud.atualizarBotaoSom(novoEstado);
  }

  private alternarTema(): void {
    this.temaAtual = this.temaAtual === 'escuro' ? 'claro' : 'escuro';
    this.scene.definirTemaVisual(this.temaAtual);
    this.repositorio.atualizar({ tema: this.temaAtual });
    this.hud.atualizarBotaoTema(this.temaAtual);
  }

  private alterarCorCarcaca(cor: CorCarcaca): void {
    this.corCarcacaAtual = cor;
    this.scene.modelo.definirCorCarcaca(cor);
    const prefs = this.repositorio.atualizar({ corCarcaca: cor });
    this.hud.atualizarCustomizacao(this.corCarcacaAtual, this.cenarioAtual, prefs.pontosTotais);
  }

  private alterarCenario(cenario: Cenario3D): void {
    this.cenarioAtual = cenario;
    this.scene.definirCenario(cenario);
    const prefs = this.repositorio.atualizar({ cenario });
    this.hud.atualizarCustomizacao(this.corCarcacaAtual, this.cenarioAtual, prefs.pontosTotais);
  }

  private alternarDaltonismo(): void {
    this.modoDaltonismo = !this.modoDaltonismo;
    this.scene.modelo.definirModoDaltonismo(this.modoDaltonismo);
    this.repositorio.atualizar({ modoDaltonismo: this.modoDaltonismo });
    this.hud.atualizarBotaoDaltonismo(this.modoDaltonismo);
  }
}

// Inicializa a aplicação assim que o DOM estiver pronto
window.addEventListener('DOMContentLoaded', () => {
  new GeniusApp();
});
