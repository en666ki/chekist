'use strict';
/* Процедурные тюремные фотокарточки: анфас, серая стена, ростовая линейка, дощечка с номером дела.
   Лицо остаётся условным, но несёт приметы из анкеты:
     s 'm'|'f', age, w (ширина лица), seed
     hair 'short'|'side'|'bald', hat 'scarf'|'cap' (кепку на съёмке снимают — остаются залысины), gray
     beard 1|2, must, glasses
     gaunt  — впалые щёки (голод, тюрьма)        scar  — шрам над левой бровью
     bruise — кровоподтёк под глазом             squint — щурится, слабые глаза
     jowl   — тяжёлая нижняя часть лица          stub  0 — выбрит (по умолчанию у мужчин щетина)
   Общие фильтры и градиенты (#pgrain, #pvig, #psoft) лежат в index.html. */
function portraitSVG(p, no) {
  let s = (p.seed || 7) * 7919 + 13;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const j = (a, b) => a + (b - a) * r();
  const n = v => Math.round(v * 10) / 10;
  const f = p.s === 'f', age = p.age || 40, old = age >= 55, young = age < 25;
  const cx = 50, cy = 47;
  const fw = j(19.5, 21.5) * (p.w || 1), top = cy - j(26.5, 28);
  const jw = fw * (p.jowl ? 1.02 : p.gaunt ? 0.74 : f ? 0.8 : 0.88);
  const chin = cy + (p.gaunt ? 28.5 : 27) + (p.jowl ? 1 : 0);
  const skin = old ? '#a9a192' : '#b9b1a1', sh = '#7f776a', dk = '#1e1c19';
  const gray = old || p.gray;
  const hc = gray ? '#97938a' : (r() > 0.5 ? '#26221e' : '#3d362e');
  const ey = cy - 2, ex = fw * 0.45, my = cy + 16.5;
  const fold = age >= 55 ? 0.8 : age >= 45 ? 0.6 : age >= 30 ? 0.36 : 0.14;
  let o = '';

  /* стена и ростовая линейка */
  o += '<rect width="100" height="120" fill="#8c897f"/>';
  for (let y = 8, k = 0; y < 104; y += 8, k++) {
    o += `<line x1="0" x2="${k % 2 ? 5 : 9}" y1="${y}" y2="${y}" stroke="#5f5c54" stroke-width=".7"/>`;
    if (!(k % 2)) o += `<text x="10.5" y="${y + 2}" font-family="monospace" font-size="4.4" fill="#5f5c54">${185 - k * 5}</text>`;
  }
  o += `<ellipse cx="${cx + 5}" cy="${cy + 4}" rx="${fw + 13}" ry="40" fill="#000" opacity=".16" filter="url(#psoft)"/>`;

  /* плечи опущены; ватник или кофта, ворот расстёгнут */
  const coat = f ? '#3a3631' : (p.coat || '#2f2c28');
  o += `<path d="M1 120 Q5 103 32 95 L68 95 Q95 103 99 120Z" fill="${coat}"/>`;
  if (f) o += `<path d="M38 95 Q50 106 62 95 L60 91 L40 91Z" fill="#8f897c"/>`;
  else {
    o += `<path d="M40 94 L50 108 L60 94 L57 90 L43 90Z" fill="#9a9487"/>`;
    o += `<path d="M24 100 L30 120 M76 100 L70 120 M50 108 L50 120" stroke="#1b1917" stroke-width=".7" stroke-dasharray="1.6 1.4" fill="none" opacity=".7"/>`;
  }
  /* шея */
  o += `<path d="M${cx - 7.5} ${chin - 8} L${cx - 8.5} 94 Q${cx} 100 ${cx + 8.5} 94 L${cx + 7.5} ${chin - 8}Z" fill="${sh}"/>`;
  o += `<path d="M${cx - 7.5} ${chin - 6} Q${cx} ${chin + 4} ${cx + 7.5} ${chin - 6} L${cx + 8} ${chin + 2} Q${cx} ${chin + 9} ${cx - 8} ${chin + 2}Z" fill="${dk}" opacity=".38"/>`;

  /* волосы за головой у женщин без платка */
  if (f && p.hat !== 'scarf') o += `<path d="M${n(cx - fw - 3)} ${cy + 6} Q${n(cx - fw - 5)} ${n(top - 5)} ${cx} ${n(top - 4)} Q${n(cx + fw + 5)} ${n(top - 5)} ${n(cx + fw + 3)} ${cy + 6} Q${cx} ${cy - 6} ${n(cx - fw - 3)} ${cy + 6}Z" fill="${hc}"/>`;

  /* уши, голова */
  o += `<ellipse cx="${n(cx - fw)}" cy="${cy + 1}" rx="3" ry="5.6" fill="${sh}"/><ellipse cx="${n(cx + fw)}" cy="${cy + 1}" rx="3" ry="5.6" fill="#6c655a"/>`;
  const R = `C${n(cx + fw * 0.62)} ${n(top)} ${n(cx + fw)} ${cy - 26} ${n(cx + fw)} ${cy - 6} C${n(cx + fw)} ${cy + 8} ${n(cx + jw)} ${cy + 19} ${n(cx + jw * 0.72)} ${cy + 23} Q${n(cx + jw * 0.35)} ${n(chin)} ${cx} ${n(chin)}`;
  const Lft = `Q${n(cx - jw * 0.35)} ${n(chin)} ${n(cx - jw * 0.72)} ${cy + 23} C${n(cx - jw)} ${cy + 19} ${n(cx - fw)} ${cy + 8} ${n(cx - fw)} ${cy - 6} C${n(cx - fw)} ${cy - 26} ${n(cx - fw * 0.62)} ${n(top)} ${cx} ${n(top)}`;
  o += `<path d="M${cx} ${n(top)} ${R} ${Lft}Z" fill="${skin}"/>`;
  /* теневая сторона: свет сверху-слева, жёсткий */
  o += `<path d="M${cx} ${n(top)} ${R} Q${cx + 3.5} ${cy + 12} ${cx + 5} ${cy - 3} Q${cx + 6.5} ${cy - 18} ${cx} ${n(top)}Z" fill="${dk}" opacity=".26"/>`;
  /* впалые щёки */
  if (p.gaunt || age >= 50) {
    const a = p.gaunt ? 0.3 : 0.17;
    o += `<ellipse cx="${n(cx - fw * 0.6)}" cy="${cy + 10}" rx="3.6" ry="8.5" fill="${dk}" opacity="${a}" transform="rotate(12 ${n(cx - fw * 0.6)} ${cy + 10})" filter="url(#psoft)"/>`;
    o += `<ellipse cx="${n(cx + fw * 0.6)}" cy="${cy + 10}" rx="3.6" ry="8.5" fill="${dk}" opacity="${a + 0.08}" transform="rotate(-12 ${n(cx + fw * 0.6)} ${cy + 10})" filter="url(#psoft)"/>`;
  }
  if (p.jowl) o += `<path d="M${n(cx - jw * 0.9)} ${cy + 17} Q${cx} ${n(chin + 5)} ${n(cx + jw * 0.9)} ${cy + 17}" stroke="${sh}" stroke-width="1.6" fill="none" opacity=".7"/>`;

  /* щетина — до рта, чтобы рот рисовался поверх */
  const lower = `M${n(cx - jw * 0.98)} ${cy + 7} Q${n(cx - jw * 1.02)} ${cy + 22} ${cx} ${n(chin - 0.4)} Q${n(cx + jw * 1.02)} ${cy + 22} ${n(cx + jw * 0.98)} ${cy + 7} Q${cx + 7} ${cy + 12.5} ${cx} ${cy + 12} Q${cx - 7} ${cy + 12.5} ${n(cx - jw * 0.98)} ${cy + 7}Z`;
  if (!f && !p.beard && p.stub !== 0 && !young) o += `<path d="${lower}" fill="${dk}" opacity=".15"/>`;

  /* волосы */
  const cap = (h, dip) => `M${n(cx - fw - 0.6)} ${cy - 7} C${n(cx - fw - 1.4)} ${n(top - h)} ${n(cx + fw + 1.4)} ${n(top - h)} ${n(cx + fw + 0.6)} ${cy - 7} Q${n(cx + fw - 2)} ${cy - 19} ${cx + 8} ${n(top + dip + 1.5)} Q${cx} ${n(top + dip)} ${cx - 8} ${n(top + dip + 1.5)} Q${n(cx - fw + 2)} ${cy - 19} ${n(cx - fw - 0.6)} ${cy - 7}Z`;
  if (p.hat !== 'scarf') {
    if (p.hair === 'bald' || p.hat === 'cap') {
      /* залысины: остатки по бокам; под кепкой — редкий ёжик на темени */
      o += `<path d="M${n(cx - fw - 0.5)} ${cy - 4} Q${n(cx - fw - 2)} ${cy - 17} ${n(cx - fw + 3)} ${cy - 21} Q${n(cx - fw + 2.5)} ${cy - 12} ${n(cx - fw + 0.5)} ${cy - 4}Z" fill="${hc}"/>`;
      o += `<path d="M${n(cx + fw + 0.5)} ${cy - 4} Q${n(cx + fw + 2)} ${cy - 17} ${n(cx + fw - 3)} ${cy - 21} Q${n(cx + fw - 2.5)} ${cy - 12} ${n(cx + fw - 0.5)} ${cy - 4}Z" fill="${hc}"/>`;
      if (p.hat === 'cap' && p.hair !== 'bald') o += `<path d="${cap(9.5, 3.5)}" fill="${hc}" opacity=".34"/>`;
    } else if (f) {
      o += `<path d="M${n(cx - fw - 1)} ${cy - 2} Q${n(cx - fw - 1)} ${n(top - 5)} ${cx} ${n(top - 4)} Q${n(cx + fw + 1)} ${n(top - 5)} ${n(cx + fw + 1)} ${cy - 2} Q${n(cx + fw - 5)} ${n(top + 10)} ${cx + 1} ${n(top + 6)} Q${n(cx - fw + 5)} ${n(top + 10)} ${n(cx - fw - 1)} ${cy - 2}Z" fill="${hc}"/>`;
      o += `<path d="M${cx + 1} ${n(top + 6)} L${cx} ${n(top - 3)} M${n(cx - fw + 2)} ${cy - 9} q-3 7 -1 14 M${n(cx + fw - 1)} ${cy - 10} q4 8 2 17" stroke="${gray ? '#6f6b63' : '#14110f'}" stroke-width=".7" fill="none" opacity=".8"/>`;
    } else if (p.hair === 'side') {
      o += `<path d="M${n(cx - fw - 0.8)} ${cy - 6} C${n(cx - fw - 1.5)} ${n(top - 10)} ${n(cx + fw + 1.5)} ${n(top - 10)} ${n(cx + fw + 0.8)} ${cy - 6} Q${n(cx + fw - 2)} ${cy - 17} ${cx + 10} ${n(top + 9)} Q${cx + 2} ${n(top + 5)} ${cx - 9} ${n(top + 10)} Q${n(cx - fw + 2)} ${cy - 15} ${n(cx - fw - 0.8)} ${cy - 6}Z" fill="${hc}"/>`;
      o += `<path d="M${cx + 9} ${n(top + 8)} Q${cx + 2} ${n(top + 2)} ${cx - 6} ${n(top + 3)}" stroke="${skin}" stroke-width=".6" fill="none" opacity=".5"/>`;
    } else {
      /* стрижка под машинку */
      o += `<path d="${cap(9.5, young ? 7.5 : 6.5)}" fill="${hc}" opacity=".9"/>`;
    }
  }

  /* лоб, складки */
  if (age >= 38) {
    o += `<path d="M${cx - 9} ${n(top + 13.5)} q9 -1.8 18 0 M${cx - 8} ${n(top + 17.5)} q8 -1.5 16 0${age >= 50 ? ` M${cx - 6} ${n(top + 10)} q6 -1.2 12 0` : ''}" stroke="${sh}" stroke-width=".7" fill="none" opacity="${n(fold)}"/>`;
  }
  o += `<path d="M${cx - 5.4} ${cy + 8} Q${cx - 9} ${cy + 13} ${cx - 7.6} ${cy + 19} M${cx + 5.4} ${cy + 8} Q${cx + 9} ${cy + 13} ${cx + 7.6} ${cy + 19}" stroke="#5d564c" stroke-width=".9" fill="none" opacity="${n(fold)}"/>`;
  if (age >= 45) o += `<path d="M${cx - 1.2} ${ey - 9} v4.4 M${cx + 1.4} ${ey - 8.6} v3.8" stroke="${sh}" stroke-width=".7" opacity=".6"/>`;

  /* глазницы — провалы; взгляд вниз, верхнее веко тяжёлое */
  const sock = (p.gaunt ? 0.42 : old ? 0.36 : 0.27);
  const eye = (x, shade) => {
    const ry = p.squint ? 1.0 : 1.7, drop = x > cx ? 0.5 : -0.1;
    let e = `<ellipse cx="${n(x)}" cy="${n(ey + 0.6)}" rx="6.4" ry="4.6" fill="${dk}" opacity="${n(sock + shade)}" filter="url(#psoft)"/>`;
    e += `<ellipse cx="${n(x + 0.2)}" cy="${n(ey + 0.5)}" rx="${p.squint ? 2.6 : 3.1}" ry="${p.squint ? 1.0 : 1.9}" fill="${dk}" opacity=".92"/>`;
    e += `<path d="M${n(x - 4.3)} ${n(ey + 0.3)} Q${n(x)} ${n(ey - ry - 1.2)} ${n(x + 4.4)} ${n(ey + 0.5 + drop)}" stroke="${dk}" stroke-width="1.25" fill="none" stroke-linecap="round"/>`;
    e += `<path d="M${n(x - 3.2)} ${n(ey - 0.3)} Q${n(x)} ${n(ey - ry + 0.3)} ${n(x + 3.4)} ${n(ey + 0.1 + drop)}" stroke="${dk}" stroke-width=".8" fill="none" opacity=".55"/>`;
    e += `<path d="M${n(x - 3.8)} ${n(ey + 2.9)} Q${n(x)} ${n(ey + 5)} ${n(x + 4)} ${n(ey + 2.7)}" stroke="#5d564c" stroke-width=".8" fill="none" opacity=".8"/>`;
    if (age >= 40 || p.gaunt) e += `<path d="M${n(x - 3)} ${n(ey + 4.6)} Q${n(x + 0.4)} ${n(ey + 6.6)} ${n(x + 3.6)} ${n(ey + 4.3)}" stroke="#5d564c" stroke-width=".6" fill="none" opacity=".55"/>`;
    return e;
  };
  o += eye(cx - ex, 0) + eye(cx + ex, 0.1);
  if (p.bruise) o += `<ellipse cx="${n(cx - ex - 0.5)}" cy="${n(ey + 3.6)}" rx="6" ry="4.2" fill="#2a2022" opacity=".5" filter="url(#psoft)"/>`;
  if (age >= 45) o += `<path d="M${n(cx - ex - 5.4)} ${ey - 0.6} l-2.4 -1.2 M${n(cx - ex - 5.4)} ${ey + 1.2} l-2.4 .8 M${n(cx + ex + 5.4)} ${ey - 0.6} l2.4 -1.2 M${n(cx + ex + 5.4)} ${ey + 1.2} l2.4 .8" stroke="${sh}" stroke-width=".6" opacity=".7"/>`;

  /* брови: внутренние концы подняты */
  const bw = f ? 1.2 : old ? 1.9 : 1.6, bc = gray ? '#6b675f' : dk, lift = j(0.8, 2);
  o += `<path d="M${n(cx - ex - 5)} ${n(ey - 5)} Q${n(cx - ex)} ${n(ey - 6.6)} ${n(cx - ex + 4.6)} ${n(ey - 5.6 - lift)}" stroke="${bc}" stroke-width="${bw}" fill="none" stroke-linecap="round"/>`;
  o += `<path d="M${n(cx + ex + 5)} ${n(ey - 5)} Q${n(cx + ex)} ${n(ey - 6.6)} ${n(cx + ex - 4.6)} ${n(ey - 5.6 - lift)}" stroke="${bc}" stroke-width="${bw}" fill="none" stroke-linecap="round"/>`;
  if (p.scar) o += `<path d="M${n(cx - ex - 3.5)} ${n(ey - 12.5)} L${n(cx - ex + 2.2)} ${n(ey - 6.4)}" stroke="#d9d2c2" stroke-width="1.3" stroke-linecap="round"/><path d="M${n(cx - ex - 2.6)} ${n(ey - 10.4)} l2 -1.2 M${n(cx - ex - 0.8)} ${n(ey - 8.6)} l2 -1.2" stroke="#5d564c" stroke-width=".6"/>`;

  /* нос */
  o += `<path d="M${cx + 0.4} ${ey + 1} L${cx + 3.6} ${cy + 9.6} L${cx} ${cy + 11.4}Z" fill="${dk}" opacity=".2"/>`;
  o += `<path d="M${n(cx - 1 - j(0, 0.8))} ${ey + 2} L${n(cx - 2.8 - j(0, 0.8))} ${cy + 9.4} Q${cx} ${cy + 12.3} ${cx + 3.1} ${cy + 9.5}" fill="none" stroke="#5d564c" stroke-width="1.2" stroke-linecap="round"/>`;
  o += `<path d="M${cx - 1.9} ${cy + 10.4} h.9 M${cx + 1.3} ${cy + 10.5} h.9" stroke="${dk}" stroke-width="1" stroke-linecap="round" opacity=".7"/>`;

  /* борода, усы, рот — уголки вниз */
  const mouth = `<path d="M${cx - 5.6} ${n(my + 1.3 + j(0, 0.5))} Q${cx} ${n(my - 0.7)} ${cx + 5.6} ${n(my + 1.5)}" stroke="#2f2925" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M${cx - 3} ${n(my + 3.2)} Q${cx} ${n(my + 4.1)} ${cx + 3} ${n(my + 3.2)}" stroke="#5d564c" stroke-width=".7" fill="none" opacity=".8"/>`;
  if (p.beard) {
    const d = p.beard > 1 ? 13 : 3.5;
    o += `<path d="M${n(cx - fw + 0.6)} ${cy + 5} Q${n(cx - fw - 1.5)} ${n(chin + d - 2)} ${cx} ${n(chin + d)} Q${n(cx + fw + 1.5)} ${n(chin + d - 2)} ${n(cx + fw - 0.6)} ${cy + 5} Q${cx + 9} ${cy + 13} ${cx} ${cy + 12.4} Q${cx - 9} ${cy + 13} ${n(cx - fw + 0.6)} ${cy + 5}Z" fill="${hc}"/>`;
    let st = '';
    for (let i = 0; i < 12; i++) { const x = j(cx - jw, cx + jw), y = j(cy + 16, chin + d - 3); st += `M${n(x)} ${n(y)} l${n(j(-1.2, 1.2))} ${n(j(2.5, 5))} `; }
    o += `<path d="${st}" stroke="${gray ? '#6b675f' : '#0f0d0c'}" stroke-width=".6" fill="none" opacity=".7"/>`;
  }
  o += mouth;
  if (p.must) o += `<path d="M${cx - 9.6} ${n(my + 0.8)} Q${cx - 5} ${n(my - 5.4)} ${cx} ${n(my - 3.4)} Q${cx + 5} ${n(my - 5.4)} ${cx + 9.6} ${n(my + 0.8)} Q${cx + 4} ${n(my - 1.4)} ${cx} ${n(my - 0.9)} Q${cx - 4} ${n(my - 1.4)} ${cx - 9.6} ${n(my + 0.8)}Z" fill="${hc}"/>`;

  if (p.glasses) {
    o += `<circle cx="${n(cx - ex)}" cy="${n(ey + 0.4)}" r="5.6" fill="rgba(255,255,255,.07)" stroke="${dk}" stroke-width=".9"/><circle cx="${n(cx + ex)}" cy="${n(ey + 0.4)}" r="5.6" fill="rgba(255,255,255,.07)" stroke="${dk}" stroke-width=".9"/>`;
    o += `<path d="M${n(cx - ex + 5.6)} ${ey} Q${cx} ${ey - 1.6} ${n(cx + ex - 5.6)} ${ey} M${n(cx - ex - 5.6)} ${ey} L${n(cx - fw)} ${ey - 1} M${n(cx + ex + 5.6)} ${ey} L${n(cx + fw)} ${ey - 1}" stroke="${dk}" stroke-width=".9" fill="none"/>`;
  }

  /* платок */
  if (p.hat === 'scarf') {
    o += `<path d="M${n(cx - fw - 4)} ${cy + 13} Q${n(cx - fw - 8)} ${n(top - 9)} ${cx} ${n(top - 7)} Q${n(cx + fw + 8)} ${n(top - 9)} ${n(cx + fw + 4)} ${cy + 13} L${n(cx + fw - 5)} ${cy + 21} Q${n(cx + fw - 1)} ${n(top + 10)} ${cx} ${n(top + 8)} Q${n(cx - fw + 1)} ${n(top + 10)} ${n(cx - fw + 5)} ${cy + 21}Z" fill="#57534b"/>`;
    o += `<path d="M${n(cx + 2)} ${n(top - 7)} Q${n(cx + fw + 8)} ${n(top - 9)} ${n(cx + fw + 4)} ${cy + 13} L${n(cx + fw - 5)} ${cy + 21} Q${n(cx + fw - 1)} ${n(top + 10)} ${cx + 2} ${n(top + 8)}Z" fill="${dk}" opacity=".25"/>`;
    o += `<path d="M${cx - 7} ${n(top + 8.6)} Q${cx} ${n(top + 5.4)} ${cx + 7} ${n(top + 8.6)}" stroke="${gray ? '#8d897f' : '#2a2622'}" stroke-width="2.2" fill="none"/>`;
    o += `<path d="M${cx - 7} ${n(chin - 3)} L${cx} ${n(chin + 3)} L${cx + 7} ${n(chin - 3)} L${cx + 4} ${n(chin + 10)} L${cx - 4} ${n(chin + 10)}Z" fill="#4b4740"/>`;
  }

  /* дощечка с номером дела */
  if (no) {
    o += `<path d="M36 103 L40 96 M64 103 L60 96" stroke="#6d675b" stroke-width=".6"/>`;
    o += `<rect x="31" y="102.5" width="38" height="13" fill="#181614" stroke="#3a3630" stroke-width=".8"/>`;
    o += `<text x="50" y="112" text-anchor="middle" font-family="'Marck Script','Segoe Script',cursive" font-size="8.5" fill="#d6d0c0" opacity=".9">№ ${String(no).replace(/[<&>]/g, '')}</text>`;
  }

  /* снимок: всё нарисованное размыто и «недопроявлено», поверх — пересвет, пятна эмульсии, зерно, виньетка, царапины */
  o = `<g filter="url(#pphoto)">${o}</g>`;
  o += '<ellipse cx="28" cy="30" rx="30" ry="38" fill="#fff" opacity=".1" filter="url(#psoft)"/>';
  o += '<rect width="100" height="120" filter="url(#pblot)" opacity=".5"/>';
  o += '<rect width="100" height="120" fill="url(#pvig)"/>';
  o += '<rect width="100" height="120" filter="url(#pgrain)" opacity=".6"/>';
  o += `<path d="M${n(j(12, 88))} 0 l${n(j(-3, 3))} 120 M0 ${n(j(20, 100))} l100 ${n(j(-4, 4))}" stroke="#e6e0d0" stroke-width=".25" opacity=".35"/>`;
  return `<svg class="portrait" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">${o}</svg>`;
}
