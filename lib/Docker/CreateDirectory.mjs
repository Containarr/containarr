import fs from 'node:fs';
import path from 'node:path';

const parentPath = process.argv[2];
const directoryName = process.argv[3];
const mountRoot = '/host';
const resolvedParent = path.resolve(mountRoot, `.${parentPath}`);

try {
  if (resolvedParent !== mountRoot && !resolvedParent.startsWith(`${mountRoot}/`)) {
    throw new Error('Path is outside the mounted root.');
  }
  if (fs.realpathSync(resolvedParent) !== resolvedParent) {
    throw new Error('Folders cannot be created through a symbolic link.');
  }

  fs.mkdirSync(path.join(resolvedParent, directoryName));

  process.stdout.write(JSON.stringify({
    path: `${parentPath === '/' ? '' : parentPath.replace(/\/+$/, '')}/${directoryName}/`,
    directory: true,
  }));
} catch (error) {
  process.stderr.write(
    error.code === 'EEXIST'
      ? 'A file or folder with that name already exists.'
      : error.code === 'EACCES' || error.code === 'EPERM'
        ? 'Containarr does not have permission to create a folder here.'
        : error.message,
  );
  process.exitCode = 1;
}
