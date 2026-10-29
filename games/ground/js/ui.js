// DOM layer: title/pause/result screens, HUD, biome banners, hints, touch pads,
// page chrome and the best score kept in localStorage.
import { STORAGE } from './config.js';

const SCREENS = ['title', 'paused', 'gameover', 'finished'];
const SCREEN_IDS = {
  title: 'title-screen',
  paused: 'pause-screen',
  gameover: 'over-screen',
  finished: 'finish-screen',
};

function byId(id) {
  return document.getElementById(id);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class UI {
  constructor(game, i18n) {
    this.game = game;
    this.i18n = i18n;
    this.touch = false;
    this.state = 'title';
    this.best = this.loadBest();
    this.hintTimer = null;
    this.bannerTimer = null;
    this.focusTimer = null;

    this.root = byId('game');
    this.canvas = byId('game-canvas');
    this.backLink = byId('back-link');
    this.hearts = Array.prototype.slice.call(document.querySelectorAll('#hearts .heart'));
    this.hudDistance = byId('hud-distance');
    this.hudCrystals = byId('hud-crystals');
    this.hudTime = byId('hud-time');
    this.wedgeChip = byId('wedge-chip');
    this.muteBtn = byId('mute-btn');
    this.pauseBtn = byId('pause-btn');
    this.biomeBanner = byId('biome-banner');
    this.toast = byId('toast');
    this.titleBest = byId('title-best');
    this.titleControls = byId('title-controls');
    this.pauseControls = byId('pause-controls');
    this.pauseMuteBtn = byId('pause-mute-btn');
    this.pauseMuteState = byId('pause-mute-state');
    this.overEyebrow = byId('over-eyebrow');
    this.overHeading = byId('over-heading');
    this.finishEyebrow = byId('finish-eyebrow');
    this.screens = {};
    for (let i = 0; i < SCREENS.length; i += 1) {
      this.screens[SCREENS[i]] = byId(SCREEN_IDS[SCREENS[i]]);
    }
    this.cache = { distance: -1, crystals: -1, time: '', hearts: -1, wedge: null };
    this.game.input.bindTouchControls(byId('touch-controls'));
    this.wire();
    this.applyLang();
    this.setState('title');
    this.setMuted(game.audio.muted);
    this.setBest(this.best, false);
  }

  wire() {
    this.muteBtn.addEventListener('click', () => this.game.toggleMute());
    this.pauseBtn.addEventListener('click', () => this.game.togglePause());
    this.pauseMuteBtn.addEventListener('click', () => this.game.toggleMute());
    byId('resume-btn').addEventListener('click', () => this.game.resume());
    byId('again-btn').addEventListener('click', () => this.game.restart());
    byId('finish-again-btn').addEventListener('click', () => this.game.restart());
    this.root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.setTouch(true);
    }, { capture: true, passive: true });
  }

  applyLang() {
    const t = this.i18n.t;
    document.documentElement.lang = this.i18n.lang;
    document.title = `${t('title')} — Super Duper Engine`;
    const nodes = document.querySelectorAll('[data-i18n]');
    for (let i = 0; i < nodes.length; i += 1) {
      const key = nodes[i].getAttribute('data-i18n');
      nodes[i].textContent = t(key);
    }
    const aria = document.querySelectorAll('[data-i18n-aria]');
    for (let i = 0; i < aria.length; i += 1) {
      const el = aria[i];
      const label = t(el.getAttribute('data-i18n-aria'));
      el.setAttribute('aria-label', label);
      el.title = label;
    }
    this.canvas.setAttribute('aria-label', t('canvasAria'));
    this.backLink.href = this.i18n.lang === 'ru' ? '/ru/' : '/en/';
    this.overEyebrow.textContent = t('title');
    this.overHeading.textContent = t('caught');
    this.finishEyebrow.textContent = this.i18n.biome('valley');
    this.titleControls.textContent = this.touch ? t('controlsTouch') : t('controlsKeyboard');
    if (this.pauseControls) {
      this.pauseControls.textContent = this.touch ? t('controlsTouch') : t('controlsKeyboard');
    }
    this.setBest(this.best, false);
    this.setMuted(this.game.audio.muted);
  }

  setTouch(on) {
    if (this.touch === on) return;
    this.touch = on;
    this.root.classList.toggle('is-touch', on);
    const line = this.i18n.t(on ? 'controlsTouch' : 'controlsKeyboard');
    this.titleControls.textContent = line;
    if (this.pauseControls) this.pauseControls.textContent = line;
  }

  setState(state) {
    this.state = state;
    this.root.dataset.state = state;
    this.screens.title.hidden = state !== 'title';
    this.screens.paused.hidden = state !== 'paused';
    this.screens.gameover.hidden = state !== 'gameover';
    this.screens.finished.hidden = state !== 'finished';
    if (state === 'title' || state === 'gameover' || state === 'finished') this.hideToast();
    if (this.focusTimer) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
    if (state === 'paused') this.focusSoon(byId('resume-btn'));
    else if (state === 'gameover') this.focusSoon(byId('again-btn'));
    else if (state === 'finished') this.focusSoon(byId('finish-again-btn'));
  }

  focusSoon(el) {
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      try {
        el.focus({ preventScroll: true });
      } catch (error) {
        el.focus();
      }
    }, 80);
  }

  updateHud(data) {
    const meters = Math.max(0, Math.floor(data.distance));
    if (meters !== this.cache.distance) {
      this.cache.distance = meters;
      this.hudDistance.textContent = String(meters);
    }
    if (data.crystals !== this.cache.crystals) {
      this.cache.crystals = data.crystals;
      this.hudCrystals.textContent = String(data.crystals);
    }
    const time = formatTime(data.seconds);
    if (time !== this.cache.time) {
      this.cache.time = time;
      this.hudTime.textContent = time;
    }
    if (data.hearts !== this.cache.hearts) {
      this.cache.hearts = data.hearts;
      this.setHearts(data.hearts);
    }
    const held = !!data.wedgeHeld;
    if (held !== this.cache.wedge) {
      this.cache.wedge = held;
      this.wedgeChip.classList.toggle('is-out', !held);
    }
  }

  setHearts(n) {
    for (let i = 0; i < this.hearts.length; i += 1) {
      this.hearts[i].classList.toggle('is-lost', i >= n);
    }
  }

  showBiome(key) {
    if (!key) return;
    this.biomeBanner.textContent = this.i18n.biome(key);
    this.biomeBanner.classList.add('is-on');
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.bannerTimer = null;
      this.biomeBanner.classList.remove('is-on');
    }, 2400);
  }

  hint(key, ms = 5200) {
    if (!key) return;
    this.toast.textContent = this.i18n.t(key);
    this.toast.classList.add('is-on');
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      this.hintTimer = null;
      this.toast.classList.remove('is-on');
    }, ms);
  }

  hideToast() {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
    this.toast.classList.remove('is-on');
  }

  setMuted(muted) {
    this.muteBtn.classList.toggle('is-muted', muted);
    this.muteBtn.setAttribute('aria-pressed', String(muted));
    const action = this.i18n.t(muted ? 'unmute' : 'mute');
    this.muteBtn.setAttribute('aria-label', action);
    this.muteBtn.title = action;
    this.pauseMuteState.textContent = action;
    this.pauseMuteBtn.setAttribute('aria-pressed', String(muted));
    this.pauseMuteBtn.classList.toggle('is-muted', muted);
  }

  showOver(reason, data) {
    this.overHeading.textContent = this.i18n.t(reason === 'hearts' ? 'outOfHearts' : 'caught');
    this.overEyebrow.textContent = this.i18n.t('title');
    this.fillResults(this.screens.gameover, data);
    this.setState('gameover');
  }

  showFinish(data) {
    this.finishEyebrow.textContent = this.i18n.biome('valley');
    this.fillResults(this.screens.finished, data);
    this.setState('finished');
  }

  fillResults(screen, data) {
    const set = (key, value) => {
      const el = screen.querySelector(`[data-res="${key}"]`);
      if (el) el.textContent = value;
    };
    set('distance', `${Math.max(0, Math.floor(data.distance))} ${this.i18n.t('unitMeters')}`);
    set('crystals', String(data.crystals));
    set('hearts', String(data.hearts));
    set('time', formatTime(data.seconds));
    set('score', String(data.score));
    set('best', data.newBest ? this.i18n.t('newBest') : this.i18n.t('bestLine', { n: this.best }));
  }

  setBest(score, save = true) {
    const n = Math.max(0, Math.floor(score));
    this.best = n;
    if (save) this.saveBest(n);
    this.titleBest.textContent = n > 0 ? this.i18n.t('bestLine', { n }) : '';
    if (!this.screens.gameover.hidden) {
      const overBest = this.screens.gameover.querySelector('[data-res="best"]');
      if (overBest && !overBest.textContent) overBest.textContent = this.i18n.t('bestLine', { n });
    }
    if (!this.screens.finished.hidden) {
      const finBest = this.screens.finished.querySelector('[data-res="best"]');
      if (finBest && !finBest.textContent) finBest.textContent = this.i18n.t('bestLine', { n });
    }
  }

  loadBest() {
    try {
      const raw = window.localStorage.getItem(STORAGE.best);
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch (error) {
      return 0;
    }
  }

  saveBest(score) {
    try {
      window.localStorage.setItem(STORAGE.best, String(score));
    } catch (error) {
      /* storage may be disabled; the run still works */
    }
  }
}

export { formatTime };
