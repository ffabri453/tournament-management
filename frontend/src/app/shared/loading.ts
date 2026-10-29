import { Component, input } from '@angular/core';
import { FootballIcon } from './football-icon';

@Component({
  selector: 'app-loading',
  imports: [FootballIcon],
  template: `<p role="status"><app-football-icon /> <span>{{ label() }}</span></p>`,
  styles: `
    :host { display: block; }
    p { display: flex; align-items: center; justify-content: center; gap: 12px; margin: var(--loading-margin, 1em 0); padding: var(--loading-padding, 24px 16px); color: var(--loading-color, #284462); }
    app-football-icon { animation: loading-ball 900ms ease-in-out infinite; }
    @keyframes loading-ball { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-7px) rotate(35deg); } }
    @media (prefers-reduced-motion: reduce) { app-football-icon { animation: none; } }
  `,
})
export class Loading {
  readonly label = input('Cargando…');
}
