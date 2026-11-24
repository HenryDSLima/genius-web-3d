// ============================================================================
// MODELO 3D PROCEDURAL DO GENIUS (ESTILO TOMODACHI LIFE) — GENIUS 3D WEB
// Visual simplificado, claro, amigável e leve para celulares (60 FPS),
// com carcaça customizável (6 paletas), display central em estilo papel/pílula,
// brilho emissivo, afundamento físico no eixo Y e modo daltonismo.
// ============================================================================

import * as THREE from 'three';
import { CorGenius } from '../core/gameEngine';
import { CorCarcaca } from '../core/storage';

interface PaletaCarcaca {
  corpo: number;
  aro: number;
  recesso: number;
  nucleo: number;
  bordaDisplay: number;
}

/**
 * Paletas de cores para a carcaça do Genius (não altera as 4 cores dos botões).
 */
const PALETAS_CARCACA: Record<CorCarcaca, PaletaCarcaca> = {
  creme: {
    corpo: 0xfff7e2,
    aro: 0xf4e3b8,
    recesso: 0xe6d2a2,
    nucleo: 0xfff9ec,
    bordaDisplay: 0xf2c96b,
  },
  grafite: {
    corpo: 0x242a38,
    aro: 0x343d52,
    recesso: 0x161a24,
    nucleo: 0x2c3345,
    bordaDisplay: 0x64748b,
  },
  rosa: {
    corpo: 0xffd6e0,
    aro: 0xffb3c6,
    recesso: 0xf29cb3,
    nucleo: 0xffe5ec,
    bordaDisplay: 0xff8fab,
  },
  menta: {
    corpo: 0xcff8e4,
    aro: 0x9decc8,
    recesso: 0x7bd8b0,
    nucleo: 0xe2fcf0,
    bordaDisplay: 0x52c79a,
  },
  celeste: {
    corpo: 0xd4ecff,
    aro: 0xa6d8ff,
    recesso: 0x84c2f5,
    nucleo: 0xe8f5ff,
    bordaDisplay: 0x5aa9f0,
  },
  lavanda: {
    corpo: 0xe5d9ff,
    aro: 0xcab5ff,
    recesso: 0xb197f2,
    nucleo: 0xf1eaff,
    bordaDisplay: 0x9b7ee8,
  },
};

interface ConfigQuadrante {
  cor: CorGenius;
  corBase: number;
  corEmissiva: number;
  corLuz: number;
  anguloInicio: number;
  anguloFim: number;
  simbolo: string;
  tecla: string;
}

const GAP_ANGULAR = 0.075;
const MEIO_PI = Math.PI / 2;

/**
 * 4 quadrantes em cores alegres e amigáveis estilo brinquedo Nintendo / Tomodachi.
 */
const CONFIG_QUADRANTES: ConfigQuadrante[] = [
  {
    cor: 'vermelho',
    corBase: 0xff5c6c,
    corEmissiva: 0xff3b52,
    corLuz: 0xff6b7a,
    anguloInicio: GAP_ANGULAR,
    anguloFim: MEIO_PI - GAP_ANGULAR,
    simbolo: '●',
    tecla: '2',
  },
  {
    cor: 'verde',
    corBase: 0x2dd46c,
    corEmissiva: 0x22e56b,
    corLuz: 0x4ade80,
    anguloInicio: MEIO_PI + GAP_ANGULAR,
    anguloFim: Math.PI - GAP_ANGULAR,
    simbolo: '▲',
    tecla: '1',
  },
  {
    cor: 'amarelo',
    corBase: 0xffd43b,
    corEmissiva: 0xffca1a,
    corLuz: 0xffe066,
    anguloInicio: Math.PI + GAP_ANGULAR,
    anguloFim: Math.PI * 1.5 - GAP_ANGULAR,
    simbolo: '■',
    tecla: '3',
  },
  {
    cor: 'azul',
    corBase: 0x3b9eff,
    corEmissiva: 0x248eff,
    corLuz: 0x60a5fa,
    anguloInicio: Math.PI * 1.5 + GAP_ANGULAR,
    anguloFim: Math.PI * 2 - GAP_ANGULAR,
    simbolo: '◆',
    tecla: '4',
  },
];

interface EstadoVisualQuadrante {
  grupo: THREE.Group;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
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

export class GeniusModel {
  public readonly grupoRaiz: THREE.Group;
  private readonly quadrantes = new Map<CorGenius, EstadoVisualQuadrante>();
  private readonly meshesInterativos: THREE.Mesh[] = [];

  // Materiais da carcaça customizável
  private matBase!: THREE.MeshStandardMaterial;
  private matAro!: THREE.MeshStandardMaterial;
  private matRecesso!: THREE.MeshStandardMaterial;
  private matNucleo!: THREE.MeshStandardMaterial;
  private matBordaDisplay!: THREE.MeshStandardMaterial;

  // Recursos do display digital central (estilo Tomodachi Life)
  private readonly displayCanvas: HTMLCanvasElement;
  private readonly displayCtx: CanvasRenderingContext2D | null;
  private readonly displayTexture: THREE.CanvasTexture;

  constructor(corInicial: CorCarcaca = 'creme') {
    this.grupoRaiz = new THREE.Group();

    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = 512;
    this.displayCanvas.height = 512;
    this.displayCtx = this.displayCanvas.getContext('2d');
    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    this.displayTexture.anisotropy = 4;

    this.construirChassi(PALETAS_CARCACA[corInicial]);
    this.construirQuadrantes();
    this.construirPainelCentral(PALETAS_CARCACA[corInicial]);
    this.atualizarDisplay('--', 'PRONTO', '#ff9f1c');
  }

  /**
   * Constrói o corpo circular simplificado estilo brinquedo claro do Tomodachi Life.
   */
  private construirChassi(paleta: PaletaCarcaca): void {
    const geoBase = new THREE.CylinderGeometry(4.15, 4.35, 0.7, 56);
    this.matBase = new THREE.MeshStandardMaterial({
      color: paleta.corpo,
      roughness: 0.48,
      metalness: 0.04,
    });
    const meshBase = new THREE.Mesh(geoBase, this.matBase);
    meshBase.position.y = 0;
    meshBase.receiveShadow = true;
    meshBase.castShadow = true;
    this.grupoRaiz.add(meshBase);

    // Aro superior arredondado suave
    const geoAro = new THREE.TorusGeometry(4.06, 0.16, 16, 64);
    this.matAro = new THREE.MeshStandardMaterial({
      color: paleta.aro,
      roughness: 0.42,
      metalness: 0.05,
    });
    const meshAro = new THREE.Mesh(geoAro, this.matAro);
    meshAro.rotation.x = Math.PI / 2;
    meshAro.position.y = 0.34;
    this.grupoRaiz.add(meshAro);

    // Recesso suave entre os quadrantes
    const geoRecesso = new THREE.CylinderGeometry(3.88, 3.88, 0.15, 48);
    this.matRecesso = new THREE.MeshStandardMaterial({
      color: paleta.recesso,
      roughness: 0.65,
      metalness: 0.02,
    });
    const meshRecesso = new THREE.Mesh(geoRecesso, this.matRecesso);
    meshRecesso.position.y = 0.32;
    meshRecesso.receiveShadow = true;
    this.grupoRaiz.add(meshRecesso);
  }

  /**
   * Constrói os 4 quadrantes arredondados e leves (MeshStandardMaterial otimizado para mobile).
   */
  private construirQuadrantes(): void {
    const raioInterno = 1.64;
    const raioExterno = 3.7;
    const alturaExtrusao = 0.28;
    const yBase = 0.36;

    for (const cfg of CONFIG_QUADRANTES) {
      const grupoQuadrante = new THREE.Group();
      grupoQuadrante.position.y = yBase;

      const forma = new THREE.Shape();
      forma.absarc(0, 0, raioExterno, cfg.anguloInicio, cfg.anguloFim, false);
      forma.absarc(0, 0, raioInterno, cfg.anguloFim, cfg.anguloInicio, true);
      forma.closePath();

      const geometria = new THREE.ExtrudeGeometry(forma, {
        depth: alturaExtrusao,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.08,
        bevelThickness: 0.08,
        curveSegments: 28,
      });
      geometria.rotateX(-Math.PI / 2);

      // Material acetinado leve estilo brinquedo (excelente desempenho em mobile)
      const material = new THREE.MeshStandardMaterial({
        color: cfg.corBase,
        emissive: cfg.corEmissiva,
        emissiveIntensity: 0.12,
        roughness: 0.32,
        metalness: 0.03,
      });

      const mesh = new THREE.Mesh(geometria, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { cor: cfg.cor };
      grupoQuadrante.add(mesh);
      this.meshesInterativos.push(mesh);

      const anguloMedio = (cfg.anguloInicio + cfg.anguloFim) / 2;
      const raioMedio = (raioInterno + raioExterno) / 2;
      const posX = Math.cos(anguloMedio) * raioMedio;
      const posZ = -Math.sin(anguloMedio) * raioMedio;

      const luz = new THREE.PointLight(cfg.corLuz, 0, 5.5, 1.8);
      luz.position.set(posX, 0.72, posZ);
      grupoQuadrante.add(luz);

      const placaSimbolo = this.criarPlacaSimbolo(cfg.tecla, cfg.simbolo);
      placaSimbolo.position.set(posX, alturaExtrusao + 0.09, posZ);
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
        intensidadeAlvo: 0.12,
        intensidadeAtual: 0.12,
        yAlvo: yBase,
        yAtual: yBase,
        emHover: false,
        ativo: false,
      });
    }
  }

  private criarPlacaSimbolo(tecla: string, simbolo: string): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.beginPath();
      ctx.arc(128, 128, 108, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20, 24, 36, 0.9)';
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 92px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(simbolo, 128, 102);

      ctx.fillStyle = '#ffd43b';
      ctx.font = 'bold 48px monospace';
      ctx.fillText(tecla, 128, 184);
    }

    const textura = new THREE.CanvasTexture(canvas);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;

    const geo = new THREE.CircleGeometry(0.62, 28);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshBasicMaterial({
      map: textura,
      transparent: true,
      depthWrite: false,
    });

    return new THREE.Mesh(geo, mat);
  }

  private construirPainelCentral(paleta: PaletaCarcaca): void {
    const geoNucleo = new THREE.CylinderGeometry(1.5, 1.56, 0.44, 48);
    this.matNucleo = new THREE.MeshStandardMaterial({
      color: paleta.nucleo,
      roughness: 0.42,
      metalness: 0.04,
    });
    const meshNucleo = new THREE.Mesh(geoNucleo, this.matNucleo);
    meshNucleo.position.y = 0.56;
    meshNucleo.castShadow = true;
    meshNucleo.receiveShadow = true;
    this.grupoRaiz.add(meshNucleo);

    const geoBorda = new THREE.TorusGeometry(1.46, 0.065, 14, 52);
    this.matBordaDisplay = new THREE.MeshStandardMaterial({
      color: paleta.bordaDisplay,
      roughness: 0.35,
      metalness: 0.08,
    });
    const meshBorda = new THREE.Mesh(geoBorda, this.matBordaDisplay);
    meshBorda.rotation.x = Math.PI / 2;
    meshBorda.position.y = 0.77;
    this.grupoRaiz.add(meshBorda);

    const geoDisplay = new THREE.CircleGeometry(1.38, 44);
    geoDisplay.rotateX(-Math.PI / 2);
    const matDisplay = new THREE.MeshBasicMaterial({
      map: this.displayTexture,
    });
    const meshDisplay = new THREE.Mesh(geoDisplay, matDisplay);
    meshDisplay.position.y = 0.795;
    this.grupoRaiz.add(meshDisplay);
  }

  /**
   * Altera a cor da carcaça do Genius mantendo as 4 cores oficiais dos botões intactas.
   */
  public definirCorCarcaca(cor: CorCarcaca): void {
    const paleta = PALETAS_CARCACA[cor] ?? PALETAS_CARCACA.creme;
    this.matBase.color.setHex(paleta.corpo);
    this.matAro.color.setHex(paleta.aro);
    this.matRecesso.color.setHex(paleta.recesso);
    this.matNucleo.color.setHex(paleta.nucleo);
    this.matBordaDisplay.color.setHex(paleta.bordaDisplay);
  }

  /**
   * Atualiza a telinha central no estilo lúdico creme/pílula inspirado no Tomodachi Life.
   */
  public atualizarDisplay(contador: string, subtitulo: string, corDestaque = '#ff9f1c'): void {
    const ctx = this.displayCtx;
    if (!ctx) return;

    const w = this.displayCanvas.width;
    const h = this.displayCanvas.height;

    // Fundo creme clarinho com padrão suave de bolinhas (estilo Tomodachi Life)
    ctx.fillStyle = '#fff9e6';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(240, 201, 109, 0.28)';
    for (let y = 24; y < h; y += 36) {
      for (let x = 24; x < w; x += 36) {
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Círculo tracejado decorativo interno
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 224, 0, Math.PI * 2);
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f0cf7d';
    ctx.stroke();
    ctx.restore();

    // Título amigável "GENIUS"
    ctx.fillStyle = '#22293d';
    ctx.font = '900 44px "Fredoka", "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GENIUS', w / 2, 132);

    // Pílula central branca com sombra quente para o contador
    ctx.fillStyle = '#e8d29b';
    ctx.beginPath();
    ctx.roundRect(136, 186, 240, 134, 67);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = corDestaque;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(136, 178, 240, 134, 67);
    ctx.fill();
    ctx.stroke();

    // Dígitos arredondados bem legíveis
    ctx.fillStyle = '#22293d';
    ctx.font = '900 84px "Fredoka", "Nunito", system-ui, sans-serif';
    ctx.fillText(contador, w / 2, 248);

    // Pílula colorida de status abaixo
    ctx.fillStyle = corDestaque;
    ctx.beginPath();
    ctx.roundRect(126, 344, 260, 56, 28);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px "Fredoka", "Nunito", system-ui, sans-serif';
    ctx.fillText(subtitulo.toUpperCase().slice(0, 14), w / 2, 374);

    this.displayTexture.needsUpdate = true;
  }

  public obterMeshesInterativos(): THREE.Mesh[] {
    return this.meshesInterativos;
  }

  public definirQuadranteAtivo(cor: CorGenius, ativo: boolean): void {
    const q = this.quadrantes.get(cor);
    if (!q) return;

    q.ativo = ativo;
    this.recalcularAlvosQuadrante(q);
  }

  public definirHover(cor: CorGenius | null): void {
    for (const [corQ, q] of this.quadrantes.entries()) {
      const novoHover = corQ === cor;
      if (q.emHover !== novoHover) {
        q.emHover = novoHover;
        this.recalcularAlvosQuadrante(q);
      }
    }
  }

  public apagarTodos(): void {
    for (const q of this.quadrantes.values()) {
      q.ativo = false;
      q.emHover = false;
      this.recalcularAlvosQuadrante(q);
    }
  }

  public definirModoDaltonismo(ativo: boolean): void {
    for (const q of this.quadrantes.values()) {
      q.placaSimbolo.visible = ativo;
    }
  }

  private recalcularAlvosQuadrante(q: EstadoVisualQuadrante): void {
    if (q.ativo) {
      q.intensidadeAlvo = 1.65;
      q.yAlvo = q.yBase - 0.15;
    } else if (q.emHover) {
      q.intensidadeAlvo = 0.36;
      q.yAlvo = q.yBase - 0.03;
    } else {
      q.intensidadeAlvo = 0.12;
      q.yAlvo = q.yBase;
    }
  }

  public atualizar(deltaSegundos: number): void {
    const fator = Math.min(1, deltaSegundos * 18);

    for (const q of this.quadrantes.values()) {
      q.intensidadeAtual += (q.intensidadeAlvo - q.intensidadeAtual) * fator;
      q.yAtual += (q.yAlvo - q.yAtual) * fator;

      q.material.emissiveIntensity = q.intensidadeAtual;
      q.grupo.position.y = q.yAtual;

      const brilhoExtra = Math.max(0, q.intensidadeAtual - 0.32);
      q.luz.intensity = brilhoExtra * 3.2;
    }
  }
}
