// ============================================================================
// CENA 3D, ILUMINAÇÃO, RAYCASTING E LOOP DE RENDERIZAÇÃO — GENIUS 3D WEB
// Orquestra o WebGLRenderer do Three.js, luzes PBR, redimensionamento responsivo
// e captura de eventos pointerdown (mouse + touch sem atraso de 300ms).
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CorGenius } from '../core/gameEngine';
import { CameraController, ModoCamera } from './cameraController';
import { GeniusModel } from './geniusModel';

export interface CallbacksCena {
  onQuadrantePressionado: (cor: CorGenius) => void;
}

export class GeniusScene {
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;

  public readonly modelo: GeniusModel;
  public readonly cameraController: CameraController;

  // Raycaster para detectar cliques/toques precisos nos quadrantes 3D (RNF-02)
  private readonly raycaster = new THREE.Raycaster();
  private readonly ponteiroNDC = new THREE.Vector2();
  private readonly callbacks: CallbacksCena;

  private interacaoHabilitada = false;
  private animacaoId = 0;
  private ultimoTimestamp = 0;

  constructor(container: HTMLElement, callbacks: CallbacksCena) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Cena com fundo espacial escuro elegante
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b101b);

    // 2. Câmera perspectiva com FOV equilibrado
    const largura = container.clientWidth || window.innerWidth;
    const altura = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, largura / altura, 0.1, 100);

    // 3. Renderizador WebGL otimizado para 60 FPS em dispositivos móveis (RNF-04)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(largura, altura);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.renderer.domElement.setAttribute('aria-label', 'Tabuleiro 3D interativo do jogo Genius');
    this.container.appendChild(this.renderer.domElement);

    // 4. Iluminação de estúdio (hemisférica + direcional principal + luz de recorte)
    this.configurarIluminacao();

    // 5. Plano de mesa sutil abaixo do Genius para receber sombras suaves
    this.construirSuperficieApoio();

    // 6. Modelo 3D procedural do Genius
    this.modelo = new GeniusModel();
    this.scene.add(this.modelo.grupoRaiz);

    // 7. OrbitControls e Controlador de Câmera Dinâmica (RF-06)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.cameraController = new CameraController(this.camera, this.controls);

    // 8. Registra eventos de pointerdown (baixa latência) e resize responsivo
    this.registrarEventos();

    // 9. Inicia loop de renderização
    this.ultimoTimestamp = performance.now();
    this.loopRender(this.ultimoTimestamp);
  }

  private configurarIluminacao(): void {
    const luzAmbiente = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.75);
    this.scene.add(luzAmbiente);

    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.35);
    luzPrincipal.position.set(5.5, 11, 6.5);
    luzPrincipal.castShadow = true;
    luzPrincipal.shadow.mapSize.width = 1024;
    luzPrincipal.shadow.mapSize.height = 1024;
    luzPrincipal.shadow.camera.near = 2;
    luzPrincipal.shadow.camera.far = 26;
    const limite = 6.5;
    luzPrincipal.shadow.camera.left = -limite;
    luzPrincipal.shadow.camera.right = limite;
    luzPrincipal.shadow.camera.top = limite;
    luzPrincipal.shadow.camera.bottom = -limite;
    luzPrincipal.shadow.bias = -0.0008;
    this.scene.add(luzPrincipal);

    // Luz de preenchimento fria para destacar chanfros no modo orbital
    const luzRecorte = new THREE.DirectionalLight(0x60a5fa, 0.45);
    luzRecorte.position.set(-7, 5, -6);
    this.scene.add(luzRecorte);
  }

  private construirSuperficieApoio(): void {
    const geoPlano = new THREE.CircleGeometry(14, 64);
    geoPlano.rotateX(-Math.PI / 2);
    const matPlano = new THREE.MeshStandardMaterial({
      color: 0x0c1322,
      roughness: 0.85,
      metalness: 0.12,
    });
    const plano = new THREE.Mesh(geoPlano, matPlano);
    plano.position.y = -0.47;
    plano.receiveShadow = true;
    this.scene.add(plano);
  }

  /**
   * Registra eventos de toque/clique (pointerdown), hover (pointermove) e resize.
   */
  private registrarEventos(): void {
    const canvas = this.renderer.domElement;

    // Evento pointerdown: resposta instantânea (< 50ms) em mouse e touch sem atraso de 300ms
    canvas.addEventListener('pointerdown', this.tratarPointerDown);
    canvas.addEventListener('pointermove', this.tratarPointerMove);
    canvas.addEventListener('pointerleave', this.tratarPointerLeave);
    window.addEventListener('resize', this.tratarResize);
  }

  /**
   * Converte coordenadas de tela do ponteiro para Coordenadas de Dispositivo Normalizadas (NDC)
   * e executa o Raycasting contra os 4 quadrantes 3D do Genius.
   */
  private detectarQuadranteSobPonteiro(clientX: number, clientY: number): CorGenius | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    this.ponteiroNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ponteiroNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.ponteiroNDC, this.camera);
    const intersecoes = this.raycaster.intersectObjects(this.modelo.obterMeshesInterativos(), false);

    if (intersecoes.length > 0) {
      const cor = intersecoes[0].object.userData?.cor as CorGenius | undefined;
      return cor ?? null;
    }
    return null;
  }

  private readonly tratarPointerDown = (evento: PointerEvent): void => {
    if (!this.interacaoHabilitada) return;
    // Ignora clique com botão direito/meio no mouse
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;

    const cor = this.detectarQuadranteSobPonteiro(evento.clientX, evento.clientY);
    if (cor) {
      evento.preventDefault();
      this.callbacks.onQuadrantePressionado(cor);
    }
  };

  private readonly tratarPointerMove = (evento: PointerEvent): void => {
    if (!this.interacaoHabilitada || evento.pointerType === 'touch') {
      this.renderer.domElement.style.cursor = this.cameraController.obterModo() === 'SHOWCASE' ? 'grab' : 'default';
      return;
    }

    const cor = this.detectarQuadranteSobPonteiro(evento.clientX, evento.clientY);
    this.modelo.definirHover(cor);
    this.renderer.domElement.style.cursor = cor ? 'pointer' : 'default';
  };

  private readonly tratarPointerLeave = (): void => {
    this.modelo.definirHover(null);
  };

  /**
   * Recalcula proporção da câmera e tamanho do canvas no evento resize (RNF-01).
   */
  public readonly tratarResize = (): void => {
    const largura = this.container.clientWidth || window.innerWidth;
    const altura = this.container.clientHeight || window.innerHeight;
    if (largura === 0 || altura === 0) return;

    this.camera.aspect = largura / altura;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(largura, altura);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.cameraController.aoRedimensionar();
  };

  /**
   * Habilita ou bloqueia a interatividade dos 4 quadrantes 3D.
   */
  public definirInteracaoHabilitada(habilitada: boolean): void {
    this.interacaoHabilitada = habilitada;
    if (!habilitada) {
      this.modelo.definirHover(null);
      this.renderer.domElement.style.cursor = this.cameraController.obterModo() === 'SHOWCASE' ? 'grab' : 'default';
    }
  }

  /**
   * Alterna a câmera entre SHOWCASE (orbital livre) e JOGANDO (Top-Down travada).
   */
  public definirModoCamera(modo: ModoCamera): void {
    this.cameraController.definirModo(modo);
    if (modo === 'SHOWCASE') {
      this.definirInteracaoHabilitada(false);
    }
  }

  private readonly loopRender = (timestamp: number): void => {
    this.animacaoId = requestAnimationFrame(this.loopRender);

    const deltaSegundos = Math.min(0.05, (timestamp - this.ultimoTimestamp) / 1000);
    this.ultimoTimestamp = timestamp;

    this.cameraController.atualizar(deltaSegundos);
    this.modelo.atualizar(deltaSegundos);
    this.renderer.render(this.scene, this.camera);
  };

  public destruir(): void {
    cancelAnimationFrame(this.animacaoId);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.tratarPointerDown);
    canvas.removeEventListener('pointermove', this.tratarPointerMove);
    canvas.removeEventListener('pointerleave', this.tratarPointerLeave);
    window.removeEventListener('resize', this.tratarResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
