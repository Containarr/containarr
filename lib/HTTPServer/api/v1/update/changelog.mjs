import express from 'express';
import MarkdownIt from 'markdown-it';

import { CONTAINARR_CHANGELOG_URL } from '../../../../../config.mjs';

// Do not enable raw HTML: this content is retrieved from a remote source.
const markdown = new MarkdownIt({ html: false });

export default express()
  .get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const response = await fetch(CONTAINARR_CHANGELOG_URL, {
        headers: { Accept: 'text/plain' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(`Changelog request failed: ${response.status}`);
      }
      const content = await response.text();
      if (!content.trim()) throw new Error('The changelog is empty.');

      res.json({ html: markdown.render(content) });
    } catch (error) {
      res.status(502).json({ error: `Unable to load the changelog. ${error.message}` });
    }
  });
