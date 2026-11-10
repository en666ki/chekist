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
      const keys = new Set();
      cs.docs.forEach(d => d.lines.forEach(l => keys.add(d.id + '.' + l.id)));
      DAYS.forEach(d => d.directives.forEach(x => keys.add('dir.' + x.id)));
      cs.pairs.forEach(p => { [p.a, p.b].forEach(k => { if (!keys.has(k)) errs.push(id + ': нет строки ' + k); }); if (!cs.findings[p.f]) errs.push(id + ': нет факта ' + p.f); });
      Object.keys(cs.findings).forEach(f => { if (!cs.pairs.some(p => p.f === f)) errs.push(id + ': факт без пары ' + f); });
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
  const STRATS = {
    'ленивый каратель': { find: false, v: HARSH },
    'ленивый добряк': { find: false, v: KIND },
    'честный': { find: true, v: FAIR },
    'честный с отказом': { find: true, v: Object.assign({}, FAIR, { selkor: 'vstop' }) },
    'знающий каратель': { find: true, v: HARSH },
    'середняк': { find: true, v: MID },
    'мягкий': { find: true, v: Object.assign({}, FAIR, { zuev: 'v82' }) },
  };

  async function reset() {
    for (let i = 0; i < 6; i++) {
      if (q('[data-act=new]')) break;
      const b = q('[data-act=totitle]') || q('[data-act=afterv]') || q('[data-act=close]') || q('[data-act=restart]') || q('[data-act=menu]');
      if (b) b.click();
      await wait(30);
    }
    localStorage.removeItem('chekist.save.v2');
    click('[data-act=new]'); click('#nameform button');
    if (q('[data-act=guideok]')) click('[data-act=guideok]');
  }

  async function run(name) {
    const sg = STRATS[name], trust = [];
    await reset();
    let end = null;
    outer:
    for (let d = 0; d < DAYS.length; d++) {
      click('[data-act=todesk]');
      for (const id of DAYS[d].cases) {
        const cs = CASES[id], v = cs.verdicts.find(x => x.id === sg.v[id]);
        click('.folder[data-arg=' + id + ']');
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
      click('[data-act=endday]'); click('[data-act=next]');
    }
    if (!end) { click('[data-act=inter]'); click('[data-act=actend]'); end = st().ending; }
    const s = st();
    return { name, trust: trust.join(' '), end, viol: s.viol, blind: s.blind, cover: s.cover, stretch: s.stretch };
  }

  async function all() { const out = []; for (const n of Object.keys(STRATS)) out.push(await run(n)); console.table(out); return out; }
  window.PT = { check, run, all, STRATS };
})();
