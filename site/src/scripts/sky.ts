// The page's sky: one dithered cloud field behind every section, drawn in WebGL. Each section names
// a scene with data-sky (noon, haze, clear, night, dusk). As a section's top climbs past the lower
// part of the screen the field's palette and cloud shape blend into its scene, so the page runs
// through one day. The tone (light words or dark words) flips half way through each blend.
//
// Two passes: the clouds are worked out once per dot cell into a small texture (the dither decides
// which cells take the next colour up), then the full-size pass draws each cell as a round-cornered
// dot. Without WebGL the body takes the scene's middle colour; with reduced motion the clouds hold
// still and only the colours change.

type Scene = { pal: [string, string, string, string]; cover: number; contrast: number; scale: number; band: number; calm?: number; tone: "dark" | "light" };

export const SCENES: Record<string, Scene> = {
  // cobalt sky, white clouds gathering low under the hero's window
  noon: { pal: ["#1846c9", "#2a62ea", "#6f9bff", "#eef4ff"], cover: -0.02, contrast: 1.7, scale: 1.5, band: 0.5, calm: 0.32, tone: "dark" },
  // pale haze for the chapters: almost all light, a few blue dots drifting
  haze: { pal: ["#c4d7ff", "#dce8ff", "#edf3ff", "#fafcff"], cover: 0.04, contrast: 1.5, scale: 1.2, band: 0.0, tone: "light" },
  // a clear white sky for safety
  clear: { pal: ["#d3e2ff", "#e9f0ff", "#f7f9ff", "#ffffff"], cover: 0.16, contrast: 1.4, scale: 1.0, band: -0.1, tone: "light" },
  // night for the install prompt: deep ink, faint cloud, a few bright dots
  night: { pal: ["#0a1531", "#12244c", "#1d3c86", "#7ea6ff"], cover: -0.2, contrast: 1.9, scale: 1.9, band: -0.2, tone: "dark" },
  // morning after the night, for the questions
  dawn: { pal: ["#c9d9ff", "#e1eaff", "#f2f6ff", "#ffffff"], cover: 0.06, contrast: 1.5, scale: 1.3, band: 0.15, tone: "light" },
  // the close: cobalt again, the clouds lower and heavier, never lighter than a mid blue under white words
  dusk: { pal: ["#143ab0", "#2152d8", "#3f70f0", "#6f97ff"], cover: 0.02, contrast: 1.8, scale: 1.3, band: 0.5, tone: "dark" },
};

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

// pass 1, one fragment per dot cell: the cloud value, cut into four levels by an 8x8 ordered dither
const CLOUDS = `precision highp float;
uniform vec2 uGrid; uniform float uTime; uniform float uScroll; uniform float uScale; uniform float uCover; uniform float uContrast; uniform float uBand; uniform float uCalm;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++){ v += a * n(p); p = r * p * 2.03 + 11.7; a *= 0.5; } return v; }
float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float b8(vec2 a){ return (b2(0.25*a)*0.25 + b2(0.5*a))*0.25 + b2(a); }
void main(){
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 uv = (cell + 0.5) / uGrid.y;                   // square units, 1 = the screen's height
  float y = (cell.y + 0.5) / uGrid.y;                  // 0 at the bottom of the screen, 1 at the top
  vec2 p = uv * uScale + vec2(uTime * 0.018, -uScroll * 0.22 * uScale);
  vec2 w = vec2(fbm(p + vec2(0.0, uTime * 0.01)), fbm(p + vec2(5.2, 1.3) - uTime * 0.012));
  float v = fbm(p + 1.4 * w);
  v = (v - 0.5) * uContrast + 0.5 + uCover + uBand * (0.55 - y);
  // a calm, wide oval at the top centre where a scene sets its headline
  vec2 cc = vec2(0.5 * uGrid.x / uGrid.y, 0.74);
  float k = length((uv - cc) * vec2(0.5, 1.25)) / 0.42;
  v -= uCalm * exp(-k * k);
  float lv = clamp(v, 0.0, 0.999) * 3.0;
  float base = floor(lv);
  float on = step(b8(cell), fract(lv));
  gl_FragColor = vec4(base / 3.0, on, 0.0, 1.0);
}`;

// pass 2, every screen pixel: its cell's level, drawn as a dot of the next colour up on the level's own colour
const DOTS = `precision highp float;
uniform sampler2D uLevels; uniform vec2 uGrid; uniform float uCell; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
vec3 pal(float i){ return i < 0.5 ? uC0 : i < 1.5 ? uC1 : i < 2.5 ? uC2 : uC3; }
void main(){
  vec2 g = gl_FragCoord.xy / uCell;
  vec4 L = texture2D(uLevels, (floor(g) + 0.5) / uGrid);
  float base = floor(L.r * 3.0 + 0.5);
  vec2 q = abs(fract(g) - 0.5);
  float d = length(max(q - 0.18, 0.0)) + min(max(q.x, q.y) - 0.18, 0.0);   // a rounded square
  float m = 1.0 - smoothstep(0.2 - 0.7 / uCell, 0.2 + 0.7 / uCell, d);
  gl_FragColor = vec4(mix(pal(base), pal(min(base + 1.0, 3.0)), L.g * m), 1.0);
}`;

type Stop = { el: HTMLElement; scene: Scene };

export function setupSky(): void {
  const html = document.documentElement;
  const stops: Stop[] = [...document.querySelectorAll<HTMLElement>("[data-sky]")]
    .map((el) => ({ el, scene: SCENES[el.dataset.sky ?? ""] }))
    .filter((s) => s.scene);
  if (!stops.length) return;
  const reducedQ = matchMedia("(prefers-reduced-motion: reduce)");

  // where the page is in its day: the two scenes either side of the screen's middle and the blend
  let tops: number[] = [];
  const measure = () => { tops = stops.map((s) => s.el.getBoundingClientRect().top + scrollY); };
  const blend = () => {
    const probe = scrollY + innerHeight * 0.5;
    const zone = innerHeight * 0.32;
    let i = 0;
    while (i < stops.length - 1 && tops[i + 1] - zone <= probe) i++;
    // between stop i-1 and stop i while stop i's top is within the zone under the middle
    if (i > 0 && tops[i] > probe) return { a: stops[i - 1].scene, b: stops[i].scene, t: smooth(clamp01(1 - (tops[i] - probe) / zone)) };
    return { a: stops[i].scene, b: stops[i].scene, t: 0 };
  };

  let tone = "";
  const setTone = (next: string) => {
    if (next === tone) return;
    tone = next;
    html.dataset.tone = next;
  };

  const canvas = document.createElement("canvas");
  canvas.className = "tm-sky";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power" });

  const paint = (a: Scene, b: Scene, t: number) => {
    const c = hex(a.pal[1]).map((x, k) => mix(x, hex(b.pal[1])[k], t));
    html.style.setProperty("--sky-mid", `rgb(${c.map((x) => Math.round(x * 255)).join(" ")})`);
    setTone(t < 0.5 ? a.tone : b.tone);
  };

  if (!gl) {
    // no WebGL: the scene's middle colour on the body, the tone still following
    html.classList.add("has-sky", "sky-flat");
    const flat = () => { const { a, b, t } = blend(); paint(a, b, t); };
    measure(); flat();
    addEventListener("scroll", flat, { passive: true });
    addEventListener("resize", () => { measure(); flat(); }, { passive: true });
    return;
  }

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const program = (frag: string) => {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    return p;
  };
  let clouds: WebGLProgram, dots: WebGLProgram;
  try {
    clouds = program(CLOUDS);
    dots = program(DOTS);
  } catch {
    return;   // a refused shader: the page keeps its plain grounds
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fbo = gl.createFramebuffer();
  const u = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
  const U = {
    grid: u(clouds, "uGrid"), time: u(clouds, "uTime"), scroll: u(clouds, "uScroll"), scale: u(clouds, "uScale"),
    cover: u(clouds, "uCover"), contrast: u(clouds, "uContrast"), band: u(clouds, "uBand"), calm: u(clouds, "uCalm"),
    dGrid: u(dots, "uGrid"), cell: u(dots, "uCell"), levels: u(dots, "uLevels"),
    c: [u(dots, "uC0"), u(dots, "uC1"), u(dots, "uC2"), u(dots, "uC3")],
  };

  let W = 0, H = 0, GW = 0, GH = 0, cellPx = 0;
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const css = innerWidth < 640 ? 3.5 : 4;   // one dot cell, in CSS pixels
    W = Math.round(innerWidth * dpr);
    H = Math.round(innerHeight * dpr);
    cellPx = css * dpr;
    GW = Math.ceil(W / cellPx);
    GH = Math.ceil(H / cellPx);
    canvas.width = W;
    canvas.height = H;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    measure();
  };

  const start = performance.now();
  // a frozen clock under reduced motion; otherwise the clouds keep drifting
  let held = 0;
  const draw = (now: number) => {
    const { a, b, t } = blend();
    paint(a, b, t);
    const time = reducedQ.matches ? held : (held = (now - start) / 1000);
    gl.useProgram(clouds);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, GW, GH);
    gl.uniform2f(U.grid, GW, GH);
    gl.uniform1f(U.time, time);
    gl.uniform1f(U.scroll, reducedQ.matches ? 0 : scrollY / innerHeight);
    gl.uniform1f(U.scale, mix(a.scale, b.scale, t));
    gl.uniform1f(U.cover, mix(a.cover, b.cover, t));
    gl.uniform1f(U.contrast, mix(a.contrast, b.contrast, t));
    gl.uniform1f(U.band, mix(a.band, b.band, t));
    gl.uniform1f(U.calm, mix(a.calm ?? 0, b.calm ?? 0, t));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(dots);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(U.levels, 0);
    gl.uniform2f(U.dGrid, GW, GH);
    gl.uniform1f(U.cell, cellPx);
    U.c.forEach((loc, k) => { const x = hex(a.pal[k]), y = hex(b.pal[k]); gl.uniform3f(loc, mix(x[0], y[0], t), mix(x[1], y[1], t), mix(x[2], y[2], t)); });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // the clouds drift at about 30 frames a second; a scroll draws at once
  let raf = 0, last = 0, dirty = true;
  const loop = (now: number) => {
    raf = 0;
    if (document.hidden) return;
    if (dirty || (!reducedQ.matches && now - last > 33)) { last = now; dirty = false; draw(now); }
    if (!reducedQ.matches) raf = requestAnimationFrame(loop);
  };
  const kick = () => { dirty = true; if (!raf) raf = requestAnimationFrame(loop); };

  document.body.prepend(canvas);
  html.classList.add("has-sky");
  resize();
  draw(performance.now());
  kick();
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", () => { resize(); kick(); }, { passive: true });
  document.addEventListener("visibilitychange", kick);
  reducedQ.addEventListener?.("change", kick);
  // the pinned chapters and the web fonts change the page's height after the first paint
  new ResizeObserver(() => { measure(); kick(); }).observe(document.body);
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; html.classList.add("sky-flat"); canvas.remove(); });
}
