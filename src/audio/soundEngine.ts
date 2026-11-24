// ============================================================================
// MOTOR DE ÁUDIO NATIVO (WEB AUDIO API) — GENIUS 3D WEB (UNICAP)
// Sintetiza em tempo real as 4 notas musicais distintas dos quadrantes,
// som de vitória de rodada e alerta de Game Over, sem arquivos externos
// e com desbloqueio automático no primeiro gesto do usuário (iOS/Android).
// Atende aos requisitos RF-02 e RTEC-02.
// ============================================================================

import { CorGenius } from '../core/gameEngine';

/**
 * Frequências musicais (em Hz) inspiradas no Genius/Simon clássico,
 * calibradas para clareza tanto em fones quanto em alto-falantes de celular.
 */
const FREQUENCIAS_CORES: Record<CorGenius, number> = {
  verde: 329.63, // Mi (E4)
  vermelho: 440.0, // Lá (A4)
  amarelo: 277.18, // Dó# (C#4)
  azul: 220.0, // Lá grave (A3)
};

export class SoundEngine {
  private contexto: AudioContext | null = null;
  private somAtivo = true;

  constructor(somInicialAtivo = true) {
    this.somAtivo = somInicialAtivo;
  }

  /**
   * Inicializa ou retoma o AudioContext no primeiro toque/clique do usuário.
   * Essencial para políticas de autoplay do Safari iOS e Chrome Android.
   */
  public desbloquear(): void {
    if (typeof window === 'undefined') return;

    if (!this.contexto) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.contexto = new AudioCtx();
      }
    }

    if (this.contexto && this.contexto.state === 'suspended') {
      void this.contexto.resume();
    }
  }

  /**
   * Liga ou silencia completamente os osciladores (RF-04 / TST-05).
   */
  public definirSomAtivo(ativo: boolean): void {
    this.somAtivo = ativo;
  }

  public estaAtivo(): boolean {
    return this.somAtivo;
  }

  /**
   * Reproduz a nota musical correspondente a um dos 4 quadrantes (RF-02).
   * Combina onda triangular (timbre eletrônico retrô) com envelope suave
   * de ataque/decaimento para evitar cliques ou estalos no áudio.
   */
  public tocarNota(cor: CorGenius, duracaoMs = 340): void {
    if (!this.somAtivo) return;
    this.desbloquear();
    if (!this.contexto) return;

    const agora = this.contexto.currentTime;
    const duracaoSeg = Math.max(0.1, duracaoMs / 1000);
    const freq = FREQUENCIAS_CORES[cor];

    // Oscilador principal (triangular) + harmônico suave (senoidal)
    const oscPrincipal = this.contexto.createOscillator();
    const oscHarmonico = this.contexto.createOscillator();
    const ganhoMaster = this.contexto.createGain();
    const ganhoHarmonico = this.contexto.createGain();

    oscPrincipal.type = 'triangle';
    oscPrincipal.frequency.setValueAtTime(freq, agora);

    oscHarmonico.type = 'sine';
    oscHarmonico.frequency.setValueAtTime(freq * 2, agora);
    ganhoHarmonico.gain.setValueAtTime(0.14, agora);

    // Envelope ADSR suave (ataque rápido de 15ms e release suave de 45ms)
    ganhoMaster.gain.setValueAtTime(0.0001, agora);
    ganhoMaster.gain.linearRampToValueAtTime(0.28, agora + 0.015);
    ganhoMaster.gain.setValueAtTime(0.24, agora + Math.max(0.03, duracaoSeg - 0.045));
    ganhoMaster.gain.exponentialRampToValueAtTime(0.0001, agora + duracaoSeg);

    oscPrincipal.connect(ganhoMaster);
    oscHarmonico.connect(ganhoHarmonico);
    ganhoHarmonico.connect(ganhoMaster);
    ganhoMaster.connect(this.contexto.destination);

    oscPrincipal.start(agora);
    oscHarmonico.start(agora);
    oscPrincipal.stop(agora + duracaoSeg + 0.02);
    oscHarmonico.stop(agora + duracaoSeg + 0.02);
  }

  /**
   * Reproduz um breve arpejo ascendente ao concluir uma rodada com sucesso.
   */
  public tocarVitoriaRodada(): void {
    if (!this.somAtivo) return;
    this.desbloquear();
    if (!this.contexto) return;

    const notas = [523.25, 659.25, 783.99]; // Dó5, Mi5, Sol5
    const agora = this.contexto.currentTime;

    notas.forEach((freq, indice) => {
      if (!this.contexto) return;
      const inicio = agora + indice * 0.065;
      const osc = this.contexto.createOscillator();
      const ganho = this.contexto.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, inicio);

      ganho.gain.setValueAtTime(0.0001, inicio);
      ganho.gain.linearRampToValueAtTime(0.16, inicio + 0.012);
      ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.16);

      osc.connect(ganho);
      ganho.connect(this.contexto.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.18);
    });
  }

  /**
   * Reproduz sinal sonoro grave descendente indicando erro ou Game Over.
   */
  public tocarErro(): void {
    if (!this.somAtivo) return;
    this.desbloquear();
    if (!this.contexto) return;

    const agora = this.contexto.currentTime;
    const osc = this.contexto.createOscillator();
    const ganho = this.contexto.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, agora);
    osc.frequency.exponentialRampToValueAtTime(92, agora + 0.45);

    ganho.gain.setValueAtTime(0.0001, agora);
    ganho.gain.linearRampToValueAtTime(0.24, agora + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.48);

    osc.connect(ganho);
    ganho.connect(this.contexto.destination);
    osc.start(agora);
    osc.stop(agora + 0.5);
  }
}
