import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('changelog documents the current version with version headings and change bullets', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.equal(changelog.split('\n')[0], `# v${version}`);
  const versions = new Set();
  let bullets = 0;
  for (const line of changelog.trim().split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('# ')) {
      if (versions.size) assert.ok(bullets > 0, 'Every release needs at least one change');
      assert.match(line, /^# v\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
      assert.ok(!versions.has(line), 'Release headings must be unique');
      versions.add(line);
      bullets = 0;
    } else {
      assert.match(line, /^\* (Added|Fixed|Changed|Removed) .+/);
      bullets++;
    }
  }
  assert.ok(bullets > 0, 'Every release needs at least one change');
});
