export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'organizer';
  created_at: string;
}

export interface LoginResponse {
  message: string;
  data: AuthenticatedUser;
}
