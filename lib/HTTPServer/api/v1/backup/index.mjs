import express from 'express';

import Backups from '../../../../../services/Backups.mjs';
import SQLite from '../../../../../services/SQLite.mjs';

export default express()

  .get('/docker-compose.yml', async (req, res) => {
    const App = await SQLite.getModelApp();
    const apps = await App.findAll({ order: [['subdomain', 'ASC']] });
    const lines = [
      '# Exported by Containarr',
      '# Environment values may contain secrets.',
      apps.length > 0 ? 'services:' : 'services: {}',
    ];

    for (const app of apps) {
      const environment = app.dockerEnvironment ?? {};
      const volumes = Array.isArray(app.dockerVolumes)
        ? app.dockerVolumes
        : Object.values(app.dockerVolumes ?? {});
      const devices = Array.isArray(app.dockerDevices)
        ? app.dockerDevices
        : Object.values(app.dockerDevices ?? {});
      const ports = Array.isArray(app.dockerPorts) ? app.dockerPorts : [];
      const capabilities = Array.isArray(app.dockerCapabilities)
        ? app.dockerCapabilities
        : [];

      lines.push(
        `  ${JSON.stringify(app.subdomain)}:`,
        `    image: ${JSON.stringify(app.dockerImage)}`,
        `    container_name: ${JSON.stringify(app.subdomain)}`,
        `    hostname: ${JSON.stringify(app.subdomain)}`,
        '    restart: unless-stopped',
      );

      if (app.disabled) lines.push('    profiles: [disabled]');

      if (app.dockerUserId !== null && app.dockerUserId !== undefined) {
        lines.push(`    user: ${JSON.stringify(
          app.dockerGroupId === null || app.dockerGroupId === undefined
            ? String(app.dockerUserId)
            : `${app.dockerUserId}:${app.dockerGroupId}`,
        )}`);
      }
      if (app.dockerPrivileged) lines.push('    privileged: true');
      if (
        app.dockerUser
        && (app.dockerUserId === null || app.dockerUserId === undefined)
      ) lines.push(`    user: ${JSON.stringify(app.dockerUser)}`);
      if (app.dockerEntrypoint) lines.push(`    entrypoint: ${JSON.stringify(app.dockerEntrypoint)}`);
      if (app.dockerCommand) lines.push(`    command: ${JSON.stringify(app.dockerCommand)}`);
      if (app.dockerWorkingDirectory) {
        lines.push(`    working_dir: ${JSON.stringify(app.dockerWorkingDirectory)}`);
      }

      if (Object.keys(environment).length > 0) {
        lines.push('    environment:');
        for (const [key, value] of Object.entries(environment).sort(([left], [right]) => left.localeCompare(right))) {
          lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(String(value))}`);
        }
      }
      if (volumes.length > 0) {
        lines.push('    volumes:');
        for (const volume of volumes) lines.push(`      - ${JSON.stringify(volume)}`);
      }
      if (devices.length > 0) {
        lines.push('    devices:');
        for (const device of devices) lines.push(`      - ${JSON.stringify(device)}`);
      }
      if (app.dockerNetworkMode === 'host') {
        lines.push('    network_mode: host');
      } else {
        if (ports.length > 0) {
          lines.push('    ports:');
          for (const port of ports) {
            lines.push(`      - ${JSON.stringify(`${port.host}:${port.container}/${port.protocol}`)}`);
          }
        }
        lines.push('    networks:', '      - containarr');
      }
      if (capabilities.length > 0) {
        lines.push('    cap_add:');
        for (const capability of capabilities) lines.push(`      - ${JSON.stringify(capability)}`);
      }
      lines.push('');
    }

    if (apps.some(app => app.dockerNetworkMode !== 'host')) {
      lines.push(
        'networks:',
        '  containarr:',
        '    name: containarr',
        '    driver: bridge',
        '',
      );
    }

    res
      .set('Content-Disposition', 'attachment; filename="docker-compose.yml"')
      .type('application/yaml')
      .status(200)
      .send(`${lines.join('\n')}\n`);
  })

  .get('/', async (req, res) => {
    res.status(200).json(await Backups.getSettings());
  })

  .put('/', async (req, res) => {
    try {
      res.status(200).json(await Backups.setSettings({
        repositoryUrl: req.body?.repositoryUrl,
        branch: req.body?.branch,
      }));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })

  .post('/', async (req, res) => {
    try {
      await Backups.backup();
      res.status(200).json(await Backups.getSettings());
    } catch (error) {
      res.status(502).json({ error: error.stderr?.trim() || error.message });
    }
  });
