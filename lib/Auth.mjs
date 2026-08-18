import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import SQLite from '../services/SQLite.mjs';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'containarr_session';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export class AuthError extends Error {

  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export default class Auth {

  #dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'));

  async getState(request) {
    const User = await SQLite.getModelUser();
    const onboardingRequired = await User.count() === 0;
    const user = onboardingRequired ? null : await this.authenticate(request);

    return {
      onboardingRequired,
      authenticated: Boolean(user),
      user: user ? serializeUser(user) : null,
    };
  }

  async onboard({ username, password }) {
    const User = await SQLite.getModelUser();
    if (await User.count() !== 0) {
      throw new AuthError(409, 'Onboarding has already been completed.');
    }

    const normalizedUsername = validateUsername(username);
    validatePassword(password);

    try {
      return await User.create({
        id: 'owner',
        username: normalizedUsername,
        passwordHash: await hashPassword(password),
      });
    } catch (error) {
      if (await User.count() !== 0) {
        throw new AuthError(409, 'Onboarding has already been completed.');
      }
      throw error;
    }
  }

  async login({ username, password }) {
    const User = await SQLite.getModelUser();
    const normalizedUsername = normalizeUsername(username);
    const user = normalizedUsername
      ? await User.findOne({ where: { username: normalizedUsername } })
      : null;
    const passwordHash = user?.passwordHash ?? await this.#dummyPasswordHash;
    const passwordMatches = typeof password === 'string'
      && password.length <= 1024
      && await verifyPassword(password, passwordHash);

    if (!user || !passwordMatches) {
      throw new AuthError(401, 'Invalid username or password.');
    }

    return user;
  }

  async changePassword(user, { currentPassword, newPassword }) {
    const passwordMatches = typeof currentPassword === 'string'
      && currentPassword.length <= 1024
      && await verifyPassword(currentPassword, user.passwordHash);

    if (!passwordMatches) {
      throw new AuthError(400, 'Current password is incorrect.');
    }

    validatePassword(newPassword);
    if (newPassword === currentPassword) {
      throw new AuthError(400, 'New password must be different from the current password.');
    }

    user.passwordHash = await hashPassword(newPassword);
    await user.save();
  }

  async createSession(user) {
    const Session = await SQLite.getModelSession();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DURATION);

    await Session.create({
      id: hashToken(token),
      userId: user.id,
      expiresAt,
    });

    return { token, expiresAt };
  }

  async authenticate(request) {
    const token = getCookie(request, COOKIE_NAME);
    if (!token) return null;

    const Session = await SQLite.getModelSession();
    const session = await Session.findByPk(hashToken(token));
    if (!session) return null;

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await session.destroy();
      return null;
    }

    const User = await SQLite.getModelUser();
    const user = await User.findByPk(session.userId);
    if (user) return user;

    await session.destroy();
    return null;
  }

  async logout(request) {
    const token = getCookie(request, COOKIE_NAME);
    if (!token) return;

    const Session = await SQLite.getModelSession();
    await Session.destroy({ where: { id: hashToken(token) } });
  }

  setSessionCookie(response, request, { token, expiresAt }) {
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: request.secure,
      path: '/',
      expires: expiresAt,
    });
  }

  clearSessionCookie(response, request) {
    response.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'strict',
      secure: request.secure,
      path: '/',
    });
  }
}

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

function validateUsername(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalizedUsername)) {
    throw new AuthError(
      400,
      'Username must be 3–64 characters and use only letters, numbers, dots, underscores, or hyphens.',
    );
  }
  return normalizedUsername;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) {
    throw new AuthError(400, 'Password must be between 8 and 1024 characters.');
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

async function verifyPassword(password, encodedPassword) {
  const [algorithm, cost, blockSize, parallelization, salt, expectedKey] =
    encodedPassword.split('$');
  if (algorithm !== 'scrypt') return false;

  const expected = Buffer.from(expectedKey, 'base64url');
  const actual = await scrypt(
    password,
    Buffer.from(salt, 'base64url'),
    expected.length,
    {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: SCRYPT_MAX_MEMORY,
    },
  );

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function getCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
  };
}
