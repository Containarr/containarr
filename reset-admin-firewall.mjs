import { promisify } from 'node:util';
import sqlite3 from 'sqlite3';

import { SQLITE_STORAGE } from './config.mjs';

let database;

try {
  database = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(SQLITE_STORAGE, sqlite3.OPEN_READWRITE, error => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
  database.configure('busyTimeout', 5000);
  // Removing the override restores Public without initializing or migrating the database.
  await promisify(database.run.bind(database))('DELETE FROM Settings WHERE key = ?', ['adminPolicyId']);
  console.log('Admin firewall policy reset to Public. Traefik will apply the change within a few seconds.');
} catch (error) {
  console.error(`Could not reset the admin firewall policy: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (database) await promisify(database.close.bind(database))();
}
