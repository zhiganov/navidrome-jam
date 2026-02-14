// 9 kawaii cat definitions for Jam With Boo
// Elliptical ears + minimal face = soft, cute, impossible-to-look-like-horns

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
 * Kawaii cat face SVG. viewBox 0 0 100 100, size controls rendered px.
 *
 * Key design decisions:
 * - Ears are ELLIPSES (not triangles) — soft, rounded, can't look like horns
 * - Ears drawn BEHIND the head circle so it clips them naturally
 * - Face features are ultra-minimal: dot eyes + 1 sparkle, tiny nose, small mouth
 * - No whiskers, no strokes on ears, no multi-layer eye whites
 */
export function getCatSvg(cat, size = 64) {
  const f = cat.fur;
  const d = cat.furDark;
  const ei = cat.earInner;
  const e = cat.eyeColor || '#333';
  const n = cat.nose;
  const b = cat.blush;

  // --- Markings (rendered on top of head, before face features) ---
  let marks = '';

  if (cat.stripes) {
    marks += `<path d="M50 34 L50 40" stroke="${d}" stroke-width="2" stroke-linecap="round" opacity="0.3"/>`;
    marks += `<path d="M44 36 L46 41" stroke="${d}" stroke-width="1.5" stroke-linecap="round" opacity="0.25"/>`;
    marks += `<path d="M56 36 L54 41" stroke="${d}" stroke-width="1.5" stroke-linecap="round" opacity="0.25"/>`;
  }

  if (cat.patches) {
    marks += `<circle cx="36" cy="45" r="9" fill="#ff8c42" opacity="0.45"/>`;
    marks += `<circle cx="64" cy="56" r="7" fill="#555" opacity="0.35"/>`;
  }

  if (cat.tuxedo) {
    marks += `<ellipse cx="50" cy="74" rx="15" ry="13" fill="#eee"/>`;
  }

  if (cat.heart) {
    marks += `<path d="M50 36 C47 32, 43 34, 46 38 L50 42 L54 38 C57 34, 53 32, 50 36Z" fill="${d}" opacity="0.3"/>`;
  }

  // --- Eyes ---
  let eyes;
  if (cat.sleepy) {
    // Happy closed eyes — upward arcs like ^_^
    eyes = `
      <path d="M33 54 Q38 48 43 54" fill="none" stroke="${e}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M57 54 Q62 48 67 54" fill="none" stroke="${e}" stroke-width="2.5" stroke-linecap="round"/>`;
  } else {
    // Simple dot eyes with one sparkle each
    eyes = `
      <circle cx="38" cy="53" r="4.5" fill="${e}"/>
      <circle cx="62" cy="53" r="4.5" fill="${e}"/>
      <circle cx="36" cy="51" r="1.8" fill="white" opacity="0.9"/>
      <circle cx="60" cy="51" r="1.8" fill="white" opacity="0.9"/>`;
  }

  const blushR = cat.round ? 7 : 5.5;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <ellipse cx="30" cy="20" rx="13" ry="17" transform="rotate(-15 30 20)" fill="${f}"/>
  <ellipse cx="70" cy="20" rx="13" ry="17" transform="rotate(15 70 20)" fill="${f}"/>
  <ellipse cx="30" cy="18" rx="8" ry="11" transform="rotate(-15 30 18)" fill="${ei}" opacity="0.5"/>
  <ellipse cx="70" cy="18" rx="8" ry="11" transform="rotate(15 70 18)" fill="${ei}" opacity="0.5"/>
  <circle cx="50" cy="55" r="35" fill="${f}"/>
  ${marks}
  ${eyes}
  <ellipse cx="50" cy="61" rx="2.5" ry="2" fill="${n}"/>
  <path d="M46 65 Q48 68 50 65 Q52 68 54 65" fill="none" stroke="${d}" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/>
  <circle cx="30" cy="62" r="${blushR}" fill="${b}" opacity="0.3"/>
  <circle cx="70" cy="62" r="${blushR}" fill="${b}" opacity="0.3"/>
</svg>`;
}

/**
 * Cat paw with toe beans.
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
