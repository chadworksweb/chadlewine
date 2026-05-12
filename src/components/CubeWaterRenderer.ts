// Single-context water-ripple renderer for a Discography cube.
//
// Replaces the per-face DiscoFaceWater (which spun up 5 WebGL2 contexts,
// 15 shader compiles, etc. on every hover). One CubeWaterRenderer owns
// a single WebGL2 context, compiles its 3 shader programs ONCE, and
// manages up to 5 face slots (textures, FBOs, source images, drop queues).
//
// The shared offscreen canvas is laid out as a 1x5 horizontal atlas:
// faces 0..4 occupy consecutive TILE x TILE viewports. Each face's
// presenter canvas reads its tile via drawImage() each frame.
//
// Lifecycle: lazy — nothing is created until ensureInit() is called
// (typically on first hover). Persists across hover cycles; only torn
// down on cube unmount.

const SIM_RES = 256;
const TILE = 512; // px per face tile in the atlas
const DAMPING = 0.992;
const DISPLACEMENT = 0.045;
const DROP_RADIUS = 0.04;
const TAIL_CUTOFF = 0; // match original cube behavior (DiscoFaceWater default)

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_STEP = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_damping;
uniform float u_tailCutoff;
out vec4 outColor;
void main() {
  vec4 c = texture(u_state, v_uv);
  float curr = c.r;
  float prev = c.g;
  float l = texture(u_state, v_uv - vec2(u_texel.x, 0.0)).r;
  float r = texture(u_state, v_uv + vec2(u_texel.x, 0.0)).r;
  float u = texture(u_state, v_uv - vec2(0.0, u_texel.y)).r;
  float d = texture(u_state, v_uv + vec2(0.0, u_texel.y)).r;
  float next = ((l + r + u + d) * 0.5 - prev) * u_damping;
  next = clamp(next, -2.0, 2.0);
  if (u_tailCutoff > 0.0 && abs(next) < u_tailCutoff) next = 0.0;
  outColor = vec4(next, curr, 0.0, 1.0);
}`;

const FRAG_DROP = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_dropPos;
uniform float u_dropRadius;
uniform float u_dropStrength;
out vec4 outColor;
void main() {
  vec4 c = texture(u_state, v_uv);
  float d = distance(v_uv, u_dropPos);
  float energy = u_dropStrength * smoothstep(u_dropRadius, 0.0, d);
  outColor = vec4(c.r + energy, c.g, 0.0, 1.0);
}`;

const FRAG_RENDER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_state;
uniform sampler2D u_source;
uniform vec4 u_crop;
uniform vec2 u_texel;
uniform float u_disp;
out vec4 outColor;
void main() {
  float l = texture(u_state, v_uv - vec2(u_texel.x, 0.0)).r;
  float r = texture(u_state, v_uv + vec2(u_texel.x, 0.0)).r;
  float u = texture(u_state, v_uv - vec2(0.0, u_texel.y)).r;
  float d = texture(u_state, v_uv + vec2(0.0, u_texel.y)).r;
  vec2 grad = clamp(vec2(l - r, u - d) * u_disp, vec2(-0.05), vec2(0.05));
  vec2 outUV = clamp(v_uv + grad, 0.0, 1.0);
  vec2 sourceUV = u_crop.xy + outUV * u_crop.zw;
  vec3 col = texture(u_source, sourceUV).rgb;
  float amp = clamp(abs((l + r + u + d) * 0.25), 0.0, 0.8);
  col += vec3(0.20, 0.55, 0.70) * amp * 0.6;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "(no log)";
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("Program link failed: " + log);
  }
  return p;
}

function makeFloatTex(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  const zeros = new Uint16Array(w * h * 2);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.HALF_FLOAT, zeros);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function computeCropUV(
  imgAR: number,
  faceAR: number,
  fx: number,
  fy: number,
  zoom: number,
): [number, number, number, number] {
  let sw = 1, sh = 1, sx = 0, sy = 0;
  const z = Math.max(1, zoom);
  if (imgAR > faceAR) {
    sw = (faceAR / imgAR) / z;
    sh = 1 / z;
  } else {
    sw = 1 / z;
    sh = (imgAR / faceAR) / z;
  }
  sx = (1 - sw) * fx;
  sy = (1 - sh) * fy;
  return [sx, sy, sw, sh];
}

export interface CubeFaceSource {
  src: string | null;
  /** 0..1 */
  fx: number;
  fy: number;
  zoom: number;
}

interface FaceSlot {
  src: string | null;
  fx: number;
  fy: number;
  zoom: number;
  texA: WebGLTexture | null;
  texB: WebGLTexture | null;
  fboA: WebGLFramebuffer | null;
  fboB: WebGLFramebuffer | null;
  sourceTex: WebGLTexture | null;
  imgReady: boolean;
  imgAR: number;
  /** Toggles each step. */
  pingPongFlip: boolean;
  drops: { x: number; y: number; strength: number }[];
  imgCancelled: boolean;
}

export class CubeWaterRenderer {
  readonly atlas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private stepProg: WebGLProgram | null = null;
  private dropProg: WebGLProgram | null = null;
  private renderProg: WebGLProgram | null = null;
  private quad: WebGLBuffer | null = null;
  private uStepState: WebGLUniformLocation | null = null;
  private uStepTexel: WebGLUniformLocation | null = null;
  private uStepDamp: WebGLUniformLocation | null = null;
  private uStepTailCutoff: WebGLUniformLocation | null = null;
  private uDropState: WebGLUniformLocation | null = null;
  private uDropPos: WebGLUniformLocation | null = null;
  private uDropRadius: WebGLUniformLocation | null = null;
  private uDropStrength: WebGLUniformLocation | null = null;
  private uRenderState: WebGLUniformLocation | null = null;
  private uRenderSource: WebGLUniformLocation | null = null;
  private uRenderCrop: WebGLUniformLocation | null = null;
  private uRenderTexel: WebGLUniformLocation | null = null;
  private uRenderDisp: WebGLUniformLocation | null = null;
  private faces: FaceSlot[] = [];
  private raf = 0;
  private running = false;
  private destroyed = false;
  private initialized = false;

  constructor(sources: CubeFaceSource[]) {
    // Atlas: 5 tiles horizontally.
    const canvas = document.createElement("canvas");
    canvas.width = TILE * 5;
    canvas.height = TILE;
    this.atlas = canvas;

    for (let i = 0; i < 5; i++) {
      const s = sources[i] || { src: null, fx: 0.5, fy: 0.5, zoom: 1 };
      this.faces.push({
        src: s.src,
        fx: s.fx,
        fy: s.fy,
        zoom: s.zoom,
        texA: null,
        texB: null,
        fboA: null,
        fboB: null,
        sourceTex: null,
        imgReady: false,
        imgAR: 1,
        pingPongFlip: false,
        drops: [],
        imgCancelled: false,
      });
    }
  }

  ensureInit(): boolean {
    if (this.initialized) return true;
    if (this.destroyed) return false;
    const gl = this.atlas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;
    this.gl = gl;
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");

    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      this.stepProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG_STEP));
      this.dropProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG_DROP));
      this.renderProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG_RENDER));
    } catch (e) {
      console.error("CubeWaterRenderer: shader init failed", e);
      return false;
    }

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.uStepState = gl.getUniformLocation(this.stepProg!, "u_state");
    this.uStepTexel = gl.getUniformLocation(this.stepProg!, "u_texel");
    this.uStepDamp = gl.getUniformLocation(this.stepProg!, "u_damping");
    this.uStepTailCutoff = gl.getUniformLocation(this.stepProg!, "u_tailCutoff");
    this.uDropState = gl.getUniformLocation(this.dropProg!, "u_state");
    this.uDropPos = gl.getUniformLocation(this.dropProg!, "u_dropPos");
    this.uDropRadius = gl.getUniformLocation(this.dropProg!, "u_dropRadius");
    this.uDropStrength = gl.getUniformLocation(this.dropProg!, "u_dropStrength");
    this.uRenderState = gl.getUniformLocation(this.renderProg!, "u_state");
    this.uRenderSource = gl.getUniformLocation(this.renderProg!, "u_source");
    this.uRenderCrop = gl.getUniformLocation(this.renderProg!, "u_crop");
    this.uRenderTexel = gl.getUniformLocation(this.renderProg!, "u_texel");
    this.uRenderDisp = gl.getUniformLocation(this.renderProg!, "u_disp");

    // Per-face resources.
    for (const f of this.faces) {
      f.texA = makeFloatTex(gl, SIM_RES, SIM_RES);
      f.texB = makeFloatTex(gl, SIM_RES, SIM_RES);
      f.fboA = gl.createFramebuffer();
      f.fboB = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fboA);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.texA, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fboB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.texB, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      f.sourceTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, f.sourceTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]),
      );

      if (f.src) this.loadImage(f);
    }

    this.initialized = true;
    return true;
  }

  private loadImage(f: FaceSlot) {
    if (!f.src) return;
    const optimizedSrc = f.src.startsWith("/")
      ? f.src
      : `/_next/image?url=${encodeURIComponent(f.src)}&w=1080&q=75`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (f.imgCancelled || this.destroyed || !this.gl || !f.sourceTex) return;
      try {
        this.gl.bindTexture(this.gl.TEXTURE_2D, f.sourceTex);
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
        this.gl.texImage2D(
          this.gl.TEXTURE_2D, 0, this.gl.RGBA8,
          this.gl.RGBA, this.gl.UNSIGNED_BYTE, img,
        );
        f.imgAR = img.naturalWidth / img.naturalHeight;
        f.imgReady = true;
      } catch (e) {
        console.warn("CubeWaterRenderer: texImage2D failed", e);
      }
    };
    img.onerror = () => {
      if (f.imgCancelled || this.destroyed) return;
    };
    img.src = optimizedSrc;
  }

  drop(faceIdx: number, xPct: number, yPct: number, strength = 0.45) {
    const f = this.faces[faceIdx];
    if (!f) return;
    f.drops.push({
      x: Math.max(0, Math.min(1, xPct / 100)),
      y: Math.max(0, Math.min(1, 1 - yPct / 100)),
      strength,
    });
  }

  setFaceCrop(faceIdx: number, fx: number, fy: number, zoom: number) {
    const f = this.faces[faceIdx];
    if (!f) return;
    f.fx = fx;
    f.fy = fy;
    f.zoom = zoom;
  }

  start() {
    if (!this.ensureInit()) return;
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private setupQuad() {
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  private tick = () => {
    if (!this.running || this.destroyed) return;
    const gl = this.gl;
    if (!gl) return;

    for (let i = 0; i < this.faces.length; i++) {
      const f = this.faces[i];
      if (!f.texA || !f.texB || !f.fboA || !f.fboB) continue;

      // 1. Apply queued drops.
      let read = f.pingPongFlip ? { tex: f.texB, fbo: f.fboB } : { tex: f.texA, fbo: f.fboA };
      let write = f.pingPongFlip ? { tex: f.texA, fbo: f.fboA } : { tex: f.texB, fbo: f.fboB };

      if (f.drops.length > 0) {
        gl.useProgram(this.dropProg);
        this.setupQuad();
        gl.viewport(0, 0, SIM_RES, SIM_RES);
        gl.uniform1i(this.uDropState, 0);
        gl.uniform1f(this.uDropRadius, DROP_RADIUS);
        for (const d of f.drops) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, read.tex);
          gl.uniform2f(this.uDropPos, d.x, d.y);
          gl.uniform1f(this.uDropStrength, d.strength);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          const swap = read; read = write; write = swap;
        }
        f.drops.length = 0;
      }

      // 2. One simulation step.
      gl.useProgram(this.stepProg);
      this.setupQuad();
      gl.viewport(0, 0, SIM_RES, SIM_RES);
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform1i(this.uStepState, 0);
      gl.uniform2f(this.uStepTexel, 1 / SIM_RES, 1 / SIM_RES);
      gl.uniform1f(this.uStepDamp, DAMPING);
      gl.uniform1f(this.uStepTailCutoff, TAIL_CUTOFF);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const swap = read; read = write; write = swap;

      // Track which tex is the latest "read" for this face.
      // Number of drops processed + 1 step toggles parity.
      // We just stored the final post-step state in `read.tex` after the swap.
      f.pingPongFlip = read.tex === f.texB;

      // 3. Render this face's tile to the atlas.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(i * TILE, 0, TILE, TILE);
      if (f.imgReady && f.sourceTex) {
        gl.useProgram(this.renderProg);
        this.setupQuad();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.tex);
        gl.uniform1i(this.uRenderState, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, f.sourceTex);
        gl.uniform1i(this.uRenderSource, 1);
        const faceAR = 1; // tile is square
        const [sx, sy, sw, sh] = computeCropUV(f.imgAR, faceAR, f.fx, f.fy, f.zoom);
        gl.uniform4f(this.uRenderCrop, sx, sy, sw, sh);
        gl.uniform2f(this.uRenderTexel, 1 / SIM_RES, 1 / SIM_RES);
        gl.uniform1f(this.uRenderDisp, DISPLACEMENT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        // Empty tile — leave whatever was there. Presenters check imgReady
        // to decide whether to drawImage at all.
      }
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  isFaceReady(faceIdx: number): boolean {
    return this.faces[faceIdx]?.imgReady ?? false;
  }

  /** Source rectangle in the atlas canvas for a given face. */
  faceSourceRect(faceIdx: number): { sx: number; sy: number; sw: number; sh: number } {
    return { sx: faceIdx * TILE, sy: 0, sw: TILE, sh: TILE };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    for (const f of this.faces) f.imgCancelled = true;

    const gl = this.gl;
    if (!gl) return;
    for (const f of this.faces) {
      if (f.texA) gl.deleteTexture(f.texA);
      if (f.texB) gl.deleteTexture(f.texB);
      if (f.sourceTex) gl.deleteTexture(f.sourceTex);
      if (f.fboA) gl.deleteFramebuffer(f.fboA);
      if (f.fboB) gl.deleteFramebuffer(f.fboB);
    }
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.stepProg) gl.deleteProgram(this.stepProg);
    if (this.dropProg) gl.deleteProgram(this.dropProg);
    if (this.renderProg) gl.deleteProgram(this.renderProg);
  }
}
