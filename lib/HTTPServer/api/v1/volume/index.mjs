import express from 'express';
import Docker from '../../../../../services/Docker.mjs';

export default express()

  // listVolumes
  .get('/', async (req, res) => {
    const [result, containers] = await Promise.all([
      Docker.getVolumes(),
      Docker.getContainers(),
    ]);
    res.json((result.Volumes ?? []).map(volume => ({
      name: volume.Name,
      driver: volume.Driver,
      mountpoint: volume.Mountpoint,
      created: volume.CreatedAt ?? null,
      scope: volume.Scope,
      labels: volume.Labels ?? {},
      options: volume.Options ?? {},
      size: volume.UsageData?.Size ?? null,
      refCount: volume.UsageData?.RefCount ?? null,
      containers: containers
        .filter(container => (container.Mounts ?? []).some(mount => (
          mount.Type === 'volume'
          && (mount.Name === volume.Name || mount.Source === volume.Name)
        )))
        .map(container => ({
          id: container.Id,
          name: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
        })),
      deletable: volume.UsageData?.RefCount === 0,
    })));
  })

  // cleanupVolumes
  .post('/cleanup', async (req, res) => {
    const result = await Docker.cleanupVolumes();
    res.json({
      deleted: result.VolumesDeleted ?? [],
      spaceReclaimed: result.SpaceReclaimed ?? 0,
    });
  })

  // deleteVolume
  .delete('/:volumeName', async (req, res) => {
    await Docker.deleteVolume({ volumeName: req.params.volumeName });
    res.status(204).send();
  });
