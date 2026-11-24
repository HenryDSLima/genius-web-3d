// ============================================================================
// CONTROLADOR DE CÂMERA DINÂMICA — GENIUS 3D WEB (UNICAP)
// Gerencia a alternância suave entre:
// 1. Modo SHOWCASE (Menu): rotação orbital passiva + OrbitControls livre.
// 2. Modo JOGANDO (Partida): transição animada até visão Top-Down travada,
//    com recálculo automático de distância para qualquer proporção de tela.
// Atende aos requisitos RF-06 e RNF-01.
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ModoCamera = 'SHOWCASE' | 'JOGANDO';

/**
 * Função de suavização (ease-in-out cúbica) para transições fluidas sem saltos bruscos.
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class CameraController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;

  private modoAtual: ModoCamera = 'SHOWCASE';
  private emTransicao = false;
  private progressoTransicao = 0;
  private duracaoTransicao = 1.05; // segundos

  private readonly posInicial = new THREE.Vector3();
  private readonly posDestino = new THREE.Vector3();
  private readonly alvoInicial = new THREE.Vector3();
  private readonly alvoDestino = new THREE.Vector3(0, 0.2, 0);

  // Deslocamento vertical do frustum (viewOffset) para elevar o modelo 3D
  // acima do menu inferior apenas na tela inicial em celulares retrato.
  private offsetVerticalInicial = 0;
  private offsetVerticalAlvo = 0;
  private offsetVerticalAtual = 0;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;

    // Configuração inicial do OrbitControls para o modo Showcase
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 7.5;
    this.controls.maxDistance = 44;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.15;
    this.controls.target.set(0, 0.2, 0);

    // Posição inicial em perspectiva elegante
    const posShowcase = this.calcularPosicaoShowcase();
    this.camera.position.copy(posShowcase);
    this.controls.update();

    this.offsetVerticalAlvo = this.calcularOffsetVerticalAlvo();
    this.offsetVerticalAtual = this.offsetVerticalAlvo;
    this.aplicarOffsetVertical();
  }

  /**
   * Define o deslocamento vertical do enquadramento no menu inicial (SHOWCASE):
   * - Celular retrato (aspect < 0.78): eleva ~18.5% da altura da tela.
   * - PC / tablet / paisagem: eleva ~14.5% para ficar centralizado acima do card de menu.
   * - Modo JOGANDO (Top-Down): mantém centralização padrão (0).
   */
  private calcularOffsetVerticalAlvo(): number {
    if (this.modoAtual !== 'SHOWCASE') {
      return 0;
    }
    if (this.camera.aspect < 0.78) {
      return 0.185;
    }
    return 0.145;
  }

  /**
   * Aplica o viewOffset na câmera sem alterar o pivô do OrbitControls.
   */
  private aplicarOffsetVertical(): void {
    const largura = Math.max(1, window.innerWidth);
    const altura = Math.max(1, window.innerHeight);

    if (Math.abs(this.offsetVerticalAtual) < 0.0005) {
      if (this.camera.view !== null) {
        this.camera.clearViewOffset();
      }
      return;
    }

    // Valor positivo em Y desloca o frustum para baixo, elevando o modelo 3D na tela
    this.camera.setViewOffset(
      largura,
      altura,
      0,
      Math.round(altura * this.offsetVerticalAtual),
      largura,
      altura
    );
  }

  /**
   * Calcula a distância ideal para o tabuleiro (raio ~4.45) caber com folga
   * em telas retrato (360x800), paisagem (800x360), tablet e desktop (RNF-01).
   */
  private calcularDistanciaIdeal(margemFator: number): number {
    const raioTabuleiro = 4.55;
    const fovVerticalRad = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = Math.max(0.35, this.camera.aspect);

    // Distância necessária para caber na vertical
    const distVertical = (raioTabuleiro * margemFator) / Math.tan(fovVerticalRad / 2);

    // Distância necessária para caber na horizontal (crítico em celulares retrato)
    const fovHorizontalRad = 2 * Math.atan(Math.tan(fovVerticalRad / 2) * aspect);
    const distHorizontal = (raioTabuleiro * margemFator) / Math.tan(fovHorizontalRad / 2);

    return Math.max(distVertical, distHorizontal);
  }

  /**
   * Retorna a posição em perspectiva 3/4 usada no modo Showcase (Menu).
   */
  private calcularPosicaoShowcase(): THREE.Vector3 {
    const dist = this.calcularDistanciaIdeal(1.38);
    // Eleva a câmera ~42 graus para exibir o volume 3D e os 4 quadrantes
    const elevacao = dist * 0.68;
    const raioHorizontal = dist * 0.78;
    return new THREE.Vector3(raioHorizontal * 0.45, elevacao, raioHorizontal * 0.89);
  }

  /**
   * Retorna a posição Top-Down centralizada usada durante a partida.
   * O deslocamento mínimo em Z (+0.01) evita gimbal lock mantendo o Norte alinhado.
   */
  private calcularPosicaoTopDown(): THREE.Vector3 {
    const margem = this.camera.aspect < 0.8 ? 1.24 : 1.34;
    const dist = this.calcularDistanciaIdeal(margem);
    // Pequeno offset vertical no alvo para equilibrar com a barra superior do HUD
    return new THREE.Vector3(0, dist, 0.01);
  }

  /**
   * Inicia a transição suave para o modo solicitado (SHOWCASE ou JOGANDO).
   */
  public definirModo(novoModo: ModoCamera): void {
    this.modoAtual = novoModo;
    this.posInicial.copy(this.camera.position);
    this.alvoInicial.copy(this.controls.target);
    this.offsetVerticalInicial = this.offsetVerticalAtual;
    this.offsetVerticalAlvo = this.calcularOffsetVerticalAlvo();
    this.progressoTransicao = 0;
    this.emTransicao = true;

    if (novoModo === 'JOGANDO') {
      // Desativa rotação automática e trava controle manual durante a partida
      this.controls.autoRotate = false;
      this.controls.enabled = false;
      this.posDestino.copy(this.calcularPosicaoTopDown());
      this.alvoDestino.set(0, 0.25, 0);
    } else {
      // Ao voltar ao menu, prepara transição suave para perspectiva orbital
      this.controls.enabled = false;
      this.posDestino.copy(this.calcularPosicaoShowcase());
      this.alvoDestino.set(0, 0.2, 0);
    }
  }

  /**
   * Recalcula a distância da câmera quando o usuário redimensiona a janela
   * ou gira o smartphone entre retrato e paisagem (RNF-01).
   */
  public aoRedimensionar(): void {
    this.offsetVerticalAlvo = this.calcularOffsetVerticalAlvo();
    if (!this.emTransicao) {
      this.offsetVerticalAtual = this.offsetVerticalAlvo;
    }
    this.aplicarOffsetVertical();

    if (this.modoAtual === 'JOGANDO') {
      const novoDestino = this.calcularPosicaoTopDown();
      if (this.emTransicao) {
        this.posDestino.copy(novoDestino);
      } else {
        this.camera.position.copy(novoDestino);
        this.camera.lookAt(this.alvoDestino);
      }
    } else if (this.emTransicao) {
      this.posDestino.copy(this.calcularPosicaoShowcase());
    } else {
      // Garante que o tabuleiro nunca fique cortado ao girar ou estreitar a tela no modo Showcase
      const distMinima = this.calcularDistanciaIdeal(1.22);
      const direcao = this.camera.position.clone().sub(this.controls.target);
      if (direcao.length() < distMinima) {
        direcao.setLength(distMinima);
        this.camera.position.copy(this.controls.target).add(direcao);
        this.controls.update();
      }
    }
  }

  /**
   * Atualiza a interpolação da câmera ou o OrbitControls a cada frame.
   */
  public atualizar(deltaSegundos: number): void {
    if (this.emTransicao) {
      this.progressoTransicao = Math.min(1, this.progressoTransicao + deltaSegundos / this.duracaoTransicao);
      const t = easeInOutCubic(this.progressoTransicao);

      this.camera.position.lerpVectors(this.posInicial, this.posDestino, t);
      this.controls.target.lerpVectors(this.alvoInicial, this.alvoDestino, t);
      this.offsetVerticalAtual = THREE.MathUtils.lerp(this.offsetVerticalInicial, this.offsetVerticalAlvo, t);
      this.aplicarOffsetVertical();
      this.camera.lookAt(this.controls.target);

      if (this.progressoTransicao >= 1) {
        this.emTransicao = false;
        this.offsetVerticalAtual = this.offsetVerticalAlvo;
        this.aplicarOffsetVertical();
        if (this.modoAtual === 'SHOWCASE') {
          this.controls.enabled = true;
          this.controls.autoRotate = true;
          this.controls.update();
        }
      }
      return;
    }

    if (this.modoAtual === 'SHOWCASE') {
      this.controls.update();
    } else {
      this.camera.lookAt(this.alvoDestino);
    }
  }

  public obterModo(): ModoCamera {
    return this.modoAtual;
  }
}
