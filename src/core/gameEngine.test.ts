// ============================================================================
// SUÍTE DE TESTES UNITÁRIOS (TDD - VITEST) — GENIUS 3D WEB (UNICAP)
// Cobre os casos obrigatórios TST-01 a TST-05 especificados no padrão IEEE 830.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { CORES, GameEngine } from './gameEngine';
import { cenarioEstaDesbloqueado, criarStorageEmMemoria, RepositorioGenius } from './storage';

/**
 * Helper para criar um gerador determinístico de números [0, 1) a partir de índices de cor.
 */
function criarGeradorFixo(indices: number[]): () => number {
  let pos = 0;
  return () => {
    const idx = indices[pos % indices.length];
    pos += 1;
    return (idx + 0.1) / CORES.length;
  };
}

describe('GameEngine — Suíte TDD (RF-01 a RF-05 e RTEC-03)', () => {
  // --------------------------------------------------------------------------
  // TST-01: Geração de sequência aleatória incremental (>= 20 rodadas)
  // --------------------------------------------------------------------------
  it('TST-01: deve gerar sequência aleatória incremental válida por pelo menos 25 rodadas', () => {
    const repo = new RepositorioGenius(criarStorageEmMemoria());
    const engine = new GameEngine({ repositorio: repo });

    engine.iniciarPartida({ quantidadeJogadores: 1 });
    expect(engine.obterEstado().sequenciaJogo).toHaveLength(1);
    expect(CORES).toContain(engine.obterEstado().sequenciaJogo[0]);

    for (let rodada = 2; rodada <= 25; rodada++) {
      const novaCor = engine.avancarProximaRodada();
      const snapshot = engine.obterEstado();

      expect(CORES).toContain(novaCor);
      expect(snapshot.rodadaAtual).toBe(rodada);
      expect(snapshot.sequenciaJogo).toHaveLength(rodada);
      expect(snapshot.sequenciaJogo[rodada - 1]).toBe(novaCor);
    }
  });

  // --------------------------------------------------------------------------
  // TST-02: Validação de jogada incorreta (Solo -> GAME_OVER)
  // --------------------------------------------------------------------------
  it('TST-02: deve retornar erro e transitar para GAME_OVER no modo Solo ao errar a sequência', () => {
    const repo = new RepositorioGenius(criarStorageEmMemoria());
    const engine = new GameEngine({ repositorio: repo });

    engine.iniciarPartida({ quantidadeJogadores: 1 });
    engine.definirSequenciaParaTeste(['verde', 'azul']);
    engine.liberarEntradaJogador();

    // Primeiro clique correto ('verde')
    const r1 = engine.registrarJogada('verde');
    expect(r1.status).toBe('ACERTO_PARCIAL');
    expect(engine.obterEstado().estado).toBe('AGUARDANDO_JOGADOR');

    // Segundo clique incorreto ('vermelho' em vez de 'azul')
    const r2 = engine.registrarJogada('vermelho');
    expect(r2.status).toBe('GAME_OVER');
    expect(r2.corEsperada).toBe('azul');
    expect(engine.obterEstado().estado).toBe('GAME_OVER');
    expect(engine.bloqueado).toBe(true);
  });

  // --------------------------------------------------------------------------
  // TST-03: Bloqueio de entrada durante exibição da sequência
  // --------------------------------------------------------------------------
  it('TST-03: deve ignorar cliques enquanto o estado for EXIBINDO_SEQUENCIA ou TRANSICAO_RODADA', () => {
    const repo = new RepositorioGenius(criarStorageEmMemoria());
    const engine = new GameEngine({
      geradorAleatorio: criarGeradorFixo([0]), // 'verde'
      repositorio: repo,
    });

    engine.iniciarPartida({ quantidadeJogadores: 1 });
    expect(engine.obterEstado().estado).toBe('EXIBINDO_SEQUENCIA');
    expect(engine.bloqueado).toBe(true);

    // Tentativa de clique durante exibição da sequência deve ser ignorada
    const ignorado = engine.registrarJogada('vermelho');
    expect(ignorado.status).toBe('IGNORADO');
    expect(engine.obterEstado().estado).toBe('EXIBINDO_SEQUENCIA');
    expect(engine.obterEstado().sequenciaJogador).toHaveLength(0);

    // Após liberar, o clique correto completa a rodada e bloqueia novamente
    engine.liberarEntradaJogador();
    const ok = engine.registrarJogada('verde');
    expect(ok.status).toBe('RODADA_COMPLETA');
    expect(engine.obterEstado().estado).toBe('TRANSICAO_RODADA');
    expect(engine.bloqueado).toBe(true);

    // Clique duplo/fora de hora durante transição também deve ser ignorado
    const duploClique = engine.registrarJogada('verde');
    expect(duploClique.status).toBe('IGNORADO');
  });

  // --------------------------------------------------------------------------
  // TST-04: Fluxo Multiplayer (alternância, pontuação, eliminação e vencedor)
  // --------------------------------------------------------------------------
  it('TST-04: deve alternar turnos, atualizar pontuações, eliminar quem errar e definir vencedor', () => {
    const repo = new RepositorioGenius(criarStorageEmMemoria());
    // Sequência previsível: verde (0), vermelho (1), amarelo (2)
    const engine = new GameEngine({
      geradorAleatorio: criarGeradorFixo([0, 1, 2]),
      repositorio: repo,
    });

    engine.iniciarPartida({
      quantidadeJogadores: 3,
      nomesJogadores: ['Ana', 'Bruno', 'Carla'],
    });

    // Turno 1 — Ana acerta ['verde']
    expect(engine.obterEstado().jogadorAtual.nome).toBe('Ana');
    engine.iniciarExibicaoSequencia();
    engine.liberarEntradaJogador();
    const resAna = engine.registrarJogada('verde');
    expect(resAna.status).toBe('RODADA_COMPLETA');
    expect(resAna.proximoJogador?.nome).toBe('Bruno');
    expect(engine.obterEstado().jogadores[0].pontuacao).toBe(1);

    // Turno 2 — Sequência agora é ['verde', 'vermelho']; Bruno erra no segundo passo
    engine.avancarProximaRodada();
    engine.iniciarExibicaoSequencia();
    engine.liberarEntradaJogador();
    expect(engine.obterEstado().jogadorAtual.nome).toBe('Bruno');

    expect(engine.registrarJogada('verde').status).toBe('ACERTO_PARCIAL');
    const resBruno = engine.registrarJogada('azul'); // Erro!
    expect(resBruno.status).toBe('JOGADOR_ELIMINADO');
    expect(resBruno.jogadorEliminado?.nome).toBe('Bruno');
    expect(resBruno.proximoJogador?.nome).toBe('Carla');
    expect(engine.obterEstado().jogadores[1].ativo).toBe(false);
    expect(engine.obterEstado().estado).toBe('PREPARANDO_TURNO');

    // Turno 3 — Carla acerta ['verde', 'vermelho']
    engine.iniciarExibicaoSequencia();
    engine.liberarEntradaJogador();
    expect(engine.registrarJogada('verde').status).toBe('ACERTO_PARCIAL');
    const resCarla = engine.registrarJogada('vermelho');
    expect(resCarla.status).toBe('RODADA_COMPLETA');
    expect(resCarla.proximoJogador?.nome).toBe('Ana'); // Pula Bruno (eliminado)
    expect(engine.obterEstado().jogadores[2].pontuacao).toBe(1);

    // Turno 4 — Ana erra ['verde', 'vermelho', 'amarelo'] -> Carla vence!
    engine.avancarProximaRodada();
    engine.iniciarExibicaoSequencia();
    engine.liberarEntradaJogador();
    const resFinal = engine.registrarJogada('amarelo'); // Erro no primeiro passo
    expect(resFinal.status).toBe('GAME_OVER');
    expect(resFinal.vencedor?.nome).toBe('Carla');
    expect(engine.obterEstado().estado).toBe('GAME_OVER');

    const ranking = engine.obterRanking();
    expect(ranking[0].nome).toBe('Carla');
    expect(ranking[0].ativo).toBe(true);
  });

  // --------------------------------------------------------------------------
  // TST-05: Persistência do recorde e preferências de som/acessibilidade
  // --------------------------------------------------------------------------
  it('TST-05: deve persistir e recuperar recorde, som e acessibilidade via RepositorioGenius', () => {
    const memoriaCompartilhada = criarStorageEmMemoria();
    const repo1 = new RepositorioGenius(memoriaCompartilhada);

    // Simula jogador completando 5 rodadas no modo Solo e mutando o som
    const engine1 = new GameEngine({
      geradorAleatorio: criarGeradorFixo([0]),
      repositorio: repo1,
    });
    engine1.iniciarPartida({ quantidadeJogadores: 1 });

    for (let i = 1; i <= 5; i++) {
      engine1.liberarEntradaJogador();
      for (let passo = 0; passo < i; passo++) {
        engine1.registrarJogada('verde');
      }
      if (i < 5) {
        engine1.avancarProximaRodada();
      }
    }

    repo1.atualizar({ somAtivo: false, modoDaltonismo: true, dificuldade: 'dificil' });

    // Simula recarregamento da página (F5) criando uma nova instância apontando para o mesmo storage
    const repo2 = new RepositorioGenius(memoriaCompartilhada);
    const prefsRecuperadas = repo2.carregar();

    expect(prefsRecuperadas.recordeSolo).toBe(5);
    expect(prefsRecuperadas.somAtivo).toBe(false);
    expect(prefsRecuperadas.modoDaltonismo).toBe(true);
    expect(prefsRecuperadas.dificuldade).toBe('dificil');

    const engine2 = new GameEngine({ repositorio: repo2 });
    expect(engine2.obterRecordeAtual()).toBe(5);
  });

  // --------------------------------------------------------------------------
  // Teste complementar: Velocidade progressiva por dificuldade
  // --------------------------------------------------------------------------
  it('deve reduzir o tempo de exibição das notas conforme a dificuldade e o avanço das rodadas', () => {
    const repo = new RepositorioGenius(criarStorageEmMemoria());
    const engine = new GameEngine({ repositorio: repo });

    engine.iniciarPartida({ quantidadeJogadores: 1, dificuldade: 'facil' });
    const tempoFacilR1 = engine.obterConfiguracaoTempo().duracaoNotaMs;

    engine.definirDificuldade('dificil');
    const tempoDificilR1 = engine.obterConfiguracaoTempo().duracaoNotaMs;

    expect(tempoDificilR1).toBeLessThan(tempoFacilR1);

    // Avança 5 rodadas e verifica aceleração
    for (let i = 0; i < 5; i++) {
      engine.avancarProximaRodada();
    }
    const tempoDificilR6 = engine.obterConfiguracaoTempo().duracaoNotaMs;
    expect(tempoDificilR6).toBeLessThan(tempoDificilR1);
  });

  // --------------------------------------------------------------------------
  // Teste complementar: Desconexão segura em partida Multiplayer Online
  // --------------------------------------------------------------------------
  it('deve eliminar jogador desconectado pelo ID e declarar vencedor quando restar apenas 1 ativo', () => {
    const repo = new RepositorioGenius(criarStorageEmMemoria());
    const engine = new GameEngine({
      geradorAleatorio: criarGeradorFixo([0, 1]),
      repositorio: repo,
    });

    engine.iniciarPartida({
      quantidadeJogadores: 2,
      nomesJogadores: ['Host', 'Convidado'],
    });
    engine.liberarEntradaJogador();

    // Convidado (id = 2) desconecta durante a partida -> Host (id = 1) vence
    const res = engine.eliminarJogadorPorId(2);
    expect(res.status).toBe('GAME_OVER');
    expect(res.jogadorEliminado?.nome).toBe('Convidado');
    expect(res.vencedor?.nome).toBe('Host');
    expect(engine.obterEstado().estado).toBe('GAME_OVER');
  });

  // --------------------------------------------------------------------------
  // Teste complementar: Acúmulo de pontos e desbloqueio de cenários 3D
  // --------------------------------------------------------------------------
  it('deve acumular pontos ao completar rodadas e desbloquear cenários conforme a meta', () => {
    const repo = new RepositorioGenius(criarStorageEmMemoria());
    expect(cenarioEstaDesbloqueado('estudio', 0)).toBe(true);
    expect(cenarioEstaDesbloqueado('gramado', 0)).toBe(true);
    expect(cenarioEstaDesbloqueado('nuvens', 0)).toBe(true);
    expect(cenarioEstaDesbloqueado('praia', 0)).toBe(false);

    const engine = new GameEngine({
      geradorAleatorio: criarGeradorFixo([0]),
      repositorio: repo,
    });
    engine.iniciarPartida({ quantidadeJogadores: 1 });

    // Completa 5 rodadas -> 5 pontos acumulados -> desbloqueia Praia (5 pts)
    for (let i = 1; i <= 5; i++) {
      engine.liberarEntradaJogador();
      for (let passo = 0; passo < i; passo++) {
        engine.registrarJogada('verde');
      }
      if (i < 5) engine.avancarProximaRodada();
    }

    const prefs = repo.carregar();
    expect(prefs.pontosTotais).toBe(5);
    expect(cenarioEstaDesbloqueado('praia', prefs.pontosTotais)).toBe(true);
    expect(cenarioEstaDesbloqueado('estrelas', prefs.pontosTotais)).toBe(false);
  });
});
