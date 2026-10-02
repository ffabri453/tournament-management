import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { hasOnlyFields, isNonNumericName, isPlainObject } from '../domain/competitionRules';
import { createUser, findUserByEmail } from '../models/User';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: 'organizer';
}

const registerFields = ['name', 'email', 'password', 'role'];
const passwordSaltRounds = 12;

const normalizeEmail = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const isValidEmail = (email: string): boolean =>
  Array.from(email).length <= 254 && !/[\x00-\x1f\x7f]/.test(email) &&
  /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email);

export const validateRegisterBody = (
  body: unknown
): { data?: RegisterInput; errors: string[] } => {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors: string[] = [];
  const unknownFields = hasOnlyFields(body, registerFields);
  if (unknownFields.length > 0) {
    errors.push(`Unknown fields: ${unknownFields.join(', ')}`);
  }

  for (const field of ['name', 'email', 'password']) {
    if (body[field] === undefined) errors.push(`${field} is required`);
  }

  if (!isNonNumericName(body.name)) {
    errors.push('name must be a non-empty, non-numeric string of at most 100 characters');
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    errors.push('email must be a valid email address of at most 254 characters');
  }

  // Bcrypt solo considera 72 bytes: rechazar el exceso evita truncar la contrasena.
  if (typeof body.password !== 'string' || body.password.trim().length === 0 ||
      Array.from(body.password).length < 8 || Buffer.byteLength(body.password, 'utf8') > 72 ||
      body.password.includes('\0')) {
    errors.push('password must contain at least 8 characters, at most 72 UTF-8 bytes and no null characters');
  }

  if (body.role !== undefined && body.role !== 'organizer') {
    errors.push('role must be organizer for public registration');
  }

  if (errors.length > 0) return { errors };

  return {
    errors,
    data: {
      name: (body.name as string).trim(),
      email,
      password: body.password as string,
      role: 'organizer'
    }
  };
};

export const register = async (req: Request, res: Response): Promise<void> => {
  const validation = validateRegisterBody(req.body);
  if (!validation.data) {
    res.status(400).json({ error: true, message: 'Invalid registration data', errors: validation.errors });
    return;
  }

  try {
    const { name, email, password, role } = validation.data;
    const passwordHash = await bcrypt.hash(password, passwordSaltRounds);
    const user = await createUser({ name, email, password_hash: passwordHash, role });
    res.status(201).json({
      message: 'User registered successfully',
      data: { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at }
    });
  } catch (error) {
    // El indice unico tambien resuelve dos registros simultaneos con el mismo email.
    if (isPlainObject(error) && error.code === '23505' && error.constraint === 'unique_user_email') {
      res.status(409).json({ error: true, message: 'A user with this email already exists' });
      return;
    }
    res.status(500).json({ error: true, message: 'Error registering user' });
  }
};

export const validateLoginBody = (
  body: unknown
): { data?: LoginInput; errors: string[] } => {
  if (!isPlainObject(body)) {
    return { errors: ['Request body must be a JSON object'] };
  }

  const errors: string[] = [];
  const unknownFields = hasOnlyFields(body, ['email', 'password']);
  if (unknownFields.length > 0) {
    errors.push(`Unknown fields: ${unknownFields.join(', ')}`);
  }
  for (const field of ['email', 'password']) {
    if (body[field] === undefined) errors.push(`${field} is required`);
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    errors.push('email must be a valid email address of at most 254 characters');
  }
  if (typeof body.password !== 'string' || body.password.length === 0) {
    errors.push('password must be a non-empty string');
  }
  if (errors.length > 0) return { errors };

  return { errors, data: { email, password: body.password as string } };
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const validation = validateLoginBody(req.body);
  if (!validation.data) {
    res.status(400).json({ error: true, message: 'Invalid login data', errors: validation.errors });
    return;
  }

  try {
    const { email, password } = validation.data;
    const user = await findUserByEmail(email);
    // No aceptar una contrasena mas larga que coincida solo en los primeros 72 bytes.
    if (!user || Buffer.byteLength(password, 'utf8') > 72 ||
        !await bcrypt.compare(password, user.password_hash)) {
      res.status(401).json({ error: true, message: 'Invalid credentials' });
      return;
    }

    res.status(200).json({
      message: 'Login successful',
      data: { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at }
    });
  } catch {
    res.status(500).json({ error: true, message: 'Error logging in' });
  }
};
