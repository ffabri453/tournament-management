import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Auth } from './core/services/auth';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { FootballIcon } from './shared/football-icon';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, FootballIcon],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(click)': 'animateBall($event)' },
})
export class App implements OnInit {
  readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly currentPath = toSignal(this.router.events.pipe(
    filter(event => event instanceof NavigationEnd),
    map(event => event.urlAfterRedirects.split(/[?#]/)[0]),
    startWith(this.router.url.split(/[?#]/)[0]),
  ), { requireSync: true });
  readonly isHome = computed(() => this.currentPath() === '/');
  readonly isAuthPage = computed(() => ['/login', '/register'].includes(this.currentPath()));
  readonly kicks = signal<{ id: number; x: number; y: number }[]>([]);
  private kickId = 0;
  private kickTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.kickTimer));
  }

  protected animateBall(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = target.closest<HTMLElement>('button, a[href], [role="button"]');
    if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
    const bounds = control.getBoundingClientRect();
    // The decoration lives outside RouterOutlet, so navigation never waits for it.
    const x = event.detail === 0 ? bounds.right - 30 : event.clientX;
    const y = event.detail === 0 ? bounds.top + bounds.height / 2 : event.clientY;
    this.kicks.set([{ id: ++this.kickId, x: Math.max(20, Math.min(x, window.innerWidth - 80)), y }]);
    clearTimeout(this.kickTimer);
    this.kickTimer = setTimeout(() => this.kicks.set([]), 320);
  }

  ngOnInit(): void {
    this.auth.validateSession(false).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
