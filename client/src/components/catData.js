// 9 kawaii cat definitions for Jam With Boo
// Each cat has a unique face SVG with chibi proportions: huge head, big sparkly eyes, tiny features

export const CATS = [
  {
    id: 0, name: 'Marmalade',
    fur: '#ff8c42', furDark: '#e06b20', furLight: '#ffad6b',
    earInner: '#ffb88a', eyeColor: '#2d5016', nose: '#ff6b8a',
    cheek: '#ff9dba', pupil: '#1a3008', highlight: '#ffe8a0',
    stripes: true, // tabby stripes
  },
  {
    id: 1, name: 'Shadow',
    fur: '#3a3a42', furDark: '#252528', furLight: '#555560',
    earInner: '#6b6b78', eyeColor: '#e8b800', nose: '#888',
    cheek: '#ff6b8a44', pupil: '#6b5500', highlight: '#fff8c0',
    mysterious: true, // half-closed eyes
  },
  {
    id: 2, name: 'Snowball',
    fur: '#f5efe6', furDark: '#e0d6c8', furLight: '#fffcf5',
    earInner: '#ffd6e0', eyeColor: '#4488cc', nose: '#ffaabb',
    cheek: '#ffccdd', pupil: '#224466', highlight: '#e0f0ff',
  },
  {
    id: 3, name: 'Smokey',
    fur: '#8899aa', furDark: '#6b7a8a', furLight: '#a0b0c0',
    earInner: '#b8c8d8', eyeColor: '#44aa44', nose: '#ccaabb',
    cheek: '#ffaacc44', pupil: '#226622', highlight: '#c0ffc0',
  },
  {
    id: 4, name: 'Mochi',
    fur: '#e8c99a', furDark: '#c9a66d', furLight: '#f5ddb5',
    earInner: '#f5d6b8', eyeColor: '#664422', nose: '#dd8899',
    cheek: '#ffbbcc', pupil: '#332211', highlight: '#ffe8cc',
    round: true, // extra chubby cheeks
  },
  {
    id: 5, name: 'Patches',
    fur: '#f5efe6', furDark: '#e0d6c8', furLight: '#fffcf5',
    earInner: '#ff9955', eyeColor: '#558833', nose: '#dd7788',
    cheek: '#ffccaa', pupil: '#2a4418', highlight: '#ddffc0',
    patches: [ // calico spots
      { cx: -0.25, cy: -0.15, r: 0.22, color: '#ff8c42' },
      { cx: 0.3, cy: 0.05, r: 0.18, color: '#3a3a42' },
      { cx: -0.1, cy: 0.25, r: 0.15, color: '#ff8c42' },
    ],
  },
  {
    id: 6, name: 'Tux',
    fur: '#2d2d35', furDark: '#1a1a20', furLight: '#444450',
    earInner: '#555566', eyeColor: '#ddaa00', nose: '#888',
    cheek: '#ff668844', pupil: '#6b5500', highlight: '#fff5b0',
    tuxedo: true, // white chest/chin
  },
  {
    id: 7, name: 'Caramel',
    fur: '#c06820', furDark: '#994d10', furLight: '#dd8840',
    earInner: '#e8a060', eyeColor: '#556633', nose: '#cc7788',
    cheek: '#ffaa99', pupil: '#2a3318', highlight: '#e0eeb0',
    stripes: true,
  },
  {
    id: 8, name: 'Boo',
    fur: '#ffb3c6', furDark: '#ff8aaa', furLight: '#ffd6e2',
    earInner: '#ff88aa', eyeColor: '#dd2277', nose: '#ff5599',
    cheek: '#ff88bb', pupil: '#881144', highlight: '#ffccee',
    hearts: true, // heart-shaped markings
    special: true,
  },
];

/**
 * Generate a kawaii chibi cat face SVG.
 * Big round head, huge eyes with sparkle highlights, tiny triangle ears,
 * small nose, whiskers, blush circles, and personality-specific markings.
 */
export function getCatSvg(cat, size = 64) {
  const s = size;
  const cx = s / 2;
  const cy = s * 0.52; // slightly below center for ear room
  const r = s * 0.36;  // head radius — BIG

  // Ear geometry
  const earW = r * 0.55;
  const earH = r * 0.65;
  const earLx = cx - r * 0.6;
  const earRx = cx + r * 0.6;
  const earTip = cy - r - earH * 0.5;

  // Eyes — big and round
  const eyeR = r * 0.18;
  const eyeSpacing = r * 0.42;
  const eyeY = cy - r * 0.08;
  const pupilR = eyeR * 0.7;

  // Determine if shadow has half-closed eyes
  const halfClosed = cat.mysterious;

  // Nose
  const noseY = cy + r * 0.2;
  const noseR = r * 0.07;

  // Mouth
  const mouthY = noseY + r * 0.12;

  // Cheeks (blush circles)
  const cheekR = r * 0.15;
  const cheekY = cy + r * 0.12;
  const cheekXoff = r * 0.5;
  const extraCheek = cat.round ? 1.3 : 1;

  // Whiskers
  const whiskerY = cy + r * 0.15;
  const whiskerLen = r * 0.45;

  let extras = '';

  // Patches (calico spots)
  if (cat.patches) {
    cat.patches.forEach(p => {
      extras += `<circle cx="${cx + p.cx * r}" cy="${cy + p.cy * r}" r="${p.r * r}" fill="${p.color}" opacity="0.75"/>`;
    });
  }

  // Tuxedo white bib
  if (cat.tuxedo) {
    extras += `<ellipse cx="${cx}" cy="${cy + r * 0.45}" rx="${r * 0.42}" ry="${r * 0.35}" fill="#f0ece5"/>`;
    extras += `<ellipse cx="${cx}" cy="${cy + r * 0.6}" rx="${r * 0.3}" ry="${r * 0.22}" fill="#f5f2ec"/>`;
  }

  // Tabby stripes on forehead
  if (cat.stripes) {
    const sw = r * 0.04;
    extras += `<line x1="${cx}" y1="${cy - r * 0.55}" x2="${cx}" y2="${cy - r * 0.3}" stroke="${cat.furDark}" stroke-width="${sw}" stroke-linecap="round" opacity="0.5"/>`;
    extras += `<line x1="${cx - r * 0.15}" y1="${cy - r * 0.5}" x2="${cx - r * 0.1}" y2="${cy - r * 0.28}" stroke="${cat.furDark}" stroke-width="${sw}" stroke-linecap="round" opacity="0.4"/>`;
    extras += `<line x1="${cx + r * 0.15}" y1="${cy - r * 0.5}" x2="${cx + r * 0.1}" y2="${cy - r * 0.28}" stroke="${cat.furDark}" stroke-width="${sw}" stroke-linecap="round" opacity="0.4"/>`;
  }

  // Boo heart marking on forehead
  if (cat.hearts) {
    const hx = cx, hy = cy - r * 0.4, hs = r * 0.12;
    extras += `<path d="M${hx} ${hy + hs * 0.8} C${hx - hs} ${hy - hs * 0.3} ${hx - hs * 1.5} ${hy + hs * 0.2} ${hx} ${hy + hs * 1.5} C${hx + hs * 1.5} ${hy + hs * 0.2} ${hx + hs} ${hy - hs * 0.3} ${hx} ${hy + hs * 0.8}Z" fill="${cat.furDark}" opacity="0.5"/>`;
  }

  // Eye rendering
  let eyesSvg = '';
  const lx = cx - eyeSpacing;
  const rx = cx + eyeSpacing;

  if (halfClosed) {
    // Half-closed mysterious eyes — narrower ovals
    eyesSvg = `
      <ellipse cx="${lx}" cy="${eyeY}" rx="${eyeR}" ry="${eyeR * 0.55}" fill="${cat.eyeColor}"/>
      <ellipse cx="${rx}" cy="${eyeY}" rx="${eyeR}" ry="${eyeR * 0.55}" fill="${cat.eyeColor}"/>
      <ellipse cx="${lx}" cy="${eyeY}" rx="${pupilR}" ry="${pupilR * 0.5}" fill="${cat.pupil}"/>
      <ellipse cx="${rx}" cy="${eyeY}" rx="${pupilR}" ry="${pupilR * 0.5}" fill="${cat.pupil}"/>
      <circle cx="${lx + eyeR * 0.25}" cy="${eyeY - eyeR * 0.12}" r="${eyeR * 0.15}" fill="white" opacity="0.9"/>
      <circle cx="${rx + eyeR * 0.25}" cy="${eyeY - eyeR * 0.12}" r="${eyeR * 0.15}" fill="white" opacity="0.9"/>
    `;
  } else {
    // Big round kawaii eyes with sparkle highlights
    eyesSvg = `
      <circle cx="${lx}" cy="${eyeY}" r="${eyeR}" fill="white"/>
      <circle cx="${rx}" cy="${eyeY}" r="${eyeR}" fill="white"/>
      <circle cx="${lx}" cy="${eyeY + eyeR * 0.1}" r="${pupilR}" fill="${cat.eyeColor}"/>
      <circle cx="${rx}" cy="${eyeY + eyeR * 0.1}" r="${pupilR}" fill="${cat.eyeColor}"/>
      <circle cx="${lx}" cy="${eyeY + eyeR * 0.15}" r="${pupilR * 0.65}" fill="${cat.pupil}"/>
      <circle cx="${rx}" cy="${eyeY + eyeR * 0.15}" r="${pupilR * 0.65}" fill="${cat.pupil}"/>
      <!-- Big sparkle highlight -->
      <circle cx="${lx - eyeR * 0.25}" cy="${eyeY - eyeR * 0.2}" r="${eyeR * 0.25}" fill="white" opacity="0.95"/>
      <circle cx="${rx - eyeR * 0.25}" cy="${eyeY - eyeR * 0.2}" r="${eyeR * 0.25}" fill="white" opacity="0.95"/>
      <!-- Small sparkle -->
      <circle cx="${lx + eyeR * 0.2}" cy="${eyeY + eyeR * 0.2}" r="${eyeR * 0.1}" fill="white" opacity="0.7"/>
      <circle cx="${rx + eyeR * 0.2}" cy="${eyeY + eyeR * 0.2}" r="${eyeR * 0.1}" fill="white" opacity="0.7"/>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    <!-- Left ear -->
    <path d="M${earLx} ${cy - r * 0.6} L${earLx - earW * 0.5} ${earTip} L${earLx + earW * 0.5} ${cy - r * 0.75} Z" fill="${cat.fur}" stroke="${cat.furDark}" stroke-width="${s * 0.01}"/>
    <path d="M${earLx} ${cy - r * 0.55} L${earLx - earW * 0.3} ${earTip + earH * 0.25} L${earLx + earW * 0.3} ${cy - r * 0.7} Z" fill="${cat.earInner}" opacity="0.7"/>
    <!-- Right ear -->
    <path d="M${earRx} ${cy - r * 0.6} L${earRx + earW * 0.5} ${earTip} L${earRx - earW * 0.5} ${cy - r * 0.75} Z" fill="${cat.fur}" stroke="${cat.furDark}" stroke-width="${s * 0.01}"/>
    <path d="M${earRx} ${cy - r * 0.55} L${earRx + earW * 0.3} ${earTip + earH * 0.25} L${earRx - earW * 0.3} ${cy - r * 0.7} Z" fill="${cat.earInner}" opacity="0.7"/>
    <!-- Head -->
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${cat.fur}"/>
    <!-- Fur shading -->
    <circle cx="${cx}" cy="${cy}" r="${r * 0.97}" fill="none" stroke="${cat.furLight}" stroke-width="${r * 0.06}" opacity="0.3" stroke-dasharray="${r * 0.4} ${r * 0.8}"/>
    ${extras}
    <!-- Eyes -->
    ${eyesSvg}
    <!-- Nose (tiny inverted triangle) -->
    <path d="M${cx - noseR} ${noseY - noseR * 0.5} L${cx + noseR} ${noseY - noseR * 0.5} L${cx} ${noseY + noseR * 0.6} Z" fill="${cat.nose}"/>
    <!-- Mouth -->
    <path d="M${cx - r * 0.1} ${mouthY} Q${cx - r * 0.04} ${mouthY + r * 0.06} ${cx} ${mouthY}" stroke="${cat.furDark}" stroke-width="${s * 0.012}" fill="none" stroke-linecap="round" opacity="0.5"/>
    <path d="M${cx} ${mouthY} Q${cx + r * 0.04} ${mouthY + r * 0.06} ${cx + r * 0.1} ${mouthY}" stroke="${cat.furDark}" stroke-width="${s * 0.012}" fill="none" stroke-linecap="round" opacity="0.5"/>
    <!-- Whiskers -->
    <line x1="${cx - r * 0.2}" y1="${whiskerY - r * 0.03}" x2="${cx - r * 0.2 - whiskerLen}" y2="${whiskerY - r * 0.1}" stroke="${cat.furDark}" stroke-width="${s * 0.008}" opacity="0.35" stroke-linecap="round"/>
    <line x1="${cx - r * 0.2}" y1="${whiskerY + r * 0.05}" x2="${cx - r * 0.2 - whiskerLen}" y2="${whiskerY + r * 0.1}" stroke="${cat.furDark}" stroke-width="${s * 0.008}" opacity="0.35" stroke-linecap="round"/>
    <line x1="${cx + r * 0.2}" y1="${whiskerY - r * 0.03}" x2="${cx + r * 0.2 + whiskerLen}" y2="${whiskerY - r * 0.1}" stroke="${cat.furDark}" stroke-width="${s * 0.008}" opacity="0.35" stroke-linecap="round"/>
    <line x1="${cx + r * 0.2}" y1="${whiskerY + r * 0.05}" x2="${cx + r * 0.2 + whiskerLen}" y2="${whiskerY + r * 0.1}" stroke="${cat.furDark}" stroke-width="${s * 0.008}" opacity="0.35" stroke-linecap="round"/>
    <!-- Cheek blush -->
    <circle cx="${cx - cheekXoff}" cy="${cheekY}" r="${cheekR * extraCheek}" fill="${cat.cheek}" opacity="0.45"/>
    <circle cx="${cx + cheekXoff}" cy="${cheekY}" r="${cheekR * extraCheek}" fill="${cat.cheek}" opacity="0.45"/>
  </svg>`;
}

/**
 * Generate a paw SVG with visible toe beans.
 * Main pad + 4 toe pads, soft pink colors.
 */
export function getPawSvg(size = 28, color = '#ffb3c6', beanColor = '#ff8aaa') {
  const s = size;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    <!-- Main pad -->
    <ellipse cx="${s * 0.5}" cy="${s * 0.62}" rx="${s * 0.24}" ry="${s * 0.2}" fill="${color}"/>
    <ellipse cx="${s * 0.5}" cy="${s * 0.62}" rx="${s * 0.18}" ry="${s * 0.14}" fill="${beanColor}" opacity="0.6"/>
    <!-- Toe beans -->
    <ellipse cx="${s * 0.28}" cy="${s * 0.36}" rx="${s * 0.1}" ry="${s * 0.12}" fill="${color}" transform="rotate(-15 ${s * 0.28} ${s * 0.36})"/>
    <ellipse cx="${s * 0.28}" cy="${s * 0.36}" rx="${s * 0.065}" ry="${s * 0.08}" fill="${beanColor}" opacity="0.6" transform="rotate(-15 ${s * 0.28} ${s * 0.36})"/>
    <ellipse cx="${s * 0.43}" cy="${s * 0.28}" rx="${s * 0.095}" ry="${s * 0.115}" fill="${color}" transform="rotate(-5 ${s * 0.43} ${s * 0.28})"/>
    <ellipse cx="${s * 0.43}" cy="${s * 0.28}" rx="${s * 0.06}" ry="${s * 0.075}" fill="${beanColor}" opacity="0.6" transform="rotate(-5 ${s * 0.43} ${s * 0.28})"/>
    <ellipse cx="${s * 0.57}" cy="${s * 0.28}" rx="${s * 0.095}" ry="${s * 0.115}" fill="${color}" transform="rotate(5 ${s * 0.57} ${s * 0.28})"/>
    <ellipse cx="${s * 0.57}" cy="${s * 0.28}" rx="${s * 0.06}" ry="${s * 0.075}" fill="${beanColor}" opacity="0.6" transform="rotate(5 ${s * 0.57} ${s * 0.28})"/>
    <ellipse cx="${s * 0.72}" cy="${s * 0.36}" rx="${s * 0.1}" ry="${s * 0.12}" fill="${color}" transform="rotate(15 ${s * 0.72} ${s * 0.36})"/>
    <ellipse cx="${s * 0.72}" cy="${s * 0.36}" rx="${s * 0.065}" ry="${s * 0.08}" fill="${beanColor}" opacity="0.6" transform="rotate(15 ${s * 0.72} ${s * 0.36})"/>
  </svg>`;
}
