import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { Auth } from './services/auth';
import { REDIRECT_ON_UNAUTHORIZED } from './auth.context';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!/^\/api\/(?:tournaments|teams|matches)(?:[/?]|$)|^\/api\/auth\/me(?:\?|$)/.test(request.url)) {
    return next(request);
  }
  const auth = inject(Auth);
  const token = auth.token();
  const authenticated = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  return next(authenticated).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401 && auth.token() === token) {
      if (request.context.get(REDIRECT_ON_UNAUTHORIZED)) auth.logout();
      else auth.clear();
    }
    return throwError(() => error);
  }));
};
