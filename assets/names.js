// Leaderboard names: cleanup and a wide obscenity filter, shared by the games and the server.
// Russian and English roots; catches Latin lookalikes ("cyka"), transliteration ("blyat"),
// leetspeak ("sh1t"), separators ("х.у.й", "f u c k") and stretched letters ("бляяя").
// Strict on purpose: a rejected name only asks the player for another one.
// Browser: window.SDENames. Node (the leaderboard function): globalThis.SDENames after require().
(function (root, factory) {
  root.SDENames = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var MIN = 2, MAX = 16;

  // Latin letters and digits that look like Cyrillic ones.
  var LOOK = {
    a: "а", b: "в", c: "с", e: "е", h: "н", i: "и", k: "к", m: "м", n: "п", o: "о", p: "р", r: "г", t: "т", u: "и", x: "х", y: "у",
    0: "о", 3: "з", 4: "ч", 6: "б", 9: "я",
  };
  // Phonetic transliteration; two-letter sounds are tried first.
  var SOUND2 = { sh: "ш", ch: "ч", zh: "ж", kh: "х", ts: "ц", ya: "я", yu: "ю", yo: "е", ye: "е", ja: "я", ju: "ю", jo: "е" };
  var SOUND1 = {
    a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
    q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "х", y: "й", z: "з", 0: "о", 3: "з", 4: "ч", 6: "б", 9: "я",
  };
  // Cyrillic lookalikes and leetspeak back to Latin, for the English roots.
  var LATIN = {
    "а": "a", "в": "b", "г": "r", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "п": "n", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "ь": "b",
    0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b",
  };

  // Matched anywhere in the name with separators removed and repeated letters collapsed.
  var RU = [
    "хуй", "хуе", "хуя", "хую", "хуи", "хули", "пизд", "пезд", "ебан", "ебат", "ебал", "ебло", "ебуч", "ебну", "ебет", "ебин", "еблан",
    "ебись", "ебн", "заеб", "отьеб", "уеб", "выеб", "наеб", "поеб", "сьеб", "доеб", "проеб", "разьеб", "вьеб", "долбоеб", "долбаеб",
    "блят", "бляд", "сучар", "сукин", "мудак", "мудил", "мудоз", "гандон", "гондон", "шлюх", "шлух", "шалав", "пидор", "пидар", "пидр",
    "педик", "педераст", "залуп", "мандав", "мандов", "дроч", "херн", "нахер", "похер", "охуе", "охуи", "жоп", "засран", "обосра", "срат",
    "срака", "насра", "говн", "ублюд", "гитлер", "нацист", "фашист", "свастик", "зигхайл", "жидов", "жидяр", "ниггер", "пиндос",
  ];
  // Matched only at the start of a word: inside other words they are innocent ("корабля", "команда").
  var RU_START = ["бля", "сука", "суки", "суку", "сучк", "манда", "мразь", "тварь", "чурк"];
  var EN = [
    "fuck", "fuk", "fck", "fvck", "phuck", "shit", "bitch", "biatch", "cunt", "cnt", "asshole", "arsehole", "bastard", "slut", "whore",
    "faggot", "nigger", "nigga", "retard", "rapist", "nazi", "hitler", "siegheil", "porn", "penis", "vagina", "dildo", "jizz", "wank",
    "twat", "cocksuck", "dickhead", "motherf", "milf", "pussy", "cumshot",
  ];
  // Roots whose doubled letters are the point: collapsed they would match "k" or "Bob".
  var EN_DOUBLE = ["kkk", "boob"];
  // Whole words only: as parts of words they are innocent ("class", "title", "cockpit").
  var EN_WORDS = ["ass", "arse", "anal", "anus", "cum", "tit", "tits", "titty", "dick", "dicks", "cock", "cocks", "prick", "fag", "fags", "kys", "nig", "rape"];

  function collapse(s) { return s.replace(/(.)\1+/gu, "$1"); }
  function map(s, table) {
    var out = "";
    for (var ch of s) out += table[ch] || ch;
    return out;
  }
  function translit(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var two = SOUND2[s.substr(i, 2)];
      if (two) { out += two; i++; continue; }
      out += SOUND1[s[i]] || s[i];
    }
    return out;
  }
  function hasAny(s, list) {
    for (var i = 0; i < list.length; i++) if (s.indexOf(list[i]) >= 0) return true;
    return false;
  }
  function startsAny(s, list) {
    for (var i = 0; i < list.length; i++) if (s.indexOf(list[i]) === 0) return true;
    return false;
  }
  var RU_C = RU.map(collapse), RU_START_C = RU_START.map(collapse), EN_C = EN.map(collapse);

  function rude(name) {
    var lower = name.toLowerCase().replace(/ё/g, "е").replace(/ъ/g, "ь");
    if (/14\s*88/.test(lower)) return true;
    var tokens = lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    // Letters spread out with dots, dashes or short pieces ("х у й", "f.u.c.k") are read as one word;
    // ordinary words are checked one by one, so "Mike Bat" does not glue into a root.
    var spread = /[._-]/.test(lower) || tokens.some(function (t) { return Array.from(t).length <= 2; });
    var words = spread ? tokens.concat([tokens.join("")]) : tokens;
    for (var i = 0; i < words.length; i++) {
      var s = words[i], ru = [collapse(map(s, LOOK)), collapse(translit(s))], latin = map(s, LATIN);
      for (var j = 0; j < ru.length; j++) {
        if (hasAny(ru[j], RU_C) || startsAny(ru[j], RU_START_C)) return true;
      }
      if (hasAny(collapse(latin), EN_C) || hasAny(latin, EN_DOUBLE) || EN_WORDS.indexOf(latin) >= 0) return true;
    }
    return false;
  }

  // { ok: true, name } with spaces tidied, or { ok: false, reason: "short" | "long" | "chars" | "rude" }.
  function check(input) {
    var name = String(input == null ? "" : input).normalize("NFKC").replace(/\s+/g, " ").trim();
    var length = Array.from(name).length;
    if (length < MIN) return { ok: false, reason: "short" };
    if (length > MAX) return { ok: false, reason: "long" };
    if (!/^[\p{L}\p{N} ._-]+$/u.test(name) || !/\p{L}/u.test(name)) return { ok: false, reason: "chars" };
    if (rude(name)) return { ok: false, reason: "rude" };
    return { ok: true, name: name };
  }

  return { check: check, MIN: MIN, MAX: MAX };
});
