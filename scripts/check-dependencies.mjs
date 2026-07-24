import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = process.cwd();
const errors = [];

async function findPackageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await findPackageFiles(path)));
    else if (entry.name === 'package.json') results.push(path);
  }
  return results;
}

for (const file of await findPackageFiles(root)) {
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (name.startsWith('@radix-ui/') || name === 'radix-ui') {
        errors.push(`${relative(root, file)}: prohibited dependency ${name}`);
      }
      if (
        typeof version !== 'string' ||
        (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) &&
          version !== 'catalog:' &&
          version !== 'workspace:*')
      ) {
        errors.push(
          `${relative(root, file)}: ${name} must use an exact, catalog, or workspace version`,
        );
      }
    }
  }
}

const lock = await readFile(join(root, 'pnpm-lock.yaml'), 'utf8').catch(() => '');
if (lock === '') errors.push('pnpm-lock.yaml is required');
if (/(?:@radix-ui\/|radix-ui@)/.test(lock)) errors.push('lockfile contains prohibited Radix UI');

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Dependency policy passed.\n');
}
