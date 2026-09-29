// Checks that PseudoFlow still reads everything the convention says it should.
//
// Sources:
//   - every fenced example in pseudocode-convention.md (```template blocks are skeletons and skipped)
//   - every .pff file in test/ and in the assessment folders listed below
//
// Each source's error count is compared with test/convention-baseline.json:
//   more errors than the baseline -> regression, the run fails
//   fewer errors                  -> improvement, run with --update to lock it in
//   not in the baseline           -> new source, must have 0 errors (or --update)
//
// Run: npm test        Update the baseline: npm test -- --update

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { analyze } from '../src/lib/analyzers/analyze';
import type { Convention } from '../src/lib/convention/loader';

const ROOT = join(import.meta.dirname, '..');
const CONVENTION = join(ROOT, 'pseudocode-convention.md');
const BASELINE = join(ROOT, 'test', 'convention-baseline.json');
const PFF_FOLDERS = [
   join(ROOT, 'test'),
   '/Volumes/Programming HD/Projects/Melbourne-Master-AI/COMP90101 Algorithmic Thinking/assessments'
];

type Source = { name: string, code: string };
type Result = Source & { errors: { line?: number, message: string }[] };

function conventionExamples(): Source[] {
   const md = readFileSync(CONVENTION, 'utf8');
   const examples: Source[] = [];
   const seen = new Map<string, number>();
   let heading = '';
   const fence = /^(#+ .*)$|^```(\w*)\n([\s\S]*?)^```/gm;
   let match;
   while ((match = fence.exec(md))) {
      if (match[1]) {
         heading = match[1].replace(/^#+\s*/, '').replace(/\*\*/g, '');
         continue;
      }
      if (match[2] === 'template' || match[2] === 'convention') continue;
      const key = `${heading} :: ${match[3].split('\n')[0].trim()}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      examples.push({ name: 'md: ' + key + (count > 1 ? ` (${count})` : ''), code: match[3] });
   }
   return examples;
}

function pffFiles(): Source[] {
   const files: string[] = [];
   const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
         const path = join(dir, entry);
         if (entry === 'node_modules' || entry.startsWith('.')) continue;
         if (statSync(path).isDirectory()) walk(path);
         else if (entry.endsWith('.pff')) files.push(path);
      }
   };
   PFF_FOLDERS.filter(existsSync).forEach(walk);
   return files.sort().map(path => {
      let code = readFileSync(path, 'utf8');
      // Drop the JSON header of the .pff format
      const separator = code.indexOf('\n---\n');
      if (code.startsWith('{') && separator >= 0) code = code.slice(separator + 5);
      const name = path.startsWith(ROOT) ? relative(ROOT, path) : basename(path);
      return { name: 'pff: ' + name, code };
   });
}

// The rules themselves must load before any example is worth checking
let convention: Convention;
try {
   ({ convention } = await import('./load-convention'));
   console.log(`✓ convention loads: ${convention.phrases.length} phrases, ${Object.keys(convention.headings).length} headings, ${Object.keys(convention.builtins).length} builtins\n`);
} catch (e) {
   console.log(`✗ convention does not load: ${(e as Error).message}`);
   process.exit(1);
}

const update = process.argv.includes('--update');
const baseline: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
const results: Result[] = [...conventionExamples(), ...pffFiles()].map(source => ({
   ...source,
   errors: analyze(source.code).errors
}));

let regressions = 0;
let improvements = 0;
for (const result of results) {
   const count = result.errors.length;
   const expected = baseline[result.name];
   let mark: string;
   let note = '';
   if (expected === undefined) {
      mark = count === 0 ? '✓' : '✗';
      if (count) { note = '  (new, expected 0)'; regressions++; }
   }
   else if (count > expected) { mark = '✗'; note = `  (was ${expected})`; regressions++; }
   else if (count < expected) { mark = '↑'; note = `  (was ${expected}, improved)`; improvements++; }
   else mark = count === 0 ? '✓' : '·';

   console.log(`${mark} ${String(count).padStart(3)}  ${result.name}${note}`);
   if (mark === '✗' || process.argv.includes('--verbose')) {
      result.errors.forEach(e => console.log(`         ${e.line !== undefined ? 'Ln ' + e.line + ': ' : ''}${e.message}`));
   }
}

const known = results.filter(r => r.errors.length && baseline[r.name] === r.errors.length).length;
console.log(`\n${results.length} sources: ${results.filter(r => !r.errors.length).length} clean, ${known} known gaps, ${improvements} improved, ${regressions} regressed`);
console.log('  ✓ clean   · known gap (same as baseline)   ↑ improved   ✗ regressed or new with errors');

if (update) {
   const next = Object.fromEntries(results.map(r => [r.name, r.errors.length]));
   writeFileSync(BASELINE, JSON.stringify(next, null, 3) + '\n');
   console.log(`\nBaseline updated: ${relative(ROOT, BASELINE)}`);
}
else if (improvements) {
   console.log('\nSome sources improved. Run `npm test -- --update` to lock the new counts in.');
}

process.exit(regressions && !update ? 1 : 0);
