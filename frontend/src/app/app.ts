import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Auth } from './core/services/auth';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.auth.validateSession(false).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
