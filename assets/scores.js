// Leaderboard panel for the site's games: the top 25, and a form to save the run just played.
// Needs names.js first. SDEScores.mount(element, { game, lang, score, ms }) after a run;
// without score it only shows the table. A `board` (LG4, "<name>-daily-YYYY-MM-DD")
// lists and saves on that day's board instead of the game's main one. The name is
// remembered in this browser.
(function () {
  "use strict";

  // The leaderboard function lives on Netlify; the pages may be served from elsewhere (GitHub Pages).
  var API = "https://animated-squirrel-692fce.netlify.app/.netlify/functions/scores";
  var NAME_KEY = "sde.scores.name";
  var TEXT = {
    en: {
      title: "Top 25", daily: "Daily {date}", name: "Your name", save: "Save", saving: "Saving…", rank: "You are number {n}", kept: "Your best run is higher: number {n}",
      out: "Saved, but not in the top 25 this time", empty: "No runs yet. Be the first", loading: "Loading…",
      offline: "The leaderboard is not available right now", short: "At least 2 characters", long: "At most 16 characters",
      chars: "Letters, digits, spaces, dots and dashes only", rude: "Please pick another name", rate: "Too fast: try again in a few seconds",
      score: "This run cannot be saved", board: "This run cannot be saved to that board", boardDate: "That day's board is closed",
    },
    ru: {
      title: "Топ-25", daily: "Забег дня {date}", name: "Ваше имя", save: "Сохранить", saving: "Сохраняю…", rank: "Вы на {n}-м месте", kept: "Ваш рекорд выше: {n}-е место",
      out: "Сохранено, но в топ-25 в этот раз не попало", empty: "Пока пусто — будьте первым", loading: "Загружаю…",
      offline: "Таблица рекордов сейчас недоступна", short: "Хотя бы 2 символа", long: "Не больше 16 символов",
      chars: "Только буквы, цифры, пробел, точка и дефис", rude: "Выберите, пожалуйста, другое имя", rate: "Слишком часто: попробуйте через пару секунд",
      score: "Этот результат сохранить нельзя", board: "Этот забег нельзя сохранить в эту таблицу", boardDate: "Таблица этого дня закрыта",
    },
  };
  var CSS = [
    ".sde-board{margin:18px 0 0;text-align:left;font:500 14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#e8edf3}",
    ".sde-board form{display:flex;gap:8px}",
    ".sde-board input{flex:1;min-width:0;padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.06);color:inherit;font:inherit;user-select:text;-webkit-user-select:text}",
    ".sde-board input:focus{outline:2px solid var(--sde-accent,#ffb23f);outline-offset:1px}",
    ".sde-board button{padding:10px 14px;border:0;border-radius:10px;background:var(--sde-accent,#ffb23f);color:#1b1206;font-family:inherit;font-size:14px;font-weight:700;line-height:1;cursor:pointer}",
    ".sde-board button:disabled{opacity:.55;cursor:default}",
    ".sde-board .msg{min-height:20px;margin:6px 2px 0;color:#a3afbf;font-size:13px}",
    ".sde-board h3{margin:14px 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a3afbf}",
    ".sde-board ol{max-height:236px;margin:0;padding:0 4px 0 0;overflow:auto;list-style:none;counter-reset:r}",
    ".sde-board li{display:flex;gap:10px;padding:5px 8px;border-radius:8px;counter-increment:r}",
    ".sde-board li::before{content:counter(r);width:22px;color:#77839a;font-variant-numeric:tabular-nums}",
    ".sde-board li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".sde-board li b{font-variant-numeric:tabular-nums}",
    ".sde-board li.me{background:rgba(255,178,63,.14);color:#fff}",
    ".sde-board li.note{color:#77839a;counter-increment:none}",
    ".sde-board li.note::before{content:none}",
  ].join("");

  function fmt(text, n) { return text.replace("{n}", n); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function remembered() {
    try { return localStorage.getItem(NAME_KEY) || ""; } catch (error) { return ""; }
  }
  function remember(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch (error) {}
  }

  function mount(root, opts) {
    if (!document.getElementById("sde-board-css")) {
      var style = el("style");
      style.id = "sde-board-css";
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    var T = TEXT[opts.lang === "ru" ? "ru" : "en"];
    var box = el("div", "sde-board"), list = el("ol"), mine = "", saved = false;
    var boardName = typeof opts.board === "string" && opts.board ? opts.board : "";
    var day = /-daily-(\d{4}-\d{2}-\d{2})$/.exec(boardName);
    var title = day ? T.daily.replace("{date}", day[1]) : T.title;
    root.textContent = "";
    root.appendChild(box);

    function render(entries, note) {
      list.textContent = "";
      if (note || !entries.length) list.appendChild(el("li", "note", note || T.empty));
      entries.forEach(function (entry) {
        var row = el("li", entry.name.toLowerCase() === mine.toLowerCase() ? "me" : "");
        row.appendChild(el("span", "", entry.name));
        row.appendChild(el("b", "", String(entry.score)));
        list.appendChild(row);
      });
    }

    if (opts.score > 0) {
      var form = el("form"), input = el("input"), button = el("button", "", T.save), msg = el("p", "msg");
      input.maxLength = 24;
      input.placeholder = T.name;
      input.value = remembered();
      input.autocomplete = "nickname";
      input.spellcheck = false;
      button.type = "submit";
      form.appendChild(input);
      form.appendChild(button);
      box.appendChild(form);
      box.appendChild(msg);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var checked = window.SDENames.check(input.value);
        if (!checked.ok) { msg.textContent = T[checked.reason]; return; }
        button.disabled = input.disabled = true;
        msg.textContent = T.saving;
        var post = { game: opts.game, name: checked.name, score: opts.score, ms: opts.ms };
        if (boardName) post.board = boardName;
        fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(post) })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            if (!data.ok) {
              button.disabled = input.disabled = data.error === "score";
              var key = data.error === "name" ? data.reason : data.error === "board" && data.reason === "date" ? "boardDate" : data.error;
              msg.textContent = T[key] || T.offline;
              return;
            }
            mine = checked.name;
            saved = true;
            remember(mine);
            form.remove();
            msg.textContent = data.rank ? fmt(data.kept ? T.kept : T.rank, data.rank) : T.out;
            render(data.entries);
          })
          .catch(function () {
            button.disabled = input.disabled = false;
            msg.textContent = T.offline;
          });
      });
    }
    box.appendChild(el("h3", "", title));
    box.appendChild(list);
    render([], T.loading);
    var url = API + "?game=" + encodeURIComponent(opts.game);
    if (boardName) url += "&board=" + encodeURIComponent(boardName);
    fetch(url)
      .then(function (response) { return response.json(); })
      .then(function (data) { if (!saved) render(data.entries || []); })
      .catch(function () { if (!saved) render([], T.offline); });
  }

  window.SDEScores = { mount: mount };
})();
