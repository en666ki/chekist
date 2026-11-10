'use strict';
/* Процедурные «тюремные» фотокарточки: сепия, линейка роста за спиной. */
function portraitSVG(p) {
  let s = (p.seed || 7) * 7919 + 13;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const j = (a, b) => a + (b - a) * r();
  const f = p.s === 'f', old = p.age >= 55, young = p.age < 25;
  const cx = 50, cy = 50, fw = j(20, 22.5) * (p.w || 1), fh = j(26, 28.5), top = cy - fh;
  const skin = old ? '#c2ae8f' : '#d3c0a0', sh = '#977f5f', dk = '#2a2018';
  const hc = (old || p.gray) ? '#a8a091' : (r() > 0.5 ? '#2a2018' : '#4d3b28');
  const ey = cy - 3, ex = fw * 0.46;
  let o = '<rect width="100" height="120" fill="#a09073"/>';
  for (let y = 10; y < 120; y += 16) o += `<line x1="0" x2="100" y1="${y}" y2="${y}" stroke="#8b7b5f" stroke-width=".6"/>`;
  // плечи, ворот, шея
  o += `<path d="M5 120 Q7 95 34 88 L66 88 Q93 95 95 120Z" fill="${f ? '#56483b' : (p.coat || '#33291f')}"/>`;
  o += f ? '<path d="M38 88 Q50 101 62 88 L60 84 L40 84Z" fill="#cdc1a8"/>'
         : '<path d="M41 86 L50 99 L59 86 L57 82 L43 82Z" fill="#d4c9b1"/>';
  o += `<path d="M42 ${cy + fh - 10} L42 88 Q50 95 58 88 L58 ${cy + fh - 10}Z" fill="${sh}"/>`;
  if (f && p.hat !== 'scarf') o += `<ellipse cx="50" cy="${cy - 3}" rx="${fw + 4}" ry="${fh + 3}" fill="${hc}"/>`;
  // уши, голова
  o += `<ellipse cx="${cx - fw}" cy="${cy + 2}" rx="3" ry="5.5" fill="${sh}"/><ellipse cx="${cx + fw}" cy="${cy + 2}" rx="3" ry="5.5" fill="${sh}"/>`;
  o += `<ellipse cx="50" cy="${cy}" rx="${fw}" ry="${fh}" fill="${skin}"/>`;
  o += `<path d="M${cx - fw + 1} ${cy + 6} Q50 ${cy + fh + 8} ${cx + fw - 1} ${cy + 6} Q50 ${cy + fh - 3} ${cx - fw + 1} ${cy + 6}Z" fill="${sh}" opacity=".3"/>`;
  // волосы
  if (p.hat !== 'scarf') {
    if (p.hair === 'bald') {
      o += `<ellipse cx="${cx - fw + 1}" cy="${cy - 9}" rx="3.5" ry="7" fill="${hc}"/><ellipse cx="${cx + fw - 1}" cy="${cy - 9}" rx="3.5" ry="7" fill="${hc}"/>`;
    } else if (f) {
      o += `<path d="M${cx - fw - 1} ${cy - 2} Q${cx - fw} ${top - 5} 50 ${top - 4} Q${cx + fw} ${top - 5} ${cx + fw + 1} ${cy - 2} Q${cx + fw - 6} ${top + 9} 50 ${top + 5} Q${cx - fw + 6} ${top + 9} ${cx - fw - 1} ${cy - 2}Z" fill="${hc}"/>`;
    } else {
      const part = p.hair === 'side' ? 9 : 0;
      o += `<path d="M${cx - fw - 1} ${cy - 7} Q${cx - fw - 1} ${top - 6} 50 ${top - 5} Q${cx + fw + 1} ${top - 6} ${cx + fw + 1} ${cy - 7} Q${cx + fw - 3} ${top + 9} ${50 + part} ${top + 6 + (part ? 3 : 1)} Q${cx - fw + 3} ${top + 9 - part / 2} ${cx - fw - 1} ${cy - 7}Z" fill="${hc}"/>`;
    }
  }
  // брови, глаза
  const bw = old ? 1.8 : 1.5, tilt = j(-1, 1.2);
  o += `<path d="M${cx - ex - 4.5} ${ey - 5 + tilt} L${cx - ex + 4} ${ey - 5.6}" stroke="${hc === '#a8a091' ? '#857c6c' : dk}" stroke-width="${bw}" stroke-linecap="round"/>`;
  o += `<path d="M${cx + ex + 4.5} ${ey - 5 + tilt} L${cx + ex - 4} ${ey - 5.6}" stroke="${hc === '#a8a091' ? '#857c6c' : dk}" stroke-width="${bw}" stroke-linecap="round"/>`;
  o += `<ellipse cx="${cx - ex}" cy="${ey}" rx="2.6" ry="1.6" fill="${dk}"/><ellipse cx="${cx + ex}" cy="${ey}" rx="2.6" ry="1.6" fill="${dk}"/>`;
  o += `<path d="M${cx - ex - 4} ${ey + 3.4} q4 1.6 8 0 M${cx + ex - 4} ${ey + 3.4} q4 1.6 8 0" stroke="${sh}" stroke-width=".8" fill="none"/>`;
  // нос, рот
  o += `<path d="M${50 - j(0, 1)} ${ey + 2} L${47.5 - j(0, 1.2)} ${cy + 9} Q50 ${cy + 11.5} 52.6 ${cy + 9}" fill="none" stroke="${sh}" stroke-width="1.3" stroke-linecap="round"/>`;
  const mouth = `<path d="M45 ${cy + 16.5} Q50 ${cy + 16.5 + j(-1.2, 1)} 55 ${cy + 16.5}" stroke="#6a523d" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  o += mouth;
  if (old || p.age > 45) {
    o += `<path d="M${cx - 9} ${top + 13} q9 -2 18 0 M${cx - 8} ${top + 17} q8 -1.6 16 0" stroke="${sh}" stroke-width=".7" fill="none"/>`;
    o += `<path d="M${cx - 8} ${cy + 9} q-2.5 5 -1 9 M${cx + 8} ${cy + 9} q2.5 5 1 9" stroke="${sh}" stroke-width=".8" fill="none"/>`;
  }
  // борода, усы
  if (p.beard) {
    const d = p.beard > 1 ? 15 : 5;
    o += `<path d="M${cx - fw + 1} ${cy + 5} Q${cx - fw - 1} ${cy + fh + d - 2} 50 ${cy + fh + d} Q${cx + fw + 1} ${cy + fh + d - 2} ${cx + fw - 1} ${cy + 5} Q${cx + 9} ${cy + 13} 50 ${cy + 12.5} Q${cx - 9} ${cy + 13} ${cx - fw + 1} ${cy + 5}Z" fill="${hc}"/>` + mouth;
  }
  if (p.must) o += `<path d="M41 ${cy + 14.5} Q50 ${cy + 9.5} 59 ${cy + 14.5} Q50 ${cy + 15.5} 41 ${cy + 14.5}Z" fill="${hc}"/>`;
  if (p.glasses) {
    o += `<circle cx="${cx - ex}" cy="${ey}" r="5.4" fill="rgba(255,255,255,.12)" stroke="${dk}" stroke-width="1"/><circle cx="${cx + ex}" cy="${ey}" r="5.4" fill="rgba(255,255,255,.12)" stroke="${dk}" stroke-width="1"/>`;
    o += `<path d="M${cx - ex + 5.4} ${ey} L${cx + ex - 5.4} ${ey} M${cx - ex - 5.4} ${ey} L${cx - fw} ${ey - 1} M${cx + ex + 5.4} ${ey} L${cx + fw} ${ey - 1}" stroke="${dk}" stroke-width="1"/>`;
  }
  // головные уборы
  if (p.hat === 'cap') {
    o += `<path d="M${cx - fw - 2} ${top + 10} Q50 ${top - 13} ${cx + fw + 2} ${top + 10}Z" fill="#2e261f"/>`;
    o += `<path d="M${cx - fw - 3} ${top + 9} L${cx + fw + 3} ${top + 9} Q${cx + fw + 8} ${top + 13} ${cx + fw + 2} ${top + 14} Q50 ${top + 11} ${cx - fw - 3} ${top + 12}Z" fill="#1c1611"/>`;
  }
  if (p.hat === 'scarf') {
    o += `<path d="M${cx - fw - 4} ${cy + 12} Q${cx - fw - 7} ${top - 9} 50 ${top - 7} Q${cx + fw + 7} ${top - 9} ${cx + fw + 4} ${cy + 12} L${cx + fw - 4} ${cy + 20} Q${cx + fw - 1} ${top + 9} 50 ${top + 8} Q${cx - fw + 1} ${top + 9} ${cx - fw + 4} ${cy + 20}Z" fill="#6f6252"/>`;
    o += `<path d="M${cx - 7} ${top + 8.5} Q50 ${top + 5} ${cx + 7} ${top + 8.5}" stroke="#4d3b28" stroke-width="2.4" fill="none"/>`;
    o += `<path d="M43 ${cy + fh - 2} L50 ${cy + fh + 4} L57 ${cy + fh - 2} L54 ${cy + fh + 10} L46 ${cy + fh + 10}Z" fill="#5f5345"/>`;
  }
  if (young && !f) o += `<path d="M${cx - 6} ${top + 5} q6 -5 13 0" stroke="${hc}" stroke-width="2.4" fill="none"/>`;
  o += '<rect width="100" height="120" fill="none" stroke="#5c4d38" stroke-width="2"/>';
  return `<svg class="portrait" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">${o}</svg>`;
}
