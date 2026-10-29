// Over the Edge: WebGL2 renderer. Lit meshes with a sun shadow map, a sky gradient,
// soft clouds and additive particles. The game hands it a list of draw items per frame.
(function () {
  "use strict";

  // The island size comes from the simulation (world.js loads first).
  var ISLAND_R = window.EdgeWorld ? window.EdgeWorld.R : 15;

  var M4 = {
    perspective: function (fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
    },
    ortho: function (l, r, b, t, n, f) {
      return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
    },
    lookAt: function (eye, at, up) {
      var z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
    },
    mul: function (a, b) {
      var o = new Array(16);
      for (var c = 0; c < 4; c++) {
        for (var r = 0; r < 4; r++) {
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    // Translation, yaw (around Y), then a tumble (around a horizontal axis), then scale.
    model: function (x, y, z, yaw, tumble, tumbleAxis, sx, sy, sz) {
      var q = quatYaw(yaw);
      if (tumble) q = qmul(q, quatAxis(tumbleAxis, tumble));
      return compose([x, y, z], q, [sx, sy, sz]);
    },
    compose: compose,
  };
  function quatYaw(a) { return [0, Math.sin(a / 2), 0, Math.cos(a / 2)]; }
  function quatAxis(axis, a) { var s = Math.sin(a / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)]; }
  function qmul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  }
  function compose(p, q, s) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [
      (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
      2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
      2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
      p[0], p[1], p[2], 1,
    ];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  // ---------------------------------------------------------------- shaders

  var LIT_VS = [
    "#version 300 es",
    "layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec3 aLocal;",
    "uniform mat4 uViewProj, uModel, uLight;",
    "out vec3 vWorld; out vec3 vNormal; out vec3 vLocal; out vec4 vShadow;",
    "void main() {",
    "  vec4 world = uModel * vec4(aPos, 1.0);",
    "  vWorld = world.xyz; vNormal = mat3(uModel) * aNormal; vLocal = aLocal;",
    "  vShadow = uLight * world; gl_Position = uViewProj * world;",
    "}",
  ].join("\n");

  var LIT_FS = [
    "#version 300 es",
    "precision highp float; precision highp sampler2DShadow;",
    "in vec3 vWorld; in vec3 vNormal; in vec3 vLocal; in vec4 vShadow;",
    "uniform vec3 uColor, uAccent, uSun, uEye, uFog; uniform int uMat; uniform float uFlash, uTime, uOverlay;",
    "uniform sampler2DShadow uShadowMap;",
    "out vec4 outColor;",
    "float shadow() {",
    "  if (uOverlay > 0.5) return 1.0;",
    "  vec3 p = vShadow.xyz / vShadow.w * 0.5 + 0.5;",
    "  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;",
    "  float s = 0.0; vec2 t = vec2(1.0 / 2048.0);",
    "  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += texture(uShadowMap, vec3(p.xy + vec2(i, j) * t * 1.5, p.z - 0.0012));",
    "  return s / 9.0;",
    "}",
    "void main() {",
    "  vec3 n = normalize(vNormal); vec3 base = uColor; vec3 glow = vec3(0.0);",
    "  vec3 a = abs(vLocal) * 2.0;",
    "  float edge = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));",
    "  if (uMat == 1 || uMat == 6 || uMat == 7) {", // crates: planks and darker edges
    "    float plank = abs(fract((vLocal.y + 0.5) * 3.0) - 0.5);",
    "    base *= mix(0.84, 1.0, smoothstep(0.0, 0.06, plank));",
    "    base *= mix(1.0, 0.5, smoothstep(0.8, 0.97, edge));",
    "  }",
    "  if (uMat == 6) {", // crate bot: two glowing eyes on its front (+z) face
    "    vec2 e = vec2(abs(vLocal.x) - 0.18, vLocal.y - 0.1);",
    "    float eye = smoothstep(0.1, 0.07, length(e)) * step(0.45, vLocal.z);",
    "    glow += uAccent * eye * (2.2 + uFlash * 3.0);",
    "  } else if (uMat == 7) {", // brute: a glowing visor stripe
    "    float stripe = smoothstep(0.08, 0.05, abs(vLocal.y - 0.12)) * step(0.45, vLocal.z) * step(abs(vLocal.x), 0.36);",
    "    glow += uAccent * stripe * (2.0 + uFlash * 3.0);",
    "  } else if (uMat == 2) {", // roller: a band that shows the spin
    "    float band = smoothstep(0.17, 0.12, abs(vLocal.y));",
    "    base = mix(base, uAccent * 0.6, band); glow += uAccent * band * 0.9;",
    "  } else if (uMat == 3) {", // island top: worn stone tiles
    "    vec2 g = abs(fract(vWorld.xz * 0.5) - 0.5);",
    "    float seam = smoothstep(0.47, 0.5, max(g.x, g.y));",
    "    float r = length(vWorld.xz);",
    "    base *= mix(1.0, 0.78, seam) * mix(0.92, 1.06, fract(sin(dot(floor(vWorld.xz * 0.5), vec2(12.9898, 78.233))) * 43758.5453));",
    "    glow += uAccent * smoothstep(0.35, 0.0, abs(r - " + (ISLAND_R - 0.3).toFixed(1) + ")) * (0.8 + 0.4 * sin(uTime * 2.0));",
    "  } else if (uMat == 4) {", // island underside: layered rock that fades into the void
    "    float layer = 0.9 + 0.1 * sin(vWorld.y * 4.0 + sin(atan(vWorld.z, vWorld.x) * 5.0) * 1.5);",
    "    base *= mix(0.55, 1.0, smoothstep(-9.0, 0.0, vWorld.y)) * layer;",
    "  }",
    "  if (uMat == 5) { outColor = vec4(pow(uColor, vec3(1.0 / 2.2)), 1.0); return; }",
    "  float sun = max(dot(n, -uSun), 0.0) * shadow();",
    "  vec3 sky = mix(vec3(0.2, 0.13, 0.17), vec3(0.42, 0.46, 0.62), n.y * 0.5 + 0.5);",
    "  vec3 color = base * (sky * 0.6 + vec3(1.0, 0.82, 0.62) * sun * 1.25) + glow;",
    // Golden-hour rim: silhouettes catch the low sun when you look towards it.
    "  vec3 v = normalize(uEye - vWorld);",
    "  color += vec3(1.0, 0.58, 0.32) * pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.22 * (0.4 + 0.6 * max(dot(-v, -uSun), 0.0));",
    "  color += vec3(1.0, 0.45, 0.25) * uFlash * 0.6;",
    "  float d = length(vWorld - uEye);",
    "  float below = smoothstep(-2.0, -30.0, vWorld.y);",
    "  color = mix(color, uFog, clamp(smoothstep(45.0, 140.0, d) + below * 0.85, 0.0, 1.0));",
    "  outColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);",
    "}",
  ].join("\n");

  var DEPTH_VS = "#version 300 es\nlayout(location=0) in vec3 aPos; uniform mat4 uLight, uModel;\nvoid main() { gl_Position = uLight * uModel * vec4(aPos, 1.0); }";
  var DEPTH_FS = "#version 300 es\nprecision mediump float;\nvoid main() {}";

  var SKY_VS = "#version 300 es\nout vec2 vUv;\nvoid main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.9999, 1.0); }";
  var SKY_FS = [
    "#version 300 es",
    "precision highp float; in vec2 vUv; uniform mat4 uInvViewProj; uniform vec3 uSunDir; uniform float uTime; out vec4 outColor;",
    "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float noise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }",
    "float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }",
    // Golden hour above a sea of clouds: the side of the sky towards the sun burns amber.
    "void main() {",
    "  vec4 p = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 d = normalize(p.xyz / p.w);",
    "  vec3 toSun = -uSunDir; float sun = max(dot(d, toSun), 0.0);",
    "  float side = max(dot(normalize(d.xz + 1e-4), normalize(toSun.xz)), 0.0);",
    "  vec3 top = vec3(0.03, 0.04, 0.11), mid = vec3(0.2, 0.15, 0.32);",
    "  vec3 horizon = mix(vec3(0.62, 0.32, 0.4), vec3(1.0, 0.6, 0.32), side * side);",
    "  vec3 c = mix(mid, top, pow(max(d.y, 0.0), 0.5));",
    "  c = mix(c, horizon, exp(-max(d.y, 0.0) * 6.0) * 0.9);",
    "  if (d.y < 0.0) {",
    "    float cl = smoothstep(0.35, 0.8, fbm(d.xz / max(-d.y, 0.03) * 1.6 + vec2(uTime * 0.01, 0.0)));",
    "    vec3 sea = mix(vec3(0.22, 0.14, 0.22), mix(vec3(0.75, 0.45, 0.45), vec3(1.0, 0.7, 0.45), side), cl);",
    "    c = mix(horizon, sea, smoothstep(0.0, 0.25, -d.y));",
    "  }",
    "  c += vec3(1.0, 0.78, 0.5) * pow(sun, 400.0) * 4.0 + vec3(1.0, 0.55, 0.3) * pow(sun, 12.0) * 0.35 + vec3(1.0, 0.5, 0.35) * pow(sun, 3.0) * 0.08;",
    "  vec2 sp = floor(d.xz / max(d.y, 0.05) * 60.0); float star = step(0.9988, hash(sp)) * smoothstep(0.35, 0.7, d.y);",
    "  c += vec3(star) * (0.6 + 0.4 * sin(uTime * 3.0 + sp.x));",
    "  outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);",
    "}",
  ].join("\n");

  var PART_VS = [
    "#version 300 es",
    "layout(location=0) in vec3 aPos; layout(location=1) in vec4 aColor; layout(location=2) in vec2 aUv;",
    "uniform mat4 uViewProj; out vec4 vColor; out vec2 vUv;",
    "void main() { vColor = aColor; vUv = aUv; gl_Position = uViewProj * vec4(aPos, 1.0); }",
  ].join("\n");
  var PART_FS = [
    "#version 300 es",
    "precision mediump float; in vec4 vColor; in vec2 vUv; out vec4 outColor;",
    "void main() { float r = length(vUv * 2.0 - 1.0); float a = smoothstep(1.0, 0.0, r); outColor = vec4(vColor.rgb * a * vColor.a, a * vColor.a); }",
  ].join("\n");

  function program(gl, vs, fs) {
    function shader(type, source) {
      var s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }

  // ---------------------------------------------------------------- meshes (position, normal, local)

  function mesh(gl, data, indices) {
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    for (var a = 0; a < 3; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 36, a * 12);
    }
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao: vao, count: indices.length };
  }

  function cube() {
    var d = [], idx = [];
    var faces = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    faces.forEach(function (f, i) {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
        var p = [0, 1, 2].map(function (k) { return (f[0][k] + f[1][k] * c[0] + f[2][k] * c[1]) * 0.5; });
        d.push(p[0], p[1], p[2], f[0][0], f[0][1], f[0][2], p[0], p[1], p[2]);
      });
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    return [d, idx];
  }

  function sphere(rings, segs) {
    var d = [], idx = [];
    for (var r = 0; r <= rings; r++) {
      var phi = (r / rings) * Math.PI;
      for (var s = 0; s <= segs; s++) {
        var th = (s / segs) * Math.PI * 2;
        var p = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
        d.push(p[0], p[1], p[2], p[0], p[1], p[2], p[0], p[1], p[2]);
      }
    }
    for (r = 0; r < rings; r++) {
      for (s = 0; s < segs; s++) {
        var a = r * (segs + 1) + s, b = a + segs + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return [d, idx];
  }

  // Unit cylinder: radius 1, from y = -0.5 to 0.5, with caps.
  function cylinder(segs) {
    var d = [], idx = [];
    for (var s = 0; s <= segs; s++) {
      var th = (s / segs) * Math.PI * 2, c = Math.cos(th), n = Math.sin(th);
      d.push(c, -0.5, n, c, 0, n, c, -0.5, n);
      d.push(c, 0.5, n, c, 0, n, c, 0.5, n);
    }
    for (s = 0; s < segs; s++) {
      var a = s * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    [0.5, -0.5].forEach(function (y) {
      var center = d.length / 9;
      d.push(0, y, 0, 0, Math.sign(y), 0, 0, y, 0);
      for (var k = 0; k <= segs; k++) {
        var t = (k / segs) * Math.PI * 2;
        d.push(Math.cos(t), y, Math.sin(t), 0, Math.sign(y), 0, Math.cos(t), y, Math.sin(t));
      }
      for (k = 0; k < segs; k++) {
        if (y > 0) idx.push(center, center + k + 2, center + k + 1);
        else idx.push(center, center + k + 1, center + k + 2);
      }
    });
    return [d, idx];
  }

  // The island: a flat top disc and a rough cone of rock underneath.
  function island(radius, segs) {
    var d = [], idx = [];
    var center = 0;
    d.push(0, 0, 0, 0, 1, 0, 0, 0, 0);
    for (var s = 0; s <= segs; s++) {
      var th = (s / segs) * Math.PI * 2;
      d.push(Math.cos(th) * radius, 0, Math.sin(th) * radius, 0, 1, 0, 0, 0, 0);
    }
    for (s = 0; s < segs; s++) idx.push(center, center + s + 2, center + s + 1);
    var top = { data: d, idx: idx };
    // Underside rings with a bit of noise.
    var rock = [], ridx = [];
    var rings = [[radius, 0], [radius * 0.97, -0.8], [radius * 0.8, -2.6], [radius * 0.55, -5.5], [radius * 0.28, -8.5], [0.6, -11.5]];
    function noise(i, k) { return Math.sin(i * 12.9898 + k * 78.233) * 43758.5453 % 1; }
    rings.forEach(function (ring, k) {
      for (var i = 0; i <= segs; i++) {
        var th = (i / segs) * Math.PI * 2;
        var jitter = k === 0 ? 0 : (Math.abs(noise(i % segs, k)) - 0.5) * 0.9;
        var r = ring[0] + jitter;
        rock.push(Math.cos(th) * r, ring[1] + (k ? jitter * 0.5 : 0), Math.sin(th) * r, Math.cos(th), 0.35, Math.sin(th), 0, 0, 0);
      }
    });
    for (var k = 0; k + 1 < rings.length; k++) {
      for (var i = 0; i < segs; i++) {
        var a = k * (segs + 1) + i, b = a + segs + 1;
        ridx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return { top: [top.data, top.idx], rock: [rock, ridx] };
  }

  // ---------------------------------------------------------------- renderer

  function create(canvas) {
    var gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) return null;
    var lit = program(gl, LIT_VS, LIT_FS);
    var depth = program(gl, DEPTH_VS, DEPTH_FS);
    var sky = program(gl, SKY_VS, SKY_FS);
    var part = program(gl, PART_VS, PART_FS);
    var isl = island(ISLAND_R, 84);
    var meshes = {
      cube: mesh(gl, cube()[0], cube()[1]),
      sphere: mesh(gl, sphere(18, 28)[0], sphere(18, 28)[1]),
      cylinder: mesh(gl, cylinder(28)[0], cylinder(28)[1]),
      islandTop: mesh(gl, isl.top[0], isl.top[1]),
      islandRock: mesh(gl, isl.rock[0], isl.rock[1]),
    };
    var skyVao = gl.createVertexArray();

    var SHADOW = 2048;
    var shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var SUN = norm([0.66, -0.42, 0.62]); // a low sun: long shadows, warm light
    var lightMat = M4.mul(M4.ortho(-20, 20, -20, 20, 1, 60), M4.lookAt([-SUN[0] * 30, -SUN[1] * 30, -SUN[2] * 30], [0, 0, 0], [0, 1, 0]));

    // Particles: one dynamic buffer of camera-facing quads (position, rgba, uv).
    var MAX_PART = 1400;
    var partData = new Float32Array(MAX_PART * 4 * 9);
    var partVao = gl.createVertexArray();
    gl.bindVertexArray(partVao);
    var partVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, partVbo);
    gl.bufferData(gl.ARRAY_BUFFER, partData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 28);
    var partIdx = new Uint32Array(MAX_PART * 6);
    for (var i = 0; i < MAX_PART; i++) partIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    var partIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, partIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, partIdx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    var view = { w: 1, h: 1 };
    function resize(scale) {
      var dpr = Math.min(window.devicePixelRatio || 1, 2) * (scale || 1);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      view.w = w; view.h = h;
    }

    function drawItems(prog, items, isDepth) {
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        if (isDepth && it.noShadow) continue;
        gl.uniformMatrix4fv(prog.u.uModel, false, it.model);
        if (!isDepth) {
          gl.uniform1i(prog.u.uMat, it.mat || 0);
          gl.uniform3fv(prog.u.uColor, it.color);
          gl.uniform3fv(prog.u.uAccent, it.accent || [1, 0.66, 0.22]);
          gl.uniform1f(prog.u.uFlash, it.flash || 0);
        }
        var m = meshes[it.mesh];
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }
    }

    // frame: { eye, at, fov, items, overlay (camera-space items), particles, time }
    function render(frame) {
      var aspect = view.w / view.h;
      var proj = M4.perspective(frame.fov, aspect, 0.05, 400);
      var viewM = M4.lookAt(frame.eye, frame.at, [0, 1, 0]);
      var viewProj = M4.mul(proj, viewM);

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo);
      gl.viewport(0, 0, SHADOW, SHADOW);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depth.p);
      gl.uniformMatrix4fv(depth.u.uLight, false, lightMat);
      drawItems(depth, frame.items, true);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, view.w, view.h);
      gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

      // Sky behind everything.
      gl.depthMask(false);
      gl.useProgram(sky.p);
      gl.uniformMatrix4fv(sky.u.uInvViewProj, false, invert(M4.mul(proj, rotationOnly(viewM))));
      gl.uniform3fv(sky.u.uSunDir, SUN);
      gl.uniform1f(sky.u.uTime, frame.time);
      gl.bindVertexArray(skyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);

      gl.useProgram(lit.p);
      gl.uniformMatrix4fv(lit.u.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(lit.u.uLight, false, lightMat);
      gl.uniform3fv(lit.u.uSun, SUN);
      gl.uniform3fv(lit.u.uEye, frame.eye);
      gl.uniform3fv(lit.u.uFog, [0.3, 0.2, 0.27]);
      gl.uniform1f(lit.u.uTime, frame.time);
      gl.uniform1f(lit.u.uOverlay, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, shadowTex);
      gl.uniform1i(lit.u.uShadowMap, 0);
      drawItems(lit, frame.items, false);

      if (frame.particles && frame.particles.count) drawParticles(frame.particles, viewProj, frame.eye, viewM);

      // The weapon in camera space, over the world.
      if (frame.overlay && frame.overlay.length) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(lit.u.uViewProj, false, proj);
        gl.uniform3fv(lit.u.uEye, [0, 0, 0]);
        gl.uniform1f(lit.u.uOverlay, 1);
        drawItems(lit, frame.overlay, false);
      }
    }

    function drawParticles(ps, viewProj, eye, viewM) {
      // Camera right and up from the view matrix rows.
      var right = [viewM[0], viewM[4], viewM[8]], up = [viewM[1], viewM[5], viewM[9]];
      var n = Math.min(ps.count, MAX_PART), o = 0;
      for (var i = 0; i < n; i++) {
        var b = i * 8, x = ps.data[b], y = ps.data[b + 1], z = ps.data[b + 2], s = ps.data[b + 3];
        var r = ps.data[b + 4], g = ps.data[b + 5], bl = ps.data[b + 6], a = ps.data[b + 7];
        for (var c = 0; c < 4; c++) {
          var u = c === 1 || c === 2 ? 1 : -1, v = c >= 2 ? 1 : -1;
          partData[o++] = x + (right[0] * u + up[0] * v) * s;
          partData[o++] = y + (right[1] * u + up[1] * v) * s;
          partData[o++] = z + (right[2] * u + up[2] * v) * s;
          partData[o++] = r; partData[o++] = g; partData[o++] = bl; partData[o++] = a;
          partData[o++] = (u + 1) / 2; partData[o++] = (v + 1) / 2;
        }
      }
      gl.useProgram(part.p);
      gl.uniformMatrix4fv(part.u.uViewProj, false, viewProj);
      gl.bindVertexArray(partVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, partVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, partData, 0, o);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_INT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.useProgram(lit.p);
    }

    return { gl: gl, resize: resize, render: render, M4: M4, view: view };
  }

  function rotationOnly(m) {
    var r = m.slice();
    r[12] = 0; r[13] = 0; r[14] = 0;
    return r;
  }

  // General 4x4 inverse (column-major).
  function invert(m) {
    var inv = new Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    det = det ? 1 / det : 0;
    for (var i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  }

  window.EdgeRender = { create: create, M4: M4 };
})();
