import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import sqlite3 from 'sqlite3';

import { SQLITE_STORAGE } from './config.mjs';

let database;
let transactionStarted = false;

try {
  database = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(SQLITE_STORAGE, sqlite3.OPEN_READWRITE, error => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
  database.configure('busyTimeout', 5000);
  const run = promisify(database.run.bind(database));
  const get = promisify(database.get.bind(database));

  const password = randomBytes(24).toString('base64url');
  const salt = randomBytes(16);
  // Match the password format and scrypt parameters used by lib/Auth.mjs.
  const derivedKey = await promisify(scryptCallback)(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const passwordHash = [
    'scrypt', 32768, 8, 1, salt.toString('base64url'), derivedKey.toString('base64url'),
  ].join('$');

  // Do not initialize or migrate the database while the server is running.
  await run('BEGIN IMMEDIATE');
  transactionStarted = true;
  const user = await get('SELECT id, username FROM Users WHERE id = ?', ['owner']);
  if (!user) throw new Error('No admin account exists. Open Containarr in your browser to complete setup.');

  await run('UPDATE Users SET passwordHash = ?, updatedAt = ? WHERE id = ?', [
    passwordHash, new Date().toISOString(), user.id,
  ]);
  await run('DELETE FROM Sessions WHERE userId = ?', [user.id]);
  await run('COMMIT');
  transactionStarted = false;

  console.log(`Admin password reset. Existing sessions have been signed out.\nUsername: ${user.username}\nPassword: ${password}\n\nSign in, click your username in the sidebar, and choose Change Password.`);
} catch (error) {
  if (transactionStarted) {
    await promisify(database.run.bind(database))('ROLLBACK');
  }
  console.error(`Could not reset the admin password: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (database) await promisify(database.close.bind(database))();
}
