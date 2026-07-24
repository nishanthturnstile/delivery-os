import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();
const docsRoot = join(root, 'docs');
const errors = [];

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (extname(entry.name) === '.md') files.push(path);
  }
  return files;
}

for (const file of await markdownFiles(docsRoot)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (
      target === '' ||
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('mailto:')
    ) {
      continue;
    }
    const resolved = resolve(dirname(file), decodeURIComponent(target));
    if (!normalize(resolved).startsWith(normalize(docsRoot))) {
      errors.push(`${relative(root, file)}: link escapes docs root (${target})`);
      continue;
    }
    await access(resolved).catch(() => {
      errors.push(`${relative(root, file)}: missing link target (${target})`);
    });
  }
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Documentation link policy passed.\n');
}
