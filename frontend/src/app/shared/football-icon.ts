import { Component } from '@angular/core';

@Component({
  selector: 'app-football-icon',
  template: `
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#fff" stroke="#18324d" stroke-width="1.5" />
      <path d="m20 12 8 6-3 9H15l-3-9zM15 3l5 4 5-4M3 15l5 1 2-6M4 28l6-1 3 7M27 34l3-7 6 1M30 10l2 6 5-1" fill="#18324d" />
      <path d="M20 7v5M8 16l4 2M10 27l5 0M25 27h5M28 18l4-2" stroke="#18324d" stroke-width="1.2" />
    </svg>`,
  styles: `:host { display: inline-block; width: 32px; height: 32px; } svg { display: block; width: 100%; height: 100%; }`,
})
export class FootballIcon {}
