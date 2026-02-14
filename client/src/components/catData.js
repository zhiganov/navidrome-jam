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
 * Kawaii cat paw with puffy toe beans (used for PawButton icon).
 * Multi-color: cream fur, rosy pink pad, peach beans with highlight dots.
 */
export function getPawSvg(size = 28) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <!-- Fur outline — warm cream -->
  <ellipse cx="50" cy="62" rx="26" ry="22" fill="#ffe4c9"/>
  <ellipse cx="28" cy="36" rx="12" ry="15" fill="#ffe4c9" transform="rotate(-10 28 36)"/>
  <ellipse cx="42" cy="24" rx="11" ry="14" fill="#ffe4c9" transform="rotate(-3 42 24)"/>
  <ellipse cx="58" cy="24" rx="11" ry="14" fill="#ffe4c9" transform="rotate(3 58 24)"/>
  <ellipse cx="72" cy="36" rx="12" ry="15" fill="#ffe4c9" transform="rotate(10 72 36)"/>
  <!-- Main pad — rosy pink, puffy -->
  <ellipse cx="50" cy="64" rx="20" ry="16" fill="#ffb3c6"/>
  <ellipse cx="50" cy="61" rx="14" ry="9" fill="#ffc8d9" opacity="0.6"/>
  <!-- Toe beans — peachy pink with inner highlights -->
  <ellipse cx="29" cy="37" rx="8" ry="11" fill="#ffb3c6" transform="rotate(-10 29 37)"/>
  <ellipse cx="29" cy="35" rx="5" ry="6.5" fill="#ffc8d9" opacity="0.7" transform="rotate(-10 29 35)"/>
  <circle cx="27" cy="33" r="1.5" fill="#fff" opacity="0.6"/>
  <ellipse cx="43" cy="26" rx="8" ry="10" fill="#ffb3c6" transform="rotate(-3 43 26)"/>
  <ellipse cx="43" cy="24" rx="5" ry="6" fill="#ffc8d9" opacity="0.7" transform="rotate(-3 43 24)"/>
  <circle cx="41" cy="22" r="1.5" fill="#fff" opacity="0.6"/>
  <ellipse cx="57" cy="26" rx="8" ry="10" fill="#ffb3c6" transform="rotate(3 57 26)"/>
  <ellipse cx="57" cy="24" rx="5" ry="6" fill="#ffc8d9" opacity="0.7" transform="rotate(3 57 24)"/>
  <circle cx="55" cy="22" r="1.5" fill="#fff" opacity="0.6"/>
  <ellipse cx="71" cy="37" rx="8" ry="11" fill="#ffb3c6" transform="rotate(10 71 37)"/>
  <ellipse cx="71" cy="35" rx="5" ry="6.5" fill="#ffc8d9" opacity="0.7" transform="rotate(10 71 35)"/>
  <circle cx="69" cy="33" r="1.5" fill="#fff" opacity="0.6"/>
  <!-- Main pad highlight dot -->
  <circle cx="44" cy="59" r="2.5" fill="#fff" opacity="0.45"/>
  <!-- Heart accent on main pad -->
  <path d="M48,68 C48,66 46,65 44.5,66.5 C43,65 41,66 41,68 C41,70 44.5,73 44.5,73 C44.5,73 48,70 48,68Z" fill="#ff8aaa" opacity="0.5"/>
</svg>`;
}
