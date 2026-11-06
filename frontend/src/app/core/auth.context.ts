import { HttpContextToken } from '@angular/common/http';

// Restoring a session on a public page must not interrupt public viewing.
export const REDIRECT_ON_UNAUTHORIZED = new HttpContextToken<boolean>(() => true);
