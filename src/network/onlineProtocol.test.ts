// ============================================================================
// TESTES UNITÁRIOS (TDD - VITEST) — PROTOCOLO MULTIPLAYER ONLINE
// Valida geração/normalização de códigos de sala, apelidos e links de convite.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  codigoParaPeerId,
  codigoSalaValido,
  criarLinkConvite,
  extrairCodigoDaUrl,
  gerarCodigoSala,
  higienizarApelido,
  normalizarCodigoSala,
  PREFIXO_PEER_ID,
  TAMANHO_CODIGO_SALA,
} from './onlineProtocol';

describe('OnlineProtocol — Utilitários de Sala Online', () => {
  it('deve gerar códigos de sala com tamanho fixo e sem caracteres ambíguos', () => {
    for (let i = 0; i < 30; i++) {
      const codigo = gerarCodigoSala();
      expect(codigo).toHaveLength(TAMANHO_CODIGO_SALA);
      expect(codigoSalaValido(codigo)).toBe(true);
      expect(codigo).not.toMatch(/[01OIL]/);
    }
  });

  it('deve normalizar códigos digitados com espaços, hífens ou letras minúsculas', () => {
    expect(normalizarCodigoSala(' ab-34 cd ')).toBe('AB34CD');
    expect(codigoSalaValido('ab-34 cd')).toBe(true);
    expect(codigoSalaValido('ABC')).toBe(false);
    expect(codigoParaPeerId('k7m-4p9')).toBe(`${PREFIXO_PEER_ID}K7M4P9`);
  });

  it('deve higienizar apelidos aplicando limite de 16 caracteres e fallback seguro', () => {
    expect(higienizarApelido('   Ana   Silva  ')).toBe('Ana Silva');
    expect(higienizarApelido('   ', 'Jogador 2')).toBe('Jogador 2');
    expect(higienizarApelido('NomeMuitoLongoDemaisParaCabernoChip')).toHaveLength(16);
  });

  it('deve criar e extrair corretamente o código de sala em links de convite', () => {
    const link = criarLinkConvite('https://genius-unicap.vercel.app/', 'g3n7k2');
    expect(link).toBe('https://genius-unicap.vercel.app/?sala=G3N7K2');

    const url = new URL(link);
    expect(extrairCodigoDaUrl(url.search)).toBe('G3N7K2');
    expect(extrairCodigoDaUrl('?sala=12')).toBeNull();
    expect(extrairCodigoDaUrl('')).toBeNull();
  });
});
