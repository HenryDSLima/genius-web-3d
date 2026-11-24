// ============================================================================
// CENA 3D, SKYBOXES LEVES, RAYCASTING E RENDERIZAÇÃO — GENIUS 3D WEB (UNICAP)
// Orquestra o WebGLRenderer, iluminação amigável, skyboxes procedurais super
// leves (512x256, 60 FPS em celulares), chão customizável (gramado, praia,
// estúdio ou transparente flutuante) e captura de eventos pointerdown.
// ============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CorGenius } from '../core/gameEngine';
import { Cenario3D, CorCarcaca, TemaVisual } from '../core/storage';
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

  private luzAmbiente!: THREE.HemisphereLight;
  private planoApoio!: THREE.Mesh;
  private matSuperficieApoio!: THREE.MeshStandardMaterial;
  private skyboxMesh!: THREE.Mesh;
  private matSkybox!: THREE.MeshBasicMaterial;

  // Cache leve de texturas procedurais para troca instantânea sem recriar canvases
  private readonly cacheTexturasCeu = new Map<string, THREE.CanvasTexture>();
  private readonly cacheTexturasChao = new Map<string, THREE.CanvasTexture>();

  private temaAtual: TemaVisual = 'claro';
  private cenarioAtual: Cenario3D = 'estudio';

  public readonly modelo: GeniusModel;
  public readonly cameraController: CameraController;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ponteiroNDC = new THREE.Vector2();
  private readonly callbacks: CallbacksCena;

  private interacaoHabilitada = false;
  private animacaoId = 0;
  private ultimoTimestamp = 0;

  constructor(
    container: HTMLElement,
    callbacks: CallbacksCena,
    opcoesIniciais?: { corCarcaca?: CorCarcaca; tema?: TemaVisual; cenario?: Cenario3D }
  ) {
    this.container = container;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfff6dc);

    const largura = container.clientWidth || window.innerWidth;
    const altura = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(42, largura / altura, 0.1, 140);

    // Otimizado para 60 FPS estáveis em smartphones (RNF-04)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(largura, altura);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.renderer.domElement.setAttribute('aria-label', 'Tabuleiro 3D interativo do jogo Genius');
    this.container.appendChild(this.renderer.domElement);

    this.configurarIluminacao();
    this.construirSkyboxLeve();
    this.construirSuperficieApoio();

    this.modelo = new GeniusModel(opcoesIniciais?.corCarcaca ?? 'creme');
    this.scene.add(this.modelo.grupoRaiz);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.cameraController = new CameraController(this.camera, this.controls);

    this.temaAtual = opcoesIniciais?.tema ?? 'claro';
    this.cenarioAtual = opcoesIniciais?.cenario ?? 'estudio';
    this.aplicarAmbienteAtual();

    this.registrarEventos();

    this.ultimoTimestamp = performance.now();
    this.loopRender(this.ultimoTimestamp);
  }

  private configurarIluminacao(): void {
    this.luzAmbiente = new THREE.HemisphereLight(0xffffff, 0xd6be88, 1.05);
    this.scene.add(this.luzAmbiente);

    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.25);
    luzPrincipal.position.set(5.5, 11, 6.5);
    luzPrincipal.castShadow = true;
    luzPrincipal.shadow.mapSize.width = 512; // Sombras suaves leves para mobile
    luzPrincipal.shadow.mapSize.height = 512;
    luzPrincipal.shadow.camera.near = 2;
    luzPrincipal.shadow.camera.far = 26;
    const limite = 6.5;
    luzPrincipal.shadow.camera.left = -limite;
    luzPrincipal.shadow.camera.right = limite;
    luzPrincipal.shadow.camera.top = limite;
    luzPrincipal.shadow.camera.bottom = -limite;
    luzPrincipal.shadow.bias = -0.001;
    this.scene.add(luzPrincipal);

    const luzRecorte = new THREE.DirectionalLight(0xfff1c9, 0.35);
    luzRecorte.position.set(-7, 5, -6);
    this.scene.add(luzRecorte);
  }

  /**
   * Cria uma esfera de skybox ultra-leve (baixa contagem de polígonos) para os cenários 3D.
   */
  private construirSkyboxLeve(): void {
    const geoSky = new THREE.SphereGeometry(52, 24, 16);
    this.matSkybox = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyboxMesh = new THREE.Mesh(geoSky, this.matSkybox);
    this.skyboxMesh.visible = false;
    this.scene.add(this.skyboxMesh);
  }

  private construirSuperficieApoio(): void {
    const geoPlano = new THREE.CircleGeometry(28, 48);
    geoPlano.rotateX(-Math.PI / 2);
    this.matSuperficieApoio = new THREE.MeshStandardMaterial({
      color: 0xf3e2b6,
      roughness: 0.88,
      metalness: 0.02,
    });
    this.planoApoio = new THREE.Mesh(geoPlano, this.matSuperficieApoio);
    this.planoApoio.position.y = -0.46;
    this.planoApoio.receiveShadow = true;
    this.scene.add(this.planoApoio);
  }

  /**
   * Gera e guarda em cache uma textura leve (512x256) de skybox procedural.
   */
  private obterTexturaSkybox(tipo: 'dia' | 'praia' | 'por_do_sol' | 'estrelas'): THREE.CanvasTexture {
    const existente = this.cacheTexturasCeu.get(tipo);
    if (existente) return existente;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    if (tipo === 'dia') {
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.55, '#bae6fd');
      grad.addColorStop(1, '#e0f2fe');
    } else if (tipo === 'praia') {
      grad.addColorStop(0, '#0ea5e9');
      grad.addColorStop(0.48, '#7dd3fc');
      grad.addColorStop(0.62, '#38bdf8'); // Linha suave do mar no horizonte
      grad.addColorStop(1, '#fde68a');
    } else if (tipo === 'por_do_sol') {
      grad.addColorStop(0, '#6366f1');
      grad.addColorStop(0.38, '#f472b6');
      grad.addColorStop(0.68, '#fb923c');
      grad.addColorStop(1, '#fde047');
    } else {
      grad.addColorStop(0, '#090d24');
      grad.addColorStop(0.6, '#171f4a');
      grad.addColorStop(1, '#262b5c');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    if (tipo === 'estrelas') {
      // Estrelas leves e lua crescente
      for (let i = 0; i < 110; i++) {
        const x = (i * 73) % 512;
        const y = (i * 37) % 190;
        const r = i % 5 === 0 ? 1.9 : 1.1;
        ctx.fillStyle = i % 7 === 0 ? '#fde047' : 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(390, 62, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0e1432';
      ctx.beginPath();
      ctx.arc(398, 58, 16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Nuvens fofas simplificadas estilo Tomodachi Life
      ctx.fillStyle = tipo === 'por_do_sol' ? 'rgba(255, 241, 214, 0.72)' : 'rgba(255, 255, 255, 0.88)';
      const nuvens = [
        [70, 82, 26],
        [185, 64, 22],
        [310, 92, 30],
        [435, 70, 24],
        [130, 128, 18],
        [380, 126, 20],
      ];
      for (const [cx, cy, r] of nuvens) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx + r * 0.85, cy + 4, r * 0.76, 0, Math.PI * 2);
        ctx.arc(cx - r * 0.8, cy + 5, r * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    this.cacheTexturasCeu.set(tipo, textura);
    return textura;
  }

  /**
   * Gera textura procedural leve para o gramado verde ou areia da praia.
   */
  private obterTexturaChao(tipo: 'gramado' | 'praia'): THREE.CanvasTexture {
    const existente = this.cacheTexturasChao.get(tipo);
    if (existente) return existente;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    if (tipo === 'gramado') {
      ctx.fillStyle = '#65c466';
      ctx.fillRect(0, 0, 256, 256);
      // Tufinhos suaves de grama
      for (let i = 0; i < 65; i++) {
        const x = (i * 41) % 256;
        const y = (i * 67) % 256;
        ctx.fillStyle = i % 2 === 0 ? '#52b254' : '#7dd87e';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#f6dc9c';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 45; i++) {
        const x = (i * 53) % 256;
        const y = (i * 39) % 256;
        ctx.fillStyle = i % 3 === 0 ? '#f0c574' : '#fae8bc';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.wrapS = THREE.RepeatWrapping;
    textura.wrapT = THREE.RepeatWrapping;
    textura.repeat.set(6, 6);
    this.cacheTexturasChao.set(tipo, textura);
    return textura;
  }

  public definirTemaVisual(tema: TemaVisual): void {
    this.temaAtual = tema;
    this.aplicarAmbienteAtual();
  }

  public definirCenario(cenario: Cenario3D): void {
    this.cenarioAtual = cenario;
    this.aplicarAmbienteAtual();
  }

  /**
   * Aplica o cenário 3D selecionado (skybox, chão e iluminação) com mínimo custo de GPU.
   */
  private aplicarAmbienteAtual(): void {
    // Limpa textura anterior do chão
    this.matSuperficieApoio.map = null;
    this.matSuperficieApoio.transparent = false;
    this.matSuperficieApoio.opacity = 1;

    switch (this.cenarioAtual) {
      case 'gramado':
        this.skyboxMesh.visible = true;
        this.matSkybox.map = this.obterTexturaSkybox('dia');
        this.matSkybox.needsUpdate = true;
        this.planoApoio.visible = true;
        this.matSuperficieApoio.color.setHex(0xffffff);
        this.matSuperficieApoio.map = this.obterTexturaChao('gramado');
        this.matSuperficieApoio.needsUpdate = true;
        this.luzAmbiente.color.setHex(0xffffff);
        this.luzAmbiente.groundColor.setHex(0x65c466);
        this.luzAmbiente.intensity = 1.15;
        break;

      case 'nuvens':
        // Chão transparente: Genius flutua no céu azul com nuvens!
        this.skyboxMesh.visible = true;
        this.matSkybox.map = this.obterTexturaSkybox('dia');
        this.matSkybox.needsUpdate = true;
        this.planoApoio.visible = false;
        this.luzAmbiente.color.setHex(0xffffff);
        this.luzAmbiente.groundColor.setHex(0xbae6fd);
        this.luzAmbiente.intensity = 1.18;
        break;

      case 'praia':
        this.skyboxMesh.visible = true;
        this.matSkybox.map = this.obterTexturaSkybox('praia');
        this.matSkybox.needsUpdate = true;
        this.planoApoio.visible = true;
        this.matSuperficieApoio.color.setHex(0xffffff);
        this.matSuperficieApoio.map = this.obterTexturaChao('praia');
        this.matSuperficieApoio.needsUpdate = true;
        this.luzAmbiente.color.setHex(0xfffbeb);
        this.luzAmbiente.groundColor.setHex(0xf6dc9c);
        this.luzAmbiente.intensity = 1.18;
        break;

      case 'por_do_sol':
        this.skyboxMesh.visible = true;
        this.matSkybox.map = this.obterTexturaSkybox('por_do_sol');
        this.matSkybox.needsUpdate = true;
        this.planoApoio.visible = false; // Flutuando no pôr do sol
        this.luzAmbiente.color.setHex(0xffedd5);
        this.luzAmbiente.groundColor.setHex(0xf472b6);
        this.luzAmbiente.intensity = 1.12;
        break;

      case 'estrelas':
        this.skyboxMesh.visible = true;
        this.matSkybox.map = this.obterTexturaSkybox('estrelas');
        this.matSkybox.needsUpdate = true;
        this.planoApoio.visible = false;
        this.luzAmbiente.color.setHex(0xdbeafe);
        this.luzAmbiente.groundColor.setHex(0x1e1b4b);
        this.luzAmbiente.intensity = 0.9;
        break;

      case 'estudio':
      default:
        this.skyboxMesh.visible = false;
        this.planoApoio.visible = true;
        if (this.temaAtual === 'claro') {
          this.scene.background = new THREE.Color(0xfff6dc);
          this.matSuperficieApoio.color.setHex(0xf3e2b6);
          this.luzAmbiente.color.setHex(0xffffff);
          this.luzAmbiente.groundColor.setHex(0xd6be88);
          this.luzAmbiente.intensity = 1.1;
        } else {
          this.scene.background = new THREE.Color(0x141822);
          this.matSuperficieApoio.color.setHex(0x1b2130);
          this.luzAmbiente.color.setHex(0xdbeafe);
          this.luzAmbiente.groundColor.setHex(0x0f172a);
          this.luzAmbiente.intensity = 0.85;
        }
        this.matSuperficieApoio.needsUpdate = true;
        break;
    }
  }

  private registrarEventos(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.tratarPointerDown);
    canvas.addEventListener('pointermove', this.tratarPointerMove);
    canvas.addEventListener('pointerleave', this.tratarPointerLeave);
    window.addEventListener('resize', this.tratarResize);
  }

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
    if (evento.pointerType === 'mouse' && evento.button !== 0) return;

    const cor = this.detectarQuadranteSobPonteiro(evento.clientX, evento.clientY);
    if (cor) {
      evento.preventDefault();
      this.callbacks.onQuadrantePressionado(cor);
    }
  };

  private readonly tratarPointerMove = (evento: PointerEvent): void => {
    const canvas = this.renderer.domElement;
    if (!this.interacaoHabilitada || evento.pointerType === 'touch') {
      canvas.classList.remove('cursor-mao');
      canvas.classList.toggle('cursor-padrao', this.cameraController.obterModo() !== 'SHOWCASE');
      return;
    }

    const cor = this.detectarQuadranteSobPonteiro(evento.clientX, evento.clientY);
    this.modelo.definirHover(cor);
    canvas.classList.toggle('cursor-mao', Boolean(cor));
    canvas.classList.toggle('cursor-padrao', !cor);
  };

  private readonly tratarPointerLeave = (): void => {
    this.modelo.definirHover(null);
  };

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

  public definirInteracaoHabilitada(habilitada: boolean): void {
    this.interacaoHabilitada = habilitada;
    if (!habilitada) {
      this.modelo.definirHover(null);
      const canvas = this.renderer.domElement;
      canvas.classList.remove('cursor-mao');
      canvas.classList.toggle('cursor-padrao', this.cameraController.obterModo() !== 'SHOWCASE');
    }
  }

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

    // Rotação bem lenta e suave da skybox (nuvens/estrelas) sem custo extra
    if (this.skyboxMesh.visible) {
      this.skyboxMesh.rotation.y += deltaSegundos * 0.015;
    }

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
