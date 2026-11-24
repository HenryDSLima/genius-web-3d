// ============================================================================
// MÓDULO DE PERSISTÊNCIA LOCAL (localStorage) — GENIUS 3D WEB (UNICAP)
// Responsável por salvar e recuperar recordes, pontos acumulados e preferências
// de som, acessibilidade, tema, cor da carcaça e cenário 3D (RTEC-03 / TST-05).
// ============================================================================

export type Dificuldade = 'facil' | 'medio' | 'dificil';
export type TemaVisual = 'escuro' | 'claro';
export type CorCarcaca = 'creme' | 'grafite' | 'rosa' | 'menta' | 'celeste' | 'lavanda';
export type Cenario3D = 'estudio' | 'gramado' | 'nuvens' | 'praia' | 'por_do_sol' | 'estrelas';

/**
 * Catálogo de cenários 3D e pontuação acumulada necessária para desbloqueio.
 */
export interface DefinicaoCenario {
  id: Cenario3D;
  nome: string;
  icone: string;
  pontosNecessarios: number;
}

export const CATALOGO_CENARIOS: readonly DefinicaoCenario[] = [
  { id: 'estudio', nome: 'Estúdio', icone: '🎨', pontosNecessarios: 0 },
  { id: 'gramado', nome: 'Gramado', icone: '🌿', pontosNecessarios: 0 },
  { id: 'nuvens', nome: 'Céu Livre', icone: '☁️', pontosNecessarios: 0 },
  { id: 'praia', nome: 'Praia', icone: '🏖️', pontosNecessarios: 5 },
  { id: 'por_do_sol', nome: 'Pôr do Sol', icone: '🌅', pontosNecessarios: 12 },
  { id: 'estrelas', nome: 'Estrelas', icone: '🌌', pontosNecessarios: 20 },
];

export const CORES_CARCACA_VALIDAS: readonly CorCarcaca[] = [
  'creme',
  'grafite',
  'rosa',
  'menta',
  'celeste',
  'lavanda',
];

/**
 * Verifica se um cenário já está desbloqueado para a pontuação acumulada informada.
 */
export function cenarioEstaDesbloqueado(cenario: Cenario3D, pontosTotais: number): boolean {
  const def = CATALOGO_CENARIOS.find((c) => c.id === cenario);
  return def ? pontosTotais >= def.pontosNecessarios : false;
}

/**
 * Interface mínima compatível com window.localStorage.
 * Permite injetar um armazenamento em memória durante testes unitários (TDD).
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Estrutura de dados persistida no navegador do usuário.
 */
export interface PreferenciasSalvas {
  recordeSolo: number;
  recordeMultiplayer: number;
  pontosTotais: number;
  somAtivo: boolean;
  dificuldade: Dificuldade;
  modoDaltonismo: boolean;
  tema: TemaVisual;
  corCarcaca: CorCarcaca;
  cenario: Cenario3D;
  quantidadeJogadores: number;
}

const CHAVE_STORAGE = 'genius_3d_unicap_v1';

/**
 * Valores padrão utilizados no primeiro acesso ou caso o localStorage esteja indisponível.
 */
export const PREFERENCIAS_PADRAO: PreferenciasSalvas = {
  recordeSolo: 0,
  recordeMultiplayer: 0,
  pontosTotais: 0,
  somAtivo: true,
  dificuldade: 'medio',
  modoDaltonismo: false,
  tema: 'claro',
  corCarcaca: 'creme',
  cenario: 'estudio',
  quantidadeJogadores: 1,
};

/**
 * Cria um armazenamento em memória (fallback para ambientes sem localStorage ou testes).
 */
export function criarStorageEmMemoria(): StorageLike {
  const mapa = new Map<string, string>();
  return {
    getItem: (chave: string) => mapa.get(chave) ?? null,
    setItem: (chave: string, valor: string) => {
      mapa.set(chave, valor);
    },
    removeItem: (chave: string) => {
      mapa.delete(chave);
    },
  };
}

/**
 * Gerenciador de persistência com validação segura contra dados corrompidos
 * ou restrições de privacidade (ex.: modo anônimo do Safari).
 */
export class RepositorioGenius {
  private readonly storage: StorageLike;

  constructor(storage?: StorageLike) {
    if (storage) {
      this.storage = storage;
    } else if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      this.storage = globalThis.localStorage;
    } else {
      this.storage = criarStorageEmMemoria();
    }
  }

  /**
   * Carrega todas as preferências, recordes e pontos acumulados salvos.
   */
  public carregar(): PreferenciasSalvas {
    try {
      const bruto = this.storage.getItem(CHAVE_STORAGE);
      if (!bruto) {
        return { ...PREFERENCIAS_PADRAO };
      }

      const dados = JSON.parse(bruto) as Partial<PreferenciasSalvas>;
      const dificuldadesValidas: Dificuldade[] = ['facil', 'medio', 'dificil'];
      const cenariosValidos = CATALOGO_CENARIOS.map((c) => c.id);

      const pontosTotais =
        typeof dados.pontosTotais === 'number' && dados.pontosTotais >= 0 ? Math.floor(dados.pontosTotais) : 0;

      const cenarioSalvo =
        dados.cenario && cenariosValidos.includes(dados.cenario) && cenarioEstaDesbloqueado(dados.cenario, pontosTotais)
          ? dados.cenario
          : PREFERENCIAS_PADRAO.cenario;

      return {
        recordeSolo: typeof dados.recordeSolo === 'number' && dados.recordeSolo >= 0 ? Math.floor(dados.recordeSolo) : 0,
        recordeMultiplayer:
          typeof dados.recordeMultiplayer === 'number' && dados.recordeMultiplayer >= 0
            ? Math.floor(dados.recordeMultiplayer)
            : 0,
        pontosTotais,
        somAtivo: typeof dados.somAtivo === 'boolean' ? dados.somAtivo : PREFERENCIAS_PADRAO.somAtivo,
        dificuldade:
          dados.dificuldade && dificuldadesValidas.includes(dados.dificuldade)
            ? dados.dificuldade
            : PREFERENCIAS_PADRAO.dificuldade,
        modoDaltonismo:
          typeof dados.modoDaltonismo === 'boolean' ? dados.modoDaltonismo : PREFERENCIAS_PADRAO.modoDaltonismo,
        tema: dados.tema === 'claro' || dados.tema === 'escuro' ? dados.tema : PREFERENCIAS_PADRAO.tema,
        corCarcaca:
          dados.corCarcaca && CORES_CARCACA_VALIDAS.includes(dados.corCarcaca)
            ? dados.corCarcaca
            : PREFERENCIAS_PADRAO.corCarcaca,
        cenario: cenarioSalvo,
        quantidadeJogadores:
          typeof dados.quantidadeJogadores === 'number' &&
          dados.quantidadeJogadores >= 1 &&
          dados.quantidadeJogadores <= 4
            ? Math.floor(dados.quantidadeJogadores)
            : PREFERENCIAS_PADRAO.quantidadeJogadores,
      };
    } catch {
      return { ...PREFERENCIAS_PADRAO };
    }
  }

  /**
   * Salva o objeto completo de preferências no localStorage.
   */
  public salvar(preferencias: PreferenciasSalvas): void {
    try {
      this.storage.setItem(CHAVE_STORAGE, JSON.stringify(preferencias));
    } catch {
      // Ignora silenciosamente erros de cota ou bloqueio de storage no navegador
    }
  }

  /**
   * Atualiza parcialmente as preferências existentes e persiste o resultado.
   */
  public atualizar(parcial: Partial<PreferenciasSalvas>): PreferenciasSalvas {
    const atual = this.carregar();
    const atualizado: PreferenciasSalvas = { ...atual, ...parcial };
    this.salvar(atualizado);
    return atualizado;
  }

  /**
   * Soma pontos acumulados ao concluir rodadas (utilizado para desbloquear novos cenários 3D).
   */
  public adicionarPontos(quantidade: number): number {
    if (quantidade <= 0) return this.carregar().pontosTotais;
    const atual = this.carregar();
    const novoTotal = atual.pontosTotais + Math.floor(quantidade);
    this.salvar({ ...atual, pontosTotais: novoTotal });
    return novoTotal;
  }

  /**
   * Atualiza o recorde (Solo ou Multiplayer) apenas se a nova pontuação for superior.
   * Retorna true se houve um novo recorde.
   */
  public registrarPontuacao(pontuacao: number, modoMultiplayer: boolean): boolean {
    const atual = this.carregar();
    if (modoMultiplayer) {
      if (pontuacao > atual.recordeMultiplayer) {
        this.salvar({ ...atual, recordeMultiplayer: pontuacao });
        return true;
      }
      return false;
    }

    if (pontuacao > atual.recordeSolo) {
      this.salvar({ ...atual, recordeSolo: pontuacao });
      return true;
    }
    return false;
  }

  /**
   * Limpa todos os dados salvos (útil para testes e reset de fábrica).
   */
  public limpar(): void {
    try {
      this.storage.removeItem(CHAVE_STORAGE);
    } catch {
      // Ignora erro caso o storage não permita remoção
    }
  }
}
