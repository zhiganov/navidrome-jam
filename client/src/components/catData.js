// 9 kawaii cat definitions for Jam With Boo
// Hand-crafted SVG with fixed viewBox — just swap colors per cat

export const CATS = [
  { id: 0, name: 'Marmalade', fur: '#ff8c42', furDark: '#d96d1f', earInner: '#ffb88a', nose: '#e86b6b', blush: '#ff9dba', eyeColor: '#333', stripes: true },
  { id: 1, name: 'Shadow',    fur: '#444',    furDark: '#2a2a2a', earInner: '#666',    nose: '#999',    blush: '#ff6b8a', eyeColor: '#e8b800', sleepy: true },
  { id: 2, name: 'Snowball',  fur: '#f5efe6', furDark: '#ddd4c6', earInner: '#ffc8d6', nose: '#ffaabb', blush: '#ffccdd', eyeColor: '#4488cc' },
  { id: 3, name: 'Smokey',    fur: '#8899aa', furDark: '#6b7a8a', earInner: '#aabbcc', nose: '#cc99aa', blush: '#e8aacc', eyeColor: '#44aa44' },
  { id: 4, name: 'Mochi',     fur: '#e8c99a', furDark: '#c9a66d', earInner: '#f5d6b8', nose: '#dd8899', blush: '#ffbbcc', eyeColor: '#553311', round: true },
  { id: 5, name: 'Patches',   fur: '#f5efe6', furDark: '#ddd4c6', earInner: '#ff9955', nose: '#dd7788', blush: '#ffccaa', eyeColor: '#558833', patches: true },
  { id: 6, name: 'Tux',       fur: '#333',    furDark: '#1a1a1a', earInner: '#555',    nose: '#888',    blush: '#ff668888', eyeColor: '#ddaa00', tuxedo: true },
  { id: 7, name: 'Caramel',   fur: '#c06820', furDark: '#994d10', earInner: '#e8a060', nose: '#cc7788', blush: '#ffaa99', eyeColor: '#333', stripes: true },
  { id: 8, name: 'Boo',       fur: '#ffb3c6', furDark: '#ff8aaa', earInner: '#ff88aa', nose: '#ff5599', blush: '#ff88bb', eyeColor: '#dd2277', heart: true },
];

/**
 * Generate a kawaii cat face SVG. Uses a fixed viewBox of 100x100 so
 * proportions are always correct. The `size` param just sets rendered px.
 * Design: round head, pointy ears, big dot eyes with sparkle, tiny nose,
 * cat "ω" mouth, thin whiskers, rosy cheek blush.
 */
export function getCatSvg(cat, size = 64) {
  // All coordinates are in the 0-100 viewBox
  const dark = cat.furDark;
  const eyeFill = cat.eyeColor || '#333';

  let extras = '';

  // Calico patches
  if (cat.patches) {
    extras += `<circle cx="35" cy="45" r="10" fill="#ff8c42" opacity="0.7"/>`;
    extras += `<circle cx="62" cy="58" r="8" fill="#555" opacity="0.6"/>`;
  }

  // Tuxedo white bib
  if (cat.tuxedo) {
    extras += `<ellipse cx="50" cy="72" rx="16" ry="14" fill="#eee"/>`;
    extras += `<ellipse cx="50" cy="78" rx="11" ry="9" fill="#f5f5f5"/>`;
  }

  // Tabby stripes on forehead
  if (cat.stripes) {
    extras += `<path d="M50 30 L50 40" stroke="${dark}" stroke-width="2" stroke-linecap="round" opacity="0.4"/>`;
    extras += `<path d="M43 32 L45 41" stroke="${dark}" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>`;
    extras += `<path d="M57 32 L55 41" stroke="${dark}" stroke-width="1.5" stroke-linecap="round" opacity="0.3"/>`;
  }

  // Boo's heart marking
  if (cat.heart) {
    extras += `<path d="M50 34 C47 30, 43 32, 46 37 L50 41 L54 37 C57 32, 53 30, 50 34Z" fill="${dark}" opacity="0.4"/>`;
  }

  // Eyes — sleepy cats get horizontal slits, others get big round eyes
  let eyes;
  if (cat.sleepy) {
    eyes = `
      <ellipse cx="38" cy="52" rx="5" ry="2.5" fill="${eyeFill}"/>
      <ellipse cx="62" cy="52" rx="5" ry="2.5" fill="${eyeFill}"/>
      <circle cx="36" cy="51" r="1.2" fill="white" opacity="0.8"/>
      <circle cx="60" cy="51" r="1.2" fill="white" opacity="0.8"/>
    `;
  } else {
    eyes = `
      <circle cx="38" cy="50" r="5.5" fill="white"/>
      <circle cx="62" cy="50" r="5.5" fill="white"/>
      <circle cx="38" cy="51" r="4" fill="${eyeFill}"/>
      <circle cx="62" cy="51" r="4" fill="${eyeFill}"/>
      <circle cx="36" cy="49" r="2" fill="white" opacity="0.9"/>
      <circle cx="60" cy="49" r="2" fill="white" opacity="0.9"/>
      <circle cx="39" cy="52.5" r="0.8" fill="white" opacity="0.6"/>
      <circle cx="63" cy="52.5" r="0.8" fill="white" opacity="0.6"/>
    `;
  }

  // Mochi gets extra-round blush
  const blushR = cat.round ? 7 : 5.5;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <!-- Ears -->
  <path d="M28 38 L17 10 L40 32Z" fill="${cat.fur}" stroke="${dark}" stroke-width="1"/>
  <path d="M72 38 L83 10 L60 32Z" fill="${cat.fur}" stroke="${dark}" stroke-width="1"/>
  <path d="M29 36 L21 16 L38 33Z" fill="${cat.earInner}" opacity="0.6"/>
  <path d="M71 36 L79 16 L62 33Z" fill="${cat.earInner}" opacity="0.6"/>
  <!-- Head -->
  <circle cx="50" cy="55" r="34" fill="${cat.fur}"/>
  ${extras}
  <!-- Eyes -->
  ${eyes}
  <!-- Nose -->
  <path d="M48 59 L52 59 L50 62Z" fill="${cat.nose}"/>
  <!-- Mouth (ω shape — the iconic kawaii cat mouth) -->
  <path d="M43 64 Q46.5 68 50 64.5 Q53.5 68 57 64" fill="none" stroke="${dark}" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>
  <!-- Whiskers -->
  <line x1="8" y1="55" x2="29" y2="58" stroke="${dark}" stroke-width="0.8" opacity="0.25"/>
  <line x1="8" y1="62" x2="29" y2="61" stroke="${dark}" stroke-width="0.8" opacity="0.25"/>
  <line x1="92" y1="55" x2="71" y2="58" stroke="${dark}" stroke-width="0.8" opacity="0.25"/>
  <line x1="92" y1="62" x2="71" y2="61" stroke="${dark}" stroke-width="0.8" opacity="0.25"/>
  <!-- Blush -->
  <circle cx="30" cy="61" r="${blushR}" fill="${cat.blush}" opacity="0.35"/>
  <circle cx="70" cy="61" r="${blushR}" fill="${cat.blush}" opacity="0.35"/>
</svg>`;
}

/**
 * Cat paw with toe beans — soft pink by default.
 */
export function getPawSvg(size = 28, color = '#ffb3c6', beanColor = '#ff8aaa') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <ellipse cx="50" cy="64" rx="22" ry="18" fill="${color}"/>
  <ellipse cx="50" cy="64" rx="16" ry="12" fill="${beanColor}" opacity="0.5"/>
  <ellipse cx="29" cy="38" rx="10" ry="13" fill="${color}" transform="rotate(-12 29 38)"/>
  <ellipse cx="29" cy="38" rx="6.5" ry="8.5" fill="${beanColor}" opacity="0.5" transform="rotate(-12 29 38)"/>
  <ellipse cx="43" cy="28" rx="10" ry="12" fill="${color}" transform="rotate(-4 43 28)"/>
  <ellipse cx="43" cy="28" rx="6.5" ry="8" fill="${beanColor}" opacity="0.5" transform="rotate(-4 43 28)"/>
  <ellipse cx="57" cy="28" rx="10" ry="12" fill="${color}" transform="rotate(4 57 28)"/>
  <ellipse cx="57" cy="28" rx="6.5" ry="8" fill="${beanColor}" opacity="0.5" transform="rotate(4 57 28)"/>
  <ellipse cx="71" cy="38" rx="10" ry="13" fill="${color}" transform="rotate(12 71 38)"/>
  <ellipse cx="71" cy="38" rx="6.5" ry="8.5" fill="${beanColor}" opacity="0.5" transform="rotate(12 71 38)"/>
</svg>`;
}
