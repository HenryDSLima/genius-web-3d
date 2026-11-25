// ============================================================================
// SERVIÇO DE RANKING GLOBAL (SUPABASE REST API) — GENIUS 3D WEB (UNICAP)
// Comunica-se diretamente com o Supabase via fetch nativo (sem SDK pesado),
// com fallback automático para ranking local no navegador quando offline ou
// antes da configuração das chaves públicas VITE_SUPABASE_URL / ANON_KEY.
// ============================================================================

import { criarStorageEmMemoria, Dificuldade, StorageLike } from '../core/storage';
import { higienizarApelido } from './onlineProtocol';

export type FiltroRanking = 'todas' | Dificuldade;

export interface RegistroRanking {
  id: string | number;
  apelido: string;
  pontos: number;
  dificuldade: Dificuldade;
  criado_em: string;
}

export interface ResultadoRanking {
  origem: 'global' | 'local';
  registros: RegistroRanking[];
  aviso?: string;
}

export interface ConfigSupabase {
  url: string;
  anonKey: string;
}

const CHAVE_RANKING_LOCAL = 'genius_3d_ranking_local_v1';
const LIMITE_TOP = 15;

/**
 * Ordena registros por maior pontuação em uma única partida (e desempata pelo mais antigo).
 */
export function ordenarRegistrosRanking(lista: RegistroRanking[]): RegistroRanking[] {
  return [...lista].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;
    return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
  });
}

/**
 * Lê as variáveis de ambiente do Vite quando disponíveis no bundle.
 */
export function obterConfigSupabasePadrao(): ConfigSupabase {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    url: (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
    anonKey: (env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  };
}

export class LeaderboardService {
  private readonly config: ConfigSupabase;
  private readonly storage: StorageLike;
  private readonly fetchFn: typeof fetch;

  constructor(opcoes?: {
    config?: ConfigSupabase;
    storage?: StorageLike;
    fetchFn?: typeof fetch;
  }) {
    this.config = opcoes?.config ?? obterConfigSupabasePadrao();
    this.fetchFn = opcoes?.fetchFn ?? globalThis.fetch.bind(globalThis);

    if (opcoes?.storage) {
      this.storage = opcoes.storage;
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      this.storage = globalThis.localStorage;
    } else {
      this.storage = criarStorageEmMemoria();
    }
  }

  public estaConfiguradoGlobal(): boolean {
    return this.config.url.startsWith('http') && this.config.anonKey.length > 10;
  }

  /**
   * Monta os cabeçalhos compatíveis tanto com chaves legadas (JWT anon)
   * quanto com as novas chaves Publishable (sb_publishable_...) do Supabase.
   */
  private criarCabecalhosSupabase(extras?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      apikey: this.config.anonKey,
      ...extras,
    };
    if (!this.config.anonKey.startsWith('sb_publishable_')) {
      headers.Authorization = `Bearer ${this.config.anonKey}`;
    }
    return headers;
  }

  /**
   * Busca o Top 15 de pontuações em uma única partida (Global via Supabase ou Local fallback).
   */
  public async buscarTop(filtro: FiltroRanking = 'todas'): Promise<ResultadoRanking> {
    if (!this.estaConfiguradoGlobal()) {
      return {
        origem: 'local',
        registros: this.lerRankingLocal(filtro),
        aviso: 'Modo local ativo (configure as chaves do Supabase para sincronizar globalmente).',
      };
    }

    try {
      const params = new URLSearchParams({
        select: 'id,apelido,pontos,dificuldade,criado_em',
        order: 'pontos.desc,criado_em.asc',
        limit: String(LIMITE_TOP),
      });
      if (filtro !== 'todas') {
        params.set('dificuldade', `eq.${filtro}`);
      }

      const resposta = await this.fetchFn(
        `${this.config.url}/rest/v1/ranking_genius?${params.toString()}`,
        {
          method: 'GET',
          headers: this.criarCabecalhosSupabase({ Accept: 'application/json' }),
        }
      );

      if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status}`);
      }

      const dados = (await resposta.json()) as RegistroRanking[];
      return {
        origem: 'global',
        registros: Array.isArray(dados) ? dados.slice(0, LIMITE_TOP) : [],
      };
    } catch {
      return {
        origem: 'local',
        registros: this.lerRankingLocal(filtro),
        aviso: 'Sem conexão com o ranking global no momento. Exibindo recordes locais.',
      };
    }
  }

  /**
   * Envia a pontuação alcançada em uma partida para o ranking global (e salva cópia local).
   */
  public async enviarPontuacao(entrada: {
    apelido: string;
    pontos: number;
    dificuldade: Dificuldade;
  }): Promise<{ ok: boolean; origem: 'global' | 'local'; mensagem: string }> {
    const pontosLimpos = Math.floor(entrada.pontos);
    if (pontosLimpos < 1 || pontosLimpos > 999) {
      return {
        ok: false,
        origem: 'local',
        mensagem: 'Complete pelo menos 1 rodada para entrar no ranking.',
      };
    }

    const apelidoLimpo = higienizarApelido(entrada.apelido, 'Jogador');

    // Sempre registra no fallback local também
    this.salvarNoRankingLocal({
      id: `local-${Date.now()}`,
      apelido: apelidoLimpo,
      pontos: pontosLimpos,
      dificuldade: entrada.dificuldade,
      criado_em: new Date().toISOString(),
    });

    if (!this.estaConfiguradoGlobal()) {
      return {
        ok: true,
        origem: 'local',
        mensagem: 'Pontuação salva no ranking local!',
      };
    }

    try {
      const resposta = await this.fetchFn(`${this.config.url}/rest/v1/ranking_genius`, {
        method: 'POST',
        headers: this.criarCabecalhosSupabase({
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        }),
        body: JSON.stringify({
          apelido: apelidoLimpo,
          pontos: pontosLimpos,
          dificuldade: entrada.dificuldade,
        }),
      });

      if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status}`);
      }

      return {
        ok: true,
        origem: 'global',
        mensagem: 'Recorde enviado ao Ranking Global!',
      };
    } catch {
      return {
        ok: true,
        origem: 'local',
        mensagem: 'Salvo localmente (não foi possível alcançar o servidor global).',
      };
    }
  }

  private lerRankingLocal(filtro: FiltroRanking): RegistroRanking[] {
    try {
      const bruto = this.storage.getItem(CHAVE_RANKING_LOCAL);
      if (!bruto) return [];
      const lista = JSON.parse(bruto) as RegistroRanking[];
      if (!Array.isArray(lista)) return [];
      const filtrada = filtro === 'todas' ? lista : lista.filter((r) => r.dificuldade === filtro);
      return ordenarRegistrosRanking(filtrada).slice(0, LIMITE_TOP);
    } catch {
      return [];
    }
  }

  private salvarNoRankingLocal(registro: RegistroRanking): void {
    try {
      const atual = this.lerRankingLocal('todas');
      const novaLista = ordenarRegistrosRanking([...atual, registro]).slice(0, 30);
      this.storage.setItem(CHAVE_RANKING_LOCAL, JSON.stringify(novaLista));
    } catch {
      // Ignora falhas de cota de storage
    }
  }
}
