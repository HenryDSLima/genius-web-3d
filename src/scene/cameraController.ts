// ============================================================================
// CONTROLADOR DE CÂMERA DINÂMICA — GENIUS 3D WEB (UNICAP)
// Gerencia a alternância suave entre:
// 1. Modo SHOWCASE (Menu): rotação orbital passiva + OrbitControls livre.
// 2. Modo JOGANDO (Partida): transição animada até visão Top-Down travada,
//    com recálculo automático de distância e centro baseados na Área Segura
//    real medida entre os elementos visíveis do HUD (independe de DPI/resolução).
// Atende aos requisitos RF-06 e RNF-01.
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ModoCamera = 'SHOWCASE' | 'JOGANDO';

/**
 * Retângulo livre (em pixels CSS) disponível entre os elementos visíveis do HUD.
 */
export interface AreaSeguraHud {
  esquerda: number;
  topo: number;
  largura: number;
  altura: number;
  viewportLargura: number;
  viewportAltura: number;
}

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
  private duracaoTransicao = 0.95; // segundos

  private readonly posInicial = new THREE.Vector3();
  private readonly posDestino = new THREE.Vector3();
  private readonly alvoInicial = new THREE.Vector3();
  private readonly alvoDestino = new THREE.Vector3(0, 0.2, 0);

  // Área segura real medida entre os elementos do HUD
  private areaSegura: AreaSeguraHud;

  // Deslocamento do frustum (viewOffset) em fração do viewport para centralizar
  // o modelo 3D exatamente no centro da área livre entre os elementos do HUD.
  private offsetXInicial = 0;
  private offsetXAlvo = 0;
  private offsetXAtual = 0;

  private offsetYInicial = 0;
  private offsetYAlvo = 0;
  private offsetYAtual = 0;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;

    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.areaSegura = {
      esquerda: 0,
      topo: 0,
      largura: w,
      altura: h,
      viewportLargura: w,
      viewportAltura: h,
    };

    // Configuração inicial do OrbitControls para o modo Showcase
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.minDistance = 7.5;
    this.controls.maxDistance = 60;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.15;
    this.controls.target.set(0, 0.2, 0);

    // Posição inicial em perspectiva elegante
    const posShowcase = this.calcularPosicaoShowcase();
    this.camera.position.copy(posShowcase);
    this.controls.update();

    this.recalcularOffsetsAlvo();
    this.offsetXAtual = this.offsetXAlvo;
    this.offsetYAtual = this.offsetYAlvo;
    this.aplicarViewOffset();
  }

  /**
   * Recebe as dimensões reais da área livre entre os elementos visíveis do HUD
   * e ajusta o centro (viewOffset) e a distância da câmera para evitar sobreposição
   * em qualquer resolução, DPI ou escala de fonte.
   */
  public definirAreaSegura(area: AreaSeguraHud): void {
    const mudou =
      Math.abs(area.esquerda - this.areaSegura.esquerda) > 1 ||
      Math.abs(area.topo - this.areaSegura.topo) > 1 ||
      Math.abs(area.largura - this.areaSegura.largura) > 1 ||
      Math.abs(area.altura - this.areaSegura.altura) > 1 ||
      Math.abs(area.viewportLargura - this.areaSegura.viewportLargura) > 1 ||
      Math.abs(area.viewportAltura - this.areaSegura.viewportAltura) > 1;

    if (!mudou) return;

    this.areaSegura = { ...area };
    this.recalcularOffsetsAlvo();

    if (this.emTransicao) {
      this.posDestino.copy(
        this.modoAtual === 'JOGANDO' ? this.calcularPosicaoTopDown() : this.calcularPosicaoShowcase()
      );
      return;
    }

    if (this.modoAtual === 'JOGANDO') {
      this.posDestino.copy(this.calcularPosicaoTopDown());
    } else {
      // No modo Showcase, garante que o modelo caiba integralmente na nova área livre
      const distMinimaSegura = this.calcularDistanciaSegura(0.84, 0.78);
      const direcao = this.camera.position.clone().sub(this.controls.target);
      const distAtual = direcao.length();
      if (distAtual > 0.001 && Math.abs(distAtual - distMinimaSegura) > 0.8) {
        direcao.setLength(distMinimaSegura);
        this.camera.position.copy(this.controls.target).add(direcao);
        this.controls.update();
      }
    }
  }

  /**
   * Calcula os offsets X e Y (fração do viewport) necessários para alinhar a origem 3D
   * exatamente ao centro geométrico da área segura entre os elementos do HUD.
   */
  private recalcularOffsetsAlvo(): void {
    const w = Math.max(1, this.areaSegura.viewportLargura);
    const h = Math.max(1, this.areaSegura.viewportAltura);

    const centroSeguroX = this.areaSegura.esquerda + this.areaSegura.largura / 2;
    const centroSeguroY = this.areaSegura.topo + this.areaSegura.altura / 2;

    // setViewOffset positivo desloca a janela para direita/baixo -> modelo 3D vai para esquerda/cima
    this.offsetXAlvo = (w / 2 - centroSeguroX) / w;
    this.offsetYAlvo = (h / 2 - centroSeguroY) / h;
  }

  /**
   * Aplica o viewOffset na câmera sem alterar o pivô do OrbitControls.
   */
  private aplicarViewOffset(): void {
    const largura = Math.max(1, this.areaSegura.viewportLargura || window.innerWidth);
    const altura = Math.max(1, this.areaSegura.viewportAltura || window.innerHeight);

    if (Math.abs(this.offsetXAtual) < 0.0005 && Math.abs(this.offsetYAtual) < 0.0005) {
      if (this.camera.view !== null) {
        this.camera.clearViewOffset();
      }
      return;
    }

    this.camera.setViewOffset(
      largura,
      altura,
      Math.round(largura * this.offsetXAtual),
      Math.round(altura * this.offsetYAtual),
      largura,
      altura
    );
  }

  /**
   * Calcula a distância necessária para o tabuleiro (raio ~4.45) caber com folga
   * DENTRO do retângulo livre (areaSegura.largura x areaSegura.altura), independente
   * de resolução, orientação ou DPI do aparelho.
   */
  private calcularDistanciaSegura(fatorOcupacao: number, fatorAlturaProjetada = 1): number {
    const raioTabuleiro = 4.55;
    const fovVerticalRad = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = Math.max(0.35, this.camera.aspect);
    const tanMeioFovV = Math.tan(fovVerticalRad / 2);
    const tanMeioFovH = tanMeioFovV * aspect;

    const w = Math.max(1, this.areaSegura.viewportLargura);
    const h = Math.max(1, this.areaSegura.viewportAltura);

    // Fração útil do viewport (garante piso mínimo seguro para não disparar ao infinito)
    const fracaoW = Math.max(0.28, Math.min(1, this.areaSegura.largura / w));
    const fracaoH = Math.max(0.24, Math.min(1, this.areaSegura.altura / h));

    const distVertical = (raioTabuleiro * fatorAlturaProjetada) / (tanMeioFovV * fracaoH * fatorOcupacao);
    const distHorizontal = raioTabuleiro / (tanMeioFovH * fracaoW * fatorOcupacao);

    return THREE.MathUtils.clamp(Math.max(distVertical, distHorizontal), 9.5, 58);
  }

  /**
   * Retorna a posição em perspectiva 3/4 usada no modo Showcase (Menu).
   */
  private calcularPosicaoShowcase(): THREE.Vector3 {
    // Na visão 3/4 inclinada, a projeção vertical do disco é ~0.78 do diâmetro horizontal
    const dist = this.calcularDistanciaSegura(0.84, 0.78);
    const elevacao = dist * 0.68;
    const raioHorizontal = dist * 0.78;
    return new THREE.Vector3(raioHorizontal * 0.45, elevacao, raioHorizontal * 0.89);
  }

  /**
   * Retorna a posição Top-Down centralizada usada durante a partida.
   * O deslocamento mínimo em Z (+0.01) evita gimbal lock mantendo o Norte alinhado.
   */
  private calcularPosicaoTopDown(): THREE.Vector3 {
    const dist = this.calcularDistanciaSegura(0.86, 1.0);
    return new THREE.Vector3(0, dist, 0.01);
  }

  /**
   * Inicia a transição suave para o modo solicitado (SHOWCASE ou JOGANDO).
   */
  public definirModo(novoModo: ModoCamera): void {
    this.modoAtual = novoModo;
    this.posInicial.copy(this.camera.position);
    this.alvoInicial.copy(this.controls.target);
    this.offsetXInicial = this.offsetXAtual;
    this.offsetYInicial = this.offsetYAtual;
    this.recalcularOffsetsAlvo();
    this.progressoTransicao = 0;
    this.emTransicao = true;

    if (novoModo === 'JOGANDO') {
      this.controls.autoRotate = false;
      this.controls.enabled = false;
      this.posDestino.copy(this.calcularPosicaoTopDown());
      this.alvoDestino.set(0, 0.25, 0);
    } else {
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
    this.recalcularOffsetsAlvo();
    if (!this.emTransicao) {
      this.offsetXAtual = this.offsetXAlvo;
      this.offsetYAtual = this.offsetYAlvo;
    }
    this.aplicarViewOffset();

    if (this.modoAtual === 'JOGANDO') {
      const novoDestino = this.calcularPosicaoTopDown();
      this.posDestino.copy(novoDestino);
      if (!this.emTransicao) {
        this.camera.position.copy(novoDestino);
        this.camera.lookAt(this.alvoDestino);
      }
    } else if (this.emTransicao) {
      this.posDestino.copy(this.calcularPosicaoShowcase());
    } else {
      const distMinima = this.calcularDistanciaSegura(0.84, 0.78);
      const direcao = this.camera.position.clone().sub(this.controls.target);
      if (direcao.length() > 0.001 && direcao.length() < distMinima) {
        direcao.setLength(distMinima);
        this.camera.position.copy(this.controls.target).add(direcao);
        this.controls.update();
      }
    }
  }

  /**
   * Atualiza a interpolação da câmera, o viewOffset e o OrbitControls a cada frame.
   */
  public atualizar(deltaSegundos: number): void {
    if (this.emTransicao) {
      this.progressoTransicao = Math.min(1, this.progressoTransicao + deltaSegundos / this.duracaoTransicao);
      const t = easeInOutCubic(this.progressoTransicao);

      this.camera.position.lerpVectors(this.posInicial, this.posDestino, t);
      this.controls.target.lerpVectors(this.alvoInicial, this.alvoDestino, t);
      this.offsetXAtual = THREE.MathUtils.lerp(this.offsetXInicial, this.offsetXAlvo, t);
      this.offsetYAtual = THREE.MathUtils.lerp(this.offsetYInicial, this.offsetYAlvo, t);
      this.aplicarViewOffset();
      this.camera.lookAt(this.controls.target);

      if (this.progressoTransicao >= 1) {
        this.emTransicao = false;
        this.offsetXAtual = this.offsetXAlvo;
        this.offsetYAtual = this.offsetYAlvo;
        this.aplicarViewOffset();
        if (this.modoAtual === 'SHOWCASE') {
          this.controls.enabled = true;
          this.controls.autoRotate = true;
          this.controls.update();
        }
      }
      return;
    }

    // Suaviza ajustes contínuos de viewOffset e distância quando o HUD muda de altura
    // (ex.: troca de aba Local/Online ou surgimento de jogadores no multiplayer)
    const fatorSuave = Math.min(1, deltaSegundos * 10);
    const diffX = this.offsetXAlvo - this.offsetXAtual;
    const diffY = this.offsetYAlvo - this.offsetYAtual;
    if (Math.abs(diffX) > 0.0004 || Math.abs(diffY) > 0.0004) {
      this.offsetXAtual += diffX * fatorSuave;
      this.offsetYAtual += diffY * fatorSuave;
      this.aplicarViewOffset();
    }

    if (this.modoAtual === 'SHOWCASE') {
      this.controls.update();
    } else {
      if (this.camera.position.distanceToSquared(this.posDestino) > 0.0004) {
        this.camera.position.lerp(this.posDestino, fatorSuave);
      }
      this.camera.lookAt(this.alvoDestino);
    }
  }

  public obterModo(): ModoCamera {
    return this.modoAtual;
  }
}
