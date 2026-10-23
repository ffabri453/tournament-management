export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  message: string;
  data: AuthenticatedUser;
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'organizer';
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  message: string;
  data: AuthenticatedUser;
}
