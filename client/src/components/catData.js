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
 * Cat paw with toe beans (used for PawButton icon).
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
