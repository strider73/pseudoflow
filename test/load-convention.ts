// Loads pseudocode-convention.md into the analyzer, as the app does at startup
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { conventionStore } from '../src/lib/stores';
import { loadConvention } from '../src/lib/convention/loader';

export const CONVENTION_PATH = join(import.meta.dirname, '..', 'pseudocode-convention.md');
export const convention = loadConvention(readFileSync(CONVENTION_PATH, 'utf8'));
conventionStore.set(convention);
