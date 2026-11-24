// ============================================================================
// MODELO 3D PROCEDURAL DO GENIUS (THREE.JS) — GENIUS 3D WEB (UNICAP)
// Constrói o tabuleiro circular clássico via código (geometrias extrudadas com
// chanfros, materiais PBR, brilho emissivo, iluminação dinâmica, display central
// e símbolos de alto contraste para acessibilidade/daltonismo).
// ============================================================================

import * as THREE from 'three';
import { CorGenius } from '../core/gameEngine';

/**
 * Configuração visual e espacial de cada um dos 4 quadrantes coloridos.
 * Os ângulos seguem o layout clássico visto de cima (Top-Down):
 * - Verde: Superior Esquerdo
 * - Vermelho: Superior Direito
 * - Amarelo: Inferior Esquerdo
 * - Azul: Inferior Direito
 */
interface ConfigQuadrante {
  cor: CorGenius;
  corBase: number;
  corEmissiva: number;
  corLuz: number;
  anguloInicio: number;
  anguloFim: number;
  simbolo: string;
  tecla: string;
  rotulo: string;
}

const GAP_ANGULAR = 0.065;
const MEIO_PI = Math.PI / 2;

/**
 * Mapeamento dos ângulos no plano XY (antes da rotação -PI/2 no eixo X).
 * Após rotacionar -PI/2 em X, o eixo +Y do shape aponta para -Z (topo na visão Top-Down).
 */
const CONFIG_QUADRANTES: ConfigQuadrante[] = [
  {
    cor: 'vermelho',
    corBase: 0xdc2626,
    corEmissiva: 0xff2e2e,
    corLuz: 0xff4444,
    anguloInicio: GAP_ANGULAR,
    anguloFim: MEIO_PI - GAP_ANGULAR,
    simbolo: '●',
    tecla: '2',
    rotulo: 'VERMELHO',
  },
  {
    cor: 'verde',
    corBase: 0x16a34a,
    corEmissiva: 0x22ff66,
    corLuz: 0x33ff77,
    anguloInicio: MEIO_PI + GAP_ANGULAR,
    anguloFim: Math.PI - GAP_ANGULAR,
    simbolo: '▲',
    tecla: '1',
    rotulo: 'VERDE',
  },
  {
    cor: 'amarelo',
    corBase: 0xca8a04,
    corEmissiva: 0xffee22,
    corLuz: 0xffea33,
    anguloInicio: Math.PI + GAP_ANGULAR,
    anguloFim: Math.PI * 1.5 - GAP_ANGULAR,
    simbolo: '■',
    tecla: '3',
    rotulo: 'AMARELO',
  },
  {
    cor: 'azul',
    corBase: 0x2563eb,
    corEmissiva: 0x3399ff,
    corLuz: 0x44aaff,
    anguloInicio: Math.PI * 1.5 + GAP_ANGULAR,
    anguloFim: Math.PI * 2 - GAP_ANGULAR,
    simbolo: '◆',
    tecla: '4',
    rotulo: 'AZUL',
  },
];

interface EstadoVisualQuadrante {
  grupo: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  luz: THREE.PointLight;
  placaSimbolo: THREE.Mesh;
  yBase: number;
  intensidadeAlvo: number;
  intensidadeAtual: number;
  yAlvo: number;
  yAtual: number;
  emHover: boolean;
  ativo: boolean;
}

/**
 * Classe responsável pela construção procedural e animação do modelo 3D do Genius.
 */
export class GeniusModel {
  public readonly grupoRaiz: THREE.Group;
  private readonly quadrantes = new Map<CorGenius, EstadoVisualQuadrante>();
  private readonly meshesInterativos: THREE.Mesh[] = [];

  // Recursos do display digital central (CanvasTexture atualizado dinamicamente)
  private readonly displayCanvas: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D | null;
  private readonly displayTexture: THREE.CanvasTexture;

  constructor() {
    this.grupoRaiz = new THREE.Group();

    // Cria o canvas interno do visor digital central
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = 512;
    this.displayCanvas.height = 512;
    this.displayCtx = this.displayCanvas.getContext('2d');
    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    this.displayTexture.anisotropy = 4;

    this.construirChassi();
    this.construirQuadrantes();
    this.construirPainelCentral();
    this.atualizarDisplay('--', 'PRONTO', '#38bdf8');
  }

  /**
   * Constrói o corpo circular escuro do Genius com borda chanfrada e anel metálico.
   */
  private construirChassi(): void {
    // Base principal cilíndrica escura com acabamento acetinado
    const geoBase = new THREE.CylinderGeometry(4.2, 4.45, 0.72, 72);
    const matBase = new THREE.MeshStandardMaterial({
      color: 0x111318,
      roughness: 0.42,
      metalness: 0.28,
    });
    const meshBase = new THREE.Mesh(geoBase, matBase);
    meshBase.position.y = 0;
    meshBase.receiveShadow = true;
    meshBase.castShadow = true;
    this.grupoRaiz.add(meshBase);

    // Anel superior decorativo chanfrado (aro externo)
    const geoAro = new THREE.TorusGeometry(4.12, 0.14, 24, 80);
    const matAro = new THREE.MeshStandardMaterial({
      color: 0x1e222b,
      roughness: 0.28,
      metalness: 0.65,
    });
    const meshAro = new THREE.Mesh(geoAro, matAro);
    meshAro.rotation.x = Math.PI / 2;
    meshAro.position.y = 0.34;
    this.grupoRaiz.add(meshAro);

    // Recesso escuro onde os 4 quadrantes se encaixam (cria as divisórias em cruz)
    const geoRecesso = new THREE.CylinderGeometry(3.92, 3.92, 0.16, 64);
    const matRecesso = new THREE.MeshStandardMaterial({
      color: 0x07080b,
      roughness: 0.75,
      metalness: 0.1,
    });
    const meshRecesso = new THREE.Mesh(geoRecesso, matRecesso);
    meshRecesso.position.y = 0.32;
    meshRecesso.receiveShadow = true;
    this.grupoRaiz.add(meshRecesso);

    // Base inferior antiderrapante (detalhe visível no modo orbital)
    const geoFundo = new THREE.CylinderGeometry(3.9, 3.7, 0.14, 48);
    const matFundo = new THREE.MeshStandardMaterial({
      color: 0x090b0f,
      roughness: 0.9,
      metalness: 0.05,
    });
    const meshFundo = new THREE.Mesh(geoFundo, matFundo);
    meshFundo.position.y = -0.4;
    this.grupoRaiz.add(meshFundo);
  }

  /**
   * Constrói os 4 quadrantes coloridos extrudados com chanfros, iluminação emissiva
   * individual e placas opcionais de símbolos de alto contraste (Modo Daltonismo).
   */
  private construirQuadrantes(): void {
    const raioInterno = 1.62;
    const raioExterno = 3.72;
    const alturaExtrusao = 0.28;
    const yBase = 0.36;

    for (const cfg of CONFIG_QUADRANTES) {
      const grupoQuadrante = new THREE.Group();
      grupoQuadrante.position.y = yBase;

      // Desenha o setor circular (arco) no plano 2D para extrusão
      const forma = new THREE.Shape();
      forma.absarc(0, 0, raioExterno, cfg.anguloInicio, cfg.anguloFim, false);
      forma.absarc(0, 0, raioInterno, cfg.anguloFim, cfg.anguloInicio, true);
      forma.closePath();

      const geometria = new THREE.ExtrudeGeometry(forma, {
        depth: alturaExtrusao,
        bevelEnabled: true,
        bevelSegments: 5,
        steps: 1,
        bevelSize: 0.07,
        bevelThickness: 0.07,
        curveSegments: 36,
      });

      // Rotaciona para deitar o arco no plano XZ (horizontal)
      geometria.rotateX(-Math.PI / 2);

      // Material PBR translúcido/brilhante com canal emissivo controlável (RF-02)
      const material = new THREE.MeshPhysicalMaterial({
        color: cfg.corBase,
        emissive: cfg.corEmissiva,
        emissiveIntensity: 0.16,
        roughness: 0.22,
        metalness: 0.06,
        clearcoat: 0.9,
        clearcoatRoughness: 0.14,
      });

      const mesh = new THREE.Mesh(geometria, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Armazena a cor no userData para identificação instantânea via Raycaster
      mesh.userData = { cor: cfg.cor };
      grupoQuadrante.add(mesh);
      this.meshesInterativos.push(mesh);

      // Ponto central do arco para posicionar luz local e símbolo de acessibilidade
      const anguloMedio = (cfg.anguloInicio + cfg.anguloFim) / 2;
      const raioMedio = (raioInterno + raioExterno) / 2;
      const posX = Math.cos(anguloMedio) * raioMedio;
      const posZ = -Math.sin(anguloMedio) * raioMedio;

      // Luz pontual dedicada que ilumina o chassi quando o quadrante acende
      const luz = new THREE.PointLight(cfg.corLuz, 0, 6.5, 1.8);
      luz.position.set(posX, 0.72, posZ);
      grupoQuadrante.add(luz);

      // Placa de símbolo de alto contraste para o Modo Daltonismo (RNF-03)
      const placaSimbolo = this.criarPlacaSimbolo(cfg.tecla, cfg.simbolo);
      placaSimbolo.position.set(posX, alturaExtrusao + 0.085, posZ);
      placaSimbolo.visible = false;
      grupoQuadrante.add(placaSimbolo);

      this.grupoRaiz.add(grupoQuadrante);

      this.quadrantes.set(cfg.cor, {
        grupo: grupoQuadrante,
        mesh,
        material,
        luz,
        placaSimbolo,
        yBase,
        intensidadeAlvo: 0.16,
        intensidadeAtual: 0.16,
        yAlvo: yBase,
        yAtual: yBase,
        emHover: false,
        ativo: false,
      });
    }
  }

  /**
   * Cria uma textura circular de alto contraste (ex.: "1 ▲") posicionada sobre
   * o quadrante 3D quando o Modo Daltonismo está ativado.
   */
  private criarPlacaSimbolo(tecla: string, simbolo: string): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Fundo escuro semiopaco com borda branca de alto contraste (WCAG AAA)
      ctx.beginPath();
      ctx.arc(128, 128, 108, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 12, 18, 0.88)';
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Símbolo geométrico principal
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 92px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(simbolo, 128, 102);

      // Número da tecla correspondente
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 48px monospace';
      ctx.fillText(tecla, 128, 184);
    }

    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;

    const geo = new THREE.CircleGeometry(0.62, 32);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      map: textura,
      transparent: true,
      depthWrite: false,
    });

    return new THREE.Mesh(geo, mat);
  }

  /**
   * Constrói o núcleo central escuro com aro metálico e display digital dinâmico.
   */
  private construirPainelCentral(): void {
    // Corpo do núcleo central
    const geoNucleo = new THREE.CylinderGeometry(1.48, 1.54, 0.44, 56);
    const matNucleo = new THREE.MeshStandardMaterial({
      color: 0x151922,
      roughness: 0.35,
      metalness: 0.45,
    });
    const meshNucleo = new THREE.Mesh(geoNucleo, matNucleo);
    meshNucleo.position.y = 0.56;
    meshNucleo.castShadow = true;
    meshNucleo.receiveShadow = true;
    this.grupoRaiz.add(meshNucleo);

    // Anel metálico ao redor do display central
    const geoBorda = new THREE.TorusGeometry(1.45, 0.055, 16, 64);
    const matBorda = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.22,
      metalness: 0.85,
    });
    const meshBorda = new THREE.Mesh(geoBorda, matBorda);
    meshBorda.rotation.x = Math.PI / 2;
    meshBorda.position.y = 0.77;
    this.grupoRaiz.add(meshBorda);

    // Face superior do display digital com CanvasTexture
    const geoDisplay = new THREE.CircleGeometry(1.38, 48);
    geoDisplay.rotateX(-Math.PI / 2);
    const matDisplay = new THREE.MeshStandardMaterial({
      map: this.displayTexture,
      roughness: 0.25,
      metalness: 0.15,
      emissive: 0xffffff,
      emissiveMap: this.displayTexture,
      emissiveIntensity: 0.55,
    });
    const meshDisplay = new THREE.Mesh(geoDisplay, matDisplay);
    meshDisplay.position.y = 0.79;
    this.grupoRaiz.add(meshDisplay);
  }

  /**
   * Atualiza o texto e o contador digital exibido no centro do tabuleiro 3D.
   */
  public atualizarDisplay(contador: string, subtitulo: string, corDestaque = '#38bdf8'): void {
    const ctx = this.displayCtx;
    if (!ctx) return;

    const w = this.displayCanvas.width;
    const h = this.displayCanvas.height;

    // Fundo circular escuro com gradiente radial
    const grad = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#182030');
    grad.addColorStop(1, '#090c12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Marca superior "GENIUS"
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '900 44px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GENIUS', w / 2, 138);

    // Caixa do visor digital (estilo display LED clássico)
    ctx.fillStyle = '#05070a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(146, 186, 220, 128, 18);
    ctx.fill();
    ctx.stroke();

    // Dígitos brilhantes do contador
    ctx.save();
    ctx.shadowColor = corDestaque;
    ctx.shadowBlur = 18;
    ctx.fillStyle = corDestaque;
    ctx.font = 'bold 84px monospace';
    ctx.fillText(contador, w / 2, 254);
    ctx.restore();

    // Subtítulo de status abaixo do visor
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 28px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitulo.toUpperCase().slice(0, 16), w / 2, 368);

    // Pequeno LED indicador inferior
    ctx.beginPath();
    ctx.arc(w / 2, 418, 10, 0, Math.PI * 2);
    ctx.fillStyle = corDestaque;
    ctx.fill();

    this.displayTexture.needsUpdate = true;
  }

  /**
   * Retorna os 4 meshes interativos para detecção de clique/toque via Raycaster.
   */
  public obterMeshesInterativos(): THREE.Mesh[] {
    return this.meshesInterativos;
  }

  /**
   * Acende ou apaga um quadrante 3D (brilho emissivo + afundamento físico no eixo Y).
   */
  public definirQuadranteAtivo(cor: CorGenius, ativo: boolean): void {
    const q = this.quadrantes.get(cor);
    if (!q) return;

    q.ativo = ativo;
    this.recalcularAlvosQuadrante(q);
  }

  /**
   * Define o destaque suave de hover no desktop quando o cursor passa sobre um quadrante.
   */
  public definirHover(cor: CorGenius | null): void {
    for (const [corQ, q] of this.quadrantes.entries()) {
      const novoHover = corQ === cor;
      if (q.emHover !== novoHover) {
        q.emHover = novoHover;
        this.recalcularAlvosQuadrante(q);
      }
    }
  }

  /**
   * Apaga todos os quadrantes imediatamente (útil ao reiniciar ou voltar ao menu).
   */
  public apagarTodos(): void {
    for (const q of this.quadrantes.values()) {
      q.ativo = false;
      q.emHover = false;
      this.recalcularAlvosQuadrante(q);
    }
  }

  /**
   * Alterna a visibilidade das placas de símbolos de alto contraste (Modo Daltonismo - RNF-03).
   */
  public definirModoDaltonismo(ativo: boolean): void {
    for (const q of this.quadrantes.values()) {
      q.placaSimbolo.visible = ativo;
    }
  }

  private recalcularAlvosQuadrante(q: EstadoVisualQuadrante): void {
    if (q.ativo) {
      q.intensidadeAlvo = 1.95;
      q.yAlvo = q.yBase - 0.15; // Pressionamento físico no eixo Y
    } else if (q.emHover) {
      q.intensidadeAlvo = 0.45;
      q.yAlvo = q.yBase - 0.03;
    } else {
      q.intensidadeAlvo = 0.16;
      q.yAlvo = q.yBase;
    }
  }

  /**
   * Atualiza suavemente as animações de brilho, luz pontual e afundamento físico a 60 FPS.
   */
  public atualizar(deltaSegundos: number): void {
    const fator = Math.min(1, deltaSegundos * 18);

    for (const q of this.quadrantes.values()) {
      q.intensidadeAtual += (q.intensidadeAlvo - q.intensidadeAtual) * fator;
      q.yAtual += (q.yAlvo - q.yAtual) * fator;

      q.material.emissiveIntensity = q.intensidadeAtual;
      q.grupo.position.y = q.yAtual;

      // A luz pontual acende proporcionalmente acima do nível de repouso
      const brilhoExtra = Math.max(0, q.intensidadeAtual - 0.35);
      q.luz.intensity = brilhoExtra * 3.8;
    }
  }
}
