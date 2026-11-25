// ============================================================================
// TESTES UNITÁRIOS (TDD - VITEST) — SERVIÇO DE RANKING GLOBAL (SUPABASE)
// Valida ordenação, envio/consulta REST mockada e fallback local offline.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import { criarStorageEmMemoria } from '../core/storage';
import { LeaderboardService, ordenarRegistrosRanking } from './leaderboardService';

describe('LeaderboardService — Ranking Global (Supabase + Fallback Local)', () => {
  it('deve ordenar registros por maior pontuação e desempatar pela data mais antiga', () => {
    const ordenado = ordenarRegistrosRanking([
      { id: 1, apelido: 'Bruno', pontos: 8, dificuldade: 'medio', criado_em: '2026-11-24T12:00:00Z' },
      { id: 2, apelido: 'Ana', pontos: 12, dificuldade: 'dificil', criado_em: '2026-11-24T13:00:00Z' },
      { id: 3, apelido: 'Carla', pontos: 8, dificuldade: 'facil', criado_em: '2026-11-24T10:00:00Z' },
    ]);

    expect(ordenado.map((r) => r.apelido)).toEqual(['Ana', 'Carla', 'Bruno']);
  });

  it('deve salvar e recuperar o ranking localmente quando o Supabase não estiver configurado', async () => {
    const service = new LeaderboardService({
      config: { url: '', anonKey: '' },
      storage: criarStorageEmMemoria(),
    });

    expect(service.estaConfiguradoGlobal()).toBe(false);

    const envioInvalido = await service.enviarPontuacao({ apelido: 'Ana', pontos: 0, dificuldade: 'medio' });
    expect(envioInvalido.ok).toBe(false);

    const envio1 = await service.enviarPontuacao({ apelido: '  Ana  ', pontos: 7, dificuldade: 'medio' });
    const envio2 = await service.enviarPontuacao({ apelido: 'Bruno', pontos: 11, dificuldade: 'dificil' });
    expect(envio1.ok).toBe(true);
    expect(envio2.ok).toBe(true);

    const geral = await service.buscarTop('todas');
    expect(geral.origem).toBe('local');
    expect(geral.registros).toHaveLength(2);
    expect(geral.registros[0].apelido).toBe('Bruno');
    expect(geral.registros[0].pontos).toBe(11);

    const apenasMedio = await service.buscarTop('medio');
    expect(apenasMedio.registros).toHaveLength(1);
    expect(apenasMedio.registros[0].apelido).toBe('Ana');
  });

  it('deve consultar e enviar pontuações via API REST do Supabase quando configurado', async () => {
    const fetchMock = vi.fn<typeof fetch>();

    // 1. Mock do POST (envio)
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    // 2. Mock do GET (consulta Top 15)
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 10, apelido: 'Henry', pontos: 19, dificuldade: 'dificil', criado_em: '2026-11-25T01:00:00Z' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const service = new LeaderboardService({
      config: { url: 'https://demo.supabase.co', anonKey: 'chave-publica-anon-teste' },
      storage: criarStorageEmMemoria(),
      fetchFn: fetchMock,
    });

    expect(service.estaConfiguradoGlobal()).toBe(true);

    const resEnvio = await service.enviarPontuacao({ apelido: 'Henry', pontos: 19, dificuldade: 'dificil' });
    expect(resEnvio.ok).toBe(true);
    expect(resEnvio.origem).toBe('global');

    const resTop = await service.buscarTop('dificil');
    expect(resTop.origem).toBe('global');
    expect(resTop.registros).toHaveLength(1);
    expect(resTop.registros[0].apelido).toBe('Henry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
