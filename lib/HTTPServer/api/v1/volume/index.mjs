import express from 'express';
import Docker from '../../../../../services/Docker.mjs';

export default express()

  // listVolumes
  .get('/', async (req, res) => {
    const result = await Docker.getVolumes();
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
