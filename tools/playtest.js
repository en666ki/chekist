/* Прогон акта I по стратегиям через интерфейс.
   Открыть игру с ?debug, в консоли:
     await import('./tools/playtest.js'); await PT.all()
   Скрипт жмёт те же кнопки, что и игрок; сверку заменяет отладочная «найти всё». */
(function () {
  const q = (s, el) => (el || document).querySelector(s);
  const qa = (s, el) => [...(el || document).querySelectorAll(s)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const click = s => { const b = q(s); if (!b) throw new Error('нет кнопки ' + s); b.click(); };
  const st = () => JSON.parse(localStorage.getItem('chekist.save.v2'));

  /* проверка данных: строки пар существуют, у факта есть пара, порог набирается в три строки */
  function check() {
    const errs = [];
    for (const [id, cs] of Object.entries(CASES)) {
      if (cs.album) {
        /* список: у каждой справки пары ссылаются на её строки (k.*) и приложение (p.*), у факта есть пара */
        if (cs.from && !CASES[cs.from]) errs.push(id + ': нет списка ' + cs.from);
        if (cs.plan > cs.cards.filter(k => !k.if).length) errs.push(id + ': лимит больше списка');
        cs.cards.forEach(k => {
          const keys = new Set(k.lines.map(l => 'k.' + l.id).concat(k.app ? k.app.lines.map(l => 'p.' + l.id) : []));
          (k.pairs || []).forEach(pp => [pp.a, pp.b].forEach(x => { if (!keys.has(x)) errs.push(id + '/' + k.id + ': нет строки ' + x); }));
          Object.keys(k.findings || {}).forEach(f => { if (!(k.pairs || []).some(pp => pp.f === f)) errs.push(id + '/' + k.id + ': факт без пары ' + f); });
          if ((k.pairs || []).length && !k.app) errs.push(id + '/' + k.id + ': пары есть, приложения нет');
        });
        continue;
      }
      const keys = new Set();
      cs.docs.forEach(d => d.lines.forEach(l => keys.add(d.id + '.' + l.id)));
      DAYS.forEach(d => d.directives.forEach(x => keys.add('dir.' + x.id)));
      cs.pairs.forEach(p => { [p.a, p.b].forEach(k => { if (!keys.has(k)) errs.push(id + ': нет строки ' + k); }); if (!cs.findings[p.f]) errs.push(id + ': нет факта ' + p.f); });
      Object.keys(cs.findings).forEach(f => { if (!cs.pairs.some(p => p.f === f)) errs.push(id + ': факт без пары ' + f); });
      const seen = {};
      cs.pairs.forEach(p => { const k = [p.a, p.b].sort().join(' ~ '); if (seen[k]) errs.push(id + ': пара ' + k + ' записана дважды (' + seen[k] + ', ' + p.f + ')'); seen[k] = p.f; });
      Object.keys(cs.findings).forEach(f => { if (!cs.verdicts.some(v => (v.grounds || []).concat(v.conflicts || []).includes(f))) errs.push(id + ': факт ' + f + ' не нужен ни одному решению'); });
      cs.verdicts.forEach(v => {
        (v.grounds || []).concat(v.conflicts || []).forEach(f => { if (!cs.findings[f]) errs.push(id + '/' + v.id + ': нет факта ' + f); });
        if (v.grounds) {
          const w = v.grounds.filter(f => !(v.conflicts || []).includes(f)).map(f => cs.findings[f].w || 2).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
          if (w < (v.need || 2)) errs.push(id + '/' + v.id + ': порог недостижим в три строки');
        }
      });
    }
    DAYS.forEach(d => { d.cases.forEach(c => { if (!CASES[c]) errs.push('нет дела ' + c); }); d.paper.items.forEach(i => { if (i.c && !CASES[i.c]) errs.push('газета: нет дела ' + i.c); }); });
    return errs;
  }

  const HARSH = { kolos: 'v78', yama: 'v5814', telka: 'v79', zuev: 'v589', demin: 'v78', chast: 'v5810', padezh: 'v587', ochered: 'v588', seld: 'v5810', selkor: 'voso' };
  const KIND = { kolos: 'vstop', yama: 'vstop', telka: 'vstop', zuev: 'vstop', demin: 'vsych', chast: 'vprof', padezh: 'vhl', ochered: 'vstop', seld: 'vstop', selkor: 'vstop' };
  const FAIR = { kolos: 'vstop', yama: 'v61', telka: 'vstop', zuev: 'v589', demin: 'vsych', chast: 'vprof', padezh: 'vhl', ochered: 'vstop', seld: 'vstop', selkor: 'voso' };
  const MID = { kolos: 'v162', yama: 'v61', telka: 'vadm', zuev: 'v82', demin: 'v111', chast: 'vprof', padezh: 'v111', ochered: 'v5810', seld: 'vstop', selkor: 'voso' };
  /* акт II */
  Object.assign(HARSH, { sychev: 'v587', lomov: 'vkr', zina: 'v5812', sinits: 'v587', puzyr: 'voso', chern: 'voso' });
  Object.assign(KIND, { sychev: 'vstop', lomov: 'vstop', zina: 'vuv', sinits: 'vstop', puzyr: 'vstop', chern: 'vuv' });
  Object.assign(FAIR, { sychev: 'v78', lomov: 'v193', zina: 'vuv', sinits: 'vstop', puzyr: 'v95', chern: 'vuv' });
  Object.assign(MID, { sychev: 'v78', lomov: 'vkr', zina: 'vuv', sinits: 'v111', puzyr: 'v95', chern: 'v193' });
  /* акт III: полные дела и как вести списки */
  Object.assign(HARSH, { timof: 'v1', krivo: 'v1', hlyst: 'v1', zarec: 'voso' });
  Object.assign(KIND, { timof: 'vstop', krivo: 'vstop', hlyst: 'vrep', zarec: 'vfree' });
  Object.assign(FAIR, { timof: 'vstop', krivo: 'v2', hlyst: 'v2', zarec: 'vfree' });
  Object.assign(MID, { timof: 'v2', krivo: 'v2', hlyst: 'v2', zarec: 'voso' });
  /* alb: proposed — как предложил Пескарёв, fair — проверять и возвращать оправданных, kind — всех на доследование, lazy — не открывать */
  const A_HARSH = { alb: 'proposed', kin: '1', date: '14' }, A_KIND = { alb: 'kind', kin: 'r', date: '16' };
  const A_FAIR = { alb: 'fair', kin: 'r', date: '16', stay: true }, A_MID = { alb: 'proposed', kin: 'o', date: '14' };
  const SVOI = { chern: ['r_svoi'] };
  const STRATS = {
    'ленивый каратель': { find: false, v: HARSH, a: { alb: 'lazy' } },
    'ленивый добряк': { find: false, v: KIND, a: A_KIND },
    'честный': { find: true, v: FAIR, a: A_FAIR },
    'честный III, остаётся по вечерам': { find: true, v: Object.assign({}, FAIR, { chern: 'voso' }), req: SVOI, a: A_FAIR },
    'честный III, уходит домой вовремя': { find: true, v: Object.assign({}, FAIR, { chern: 'voso' }), req: SVOI, a: Object.assign({}, A_FAIR, { stay: false }) },
    'честный III, тесть — вторая, дата 14-м': { find: true, v: Object.assign({}, FAIR, { chern: 'voso' }), req: SVOI, a: Object.assign({}, A_FAIR, { kin: '2', date: '14' }) },
    'компромисс III: оправданных — во вторую': { find: true, v: Object.assign({}, MID, { chern: 'voso' }), req: SVOI, a: Object.assign({}, A_FAIR, { soft: true, kin: '2', date: '14' }) },
    'честный III, отвод за тестя': { find: true, v: Object.assign({}, FAIR, { chern: 'voso' }), req: SVOI, a: Object.assign({}, A_FAIR, { kin: 'o' }) },
    'честный с отказом': { find: true, v: Object.assign({}, FAIR, { selkor: 'vstop' }) },
    'знающий каратель': { find: true, v: HARSH, req: SVOI, a: A_HARSH },
    'честный, Черных в трибунал': { find: true, v: Object.assign({}, FAIR, { chern: 'v193' }), a: A_FAIR },
    'спасти Черных': { find: true, v: Object.assign({}, FAIR, { sychev: 'v587', lomov: 'vkr' }), a: A_FAIR },
    'середняк': { find: true, v: MID, a: A_MID },
    'мягкий': { find: true, v: Object.assign({}, FAIR, { zuev: 'v82' }) },
  };

  async function reset() {
    for (let i = 0; i < 8; i++) {
      if (q('[data-act=new]')) break;
      const b = q('[data-act=totitle]') || q('[data-act=afterv]') || q('[data-act=close]') || q('[data-act=restart]') || q('[data-act=menu]') || q('[data-act=todesk]') || q('[data-act=guideok]');
      if (b) b.click();
      await wait(30);
    }
    localStorage.removeItem('chekist.save.v2');
    click('[data-act=new]'); click('#nameform button');
    if (q('[data-act=guideok]')) click('[data-act=guideok]');
  }

  /* список: по справке за раз — открыть, при необходимости проверить, отметить; потом подписать */
  async function runAlbum(id, a) {
    if (!a || a.alb === 'lazy') return null;
    click('.folder[data-arg=' + id + ']');
    const ids = st().cases[id].ids;
    for (const x of ids) {
      if (!q('[data-act=card][data-arg="' + x + '"]')) continue;
      click('[data-act=card][data-arg="' + x + '"]');
      const k = ALBCARDS[x.replace(/~r$/, '')] || { findings: {} };
      let m = String(x.endsWith('~r') ? 1 : k.pr || 1);
      if (a.alb === 'kind') m = 'r';
      if (a.alb === 'fair') {
        let r = q('[data-act=areq]');
        if (r && r.disabled && a.stay && q('[data-act=stay]')) { click('[data-act=stay]'); r = q('[data-act=areq]'); }
        if (r && !r.disabled) { r.click(); click('[data-act=dbg][data-arg=all]'); }
        const cc = st().cases[id].cf[x] || { found: [] };
        const card = window.__card ? window.__card(x) : null;
        const kinds = cc.found.map(f => ((card || k).findings[f] || {}).kind);
        if (cc.unlocked && cc.unlocked.includes('p') || r === null) m = kinds.includes('ex') ? (a.soft ? '2' : 'r') : kinds.includes('in') ? m : '2';
        else if (!a.stay) continue; /* не успел проверить — оставить Пескарёву */
      }
      if (k.kin && a.kin) m = a.kin;
      click('[data-act=amark][data-arg="' + m + '"]');
    }
    const all = st().cases[id].ids.every(x => st().cases[id].marks[x]);
    if (!all) return null;
    if (CASES[id].final) click('[data-act=asign][data-arg="' + (a.date || '14') + '"]'); else click('[data-act=asign]');
    await wait(80);
    click('[data-act=afterv]');
    return st().trust;
  }

  async function run(name) {
    const sg = STRATS[name], trust = [];
    await reset();
    let end = null;
    outer:
    for (let d = 0; d < DAYS.length; d++) {
      click('[data-act=todesk]');
      for (const id of DAYS[d].cases) {
        if (CASES[id].album) { const t = await runAlbum(id, sg.a); if (t != null) trust.push('[' + t + ']'); if (q('.end')) { end = st().ending; break outer; } continue; }
        const cs = CASES[id], v = cs.verdicts.find(x => x.id === sg.v[id]);
        click('.folder[data-arg=' + id + ']');
        ((sg.req || {})[id] || []).forEach(r => click('[data-act=req][data-arg=' + r + ']'));
        if (sg.find) click('[data-act=dbg][data-arg=all]');
        for (let pass = 0; pass < (v.refuse ? 2 : 1); pass++) {
          click('[data-act=pickv][data-arg=' + v.id + ']');
          qa('.finds .bx').filter(b => b.textContent === 'вычеркнуть').map(b => b.dataset.arg).forEach(f => click('[data-act=strike][data-arg=' + f + ']'));
          const c = st() ? (st().cases[id] || { found: [], struck: [], att: [] }) : { found: [], struck: [], att: [] };
          (v.grounds || []).filter(f => c.found.includes(f) && !c.struck.includes(f) && !c.att.includes(f))
            .sort((a, b) => (cs.findings[b].w || 2) - (cs.findings[a].w || 2)).slice(0, 3)
            .forEach(f => click('[data-act=attach][data-arg=' + f + ']'));
          click('[data-act=sign]');
          await wait(v.refuse ? 60 : 950);
          if (q('.end')) { end = st().ending; break outer; }
          if (q('[data-act=close]')) click('[data-act=close]');
        }
        trust.push(st().trust);
        click('[data-act=afterv]');
        if (q('.end')) { end = st().ending; break outer; }
      }
      click('[data-act=endday]');
      if (q('.end')) { end = st().ending; break; }
      click('[data-act=next]');
      if (q('[data-act=inter]')) {
        click('[data-act=inter]'); click('[data-act=actend]');
        if (q('[data-act=nextact]')) click('[data-act=nextact]'); else { end = st().ending; break; }
      }
    }
    const s = st();
    return { name, trust: trust.join(' '), end, viol: s.viol, blind: s.blind, cover: s.cover, stretch: s.stretch, fam: s.fam, proxy: s.proxy || 0,
      board: s.board ? s.board.me + '/' + s.board.pesk : '',
      flags: s.flags.filter(f => /review|named|testified|chern_|zina_|lavrov|divorced|nina|date|backdate/.test(f)).join(' ') };
  }

  async function all() { const out = []; for (const n of Object.keys(STRATS)) out.push(await run(n)); console.table(out); return out; }
  window.PT = { check, run, all, STRATS };
})();
