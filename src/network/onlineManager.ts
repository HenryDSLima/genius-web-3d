// ============================================================================
// GERENCIADOR DE MULTIPLAYER ONLINE (WEBRTC / PEERJS) — GENIUS 3D WEB (UNICAP)
// Estabelece conexões P2P diretas entre navegadores sem necessidade de backend
// dedicado, permitindo hospedagem 100% estática (Vercel, Netlify, GitHub Pages).
// ============================================================================

import Peer, { DataConnection } from 'peerjs';
import { CorGenius } from '../core/gameEngine';
import { Dificuldade } from '../core/storage';
import {
  codigoParaPeerId,
  codigoSalaValido,
  EstadoLobbyOnline,
  gerarCodigoSala,
  higienizarApelido,
  MAX_JOGADORES_ONLINE,
  MensagemClienteParaHost,
  MensagemHostParaCliente,
  normalizarCodigoSala,
  ParticipanteSala,
} from './onlineProtocol';

export type PapelOnline = 'NENHUM' | 'HOST' | 'CONVIDADO';

export interface CallbacksOnline {
  onStatusConexao: (mensagem: string) => void;
  onLobbyAtualizado: (lobby: EstadoLobbyOnline, papel: PapelOnline, meuJogadorId: number) => void;
  onMensagemDoHost: (mensagem: MensagemHostParaCliente) => void;
  onJogadaRemotaRecebida: (jogadorId: number, cor: CorGenius) => void;
  onParticipanteDesconectado: (participante: ParticipanteSala) => void;
  onErro: (mensagem: string) => void;
  onDesconectado: (motivo: string) => void;
}

export class OnlineManager {
  private readonly callbacks: CallbacksOnline;

  private peer: Peer | null = null;
  private papel: PapelOnline = 'NENHUM';
  private meuJogadorId = 0;

  // Host: mapa peerId -> DataConnection; Convidado: única conexão com o Host
  private readonly conexoesClientes = new Map<string, DataConnection>();
  private conexaoHost: DataConnection | null = null;
  private timeoutConexao: number | null = null;

  private lobby: EstadoLobbyOnline | null = null;

  constructor(callbacks: CallbacksOnline) {
    this.callbacks = callbacks;
  }

  public obterPapel(): PapelOnline {
    return this.papel;
  }

  public obterMeuJogadorId(): number {
    return this.meuJogadorId;
  }

  public obterLobby(): EstadoLobbyOnline | null {
    return this.lobby
      ? {
          ...this.lobby,
          participantes: this.lobby.participantes.map((p) => ({ ...p })),
        }
      : null;
  }

  public estaConectado(): boolean {
    return this.papel !== 'NENHUM' && this.lobby !== null;
  }

  /**
   * Cria uma nova sala online como Anfitrião (Host) e gera o código de 6 caracteres.
   */
  public criarSala(apelido: string, dificuldade: Dificuldade): void {
    this.encerrarSilenciosamente();

    const codigoSala = gerarCodigoSala();
    const peerId = codigoParaPeerId(codigoSala);
    const nomeHost = higienizarApelido(apelido, 'Anfitrião');

    this.papel = 'HOST';
    this.meuJogadorId = 1;
    this.callbacks.onStatusConexao('Criando sala online...');

    const peer = new Peer(peerId, {
      debug: 0,
    });
    this.peer = peer;

    peer.on('open', (idAberto) => {
      if (this.peer !== peer) return;

      this.lobby = {
        codigoSala,
        dificuldade,
        emPartida: false,
        participantes: [
          {
            peerId: idAberto,
            jogadorId: 1,
            nome: nomeHost,
            ehHost: true,
          },
        ],
      };

      this.callbacks.onLobbyAtualizado(this.obterLobby()!, 'HOST', this.meuJogadorId);
    });

    peer.on('connection', (conn) => {
      if (this.peer !== peer) return;
      this.configurarConexaoNoHost(conn);
    });

    peer.on('error', (erro) => {
      if (this.peer !== peer) return;
      const tipo = (erro as { type?: string }).type;
      if (tipo === 'unavailable-id') {
        // Colisão rara de código: tenta novamente automaticamente com outro código
        this.criarSala(apelido, dificuldade);
        return;
      }
      this.callbacks.onErro('Erro na conexão online. Verifique sua internet e tente novamente.');
      this.encerrarSilenciosamente();
    });
  }

  /**
   * Configura os eventos de uma conexão de Convidado recebida pelo Host.
   */
  private configurarConexaoNoHost(conn: DataConnection): void {
    conn.on('data', (dados) => {
      const msg = dados as MensagemClienteParaHost;
      if (!msg || typeof msg !== 'object' || !this.lobby) return;

      if (msg.tipo === 'ENTRAR_SALA') {
        if (this.lobby.emPartida) {
          conn.send({
            tipo: 'ERRO_SALA',
            motivo: 'A partida desta sala já está em andamento.',
          } satisfies MensagemHostParaCliente);
          window.setTimeout(() => conn.close(), 120);
          return;
        }

        if (this.lobby.participantes.length >= MAX_JOGADORES_ONLINE) {
          conn.send({
            tipo: 'ERRO_SALA',
            motivo: 'Sala cheia (máximo de 4 jogadores).',
          } satisfies MensagemHostParaCliente);
          window.setTimeout(() => conn.close(), 120);
          return;
        }

        const novoId = this.encontrarMenorJogadorIdLivre();
        const nomeLimpo = higienizarApelido(msg.nome, `Jogador ${novoId}`);
        const participante: ParticipanteSala = {
          peerId: conn.peer,
          jogadorId: novoId,
          nome: nomeLimpo,
          ehHost: false,
        };

        this.conexoesClientes.set(conn.peer, conn);
        this.lobby.participantes.push(participante);
        this.lobby.participantes.sort((a, b) => a.jogadorId - b.jogadorId);

        const lobbySnapshot = this.obterLobby()!;

        // Envia boas-vindas com o ID atribuído ao novo convidado
        conn.send({
          tipo: 'BOAS_VINDAS',
          seuJogadorId: novoId,
          lobby: lobbySnapshot,
        } satisfies MensagemHostParaCliente);

        // Atualiza todos os demais clientes e o próprio Host
        this.transmitirParaTodos({ tipo: 'LOBBY_ATUALIZADO', lobby: lobbySnapshot }, conn.peer);
        this.callbacks.onLobbyAtualizado(lobbySnapshot, 'HOST', this.meuJogadorId);
        return;
      }

      if (msg.tipo === 'JOGADA') {
        const remetente = this.lobby.participantes.find((p) => p.peerId === conn.peer);
        if (remetente) {
          this.callbacks.onJogadaRemotaRecebida(remetente.jogadorId, msg.cor);
        }
      }
    });

    const tratarSaidaCliente = () => {
      if (!this.lobby) return;
      const idx = this.lobby.participantes.findIndex((p) => p.peerId === conn.peer);
      if (idx === -1) return;

      const [removido] = this.lobby.participantes.splice(idx, 1);
      this.conexoesClientes.delete(conn.peer);

      const lobbySnapshot = this.obterLobby()!;
      this.transmitirParaTodos({ tipo: 'LOBBY_ATUALIZADO', lobby: lobbySnapshot });
      this.callbacks.onLobbyAtualizado(lobbySnapshot, 'HOST', this.meuJogadorId);

      if (this.lobby.emPartida) {
        this.callbacks.onParticipanteDesconectado(removido);
      }
    };

    conn.on('close', tratarSaidaCliente);
    conn.on('error', tratarSaidaCliente);
  }

  private encontrarMenorJogadorIdLivre(): number {
    const usados = new Set(this.lobby?.participantes.map((p) => p.jogadorId) ?? [1]);
    for (let id = 2; id <= MAX_JOGADORES_ONLINE; id++) {
      if (!usados.has(id)) return id;
    }
    return MAX_JOGADORES_ONLINE;
  }

  /**
   * Entra em uma sala existente como Convidado usando o código de 6 caracteres.
   */
  public entrarSala(codigoInformado: string, apelido: string): void {
    const codigo = normalizarCodigoSala(codigoInformado);
    if (!codigoSalaValido(codigo)) {
      this.callbacks.onErro('Código inválido. Digite os 6 caracteres da sala.');
      return;
    }

    this.encerrarSilenciosamente();
    this.papel = 'CONVIDADO';
    this.meuJogadorId = 0;

    const nomeConvidado = higienizarApelido(apelido, 'Convidado');
    this.callbacks.onStatusConexao(`Conectando à sala ${codigo}...`);

    const peer = new Peer({ debug: 0 });
    this.peer = peer;

    // Timeout de segurança caso o código não exista ou o Host esteja offline
    this.timeoutConexao = window.setTimeout(() => {
      if (this.peer === peer && !this.lobby) {
        this.callbacks.onErro('Sala não encontrada ou anfitrião offline. Confira o código.');
        this.encerrarSilenciosamente();
      }
    }, 12000);

    peer.on('open', () => {
      if (this.peer !== peer) return;

      const conn = peer.connect(codigoParaPeerId(codigo), { reliable: true });
      this.conexaoHost = conn;

      conn.on('open', () => {
        if (this.conexaoHost !== conn) return;
        conn.send({
          tipo: 'ENTRAR_SALA',
          nome: nomeConvidado,
        } satisfies MensagemClienteParaHost);
      });

      conn.on('data', (dados) => {
        if (this.conexaoHost !== conn) return;
        const msg = dados as MensagemHostParaCliente;
        if (!msg || typeof msg !== 'object') return;

        if (msg.tipo === 'BOAS_VINDAS') {
          this.limparTimeoutConexao();
          this.meuJogadorId = msg.seuJogadorId;
          this.lobby = msg.lobby;
          this.callbacks.onLobbyAtualizado(this.obterLobby()!, 'CONVIDADO', this.meuJogadorId);
          return;
        }

        if (msg.tipo === 'ERRO_SALA') {
          this.limparTimeoutConexao();
          this.callbacks.onErro(msg.motivo);
          this.encerrarSilenciosamente();
          return;
        }

        if (msg.tipo === 'LOBBY_ATUALIZADO') {
          this.lobby = msg.lobby;
          this.callbacks.onLobbyAtualizado(this.obterLobby()!, 'CONVIDADO', this.meuJogadorId);
          return;
        }

        if (msg.tipo === 'VOLTAR_LOBBY') {
          this.lobby = msg.lobby;
          this.callbacks.onLobbyAtualizado(this.obterLobby()!, 'CONVIDADO', this.meuJogadorId);
        }

        this.callbacks.onMensagemDoHost(msg);
      });

      conn.on('close', () => {
        if (this.conexaoHost !== conn) return;
        this.encerrarSilenciosamente();
        this.callbacks.onDesconectado('O anfitrião encerrou a sala ou a conexão foi perdida.');
      });

      conn.on('error', () => {
        if (this.conexaoHost !== conn) return;
        this.encerrarSilenciosamente();
        this.callbacks.onErro('Falha na conexão com o anfitrião.');
      });
    });

    peer.on('error', (erro) => {
      if (this.peer !== peer) return;
      const tipo = (erro as { type?: string }).type;
      const msgErro =
        tipo === 'peer-unavailable'
          ? `Sala ${codigo} não encontrada. Verifique o código com o anfitrião.`
          : 'Não foi possível conectar ao servidor online.';
      this.callbacks.onErro(msgErro);
      this.encerrarSilenciosamente();
    });
  }

  /**
   * (Host) Atualiza a dificuldade escolhida e sincroniza o lobby com todos os convidados.
   */
  public atualizarDificuldadeLobby(dificuldade: Dificuldade): void {
    if (this.papel !== 'HOST' || !this.lobby) return;
    this.lobby.dificuldade = dificuldade;
    const snapshot = this.obterLobby()!;
    this.transmitirParaTodos({ tipo: 'LOBBY_ATUALIZADO', lobby: snapshot });
    this.callbacks.onLobbyAtualizado(snapshot, 'HOST', this.meuJogadorId);
  }

  /**
   * (Host) Marca se a sala está em partida ativa ou aguardando no lobby.
   */
  public definirEmPartida(emPartida: boolean): void {
    if (this.papel !== 'HOST' || !this.lobby) return;
    this.lobby.emPartida = emPartida;
    if (!emPartida) {
      const snapshot = this.obterLobby()!;
      this.transmitirParaTodos({ tipo: 'VOLTAR_LOBBY', lobby: snapshot });
      this.callbacks.onLobbyAtualizado(snapshot, 'HOST', this.meuJogadorId);
    }
  }

  /**
   * (Host) Envia uma mensagem do protocolo para todos os Convidados conectados.
   */
  public transmitirParaTodos(mensagem: MensagemHostParaCliente, ignorarPeerId?: string): void {
    if (this.papel !== 'HOST') return;
    for (const [peerId, conn] of this.conexoesClientes.entries()) {
      if (peerId === ignorarPeerId) continue;
      if (conn.open) {
        conn.send(mensagem);
      }
    }
  }

  /**
   * (Convidado) Envia sua jogada (cor clicada/teclada) para validação autoritativa do Host.
   */
  public enviarJogadaParaHost(cor: CorGenius): void {
    if (this.papel !== 'CONVIDADO' || !this.conexaoHost?.open) return;
    this.conexaoHost.send({
      tipo: 'JOGADA',
      cor,
    } satisfies MensagemClienteParaHost);
  }

  /**
   * Encerra todas as conexões P2P e volta ao estado desconectado.
   */
  public sairDaSala(): void {
    this.encerrarSilenciosamente();
  }

  private limparTimeoutConexao(): void {
    if (this.timeoutConexao !== null) {
      window.clearTimeout(this.timeoutConexao);
      this.timeoutConexao = null;
    }
  }

  private encerrarSilenciosamente(): void {
    this.limparTimeoutConexao();

    for (const conn of this.conexoesClientes.values()) {
      try {
        conn.close();
      } catch {
        // Ignora erros ao fechar conexões já encerradas
      }
    }
    this.conexoesClientes.clear();

    if (this.conexaoHost) {
      try {
        this.conexaoHost.close();
      } catch {
        // Ignora erro
      }
      this.conexaoHost = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignora erro
      }
      this.peer = null;
    }

    this.papel = 'NENHUM';
    this.meuJogadorId = 0;
    this.lobby = null;
  }
}
