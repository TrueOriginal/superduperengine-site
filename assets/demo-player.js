// Hero demos of superduperengine.top: a small WebGL2 renderer that plays back recordings of real engine runs.
// Data: window.SDE_DEMOS (assets/demos.js, written by tools/site-bake-demo.ts) when present, else the slide of
// window.SDE_DEMO (assets/demo-data.js), adapted below. Nothing here simulates: every pose comes from the engine.
// SDEPlayer.collect(lang) -> demos; SDEPlayer.mount(canvas, { demos, light, paused, onState, onShow, onProgress }) -> controller or null.
(function () {
  "use strict";

  // ------------------------------------------------------------------ math (column-major 4x4)
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function ortho(l, r, b, t, n, f) {
    return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lookAt(eye, at, up) {
    var z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function compose(p, q, s) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return [
      (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + w * z) * s[0], 2 * (x * z - w * y) * s[0], 0,
      2 * (x * y - w * z) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + w * x) * s[1], 0,
      2 * (x * z + w * y) * s[2], 2 * (y * z - w * x) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
      p[0], p[1], p[2], 1,
    ];
  }
  function project(m, p) {
    var x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return w > 0 ? [x / w, y / w] : null;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function poseLerp(a, b, t) {
    var q = [b[3], b[4], b[5], b[6]];
    if (a[3] * q[0] + a[4] * q[1] + a[5] * q[2] + a[6] * q[3] < 0) q = q.map(function (v) { return -v; });
    var r = [lerp(a[3], q[0], t), lerp(a[4], q[1], t), lerp(a[5], q[2], t), lerp(a[6], q[3], t)];
    var l = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), r[0] / l, r[1] / l, r[2] / l, r[3] / l];
  }
  function linear(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) { return Math.pow(c / 255, 2.2); });
  }

  // ------------------------------------------------------------------ the slide of demo-data.js as a generic demo
  var TEXT = {
    ru: {
      slide: "Горка", test: "Тест {n}: шар должен сбить пирамиду", hit: "Шар врезался в пирамиду",
      pass: "Прошёл: упало {d} из {t} ящиков", miss: "Не прошёл: шар не долетел, ящики стоят", fail: "Не прошёл: упало {d} из {t}",
      change: "Агент поднял горку: высота {a} → {b} м", back: "Сначала",
    },
    en: {
      slide: "Slide", test: "Test {n}: the ball must knock the pyramid down", hit: "The ball hits the pyramid",
      pass: "Passed: {d} of {t} crates fell", miss: "Failed: the ball fell short, the crates stand", fail: "Failed: {d} of {t} fell",
      change: "The agent raised the slide: height {a} → {b} m", back: "From the start",
    },
  };
  function fill(s, v) { return s.replace(/\{(\w+)\}/g, function (_, k) { return String(v[k]); }); }
  function num(v, lang) { return lang === "ru" ? String(v).replace(".", ",") : String(v); }

  function adaptSlide(D, lang) {
    var T = TEXT[lang] || TEXT.en, S = D.slide, L = D.lip, P = D.plinth;
    function point(h, len, s) { return [-len + s * len, h * (1 - s) * (1 - s)]; }
    // The engine simulates the chute as tilted boxes between these profile points; the page draws the same
    // profile as one smooth chute, so no facets show. The deck's underside stays above the floor.
    function fine(h, len) {
      var pts = [], n = 72, m = 24;
      for (var i = 0; i <= n; i++) pts.push(point(h, len, i / n));
      for (var k = 1; k <= m; k++) { var x = (k / m) * L.length; pts.push([x, L.height * (x / L.length) * (x / L.length)]); }
      return pts;
    }
    function statics(run) {
      var out = [{ id: "floor", shape: "box", size: [160, 0.5, 120], role: "ground", pose: [0, -0.25, 0, 0, 0, 0, 1] }];
      out.push({ id: "chute", shape: "chute", role: "ground", pose: [0, 0, 0, 0, 0, 0, 1], profile: fine(run.height, run.length),
        width: S.width, thickness: S.thickness, rail: S.rail, railThickness: S.railThickness, lift: S.lift });
      if (P.height > 0) out.push({ id: "plinth", shape: "box", size: [P.width, P.height, P.depth], role: "ground", pose: [D.pyramidX + P.width / 2 - 0.1, P.height / 2, 0, 0, 0, 0, 1] });
      return out;
    }
    var crates = D.runs[0].crates.length;
    var dynamics = [{ id: "ball", shape: "sphere", radius: D.ball.radius, role: "actor" }];
    for (var c = 0; c < crates; c++) dynamics.push({ id: "crate_" + c, shape: "box", size: [D.crate.size, D.crate.size, D.crate.size], role: "prop" });
    var runs = D.runs.map(function (r, i) {
      var frames = [];
      for (var f = 0; f < r.frames; f++) {
        var row = r.ball.slice(f * 7, f * 7 + 7);
        r.crates.forEach(function (track) { row = row.concat(track.slice(f * 7, f * 7 + 7)); });
        frames.push(row);
      }
      var hit = -1;
      for (var g = 1; g < r.frames && hit < 0; g++) {
        for (var k = 0; k < crates; k++) {
          var t0 = r.crates[k], d = Math.hypot(t0[g * 7] - t0[0], t0[g * 7 + 1] - t0[1]);
          if (d > 0.04) { hit = g; break; }
        }
      }
      var events = [];
      if (hit > 0) events.push({ t: hit / D.fps, kind: "hit", text: T.hit });
      var passed = r.down * 2 >= crates;
      var result = passed ? fill(T.pass, { d: r.down, t: crates }) : r.moved ? fill(T.fail, { d: r.down, t: crates }) : T.miss;
      events.push({ t: (r.frames - 1) / D.fps, kind: passed ? "pass" : "fail", text: result });
      var prev = D.runs[i - 1];
      return {
        name: r.name, label: fill(T.test, { n: i + 1 }), frames: frames, events: events, objects: statics(r).concat(dynamics),
        change: prev ? fill(T.change, { a: num(prev.height, lang), b: num(r.height, lang) }) : "",
      };
    });
    return { id: "slide", title: T.slide, fps: D.fps, tickRate: 60, camera: { eye: [-1.5, 4.2, 11.0], target: [-1.2, 1.55, 0], fov: 33 }, runs: runs };
  }

  // W1 shapes are tagged: { box: size }, { sphere: radius }, { capsule | cylinder | chute: { fields } }.
  function untag(o) {
    var kind = Object.keys(o.shape)[0], v = o.shape[kind], out = { id: o.id, shape: kind, role: o.role, pose: o.pose };
    if (kind === "box") out.size = v;
    else if (kind === "sphere") out.radius = v;
    else Object.keys(v).forEach(function (k) { out[k] = v[k]; });
    return out;
  }
  function pick(v, lang) { return v && typeof v === "object" ? v[lang] || v.en || "" : v || ""; }
  function collect(lang) {
    var out = [];
    if (window.SDE_DEMOS && window.SDE_DEMOS.demos) {
      window.SDE_DEMOS.demos.forEach(function (d) {
        out.push({
          id: d.id, title: pick(d.title, lang), fps: d.fps, tickRate: d.tickRate || 60, camera: d.camera,
          runs: d.runs.map(function (r) {
            return {
              name: r.name, label: pick(r.label, lang), frames: r.frames, change: pick(r.change, lang), objects: (r.objects || d.objects).map(untag),
              events: (r.events || []).map(function (e) { return { t: e.t, kind: e.kind, text: pick(e.text, lang) }; }),
            };
          }),
        });
      });
    } else if (window.SDE_DEMO) {
      out.push(adaptSlide(window.SDE_DEMO, lang));
    }
    return out;
  }

  // ------------------------------------------------------------------ meshes
  function boxData() {
    var pos = [], nrm = [], loc = [], idx = [];
    var faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
    faces.forEach(function (f) {
      var base = pos.length / 3;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
        var p = [0, 1, 2].map(function (k) { return (f[0][k] + f[1][k] * c[0] + f[2][k] * c[1]) * 0.5; });
        pos.push(p[0], p[1], p[2]); nrm.push(f[0][0], f[0][1], f[0][2]); loc.push(p[0], p[1], p[2]);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return { pos: pos, nrm: nrm, loc: loc, idx: idx };
  }
  // A capsule (hc > 0) or a sphere (hc = 0) of radius r: latitude rings, the equator doubled for the cylinder.
  function roundData(r, hc, rings, segs) {
    var pos = [], nrm = [], loc = [], idx = [], rows = [];
    for (var i = 0; i <= rings; i++) {
      var th = (i / rings) * Math.PI;
      rows.push({ th: th, dy: th <= Math.PI / 2 ? hc : -hc });
      if (hc > 0 && i === rings / 2) rows.push({ th: th, dy: -hc });
    }
    var total = r + hc;
    rows.forEach(function (row) {
      for (var j = 0; j <= segs; j++) {
        var ph = (j / segs) * Math.PI * 2, n = [Math.sin(row.th) * Math.cos(ph), Math.cos(row.th), Math.sin(row.th) * Math.sin(ph)];
        var p = [n[0] * r, n[1] * r + row.dy, n[2] * r];
        pos.push(p[0], p[1], p[2]); nrm.push(n[0], n[1], n[2]); loc.push(n[0] * 0.5, (p[1] / total) * 0.5, n[2] * 0.5);
      }
    });
    for (var a = 0; a + 1 < rows.length; a++) for (var b = 0; b < segs; b++) {
      var i0 = a * (segs + 1) + b, i1 = i0 + segs + 1;
      idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
    return { pos: pos, nrm: nrm, loc: loc, idx: idx };
  }
  function cylinderData(segs) {
    var pos = [], nrm = [], loc = [], idx = [];
    for (var j = 0; j <= segs; j++) {
      var ph = (j / segs) * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph);
      pos.push(c, -0.5, s, c, 0.5, s); nrm.push(c, 0, s, c, 0, s); loc.push(c * 0.5, -0.5, s * 0.5, c * 0.5, 0.5, s * 0.5);
      if (j < segs) { var k = j * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
    }
    [-0.5, 0.5].forEach(function (y) {
      var center = pos.length / 3;
      pos.push(0, y, 0); nrm.push(0, Math.sign(y), 0); loc.push(0, y, 0);
      for (var j = 0; j <= segs; j++) {
        var ph = (j / segs) * Math.PI * 2;
        pos.push(Math.cos(ph), y, Math.sin(ph)); nrm.push(0, Math.sign(y), 0); loc.push(Math.cos(ph) * 0.5, y, Math.sin(ph) * 0.5);
        if (j < segs) idx.push(center, center + 1 + j, center + 2 + j);
      }
    });
    return { pos: pos, nrm: nrm, loc: loc, idx: idx };
  }

  function chuteData(o) {
    var pts = o.profile, w = o.width / 2, T = o.thickness, R = o.rail, rt = o.railThickness, lift = o.lift;
    // Cross-section outline as (side z, offset v along the normal), counter-clockwise.
    var sec = [[-w, -T], [w, -T], [w, R], [w - rt, R], [w - rt, 0], [-w + rt, 0], [-w + rt, R], [-w, R]];
    var pos = [], nrm = [], loc = [], idx = [], frames = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      frames.push({ p: [pts[i][0], pts[i][1] + lift], t: [tx / tl, ty / tl], n: [-ty / tl, tx / tl] });
    }
    function at(f, c) { return [f.p[0] + f.n[0] * c[1], f.p[1] + f.n[1] * c[1], c[0]]; }
    for (var e = 0; e < sec.length; e++) {
      var c0 = sec[e], c1 = sec[(e + 1) % sec.length];
      for (var j = 0; j < frames.length; j++) {
        var f = frames[j], dz = c1[0] - c0[0], dv = c1[1] - c0[1];
        // Outward normal of this edge: the edge direction in the (normal, z) plane turned by -90 degrees.
        var nn = [f.n[0] * -dz, f.n[1] * -dz, dv], l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        [c0, c1].forEach(function (c) { var q = at(f, c); pos.push(q[0], q[1], q[2]); nrm.push(nn[0] / l, nn[1] / l, nn[2] / l); loc.push(0, 0, 0); });
        if (j + 1 < frames.length) { var k = pos.length / 3 - 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
    }
    // End caps: the deck and the two rails as three quads at each end.
    [0, frames.length - 1].forEach(function (j, end) {
      var f = frames[j], sign = end ? 1 : -1, nn = [f.t[0] * sign, f.t[1] * sign, 0];
      [[[-w, -T], [w, 0]], [[-w, 0], [-w + rt, R]], [[w - rt, 0], [w, R]]].forEach(function (r) {
        var base = pos.length / 3;
        [[r[0][0], r[0][1]], [r[1][0], r[0][1]], [r[1][0], r[1][1]], [r[0][0], r[1][1]]].forEach(function (c) {
          var q = at(f, c); pos.push(q[0], q[1], q[2]); nrm.push(nn[0], nn[1], nn[2]); loc.push(0, 0, 0);
        });
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
    });
    return { pos: pos, nrm: nrm, loc: loc, idx: idx };
  }

  // ------------------------------------------------------------------ shaders
  var VS = [
    "#version 300 es",
    "layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNormal; layout(location=2) in vec3 aLocal;",
    "uniform mat4 uViewProj, uModel, uLight;",
    "out vec3 vWorld; out vec3 vNormal; out vec3 vLocal; out vec4 vShadow;",
    "void main() {",
    "  vec4 w = uModel * vec4(aPos, 1.0);",
    "  vWorld = w.xyz; vNormal = mat3(uModel) * aNormal; vLocal = aLocal; vShadow = uLight * w;",
    "  gl_Position = uViewProj * w;",
    "}",
  ].join("\n");
  var FS = [
    "#version 300 es",
    "precision highp float; precision highp sampler2DShadow;",
    "in vec3 vWorld; in vec3 vNormal; in vec3 vLocal; in vec4 vShadow;",
    "uniform vec3 uColor, uSun, uEye, uFog, uSkyTop, uSkyLow, uGrid, uCenter;",
    "uniform int uMat; uniform float uAlpha, uFogNear, uFogFar;",
    "uniform sampler2DShadow uShadowMap;",
    "out vec4 outColor;",
    "float shadow() {",
    "  vec3 p = vShadow.xyz / vShadow.w * 0.5 + 0.5;",
    "  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 1.0;",
    "  float s = 0.0; vec2 t = vec2(1.0 / 2048.0);",
    "  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += texture(uShadowMap, vec3(p.xy + vec2(i, j) * t * 1.5, p.z - 0.0016));",
    "  return s / 9.0;",
    "}",
    "float edges(float lo) {",
    "  vec3 a = abs(vLocal) * 2.0; float e = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));",
    "  return mix(1.0, lo, smoothstep(0.84, 0.98, e));",
    "}",
    "void main() {",
    "  vec3 n = normalize(vNormal); vec3 base = uColor;",
    "  if (uMat == 0) base *= edges(0.8);",
    "  else if (uMat == 1) base *= edges(0.58);",
    "  else if (uMat == 2) base = mix(base, vec3(1.0), smoothstep(0.13, 0.09, abs(vLocal.y)) * 0.6);",
    "  else if (uMat == 3) { vec2 g = abs(fract(vWorld.xz) - 0.5); base = mix(base, uGrid, smoothstep(0.475, 0.5, max(g.x, g.y))); }",
    "  float sh = uMat == 4 ? 1.0 : shadow();",
    "  float sun = max(dot(n, -uSun), 0.0) * sh;",
    "  vec3 sky = mix(uSkyLow, uSkyTop, n.y * 0.5 + 0.5);",
    "  vec3 color = base * (sky * 0.62 + vec3(1.0, 0.97, 0.93) * sun * 0.95);",
    "  if (uMat == 2) { vec3 v = normalize(uEye - vWorld); vec3 h = normalize(v - uSun); color += pow(max(dot(n, h), 0.0), 60.0) * 0.45 * sh; }",
    "  color = mix(color, uFog, smoothstep(uFogNear, uFogFar, length(vWorld - uCenter)));",
    "  outColor = vec4(pow(color, vec3(1.0 / 2.2)), uAlpha);",
    "}",
  ].join("\n");
  var VS_DEPTH = "#version 300 es\nlayout(location=0) in vec3 aPos; uniform mat4 uLight, uModel;\nvoid main() { gl_Position = uLight * uModel * vec4(aPos, 1.0); }";
  var FS_DEPTH = "#version 300 es\nprecision mediump float;\nvoid main() {}";

  var THEMES = {
    dark: { clear: "#181C36", ground: "#1E2343", grid: "#2E3670", stat: "#323B78", prop: "#8EA0FF", actor: "#FF8CC8", zone: "#8EA0FF", skyTop: "#5664B8", skyLow: "#1A1F3D" },
    light: { clear: "#E9ECF6", ground: "#DCE1F1", grid: "#C2C9E6", stat: "#A9B3DA", prop: "#2E46E6", actor: "#FF8CC8", zone: "#2E46E6", skyTop: "#FFFFFF", skyLow: "#B9C2E4" },
  };
  var SUN = norm([0.45, -1, -0.55]);
  var SHADOW = 2048;

  function mount(canvas, opts) {
    var gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
    if (!gl) return null;
    function program(vs, fs) {
      function shader(type, src) {
        var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      }
      var p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var u = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (var i = 0; i < count; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
      return { p: p, u: u };
    }
    function mesh(data) {
      var vao = gl.createVertexArray(), buffers = []; gl.bindVertexArray(vao);
      [data.pos, data.nrm, data.loc].forEach(function (arr, loc) {
        var b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
      });
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.idx), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      buffers.push(ib);
      return { vao: vao, count: data.idx.length, buffers: buffers };
    }
    var main, depth;
    try { main = program(VS, FS); depth = program(VS_DEPTH, FS_DEPTH); } catch (error) { return null; }
    var MESH = { box: mesh(boxData()), sphere: mesh(roundData(1, 0, 24, 32)), cylinder: mesh(cylinderData(32)) };
    var capsules = {};
    function capsule(r, h) {
      var key = r + "/" + h;
      if (!capsules[key]) capsules[key] = mesh(roundData(r, Math.max(0, h / 2 - r), 16, 24));
      return capsules[key];
    }
    var shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW, SHADOW);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var demos = opts.demos, theme = THEMES[opts.light ? "light" : "dark"], current = 0, steps = [], clock = 0, last = 0, pinned = false;
    var playing = !opts.paused, visible = true, raf = 0, focus = null, lastState = "";

    function timeline(demo) {
      var out = [], n = demo.runs.length;
      demo.runs.forEach(function (run, i) {
        if (i > 0) out.push({ kind: "edit", run: i, from: i - 1, dur: run.change ? 2.4 : 0.9 });
        out.push({ kind: "intro", run: i, dur: 1.0 });
        out.push({ kind: "play", run: i, dur: (run.frames.length - 1) / demo.fps });
        out.push({ kind: "hold", run: i, dur: i === n - 1 ? 2.8 : 1.8 });
      });
      if (n > 1) out.push({ kind: "edit", run: 0, from: n - 1, dur: 1.1, back: true });
      return out;
    }
    function show(i) { current = i; steps = timeline(demos[i]); clock = 0; lastState = ""; }

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function staticPose(o) { return o.pose; }
    function scaleOf(o) {
      // Flat ground is drawn far past its edges, so the floor never ends inside the frame.
      if (o.shape === "box") return o.role === "ground" && o.size[1] < 1 && o.size[0] > 6 && o.size[2] > 6 ? [Math.max(o.size[0], 160), o.size[1], Math.max(o.size[2], 120)] : o.size;
      if (o.shape === "sphere") return [o.radius, o.radius, o.radius];
      if (o.shape === "cylinder") return [o.radius, o.height, o.radius];
      return [1, 1, 1];
    }
    var morphMesh = null;
    function dropMesh(m) { gl.deleteVertexArray(m.vao); m.buffers.forEach(function (b) { gl.deleteBuffer(b); }); }
    function meshOf(o) {
      if (o.shape === "capsule") return capsule(o.radius, o.height);
      if (o.shape === "chute") {
        if (!o.morph) { if (!o._mesh) o._mesh = mesh(chuteData(o)); return o._mesh; }
        if (morphMesh) dropMesh(morphMesh);
        morphMesh = mesh(chuteData(o));
        return morphMesh;
      }
      return MESH[o.shape] || MESH.box;
    }
    function look(o) {
      if (o.role === "actor") return { mat: 2, color: theme.actor };
      if (o.role === "prop") return { mat: 1, color: theme.prop };
      if (o.role === "zone") return { mat: 4, color: theme.zone, alpha: 0.07 };
      var flat = o.shape === "box" && o.size && o.size[1] < 1 && o.size[0] > 6 && o.size[2] > 6;
      return flat ? { mat: 3, color: theme.ground } : { mat: 0, color: theme.stat };
    }
    function dynamicObjects(objects) { return objects.filter(function (o) { return !o.pose; }); }
    function framePoses(run, f) {
      var frames = run.frames, a = Math.floor(f), t = f - a, A = frames[Math.min(a, frames.length - 1)], B = frames[Math.min(a + 1, frames.length - 1)];
      var out = [], count = A.length / 7;
      for (var k = 0; k < count; k++) {
        var pa = A.slice(k * 7, k * 7 + 7), pb = B.slice(k * 7, k * 7 + 7);
        var hidden = pa[3] === 0 && pa[4] === 0 && pa[5] === 0 && pa[6] === 0;
        out.push(hidden ? null : pb[6] === 0 && pb[3] === 0 && pb[4] === 0 && pb[5] === 0 ? pa : poseLerp(pa, pb, t));
      }
      return out;
    }
    // The draw list of the moment: statics with their poses, dynamics with the frame's poses.
    function scene(demo, step, local) {
      var run = demo.runs[step.run], items = [];
      function push(o, pose, grow) { if (pose) items.push({ o: o, pose: pose, grow: grow === undefined ? 1 : grow }); }
      if (step.kind === "edit") {
        var from = demo.runs[step.from], e = smooth(local / step.dur), byId = {};
        from.objects.forEach(function (o) { if (o.pose) byId[o.id] = o; });
        run.objects.forEach(function (o) {
          if (!o.pose) return;
          var old = byId[o.id];
          if (old && old.profile && o.profile && old.profile.length === o.profile.length) {
            var mixed = {}; Object.keys(o).forEach(function (k) { if (k !== "_mesh") mixed[k] = o[k]; });
            mixed.morph = true;
            mixed.profile = o.profile.map(function (p, i) { return [lerp(old.profile[i][0], p[0], e), lerp(old.profile[i][1], p[1], e)]; });
            push(mixed, o.pose, 1); delete byId[o.id];
          } else if (old) { push(o, poseLerp(old.pose, o.pose, e), 1); delete byId[o.id]; } else push(o, o.pose, e);
        });
        Object.keys(byId).forEach(function (id) { push(byId[id], byId[id].pose, 1 - e); });
        var fromDyn = dynamicObjects(from.objects), toDyn = dynamicObjects(run.objects);
        var endPoses = framePoses(from, from.frames.length - 1), startPoses = framePoses(run, 0);
        toDyn.forEach(function (o, k) {
          var a = fromDyn[k] && fromDyn[k].id === o.id ? endPoses[k] : null, b = startPoses[k];
          push(o, a && b ? poseLerp(a, b, e) : b, 1);
        });
        return items;
      }
      run.objects.forEach(function (o) { if (o.pose) push(o, staticPose(o)); });
      var f = step.kind === "play" ? local * demo.fps : step.kind === "hold" ? run.frames.length - 1 : 0;
      var poses = framePoses(run, f);
      dynamicObjects(run.objects).forEach(function (o, k) { push(o, poses[k]); });
      return items;
    }
    function state(demo, step, local) {
      var run = demo.runs[step.run], line = "", tick = 0;
      var ratio = (demo.tickRate || 60) / demo.fps;
      if (step.kind === "edit") line = step.back ? "" : run.change || "";
      else if (step.kind === "play") {
        tick = Math.round(local * demo.fps * ratio);
        run.events.forEach(function (ev) { if (ev.t <= local + 1e-6 && ev.kind !== "pass" && ev.kind !== "fail") line = ev.text; });
      } else if (step.kind === "hold") {
        tick = Math.round((run.frames.length - 1) * ratio);
        var lastEv = run.events[run.events.length - 1];
        line = lastEv ? lastEv.text : "";
      }
      return { title: demo.title, run: run.label, line: line, tick: tick, kind: step.kind, result: step.kind === "hold" && run.events.length ? run.events[run.events.length - 1].kind : "" };
    }

    function render(dt) {
      var demo = demos[current];
      if (!demo) return;
      var total = steps.reduce(function (s, x) { return s + x.dur; }, 0);
      if (playing) clock += dt;
      if (clock >= total) {
        // A finished loop moves the window on to the next demo, unless the visitor picked one with a tab.
        if (!pinned && demos.length > 1) { show((current + 1) % demos.length); if (opts.onShow) opts.onShow(current); return; }
        clock %= total;
      }
      if (opts.onProgress) opts.onProgress(clock / total);
      var acc = 0, step = steps[0], local = 0;
      for (var i = 0; i < steps.length; i++) { if (clock < acc + steps[i].dur) { step = steps[i]; local = clock - acc; break; } acc += steps[i].dur; }
      var st = state(demo, step, local), key = JSON.stringify(st);
      if (key !== lastState) { lastState = key; if (opts.onState) opts.onState(st); }

      size();
      var w = canvas.width, h = canvas.height, aspect = w / h, narrow = aspect < 1.2;
      var cam = demo.camera, target = cam.target, eye = cam.eye;
      if (narrow) eye = add(target, scale3(sub(eye, target), 1.25));
      var fov = ((cam.fov || 34) + (narrow ? 12 : 0)) * Math.PI / 180;
      var proj = perspective(fov, aspect, 0.1, 120), viewProj = mul(proj, lookAt(eye, target, [0, 1, 0]));
      var radius = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]);
      var lightEye = sub(target, scale3(SUN, radius)), lightView = lookAt(lightEye, target, [0, 1, 0]);
      var R = radius * 0.75, lightMat = mul(ortho(-R, R, -R, R, 0.1, radius * 2.2), lightView);
      var items = scene(demo, step, local);

      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, SHADOW, SHADOW); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depth.p); gl.uniformMatrix4fv(depth.u.uLight, false, lightMat);
      items.forEach(function (it) {
        if (it.o.role === "zone" || it.grow <= 0.001) return;
        var m = meshOf(it.o), s = scaleOf(it.o).map(function (v) { return v * it.grow; });
        gl.uniformMatrix4fv(depth.u.uModel, false, compose(it.pose, it.pose.slice(3), s));
        gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
      var clear = linear(theme.clear).map(function (c) { return Math.pow(c, 1 / 2.2); });
      gl.clearColor(clear[0], clear[1], clear[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(main.p);
      var u = main.u;
      gl.uniformMatrix4fv(u.uViewProj, false, viewProj); gl.uniformMatrix4fv(u.uLight, false, lightMat);
      gl.uniform3fv(u.uSun, SUN); gl.uniform3fv(u.uEye, eye); gl.uniform3fv(u.uCenter, target);
      gl.uniform3fv(u.uFog, linear(theme.clear)); gl.uniform3fv(u.uSkyTop, linear(theme.skyTop)); gl.uniform3fv(u.uSkyLow, linear(theme.skyLow));
      gl.uniform3fv(u.uGrid, linear(theme.grid)); gl.uniform1f(u.uFogNear, radius * 0.9); gl.uniform1f(u.uFogFar, radius * 2.1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.uniform1i(u.uShadowMap, 0);
      var later = [];
      focus = null;
      function draw(it) {
        var m = meshOf(it.o), L = look(it.o), s = scaleOf(it.o).map(function (v) { return v * it.grow; });
        gl.uniformMatrix4fv(u.uModel, false, compose(it.pose, it.pose.slice(3), s));
        gl.uniform1i(u.uMat, L.mat); gl.uniform3fv(u.uColor, linear(L.color)); gl.uniform1f(u.uAlpha, L.alpha || 1);
        gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
      }
      items.forEach(function (it) {
        if (it.grow <= 0.001) return;
        if (it.o.role === "actor" && !focus) {
          var p = project(viewProj, it.pose);
          if (p) focus = { x: (p[0] * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - p[1] * 0.5) * canvas.clientHeight };
        }
        if (it.o.role === "zone") later.push(it); else draw(it);
      });
      if (later.length) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        later.forEach(draw);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      gl.bindVertexArray(null);
    }

    function frame(now) {
      raf = 0;
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      render(dt);
      if (playing && visible) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (list) { visible = list[0].isIntersecting; if (visible) kick(); }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () { visible = !document.hidden; if (visible) kick(); });
    if ("ResizeObserver" in window) new ResizeObserver(function () { kick(); }).observe(canvas);

    show(0);
    kick();
    return {
      show: function (i) { pinned = true; show(i); kick(); },
      pause: function () { playing = false; },
      resume: function () { playing = true; kick(); },
      playing: function () { return playing; },
      setLight: function (light) { theme = THEMES[light ? "light" : "dark"]; kick(); },
      focus: function () { return focus; },
    };
  }

  window.SDEPlayer = { collect: collect, mount: mount, adaptSlide: adaptSlide };
})();
