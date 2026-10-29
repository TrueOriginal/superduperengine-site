/* Sky Lantern: drawing of everything that lives in the playfield: obstacles, weather, pickups and the lantern.
   All shapes come from the world model; the art is vector paths plus the sprites built in fx.js.
   Nothing here allocates per frame: colours are cached strings that change only when the palette refreshes. */
(function (SKY) {
  "use strict";

  var U = SKY.U, W = SKY.W, S = SKY.Sim, Fx = SKY.Fx, SP = Fx.SP, Sc = SKY.Sc, V = SKY.V, Pal = Sc.Pal;
  var K = W.K, VT = W.VT;
  var A = {};

  /* ---- Cached colours ---- */
  var C = { key: "", obst: "", obstDark: "", obstLight: "", bark: "", barkLight: "", leaf: "", leafLight: "", rock: "", rockLight: "", rockDark: "",
            kite: [["", ""], ["", ""], ["", ""], ["", ""]], wire: "", pole: "", hint: "", snow: "", foam: "", cloudCore: "", brick: "", brickLight: "" };
  var KITE_BASE = [U.hex("#ff6b57"), U.hex("#ffbf47"), U.hex("#44d3bd"), U.hex("#a58cff")];
  var t1 = [0, 0, 0], t2 = [0, 0, 0], t3 = [0, 0, 0];

  function refreshColors() {
    if (C.key === Pal.key) return;
    C.key = Pal.key;
    var k, dim = 0.3 - 0.2 * Pal.dawn;                       // how far the colours are pulled into the night
    U.mix(Pal.hor, Pal.dark, 0.74, t1); C.obst = U.rgba(t1);
    U.mix(Pal.hor, Pal.dark, 0.9, t2); C.obstDark = U.rgba(t2);
    U.mix(Pal.hor, [255, 255, 255], 0.22, t3); C.obstLight = U.rgba(t3, 0.5);
    U.mix(t1, [70, 46, 40], 0.55, t3); C.bark = U.rgba(t3);
    U.mix(t3, Pal.glow, 0.35, t2); C.barkLight = U.rgba(t2, 0.55);
    U.mix(t1, [24, 70, 56], 0.5, t3); C.leaf = U.rgba(t3);
    U.mix(t3, Pal.glow, 0.3, t2); C.leafLight = U.rgba(t2, 0.5);
    U.mix(Pal.hor, Pal.dark, 0.66, t1); C.rock = U.rgba(t1);
    U.mix(t1, Pal.glow, 0.26, t2); C.rockLight = U.rgba(t2);
    U.mix(Pal.hor, Pal.dark, 0.9, t3); C.rockDark = U.rgba(t3);
    C.wire = U.rgba(U.mix(Pal.hor, Pal.dark, 0.93, t1));
    U.mix(Pal.dark, [150, 86, 66], 0.34, t1); C.brick = U.rgba(t1);
    U.mix(Pal.dark, [190, 128, 100], 0.34, t2); C.brickLight = U.rgba(t2);
    C.pole = U.rgba(U.mix(Pal.hor, Pal.dark, 0.8, t1));
    C.snow = U.rgba(U.mix([210, 225, 255], Pal.glow, Pal.dawn * 0.8, t1), 0.8);
    C.foam = U.rgba(U.mix([200, 220, 255], Pal.glow, Pal.dawn * 0.6, t1), 0.45);
    for (k = 0; k < 4; k++) {
      U.mix(KITE_BASE[k], Pal.dark, dim, t1); C.kite[k][0] = U.rgba(t1);
      U.mix(KITE_BASE[k], [255, 255, 255], 0.12, t2); U.mix(t2, Pal.dark, dim + 0.12, t2); C.kite[k][1] = U.rgba(t2);
    }
  }

  function vxOf(x) { return x - S.D + V.lx; }

  /* ---- Pickups ---- */
  var STAR = [];
  (function () { for (var i = 0; i < 10; i++) { var r = i % 2 ? 0.46 : 1, a = -1.5708 + i * 0.6283; STAR.push(Math.cos(a) * r, Math.sin(a) * r); } })();

  function drawItems(ctx, t) {
    var items = W.ITEMS, i, it, x, y, s, a, j, c, sn;
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it.on) continue;
      x = vxOf(it.x);
      if (x < -40 || x > V.vw + 40) continue;
      if (it.type === 0) {
        y = it.y + Math.sin(t * 1.7 + it.ph) * 3.5;
        s = 44 + 6 * Math.sin(t * 3 + it.ph);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(SP.glowGold, x - s * 0.5, y - s * 0.5, s, s);
        ctx.globalAlpha = 0.45; s *= 0.5;
        ctx.drawImage(SP.glowWhite, x - s * 0.5, y - s * 0.5, s, s);
      } else if (it.type === 1) {
        y = it.y + Math.sin(t * 2.2 + it.ph) * 4;
        ctx.globalAlpha = 0.85; s = 56 + 7 * Math.sin(t * 5 + it.ph);
        ctx.drawImage(SP.glowWarm, x - s * 0.5, y - s * 0.5, s, s);
        ctx.globalAlpha = 1; s = 14 + 1.2 * Math.sin(t * 7 + it.ph);
        ctx.drawImage(SP.flame, x - s * 0.5, y - s * 0.9, s, s * 1.9);
      } else {
        x += Math.sin(t * 0.9 + it.ph * 3) * 9; y = it.y + Math.cos(t * 1.1 + it.ph * 2) * 8;
        a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.4 + it.ph * 5));
        ctx.globalAlpha = 0.9 * a; s = 32;
        ctx.drawImage(SP.glowGreen, x - s * 0.5, y - s * 0.5, s, s);
        ctx.globalAlpha = a; s = 9;
        ctx.drawImage(SP.glowHot, x - s * 0.5, y - s * 0.5, s, s);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    /* star bodies, one path */
    ctx.beginPath();
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it.on || it.type !== 0) continue;
      x = vxOf(it.x);
      if (x < -30 || x > V.vw + 30) continue;
      y = it.y + Math.sin(t * 1.7 + it.ph) * 3.5;
      s = 11.5 + 1 * Math.sin(t * 3 + it.ph);
      a = Math.sin(t * 1.1 + it.ph) * 0.16;
      c = Math.cos(a); sn = Math.sin(a);
      for (j = 0; j < 10; j++) {
        var px = STAR[2 * j] * s, py = STAR[2 * j + 1] * s;
        if (j === 0) ctx.moveTo(x + px * c - py * sn, y + px * sn + py * c); else ctx.lineTo(x + px * c - py * sn, y + px * sn + py * c);
      }
      ctx.closePath();
    }
    ctx.fillStyle = "#fff0b8";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,200,110,0.85)"; ctx.lineWidth = 1; ctx.lineJoin = "round";
    ctx.stroke();
  }

  /* ---- Weather volumes ---- */
  var TAB = U.TAB;
  function FR(v) { return v - Math.floor(v); }

  function drawSmoke(ctx, v, t) {
    var cx = (v.x0 + v.x1) * 0.5, x = vxOf(cx), base = v.y1, H = base - v.y0, j, a, px, py, r;
    if (x < -140 || x > V.vw + 140) return;
    var lean = Math.sin(t * 0.37 + v.seed) * 18 + 16;
    /* warm light from the hearth at the foot of the column */
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.28 + 0.06 * Math.sin(t * 6 + v.seed);
    ctx.drawImage(SP.glowWarm, x - 38, base - 44, 76, 76);
    ctx.globalCompositeOperation = "source-over";
    for (j = 0; j < 16; j++) {
      a = FR(t * 0.2 + j / 16 + (v.seed % 7) * 0.13);
      px = x + Math.sin(a * 5.2 + j * 1.3) * (6 + a * 22) + lean * a;
      py = base - a * H;
      r = 17 + a * 38;
      ctx.globalAlpha = 0.78 * Math.pow(1 - a, 1.1) * Math.min(1, a * 6);
      ctx.drawImage(SP.puffSmoke[j & 1], px - r, py - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawCloudBody(ctx, v, t) {
    var cx = (v.x0 + v.x1) * 0.5, x = vxOf(cx), w = v.x1 - v.x0, cy = v.b, j, px, py, r, mid;
    if (x < -w || x > V.vw + w) return;
    var bob = Math.sin(t * 0.5 + v.seed) * 3;
    /* body: flat belly, lumpy top; the lumps are bigger in the middle */
    for (j = 0; j < 9; j++) {
      mid = 1 - Math.abs(j - 4) / 4.4;
      px = x + (j - 4) * w * 0.115 + Math.sin(t * 0.3 + j * 2.1) * 3;
      py = cy + bob + 10 - mid * 20 + (j % 2 ? 4 : -2);
      r = 34 + mid * 34;
      ctx.globalAlpha = 0.97;
      ctx.drawImage(SP.puffStorm[j % 3], px - r * 1.12, py - r * 0.9, r * 2.24, r * 1.8);
    }
    for (j = 1; j < 8; j += 2) {
      mid = 1 - Math.abs(j - 4) / 4.4;
      px = x + (j - 4) * w * 0.115 - 6;
      py = cy + bob - mid * 26 - 8;
      r = 22 + mid * 20;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(SP.puffStormLit[j & 1], px - r, py - r * 0.8, r * 2, r * 1.6);
    }
    if (Fx.lightning > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Fx.lightning * 0.9;
      ctx.drawImage(SP.glowBlue, x - w * 0.6, cy - 90, w * 1.2, 180);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
  }

  function drawRainFront(ctx, v, t) {
    var x0 = vxOf(v.x0), x1 = vxOf(v.x1), w = x1 - x0, top = v.y0 + 40, len = v.y1 - top, j, px, py, sp, ph, sd = v.seed | 0;
    if (x1 < -40 || x0 > V.vw + 40) return;
    ctx.beginPath();
    for (j = 0; j < 54; j++) {
      ph = TAB[(j * 5 + sd + 1) & 4095];
      sp = 280 + 200 * TAB[(j * 5 + sd + 2) & 4095];
      px = x0 + w * (0.06 + 0.88 * ph);
      py = top + FR(t * sp / len + TAB[(j * 5 + sd + 3) & 4095]) * len;
      ctx.moveTo(px, py);
      ctx.lineTo(px - 3, py + 13);
    }
    ctx.strokeStyle = "rgba(196,214,255,0.55)";
    ctx.lineWidth = 1.3;
    ctx.lineCap = "round";
    ctx.stroke();
    /* mist where the curtain ends */
    ctx.globalAlpha = 0.2;
    ctx.drawImage(SP.puffGrey[0], x0 - w * 0.05, v.y1 - 66, w * 1.1, 104);
    ctx.globalAlpha = 1;
  }

  function drawGust(ctx, v, t) {
    var x0 = vxOf(v.x0), x1 = vxOf(v.x1), w = x1 - x0, j, ph, px, py, len, a, y0 = Math.max(v.y0, 30), y1 = Math.min(v.y1, 700);
    if (x1 < -40 || x0 > V.vw + 40) return;
    var dir = v.type === VT.GUST_HEAD ? -1 : (v.type === VT.GUST_TAIL ? 1 : 0);
    ctx.beginPath();
    for (j = 0; j < 30; j++) {
      ph = TAB[(j * 7 + (v.seed | 0) + 1) & 4095];
      var rr = TAB[(j * 7 + (v.seed | 0) + 2) & 4095], sp = 0.28 + 0.3 * TAB[(j * 7 + (v.seed | 0) + 3) & 4095];
      var prog = FR(ph + t * sp * (dir === 0 ? 0.9 : 1));
      len = 34 + 50 * TAB[(j * 7 + (v.seed | 0) + 4) & 4095];
      if (dir !== 0) {
        px = dir > 0 ? x0 + w * prog : x1 - w * prog;
        py = y0 + (y1 - y0) * rr;
        a = Math.sin(Math.PI * prog);
        ctx.moveTo(px - dir * len, py + 4);
        ctx.quadraticCurveTo(px, py - 5, px + dir * 6, py);
      } else {
        px = x0 + w * rr;
        var down = v.type === VT.GUST_DOWN;
        py = down ? y0 + (y1 - y0) * prog : y1 - (y1 - y0) * prog;
        ctx.moveTo(px + 3, down ? py - len : py + len);
        ctx.quadraticCurveTo(px - 5, py, px, down ? py + 6 : py - 6);
      }
    }
    var pulse = 0.2 + 0.1 * Math.sin(t * 2 + v.seed);
    ctx.strokeStyle = "rgba(210,228,255," + pulse.toFixed(2) + ")";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  /* ---- Obstacles ---- */
  function tapered(ctx, a, o6) {
    /* a thick segment between two circles of different radius */
    var x1 = vxOf(a[o6]), y1 = a[o6 + 1], r1 = a[o6 + 2], x2 = vxOf(a[o6 + 3]), y2 = a[o6 + 4], r2 = a[o6 + 5];
    var dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l;
    ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
    ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
    ctx.arc(x2, y2, r2, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
    ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
    ctx.arc(x1, y1, r1, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
    ctx.closePath();
  }

  function drawKite(ctx, o, t) {
    var a = o.cur, x = vxOf(a[0]), y = a[1], p = o.p, col = C.kite[p[10] | 0], s = p[11] * 1.3;
    if (x < -100 || x > V.vw + 100) return;
    var sway = Math.cos(p[6] * t + p[4]) * p[2] * p[6] / 110;     // lean with the horizontal velocity
    var ax = vxOf(p[8]), ay = p[9];
    /* string down to the roofs */
    ctx.strokeStyle = "rgba(225,230,248,0.38)"; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x, y + 24 * s);
    ctx.quadraticCurveTo((x + ax) * 0.5 + 22 * Math.sin(t * 1.3 + p[4]), (y + ay) * 0.5, ax, ay);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y); ctx.rotate(U.clamp(sway, -0.5, 0.5));
    var j, tx, ty, hw = 16 * s, hh = 22 * s;
    /* tail of bows */
    ctx.strokeStyle = col[1]; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, hh * 0.9);
    for (j = 1; j <= 8; j++) { tx = Math.sin(t * 2.6 + j * 0.9 + p[5]) * (3 + j * 1.0); ty = hh * 0.9 + j * 7.5; ctx.lineTo(tx, ty); }
    ctx.stroke();
    for (j = 2; j <= 8; j += 2) {
      tx = Math.sin(t * 2.6 + j * 0.9 + p[5]) * (3 + j * 1.0); ty = hh * 0.9 + j * 7.5;
      ctx.fillStyle = j % 4 ? col[0] : col[1];
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 6, ty - 4); ctx.lineTo(tx - 6, ty + 4); ctx.closePath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx + 6, ty - 4); ctx.lineTo(tx + 6, ty + 4); ctx.closePath(); ctx.fill();
    }
    /* body: four panels in two tones */
    var cy = -hh * 0.2;
    ctx.fillStyle = col[0];
    ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(-hw, cy); ctx.lineTo(0, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, hh); ctx.lineTo(hw, cy); ctx.lineTo(0, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col[1];
    ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(hw, cy); ctx.lineTo(0, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, hh); ctx.lineTo(-hw, cy); ctx.lineTo(0, cy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(20,14,34,0.55)"; ctx.lineWidth = 1.1; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(hw, cy); ctx.lineTo(0, hh); ctx.lineTo(-hw, cy); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = "rgba(255,244,220,0.5)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, hh); ctx.moveTo(-hw, cy); ctx.lineTo(hw, cy); ctx.stroke();
    ctx.restore();
  }

  function drawWires(ctx, o, t) {
    var p = o.p, xl = vxOf(p[0]), xr = vxOf(p[1]), a = o.sh, k, n = o.n;
    if (xr < -30 || xl > V.vw + 30) return;
    /* poles stand behind the wires (they are not solid) */
    var pl = [xl, xr], j, gy, topY = p[6];
    ctx.lineCap = "round";
    for (j = 0; j < 2; j++) {
      gy = j ? p[8] : p[7];
      ctx.strokeStyle = C.pole; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(pl[j], gy + 14); ctx.lineTo(pl[j], topY); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(pl[j] - 26, topY + 8); ctx.lineTo(pl[j] + 26, topY + 8);
      ctx.moveTo(pl[j] - 20, topY + 28); ctx.lineTo(pl[j] + 20, topY + 28); ctx.stroke();
      ctx.fillStyle = C.obstLight;
      ctx.fillRect(pl[j] - 28, topY + 3, 4, 8); ctx.fillRect(pl[j] + 24, topY + 3, 4, 8);
    }
    /* wires */
    var rows = p[5] ? 3 : 2, segs = 5, w;
    ctx.strokeStyle = C.wire; ctx.lineWidth = 2.3;
    for (w = 0; w < rows; w++) {
      ctx.beginPath();
      for (k = 0; k < segs; k++) {
        var b = (w * segs + k) * 6;
        if (k === 0) ctx.moveTo(vxOf(a[b]), a[b + 1]);
        ctx.lineTo(vxOf(a[b + 3]), a[b + 4]);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = C.obstLight; ctx.lineWidth = 0.8;
    for (w = 0; w < rows; w++) {
      ctx.beginPath();
      for (k = 0; k < segs; k++) {
        var b2 = (w * segs + k) * 6;
        if (k === 0) ctx.moveTo(vxOf(a[b2]), a[b2 + 1] - 1.4);
        ctx.lineTo(vxOf(a[b2 + 3]), a[b2 + 4] - 1.4);
      }
      ctx.stroke();
    }
  }

  /* A smooth tapered limb along a cubic curve. The outline is computed once into out[] (world x) and then only
     replayed: out[off] = point count, then 4 numbers per point (left x, y, right x, y), then the end cap. */
  function limbBuild(out, off, x0, y0, x1, y1, x2, y2, x3, y3, r0, r1, n) {
    var i, t, u, a, b, c, d, px = 0, py = 0, dx, dy, l, nx = 0, ny = 1, r = r1, k = off + 1;
    out[off] = n;
    for (i = 0; i <= n; i++) {
      t = i / n; u = 1 - t;
      a = u * u * u; b = 3 * u * u * t; c = 3 * u * t * t; d = t * t * t;
      px = a * x0 + b * x1 + c * x2 + d * x3; py = a * y0 + b * y1 + c * y2 + d * y3;
      dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
      dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
      l = Math.sqrt(dx * dx + dy * dy) || 1; nx = -dy / l; ny = dx / l;
      r = r0 + (r1 - r0) * t;
      out[k] = px + nx * r; out[k + 1] = py + ny * r; out[k + 2] = px - nx * r; out[k + 3] = py - ny * r;
      k += 4;
    }
    out[k] = px; out[k + 1] = py; out[k + 2] = r; out[k + 3] = Math.atan2(ny, nx); out[k + 4] = Math.atan2(-ny, -nx);
    return k + 5;
  }
  function limbPath(ctx, out, off, ox) {
    var n = out[off] | 0, i, k = off + 1, e = off + 1 + (n + 1) * 4;
    ctx.moveTo(out[k] + ox, out[k + 1]);
    for (i = 1; i <= n; i++) ctx.lineTo(out[k + 4 * i] + ox, out[k + 4 * i + 1]);
    ctx.arc(out[e] + ox, out[e + 1], out[e + 2], out[e + 3], out[e + 4], true);
    for (i = n; i >= 0; i--) ctx.lineTo(out[k + 4 * i + 2] + ox, out[k + 4 * i + 3]);
    ctx.closePath();
  }
  function limbEdge(ctx, out, off, ox) {
    var n = out[off] | 0, i, k = off + 1;
    ctx.moveTo(out[k] + ox, out[k + 1]);
    for (i = 1; i <= n; i++) ctx.lineTo(out[k + 4 * i] + ox, out[k + 4 * i + 1]);
  }
  function leafBunch(ctx, x, y, radius, k, t, seed) {
    var s = radius * 2.75, wob = Math.sin(t * 1.3 + seed + k) * 0.05;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(U.hash(seed * 3 + k) * 6.283 + wob);
    ctx.drawImage(SP.leaves[(seed + k) % 3], -s * 0.5, -s * 0.5, s, s);
    ctx.restore();
  }

  function drawBranch(ctx, o, t) {
    var a = o.sh, p = o.p, k, ox = V.lx - S.D, x1 = o.x0 + ox, x2 = o.x1 + ox, sd = o.seed | 0;
    if (x2 < -20 || x1 > V.vw + 20) return;
    if (!o.ribOK) { limbBuild(o.rib, 0, p[4], p[5], p[6], p[7], p[8], p[9], p[0], p[10], 19, 5.2, 16); o.ribOK = true; }
    ctx.beginPath();
    limbPath(ctx, o.rib, 0, ox);
    for (k = 5; k < o.n; k++) tapered(ctx, a, k * 6);
    ctx.fillStyle = C.bark; ctx.fill();
    ctx.beginPath(); limbEdge(ctx, o.rib, 0, ox);
    ctx.strokeStyle = C.barkLight; ctx.lineWidth = 1.3; ctx.lineJoin = "round"; ctx.stroke();
    /* leaves: along the bough, on the twigs and a full bunch at the tip */
    var wob = Math.sin(t * 1.1 + sd) * 1.5;
    for (k = 2; k < 5; k++) leafBunch(ctx, vxOf(a[k * 6 + 3]) + wob * 0.5, a[k * 6 + 4] + 4, 17 + k * 1.5, k, t, sd);
    for (k = 5; k < o.n; k++) leafBunch(ctx, vxOf(a[k * 6 + 3]) + wob, a[k * 6 + 4] + 2, 19, k, t, sd);
    leafBunch(ctx, vxOf(a[4 * 6 + 3]) + wob, a[4 * 6 + 4], 26, 7, t, sd);
  }

  function drawTree(ctx, o, t) {
    var a = o.sh, p = o.p, k, ox = V.lx - S.D, x1 = o.x0 + ox, x2 = o.x1 + ox, sd = o.seed | 0;
    if (x2 < -30 || x1 > V.vw + 30) return;
    var x = p[0], topY = p[1], gy = p[2] + 16, lean = p[3];
    if (!o.ribOK) {
      var sx = a[3 * 6], sy = a[3 * 6 + 1], e;
      e = limbBuild(o.rib, 0, x, gy, x - lean * 0.6, gy - (gy - topY) * 0.35, x + lean * 0.5, topY + (gy - topY) * 0.3, x + lean * 0.3, topY + 50, 21, 10, 12);
      limbBuild(o.rib, e, x - lean * 0.4, gy - (gy - topY) * 0.45, x - 20, gy - (gy - topY) * 0.58, sx + 20 * (sd % 2 ? 1 : -1), sy + 40, sx, sy + 8, 7, 3.5, 8);
      o.p[11] = e;
      o.ribOK = true;
    }
    /* trunk and one side bough */
    ctx.beginPath();
    limbPath(ctx, o.rib, 0, ox);
    limbPath(ctx, o.rib, o.p[11] | 0, ox);
    ctx.fillStyle = C.bark; ctx.fill();
    ctx.beginPath(); limbEdge(ctx, o.rib, 0, ox);
    ctx.strokeStyle = C.barkLight; ctx.lineWidth = 1.3; ctx.stroke();
    /* crown: leaf bunches over the three collision circles, plus a few at the rim */
    for (k = 1; k < o.n; k++) leafBunch(ctx, a[k * 6] + ox, a[k * 6 + 1], a[k * 6 + 2] * 1.1, k, t, sd);
    leafBunch(ctx, a[6] + ox - 22, a[7] - 22, 22, 5, t, sd);
    leafBunch(ctx, a[6] + ox + 24, a[7] - 18, 20, 6, t, sd);
  }

  function rockPoly(ctx, cx, tipX, tipY, baseY, baseR, seed, side) {
    /* one spire as a two-tone faceted triangle with a jagged edge */
    var j, n = 4, lx = cx - baseR, rx = cx + baseR;
    ctx.beginPath();
    ctx.moveTo(lx, baseY);
    for (j = 1; j <= n; j++) {
      var u = j / (n + 1), yy = baseY + (tipY - baseY) * u;
      ctx.lineTo(lx + (tipX - lx) * u + (U.hash(seed + j) - 0.5) * 10 * (1 - u), yy);
    }
    ctx.lineTo(tipX, tipY);
    for (j = n; j >= 1; j--) {
      var v = j / (n + 1), y2 = baseY + (tipY - baseY) * v;
      ctx.lineTo(rx + (tipX - rx) * v + (U.hash(seed + 9 + j) - 0.5) * 10 * (1 - v), y2);
    }
    ctx.lineTo(rx, baseY);
    ctx.closePath();
  }

  function drawSpire(ctx, o, t) {
    var p = o.p, x = vxOf(p[0]), x1 = vxOf(o.x0), x2 = vxOf(o.x1);
    if (x2 < -20 || x1 > V.vw + 20) return;
    var topY = p[1], gy = p[2] + 22, baseR = p[3], lean = p[4];
    /* twin first, it stands behind */
    var tx = x + p[5];
    rockPoly(ctx, tx, tx + lean * 0.4, p[6], gy, baseR * 0.74, o.seed + 40, 1);
    ctx.fillStyle = C.rockDark; ctx.fill();
    rockPoly(ctx, x, x + lean, topY, gy, baseR, o.seed, 1);
    ctx.fillStyle = C.rock; ctx.fill();
    /* lit side */
    ctx.beginPath();
    ctx.moveTo(x + lean, topY); ctx.lineTo(x + baseR * 0.55, gy); ctx.lineTo(x + baseR, gy); ctx.lineTo(x + lean, topY);
    ctx.moveTo(x + lean, topY);
    ctx.fillStyle = C.rockDark; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = C.rockLight; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x - baseR * 0.78, gy - 30); ctx.lineTo(x + lean - 3, topY + 12); ctx.stroke();
    /* snow cap */
    ctx.fillStyle = C.snow;
    ctx.beginPath(); ctx.moveTo(x + lean, topY - 1); ctx.lineTo(x + lean - 11, topY + 30); ctx.lineTo(x + lean - 4, topY + 24);
    ctx.lineTo(x + lean + 1, topY + 36); ctx.lineTo(x + lean + 6, topY + 25); ctx.lineTo(x + lean + 12, topY + 31); ctx.closePath(); ctx.fill();
  }

  function drawStack(ctx, o, t) {
    var p = o.p, x = vxOf(p[0]), x1 = vxOf(o.x0), x2 = vxOf(o.x1);
    if (x2 < -20 || x1 > V.vw + 20) return;
    var topY = p[1], gy = p[2] + 16, baseR = p[3], topR = p[4], j;
    ctx.beginPath();
    ctx.moveTo(x - baseR, gy);
    ctx.lineTo(x - topR - 3, topY + topR + 18);
    ctx.quadraticCurveTo(x - topR - 2, topY + 2, x - topR * 0.4, topY);
    ctx.quadraticCurveTo(x + topR * 0.2, topY - 4, x + topR * 0.9, topY + 3);
    ctx.quadraticCurveTo(x + topR + 4, topY + 8, x + topR + 3, topY + topR + 18);
    ctx.lineTo(x + baseR, gy);
    ctx.closePath();
    ctx.fillStyle = C.rock; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = C.rockDark; ctx.globalAlpha = 0.5;
    ctx.fillRect(x + topR * 0.2, topY, baseR, gy - topY);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.rockLight; ctx.lineWidth = 1;
    ctx.beginPath();
    for (j = 0; j < 7; j++) {
      var yy = topY + 14 + j * (gy - topY) / 7 + U.hash(o.seed + j) * 6;
      ctx.moveTo(x - baseR, yy); ctx.lineTo(x + baseR, yy + 3);
    }
    ctx.globalAlpha = 0.28; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = C.rockLight; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(x - topR - 2, topY + topR + 14); ctx.quadraticCurveTo(x - topR - 2, topY + 2, x - topR * 0.4, topY); ctx.stroke();
    /* foam around the foot */
    ctx.fillStyle = C.foam;
    for (j = 0; j < 5; j++) {
      var fx = x - baseR + (j + 0.5) * (baseR * 2 / 5) + Math.sin(t * 1.3 + j) * 3;
      ctx.beginPath(); ctx.ellipse(fx, gy - 4 + Math.sin(t * 1.6 + j * 1.3) * 2, 10 + 4 * Math.sin(t + j), 3.2, 0, 0, 6.283); ctx.fill();
    }
  }

  function drawChimney(ctx, o, t) {
    var x = vxOf(o.p[0]), gy = o.p[1];
    if (x < -40 || x > V.vw + 40) return;
    ctx.fillStyle = C.brick; ctx.fillRect(x - 11, gy - 40, 22, 48);
    ctx.fillStyle = C.brickLight; ctx.fillRect(x - 14, gy - 46, 28, 8);
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(x + 3, gy - 38, 8, 46);
    ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 11, gy - 28); ctx.lineTo(x + 11, gy - 28); ctx.moveTo(x - 11, gy - 17); ctx.lineTo(x + 11, gy - 17); ctx.stroke();
    ctx.fillStyle = C.obstLight; ctx.globalAlpha = 0.6; ctx.fillRect(x - 14, gy - 46, 28, 1.6); ctx.globalAlpha = 1;
  }

  function drawFlock(ctx, o, t) {
    var a = o.cur, j, x, y, f, n = o.cn, pass;
    if (n === 0) return;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (j = 0; j < n; j++) {
        x = vxOf(a[6 * j]); y = a[6 * j + 1];
        if (x < -40 || x > V.vw + 40) continue;
        f = Math.sin(t * 10 + j * 1.9 + o.seed);
        ctx.moveTo(x + 16, y - f * 8 - 3);
        ctx.quadraticCurveTo(x + 7, y - 9 + f * 4.5, x, y + 1);
        ctx.quadraticCurveTo(x - 7, y - 9 + f * 4.5, x - 16, y - f * 8 - 3);
      }
      if (pass === 0) { ctx.strokeStyle = "rgba(190,210,255,0.4)"; ctx.lineWidth = 6; } else { ctx.strokeStyle = C.wire; ctx.lineWidth = 3.2; }
      ctx.stroke();
    }
  }

  function drawRiser(ctx, o, t) {
    var a = o.cur, j, x, y, r, s, tilt;
    for (j = 0; j < o.cn; j++) {
      x = vxOf(a[6 * j]); y = a[6 * j + 1]; r = a[6 * j + 2];
      if (x < -60 || x > V.vw + 60) continue;
      s = r / 19;
      tilt = Math.sin(t * 1.4 + j * 2.3 + o.seed) * 0.1;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.65; ctx.drawImage(SP.glowWarm, x - 64 * s, y - 56 * s, 128 * s, 128 * s);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(s * 0.72, s * 0.72);
      ctx.drawImage(SP.lanternDark, -SP.LOX, -SP.LOY, 64, 84);
      ctx.drawImage(SP.lantern, -SP.LOX, -SP.LOY, 64, 84);
      ctx.globalCompositeOperation = "lighter";
      var fs = 0.9 + 0.12 * Math.sin(t * 9 + j * 4);
      ctx.drawImage(SP.flame, -5 * fs, 23 - 20 * fs, 10 * fs, 20 * fs);
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    }
  }

  A.drawBehind = function (ctx, t) {
    refreshColors();
    var obs = W.OBS, vols = W.VOLS, i, o, v;
    for (i = 0; i < vols.length; i++) {
      v = vols[i];
      if (!v.on) continue;
      if (v.type === VT.SMOKE) drawSmoke(ctx, v, t);
      else if (v.type === VT.RAIN) drawCloudBody(ctx, v, t);
    }
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      if (!o.on) continue;
      switch (o.kind) {
        case K.WIRES: drawWires(ctx, o, t); break;
        case K.BRANCH: drawBranch(ctx, o, t); break;
        case K.TREE: drawTree(ctx, o, t); break;
        case K.SPIRE: drawSpire(ctx, o, t); break;
        case K.STACK: drawStack(ctx, o, t); break;
        case K.CHIMNEY: drawChimney(ctx, o, t); break;
        case K.KITE: drawKite(ctx, o, t); break;
        case K.RISER: drawRiser(ctx, o, t); break;
        case K.FLOCK: drawFlock(ctx, o, t); break;
        default: break;
      }
    }
    drawItems(ctx, t);
  };

  /* Rain and wind streaks pass in front of the lantern. */
  A.drawFront = function (ctx, t) {
    var vols = W.VOLS, i, v;
    for (i = 0; i < vols.length; i++) {
      v = vols[i];
      if (!v.on) continue;
      if (v.type === VT.RAIN) drawRainFront(ctx, v, t);
      else if (v.type >= VT.GUST_DOWN) drawGust(ctx, v, t);
    }
  };

  /* ---- The lantern ---- */
  var TEARS = [
    [-18, -23, -8, -28, -6, -21, -12, -16, -17, -15],
    [10, -7, 19, -10, 17, -1, 12, 4, 8, 0],
    [-14, 7, -6, 3, -4, 12, -9, 17, -15, 13]
  ];

  A.lanternState = { flame: 1, lit: 1 };

  A.drawLantern = function (ctx, t) {
    var L = A.lanternState, x = V.lx, y = S.y, i, j, tear, tilt, flick, flameK, litK, alpha = 1, scale = 1;
    var dying = S.mode === "dying" || S.mode === "over";
    var out = (dying && S.cause === "flame") || (S.mode === "over" && S.cause === "flame");
    flick = 0.9 + 0.06 * Math.sin(t * 13.1) + 0.04 * Math.sin(t * 7.3 + 1) + 0.03 * Math.sin(t * 23);
    /* how big the flame is: heat and fuel, shrunk by rain and smoke */
    flameK = (0.32 + 0.68 * S.heat) * (0.3 + 0.7 * Math.min(1, S.fuel * 3.2)) * (1 - 0.5 * S.wet) * (1 - 0.35 * S.smother);
    if (S.fuel <= 0) flameK = 0;
    if (S.mode === "finale" || S.mode === "finish") flameK = Math.max(flameK, 0.78);
    if (S.mode === "dying" && S.cause === "flame") flameK *= Math.max(0, 1 - S.modeT / 1.1);
    if (S.mode === "over" && S.cause === "flame") flameK = 0;
    litK = Math.min(1, 0.18 + flameK * 0.95);
    L.flame += (flameK - L.flame) * 0.35; L.lit += (litK - L.lit) * 0.25;
    if (S.invul > 0 && S.mode === "play" && S.invul < 1.8 && !S.god) alpha = Math.sin(t * 36) > -0.2 ? 1 : 0.38;
    if (S.mode === "dying" && S.cause === "paper") { scale = 1 + 0.08 * Math.sin(S.modeT * 30); alpha = Math.max(0, 1 - S.modeT / 1.7); }
    if (S.mode === "over" && S.cause === "paper") return;
    tilt = U.clamp(S.vy * 0.0016, -0.28, 0.28) + 0.045 * Math.sin(t * 1.9) + (S.gust > 0.1 ? 0.1 * Math.sin(t * 9) * S.gust : 0);
    if (S.mode === "finale") tilt += 0.03 * Math.sin(t * 2.2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.drawImage(SP.lanternDark, -SP.LOX, -SP.LOY, 64, 84);
    ctx.globalAlpha = alpha * L.lit * flick;
    ctx.drawImage(SP.lantern, -SP.LOX, -SP.LOY, 64, 84);
    ctx.globalAlpha = alpha;
    /* torn paper */
    for (i = 0; i < S.tears && i < 3; i++) {
      tear = TEARS[i];
      ctx.beginPath();
      ctx.moveTo(tear[0], tear[1]);
      for (j = 2; j < 10; j += 2) ctx.lineTo(tear[j], tear[j + 1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(34,12,8,0.92)"; ctx.fill();
      ctx.strokeStyle = "rgba(255,206,130," + (0.5 * L.lit).toFixed(2) + ")"; ctx.lineWidth = 0.9; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tear[0], tear[1]); ctx.lineTo(tear[0] - 3 + i, tear[1] - 4); ctx.lineTo(tear[2], tear[3]);
      ctx.fillStyle = "rgba(255,170,90," + (0.55 * L.lit).toFixed(2) + ")"; ctx.fill();
    }
    /* the flame in the ring */
    if (L.flame > 0.02) {
      var fs = 0.45 + 0.8 * L.flame, sway = Math.sin(t * 9) * 0.1 + S.vy * -0.0006;
      ctx.globalCompositeOperation = "lighter";
      ctx.save();
      ctx.translate(0, 25); ctx.rotate(sway); ctx.scale(fs * (0.92 + 0.1 * Math.sin(t * 17)), fs * flick);
      ctx.globalAlpha = alpha * Math.min(1, L.flame * 1.4);
      ctx.drawImage(SP.flame, -6, -24, 12, 24);
      ctx.restore();
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };

  /* Soft light cast around the lantern, over everything else. */
  A.drawLight = function (ctx, t) {
    var f = A.lanternState.flame;
    if (S.mode === "over" && S.cause === "paper") return;
    var size = 150 + 330 * f, a = 0.18 + 0.4 * f;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a * (0.93 + 0.07 * Math.sin(t * 11));
    ctx.drawImage(SP.glowWarm, V.lx - size, S.y - size * 0.9, size * 2, size * 2);
    ctx.globalAlpha = 0.5 * f;
    size = 54 + 40 * f;
    ctx.drawImage(SP.glowHot, V.lx - size, S.y + 6 - size, size * 2, size * 2);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };

  SKY.Act = A;
})(window.SKY = window.SKY || {});
