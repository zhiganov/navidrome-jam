// 9 cat definitions for Jam With Boo
// Each cat is a simple geometric SVG: circle head, triangle ears, dot eyes, oval body, curved tail
export const CATS = [
  { id: 0, name: 'Marmalade', bodyColor: '#ff8c42', earColor: '#e67332', eyeColor: '#2d2d2d', noseColor: '#ff6b9d' },
  { id: 1, name: 'Shadow', bodyColor: '#3d3d3d', earColor: '#2a2a2a', eyeColor: '#ffcc00', noseColor: '#ff6b9d' },
  { id: 2, name: 'Snowball', bodyColor: '#f0e6d3', earColor: '#e8d5bc', eyeColor: '#5599ff', noseColor: '#ffb3c6' },
  { id: 3, name: 'Smokey', bodyColor: '#8899aa', earColor: '#778899', eyeColor: '#55cc55', noseColor: '#ffb3c6' },
  { id: 4, name: 'Mochi', bodyColor: '#deb887', earColor: '#c9a373', eyeColor: '#2d2d2d', noseColor: '#ff6b9d' },
  { id: 5, name: 'Patches', bodyColor: '#f0e6d3', earColor: '#ff8c42', eyeColor: '#55aa55', noseColor: '#ff6b9d', patches: true },
  { id: 6, name: 'Tux', bodyColor: '#2d2d2d', earColor: '#222', eyeColor: '#ffcc00', noseColor: '#ff6b9d', tuxedo: true },
  { id: 7, name: 'Caramel', bodyColor: '#d2691e', earColor: '#b8561a', eyeColor: '#2d2d2d', noseColor: '#ffb3c6' },
  { id: 8, name: 'Boo', bodyColor: '#ffb3c6', earColor: '#ff8fab', eyeColor: '#ff1493', noseColor: '#ff69b4' },
];

// Generate SVG string for a cat
export function getCatSvg(cat, size = 64) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const headR = s * 0.28;

  let patches = '';
  if (cat.patches) {
    patches = `<circle cx="${cx - headR * 0.3}" cy="${cy - headR * 0.1}" r="${headR * 0.25}" fill="#ff8c42" opacity="0.8"/>
      <circle cx="${cx + headR * 0.4}" cy="${cy + headR * 0.2}" r="${headR * 0.2}" fill="#ff8c42" opacity="0.7"/>`;
  }

  let tuxBib = '';
  if (cat.tuxedo) {
    tuxBib = `<ellipse cx="${cx}" cy="${cy + headR * 0.4}" rx="${headR * 0.4}" ry="${headR * 0.35}" fill="#f0e6d3"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    <!-- Ears -->
    <polygon points="${cx - headR * 0.7},${cy - headR * 0.5} ${cx - headR * 0.15},${cy - headR * 0.95} ${cx - headR * 0.05},${cy - headR * 0.4}" fill="${cat.earColor}"/>
    <polygon points="${cx + headR * 0.7},${cy - headR * 0.5} ${cx + headR * 0.15},${cy - headR * 0.95} ${cx + headR * 0.05},${cy - headR * 0.4}" fill="${cat.earColor}"/>
    <!-- Inner ears -->
    <polygon points="${cx - headR * 0.55},${cy - headR * 0.5} ${cx - headR * 0.2},${cy - headR * 0.8} ${cx - headR * 0.12},${cy - headR * 0.42}" fill="${cat.noseColor}" opacity="0.5"/>
    <polygon points="${cx + headR * 0.55},${cy - headR * 0.5} ${cx + headR * 0.2},${cy - headR * 0.8} ${cx + headR * 0.12},${cy - headR * 0.42}" fill="${cat.noseColor}" opacity="0.5"/>
    <!-- Head -->
    <circle cx="${cx}" cy="${cy}" r="${headR}" fill="${cat.bodyColor}"/>
    ${patches}
    ${tuxBib}
    <!-- Eyes -->
    <ellipse cx="${cx - headR * 0.35}" cy="${cy - headR * 0.1}" rx="${headR * 0.13}" ry="${headR * 0.16}" fill="${cat.eyeColor}"/>
    <ellipse cx="${cx + headR * 0.35}" cy="${cy - headR * 0.1}" rx="${headR * 0.13}" ry="${headR * 0.16}" fill="${cat.eyeColor}"/>
    <!-- Eye highlights -->
    <circle cx="${cx - headR * 0.3}" cy="${cy - headR * 0.18}" r="${headR * 0.05}" fill="white" opacity="0.8"/>
    <circle cx="${cx + headR * 0.4}" cy="${cy - headR * 0.18}" r="${headR * 0.05}" fill="white" opacity="0.8"/>
    <!-- Nose -->
    <ellipse cx="${cx}" cy="${cy + headR * 0.15}" rx="${headR * 0.08}" ry="${headR * 0.06}" fill="${cat.noseColor}"/>
    <!-- Mouth -->
    <path d="M${cx - headR * 0.12} ${cy + headR * 0.28} Q${cx} ${cy + headR * 0.4} ${cx + headR * 0.12} ${cy + headR * 0.28}" stroke="${cat.earColor}" stroke-width="1.2" fill="none"/>
    <!-- Whiskers -->
    <line x1="${cx - headR * 0.9}" y1="${cy + headR * 0.05}" x2="${cx - headR * 0.25}" y2="${cy + headR * 0.15}" stroke="${cat.earColor}" stroke-width="0.8" opacity="0.6"/>
    <line x1="${cx - headR * 0.85}" y1="${cy + headR * 0.25}" x2="${cx - headR * 0.25}" y2="${cy + headR * 0.22}" stroke="${cat.earColor}" stroke-width="0.8" opacity="0.6"/>
    <line x1="${cx + headR * 0.9}" y1="${cy + headR * 0.05}" x2="${cx + headR * 0.25}" y2="${cy + headR * 0.15}" stroke="${cat.earColor}" stroke-width="0.8" opacity="0.6"/>
    <line x1="${cx + headR * 0.85}" y1="${cy + headR * 0.25}" x2="${cx + headR * 0.25}" y2="${cy + headR * 0.22}" stroke="${cat.earColor}" stroke-width="0.8" opacity="0.6"/>
  </svg>`;
}
