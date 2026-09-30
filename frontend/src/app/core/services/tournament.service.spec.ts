import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TournamentService } from './tournament.service';

describe('TournamentService', () => {
  let service: TournamentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TournamentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('gets the array directly from the proxy endpoint', () => {
    const received = vi.fn();
    service.getAll().subscribe(received);
    const request = http.expectOne('/api/tournaments');
    expect(request.request.method).toBe('GET');
    request.flush([]);
    expect(received).toHaveBeenCalledWith([]);
  });

  it('propagates an HTTP error to the component', () => {
    const failed = vi.fn();
    service.getAll().subscribe({ error: failed });
    http.expectOne('/api/tournaments').flush({}, { status: 500, statusText: 'Server error' });
    expect(failed).toHaveBeenCalledWith(expect.any(HttpErrorResponse));
  });
});
