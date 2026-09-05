import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('changelog allows staged changes under Next before the current release', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.ok(['# Next', `# v${version}`].includes(changelog.split('\n')[0]));
  assert.equal(changelog.split('\n').find(line => line.startsWith('# v')), `# v${version}`);
  const versions = new Set();
  let bullets = 0;
  for (const line of changelog.trim().split('\n')) {
    if (!line.trim()) continue;
    if (line.startsWith('# ')) {
      if (versions.size) assert.ok(bullets > 0, 'Every section needs at least one change');
      if (line === '# Next') {
        assert.equal(versions.size, 0, 'Next must be the first section');
      } else {
        assert.match(line, /^# v\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
      }
      assert.ok(!versions.has(line), 'Release headings must be unique');
      versions.add(line);
      bullets = 0;
    } else {
      assert.match(line, /^\* (Added|Fixed|Changed|Removed) .+/);
      bullets++;
    }
  }
  assert.ok(bullets > 0, 'Every section needs at least one change');
});
