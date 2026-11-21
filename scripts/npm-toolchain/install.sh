#!/bin/sh
# Bootstrap a project-owned npm from the committed toolchain lock.
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="${1:?Supply a parent directory for the HyperHive toolchain}/hyperhive-npm"
mkdir -p "$target"
cp "$source_dir/package.json" "$source_dir/package-lock.json" "$target/"
cd "$target"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
# Verify the official CLI archive before extracting it. The CLI in this
# temporary directory also allows reinstalling the active local toolchain.
node --input-type=module - "$stage/npm.tgz" <<'JS'
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const response = await fetch('https://registry.npmjs.org/npm/-/npm-12.2.3.tgz');
if (!response.ok) throw new Error('npm archive download failed: ' + response.status);
const bytes = Buffer.from(await response.arrayBuffer());
const digest = createHash('sha512').update(bytes).digest('base64');
if (digest !== 'ovmNRRe76Jvcp1E6iOePQ6H9Zr4XMOrqgfaeGNhtRvP3XSl2Lo/a9C1N5/jRlLLrsqCem/omgGdZHpZ5a6yn1Q==') throw new Error('Unexpected npm archive digest');
await writeFile(process.argv[2], bytes);
JS
tar -xzf "$stage/npm.tgz" -C "$stage"
node "$stage/package/bin/npm-cli.js" ci --ignore-scripts --min-release-age=3 --no-audit --no-fund
# Node resolves the patched packages from the outer locked tree after these
# two bundled copies are removed. Their own dependencies resolve there too.
rm -rf "$stage/package/node_modules/glob" "$stage/package/node_modules/minimatch"
mv "$stage/package" node_modules/npm
mkdir -p node_modules/.bin
ln -sf ../npm/bin/npm-cli.js node_modules/.bin/npm
ln -sf ../npm/bin/npx-cli.js node_modules/.bin/npx
node --input-type=commonjs <<'JS'
const { createRequire } = require('node:module');
const npmRequire = createRequire(require.resolve('npm/package.json'));
const { dependencies } = require('./package.json');
for (const name of ['glob', 'minimatch']) {
  const installed = npmRequire(name + '/package.json').version;
  if (installed !== dependencies[name]) throw new Error('Unexpected npm toolchain version for ' + name + ': ' + installed);
}
if (!npmRequire('minimatch').minimatch('config.json', '*.json') ||
    !npmRequire('glob').globSync('package.json').includes('package.json')) {
  throw new Error('npm pattern matching check failed');
}
JS
