'use strict';
(function () {
  const SAVE = 'chekist.save.v2', DBGKEY = 'chekist.debug';
  const COST = { hit: 15, miss: 30 };
  const MAXATT = 3; /* в бланке постановления три строки для оснований */
  const app = document.getElementById('app');
  const overlay = document.getElementById('overlay');
  let S = null;
  let DBG = /[?&]debug\b/.test(location.search);
  try { DBG = DBG || localStorage.getItem(DBGKEY) === '1'; } catch (e) { /* хранилище недоступно */ }
  const ui = { sel: null, sverka: false, verdict: null, z: 20, toastT: 0, busy: false, slam: false };
  let MUTE = false;
  try { MUTE = localStorage.getItem('chekist.mute') === '1'; } catch (e) { /* хранилище недоступно */ }

  const $ = (q, el) => (el || document).querySelector(q);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fill = t => String(typeof t === 'function' ? t(S) : t).replace(/\{name\}/g, S.name);
  const T = t => esc(fill(t));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sgn = n => (n > 0 ? '+' : '') + n;

  /* ---------- состояние ---------- */
  function newState(name) {
    return { v: 2, name, day: 0, phase: 'guide', step: 0, trust: 5, viol: 0, blind: 0, cover: 0, stretch: 0, flags: [], time: 0, cases: {}, cards: [], cur: null, ending: null };
  }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { /* без хранилища играем до закрытия вкладки */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (!s || s.v !== 2) return null; s.stretch = s.stretch || 0; return s; } catch (e) { return null; } }
  function wipe() { try { localStorage.removeItem(SAVE); } catch (e) { /* нечего стирать */ } }
  const day = () => DAYS[S.day];
  const rt = id => S.cases[id] || (S.cases[id] = { found: [], struck: [], att: [], unlocked: [], fresh: [], hits: [], verdict: null, refused: 0, pos: {} });
  const timeLeft = () => day().minutes - S.time;
  const spend = m => { S.time = Math.min(day().minutes, S.time + m); };
  const hhmm = m => { const t = 9 * 60 + m; return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const allDone = () => day().cases.every(id => rt(id).verdict);
  const wOf = (cs, f) => cs.findings[f].w || 2;
  /* вес подшитых оснований, относящихся к решению: прямая улика — 2, косвенная — 1 */
  function score(cs, c, v) {
    return c.att.filter(f => !c.struck.includes(f) && (v.grounds || []).includes(f)).reduce((s, f) => s + wOf(cs, f), 0);
  }
  const isFounded = (cs, c, v) => !v.grounds || score(cs, c, v) >= (v.need || 2);
  const live = c => c.att.filter(f => !c.struck.includes(f));
  /* «натяжка»: обвинение держится на одних косвенных уликах */
  const isStretch = (cs, c, v) => !!v.grounds && v.grounds.every(f => cs.findings[f].kind === 'in') && isFounded(cs, c, v)
    && live(c).filter(f => v.grounds.includes(f)).every(f => wOf(cs, f) === 1);

  /* ---------- звук: синтез, без файлов ---------- */
  let AC = null;
  function snd(kind) {
    if (MUTE) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const t = AC.currentTime, out = AC.createGain(); out.connect(AC.destination);
      const noise = (at, dur, freq, q, vol, type) => {
        const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
        const src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
        src.buffer = buf; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
        src.connect(f); f.connect(g); g.connect(out); src.start(t + at);
      };
      const tone = (at, dur, f0, f1, vol, type) => {
        const o = AC.createOscillator(), g = AC.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
        g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
        o.connect(g); g.connect(out); o.start(t + at); o.stop(t + at + dur + 0.02);
      };
      if (kind === 'paper') noise(0, 0.14, 2600, 0.7, 0.10);
      if (kind === 'folder') { noise(0, 0.22, 1400, 0.6, 0.16); tone(0.02, 0.09, 140, 70, 0.10); }
      if (kind === 'pick') noise(0, 0.035, 3400, 2, 0.14);
      if (kind === 'hit') { noise(0, 0.03, 3000, 3, 0.3); tone(0, 0.05, 520, 300, 0.07, 'square'); noise(0.09, 0.03, 3000, 3, 0.3); tone(0.09, 0.05, 520, 300, 0.07, 'square'); tone(0.2, 0.7, 1760, 1740, 0.07); }
      if (kind === 'miss') { tone(0, 0.16, 130, 80, 0.18, 'triangle'); noise(0, 0.08, 500, 1, 0.12); }
      if (kind === 'clip') { noise(0, 0.03, 5200, 4, 0.18); noise(0.05, 0.02, 6400, 4, 0.12); }
      if (kind === 'strike') { noise(0, 0.42, 1900, 1.4, 0.2); noise(0.1, 0.3, 2500, 2, 0.1); }
      if (kind === 'knock') { tone(0, 0.07, 190, 110, 0.3, 'triangle'); tone(0.16, 0.07, 190, 110, 0.3, 'triangle'); noise(0, 0.05, 800, 1, 0.1); noise(0.16, 0.05, 800, 1, 0.1); }
      if (kind === 'stamp') { tone(0, 0.24, 110, 38, 0.6); noise(0, 0.12, 320, 0.8, 0.5, 'lowpass'); noise(0.01, 0.05, 2200, 1, 0.12); }
    } catch (e) { /* без звука */ }
  }

  function dirDoc() {
    const lines = [];
    for (let i = 0; i <= S.day; i++) if ((DAYS[i].act || 1) === (day().act || 1)) DAYS[i].directives.forEach(d => lines.push({ id: d.id, k: null, v: d.t, fresh: i === S.day }));
    return { id: 'dir', kind: 'dir', title: 'Памятка уполномоченного', sub: 'для служебного пользования', lines };
  }
  function visibleDocs(id) {
    const c = rt(id);
    return CASES[id].docs.filter(d => !d.locked || c.unlocked.includes(d.id)).concat([dirDoc()]);
  }

  /* ---------- маршрутизация ---------- */
  function go() {
    closeModal();
    if (!S) return renderTitle();
    ({ guide: renderGuide, brief: renderBrief, desk: renderDesk, evening: renderEvening, inter: renderInter, end: renderEnding }[S.phase] || renderTitle)();
  }

  /* ---------- титул ---------- */
  function renderTitle() {
    const sv = load();
    app.innerHTML = `<div class="title-scr">
      <div class="folder-art">
        <div class="fa-top">Н К В Д &nbsp; С С С Р</div>
        <div class="fa-h">ЧЕКИСТ</div>
        <div class="fa-sub">Дело № <span>____</span> &nbsp; Начато: 20.VIII.1934 &nbsp; Окончено: <span>____</span></div>
        <div class="fa-keep">Хранить вечно</div>
        <div class="stamp fa-stamp">СОВ. СЕКРЕТНО</div>
        <div class="fa-btns">
          ${sv ? '<button class="btn" data-act="cont">Продолжить</button>' : ''}
          <button class="btn" data-act="new">Новая игра</button>
        </div>
      </div>
      <div class="title-foot">Пролог, акты первый и второй · 1934–1937${DBG ? ' · режим отладки (F2)' : ''}</div>
    </div>`;
  }

  function renderName() {
    app.innerHTML = `<div class="center-scr"><form class="sheet form-sheet" id="nameform">
      <div class="doc-org">${esc(ORG)}</div>
      <h2>Личный листок по учёту кадров</h2>
      <label class="fl"><span>Фамилия</span><input id="nm" maxlength="18" autocomplete="off" value="Вересов"></label>
      <div class="fl"><span>Год рождения</span><b>1909</b></div>
      <div class="fl"><span>Соц. происхождение</span><b>из рабочих</b></div>
      <div class="fl"><span>Образование</span><b>семилетка, курсы ОГПУ</b></div>
      <div class="fl"><span>Партийность</span><b>член ВЛКСМ с 1927 г.</b></div>
      <div class="fl"><span>Назначен</span><b>пом. уполномоченного, с 20.VIII.1934</b></div>
      <p class="fine">Фамилия будет стоять под каждым вашим постановлением.</p>
      <button class="btn" type="submit">Расписаться и приступить</button>
    </form></div>`;
    $('#nameform').addEventListener('submit', e => {
      e.preventDefault();
      const n = $('#nm').value.trim() || 'Вересов';
      S = newState(n); save(); go();
    });
    $('#nm').select();
  }

  /* ---------- порядок работы: что делать, как и зачем. Только то, что видно на столе ---------- */
  const GUIDE = [
    ['Возьмите папку', 'Папки лежат слева, во «Входящих». Щелчок по папке выкладывает бумаги на стол. Их можно двигать мышью; «Разложить» (клавиша R) собирает их обратно в колонки.', 'Пока не сданы все папки, день не закончить.'],
    ['Прочтите всё', 'Анкета — кого взяли и за что. Дальше заявления, акты, протоколы, справки. «Памятка» — указания, которые действуют сегодня. На жёлтом листке слева написано, с чего начать.', 'Бумаги писали разные люди, и сходятся они не всегда. Дело решают расхождения.'],
    ['Сверяйте строки', 'Нажмите «Сверка» (пробел), щёлкните строку в одной бумаге, потом строку в другой или в «Памятке». Если строки расходятся или подтверждают друг друга, факт попадает в «Справку по делу» справа: «в пользу обвиняемого», «уличает» или «уличает косвенно».', 'К постановлению подшиваются только факты из справки.'],
    ['Считайте время', `Рабочий день — с 9:00 до 18:00 на все папки. Удачная сверка стоит ${COST.hit} минут. Промах — ${COST.miss}; если одна из строк ещё пригодится с другой бумагой — ${COST.hit}. После 18:00 сверять нельзя, можно только подшивать и подписывать.`, 'Тыкать наугад дорого. Сначала читайте, потом сверяйте.'],
    ['Запрашивайте недостающее', 'Под справкой бывают «Запросы»: передопрос, справка, изъятие. Запрос стоит от 45 минут до часа с четвертью и приносит новую бумагу. Её тоже надо сверить с остальными.', 'Часть фактов без запроса не установить.'],
    ['Выберите постановление', `Справа отметьте решение и подшейте к нему факты из справки кнопкой «подшить». В бланке ${MAXATT} строки для оснований. Прямая улика весит больше косвенной.`, 'Постановление читает начальник. Решение без оснований он сочтёт необоснованным.'],
    ['Уберите противоречия', 'Запись, которая противоречит выбранному решению, подсвечивается в справке, и «Подписать» не работает. Нажмите у этой записи «вычеркнуть» — или измените решение. Вычеркнутое можно восстановить.', 'С противоречием в справке постановление не утвердят.'],
    ['Подпишите и сдайте', 'После подписи приходит резолюция начальника и меняется «Доверие руководства» наверху. Упадёт до нуля — уволят. Вечером приносят газету: в ней то, что вышло из ваших постановлений. Всё подписанное лежит в «Картотеке».', 'По газете и картотеке видно, чем кончилось каждое дело.'],
  ];
  function guideHTML() {
    return `<div class="kicker">Порядок работы</div><h2>Как вести дело</h2>
      <ol class="guide">${GUIDE.map(g => `<li><b>${g[0]}</b><p>${g[1]}</p><p class="why"><i>Зачем</i>${g[2]}</p></li>`).join('')}</ol>`;
  }
  function renderGuide() {
    app.innerHTML = `<div class="center-scr"><div class="sheet guide-sheet">${guideHTML()}
      <div class="guide-foot"><p class="fine">Игра сохраняется сама. Этот лист лежит в «Меню».</p><button class="btn" data-act="guideok">К работе</button></div>
    </div></div>`;
  }

  /* ---------- вводная дня ---------- */
  function renderBrief() {
    const d = day();
    app.innerHTML = `<div class="center-scr"><div class="sheet brief">
      <div class="kicker">${esc(d.kicker)}</div>
      <h1>${esc(d.title)}</h1>
      <div class="dateline">${esc(d.date)} · ${esc(d.place)}</div>
      ${d.brief.map(p => `<p>${T(p)}</p>`).join('')}
      <div class="newdir"><b>К руководству</b>${d.directives.map(x => `<div>— ${esc(x.t)}</div>`).join('')}</div>
      <button class="btn" data-act="todesk">К столу</button>
    </div></div>`;
  }

  /* ---------- стол ---------- */
  function renderDesk() {
    const d = day();
    app.innerHTML = `<div class="desk">
      <header class="bar">
        <div class="bar-l"><b>${esc(d.office || 'Студенецкое РО НКВД')}</b><span>${esc(d.date)}</span></div>
        <div class="bar-c"><span class="clock" id="clock"></span><span class="trust" id="trust"></span></div>
        <div class="bar-r"><button data-act="cards">Картотека</button><button data-act="papers">Газеты</button><button data-act="menu">Меню</button></div>
      </header>
      <aside class="inbox" id="inbox"></aside>
      <main class="surface" id="surface"></main>
      <aside class="side" id="side"></aside>
      <div class="toast" id="toast"></div>
    </div>`;
    refresh(true);
  }
  function refresh(full) { if (!$('#clock')) return; renderBar(); renderInbox(); if (full) renderSurface(); else markLines(); renderSide(); }

  function renderBar() {
    const left = timeLeft();
    $('#clock').innerHTML = `<b>${hhmm(S.time)}</b> <i>${left > 0 ? 'рабочий день до ' + hhmm(day().minutes) : 'рабочий день окончен'}</i>`;
    $('#clock').classList.toggle('late', left <= 60);
    const words = S.trust >= 8 ? 'на хорошем счету' : S.trust >= 5 ? 'претензий нет' : S.trust >= 3 ? 'есть вопросы' : 'на карандаше';
    let pips = ''; for (let i = 0; i < 10; i++) pips += `<s class="${i < S.trust ? 'on' : ''}"></s>`;
    $('#trust').innerHTML = `<i>Доверие руководства</i><span class="pips${S.trust <= 2 ? ' low' : ''}">${pips}</span><em>${words}</em>`;
  }

  function renderInbox() {
    const d = day();
    let h = '<h3>Входящие</h3>';
    d.cases.forEach(id => {
      const cs = CASES[id], c = rt(id);
      const st = c.verdict ? 'сдано' : (S.cur === id ? 'на столе' : (c.found.length || c.unlocked.length ? 'в работе' : 'новое'));
      h += `<button class="folder${S.cur === id ? ' cur' : ''}${c.verdict ? ' done' : ''}${cs.finale ? ' red' : ''}" data-act="open" data-arg="${id}">
        <span class="f-no">Дело № ${cs.no}</span><span class="f-t">${esc(cs.title)}</span><span class="f-c">${esc(cs.charge)}</span><span class="f-st">${st}</span>${c.verdict ? `<span class="f-stamp">${esc(cs.verdicts.find(x => x.id === c.verdict).stamp)}</span>` : ''}</button>`;
    });
    if (allDone()) h += '<button class="btn wide" data-act="endday">Сдать дела. Конец дня</button>';
    const note = (S.cur && !rt(S.cur).verdict && CASES[S.cur].note) || d.note;
    h += `<div class="sticky">${esc(note)}</div>`;
    if (S.trust <= 2 && !allDone()) h += `<div class="sticky warnnote">${esc(d.warn || 'Ломов спрашивал у Зинаиды Павловны, где лежат обходные листы. Про тебя спрашивал. Ещё одна бумага ему поперёк — и стол освободишь. — И. С.')}</div>`;
    $('#inbox').innerHTML = h;
  }

  function place(c, docs) {
    const sf = $('#surface'), W = sf.clientWidth, H = sf.clientHeight;
    const cols = W >= 760 ? 3 : 2, rows = Math.ceil(docs.length / cols);
    const dw = clamp(Math.floor((W - 70) / cols) - 12, 290, 390);
    sf.style.setProperty('--dw', dw + 'px');
    sf.classList.toggle('roomy', dw >= 340);
    const xs = (W - dw - 56) / (cols - 1), ys = rows > 1 ? Math.min(310, (H - 350) / (rows - 1)) : 0;
    docs.forEach((d, i) => {
      const p = c.pos[d.id];
      if (p) { p.x = Math.min(p.x, W - 80); p.y = Math.min(p.y, H - 60); return; }
      const col = i % cols, row = Math.floor(i / cols);
      c.pos[d.id] = { x: Math.round(30 + col * xs), y: Math.round(56 + row * Math.max(ys, 70) + (col % 2) * 14), z: ++ui.z };
    });
  }

  /* разложить бумаги колонками по их настоящей высоте; не помещаются — внахлёст, но заголовок каждой виден */
  function pack() {
    const sf = $('#surface'); if (!sf || !S.cur) return;
    const c = rt(S.cur), els = [...sf.querySelectorAll('.doc')]; if (!els.length) return;
    const W = sf.clientWidth, H = sf.clientHeight, dw = els[0].offsetWidth, top = 60, gap = 14, avail = H - top - 14;
    const cols = Math.min(Math.max(2, els.length), Math.max(W >= 760 ? 3 : 2, Math.floor((W - 36) / (dw + 12))));
    const col = Array.from({ length: cols }, () => []), hs = Array(cols).fill(0);
    els.forEach(el => { let k = 0; for (let i = 1; i < cols; i++) if (hs[i] < hs[k] - 1) k = i; col[k].push({ el, h: el.offsetHeight }); hs[k] += el.offsetHeight + gap; });
    const xs = (W - dw - 48) / (cols - 1);
    col.forEach((list, ci) => {
      if (!list.length) return;
      const last = list[list.length - 1], total = hs[ci] - gap;
      const sc = total > avail ? Math.max(0, (avail - last.h) / (total - last.h)) : 1;
      let y = top + (ci % 2) * 8;
      list.forEach(d => {
        const p = c.pos[d.el.dataset.doc] = { x: Math.round(24 + ci * xs), y: Math.round(Math.min(y, H - 70)), z: ++ui.z };
        d.el.style.left = p.x + 'px'; d.el.style.top = p.y + 'px'; d.el.style.zIndex = p.z;
        y += Math.max(46, (d.h + gap) * sc);
      });
    });
  }

  function docHTML(d, c, person) {
    const p = c.pos[d.id];
    let hash = 0; for (const ch of d.id + S.cur) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
    const rot = ((hash % 7) - 3) * 0.3;
    const lines = d.lines.map(l => {
      const key = d.id + '.' + l.id;
      return `<div class="ln${l.fresh ? ' fresh' : ''}" data-k="${key}">${l.k ? `<span class="k">${esc(l.k)}:</span> ` : ''}<span class="v">${T(l.v)}</span></div>`;
    }).join('');
    return `<div class="doc ${d.kind}${c.fresh.includes(d.id) ? ' new' : ''}" data-doc="${d.id}" style="left:${p.x}px;top:${p.y}px;z-index:${p.z};--r:${rot}deg">
      <div class="doc-head">${d.org ? `<div class="doc-org">${esc(d.org)}</div>` : ''}
        <div class="doc-title">${esc(d.title)}</div>${d.sub ? `<div class="doc-sub">${T(d.sub)}</div>` : ''}</div>
      ${d.face ? `<div class="face">${portraitSVG(person.face)}</div>` : ''}
      <div class="doc-body">${lines}</div>
      ${d.face && c.verdict ? `<div class="stamp desk-stamp${ui.slam ? ' slam' : ''}">${esc(CASES[S.cur].verdicts.find(x => x.id === c.verdict).stamp)}</div>` : ''}</div>`;
  }

  function renderSurface() {
    const sf = $('#surface');
    if (!S.cur) {
      sf.className = 'surface';
      sf.innerHTML = `<div class="baize"></div>${deskProps()}<div class="empty-hint">${allDone() ? 'Все папки сданы.' : 'Возьмите папку из «Входящих».'}</div>`;
      return;
    }
    const cs = CASES[S.cur], c = rt(S.cur), docs = visibleDocs(S.cur);
    const first = !Object.keys(c.pos).length;
    place(c, docs);
    ui.z = Math.max(ui.z, ...Object.values(c.pos).map(p => p.z));
    sf.innerHTML = `<div class="baize"></div>${deskProps()}
      <div class="case-strip"><b>Дело № ${cs.no}</b> · ${esc(cs.person.name)} · ${esc(cs.charge)}${c.verdict ? ' · сдано, только чтение' : ''}</div>
      ${docs.map(d => docHTML(d, c, cs.person)).join('')}
      <button class="tidy-btn${c.verdict ? ' solo' : ''}" data-act="tidy" title="Разложить бумаги по столу (R)">Разложить</button>
      ${c.verdict ? '' : `<button class="sv-btn" data-act="sverka">Сверка <kbd>пробел</kbd></button>`}`;
    if (first) pack();
    markLines();
  }
  function markLines() {
    const sf = $('#surface'); if (!sf || !S.cur) return;
    const c = rt(S.cur), cs = CASES[S.cur], on = ui.sverka && !c.verdict;
    sf.classList.toggle('sverka', on);
    sf.classList.toggle('dbg-on', DBG);
    const b = $('.sv-btn', sf); if (b) { b.classList.toggle('on', on); b.classList.toggle('pulse', !S.flags.includes('tut_sv')); }
    const map = {};
    if (DBG) cs.pairs.forEach(p => [p.a, p.b].forEach(k => { (map[k] = map[k] || []).includes(p.f) || map[k].push(p.f); }));
    /* отладка: у выбранной строки подсвечиваются все строки, с которыми она сводится */
    const mate = {};
    if (DBG && on && ui.sel) cs.pairs.forEach(p => { if (p.a === ui.sel) mate[p.b] = 1; if (p.b === ui.sel) mate[p.a] = 1; });
    sf.querySelectorAll('.ln').forEach(el => {
      const k = el.dataset.k;
      el.classList.toggle('dbgp', !!mate[k]);
      el.classList.toggle('sel', k === ui.sel);
      el.classList.toggle('hit', c.hits.includes(k));
      el.classList.toggle('dbgl', !!map[k]);
      if (map[k]) el.dataset.f = map[k].map(f => f.replace('f_', '')).join(' '); else delete el.dataset.f;
    });
  }
  function deskProps() {
    return `<svg class="prop glass" viewBox="0 0 80 80"><ellipse cx="40" cy="44" rx="30" ry="30" fill="rgba(0,0,0,.35)"/><circle cx="38" cy="40" r="27" fill="#8b8f8a"/><circle cx="38" cy="40" r="22" fill="#5a2f17"/><circle cx="38" cy="40" r="22" fill="none" stroke="#c9cdc6" stroke-width="2.5"/><ellipse cx="31" cy="33" rx="8" ry="4" fill="rgba(255,255,255,.18)" transform="rotate(-30 31 33)"/><path d="M63 30 q14 10 0 22" fill="none" stroke="#8b8f8a" stroke-width="5"/></svg>
    <svg class="prop pad" viewBox="0 0 110 70"><rect x="4" y="8" width="102" height="58" rx="4" fill="rgba(0,0,0,.35)"/><rect x="2" y="2" width="102" height="58" rx="4" fill="#2a2420"/><rect x="9" y="9" width="88" height="44" rx="2" fill="#5b1d1a"/><rect x="9" y="9" width="88" height="44" rx="2" fill="none" stroke="#1a1512" stroke-width="2"/></svg>`;
  }

  /* ---------- правая панель: справка, запросы, постановление ---------- */
  function findItem(cs, c, id, conf, ro) {
    const fd = cs.findings[id], st = c.struck.includes(id), at = c.att.includes(id), bad = conf.includes(id) && !st;
    const tag = fd.kind === 'ex' ? 'в пользу обвиняемого' : (fd.w === 1 ? 'уличает косвенно' : 'уличает');
    let btn = '';
    if (!ro) {
      if (!st) btn += `<button data-act="attach" data-arg="${id}"${!at && live(c).length >= MAXATT ? ' class="full"' : ''}>${at ? 'снять' : 'подшить'}</button>`;
      if (bad || st) btn += `<button class="bx" data-act="strike" data-arg="${id}">${st ? 'восстановить' : 'вычеркнуть'}</button>`;
    }
    return `<li class="${fd.kind}${st ? ' struck' : ''}${at ? ' att' : ''}${bad ? ' need' : ''}"><span class="tag">${tag}${at ? ' · подшито к постановлению' : ''}${st ? ' · вычеркнуто' : ''}</span><span class="ft">${T(fd.t)}</span>${btn ? `<span class="fa">${btn}</span>` : ''}</li>`;
  }

  function renderSide() {
    const el = $('#side');
    if (!S.cur) {
      const d = day();
      el.innerHTML = `<div class="clip"><h3>Памятка</h3>${dirDoc().lines.map(l => `<p class="memo${l.fresh ? ' fresh' : ''}">${esc(l.v)}</p>`).join('')}
        <p class="fine">На столе ${d.cases.filter(id => !rt(id).verdict).length} из ${d.cases.length} дел.</p></div>${debugHTML()}`;
      return;
    }
    const cs = CASES[S.cur], c = rt(S.cur);
    if (c.verdict) {
      const v = cs.verdicts.find(x => x.id === c.verdict);
      el.innerHTML = `<div class="clip"><h3>Справка по делу № ${cs.no}</h3>
        <ul class="finds">${c.found.map(id => findItem(cs, c, id, [], true)).join('') || '<li class="none">Сверкой ничего не установлено.</li>'}</ul>
        <h4>Постановление</h4><p class="memo fresh">${esc(v.label)}</p>
        <p class="fine">Дело сдано. Исход — вечером, в газете и в картотеке.</p></div>${debugHTML()}`;
      return;
    }
    const v = cs.verdicts.find(x => x.id === ui.verdict);
    const conf = v ? (v.conflicts || []).filter(f => c.found.includes(f)) : [];
    const open = conf.filter(f => !c.struck.includes(f));
    const natt = live(c).length;
    const reqs = (cs.requests || []).filter(r => !c.unlocked.includes(r.doc)).map(r => {
      const gone = r.if && !r.if(S), late = timeLeft() < r.cost + COST.hit, hint = gone ? r.off : r.hint;
      return `<button class="req${gone ? ' gone' : ''}${r.manual ? ' own' : ''}" data-act="req" data-arg="${r.id}" ${late || gone ? 'disabled' : ''}><i>${gone ? 'поздно' : late ? 'не успеть' : hm(r.cost)}</i><b>${T(r.label)}</b>${hint ? `<span>${T(hint)}</span>` : ''}</button>`;
    }).join('');
    const vs = cs.verdicts.map(x => `<button class="vopt${x.id === ui.verdict ? ' on' : ''}" data-act="pickv" data-arg="${x.id}"><s></s><span>${esc(x.label)}</span></button>`).join('');
    let status = '';
    if (open.length) status = `<div class="warn">В справке ${open.length === 1 ? 'осталась запись, которая противоречит' : 'остались записи, которые противоречат'} постановлению. С такой справкой его не утвердят. Вычеркните ${open.length === 1 ? 'её' : 'их'} — или измените решение.</div>`;
    else if (v) status = `<div class="attn${natt ? '' : ' zero'}">${natt ? 'Подшито оснований: ' + natt + ' из ' + MAXATT + '.' : 'К постановлению ничего не подшито. Подписать можно, но за голую бумагу спросят.'}</div>`;
    el.innerHTML = `<div class="clip">
      <h3>Справка по делу № ${cs.no}</h3>
      <p class="legend">Сверка: сошлось или близко — ${COST.hit} мин, совсем мимо — ${COST.miss} мин. В бланке постановления ${MAXATT} строки для оснований.</p>
      <ul class="finds">${c.found.map(id => findItem(cs, c, id, conf, false)).join('') || '<li class="none">Сверкой пока ничего не установлено.</li>'}</ul>
      ${reqs ? `<h4>Запросы</h4><div class="reqs">${reqs}</div>` : ''}
      <h4>Постановление</h4>
      <div class="vlist">${vs}</div>
      ${status}
      <button class="btn sign" data-act="sign" ${!v || open.length ? 'disabled' : ''}>Подписать</button>
    </div>${debugHTML()}`;
  }
  const hm = m => (m >= 60 ? Math.floor(m / 60) + ' ч' + (m % 60 ? ' ' + (m % 60) + ' мин' : '') : m + ' мин');

  function toast(t, cls) {
    const el = $('#toast'); if (!el) return;
    el.textContent = t; el.className = 'toast show ' + (cls || '');
    clearTimeout(ui.toastT); ui.toastT = setTimeout(() => { el.className = 'toast'; }, 5200);
  }

  /* ---------- сверка ---------- */
  function pick(k) {
    const c = rt(S.cur), cs = CASES[S.cur];
    if (!ui.sel) { ui.sel = k; snd('pick'); markLines(); return; }
    if (ui.sel === k) { ui.sel = null; markLines(); return; }
    const a = ui.sel, b = k; ui.sel = null;
    const p = cs.pairs.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (p && c.found.includes(p.f)) { toast('Это уже записано в справке.'); refresh(); return; }
    if (timeLeft() <= 0) { toast('Рабочий день окончен. Осталось подшить основания и подписать постановления.', 'bad'); refresh(); return; }
    if (p) {
      c.found.push(p.f); c.hits.push(a, b); spend(COST.hit); snd('hit');
      const fd = cs.findings[p.f];
      toast((fd.kind === 'ex' ? 'В пользу обвиняемого. ' : 'Уличает. ') + fill(fd.t) + ' Записано в справку — можно подшить к постановлению.', fd.kind);
    } else {
      /* «тепло»: хотя бы одна из строк ещё участвует в ненайденной связке;
         «об одном»: обе строки ведут к одному ненайденному факту, но друг с другом его не устанавливают */
      const left = cs.pairs.filter(x => !c.found.includes(x.f));
      const inF = (f, k) => left.some(x => x.f === f && (x.a === k || x.b === k));
      const same = left.some(x => inF(x.f, a) && inF(x.f, b));
      const warm = same || left.some(x => [x.a, x.b].some(k => k === a || k === b));
      spend(warm ? COST.hit : COST.miss); snd('miss');
      toast(same
        ? 'Обе строки об одном и том же, но друг с другом они ничего не устанавливают. Сверьте каждую с третьей бумагой. Потеряно ' + COST.hit + ' минут.'
        : warm
          ? 'Из этих двух строк вывода не сделать. Но одна из них ещё пригодится — с другой бумагой. Потеряно ' + COST.hit + ' минут.'
          : 'Ни расхождений, ни связи не усматривается. Потеряно ' + COST.miss + ' минут.', 'bad');
    }
    save(); refresh();
  }

  /* ---------- постановление ---------- */
  function sign() {
    const cs = CASES[S.cur], c = rt(S.cur), v = cs.verdicts.find(x => x.id === ui.verdict);
    if (!v) return;
    if (v.refuse) {
      if (!c.refused) {
        /* первый возврат уже стоит доверия, но сам по себе не увольняет */
        const was0 = S.trust; S.trust = Math.max(1, S.trust - 1);
        c.refused = 1; ui.verdict = null; save(); snd('knock');
        openModal(`<div class="sheet post"><div class="post-h">Постановление</div><div class="post-sub">по делу № ${cs.no} — возвращено</div>
          <p>${esc(v.label)}</p>
          <div class="resol big"><i>${esc(v.refuseText)}</i><span>— ${esc(day().boss || 'Ломов')}</span></div>
          <div class="tdelta${S.trust < was0 ? ' down' : ''}">Доверие руководства: ${was0} → ${S.trust}</div>
          <button class="btn" data-act="close">Вернуться к делу</button></div>`);
        refresh();
        return;
      }
      return ending('e_refuse');
    }
    const founded = isFounded(cs, c, v), stretch = isStretch(cs, c, v);
    const fx = Object.assign({}, v.fx, (!founded && v.unf) || {});
    const reply = (!founded && v.unf && v.unf.reply) || v.reply;
    const was = S.trust;
    S.trust = clamp(S.trust + (fx.trust || 0), 0, 10);
    S.viol += fx.viol || 0;
    if (stretch) S.stretch++;
    c.struck.forEach(f => { if (cs.findings[f].kind === 'ex') S.viol++; else S.cover++; });
    /* осудил, не проверив: оправдание в папке было, но сверкой не найдено */
    if ((v.conflicts || []).some(f => cs.findings[f].kind === 'ex' && !c.found.includes(f))) S.blind++;
    c.att = c.att.filter(f => !c.struck.includes(f));
    const fls = (v.flags || []).concat(c.att.map(f => { const x = cs.findings[f].flag; return typeof x === 'function' ? x(S) : x; }).filter(Boolean));
    fls.forEach(f => { if (!S.flags.includes(f)) S.flags.push(f); });
    c.verdict = v.id; c.founded = founded; c.stretch = stretch;
    S.cards.push({ c: S.cur, day: S.day, v: v.id });
    save();
    const lst = (ids, cl) => ids.map(f => `<span class="${cl} ${cs.findings[f].kind}">${T(cs.findings[f].t)}</span>`).join('');
    const last = S.trust > 0 && S.trust <= 2 && S.trust < was;
    /* сначала штамп ложится на анкету на столе, потом приносят постановление с резолюцией */
    ui.busy = true; ui.slam = true; ui.sverka = false; refresh(true); ui.slam = false;
    const sf = $('#surface'); if (sf) { sf.classList.add('thud'); const st = $('.desk-stamp', sf); if (st) st.parentNode.style.zIndex = ++ui.z; }
    setTimeout(() => snd('stamp'), 240);
    setTimeout(() => { ui.busy = false; if (sf) sf.classList.remove('thud'); openModal(`<div class="sheet post">
      <div class="doc-org">${esc(day().org || ORG)}</div>
      <div class="post-h">Постановление</div><div class="post-sub">по делу № ${cs.no}, ${esc(day().date)}</div>
      <p>Я, ${esc(day().rank)} ${esc(day().unit || 'Студенецкого РО НКВД')} ${esc(S.name)}, рассмотрев материалы дела по обвинению гр. ${esc(cs.person.name.replace(/\s*\(.*\)/, ''))},</p>
      <p class="post-c">постановил:</p>
      <p class="post-v">${esc(v.label)}</p>
      <div class="post-gr"><b>Основания (подшито к постановлению)</b>${c.att.length ? lst(c.att, 'g') : '<em>не подшито</em>'}</div>
      ${c.struck.length ? `<div class="post-gr"><b>Из справки по делу исключено</b>${lst(c.struck, 'st')}</div>` : ''}
      <div class="post-sig"><span>${esc(day().rank)}</span><i>${esc(S.name)}</i></div>
      <div class="stamp slam">${esc(v.stamp)}</div>
      <div class="resol"><b>${esc(day().bossTitle || 'Резолюция начальника РО')}</b><i>${T(reply)}</i>${last ? `<i class="ps">${esc(day().ps || 'И последнее. Ещё одна бумага мне поперёк — сдашь наган и удостоверение.')}</i>` : ''}<span>— ${esc(day().boss || 'Ломов')}</span></div>
      <div class="tdelta${S.trust < was ? ' down' : S.trust > was ? ' up' : ''}">Доверие руководства: ${was} → ${S.trust}</div>
      <button class="btn" data-act="afterv">Сдать папку</button></div>`); }, 850);
  }
  function afterVerdict() {
    closeModal();
    if (S.trust <= 0) return ending(day().fired || 'e_fired');
    S.cur = null; ui.verdict = null; ui.sel = null; save(); refresh(true);
  }
  function ending(id) { S.phase = 'end'; S.ending = id; save(); go(); }

  /* ---------- вечер: газета ---------- */
  function paperHTML(p) {
    const items = p.items.filter(i => !i.if || i.if(S));
    return `<div class="paper">
      <div class="mast"><div class="mast-l">Пролетарии всех стран, соединяйтесь!</div><div class="mast-h">${esc((p.mast || {}).h || 'Колхозная правда')}</div>
      <div class="mast-s"><span>${esc((p.mast || {}).s || 'Орган Студенецкого райкома ВКП(б) и райисполкома')}</span><span>${esc(p.no)} · ${esc(p.date)}</span></div></div>
      <div class="cols">${items.map(i => { const mine = i.c && S.cases[i.c] && S.cases[i.c].verdict; return `<article class="${i.big ? 'big' : ''}${mine ? ' mine' : ''}">${mine ? `<span class="pencil" title="Заметка по вашему делу">№ ${CASES[i.c].no}</span>` : ''}<h4>${esc(i.h)}</h4><p>${T(i.t)}</p>${i.by ? `<div class="by">${esc(i.by)}</div>` : ''}</article>`; }).join('')}</div>
    </div>`;
  }
  function renderEvening() {
    const d = day(), letters = (d.paper.letters || []).filter(l => !l.if || l.if(S));
    app.innerHTML = `<div class="evening">
      <div class="ev-head"><span>Вечер. ${esc(d.paper.date)}</span><span>Свежий номер</span></div>
      ${paperHTML(d.paper)}
      ${letters.map(l => `<div class="letter ${l.hand || ''}"><p>${T(l.t)}</p>${l.foot ? `<div class="l-foot">${esc(l.foot)}</div>` : ''}</div>`).join('')}
      <div class="ev-btns"><button class="btn ghost" data-act="cards">Картотека</button><button class="btn" data-act="next">${d.inter ? esc(INTERS[d.inter].label || 'Месяц спустя') : 'Следующий день'}</button></div>
    </div>`;
    window.scrollTo(0, 0);
  }

  function archiveBody(years) {
    const struck = Object.values(S.cases).reduce((n, c) => n + c.struck.length, 0);
    return `<p>За ${esc(years)} через ваш стол прошло ${S.cards.length} дел. Под каждым постановлением стоит одна и та же фамилия: ${esc(S.name)}.</p>
      <p>Папки прошиты, пронумерованы и сданы в архив областного управления. На обложках штамп: «Хранить вечно».</p>
      <p>Справки по делам подшиты как есть${struck ? ' — вместе со всем, что в них вычеркнуто' : ''}.</p>`;
  }
  /* между актами: газета → сцена → архивная карточка → следующий акт (или концовка, если акта ещё нет) */
  function renderInter() {
    const it = INTERS[day().inter];
    if (S.step === 0) {
      app.innerHTML = `<div class="evening"><div class="ev-head"><span>${esc(it.paper.date)}</span><span>Свежий номер</span></div>
        ${paperHTML(it.paper)}<div class="ev-btns"><button class="btn" data-act="inter">Дальше</button></div></div>`;
    } else if (S.step === 1) {
      const sc = it.scene;
      app.innerHTML = `<div class="center-scr"><div class="sheet brief"><div class="kicker">${esc(sc.kicker)}</div><h1>${esc(sc.title)}</h1>
        <div class="dateline">${esc(sc.date)}</div>${sc.text.map(p => `<p>${T(p)}</p>`).join('')}
        <button class="btn" data-act="actend">Сдать дела в архив</button></div></div>`;
    } else {
      const ar = it.arch;
      app.innerHTML = `<div class="center-scr"><div class="sheet brief end"><div class="kicker">${esc(ar.kicker)}</div><h1>${esc(ar.title)}</h1>${archiveBody(ar.years)}
        <div class="ev-btns"><button class="btn ghost" data-act="cards">Картотека</button><button class="btn" data-act="nextact">${esc(ar.next)}</button></div></div></div>`;
    }
    window.scrollTo(0, 0);
  }

  function renderEnding() {
    const e = ENDINGS[S.ending];
    let body = e.text.map(p => `<p>${T(p)}</p>`).join('');
    if (e.archive) body = archiveBody(e.archive) + (e.fine ? `<p class="fine">${esc(e.fine)}</p>` : '');
    /* старое сохранение, остановившееся на конце первого акта, можно продолжить */
    const more = S.ending === 'act1' && DAYS.length > S.day + 1;
    app.innerHTML = `<div class="center-scr"><div class="sheet brief end"><div class="kicker">${esc(e.kicker)}</div><h1>${esc(e.title)}</h1>${body}
      <div class="ev-btns"><button class="btn ghost" data-act="cards">Картотека</button>${more ? '<button class="btn" data-act="nextact">Акт второй</button>' : ''}<button class="btn${more ? ' ghost' : ''}" data-act="restart">Начать заново</button></div></div></div>`;
  }

  /* ---------- модальные окна ---------- */
  function openModal(html) { overlay.innerHTML = `<div class="modal">${html}</div>`; overlay.classList.add('on'); }
  function closeModal() { overlay.classList.remove('on'); overlay.innerHTML = ''; }

  function showCards() {
    const cards = S.cards.map(k => {
      const cs = CASES[k.c], v = cs.verdicts.find(x => x.id === k.v), known = k.day < S.day || S.phase !== 'desk';
      const c = rt(k.c);
      return `<div class="card"><div class="face">${portraitSVG(cs.person.face)}</div><div>
        <b>${esc(cs.person.name)}</b><span>Дело № ${cs.no} · ${esc(DAYS[k.day].date)}</span>
        <span>${esc(v.short)} · подшито оснований: ${c.att.length}${c.struck.length ? ` · вычеркнуто из справки: ${c.struck.length}` : ''}</span>
        <em>${known ? T(v.fate) : 'Исход пока неизвестен.'}</em>
        <i>Подписал: ${esc(S.name)}</i></div></div>`;
    }).join('');
    openModal(`<div class="sheet cards"><h2>Картотека</h2>${cards || '<p class="fine">Карточек пока нет.</p>'}<button class="btn" data-act="close">Закрыть</button></div>`);
  }
  function showPapers(idx) {
    const upto = S.phase === 'desk' || S.phase === 'brief' ? S.day - 1 : S.day;
    if (upto < 0) return openModal('<div class="sheet cards"><h2>Газеты</h2><p class="fine">Подшивка пуста: первый номер принесут вечером.</p><button class="btn" data-act="close">Закрыть</button></div>');
    const i = idx == null ? upto : clamp(+idx, 0, upto);
    const tabs = DAYS.slice(0, upto + 1).map((d, n) => `<button class="tab${n === i ? ' on' : ''}" data-act="papers" data-arg="${n}">${esc(d.paper.date)}</button>`).join('');
    openModal(`<div class="sheet papers"><div class="tabs">${tabs}</div>${paperHTML(DAYS[i].paper)}<button class="btn" data-act="close">Закрыть</button></div>`);
  }

  /* ---------- режим отладки ---------- */
  function lineLabel(cs, key) {
    const [d, l] = key.split('.');
    if (d === 'dir') return 'Памятка';
    const doc = cs.docs.find(x => x.id === d), ln = doc && doc.lines.find(x => x.id === l);
    if (!ln) return key;
    const txt = fill(ln.v);
    return doc.title + ': «' + (txt.length > 34 ? txt.slice(0, 34) + '…' : txt) + '»';
  }
  function debugHTML() {
    if (!DBG || !S) return '';
    let h = `<div class="dbg"><h4>Отладка <button data-act="dbgoff">выкл</button></h4>
      <p>доверие <b>${S.trust}</b> · нарушения <b>${S.viol}</b> · вслепую <b>${S.blind}</b> · укрывательство <b>${S.cover}</b> · натяжки <b>${S.stretch}</b></p>
      <p>флаги: ${S.flags.filter(f => f !== 'tut_sv').join(', ') || '—'}</p>
      <div class="dbg-btns"><button data-act="dbg" data-arg="time">время 9:00</button><button data-act="dbg" data-arg="tp">доверие +1</button><button data-act="dbg" data-arg="tm">доверие −1</button>
      ${DAYS.map((d, i) => `<button data-act="dbg" data-arg="day${i}">день ${i + 1}</button>`).join('')}</div>`;
    if (S.cur) {
      const cs = CASES[S.cur], c = rt(S.cur);
      h += `<h5>Что с чем сверяется <button data-act="dbg" data-arg="all">найти всё</button></h5>
        <p>Метка на строке — факт, в котором она участвует. Сводятся не любые две строки с одной меткой, а пары из списка ниже. В режиме сверки выберите строку — её пары зальются зелёным.</p>`;
      Object.keys(cs.findings).forEach(f => {
        const fd = cs.findings[f], pairs = cs.pairs.filter(p => p.f === f);
        const lockedReq = (cs.requests || []).filter(r => !c.unlocked.includes(r.doc) && pairs.every(p => p.a.startsWith(r.doc + '.') || p.b.startsWith(r.doc + '.')));
        h += `<div class="dbg-f ${fd.kind}${c.found.includes(f) ? ' ok' : ''}"><b>${f.replace('f_', '')}</b> · ${fd.kind === 'ex' ? 'в пользу' : 'уличает'} · вес ${fd.w || 2}${lockedReq.length ? ` · нужен запрос «${esc(lockedReq[0].label)}»` : ''}
          <i>${T(fd.t)}</i>${pairs.map(p => `<span>${esc(lineLabel(cs, p.a))} ↔ ${esc(lineLabel(cs, p.b))}</span>`).join('')}</div>`;
      });
      h += '<h5>Куда ведут постановления</h5>';
      cs.verdicts.forEach(v => {
        const fx = v.fx || {}, u = v.unf;
        h += `<div class="dbg-v"><b>${esc(v.short)}</b>
          ${v.refuse ? '<span>отказ: первый раз — возврат и доверие −1, второй — концовка «Особое мнение»</span>' : `<span>доверие ${sgn(fx.trust || 0)}${fx.viol ? ', нарушения +' + fx.viol : ''}</span>`}
          ${v.grounds ? `<span>основания: ${v.grounds.map(f => f.replace('f_', '') + '(' + wOf(cs, f) + ')').join(', ')}; нужен вес ≥ ${v.need || 2}; сейчас ${score(cs, c, v)}${isStretch(cs, c, v) ? '; натяжка: одни косвенные' : ''}</span>` : '<span>основания не требуются</span>'}
          ${u ? `<span>без оснований: доверие ${sgn(u.trust || 0)}${u.viol ? ', нарушения +' + u.viol : ''}</span>` : ''}
          ${v.conflicts ? `<span>придётся вычеркнуть, если найдено: ${v.conflicts.map(f => f.replace('f_', '')).join(', ')}</span>` : ''}
          ${v.flags ? `<span>флаги: ${v.flags.join(', ')}</span>` : ''}
          ${v.fate ? `<i>${T(v.fate)}</i>` : ''}</div>`;
      });
    }
    return h + '</div>';
  }
  function setDebug(on) {
    DBG = on; try { localStorage.setItem(DBGKEY, on ? '1' : '0'); } catch (e) { /* не запомнится */ }
    if (S && S.phase === 'desk') refresh(); else if (!S) renderTitle();
  }
  function dbgAct(a) {
    if (!DBG) return;
    if (a === 'time') S.time = 0;
    if (a === 'tp') S.trust = clamp(S.trust + 1, 0, 10);
    if (a === 'tm') S.trust = clamp(S.trust - 1, 1, 10);
    if (a === 'all' && S.cur) {
      const cs = CASES[S.cur], c = rt(S.cur);
      /* запросы, закрытые условием, и те, что игрок делает только сам (свои показания), отладка не трогает */
      (cs.requests || []).forEach(r => { if (!c.unlocked.includes(r.doc) && !r.manual && !(r.if && !r.if(S))) c.unlocked.push(r.doc); });
      const vis = visibleDocs(S.cur).map(d => d.id);
      cs.pairs.forEach(p => { if (!c.found.includes(p.f) && [p.a, p.b].every(k => vis.includes(k.split('.')[0]))) { c.found.push(p.f); c.hits.push(p.a, p.b); } });
      save(); return refresh(true);
    }
    if (a.startsWith('day')) { S.day = +a.slice(3); S.time = 0; S.cur = null; S.phase = 'brief'; save(); return go(); }
    save(); refresh();
  }

  /* ---------- действия ---------- */
  const ACT = {
    new() { renderName(); },
    cont() { S = load(); go(); },
    guideok() { S.phase = 'brief'; save(); go(); },
    guide() { openModal(`<div class="sheet guide-sheet">${guideHTML()}<div class="guide-foot"><span></span><button class="btn" data-act="close">Закрыть</button></div></div>`); },
    todesk() { S.phase = 'desk'; S.cur = null; save(); go(); },
    open(id) { S.cur = S.cur === id ? null : id; ui.sel = null; ui.verdict = null; snd('folder'); refresh(true); },
    tidy() { if (!S.cur) return; snd('paper'); pack(); save(); },
    mute() { MUTE = !MUTE; try { localStorage.setItem('chekist.mute', MUTE ? '1' : '0'); } catch (e) { /* не запомнится */ } ACT.menu(); snd('clip'); },
    sverka() {
      if (!S.cur || rt(S.cur).verdict) return;
      ui.sverka = !ui.sverka; ui.sel = null; if (!S.flags.includes('tut_sv')) S.flags.push('tut_sv'); markLines();
    },
    req(id) {
      const cs = CASES[S.cur], c = rt(S.cur), r = cs.requests.find(x => x.id === id);
      if (!r || timeLeft() < r.cost + COST.hit || (r.if && !r.if(S))) return;
      spend(r.cost); c.unlocked.push(r.doc); c.fresh.push(r.doc);
      if (r.flag && !S.flags.includes(r.flag)) S.flags.push(r.flag);
      const sf = $('#surface'), doc = cs.docs.find(d => d.id === r.doc);
      c.pos[r.doc] = { x: Math.round(sf.clientWidth / 2 - 160), y: 90, z: ++ui.z };
      save(); refresh(true); snd('knock');
      toast(r.toast ? fill(r.toast) : 'Через ' + hm(r.cost) + ' принесли ответ: «' + doc.title + '». Он лежит поверх бумаг — сверьте его с остальными.');
    },
    pickv(id) { ui.verdict = ui.verdict === id ? null : id; renderSide(); },
    attach(id) {
      const c = rt(S.cur), i = c.att.indexOf(id);
      if (c.struck.includes(id)) return;
      if (i < 0 && live(c).length >= MAXATT) { toast('В бланке постановления три строки для оснований. Снимите одно, чтобы подшить другое.', 'bad'); snd('miss'); return; }
      if (i >= 0) c.att.splice(i, 1); else c.att.push(id);
      snd('clip'); save(); renderSide();
    },
    strike(id) {
      const c = rt(S.cur), i = c.struck.indexOf(id);
      if (i >= 0) c.struck.splice(i, 1);
      else { c.struck.push(id); c.att = c.att.filter(f => f !== id); snd('strike'); }
      save(); renderSide();
    },
    sign() { sign(); },
    afterv() { afterVerdict(); },
    endday() { S.phase = 'evening'; S.cur = null; save(); go(); },
    next() {
      if (day().inter) { S.phase = 'inter'; S.step = 0; }
      else { S.day++; S.time = 0; S.phase = 'brief'; }
      save(); go();
    },
    inter() { S.step = 1; save(); go(); },
    actend() { const it = INTERS[day().inter]; if (it.ending) return ending(it.ending); S.step = 2; save(); go(); },
    nextact() { if (S.day >= DAYS.length - 1) return; S.day++; S.time = 0; S.cur = null; S.ending = null; S.phase = 'brief'; save(); go(); },
    cards() { showCards(); },
    papers(i) { showPapers(i); },
    close() { closeModal(); },
    menu() {
      openModal(`<div class="sheet cards"><h2>Меню</h2><p class="fine">Игра сохраняется сама после каждого действия.</p>
        <p class="fine">Режим отладки (F2) показывает, какие строки сверяются, что нужно подшить и куда ведёт каждое постановление.</p>
        <div class="ev-btns menu-btns"><button class="btn ghost" data-act="totitle">На титул</button><button class="btn ghost" data-act="guide">Порядок работы</button><button class="btn ghost" data-act="mute">Звук: ${MUTE ? 'включить' : 'выключить'}</button><button class="btn ghost" data-act="dbgtoggle">Отладка: ${DBG ? 'выключить' : 'включить'}</button><button class="btn" data-act="close">Вернуться</button></div></div>`);
    },
    dbgtoggle() { closeModal(); setDebug(!DBG); },
    dbgoff() { setDebug(false); },
    dbg(a) { dbgAct(a); },
    totitle() { closeModal(); S = null; ui.sverka = false; renderTitle(); },
    restart() { wipe(); S = null; ui.sverka = false; go(); },
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || ui.busy) return;
    const f = ACT[b.dataset.act];
    if (f) f(b.dataset.arg);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay && !$('.post', overlay)) closeModal(); });

  /* перетаскивание бумаг и выбор строк */
  app.addEventListener('pointerdown', e => {
    const doc = e.target.closest('.surface .doc');
    if (!doc || !S || !S.cur || ui.busy) return;
    const c = rt(S.cur), id = doc.dataset.doc, p = c.pos[id];
    p.z = ++ui.z; doc.style.zIndex = p.z;
    const fi = c.fresh.indexOf(id); if (fi >= 0) { c.fresh.splice(fi, 1); doc.classList.remove('new'); }
    const ln = e.target.closest('.ln');
    if (ui.sverka && ln && !c.verdict) { pick(ln.dataset.k); return; }
    const sx = e.clientX, sy = e.clientY, ox = p.x, oy = p.y, sf = $('#surface');
    doc.classList.add('drag'); snd('paper');
    try { doc.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен */ }
    const mv = ev => {
      p.x = clamp(ox + ev.clientX - sx, -250, sf.clientWidth - 80);
      p.y = clamp(oy + ev.clientY - sy, 0, sf.clientHeight - 60);
      doc.style.left = p.x + 'px'; doc.style.top = p.y + 'px';
    };
    const up = () => {
      doc.classList.remove('drag'); save();
      doc.removeEventListener('pointermove', mv); doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', up);
    };
    doc.addEventListener('pointermove', mv); doc.addEventListener('pointerup', up); doc.addEventListener('pointercancel', up);
  });
  document.addEventListener('keydown', e => {
    const modal = overlay.classList.contains('on');
    if (e.code === 'F2') { e.preventDefault(); setDebug(!DBG); return; }
    if (e.code === 'Space' && S && S.phase === 'desk' && S.cur && !modal && e.target.tagName !== 'INPUT') { e.preventDefault(); ACT.sverka(); }
    if (e.code === 'KeyR' && S && S.phase === 'desk' && S.cur && !modal && !ui.busy && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT') ACT.tidy();
    if (e.code === 'Escape') {
      if (modal) { if (!$('.post', overlay)) closeModal(); }
      else if (ui.sel) { ui.sel = null; markLines(); }
    }
  });

  renderTitle();
})();
