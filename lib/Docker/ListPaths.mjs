import fs from 'node:fs';
import path from 'node:path';

const requested = process.argv[2];
const publicRoot = process.argv[3];
const mountRoot = '/host';

if (publicRoot !== '/' && requested !== publicRoot && !requested.startsWith(`${publicRoot}/`)) {
  throw new Error('Path is outside the requested root.');
}

const relative = publicRoot === '/'
  ? requested
  : requested.slice(publicRoot.length) || '/';
const separator = relative.endsWith('/')
  ? relative.length - 1
  : relative.lastIndexOf('/');
const directory = relative.endsWith('/')
  ? relative.slice(0, -1) || '/'
  : relative.slice(0, separator) || '/';
const prefix = relative.endsWith('/') ? '' : relative.slice(separator + 1);
const resolved = path.resolve(mountRoot, `.${directory}`);

if (resolved !== mountRoot && !resolved.startsWith(`${mountRoot}/`)) {
  throw new Error('Path is outside the mounted root.');
}

const entries = fs.readdirSync(resolved, { withFileTypes: true })
  .filter(entry => entry.name.toLowerCase().startsWith(prefix.toLowerCase()))
  .sort((left, right) => (
    Number(right.isDirectory()) - Number(left.isDirectory())
    || left.name.localeCompare(right.name)
  ))
  .slice(0, 100)
  .map(entry => ({
    path: `${publicRoot === '/' ? '' : publicRoot}${directory === '/' ? '' : directory}/${entry.name}${entry.isDirectory() ? '/' : ''}`,
    directory: entry.isDirectory(),
  }));

process.stdout.write(JSON.stringify(entries));
