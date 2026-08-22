import fs from 'node:fs';
import os from 'node:os';

const networkInterfaces = os.networkInterfaces();
let interfaceNames = Object.keys(networkInterfaces);

try {
  const defaultRouteInterfaces = new Set(
    fs.readFileSync('/proc/net/route', 'utf8')
      .trim()
      .split('\n')
      .slice(1)
      .map(line => line.trim().split(/\s+/))
      .filter(columns => columns[1] === '00000000')
      .map(columns => columns[0]),
  );
  if (defaultRouteInterfaces.size > 0) {
    interfaceNames = [...defaultRouteInterfaces];
  }
} catch {
  // Use all interfaces on platforms without /proc/net/route.
}

const addresses = interfaceNames
  .flatMap(interfaceName => networkInterfaces[interfaceName] ?? [])
  .filter(address => address.family === 'IPv4' && !address.internal)
  .map(address => address.address);

process.stdout.write(JSON.stringify(addresses));
