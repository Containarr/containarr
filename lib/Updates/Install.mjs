import Dockerode from 'dockerode';

const containerId = process.argv[2];
const targetImage = process.argv[3];
const dockerSocket = process.argv[4];

if (!containerId || !targetImage || !dockerSocket) {
  throw new Error('Missing updater configuration.');
}

const docker = new Dockerode({ socketPath: dockerSocket });
const original = docker.getContainer(containerId);
const metadata = await original.inspect();
const name = metadata.Name.replace(/^\//, '');
const labels = { ...metadata.Config.Labels };
delete labels['org.opencontainers.image.version'];

// Preserve the container's aliases and static network configuration.
const endpoints = Object.fromEntries(
  Object.entries(metadata.NetworkSettings.Networks ?? {}).map(([networkName, network]) => [
    networkName,
    {
      Aliases: (network.Aliases ?? []).filter(alias => (
        alias !== metadata.Id
        && alias !== metadata.Id.slice(0, 12)
      )),
      Links: network.Links,
      IPAMConfig: network.IPAMConfig,
      DriverOpts: network.DriverOpts,
    },
  ]),
);

const createOptions = {
  name,
  Image: targetImage,
  User: metadata.Config.User,
  Env: (metadata.Config.Env ?? []).filter(value => !value.startsWith('CONTAINARR_VERSION=')),
  Cmd: metadata.Config.Cmd,
  Healthcheck: metadata.Config.Healthcheck,
  ExposedPorts: metadata.Config.ExposedPorts,
  Tty: metadata.Config.Tty,
  OpenStdin: metadata.Config.OpenStdin,
  StdinOnce: metadata.Config.StdinOnce,
  Volumes: metadata.Config.Volumes,
  WorkingDir: metadata.Config.WorkingDir,
  Entrypoint: metadata.Config.Entrypoint,
  NetworkDisabled: metadata.Config.NetworkDisabled,
  Labels: labels,
  StopSignal: metadata.Config.StopSignal,
  StopTimeout: metadata.Config.StopTimeout,
  Shell: metadata.Config.Shell,
  HostConfig: metadata.HostConfig,
  NetworkingConfig: Object.keys(endpoints).length > 0
    ? { EndpointsConfig: endpoints }
    : undefined,
};

// Give the API response time to reach the browser before stopping Containarr.
await new Promise(resolve => setTimeout(resolve, 1500));
await original.stop({ t: metadata.Config.StopTimeout ?? 10 }).catch(error => {
  if (error.statusCode !== 304) throw error;
});
await original.remove({ v: false });

let replacement;

try {
  replacement = await docker.createContainer(createOptions);
  await replacement.start();
  await new Promise(resolve => setTimeout(resolve, 3000));

  const replacementMetadata = await replacement.inspect();
  if (!replacementMetadata.State.Running) {
    throw new Error(`Updated container stopped with exit code ${replacementMetadata.State.ExitCode}.`);
  }
} catch (error) {
  if (replacement) {
    await replacement.remove({ force: true, v: false }).catch(() => {});
  }

  // Restore the previous image if the updated container fails to stay running.
  const rollback = await docker.createContainer({
    ...createOptions,
    Image: metadata.Image,
  });
  await rollback.start();
  throw error;
}

console.log(`Updated ${name} to ${targetImage}.`);
