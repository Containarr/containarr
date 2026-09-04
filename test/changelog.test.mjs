import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, afterEach, before, mock, test } from 'node:test';
import changelog from '../lib/HTTPServer/api/v1/update/changelog.mjs';
import { CONTAINARR_CHANGELOG_URL } from '../config.mjs';

const request = globalThis.fetch;
let server, url;

before(async () => {
  server = changelog.listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/`;
});

afterEach(() => mock.restoreAll());
after(async () => {
  server.close();
  await once(server, 'close');
});

test('retrieves the configured URL and converts version headings and bullets to HTML', async () => {
  mock.method(globalThis, 'fetch', async (target, options) => {
    assert.equal(target, CONTAINARR_CHANGELOG_URL);
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response('# v1.2.3\n\n* Added **updates**.\n* Fixed a bug.\n* Removed a feature.\n');
  });
  const response = await request(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { html } = await response.json();
  assert.match(html, /<h1>v1\.2\.3<\/h1>/);
  assert.match(html, /<ul>\s*<li>Added <strong>updates<\/strong>\.<\/li>/);
  assert.match(html, /<li>Fixed a bug\.<\/li>/);
  assert.match(html, /<li>Removed a feature\.<\/li>/);
});

test('escapes embedded HTML and rejects script links', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(
    '# v1.2.3\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert%281%29)\n\n[safe](https://github.com/Containarr/containarr)',
  ));
  const { html } = await (await request(url)).json();
  assert.doesNotMatch(html, /<script|<img|href="javascript:/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/github.com\/Containarr\/containarr"/);
});

for (const failure of ['not found', 'empty', 'network', 'timeout']) {
  test(`returns a retryable error for ${failure}`, async () => {
    mock.method(globalThis, 'fetch', async () => {
      if (failure === 'network') throw new TypeError('fetch failed');
      if (failure === 'timeout') throw new DOMException('Request timed out', 'TimeoutError');
      return new Response(failure === 'empty' ? ' \n' : 'Not Found', {
        status: failure === 'not found' ? 404 : 200,
      });
    });
    const response = await request(url);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /^Unable to load the changelog\./);
  });
}
