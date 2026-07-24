import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const root = process.cwd();
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx']);
const internalAllowlist = new Map([
  ['ai', new Set()],
  ['application', new Set(['contracts'])],
  ['auth', new Set(['contracts'])],
  ['contracts', new Set()],
  ['database', new Set(['application', 'contracts', 'domain'])],
  ['domain', new Set()],
  ['ingestion', new Set()],
  ['observability', new Set(['contracts'])],
  ['test-support', new Set(['application'])],
  ['ui', new Set()],
]);
const errors = [];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

for (const file of await filesUnder(root)) {
  const normalized = relative(root, file).split(sep).join('/');
  if (
    normalized.startsWith('node_modules/') ||
    normalized.includes('/.next/') ||
    normalized.includes('/dist/')
  ) {
    continue;
  }
  const source = await readFile(file, 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );

  for (const specifier of imports) {
    if (specifier.includes('@radix-ui/') || specifier === 'radix-ui') {
      errors.push(`${normalized}: Radix dependency is prohibited (${specifier})`);
    }
    if (specifier.startsWith('@base-ui/') && !normalized.startsWith('packages/ui/')) {
      errors.push(`${normalized}: Base UI may only be imported by packages/ui`);
    }

    const packageMatch = /^packages\/([^/]+)\//.exec(normalized);
    const internalMatch = /^@delivery-os\/([^/]+)$/.exec(specifier);
    if (packageMatch && internalMatch) {
      const owner = packageMatch[1];
      const target = internalMatch[1];
      if (owner !== target && !internalAllowlist.get(owner)?.has(target)) {
        errors.push(`${normalized}: ${owner} may not import ${specifier}`);
      }
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Package boundary policy passed.\n');
}
