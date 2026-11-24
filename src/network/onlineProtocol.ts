// ============================================================================
// PROTOCOLO DE MULTIPLAYER ONLINE (WEBRTC / PEERJS) — GENIUS 3D WEB (UNICAP)
// Define os tipos de mensagens sincronizadas entre Anfitrião (Host) e
// Convidados (Guests), além de utilitários puros para códigos de sala e links.
// Arquitetura Host-Autoritativa: o Host executa a GameEngine e transmite o
// estado oficial para todos os clientes conectados.
// ============================================================================

import { ConfiguracaoTempo, CorGenius, EstadoPartidaSnapshot, Jogador } from '../core/gameEngine';
import { Dificuldade } from '../core/storage';

/** Prefixo único para isolar as salas do Genius UNICAP no servidor de sinalização PeerJS */
export const PREFIXO_PEER_ID = 'genius-unicap-3d-';

/** Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L) para fácil leitura e digitação */
const ALFABETO_SALA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TAMANHO_CODIGO_SALA = 6;
export const MAX_JOGADORES_ONLINE = 4;

/**
 * Participante listado no lobby de uma sala online antes do início da partida.
 */
export interface ParticipanteSala {
  peerId: string;
  jogadorId: number; // 1..4 (corresponde ao Jogador.id na GameEngine)
  nome: string;
  ehHost: boolean;
}

/**
 * Estado completo do lobby sincronizado do Host para todos os Convidados.
 */
export interface EstadoLobbyOnline {
  codigoSala: string;
  dificuldade: Dificuldade;
  participantes: ParticipanteSala[];
  emPartida: boolean;
}

// ============================================================================
// MENSAGENS DO PROTOCOLO (Guest -> Host e Host -> Todos)
// ============================================================================

export type MensagemClienteParaHost =
  | { tipo: 'ENTRAR_SALA'; nome: string }
  | { tipo: 'JOGADA'; cor: CorGenius };

export type MensagemHostParaCliente =
  | { tipo: 'BOAS_VINDAS'; seuJogadorId: number; lobby: EstadoLobbyOnline }
  | { tipo: 'ERRO_SALA'; motivo: string }
  | { tipo: 'LOBBY_ATUALIZADO'; lobby: EstadoLobbyOnline }
  | { tipo: 'PARTIDA_INICIADA'; snapshot: EstadoPartidaSnapshot }
  | {
      tipo: 'REPRODUZIR_SEQUENCIA';
      sequencia: CorGenius[];
      tempo: ConfiguracaoTempo;
      snapshot: EstadoPartidaSnapshot;
    }
  | { tipo: 'LIBERAR_TURNO'; snapshot: EstadoPartidaSnapshot }
  | { tipo: 'PULSAR_COR'; cor: CorGenius; duracaoMs: number; jogadorId: number }
  | {
      tipo: 'RODADA_COMPLETA';
      snapshot: EstadoPartidaSnapshot;
      proximoJogador?: Jogador;
    }
  | {
      tipo: 'JOGADOR_ELIMINADO';
      snapshot: EstadoPartidaSnapshot;
      jogadorEliminado?: Jogador;
      proximoJogador?: Jogador;
      motivo?: 'ERRO' | 'DESCONEXAO';
    }
  | {
      tipo: 'GAME_OVER';
      snapshot: EstadoPartidaSnapshot;
      ranking: Jogador[];
      novoRecorde: boolean;
    }
  | { tipo: 'VOLTAR_LOBBY'; lobby: EstadoLobbyOnline };

/**
 * Gera um código de sala curto e legível (ex.: "K7M4P9").
 */
export function gerarCodigoSala(geradorAleatorio: () => number = Math.random): string {
  let codigo = '';
  for (let i = 0; i < TAMANHO_CODIGO_SALA; i++) {
    const idx = Math.floor(geradorAleatorio() * ALFABETO_SALA.length) % ALFABETO_SALA.length;
    codigo += ALFABETO_SALA[idx];
  }
  return codigo;
}

/**
 * Normaliza e limpa um código digitado pelo usuário (maiúsculas, sem espaços ou símbolos).
 */
export function normalizarCodigoSala(entrada: string): string {
  return entrada
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, TAMANHO_CODIGO_SALA);
}

/**
 * Valida se o código informado possui o tamanho exato esperado.
 */
export function codigoSalaValido(codigo: string): boolean {
  const limpo = normalizarCodigoSala(codigo);
  return limpo.length === TAMANHO_CODIGO_SALA;
}

/**
 * Converte um código de sala curto no Peer ID completo usado pelo PeerJS.
 */
export function codigoParaPeerId(codigo: string): string {
  return `${PREFIXO_PEER_ID}${normalizarCodigoSala(codigo)}`;
}

/**
 * Higieniza o apelido informado pelo jogador (com fallback seguro).
 */
export function higienizarApelido(apelido: string, fallback = 'Jogador'): string {
  const limpo = apelido.trim().replace(/\s+/g, ' ').slice(0, 16);
  return limpo.length > 0 ? limpo : fallback;
}

/**
 * Extrai o código de sala da query string de um link de convite (?sala=XXXXXX).
 */
export function extrairCodigoDaUrl(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const sala = params.get('sala');
    if (!sala) return null;
    const normalizado = normalizarCodigoSala(sala);
    return codigoSalaValido(normalizado) ? normalizado : null;
  } catch {
    return null;
  }
}

/**
 * Monta um link compartilhável direto para entrar na sala online.
 */
export function criarLinkConvite(urlAtual: string, codigoSala: string): string {
  const url = new URL(urlAtual);
  url.searchParams.set('sala', normalizarCodigoSala(codigoSala));
  return url.toString();
}
