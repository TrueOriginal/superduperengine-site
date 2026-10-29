// Keyboard, mouse and touch input. Produces held directions and one-shot actions;
// no gameplay decisions here.
import { PHYS } from './config.js';

const GAME_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW',
  'KeyJ', 'KeyK', 'KeyP', 'Escape', 'KeyM',
]);

export class Input {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.left = false;
    this.right = false;
    this.jumpHeld = false;
    this.jumpBuffer = 0;
    this.throwQueued = false;
    this.throwSource = 'key';
    this.recallQueued = false;
    this.aimScreenX = 0;
    this.aimScreenY = 0;
    this.pointerInside = false;
    this.touch = false;
    this.lastInputAt = 0;
    this.bindKeyboard();
    this.bindPointer();
  }

  gesture() {
    this.lastInputAt = performance.now();
    if (this.hooks.onGesture) this.hooks.onGesture();
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // typing a leaderboard name
      const code = e.code;
      if (GAME_KEYS.has(code)) e.preventDefault();
      if (e.target && e.target.tagName === 'BUTTON' && (code === 'Space' || code === 'Enter')) {
        return;
      }
      this.gesture();
      if (e.repeat) return;
      if (code === 'ArrowLeft' || code === 'KeyA') this.left = true;
      else if (code === 'ArrowRight' || code === 'KeyD') this.right = true;
      else if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
        this.jumpHeld = true;
        this.jumpBuffer = PHYS.buffer;
        if (this.hooks.onJumpPress) this.hooks.onJumpPress();
      } else if (code === 'KeyJ') {
        this.requestWedge('key');
      } else if (code === 'KeyK') {
        this.recallQueued = true;
      } else if (code === 'KeyP' || code === 'Escape') {
        if (this.hooks.onPause) this.hooks.onPause();
      } else if (code === 'KeyM') {
        if (this.hooks.onMute) this.hooks.onMute();
      }
      if (this.hooks.onAnyKey) this.hooks.onAnyKey(code);
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      if (code === 'ArrowLeft' || code === 'KeyA') this.left = false;
      else if (code === 'ArrowRight' || code === 'KeyD') this.right = false;
      else if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') this.jumpHeld = false;
    });

    window.addEventListener('blur', () => {
      this.left = false;
      this.right = false;
      this.jumpHeld = false;
    });
  }

  bindPointer() {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      this.gesture();
      if (e.pointerType === 'touch') this.touch = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.aimScreenX = x;
      this.aimScreenY = y;
      this.pointerInside = true;
      if (e.button === 2) {
        this.recallQueued = true;
      } else {
        this.requestWedge(e.pointerType === 'touch' ? 'touch' : 'pointer', x, y);
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.aimScreenX = e.clientX - rect.left;
      this.aimScreenY = e.clientY - rect.top;
      this.pointerInside = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointerInside = false;
    });
  }

  bindTouchControls(root) {
    const buttons = root.querySelectorAll('[data-act]');
    for (let i = 0; i < buttons.length; i += 1) {
      const el = buttons[i];
      const act = el.getAttribute('data-act');
      const release = (e) => {
        el.classList.remove('is-down');
        if (act === 'left') this.left = false;
        else if (act === 'right') this.right = false;
        else if (act === 'jump') this.jumpHeld = false;
        if (e && e.pointerId !== undefined && el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
          try { el.releasePointerCapture(e.pointerId); } catch (error) { /* already gone */ }
        }
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.gesture();
        this.touch = true;
        el.classList.add('is-down');
        try { el.setPointerCapture(e.pointerId); } catch (error) { /* not critical */ }
        if (act === 'left') this.left = true;
        else if (act === 'right') this.right = true;
        else if (act === 'jump') {
          this.jumpHeld = true;
          this.jumpBuffer = PHYS.buffer;
        } else if (act === 'wedge') {
          this.requestWedge('button');
        }
      }, { passive: false });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    }
  }

  requestWedge(source, sx, sy) {
    this.throwQueued = true;
    this.throwSource = source;
    if (sx !== undefined) {
      this.aimScreenX = sx;
      this.aimScreenY = sy;
      this.pointerInside = true;
    }
  }

  consumeThrow() {
    if (!this.throwQueued) return null;
    this.throwQueued = false;
    return this.throwSource;
  }

  consumeRecall() {
    if (!this.recallQueued) return false;
    this.recallQueued = false;
    return true;
  }

  consumeJumpBuffer() {
    const b = this.jumpBuffer;
    this.jumpBuffer = 0;
    return b;
  }

  clearActions() {
    this.throwQueued = false;
    this.recallQueued = false;
    this.jumpBuffer = 0;
  }
}
