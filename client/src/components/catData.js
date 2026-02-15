// 9 kawaii avatars for Jam With Boo
// Illustrations: react-kawaii (MIT) — https://github.com/elizabetdev/react-kawaii

import { Cat, Ghost, Planet, IceCream, Mug, Backpack, SpeechBubble, Chocolate, Browser } from 'react-kawaii';

export const CATS = [
  { id: 0, name: 'Boo',     component: Cat,          color: '#ffb3c6', mood: 'lovestruck' },
  { id: 1, name: 'Casper',  component: Ghost,        color: '#c8b6ff', mood: 'blissful' },
  { id: 2, name: 'Saturn',  component: Planet,       color: '#7ecdc6', mood: 'happy' },
  { id: 3, name: 'Sundae',  component: IceCream,     color: '#ff8fab', mood: 'excited' },
  { id: 4, name: 'Mocha',   component: Mug,          color: '#e8b84a', mood: 'blissful' },
  { id: 5, name: 'Scout',   component: Backpack,     color: '#70b77e', mood: 'happy' },
  { id: 6, name: 'Chatter', component: SpeechBubble, color: '#ff7f6e', mood: 'excited' },
  { id: 7, name: 'Truffle', component: Chocolate,    color: '#c08a5e', mood: 'lovestruck' },
  { id: 8, name: 'Tab',     component: Browser,      color: '#72bcd4', mood: 'happy' },
];

/**
 * Cat paw print icon (used for PawButton).
 * Shape from Twemoji 🐾 (CC-BY 4.0, Twitter/X) — single paw extracted.
 * Styled after Apple iOS paw: all pink fill, dark outline.
 */
export function getPawSvg(size = 28) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0.5 -0.5 21 20" width="${size}" height="${size}">
  <!-- Main pad -->
  <path d="M16.706 16.113c0 4.483-2.554 2.038-5.706 2.038-3.151 0-5.706 2.446-5.706-2.038C5.294 13.187 7.849 10 11 10c3.151 0 5.706 3.187 5.706 6.113z" fill="#ffb3c6" stroke="#333" stroke-width="0.7"/>
  <!-- Toe beans -->
  <path d="M5.074 8.037c.393 1.335.007 2.625-.862 2.881-.87.256-1.893-.619-2.286-1.955-.393-1.335-.008-2.625.862-2.881.87-.256 1.893.619 2.286 1.955z" fill="#ffb3c6" stroke="#333" stroke-width="0.5"/>
  <path d="M20.074 8.981c-.407 1.332-1.442 2.196-2.312 1.93-.87-.266-1.244-1.561-.837-2.893.407-1.332 1.442-2.196 2.312-1.93.869.266 1.244 1.561.837 2.893z" fill="#ffb3c6" stroke="#333" stroke-width="0.5"/>
  <path d="M9.964 4.122c.366 1.898-.217 3.606-1.302 3.815-1.084.208-2.26-1.161-2.625-3.059-.367-1.898.216-3.606 1.301-3.815C8.423.854 9.599 2.224 9.964 4.122z" fill="#ffb3c6" stroke="#333" stroke-width="0.5"/>
  <path d="M15.96 4.9c-.387 1.894-1.578 3.25-2.66 3.029-1.082-.221-1.646-1.936-1.259-3.83.387-1.894 1.578-3.25 2.66-3.029 1.082.222 1.645 1.936 1.259 3.83z" fill="#ffb3c6" stroke="#333" stroke-width="0.5"/>
</svg>`;
}
