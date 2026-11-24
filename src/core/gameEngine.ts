// ============================================================================
// MOTOR DE REGRAS E MÁQUINA DE ESTADOS — GENIUS 3D WEB (UNICAP)
// Lógica 100% pura e desacoplada do Three.js e do DOM para permitir testes
// automatizados (TDD com Vitest) e futura extensão para multiplayer online.
// ============================================================================

import { Dificuldade, RepositorioGenius } from './storage';

/**
 * As 4 cores oficiais dos quadrantes do Genius clássico.
 */
export const CORES = ['verde', 'vermelho', 'amarelo', 'azul'] as const;
export type CorGenius = (typeof CORES)[number];

/**
 * Estados possíveis da máquina de estados do jogo (RF-03).
 */
export type EstadoJogo =
  | 'MENU'
  | 'PREPARANDO_TURNO'
  | 'EXIBINDO_SEQUENCIA'
  | 'AGUARDANDO_JOGADOR'
  | 'TRANSICAO_RODADA'
  | 'GAME_OVER';

/**
 * Representa um jogador na partida (Solo ou Multiplayer Local).
 */
export interface Jogador {
  id: number;
  nome: string;
  pontuacao: number;
  ativo: boolean;
}

/**
 * Parâmetros de velocidade para exibição da sequência de acordo com a dificuldade.
 */
export interface ConfiguracaoTempo {
  duracaoNotaMs: number;
  intervaloNotasMs: number;
}

/**
 * Resultado retornado ao validar cada clique/toque do jogador (RF-03).
 */
export interface ResultadoJogada {
  status: 'IGNORADO' | 'ACERTO_PARCIAL' | 'RODADA_COMPLETA' | 'JOGADOR_ELIMINADO' | 'GAME_OVER';
  corEsperada?: CorGenius;
  jogadorEliminado?: Jogador;
  proximoJogador?: Jogador;
  vencedor?: Jogador | null;
  novoRecorde?: boolean;
}

/**
 * Fotografia imutável do estado atual da partida para atualização da interface (HUD).
 */
export interface EstadoPartidaSnapshot {
  estado: EstadoJogo;
  sequenciaJogo: readonly CorGenius[];
  sequenciaJogador: readonly CorGenius[];
  rodadaAtual: number;
  bloqueado: boolean;
  dificuldade: Dificuldade;
  modoMultiplayer: boolean;
  jogadores: readonly Jogador[];
  indiceJogadorAtual: number;
  jogadorAtual: Jogador;
  vencedor: Jogador | null;
  recordeAtual: number;
}

/**
 * Configurações base de velocidade por nível de dificuldade (RF-04).
 */
const TEMPOS_DIFICULDADE: Record<Dificuldade, { baseDuracao: number; baseIntervalo: number; minDuracao: number; passo: number }> = {
  facil: { baseDuracao: 620, baseIntervalo: 250, minDuracao: 320, passo: 15 },
  medio: { baseDuracao: 460, baseIntervalo: 180, minDuracao: 210, passo: 18 },
  dificil: { baseDuracao: 320, baseIntervalo: 120, minDuracao: 140, passo: 20 },
};

/**
 * Classe principal da máquina de estados do jogo Genius.
 * Gerencia sequência aleatória, bloqueio de entrada, validação de cliques,
 * turnos de múltiplos jogadores e atualização de recordes.
 */
export class GameEngine {
  // 1. Variáveis de controle de estado do jogo
  private estado: EstadoJogo = 'MENU';
  private sequenciaJogo: CorGenius[] = []; // Armazena a sequência sorteada pelo sistema
  private sequenciaJogador: CorGenius[] = []; // Armazena os cliques/toques do jogador na rodada
  private rodadaAtual = 0; // Contador de rodadas da partida
  private dificuldade: Dificuldade = 'medio';

  // Controle de jogadores (Solo = 1 jogador; Multiplayer = 2 a 4 jogadores)
  private jogadores: Jogador[] = [];
  private indiceJogadorAtual = 0;
  private vencedor: Jogador | null = null;

  // Dependências injetáveis para determinismo em testes unitários (TDD)
  private readonly geradorAleatorio: () => number;
  private readonly repositorio: RepositorioGenius;

  constructor(opcoes?: { geradorAleatorio?: () => number; repositorio?: RepositorioGenius }) {
    this.geradorAleatorio = opcoes?.geradorAleatorio ?? Math.random;
    this.repositorio = opcoes?.repositorio ?? new RepositorioGenius();

    const prefs = this.repositorio.carregar();
    this.dificuldade = prefs.dificuldade;
    this.jogadores = this.criarListaJogadores(1);
  }

  /**
   * Cria a lista inicial de jogadores para uma nova partida.
   */
  private criarListaJogadores(quantidade: number, nomesPersonalizados?: string[]): Jogador[] {
    const total = Math.max(1, Math.min(4, Math.floor(quantidade)));
    const lista: Jogador[] = [];
    for (let i = 0; i < total; i++) {
      const nomeLimpo = nomesPersonalizados?.[i]?.trim();
      lista.push({
        id: i + 1,
        nome: nomeLimpo && nomeLimpo.length > 0 ? nomeLimpo : `Jogador ${i + 1}`,
        pontuacao: 0,
        ativo: true,
      });
    }
    return lista;
  }

  /**
   * Indica se as entradas do jogador devem estar bloqueadas no estado atual (RF-03).
   */
  public get bloqueado(): boolean {
    return this.estado !== 'AGUARDANDO_JOGADOR';
  }

  /**
   * Retorna se a partida atual está em modo Multiplayer (2 ou mais jogadores).
   */
  public get modoMultiplayer(): boolean {
    return this.jogadores.length > 1;
  }

  /**
   * Altera o nível de dificuldade/velocidade do jogo e persiste a preferência.
   */
  public definirDificuldade(novaDificuldade: Dificuldade): void {
    this.dificuldade = novaDificuldade;
    this.repositorio.atualizar({ dificuldade: novaDificuldade });
  }

  /**
   * Calcula o tempo de exibição de cada nota com aceleração gradual conforme a rodada avança.
   */
  public obterConfiguracaoTempo(): ConfiguracaoTempo {
    const cfg = TEMPOS_DIFICULDADE[this.dificuldade];
    const reducao = Math.max(0, this.rodadaAtual - 1) * cfg.passo;
    const duracaoNotaMs = Math.max(cfg.minDuracao, cfg.baseDuracao - reducao);
    const intervaloNotasMs = Math.max(90, Math.round(cfg.baseIntervalo - reducao * 0.35));
    return { duracaoNotaMs, intervaloNotasMs };
  }

  /**
   * 2. Inicia ou reinicia uma nova partida (Solo ou Multiplayer de 2 a 4 jogadores).
   */
  public iniciarPartida(config?: {
    quantidadeJogadores?: number;
    nomesJogadores?: string[];
    dificuldade?: Dificuldade;
  }): EstadoPartidaSnapshot {
    if (config?.dificuldade) {
      this.definirDificuldade(config.dificuldade);
    }

    const qtd = config?.quantidadeJogadores ?? this.jogadores.length ?? 1;
    this.jogadores = this.criarListaJogadores(qtd, config?.nomesJogadores);
    this.indiceJogadorAtual = 0;
    this.vencedor = null;
    this.sequenciaJogo = [];
    this.sequenciaJogador = [];
    this.rodadaAtual = 0;

    // Sorteia a primeira cor e coloca a máquina no estado de exibição
    this.avancarProximaRodada();
    return this.obterEstado();
  }

  /**
   * Retorna ao Menu Principal (estado Showcase), limpando a partida em andamento.
   */
  public voltarAoMenu(): EstadoPartidaSnapshot {
    this.estado = 'MENU';
    this.sequenciaJogo = [];
    this.sequenciaJogador = [];
    this.rodadaAtual = 0;
    this.vencedor = null;
    return this.obterEstado();
  }

  /**
   * 3. Sorteia uma nova cor pseudoaleatória válida (RF-01).
   */
  public gerarProximaCor(): CorGenius {
    const indice = Math.floor(this.geradorAleatorio() * CORES.length) % CORES.length;
    return CORES[indice];
  }

  /**
   * Incrementa a rodada, sorteia e adiciona uma nova cor à sequência do jogo
   * e bloqueia entradas até o término da demonstração audiovisual.
   */
  public avancarProximaRodada(): CorGenius {
    this.sequenciaJogador = [];
    this.rodadaAtual += 1;
    const corSorteada = this.gerarProximaCor();
    this.sequenciaJogo.push(corSorteada);
    this.estado = this.modoMultiplayer ? 'PREPARANDO_TURNO' : 'EXIBINDO_SEQUENCIA';
    return corSorteada;
  }

  /**
   * Permite injetar uma sequência específica em cenários de teste unitário (TDD).
   */
  public definirSequenciaParaTeste(sequencia: CorGenius[]): void {
    this.sequenciaJogo = [...sequencia];
    this.sequenciaJogador = [];
    this.rodadaAtual = sequencia.length;
  }

  /**
   * Marca o início efetivo da exibição audiovisual da sequência (mantém entrada bloqueada).
   */
  public iniciarExibicaoSequencia(): void {
    if (this.estado !== 'MENU' && this.estado !== 'GAME_OVER') {
      this.estado = 'EXIBINDO_SEQUENCIA';
    }
  }

  /**
   * Libera a interação do jogador após todos os passos da sequência serem exibidos.
   */
  public liberarEntradaJogador(): void {
    if (this.estado === 'EXIBINDO_SEQUENCIA' || this.estado === 'PREPARANDO_TURNO') {
      this.sequenciaJogador = [];
      this.estado = 'AGUARDANDO_JOGADOR';
    }
  }

  /**
   * 4. Valida a cor escolhida pelo jogador (clique, toque ou teclado) — RF-03.
   * Bloqueia entradas fora de hora, verifica acerto parcial, conclusão de rodada
   * ou erro (Game Over no Solo / eliminação e passagem de turno no Multiplayer).
   */
  public registrarJogada(corEscolhida: CorGenius): ResultadoJogada {
    // Bloqueio estrito: ignora qualquer tentativa fora do estado AGUARDANDO_JOGADOR (TST-03)
    if (this.estado !== 'AGUARDANDO_JOGADOR') {
      return { status: 'IGNORADO' };
    }

    const indiceAtual = this.sequenciaJogador.length;
    const corEsperada = this.sequenciaJogo[indiceAtual];
    this.sequenciaJogador.push(corEscolhida);

    // Verifica se a cor selecionada diverge da sequência esperada (TST-02)
    if (corEscolhida !== corEsperada) {
      return this.tratarErroJogador(corEsperada);
    }

    // Verifica se o jogador completou toda a sequência da rodada atual
    if (this.sequenciaJogador.length === this.sequenciaJogo.length) {
      const jogadorAtual = this.jogadores[this.indiceJogadorAtual];
      jogadorAtual.pontuacao += 1;

      const novoRecorde = this.repositorio.registrarPontuacao(
        jogadorAtual.pontuacao,
        this.modoMultiplayer
      );

      // No modo Multiplayer, passa o turno para o próximo jogador ativo
      if (this.modoMultiplayer) {
        this.indiceJogadorAtual = this.encontrarProximoJogadorAtivo(this.indiceJogadorAtual);
      }

      // Bloqueia novas entradas durante a transição para a próxima rodada
      this.estado = 'TRANSICAO_RODADA';

      return {
        status: 'RODADA_COMPLETA',
        proximoJogador: { ...this.jogadores[this.indiceJogadorAtual] },
        novoRecorde,
      };
    }

    // Acerto parcial: aguarda o próximo clique do jogador na mesma rodada
    return {
      status: 'ACERTO_PARCIAL',
      corEsperada,
    };
  }

  /**
   * Trata o erro do jogador atual:
   * - No modo Solo: transita imediatamente para GAME_OVER.
   * - No modo Multiplayer: elimina o jogador atual; se restar apenas 1 jogador ativo,
   *   declara-o vencedor (GAME_OVER); caso contrário, passa a vez ao próximo jogador ativo.
   */
  private tratarErroJogador(corEsperada: CorGenius): ResultadoJogada {
    const jogadorAtual = this.jogadores[this.indiceJogadorAtual];

    if (!this.modoMultiplayer) {
      this.estado = 'GAME_OVER';
      const novoRecorde = this.repositorio.registrarPontuacao(jogadorAtual.pontuacao, false);
      return {
        status: 'GAME_OVER',
        corEsperada,
        vencedor: null,
        novoRecorde,
      };
    }

    // Modo Multiplayer: elimina o jogador que errou
    jogadorAtual.ativo = false;
    const jogadoresAtivos = this.jogadores.filter((j) => j.ativo);

    if (jogadoresAtivos.length <= 1) {
      this.vencedor = jogadoresAtivos[0] ? { ...jogadoresAtivos[0] } : null;
      this.estado = 'GAME_OVER';

      const maiorPontuacao = Math.max(...this.jogadores.map((j) => j.pontuacao));
      const novoRecorde = this.repositorio.registrarPontuacao(maiorPontuacao, true);

      return {
        status: 'GAME_OVER',
        corEsperada,
        jogadorEliminado: { ...jogadorAtual },
        vencedor: this.vencedor,
        novoRecorde,
      };
    }

    // Ainda há 2 ou mais jogadores ativos: passa a vez mantendo a sequência atual
    this.indiceJogadorAtual = this.encontrarProximoJogadorAtivo(this.indiceJogadorAtual);
    this.sequenciaJogador = [];
    this.estado = 'PREPARANDO_TURNO';

    return {
      status: 'JOGADOR_ELIMINADO',
      corEsperada,
      jogadorEliminado: { ...jogadorAtual },
      proximoJogador: { ...this.jogadores[this.indiceJogadorAtual] },
    };
  }

  /**
   * Elimina um jogador específico pelo ID (utilizado em caso de desconexão
   * durante uma partida Multiplayer Online). Se restar apenas 1 ativo, encerra
   * a partida declarando-o vencedor.
   */
  public eliminarJogadorPorId(jogadorId: number): ResultadoJogada {
    if (!this.modoMultiplayer || this.estado === 'MENU' || this.estado === 'GAME_OVER') {
      return { status: 'IGNORADO' };
    }

    const idxAlvo = this.jogadores.findIndex((j) => j.id === jogadorId);
    if (idxAlvo === -1 || !this.jogadores[idxAlvo].ativo) {
      return { status: 'IGNORADO' };
    }

    const alvo = this.jogadores[idxAlvo];
    alvo.ativo = false;

    const ativos = this.jogadores.filter((j) => j.ativo);
    if (ativos.length <= 1) {
      this.vencedor = ativos[0] ? { ...ativos[0] } : null;
      this.estado = 'GAME_OVER';
      const maiorPontuacao = Math.max(...this.jogadores.map((j) => j.pontuacao));
      const novoRecorde = this.repositorio.registrarPontuacao(maiorPontuacao, true);

      return {
        status: 'GAME_OVER',
        jogadorEliminado: { ...alvo },
        vencedor: this.vencedor,
        novoRecorde,
      };
    }

    // Se o jogador desconectado estava no turno atual, avança o turno imediatamente
    if (this.indiceJogadorAtual === idxAlvo) {
      this.indiceJogadorAtual = this.encontrarProximoJogadorAtivo(idxAlvo);
      this.sequenciaJogador = [];
      this.estado = 'PREPARANDO_TURNO';
    }

    return {
      status: 'JOGADOR_ELIMINADO',
      jogadorEliminado: { ...alvo },
      proximoJogador: { ...this.jogadores[this.indiceJogadorAtual] },
    };
  }

  /**
   * Encontra circularmente o índice do próximo jogador ativo na lista.
   */
  private encontrarProximoJogadorAtivo(indiceOrigem: number): number {
    const total = this.jogadores.length;
    for (let passo = 1; passo <= total; passo++) {
      const candidato = (indiceOrigem + passo) % total;
      if (this.jogadores[candidato].ativo) {
        return candidato;
      }
    }
    return indiceOrigem;
  }

  /**
   * Retorna o ranking ordenado dos jogadores (ativos primeiro, depois maior pontuação).
   */
  public obterRanking(): Jogador[] {
    return this.jogadores
      .map((j) => ({ ...j }))
      .sort((a, b) => {
        if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
        if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
        return a.id - b.id;
      });
  }

  /**
   * Retorna o recorde salvo correspondente ao modo de jogo atual (Solo ou Multiplayer).
   */
  public obterRecordeAtual(): number {
    const prefs = this.repositorio.carregar();
    return this.modoMultiplayer ? prefs.recordeMultiplayer : prefs.recordeSolo;
  }

  /**
   * Retorna um snapshot imutável do estado atual da partida para consumo seguro pela UI.
   */
  public obterEstado(): EstadoPartidaSnapshot {
    const jogadoresCopia = this.jogadores.map((j) => ({ ...j }));
    return {
      estado: this.estado,
      sequenciaJogo: [...this.sequenciaJogo],
      sequenciaJogador: [...this.sequenciaJogador],
      rodadaAtual: this.rodadaAtual,
      bloqueado: this.bloqueado,
      dificuldade: this.dificuldade,
      modoMultiplayer: this.modoMultiplayer,
      jogadores: jogadoresCopia,
      indiceJogadorAtual: this.indiceJogadorAtual,
      jogadorAtual: jogadoresCopia[this.indiceJogadorAtual],
      vencedor: this.vencedor ? { ...this.vencedor } : null,
      recordeAtual: this.obterRecordeAtual(),
    };
  }
}
