// All Landslide UI strings, English and Russian, in one dictionary. No DOM here.

const TEXT = {
  en: {
    langName: 'English',
    title: 'Landslide',
    tagline: 'The ground is giving way. Run right, and throw your one wedge to climb.',
    start: 'Press any key or tap to start',
    controlsKeyboard: 'A/D or arrows to run · Space/W to jump · click or J to throw the wedge · K or right-click to call it back',
    controlsTouch: 'Left: run · right: jump and wedge · tap the world to throw',
    best: 'Best',
    bestLine: 'Best {n}',
    score: 'Score',
    distance: 'Distance',
    crystals: 'Crystals',
    hearts: 'Hearts',
    time: 'Time',
    playAgain: 'Play again',
    resume: 'Resume',
    paused: 'Paused',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    mute: 'Mute sound',
    unmute: 'Turn sound on',
    pause: 'Pause',
    back: 'Super Duper Engine',
    caught: 'The collapse caught you',
    outOfHearts: 'Out of hearts',
    finishTitle: 'You reached the valley',
    finishSub: 'The ground is calm here.',
    overSub: 'The run is over.',
    newBest: 'New best!',
    biomes: {
      meadow: 'Meadow',
      hills: 'Rocky Hills',
      canyon: 'Canyon',
      cave: 'Cave',
      valley: 'Safe Valley',
    },
    rotate: 'Turn your phone sideways to see more',
    hintThrow: 'Click to throw the wedge. It sticks in rock and becomes a ledge: climb walls and cross gaps on it.',
    hintWall: 'Higher than a jump. Stick the wedge in the glowing crack and climb onto it.',
    hintCrystal: 'Crystals: every 10 bring back a heart.',
    hintCrystalHeart: '+1 heart for 10 crystals',
    hintRecall: 'Call it back mid-jump, then throw again to climb higher.',
    hintGap: 'Too far to jump. Throw the wedge at the glowing crack on the far wall and jump onto it.',
    jump: 'Jump',
    wedge: 'Wedge',
    left: 'Left',
    right: 'Right',
    pauseBtn: 'Pause game',
    canvasAria: 'A climber runs right through collapsing ground. One wedge can be thrown into rock to make a ledge. Use the keyboard, mouse or touch controls.',
    statsDistance: 'Distance',
    statsCrystals: 'Crystals',
    statsHearts: 'Hearts left',
    statsTime: 'Time',
    unitMeters: 'm',
    touchHint: 'Tap the world to throw the wedge',
    soundLabel: 'Sound',
  },
  ru: {
    langName: 'Русский',
    title: 'Обвал',
    tagline: 'Земля уходит из-под ног. Беги вправо и бросай свой единственный клин, чтобы взбираться.',
    start: 'Нажми любую клавишу или коснись экрана',
    controlsKeyboard: 'A/D или стрелки — бег · Space/W — прыжок · клик или J — бросить клин · K или правый клик — вернуть',
    controlsTouch: 'Слева — бег · справа — прыжок и клин · коснись мира, чтобы бросить клин',
    best: 'Рекорд',
    bestLine: 'Рекорд {n}',
    score: 'Счёт',
    distance: 'Дистанция',
    crystals: 'Кристаллы',
    hearts: 'Сердца',
    time: 'Время',
    playAgain: 'Играть снова',
    resume: 'Продолжить',
    paused: 'Пауза',
    soundOn: 'Звук включён',
    soundOff: 'Звук выключен',
    mute: 'Выключить звук',
    unmute: 'Включить звук',
    pause: 'Пауза',
    back: 'Super Duper Engine',
    caught: 'Обвал догнал тебя',
    outOfHearts: 'Сердца кончились',
    finishTitle: 'Ты дошёл до долины',
    finishSub: 'Здесь земля спокойна.',
    overSub: 'Забег окончен.',
    newBest: 'Новый рекорд!',
    biomes: {
      meadow: 'Луг',
      hills: 'Каменные холмы',
      canyon: 'Каньон',
      cave: 'Пещера',
      valley: 'Тихая долина',
    },
    rotate: 'Поверни телефон — будет видно больше',
    hintThrow: 'Клик — бросок клина. Он втыкается в камень и становится уступом: по нему забираются на стены и проходят провалы.',
    hintWall: 'Выше прыжка. Воткни клин в светящуюся трещину и заберись по нему.',
    hintCrystal: 'Кристаллы: каждые 10 возвращают сердце.',
    hintCrystalHeart: '+1 сердце за 10 кристаллов',
    hintRecall: 'Верни клин в прыжке и брось снова, чтобы забраться выше.',
    hintGap: 'Не допрыгнуть. Брось клин в светящуюся трещину на дальней стене и прыгай на него.',
    jump: 'Прыжок',
    wedge: 'Клин',
    left: 'Влево',
    right: 'Вправо',
    pauseBtn: 'Пауза',
    canvasAria: 'Скалолаз бежит вправо по осыпающейся земле. Один клин можно бросить в камень, и он станет уступом. Управление клавиатурой, мышью или касанием.',
    statsDistance: 'Дистанция',
    statsCrystals: 'Кристаллы',
    statsHearts: 'Осталось сердец',
    statsTime: 'Время',
    unitMeters: 'м',
    touchHint: 'Коснись мира, чтобы бросить клин',
    soundLabel: 'Звук',
  },
};

export function pickLang(search = '') {
  let requested = null;
  try {
    requested = new URLSearchParams(search).get('lang');
  } catch (error) {
    requested = null;
  }
  if (requested === 'ru' || requested === 'en') return requested;
  let langs = [];
  try {
    langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
  } catch (error) {
    langs = [];
  }
  for (let i = 0; i < langs.length; i += 1) {
    const tag = String(langs[i] || '').toLowerCase();
    if (tag.startsWith('ru') || tag.startsWith('be') || tag.startsWith('kk')) return 'ru';
  }
  return 'en';
}

export function createI18n(lang) {
  const dict = TEXT[lang] || TEXT.en;
  function t(key, vars) {
    const raw = dict[key];
    if (typeof raw !== 'string') return key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
  }
  function biome(key) {
    return dict.biomes[key] || key;
  }
  return { lang, dict, t, biome };
}

export const BIOME_NAME_KEYS = ['meadow', 'hills', 'canyon', 'cave', 'valley'];
