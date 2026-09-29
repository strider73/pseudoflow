// Reads the ```convention blocks of pseudocode-convention.md into the rules the
// analyzer applies. It only takes the file's text, so the app (Vite import) and
// the tests (readFileSync) load it the same way.

import { parse as parseYaml } from 'yaml';

export type HeadingKind = 'chart' | 'skip';

// One piece of a phrase template
export type PhrasePart =
   | { kind: 'word', options: string[] }          // 'list|array' -> ['list', 'array']
   | { kind: 'capture', name: string }            // {low}
   | { kind: 'optional', parts: PhrasePart[] };   // [(inclusive)]

export type Phrase = { source: string, parts: PhrasePart[], result: string, captures: string[] };

export type Convention = {
   assignment: string[],
   symbols: Record<string, string>,
   words: {
      upperCaseLogic: boolean,
      endPrefixes: string[],
      letterTimes: string | false,
      superscriptPowers: boolean,
      bracketTuples: boolean,
      defineEndsByIndent: boolean
   },
   headings: Record<string, HeadingKind>,          // keys are lower case
   commands: string[],
   fileRead: { kinds: string[] },
   phrases: Phrase[],
   builtins: Record<string, number>
};

export class ConventionError extends Error {}

const KEYS = ['assignment', 'symbols', 'words', 'headings', 'commands', 'fileRead', 'phrases', 'builtins'];

export function loadConvention(markdown: string): Convention {
   const merged: Record<string, unknown> = {};
   const fence = /^```convention[ \t]*\n([\s\S]*?)^```/gm;
   let match;
   while ((match = fence.exec(markdown))) {
      const line = markdown.slice(0, match.index).split('\n').length;
      let block: unknown;
      try {
         block = parseYaml(match[1]);
      } catch (e) {
         throw new ConventionError(`Convention block at line ${line} is not valid YAML: ${(e as Error).message}`);
      }
      if (!isRecord(block)) throw new ConventionError(`Convention block at line ${line} must be a list of 'key: value' rules.`);
      for (const [key, value] of Object.entries(block)) {
         if (!KEYS.includes(key)) throw new ConventionError(`Unknown convention key '${key}' at line ${line}. Known keys: ${KEYS.join(', ')}.`);
         if (key in merged) throw new ConventionError(`Convention key '${key}' at line ${line} is already set in an earlier block.`);
         merged[key] = value;
      }
   }

   const missing = KEYS.filter(key => !(key in merged));
   if (missing.length) throw new ConventionError(`The convention does not set: ${missing.join(', ')}.`);

   const words = record(merged.words, 'words');
   const headings = record(merged.headings, 'headings');
   return {
      assignment: stringList(merged.assignment, 'assignment'),
      symbols: stringMap(merged.symbols, 'symbols'),
      words: {
         upperCaseLogic: bool(words.upperCaseLogic, 'words.upperCaseLogic'),
         endPrefixes: stringList(words.endPrefixes, 'words.endPrefixes'),
         letterTimes: words.letterTimes === false ? false : str(words.letterTimes, 'words.letterTimes'),
         superscriptPowers: bool(words.superscriptPowers, 'words.superscriptPowers'),
         bracketTuples: bool(words.bracketTuples, 'words.bracketTuples'),
         defineEndsByIndent: bool(words.defineEndsByIndent, 'words.defineEndsByIndent')
      },
      headings: Object.fromEntries(Object.entries(headings).map(([word, kind]) => {
         if (kind !== 'chart' && kind !== 'skip') throw new ConventionError(`Heading '${word}' must be 'chart' or 'skip', not '${kind}'.`);
         return [word.toLowerCase(), kind];
      })),
      commands: stringList(merged.commands, 'commands'),
      fileRead: { kinds: stringList(record(merged.fileRead, 'fileRead').kinds, 'fileRead.kinds') },
      phrases: stringList(merged.phrases, 'phrases').map(compilePhrase),
      builtins: Object.fromEntries(Object.entries(record(merged.builtins, 'builtins')).map(([name, arity]) => {
         if (!Number.isInteger(arity) || (arity as number) < 0) throw new ConventionError(`Builtin '${name}' needs a whole number of inputs.`);
         return [name, arity as number];
      }))
   };
}

// 'random real [number] from {low} to {high} -> randomreal(low, high)'
export function compilePhrase(source: string): Phrase {
   const arrow = source.lastIndexOf('->');
   if (arrow < 0) throw new ConventionError(`Phrase '${source}' needs '->' followed by what it means.`);
   const pattern = source.slice(0, arrow).trim();
   const result = source.slice(arrow + 2).trim();
   if (!pattern || !result) throw new ConventionError(`Phrase '${source}' needs words before '->' and a meaning after it.`);

   const pieces = pattern.match(/\\\[|\\\]|\{\w+\}|\[|\]|[(),]|[^\s\[\](),{}\\]+/g) ?? [];
   const captures: string[] = [];
   const stack: PhrasePart[][] = [[]];
   for (const piece of pieces) {
      const current = stack.at(-1)!;
      if (piece === '[') stack.push([]);
      else if (piece === ']') {
         if (stack.length === 1) throw new ConventionError(`Phrase '${source}' closes ']' without opening '['.`);
         const parts = stack.pop()!;
         stack.at(-1)!.push({ kind: 'optional', parts });
      }
      else if (piece.startsWith('{')) {
         const name = piece.slice(1, -1);
         if (captures.includes(name)) throw new ConventionError(`Phrase '${source}' uses {${name}} twice.`);
         captures.push(name);
         current.push({ kind: 'capture', name });
      }
      else current.push({ kind: 'word', options: (piece.startsWith('\\') ? piece.slice(1) : piece).split('|') });
   }
   if (stack.length !== 1) throw new ConventionError(`Phrase '${source}' opens '[' without closing ']'.`);
   const parts = stack[0];
   if (parts[0]?.kind !== 'word') throw new ConventionError(`Phrase '${source}' must start with a word.`);
   return { source, parts, result, captures };
}

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, key: string): Record<string, unknown> {
   if (!isRecord(value)) throw new ConventionError(`'${key}' must be a list of 'name: value' entries.`);
   return value;
}

function str(value: unknown, key: string): string {
   if (typeof value !== 'string' && typeof value !== 'number') throw new ConventionError(`'${key}' must be text.`);
   return String(value);
}

function bool(value: unknown, key: string): boolean {
   if (typeof value !== 'boolean') throw new ConventionError(`'${key}' must be true or false.`);
   return value;
}

function stringList(value: unknown, key: string): string[] {
   if (!Array.isArray(value)) throw new ConventionError(`'${key}' must be a list, like [a, b].`);
   return value.map((item, i) => str(item, `${key}[${i}]`));
}

function stringMap(value: unknown, key: string): Record<string, string> {
   return Object.fromEntries(Object.entries(record(value, key)).map(([k, v]) => [k, str(v, `${key}.${k}`)]));
}
