/**
 * docs/contracts/* is the single authority. src/contracts/* mirrors the four
 * TypeScript contracts + the two JSON artifacts byte-for-byte. Any drift is a
 * blocking failure (ARCH 5.2, architect Phase 3 gate).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FILES = [
  'types.ts', 'rules.ts', 'field.ts', 'interfaces.ts',
  'field-types.json', 'rules.schema.json',
];

const problems = [];
for (const name of FILES) {
  const doc = join(ROOT, 'docs', 'contracts', name);
  const src = join(ROOT, 'src', 'contracts', name);
  if (!existsSync(doc) || !existsSync(src)) {
    problems.push('missing contract file: ' + name);
    continue;
  }
  const a = readFileSync(doc);
  const b = readFileSync(src);
  if (!a.equals(b)) {
    problems.push('byte mismatch: docs/contracts/' + name + ' != src/contracts/' + name);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error('CONTRACTS FAIL: ' + problem);
  process.exit(1);
}
console.log('CONTRACTS PASS: ' + FILES.length + ' mirrored files are byte-identical');
