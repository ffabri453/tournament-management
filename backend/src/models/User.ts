import pool from '../config/db';

export type UserRole = 'admin' | 'organizer';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  created_at: Date;
}

export interface UserCredentials extends User {
  password_hash: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
}

const userSelect = 'id, name, email, role, created_at';

export const createUser = async (user: CreateUserInput): Promise<User> => {
  const result = await pool.query<User>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${userSelect}`,
    [user.name, user.email, user.password_hash, user.role]
  );
  return result.rows[0]!;
};

// Esta consulta es interna: devuelve el hash para la futura verificacion de credenciales.
export const findUserByEmail = async (email: string): Promise<UserCredentials | null> => {
  const result = await pool.query<UserCredentials>(
    `SELECT ${userSelect}, password_hash
     FROM users
     WHERE LOWER(BTRIM(email)) = LOWER(BTRIM($1))`,
    [email]
  );
  return result.rows[0] ?? null;
};

export const findUserById = async (id: number): Promise<User | null> => {
  const result = await pool.query<User>(
    `SELECT ${userSelect}
     FROM users
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
};
