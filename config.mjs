import PACKAGE from './package.json' with { type: 'json' };

export const CONTAINARR_VERSION = process.env.CONTAINARR_VERSION || PACKAGE.version;
export const CONTAINARR_IMAGE = process.env.CONTAINARR_IMAGE || 'ghcr.io/containarr/containarr:latest';
export const PORT_HTTP = process.env.PORT_HTTP || 80;
export const PORT_HTTPS = process.env.PORT_HTTPS || 443;
export const PORT_ADMIN = process.env.PORT_ADMIN || 81;
export const SQLITE_STORAGE = process.env.SQLITE_STORAGE || '/data/sqlite/db.sqlite';
export const BACKUP_DIRECTORY = process.env.BACKUP_DIRECTORY || '/data/backups';
export const DDNS_API_URL = process.env.DDNS_API_URL || 'https://containarr.me/api/v1';
export const DOCKER_SOCK = process.env.DOCKER_SOCK || '/var/run/docker.sock';
export const APPS_REGISTRY_URL = process.env.APPS_REGISTRY_URL || 'https://containarr.com/apps';
export const LETS_ENCRYPT_DIRECTORY_URL = process.env.LETS_ENCRYPT_DIRECTORY_URL || 'https://acme-v02.api.letsencrypt.org/directory';
export const LETS_ENCRYPT_EMAIL = process.env.LETS_ENCRYPT_EMAIL || 'lets-encrypt@containarr.com';
