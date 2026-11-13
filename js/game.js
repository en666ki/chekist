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
  const ui = { sel: null, sverka: false, verdict: null, z: 20, toastT: 0, busy: false, slam: false, mtab: 'inbox' };
  let MUTE = false;
  try { MUTE = localStorage.getItem('chekist.mute') === '1'; } catch (e) { /* хранилище недоступно */ }

  /* телефон: узкий экран или палец на экране шириной меньше настольного стола */
  const MQ = window.matchMedia('(max-width: 899px), (pointer: coarse) and (max-width: 1179px)');
  let VIEW = 'auto', MOB = false;
  try { VIEW = localStorage.getItem('chekist.view') || 'auto'; } catch (e) { /* хранилище недоступно */ }
  function applyView() {
    const m = VIEW === 'auto' ? MQ.matches : VIEW === 'mob';
    const changed = m !== MOB; MOB = m;
    document.body.classList.toggle('mob', MOB);
    return changed;
  }
  applyView();
  const onMQ = () => { if (VIEW === 'auto' && applyView() && S) go(); };
  if (MQ.addEventListener) MQ.addEventListener('change', onMQ); else if (MQ.addListener) MQ.addListener(onMQ);
  /* на телефоне стол — три вкладки: папки, бумаги, справка */
  function setTab(t) { ui.mtab = t; const d = document.querySelector('.desk'); if (d) d.dataset.tab = t; markNav(); window.scrollTo(0, 0); }
  function markNav() {
    document.querySelectorAll('.mnav button').forEach(b => b.classList.toggle('on', b.dataset.arg === ui.mtab));
    const n = document.querySelector('.mnav [data-arg=desk] i'); if (n) n.textContent = S && S.cur ? (CASES[S.cur].album ? 'список № ' : CASES[S.cur].ro || CASES[S.cur].statement ? '' : 'дело № ') + (CASES[S.cur].ro || CASES[S.cur].statement ? 'личное дело' : CASES[S.cur].no) : 'пусто';
  }

  const $ = (q, el) => (el || document).querySelector(q);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fill = t => String(typeof t === 'function' ? t(S) : t).replace(/\{name\}/g, S.name).replace(/\{home\}/g, S.homeAt || '');
  const T = t => esc(fill(t));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sgn = n => (n > 0 ? '+' : '') + n;

  /* ---------- состояние ---------- */
  function newState(name) {
    return { v: 2, name, day: 0, phase: 'guide', step: 0, trust: 5, viol: 0, blind: 0, cover: 0, stretch: 0, flags: [], time: 0, cases: {}, cards: [], cur: null, ending: null };
  }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { /* без хранилища играем до закрытия вкладки */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (!s || s.v !== 2) return null; s.stretch = s.stretch || 0; s.evn = s.evn || []; return s; } catch (e) { return null; } }
  function wipe() { try { localStorage.removeItem(SAVE); } catch (e) { /* нечего стирать */ } }
  const day = () => DAYS[S.day];
  const rt = id => S.cases[id] || (S.cases[id] = initRt(id));
  /* жалоба по старому делу начинается с того, что вы тогда нашли и вычеркнули */
  function initRt(id) {
    const b = { found: [], struck: [], att: [], unlocked: [], fresh: [], hits: [], verdict: null, refused: 0, pos: {} }, cs = CASES[id];
    if (cs && cs.review) {
      const o = S.cases[cs.review] || {};
      Object.assign(b, { found: (o.found || []).slice(), struck: (o.struck || []).slice(), unlocked: (o.unlocked || []).slice(), hits: (o.hits || []).slice(),
        oldFound: (o.found || []).slice(), oldStruck: (o.struck || []).slice() });
    }
    if (cs && cs.fromCard) { const cf = ((S.cases[cs.fromCard[0]] || {}).cf || {})[cs.fromCard[1]] || {}; b.oldFound = (cf.found || []).slice(); b.oldStruck = []; }
    return b;
  }
  /* дела дня: у дней акта IV часть дел выбирается из пула жалоб по сохранению */
  const casesOf = d => (d.pick && S.picked && S.picked[d.id]) || d.cases;
  /* после 18:00 можно остаться до 23:00 (акт III): сверхурочные */
  const OTMIN = 300;
  const limit = () => day().minutes + (S.ot ? OTMIN : 0);
  const timeLeft = () => limit() - S.time;
  const spend = m => { S.time = Math.min(limit(), S.time + m); };
  /* после бессонной ночи промах стоит дороже */
  const missCost = () => COST.miss + (S.tiredDay ? 15 : 0);
  const F = f => S.flags.includes(f);
  const flag = f => { if (f && !S.flags.includes(f)) S.flags.push(f); };
  const hhmm = m => { const t = 9 * 60 + m; return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  /* списки на тройку не держат день: не подписал — досдаст Пескарёв */
  const allDone = () => casesOf(day()).every(id => CASES[id].album || CASES[id].ro || rt(id).verdict);
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

  const dayOf = id => DAYS.findIndex(d => d.cases.includes(id));
  function dirDoc(ix) {
    const lines = [], at = ix == null || ix < 0 ? S.day : ix, act = DAYS[at].act || 1;
    for (let i = 0; i <= at; i++) if ((DAYS[i].act || 1) === act) DAYS[i].directives.forEach(d => lines.push({ id: d.id, k: null, v: d.t, fresh: i === at }));
    return { id: 'dir', kind: 'dir', title: 'Памятка уполномоченного', sub: 'для служебного пользования', lines };
  }
  /* ---------- списки на тройку и альбомы ---------- */
  const isAlb = id => !!(id && CASES[id] && CASES[id].album);
  const REDO = {};
  /* справка, вернувшаяся с доследования: те же строки плюс протокол Пескарёва с признанием */
  function cardById(id) {
    if (REDO[id]) return REDO[id];
    const base = ALBCARDS[id.replace(/~r$/, '')];
    if (!id.endsWith('~r')) return base;
    return (REDO[id] = Object.assign({}, base, { id, redo: true, pr: 1,
      lines: base.lines.concat([L('dop', 'Доследовано', base.dop || 'дополнительно допрошен ст. уполномоченным Пескарёвым; вину признал полностью, назвал соучастников')]),
      pairs: (base.pairs || []).concat([{ a: 'k.dop', b: 'k.kom', f: 'f_dop' }, { a: 'k.dop', b: 'k.src', f: 'f_dop' }]),
      findings: Object.assign({}, base.findings, { f_dop: { kind: 'in', w: 1, t: 'После доследования признал вину (протокол Пескарёва).' } }) }));
  }
  /* состав списка фиксируется при первом взгляде на него: свои справки, условные (вернулись старые знакомые) и возвращённые из прошлого списка */
  function albIds(id) {
    const a = CASES[id], c = rt(id);
    if (!c.ids) {
      c.ids = a.cards.filter(k => !k.if || k.if(S)).map(k => k.id);
      /* возвращённые на доследование приходят в следующий список один раз; второй возврат дальше не идёт */
      if (a.from) { const p = rt(a.from); (p.ids || []).forEach(x => { if ((p.eff || {})[x] === 'r' && !x.endsWith('~r')) c.ids.push(x + '~r'); }); }
      c.marks = c.marks || {}; c.cf = c.cf || {}; c.sel = c.sel || c.ids[0];
    }
    return c.ids;
  }
  const curCard = () => { albIds(S.cur); return cardById(rt(S.cur).sel); };
  const cardRt = id => { const c = rt(S.cur); c.cf = c.cf || {}; return c.cf[id] || (c.cf[id] = { found: [], hits: [], unlocked: [] }); };
  const shortName = n => { const p = n.split(' '); return p[0] + ' ' + (p[1] ? p[1][0] + '.' : '') + (p[2] ? ' ' + p[2][0] + '.' : ''); };
  const MK = { 1: 'I', 2: 'II', r: 'дослед.', o: 'отвод' };
  const FILEWORD = { fals: 'При пересмотре восстановил собственноручно вычеркнутое оправдание', nedouch: 'При пересмотре признал: оправдание было известно и не учтено', halat: 'При пересмотре установлено то, что не проверялось при следствии', hide: 'При пересмотре вычеркнул оправдание из справки', drawer: 'Жалобу оставил без движения', truth: 'Сообщил родственникам о приведении приговора в исполнение', lie: 'Сообщил родственникам: «10 лет без права переписки»' };
  function cardDocs(a, k, cc) {
    const docs = [{ id: 'k', kind: 'form', org: day().org || ORG, title: 'Справка', sub: 'на арестованного — для ' + a.court.replace(/^Тройка/, 'тройки').replace(/^Комиссия/, 'Комиссии').replace(/^Особая тройка/, 'Особой тройки'), face: true, lines: k.lines }];
    if (k.app && cc.unlocked.includes('p')) docs.push({ id: 'p', kind: 'typed', title: k.app.title, sub: k.app.sub, lines: k.app.lines });
    return docs;
  }
  /* что сейчас лежит на столе: для обычного дела — само дело, для списка — текущая справка с приложением */
  function ctx() {
    const cs = CASES[S.cur], c = rt(S.cur);
    if (!cs.album) return { cs, c, docs: visibleDocs(S.cur) };
    const k = curCard(), cc = cardRt(k.id), docs = cardDocs(cs, k, cc);
    return { alb: cs, card: k, cc,
      cs: { no: cs.no, docs, pairs: k.pairs || [], findings: k.findings || {}, person: k.person, requests: [], verdicts: [] },
      c: { found: cc.found, hits: cc.hits, unlocked: cc.unlocked, pos: c.pos, fresh: c.fresh, struck: [], att: [], verdict: c.signed ? 'signed' : null },
      docs: docs.concat([dirDoc()]) };
  }

  function visibleDocs(id) {
    const c = rt(id);
    /* бумага, у которой все строки условные и пустые, на стол не ложится */
    return CASES[id].docs.filter(d => (!d.locked || c.unlocked.includes(d.id)) && d.lines.some(l => fill(l.v) !== '')).concat([dirDoc(CASES[id].review ? dayOf(CASES[id].review) : null)]);
  }

  /* начало дня: день может начаться позже или с выговором — расплата за прошлые решения (DAYS[].start) */
  function beginDay() {
    S.time = 0; S.cur = null; S.phase = 'brief'; S.ot = false; S.tiredDay = false; S.evn = [];
    const d = day(), was = S.trust;
    S.note = (d.start ? d.start(S) : null) || [];
    if (S.tired && d.ot) {
      S.time = 90; S.tiredDay = true;
      S.note.push('Вчера вы ушли из управления после девяти вечера и легли за полночь. Пришли к половине одиннадцатого. Голова тяжёлая: промах в сверке сегодня обходится дороже.');
    }
    S.tired = false;
    if (d.pick) {
      /* жалобы приходят по старшинству: сначала те, о ком написал Пескарёв */
      const used = new Set([].concat(...Object.values(S.picked || {})));
      const pool = d.pick.pool.filter(id => !used.has(id) && CASES[id] && (!CASES[id].if || CASES[id].if(S)));
      S.picked = S.picked || {}; S.picked[d.id] = d.cases.concat(pool.slice(0, d.pick.n));
    }
    S.trust = clamp(S.trust, 1, 10);
    S.tnote = S.trust !== was ? [was, S.trust] : null;
  }

  /* ---------- маршрутизация ---------- */
  function go() {
    closeModal();
    if (!S) return renderTitle();
    ({ guide: renderGuide, brief: renderBrief, desk: renderDesk, evening: renderEvening, inter: renderInter, end: renderEnding, epi: renderEpi }[S.phase] || renderTitle)();
  }

  /* ---------- титул ---------- */
  function renderTitle() {
    const sv = load();
    app.innerHTML = `<div class="title-scr">
      <div class="folder-art">
        <div class="fa-top">Н К В Д &nbsp; С С С Р</div>
        <div class="fa-h">ЧЕКИСТ</div>
        <div class="fa-sub">Дело № <span>____</span> &nbsp; Начато: 20.VIII.1934 &nbsp; Окончено: <span>${(() => { try { return localStorage.getItem('chekist.done') || '____'; } catch (e) { return '____'; } })()}</span></div>
        <div class="fa-keep">Хранить вечно</div>
        <div class="stamp fa-stamp">СОВ. СЕКРЕТНО</div>
        <div class="fa-btns">
          ${sv ? '<button class="btn" data-act="cont">Продолжить</button>' : ''}
          <button class="btn" data-act="new">Новая игра</button>
        </div>
      </div>
      <div class="title-foot">Пролог и четыре акта · 1934–1939${DBG ? ' · режим отладки (F2)' : ''}</div>
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
      ${d.brief.map(fill).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}
      ${(S.note || []).map(p => `<p class="daynote">${T(p)}</p>`).join('')}
      ${S.tnote ? `<p class="tdelta down">Доверие руководства: ${S.tnote[0]} → ${S.tnote[1]}</p>` : ''}
      <div class="newdir"><b>К руководству</b>${d.directives.map(x => `<div>— ${esc(x.t)}</div>`).join('')}</div>
      <button class="btn" data-act="todesk">К столу</button>
    </div></div>`;
  }

  /* ---------- стол ---------- */
  function renderDesk() {
    const d = day();
    if (!S.cur) ui.mtab = 'inbox';
    app.innerHTML = `<div class="desk" data-tab="${ui.mtab}">
      <header class="bar">
        <div class="bar-l"><b>${esc(d.office || 'Студенецкое РО НКВД')}</b><span>${esc(d.date)}</span></div>
        <div class="bar-c"><span class="clock" id="clock"></span><span class="trust" id="trust"></span></div>
        <div class="bar-r"><button data-act="cards">Картотека</button><button data-act="papers">Газеты</button><button data-act="menu">Меню</button></div>
      </header>
      <aside class="inbox" id="inbox"></aside>
      <main class="surface" id="surface"></main>
      <aside class="side" id="side"></aside>
      <div class="toast" id="toast"></div>
      <nav class="mnav"><button data-act="mtab" data-arg="inbox">Папки<i>входящие</i></button><button data-act="mtab" data-arg="desk">Стол<i></i></button><button data-act="mtab" data-arg="side">Справка<i>решение</i></button></nav>
    </div>`;
    refresh(true);
  }
  function refresh(full) { if (!$('#clock')) return; renderBar(); renderInbox(); if (full) renderSurface(); else markLines(); renderSide(); markNav(); }

  function renderBar() {
    const left = timeLeft();
    const over = !!(S.ot && S.time >= day().minutes);
    $('#clock').innerHTML = `<b>${hhmm(S.time)}</b> <i>${left > 0 ? (over ? 'сверхурочно, до ' : 'рабочий день до ') + hhmm(limit()) : 'рабочий день окончен'}</i>`;
    $('#clock').classList.toggle('over', over);
    $('#clock').classList.toggle('late', left <= 60);
    const words = S.trust >= 8 ? 'на хорошем счету' : S.trust >= 5 ? 'претензий нет' : S.trust >= 3 ? 'есть вопросы' : 'на карандаше';
    let pips = ''; for (let i = 0; i < 10; i++) pips += `<s class="${i < S.trust ? 'on' : ''}"></s>`;
    $('#trust').innerHTML = `<i>Доверие руководства</i><span class="pips${S.trust <= 2 ? ' low' : ''}">${pips}</span><em>${words}</em>`;
  }

  function renderInbox() {
    const d = day();
    let h = '<h3>Входящие</h3>';
    casesOf(d).forEach(id => {
      const cs = CASES[id], c = rt(id);
      if (cs.ro) {
        const n = (S.file || []).length;
        h += `<button class="folder ro${S.cur === id ? ' cur' : ''}" data-act="open" data-arg="${id}"><span class="f-no">${esc(cs.kindNo || 'Дело')}</span><span class="f-t">${esc(cs.title)}</span><span class="f-c">${T(cs.charge)}</span><span class="f-st">${n ? 'подшито листов: ' + n : 'читать'}</span></button>`;
        return;
      }
      if (cs.album) {
        const ids = albIds(id), mk = ids.filter(x => c.marks[x]).length;
        const st = c.signed ? (c.by === 'pesk' ? 'досдал Пескарёв' : 'подписан') : S.cur === id ? 'на столе' : mk ? `отмечено ${mk} из ${ids.length}` : `справок: ${ids.length}`;
        h += `<button class="folder list${S.cur === id ? ' cur' : ''}${c.signed ? ' done' : ''}${cs.final ? ' red' : ''}" data-act="open" data-arg="${id}">
          <span class="f-no">${esc(cs.kindNo || 'Список')} № ${cs.no}</span><span class="f-t">${esc(cs.title)}</span><span class="f-c">${esc(cs.charge)}</span><span class="f-st">${st}</span>${c.signed ? `<span class="f-stamp">${c.void ? 'НЕ РАССМОТРЕН' : esc(cs.stamp || 'НА ТРОЙКУ')}</span>` : ''}</button>`;
        return;
      }
      const st = c.verdict ? 'сдано' : (S.cur === id ? 'на столе' : (c.found.length || c.unlocked.length ? 'в работе' : 'новое'));
      h += `<button class="folder${S.cur === id ? ' cur' : ''}${c.verdict ? ' done' : ''}${cs.finale ? ' red' : ''}" data-act="open" data-arg="${id}">
        <span class="f-no">${cs.statement ? 'Бригада НКВД СССР' : (cs.review || cs.rx || cs.fromCard ? 'По делу' : 'Дело') + ' № ' + cs.no}</span><span class="f-t">${esc(cs.title)}</span><span class="f-c">${esc(cs.charge)}</span><span class="f-st">${st}</span>${c.verdict ? `<span class="f-stamp">${esc(cs.verdicts.find(x => x.id === c.verdict).stamp)}</span>` : ''}</button>`;
    });
    /* остаться можно, когда до конца дня меньше часа: проверка справки дольше */
    if (d.ot && timeLeft() < 60 && !S.ot) h += `<button class="slip stay" data-act="stay"><b>Остаться на вечер</b><span>до 23:00 — чтобы проверить справки самому</span></button>`;
    const open = casesOf(d).filter(id => CASES[id].album && !rt(id).signed).length;
    if (allDone()) h += `<button class="btn wide" data-act="endday">${d.ot && (open || S.time > d.minutes) ? 'Уйти домой' : 'Сдать дела. Конец дня'}${open ? '<small>неподписанный список досдаст Пескарёв</small>' : ''}</button>`;
    if (d.act === 3 && S.board) h += `<div class="board"><b>Доска оперсектора</b><span>Пескарёв <i>${S.board.pesk}</i></span><span>${esc(S.name)} <i>${S.board.me}</i></span></div>`;
    const kn = S.cur && isAlb(S.cur) && !rt(S.cur).signed && curCard().note;
    const note = (kn && fill(kn)) || (S.cur && !rt(S.cur).verdict && CASES[S.cur].note) || d.note;
    h += `<div class="sticky">${esc(note)}</div>`;
    if (S.trust <= 2 && !allDone()) h += `<div class="sticky warnnote">${esc(d.warn || 'Ломов спрашивал у Зинаиды Павловны, где лежат обходные листы. Про тебя спрашивал. Ещё одна бумага ему поперёк — и стол освободишь. — И. С.')}</div>`;
    $('#inbox').innerHTML = h;
  }

  function place(c, docs) {
    if (MOB) return; /* на телефоне бумаги лежат стопкой, координаты не нужны */
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
    if (MOB) return;
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

  function docHTML(d, c, person, cs, mark) {
    const p = c.pos[d.id] || { x: 0, y: 0, z: 1 };
    let hash = 0; for (const ch of d.id + S.cur) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
    const rot = ((hash % 7) - 3) * 0.3;
    const ld = cs.docs.findIndex(x => x.id === d.id);
    const lines = d.lines.filter(l => fill(l.v) !== '').map(l => {
      const key = d.id + '.' + l.id;
      return `<div class="ln${l.fresh ? ' fresh' : ''}" data-k="${key}">${l.k ? `<span class="k">${esc(l.k)}:</span> ` : ''}<span class="v">${T(l.v)}</span></div>`;
    }).join('');
    const marked = d.face && ((c.verdict && cs.verdicts.length) || mark);
    return `<div class="doc ${d.kind}${c.fresh.includes(d.id) ? ' new' : ''}${marked ? ' stamped' : ''}" data-doc="${d.id}" style="left:${p.x}px;top:${p.y}px;z-index:${p.z};--r:${rot}deg">
      ${ld >= 0 ? `<span class="ld">${ld * 3 + 2}</span>` : ''}<div class="doc-head">${d.org ? `<div class="doc-org">${esc(d.org)}</div>` : ''}
        <div class="doc-title">${esc(d.title)}</div>${d.sub ? `<div class="doc-sub">${T(d.sub)}</div>` : ''}</div>
      ${d.face ? `<div class="face">${portraitSVG(person.face, cs.no)}</div>` : ''}
      <div class="doc-body">${lines}</div>
      ${d.face && c.verdict && cs.verdicts.length ? `<div class="stamp desk-stamp${ui.slam ? ' slam' : ''}">${esc(cs.verdicts.find(x => x.id === c.verdict).stamp)}</div>` : ''}
      ${d.face && mark ? `<div class="pmark">${esc(mark)}</div>` : ''}</div>`;
  }

  function renderSurface() {
    const sf = $('#surface');
    if (!S.cur) {
      sf.className = 'surface';
      sf.innerHTML = `<div class="baize"></div>${deskProps()}<div class="empty-hint">${allDone() ? 'Все папки сданы.' : 'Возьмите папку из «Входящих».'}</div>`;
      return;
    }
    const X = ctx(), cs = X.cs, c = X.c;
    /* на телефоне только что принесённая бумага ложится наверх стопки */
    const docs = MOB ? X.docs.slice().sort((a, b) => (c.fresh.includes(b.id) ? 1 : 0) - (c.fresh.includes(a.id) ? 1 : 0)) : X.docs;
    const first = !Object.keys(c.pos).length;
    place(c, docs);
    ui.z = Math.max(ui.z, ...Object.values(c.pos).map(p => p.z), 20);
    let strip = `<b>${CASES[S.cur].ro || CASES[S.cur].statement ? esc(CASES[S.cur].title) : 'Дело № ' + cs.no}</b> · ${T(CASES[S.cur].person ? CASES[S.cur].person.name : '')} · ${T(CASES[S.cur].charge)}${c.verdict ? ' · сдано, только чтение' : ''}`;
    let mark = null;
    if (X.alb) {
      const ids = albIds(S.cur), m = rt(S.cur).marks[X.card.id];
      mark = m ? (m === 'o' ? 'отвод' : m === 'r' ? 'на доследование' : MK[m] + ' кат.') : null;
      strip = `<b>${esc(X.alb.kindNo || 'Список')} № ${X.alb.no}</b> · справка ${ids.indexOf(X.card.id) + 1} из ${ids.length} · ${esc(X.card.person.name)}${c.verdict ? ' · подписан, только чтение' : ''}`;
    }
    sf.innerHTML = `<div class="baize"></div>${deskProps()}
      <div class="case-strip">${strip}</div>
      ${docs.map(d => docHTML(d, c, cs.person, cs, mark)).join('')}
      <button class="tidy-btn${c.verdict ? ' solo' : ''}" data-act="tidy" title="Разложить бумаги по столу (R)">Разложить</button>
      ${c.verdict || CASES[S.cur].ro ? '' : `<button class="sv-btn" data-act="sverka">Сверка ${MOB ? '' : '<kbd>пробел</kbd>'}</button>`}`;
    if (first) pack();
    markLines();
  }
  function markLines() {
    const sf = $('#surface'); if (!sf || !S.cur) return;
    const X = ctx(), c = X.c, cs = X.cs, on = ui.sverka && !c.verdict;
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
  /* рисованных предметов на столе нет: только фототекстуры, свет и сами бумаги */
  function deskProps() { return ''; }

  /* гербовая печать на постановлении */
  function sealSVG(t) {
    return `<svg class="seal" viewBox="0 0 120 120"><defs><path id="sealp" d="M60 60 m-45 0 a45 45 0 1 1 90 0 a45 45 0 1 1 -90 0"/></defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="60" cy="60" r="53.5" fill="none" stroke="currentColor" stroke-width=".8"/><circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" stroke-width="1"/>
      <text font-family="Oswald, sans-serif" font-size="9" font-weight="600" fill="currentColor"><textPath href="#sealp" textLength="278" lengthAdjust="spacing">НКВД СССР ★ ${esc(t.toUpperCase())} ★</textPath></text>
      <path d="M60 36 l4.6 13.4 h14.2 l-11.5 8.4 4.4 13.5 -11.7 -8.3 -11.7 8.3 4.4 -13.5 -11.5 -8.4 h14.2Z" fill="none" stroke="currentColor" stroke-width="1.6"/>
      <text x="60" y="86" text-anchor="middle" font-family="Oswald, sans-serif" font-size="7" letter-spacing="1.5" fill="currentColor">ДЛЯ ПАКЕТОВ</text></svg>`;
  }

  /* ---------- правая сторона стола: справка, бланки запросов, бланк постановления ---------- */
  function findItem(cs, c, id, conf, ro) {
    const fd = cs.findings[id], st = c.struck.includes(id), at = c.att.includes(id), bad = conf.includes(id) && !st;
    const tag = fd.kind === 'ex' ? 'в пользу' : (fd.w === 1 ? 'уличает косвенно' : 'уличает');
    let btn = '';
    if (!ro) {
      if (!st) btn += `<button data-act="attach" data-arg="${id}"${!at && live(c).length >= MAXATT ? ' class="full"' : ''}>${at ? 'снять' : 'подшить'}</button>`;
      if (bad || st) btn += `<button class="bx" data-act="strike" data-arg="${id}">${st ? 'восстановить' : 'вычеркнуть'}</button>`;
    }
    return `<li class="${fd.kind}${st ? ' struck' : ''}${at ? ' att' : ''}${bad ? ' need' : ''}"><span class="tag">${tag}</span><span class="ft">${T(fd.t)}</span>${btn ? `<span class="fa">${btn}</span>` : ''}</li>`;
  }

  /* бланк постановления лежит на столе: основания вписаны в три строки, решение подчёркнуто пером, внизу подпись */
  function blankHTML(cs, c, v, open, ro) {
    const d = day(), att = ro ? c.att : live(c), sel = ro ? c.verdict : ui.verdict;
    let lines = '';
    for (let i = 0; i < MAXATT; i++) {
      const f = att[i];
      lines += f ? `<li class="${cs.findings[f].kind}"${ro ? '' : ` data-act="attach" data-arg="${f}" title="Убрать из постановления"`}>${T(cs.findings[f].t)}</li>` : '<li class="empty"></li>';
    }
    const vs = cs.verdicts.filter(x => !ro || x.id === sel).map(x =>
      `<button class="vopt${x.id === sel ? ' on' : ''}" ${ro ? 'disabled' : `data-act="pickv" data-arg="${x.id}"`}><span>${esc(x.label)}</span></button>`).join('');
    let note = '';
    if (!ro && open.length) note = `<div class="warn">В справке ${open.length === 1 ? 'осталась запись, которая противоречит' : 'остались записи, которые противоречат'} постановлению. С такой справкой его не утвердят. Вычеркните ${open.length === 1 ? 'её' : 'их'} — или измените решение.</div>`;
    else if (!ro && v && !att.length) note = '<div class="attn zero">К постановлению ничего не подшито. Подписать можно, но за голую бумагу спросят.</div>';
    const can = !ro && v && !open.length;
    return `<div class="blank${ro ? ' done' : ''}">
      <div class="bl-org">${esc(d.org || ORG)}</div>
      <div class="bl-h">${cs.statement ? 'Показания' : cs.review || cs.rx || cs.fromCard ? 'Заключение' : 'Постановление'}</div>
      <div class="bl-sub">${cs.statement ? 'собственноручные' : (cs.review || cs.rx || cs.fromCard ? 'по жалобе' : 'по следственному делу') + ' № ' + cs.no}</div>
      <p class="bl-t">${cs.statement ? 'По существу вопросов <b>показываю</b>' : 'Рассмотрев материалы дела, <b>нашёл</b>'}:</p>
      <ol class="bl-lines">${lines}</ol>
      <p class="bl-t"><b>${cs.statement ? 'Вину' : 'Постановил'}</b>${ro ? '' : ' <i>(нужное подчеркнуть)</i>'}:</p>
      <div class="vlist">${vs}</div>
      ${note}
      ${ro ? `<div class="sigline done"><i>${esc(S.name)}</i><span>${esc(d.rank)}</span></div><div class="stamp bl-stamp">${esc(v.stamp)}</div>`
           : `<button class="sigline" data-act="sign" ${can ? '' : 'disabled'}><i>${can ? 'расписаться' : ''}</i><span>${esc(d.rank)} — подпись</span></button>`}
    </div>`;
  }

  /* список на тройку справа: строки с карандашными отметками, справка по текущей фамилии, отметка, подпись */
  function albumSide() {
    const a = CASES[S.cur], c = rt(S.cur), ids = albIds(S.cur), k = curCard(), cc = cardRt(k.id), ro = !!c.signed;
    const rows = ids.map((id, i) => {
      const x = cardById(id), m = c.marks[id];
      return `<li class="${id === k.id ? 'cur' : ''}${x.redo ? ' redo' : ''}" data-act="card" data-arg="${id}"><span class="n">${i + 1}.</span><span class="nm">${esc(shortName(x.person.name))}</span><span class="pr">${x.pr === 1 ? 'I' : 'II'}</span><span class="mk${m === 'r' || m === 'o' ? ' soft' : ''}">${m ? MK[m] : ''}</span></li>`;
    }).join('');
    const cnt = v => ids.filter(x => c.marks[x] === v).length;
    const fnd = cc.found.map(f => { const fd = k.findings[f]; return `<li class="${fd.kind}"><span class="tag">${fd.kind === 'ex' ? 'в пользу' : 'уличает'}</span><span class="ft">${T(fd.t)}</span></li>`; }).join('')
      || `<li class="none">${cc.unlocked.includes('p') ? 'Сверкой пока ничего не установлено.' : 'Проверка не запрашивалась.'}</li>`;
    const late = timeLeft() < (k.cost || 40) + COST.hit;
    const req = !ro && k.app && !cc.unlocked.includes('p')
      ? `<div class="slips"><button class="req" data-act="areq" ${late ? 'disabled' : ''}><em>Запрос</em><i>${late ? (day().ot && !S.ot ? 'только вечером' : 'не успеть') : hm(k.cost || 40)}</i><b>${esc(k.app.req || 'Проверить по месту: ' + k.app.title)}</b><span>Без проверки в справке только то, что написал Пескарёв.</span></button></div>` : '';
    const m = c.marks[k.id];
    const opts = [['1', 'Первая категория'], ['2', 'Вторая категория'], ['r', 'Вернуть на доследование']].concat(k.kin ? [['o', 'Заявить отвод: обвиняемый — родственник']] : []);
    const pick = ro ? '' : `<div class="blank amark"><p class="bl-t">Справка № ${ids.indexOf(k.id) + 1}. Предложено: <b>${k.pr === 1 ? 'первая' : 'вторая'} категория</b> <i>(Пескарёв)</i></p>
      <p class="bl-t"><b>Отметка</b> <i>(нужное подчеркнуть)</i>:</p>
      <div class="vlist">${opts.map(o => `<button class="vopt${m === o[0] ? ' on' : ''}" data-act="amark" data-arg="${o[0]}"><span>${o[1]}</span></button>`).join('')}</div></div>`;
    const all = ids.every(x => c.marks[x]);
    let sig;
    if (ro) sig = `<div class="sigline done"><i>${c.by === 'pesk' ? 'за ' + esc(S.name) + ' — Пескарёв' : esc(S.name)}</i><span>${c.void ? 'список не рассмотрен' : 'список подписан' + (c.date ? ', датирован ' + esc(c.date) : '')}</span></div>`;
    else if (a.final) sig = `<p class="bl-t">Дата под подписью:</p><div class="vlist dates"><button class="vopt" data-act="asign" data-arg="14" ${all ? '' : 'disabled'}><span>14 ноября 1938 г. (как велено)</span></button><button class="vopt" data-act="asign" data-arg="16" ${all ? '' : 'disabled'}><span>16 ноября 1938 г. (сегодня)</span></button></div>${all ? '' : '<p class="pnote">подписать можно, когда отмечены все справки</p>'}`;
    else sig = `<button class="sigline" data-act="asign" ${all ? '' : 'disabled'}><i>${all ? 'расписаться' : ''}</i><span>${all ? esc(day().rank) + ' — подпись' : 'отмечены не все справки'}</span></button>`;
    $('#side').innerHTML = `<div class="pile">
      <div class="alist"><div class="al-h">${esc(a.title)} № ${a.no}</div><div class="al-sub">${esc(a.charge)}</div>
        <ol>${rows}</ol>
        <p class="al-t">Лимит на список — ${a.plan}. Отмечено: I — ${cnt('1')}, II — ${cnt('2')}, доследование — ${cnt('r')}${cnt('o') ? ', отвод — ' + cnt('o') : ''}.</p></div>
      <div class="sprav"><h3>${esc(shortName(k.person.name))}</h3><ul class="finds">${fnd}</ul><p class="pnote">проверка — ${k.cost || 40} мин, сверка — ${COST.hit}, мимо — ${missCost()}</p></div>
      ${req}${pick}
      <div class="blank asig"><div class="bl-org">${esc(day().org || ORG)}</div><p class="bl-t">Список проверил:</p>${sig}</div>
    </div>${debugHTML()}`;
  }

  function renderSide() {
    if (isAlb(S.cur)) return albumSide();
    const el = $('#side');
    if (!S.cur) {
      const d = day();
      el.innerHTML = `<div class="clip"><h3>Памятка</h3>${dirDoc().lines.map(l => `<p class="memo${l.fresh ? ' fresh' : ''}">${esc(l.v)}</p>`).join('')}
        <p class="fine">На столе ${casesOf(d).filter(id => !CASES[id].ro && !rt(id).verdict).length} из ${casesOf(d).filter(id => !CASES[id].ro).length} дел.</p></div>${debugHTML()}`;
      return;
    }
    const cs = CASES[S.cur], c = rt(S.cur);
    if (cs.ro) {
      el.innerHTML = `<div class="pile"><div class="sprav"><h3>${esc(cs.title)}</h3><ul class="finds">${(S.file || []).map(f => `<li class="in"><span class="ft">${T(FILEWORD[f.k] || f.k)}${f.no ? ', дело № ' + f.no : ''}</span></li>`).join('') || '<li class="none">Пока в деле только то, что принёс Пескарёв.</li>'}</ul>
        <p class="pnote">${T(cs.side || '')}</p></div></div>${debugHTML()}`;
      return;
    }
    if (c.verdict) {
      const v = cs.verdicts.find(x => x.id === c.verdict);
      el.innerHTML = `<div class="pile"><div class="sprav"><h3>${cs.statement ? 'Ответы комиссии' : 'Справка по делу № ' + cs.no}</h3>
        <ul class="finds">${c.found.map(id => findItem(cs, c, id, [], true)).join('') || '<li class="none">Сверкой ничего не установлено.</li>'}</ul>
        <p class="pnote">Дело сдано. Исход — вечером, в газете и в картотеке.</p></div>
        ${blankHTML(cs, c, v, [], true)}</div>${debugHTML()}`;
      return;
    }
    const v = cs.verdicts.find(x => x.id === ui.verdict);
    const conf = v ? (v.conflicts || []).filter(f => c.found.includes(f)) : [];
    const open = conf.filter(f => !c.struck.includes(f));
    const reqs = (cs.requests || []).filter(r => !c.unlocked.includes(r.doc) && !(r.hide && r.hide(S))).map(r => {
      const gone = r.if && !r.if(S), late = timeLeft() < r.cost + COST.hit, hint = gone ? r.off : r.hint;
      return `<button class="req${gone ? ' gone' : ''}${r.manual ? ' own' : ''}" data-act="req" data-arg="${r.id}" ${late || gone ? 'disabled' : ''}><em>${r.manual ? 'На подпись' : 'Запрос'}</em><i>${gone ? 'поздно' : late ? 'не успеть' : hm(r.cost)}</i><b>${T(r.label)}</b>${hint ? `<span>${T(hint)}</span>` : ''}</button>`;
    }).join('');
    el.innerHTML = `<div class="pile">
      <div class="sprav"><h3>${cs.statement ? 'Ответы комиссии' : 'Справка по делу № ' + cs.no}</h3>
        <ul class="finds">${c.found.map(id => findItem(cs, c, id, conf, false)).join('') || '<li class="none">Сверкой пока ничего не установлено.</li>'}</ul>
        <p class="pnote">сверка — ${COST.hit} мин, мимо — ${COST.miss} мин</p></div>
      ${reqs ? `<div class="slips">${reqs}</div>` : ''}
      ${blankHTML(cs, c, v, open, false)}
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
    const X = ctx(), c = X.c, cs = X.cs;
    if (!ui.sel) { ui.sel = k; snd('pick'); markLines(); if (MOB) toast('Строка выбрана. Теперь вторая — в этой бумаге или в другой. Тронь ту же строку, чтобы отменить.'); return; }
    if (ui.sel === k) { ui.sel = null; markLines(); return; }
    const a = ui.sel, b = k; ui.sel = null;
    const p = cs.pairs.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (p && c.found.includes(p.f)) { toast('Это уже записано в справке.'); refresh(); return; }
    if (timeLeft() <= 0) { toast(day().ot && !S.ot ? 'Рабочий день окончен. Можно остаться на вечер — слева, под папками.' : 'Время вышло. Осталось подписать то, что есть.', 'bad'); refresh(); return; }
    if (p) {
      c.found.push(p.f); c.hits.push(a, b); spend(COST.hit); snd('hit');
      const fd = cs.findings[p.f];
      toast((fd.kind === 'ex' ? 'В пользу обвиняемого. ' : 'Уличает. ') + fill(fd.t) + (X.alb ? ' Записано на поле справки.' : ' Записано в справку — можно подшить к постановлению.'), fd.kind);
    } else {
      /* «тепло»: хотя бы одна из строк ещё участвует в ненайденной связке;
         «об одном»: обе строки ведут к одному ненайденному факту, но друг с другом его не устанавливают */
      const left = cs.pairs.filter(x => !c.found.includes(x.f));
      const inF = (f, k) => left.some(x => x.f === f && (x.a === k || x.b === k));
      const same = left.some(x => inF(x.f, a) && inF(x.f, b));
      const warm = same || left.some(x => [x.a, x.b].some(k => k === a || k === b));
      spend(warm ? COST.hit : missCost()); snd('miss');
      toast(same
        ? 'Обе строки об одном и том же, но друг с другом они ничего не устанавливают. Сверьте каждую с третьей бумагой. Потеряно ' + COST.hit + ' минут.'
        : warm
          ? 'Из этих двух строк вывода не сделать. Но одна из них ещё пригодится — с другой бумагой. Потеряно ' + COST.hit + ' минут.'
          : 'Ни расхождений, ни связи не усматривается. Потеряно ' + missCost() + ' минут.', 'bad');
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
    const was = S.trust;
    S.trust = clamp(S.trust + (fx.trust || 0), 0, 10);
    S.viol += fx.viol || 0;
    if (stretch) S.stretch++;
    /* по жалобе считаются только новые вычёркивания: старые уже лежат в архиве */
    c.struck.filter(f => !(c.oldStruck || []).includes(f)).forEach(f => { if (cs.findings[f].kind === 'ex') S.viol++; else S.cover++; });
    /* осудил, не проверив: оправдание в папке было, но сверкой не найдено */
    if (!cs.review && (v.conflicts || []).some(f => cs.findings[f].kind === 'ex' && !c.found.includes(f))) S.blind++;
    if (v.rv) fileSheets(cs, c, v);
    if (v.decide) S.pendEnd = v.decide(S, score(cs, c, v), c);
    const reply = fill((!founded && v.unf && v.unf.reply) || v.reply);
    c.att = c.att.filter(f => !c.struck.includes(f));
    const fls = (v.flags || []).concat(c.att.map(f => { const x = cs.findings[f].flag; return typeof x === 'function' ? x(S) : x; }).filter(Boolean));
    fls.forEach(f => { if (!S.flags.includes(f)) S.flags.push(f); });
    c.verdict = v.id; c.founded = founded; c.stretch = stretch;
    if (S.board && v.board) S.board.me += v.board;
    S.cards.push({ c: S.cur, day: S.day, v: v.id });
    save();
    const lst = (ids, cl) => ids.map(f => `<span class="${cl} ${cs.findings[f].kind}">${T(cs.findings[f].t)}</span>`).join('');
    const last = S.trust > 0 && S.trust <= 2 && S.trust < was;
    /* сначала штамп ложится на анкету на столе, потом приносят постановление с резолюцией */
    ui.busy = true; ui.slam = true; ui.sverka = false; refresh(true); ui.slam = false;
    const sf = $('#surface'); if (sf) { sf.classList.add('thud'); const st = $('.desk-stamp', sf); if (st) st.parentNode.style.zIndex = ++ui.z; }
    setTimeout(() => snd('stamp'), 240);
    setTimeout(() => { ui.busy = false; if (sf) sf.classList.remove('thud');
      const d = day(), nm = esc(S.name), boss = esc(d.boss || 'Ломов');
      const fnd = c.att.length
        ? `<ol class="post-fnd">${c.att.map(f => `<li class="${cs.findings[f].kind}">${T(cs.findings[f].t)}</li>`).join('')}</ol>`
        : '<p class="post-none">оснований к постановлению не приобщено</p>';
      const excl = c.struck.length
        ? `<div class="post-excl"><b>Из справки по делу исключено:</b>${c.struck.map(f => `<span>${T(cs.findings[f].t)}</span>`).join('')}<i>исключено — ${nm}</i></div>` : '';
      openModal(`<div class="post-wrap"><div class="sheet post blank">
        <div class="post-top">
          <div class="post-res"><i>${esc(reply)}</i>${last ? `<i class="ps">${esc(d.ps || 'И последнее. Ещё одна бумага мне поперёк — сдашь наган и удостоверение.')}</i>` : ''}</div>
          <div class="post-utv"><b>«Утверждаю»</b><span>${esc(d.bossPost || 'Нач. Студенецкого РО НКВД')}</span><em>${boss}</em><span>${esc(d.date)}</span></div>
        </div>
        ${cs.statement ? `<div class="post-h">Собственноручные показания</div>
        <div class="post-sub">${esc(d.rank)} ${nm}</div>
        <div class="post-city"><span>${esc(d.city || 'с. Студёное')}</span><span>${esc(d.date)}</span></div>
        <p>По существу заданных мне вопросов показываю:</p>` : `<div class="post-h">${cs.review || cs.rx ? 'Заключение' : 'Постановление'}</div>
        <div class="post-sub">${cs.review || cs.rx ? 'по жалобе' : 'по следственному делу'} № ${cs.no}</div>
        <div class="post-city"><span>${esc(d.city || 'с. Студёное')}</span><span>${esc(d.date)}</span></div>
        <p>Я, ${esc(d.rank)} ${esc(d.unit || 'Студенецкого РО НКВД')} ${nm}, рассмотрев ${cs.review || cs.rx ? 'жалобу и материалы' : 'следственное'} дело № ${cs.no} (${cs.rx ? 'по жалобе' : 'обвиняемый'} — ${esc(fill(cs.person.name).replace(/\s*\(.*\)/, ''))}),</p>
        <p class="post-c">нашёл:</p>`}
        ${fnd}${excl}
        <p class="post-c">${cs.statement ? 'в чём и расписываюсь:' : 'постановил:'}</p>
        <p class="post-v">${T(v.label)}</p>
        <div class="post-sig"><span>${esc(d.rank)}</span><i>${nm}</i><span>(${nm})</span></div>
        ${sealSVG(d.seal || 'Студенецкое РО')}
        <div class="stamp slam">${esc(v.stamp)}</div>
      </div>
      <div class="post-foot"><div class="tdelta${S.trust < was ? ' down' : S.trust > was ? ' up' : ''}">Доверие руководства: ${was} → ${S.trust}</div>
        <button class="btn" data-act="afterv">Сдать папку</button></div></div>`); }, 850);
  }
  /* список подписан (вами или за вас): отметки становятся исходами, лимит — доверием */
  function settleAlbum(id, by, date) {
    const a = CASES[id], c = rt(id), ids = albIds(id);
    if (c.signed) return null;
    let n1 = 0, n2 = 0, nr = 0, np = 0, rr = 0, extra = 0;
    c.eff = {};
    ids.forEach(x => {
      const k = cardById(x), cc = (c.cf[x] = c.cf[x] || { found: [], hits: [], unlocked: [] });
      let m = c.marks[x];
      if (!m) { m = String(k.pr); c.marks[x] = m; (c.pm = c.pm || []).push(x); np++; }
      const eff = m === 'o' ? String(k.pr) : m, mine = m !== 'o' && !(c.pm || []).includes(x);
      c.eff[x] = eff;
      if (eff === '1') n1++; else if (eff === '2') n2++; else { nr++; if (k.redo) rr++; if (k.retCost) extra += k.retCost; }
      /* осудить невиновного: знал — нарушение, не проверил — вслепую; за отметки Пескарёва — тоже вслепую, подпись ваша */
      const exs = Object.keys(k.findings || {}).filter(f => k.findings[f].kind === 'ex');
      if (exs.length && eff !== 'r' && m !== 'o') { if (mine && exs.some(f => cc.found.includes(f))) S.viol++; else S.blind++; }
      if (k.tag) { flag(k.tag + '_' + (m === 'o' ? 'o' : eff)); if (!mine && m !== 'o') flag(k.tag + '_pesk'); }
    });
    const through = n1 + n2, short = Math.max(0, a.plan - through);
    let delta = short === 0 ? 1 : short <= 2 ? 0 : short <= 5 ? -1 : -2;
    delta -= extra;
    c.date = a.final ? (date === '16' ? '16.XI.1938' : '14.XI.1938') : null;
    if (a.final && date === '16') { c.void = true; delta = -2; flag('honest_date'); }
    else if (a.final) { S.viol += 3; flag(by === 'pesk' ? 'pesk_backdate' : 'backdated'); }
    if (!c.void && S.board) S.board.me += through;
    if (np) S.proxy = (S.proxy || 0) + np;
    const was = S.trust;
    S.trust = clamp(S.trust + delta, 0, 10);
    c.signed = true; c.by = by;
    const r = c.res = { n1, n2, nr, np, plan: a.plan, through, short, delta, was, now: S.trust, void: !!c.void };
    S.cards.push({ alb: id, day: S.day });
    return r;
  }
  function albReply(a, r) {
    const t = a.reply && a.reply(S, r);
    if (t) return t;
    if (r.void) return 'Список датирован шестнадцатым. Тройки с шестнадцатого нет. Значит, нет и списка — и всей вашей работы за день. Пескарёв свой датировал четырнадцатым. Запомните это число: я его запомнил.';
    if (r.short === 0) return 'Список закрыт. Тройка заседает в четверг.';
    if (r.short === 1) return 'Одного недобрали — ладно. Доследуйте, и чтобы к следующему списку он был.';
    return `Лимит на список — ${r.plan}. Прошло ${r.through}. Кто будет добирать остальных — Пескарёв? Он доберёт. Только в другой раз не за вас, а вместо вас.`;
  }
  function signAlbum(date) {
    const a = CASES[S.cur], c = rt(S.cur), ids = albIds(S.cur);
    if (!ids.every(x => c.marks[x])) return;
    const r = settleAlbum(S.cur, 'me', date);
    if (!r) return;
    const d = day();
    save(); ui.sverka = false; snd('stamp'); refresh(true);
    const rows = ids.map((x, i) => { const k = cardById(x), m = c.marks[x]; return `<li><span>${i + 1}. ${esc(k.person.name)}</span><b>${m === 'o' ? 'отвод · ' + MK[c.eff[x]] : MK[m]}</b></li>`; }).join('');
    openModal(`<div class="post-wrap"><div class="sheet post blank alpost">
      <div class="post-top"><div class="post-res"><i>${T(albReply(a, r))}</i></div>
        <div class="post-utv"><b>«Утверждаю»</b><span>${esc(d.bossPost || '')}</span><em>${esc(d.boss || '')}</em><span>${esc(c.date || d.date)}</span></div></div>
      <div class="post-h">${esc(a.title)}</div><div class="post-sub">список № ${a.no} · ${esc(a.court)}</div>
      <ol class="al-rows">${rows}</ol>
      <div class="post-sig"><span>${esc(d.rank)}</span><i>${esc(S.name)}</i><span>${esc(c.date || d.date)}</span></div>
      ${sealSVG(d.seal || '')}<div class="stamp slam">${r.void ? 'НЕ РАССМОТРЕН' : esc(a.stamp || 'НА ТРОЙКУ')}</div></div>
      <div class="post-foot"><div class="tdelta${r.now < r.was ? ' down' : r.now > r.was ? ' up' : ''}">Доверие руководства: ${r.was} → ${r.now}</div>
        <button class="btn" data-act="afterv">Сдать список</button></div></div>`);
  }
  /* исход строки списка для картотеки */
  function albFate(a, c, x) {
    const k = cardById(x), eff = (c.eff || {})[x];
    if (c.void) return 'Рассмотрение приостановлено директивой от 15.XI.1938. Дело передано в суд в общем порядке.';
    if (eff === 'r') return k.redo ? 'Возвращено повторно. Содержится во внутренней тюрьме УНКВД.' : 'Возвращено на доследование.';
    const t = eff === '1' ? (k.fate1 || 'высшая мера. Приговор исполнен.') : (k.fate2 || '10 лет ИТЛ.');
    return `${a.court}, ${c.date || a.trDate}: ${t}`;
  }

  /* лист в личное дело за каждое решение по жалобе */
  function fileSheets(cs, c, v) {
    S.file = S.file || [];
    /* одно дело — один лист; самый тяжёлый вид перекрывает лёгкие */
    const RANK = { fals: 3, hide: 3, nedouch: 2, halat: 1 };
    const add = k => {
      const same = S.file.find(x => x.id === S.cur);
      if (!same) return S.file.push({ k, no: cs.no, id: S.cur });
      if ((RANK[k] || 0) > (RANK[same.k] || 0)) same.k = k;
    };
    const exk = f => cs.findings[f] && cs.findings[f].kind === 'ex';
    if (v.rv === 'prot') c.att.filter(exk).forEach(f => add((c.oldStruck || []).includes(f) ? 'fals' : !(c.oldFound || []).includes(f) ? 'halat' : 'nedouch'));
    if (v.rv === 'keep') c.struck.filter(f => exk(f) && !(c.oldStruck || []).includes(f)).forEach(() => add('hide'));
    if (v.rv === 'drawer' || v.rv === 'truth' || v.rv === 'lie') add(v.rv);
    if (v.rv === 'prot') S.protests = (S.protests || 0) + 1;
  }

  function afterVerdict() {
    closeModal();
    if (S.pendEnd) { const e = S.pendEnd; S.pendEnd = null; return ending(e); }
    if (S.trust <= 0) return ending(day().fired || 'e_fired');
    if (isAlb(S.cur)) { S.cur = null; save(); if (MOB) setTab('inbox'); return refresh(true); }
    if (S.trust <= 0) return ending(day().fired || 'e_fired');
    S.cur = null; ui.verdict = null; ui.sel = null; save(); if (MOB) setTab('inbox'); refresh(true);
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
      ${(S.evn || []).map(t => `<div class="evnote">${T(t)}</div>`).join('')}
      ${paperHTML(d.paper)}
      ${d.home ? `<div class="sheet home"><div class="kicker">Дома</div>${d.home(S).filter(Boolean).map(p => `<p>${T(p)}</p>`).join('')}</div>` : ''}
      ${letters.map(l => `<div class="letter ${l.hand || ''}"><p>${T(l.t)}</p>${l.foot ? `<div class="l-foot">${esc(l.foot)}</div>` : ''}</div>`).join('')}
      <div class="ev-btns"><button class="btn ghost" data-act="cards">Картотека</button><button class="btn" data-act="next">${d.inter ? esc(INTERS[d.inter].label || 'Месяц спустя') : 'Следующий день'}</button></div>
    </div>`;
    window.scrollTo(0, 0);
  }

  const albCount = id => (rt(id).ids || []).length;
  function archiveBody(years) {
    const struck = Object.values(S.cases).reduce((n, c) => n + c.struck.length, 0);
    const n = S.cards.reduce((t, k) => t + (k.alb ? albCount(k.alb) : 1), 0);
    return `<p>За ${esc(years)} через ваш стол прошло ${n} дел. Под каждым постановлением стоит одна и та же фамилия: ${esc(S.name)}.</p>
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
        <div class="dateline">${esc(sc.date)}</div>${sc.text.map(fill).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}
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
    let body = e.text.map(fill).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
    if (e.archive) body = archiveBody(e.archive) + (e.fine ? `<p class="fine">${esc(e.fine)}</p>` : '');
    /* старое сохранение, остановившееся на конце первого акта, можно продолжить */
    const more = /^act\d$/.test(S.ending) && DAYS.length > S.day + 1;
    app.innerHTML = `<div class="center-scr"><div class="sheet brief end"><div class="kicker">${esc(e.kicker)}</div><h1>${esc(e.title)}</h1>${body}
      <div class="ev-btns"><button class="btn ghost" data-act="cards">Картотека</button>${more ? '<button class="btn" data-act="nextact">Следующий акт</button>' : ''}${!more && !/^act\d$/.test(S.ending) && typeof EPI !== 'undefined' ? '<button class="btn" data-act="epi">Эпилог. 1956</button>' : ''}<button class="btn ghost" data-act="restart">Начать заново</button></div></div></div>`;
  }

  /* ---------- эпилог: 1956, комиссия по пересмотру читает ваши справки ---------- */
  /* кто из отпущенных потом оказался в последнем списке (акт III) */
  let LATER = {};
  const NOREHAB = ['zuev', 'yama', 'lomov', 'sychev', 'hrom', 'shev', 'sych2'];
  function epiRow(name, cls, key, freed, no) {
    let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 997;
    const nr = NOREHAB.includes(key);
    if (cls === 'exec') return nr ? 'Расстрелян. В реабилитации отказано.' : 'Расстрелян. Реабилитирован посмертно в ' + (1956 + h % 3) + ' г.';
    if (cls === 'camp') {
      if (freed) return key === 'selkor' || key === 'demin' ? 'Освобождён в 1937 г. по протесту прокурора.' : 'Освобождён в 1939 г. по протесту. Реабилитирован в 1956 г.';
      if (nr) return 'Отбыл срок. В реабилитации отказано.';
      return h % 3 === 0 ? 'Умер в лагере в ' + (1940 + h % 6) + ' г. Реабилитирован посмертно в 1956 г.' : 'Вернулся из лагеря в ' + (1945 + h % 4) + ' г. Реабилитирован в 1956 г.';
    }
    if (cls === 'void') return 'Дело прекращено в 1939 г. Жив.';
    if (cls === 'ret') return 'Освобождён в 1939 г. при пересмотре.';
    return LATER[key] ? 'Дело прекращено. Дальше — см. последний список.' : 'Дело прекращено. В 1956 г. жив.';
  }
  const fateCls = t => /высшая мера|расстрел/i.test(t) ? 'exec' : /ИТЛ|лишения свободы|лагер|Особое совещание|колони/i.test(t) ? 'camp' : 'free';
  function renderEpi() {
    const rows = [], back = { leb: 'selkor', chern2: 'chern', bort2: 'ochered', sin2: 'sinits', kotova2: 'zina', demin2: 'demin', sych2: 'sychev' };
    LATER = {}; ((rt('alb4').ids) || []).forEach(x => { if (back[x]) LATER[back[x]] = true; });
    S.cards.forEach(k => {
      if (k.alb) {
        const a = CASES[k.alb], c = rt(k.alb);
        (c.ids || []).forEach(x => { const p = cardById(x), e = (c.eff || {})[x]; rows.push([p.person.name, epiRow(p.person.name, c.void ? 'void' : e === '1' ? 'exec' : e === '2' ? 'camp' : 'ret', x.replace(/~r$/, ''), F('freed_' + x.replace(/~r$/, '')), a.no)]); });
        return;
      }
      const cs = CASES[k.c]; if (!cs || cs.review || cs.rx || cs.statement || cs.ro || !cs.person) return;
      const v = cs.verdicts.find(x => x.id === k.v);
      /* освобождённые по протесту — в 1937-м (Лебедев, Дёмин) или в 1939-м (жалобы) */
      const freed = F('freed_' + k.c) || (k.c === 'selkor' && F('lebedev_review')) || (k.c === 'demin' && F('demin_review'));
      rows.push([fill(cs.person.name).replace(/\s*\(.*\)/, ''), epiRow(cs.person.name, fateCls(fill(v.fate || '')), k.c, freed, cs.no)]);
    });
    const struck = Object.values(S.cases).reduce((n, c) => n + (c.struck || []).filter(f => !(c.oldStruck || []).includes(f)).length, 0);
    app.innerHTML = `<div class="center-scr"><div class="sheet brief end epi"><div class="kicker">Эпилог</div><h1>Хранить вечно</h1>
      <div class="dateline">май 1956 г. · г. Рогожск, архив УКГБ</div>
      ${EPI.intro(S, struck, rows.length).map(p => `<p>${T(p)}</p>`).join('')}
      <div class="epi-list"><b>Справка по делам, под которыми стоит фамилия ${esc(S.name)}</b><ol>${rows.map(r => `<li><span>${esc(r[0])}</span><em>${esc(r[1])}</em></li>`).join('')}</ol></div>
      ${EPI.after(S).filter(Boolean).map(p => `<p>${T(p)}</p>`).join('')}
      <div class="ev-btns"><button class="btn" data-act="done">Хранить вечно</button></div></div></div>`;
    window.scrollTo(0, 0);
  }

  /* ---------- модальные окна ---------- */
  function openModal(html) { overlay.innerHTML = `<div class="modal">${html}</div>`; overlay.classList.add('on'); }
  function closeModal() { overlay.classList.remove('on'); overlay.innerHTML = ''; }

  function showCards() {
    const cards = S.cards.map(k => {
      if (k.alb) {
        const a = CASES[k.alb], c = rt(k.alb), known = k.day < S.day || S.phase !== 'desk';
        return `<div class="card alb"><div><b>${esc(a.title)} № ${a.no}</b><span>${esc(DAYS[k.day].date)} · ${esc(a.court)}</span>
          <i>${c.by === 'pesk' ? 'Подписал за вас: ст. уполномоченный Пескарёв' : 'Подписал: ' + esc(S.name)}${c.date ? ' · дата под подписью ' + esc(c.date) : ''}</i>
          <ul>${(c.ids || []).map(x => { const p = cardById(x); return `<li><span class="face">${portraitSVG(p.person.face, a.no)}</span><span><b>${esc(p.person.name)}</b><em>${known ? T(albFate(a, c, x)) : 'Исход пока неизвестен.'}</em></span></li>`; }).join('')}</ul></div></div>`;
      }
      const cs = CASES[k.c], v = cs.verdicts.find(x => x.id === k.v), known = k.day < S.day || S.phase !== 'desk';
      const c = rt(k.c);
      return `<div class="card"><div class="face">${portraitSVG(cs.person.face, cs.no)}</div><div>
        <b>${T(cs.person.name)}</b><span>${cs.review || cs.rx ? 'Жалоба по делу' : 'Дело'} № ${cs.no} · ${esc(DAYS[k.day].date)}</span>
        <span>${esc(v.short)} · подшито оснований: ${c.att.length}${c.struck.length ? ` · вычеркнуто из справки: ${c.struck.length}` : ''}</span>
        <em>${known ? T(v.fate) : 'Исход пока неизвестен.'}</em>${(cs.epilog || []).filter(e => e.if(S)).map(e => `<em class="epi">${T(e.t)}</em>`).join('')}
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
      <p>${typeof GUILT !== 'undefined' && S.day >= 11 ? `вина <b>${GUILT(S).g}</b> (${GUILT(S).parts.join(', ')}) · ` : ''}доверие <b>${S.trust}</b> · нарушения <b>${S.viol}</b> · вслепую <b>${S.blind}</b> · укрывательство <b>${S.cover}</b> · натяжки <b>${S.stretch}</b></p>
      <p>флаги: ${S.flags.filter(f => f !== 'tut_sv').join(', ') || '—'}</p>
      <div class="dbg-btns"><button data-act="dbg" data-arg="time">время 9:00</button><button data-act="dbg" data-arg="tp">доверие +1</button><button data-act="dbg" data-arg="tm">доверие −1</button>
      ${DAYS.map((d, i) => `<button data-act="dbg" data-arg="day${i}">день ${i + 1}</button>`).join('')}</div>`;
    if (S.cur && isAlb(S.cur)) {
      const X = ctx(), a = X.alb, k = X.card, al = rt(S.cur), ids = albIds(S.cur);
      const ex = ids.filter(x => Object.values(cardById(x).findings || {}).some(f => f.kind === 'ex')).length;
      h += `<h5>Список № ${a.no} <button data-act="dbg" data-arg="all">найти всё</button></h5><p>лимит ${a.plan} · справок ${ids.length} · с оправданием ${ex} · сверхурочно ${S.ot ? 'да' : 'нет'} · семья ${S.fam == null ? '—' : S.fam} · за вас Пескарёв ${S.proxy || 0}</p>
        <p>справка: ${esc(k.id)} · предложено ${k.pr}${k.app ? ' · проверка ' + (k.cost || 40) + ' мин' : ' · проверки нет'}${k.tag ? ' · флаг ' + k.tag + '_*' : ''}</p>`;
      Object.keys(k.findings || {}).forEach(f => { const fd = k.findings[f]; h += `<div class="dbg-f ${fd.kind}${X.cc.found.includes(f) ? ' ok' : ''}"><b>${f}</b> · ${fd.kind === 'ex' ? 'в пользу' : 'уличает'}<i>${T(fd.t)}</i>${(k.pairs || []).filter(p => p.f === f).map(p => `<span>${p.a} ↔ ${p.b}</span>`).join('')}</div>`; });
      if (!Object.keys(k.findings || {}).length) h += '<p>на этой справке находить нечего</p>';
      return h + '</div>';
    }
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
    if (a === 'all' && S.cur && isAlb(S.cur)) {
      /* в списке отладка находит только то, что уже лежит на столе: проверку надо запросить самому */
      const X = ctx(), vis = X.docs.map(d => d.id);
      X.cs.pairs.forEach(p => { if (!X.c.found.includes(p.f) && [p.a, p.b].every(k => vis.includes(k.split('.')[0]))) { X.c.found.push(p.f); X.c.hits.push(p.a, p.b); spend(COST.hit); } });
      save(); return refresh(true);
    }
    if (a === 'all' && S.cur) {
      const cs = CASES[S.cur], c = rt(S.cur);
      /* запросы, закрытые условием, и те, что игрок делает только сам (свои показания), отладка не трогает */
      /* «найти всё» — как безошибочная сверка: время за каждый факт и за каждый запрос списывается */
      (cs.requests || []).forEach(r => { if (!c.unlocked.includes(r.doc) && !r.manual && !(r.if && !r.if(S))) { c.unlocked.push(r.doc); spend(r.cost); } });
      /* сводятся только строки, которые видны на столе: условные пустые строки не в счёт */
      const vis = new Set(); visibleDocs(S.cur).forEach(d => d.lines.forEach(l => { if (fill(l.v) !== '') vis.add(d.id + '.' + l.id); }));
      cs.pairs.forEach(p => { if (!c.found.includes(p.f) && vis.has(p.a) && vis.has(p.b)) { c.found.push(p.f); c.hits.push(p.a, p.b); spend(COST.hit); } });
      save(); return refresh(true);
    }
    if (a.startsWith('day')) { S.day = +a.slice(3); beginDay(); save(); return go(); }
    save(); refresh();
  }

  /* ---------- действия ---------- */
  const ACT = {
    new() { renderName(); },
    cont() { S = load(); go(); },
    guideok() { S.phase = 'brief'; save(); go(); },
    guide() { openModal(`<div class="sheet guide-sheet">${guideHTML()}<div class="guide-foot"><span></span><button class="btn" data-act="close">Закрыть</button></div></div>`); },
    todesk() { S.phase = 'desk'; S.cur = null; save(); go(); },
    open(id) { S.cur = S.cur === id ? null : id; ui.sel = null; ui.verdict = null; snd('folder'); if (MOB) ui.mtab = S.cur ? 'desk' : 'inbox'; const d = $('.desk'); if (d) d.dataset.tab = ui.mtab; refresh(true); save(); if (MOB) window.scrollTo(0, 0); },
    mtab(t) { setTab(t); },
    view() { VIEW = VIEW === 'auto' ? (MOB ? 'desk' : 'mob') : 'auto'; try { localStorage.setItem('chekist.view', VIEW); } catch (e) { /* не запомнится */ } closeModal(); applyView(); go(); },
    card(id) {
      const c = rt(S.cur); if (c.sel === id) return;
      c.sel = id; c.pos = {}; c.fresh = []; ui.sel = null; snd('paper'); save(); refresh(true); if (MOB) setTab('desk');
    },
    amark(v) {
      const c = rt(S.cur), k = curCard(); if (c.signed) return;
      c.marks[k.id] = c.marks[k.id] === v ? undefined : v; snd('clip');
      if (c.marks[k.id]) { const ids = albIds(S.cur), nx = ids.slice(ids.indexOf(k.id) + 1).concat(ids).find(x => !c.marks[x]); if (nx) { c.sel = nx; c.pos = {}; c.fresh = []; } }
      save(); refresh(true);
    },
    areq() {
      const k = curCard(), cc = cardRt(k.id), c = rt(S.cur);
      if (!k.app || cc.unlocked.includes('p') || timeLeft() < (k.cost || 40) + COST.hit) return;
      spend(k.cost || 40); cc.unlocked.push('p'); c.fresh.push('p');
      const sf = $('#surface'); c.pos.p = { x: Math.round(sf.clientWidth / 2 - 140), y: 120, z: ++ui.z };
      save(); refresh(true); snd('knock'); if (MOB) setTab('desk');
      toast('Через ' + hm(k.cost || 40) + ' принесли: «' + k.app.title + '». Сверьте со справкой.');
    },
    asign(d) { signAlbum(d); },
    stay() { S.ot = true; snd('knock'); save(); refresh(); toast('Вы остались. Дежурный принёс чай. До одиннадцати вечера вы на месте.'); },
    tidy() { if (!S.cur) return; snd('paper'); pack(); save(); },
    mute() { MUTE = !MUTE; try { localStorage.setItem('chekist.mute', MUTE ? '1' : '0'); } catch (e) { /* не запомнится */ } ACT.menu(); snd('clip'); },
    sverka() {
      if (!S.cur || ctx().c.verdict || CASES[S.cur].ro) return;
      ui.sverka = !ui.sverka; ui.sel = null; if (!S.flags.includes('tut_sv')) S.flags.push('tut_sv'); markLines();
    },
    req(id) {
      const cs = CASES[S.cur], c = rt(S.cur), r = cs.requests.find(x => x.id === id);
      if (!r || timeLeft() < r.cost + COST.hit || (r.if && !r.if(S))) return;
      spend(r.cost); c.unlocked.push(r.doc); c.fresh.push(r.doc);
      if (r.flag && !S.flags.includes(r.flag)) S.flags.push(r.flag);
      const sf = $('#surface'), doc = cs.docs.find(d => d.id === r.doc);
      c.pos[r.doc] = { x: Math.round(sf.clientWidth / 2 - 160), y: 90, z: ++ui.z };
      save(); refresh(true); snd('knock'); if (MOB) setTab('desk');
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
    endday() {
      const d = day();
      S.evn = [];
      casesOf(d).forEach(id => {
        if (!CASES[id].album || rt(id).signed) return;
        const a = CASES[id], r = settleAlbum(id, 'pesk', '14');
        S.evn.push(`Список № ${a.no} вы не подписали. Его досдал ст. уполномоченный Пескарёв: ${r.np ? r.np + ' справок он отметил за вас — по своим предложениям, ' : ''}подпись под списком ваша${rt(id).date ? ', дата — ' + rt(id).date : ''}.`);
        S.evn.push(`«${albReply(a, r)}» — ${d.boss || ''}. Доверие руководства: ${r.was} → ${r.now}.`);
      });
      if (d.ot) {
        S.lateToday = S.time > d.minutes; S.tired = S.time > d.minutes + 180;
        S.homeAt = hhmm(Math.max(S.time, d.minutes) + 40);
        if (F('married') && !F('divorced')) S.fam = S.lateToday ? (S.fam || 0) - 1 : Math.min(3, (S.fam || 0) + 1);
        if (S.board) S.board.pesk += d.peskAdd || 0;
      }
      if (d.after) d.after(S);
      if (F('married') && S.fam <= 0) flag('nina_left');
      S.phase = 'evening'; S.cur = null; save();
      if (S.trust <= 0) return ending(d.fired || 'e_fired');
      go();
    },
    next() {
      if (day().inter) { S.phase = 'inter'; S.step = 0; }
      else { S.day++; beginDay(); }
      save(); go();
    },
    inter() { S.step = 1; save(); go(); },
    actend() { const it = INTERS[day().inter]; if (it.ending) return ending(it.ending); S.step = 2; save(); go(); },
    nextact() { if (S.day >= DAYS.length - 1) return; S.day++; S.ending = null; beginDay(); save(); go(); },
    cards() { showCards(); },
    papers(i) { showPapers(i); },
    close() { closeModal(); },
    menu() {
      openModal(`<div class="sheet cards"><h2>Меню</h2><p class="fine">Игра сохраняется сама после каждого действия.</p>
        <p class="fine">Режим отладки (F2) показывает, какие строки сверяются, что нужно подшить и куда ведёт каждое постановление.</p>
        <div class="ev-btns menu-btns"><button class="btn ghost" data-act="totitle">На титул</button><button class="btn ghost" data-act="guide">Порядок работы</button><button class="btn ghost" data-act="view">Вид: ${VIEW === 'auto' ? 'сам (' + (MOB ? 'телефон' : 'стол') + ')' : VIEW === 'mob' ? 'телефон' : 'стол'}</button><button class="btn ghost" data-act="mute">Звук: ${MUTE ? 'включить' : 'выключить'}</button><button class="btn ghost" data-act="dbgtoggle">Отладка: ${DBG ? 'выключить' : 'включить'}</button><button class="btn" data-act="close">Вернуться</button></div></div>`);
    },
    dbgtoggle() { closeModal(); setDebug(!DBG); },
    dbgoff() { setDebug(false); },
    dbg(a) { dbgAct(a); },
    totitle() { closeModal(); S = null; ui.sverka = false; renderTitle(); },
    epi() { S.phase = 'epi'; save(); go(); },
    done() { try { localStorage.setItem('chekist.done', (ENDINGS[S.ending] && ENDINGS[S.ending].year) || '1939'); } catch (e) { /* без хранилища */ } wipe(); S = null; renderTitle(); },
    restart() { wipe(); S = null; ui.sverka = false; go(); },
  };

  document.addEventListener('click', e => {
    /* на телефоне строку выбирают касанием (click), чтобы прокрутка пальцем не выбирала строки */
    if (MOB && S && S.cur && !ui.busy) {
      const doc = e.target.closest('.surface .doc');
      if (doc) {
        const c = ctx().c, fi = c.fresh.indexOf(doc.dataset.doc);
        if (fi >= 0) { c.fresh.splice(fi, 1); doc.classList.remove('new'); }
        const ln = e.target.closest('.ln');
        if (ui.sverka && ln && !c.verdict) { pick(ln.dataset.k); return; }
      }
    }
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || ui.busy) return;
    const f = ACT[b.dataset.act];
    if (f) f(b.dataset.arg);
  });
  overlay.addEventListener('click', e => { if (e.target === overlay && !$('.post', overlay)) closeModal(); });

  /* перетаскивание бумаг и выбор строк */
  app.addEventListener('pointerdown', e => {
    if (MOB) return; /* на телефоне бумаги не таскают: стопка листается пальцем */
    const doc = e.target.closest('.surface .doc');
    if (!doc || !S || !S.cur || ui.busy) return;
    const c = ctx().c, id = doc.dataset.doc, p = c.pos[id];
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
