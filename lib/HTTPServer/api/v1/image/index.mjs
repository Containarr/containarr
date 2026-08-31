import express from 'express';
import Docker from '../../../../../services/Docker.mjs';

export default express()

  // listImages
  .get('/', async (req, res) => {
    const [images, containers] = await Promise.all([
      Docker.getImages(),
      Docker.getContainers(),
    ]);
    res.json(images.map(image => ({
      id: image.Id,
      tags: image.RepoTags ?? [],
      digests: image.RepoDigests ?? [],
      created: new Date(image.Created * 1000).toISOString(),
      size: image.Size,
      containers: containers
        .filter(container => container.ImageID === image.Id)
        .map(container => ({
          id: container.Id,
          name: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
        })),
      labels: image.Labels ?? {},
    })));
  })

  // cleanupImages
  .post('/cleanup', async (req, res) => {
    const result = await Docker.cleanupImages();
    res.json({
      deleted: result.ImagesDeleted ?? [],
      spaceReclaimed: result.SpaceReclaimed ?? 0,
    });
  })

  // deleteImage
  .delete('/:imageId', async (req, res) => {
    await Docker.deleteImage({ imageId: req.params.imageId });
    res.status(204).send();
  });
