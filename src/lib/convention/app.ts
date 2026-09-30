// Loads pseudocode-convention.md into the app. In dev mode (npm start) a change to the
// file is picked up at once; a desktop build carries the file as it was when built.
import conventionText from '../../../pseudocode-convention.md?raw';
import { conventionStore, conventionProblemStore } from '../stores';
import { loadConvention } from './loader';

// Returns why the convention could not be loaded, or null when it was
export function startConvention(): string | null {
   try {
      conventionStore.set(loadConvention(conventionText));
      return null;
   } catch (e) {
      return (e as Error).message;
   }
}

if (import.meta.hot) {
   import.meta.hot.accept('../../../pseudocode-convention.md?raw', module => {
      if (!module) return;
      try {
         conventionStore.set(loadConvention(module.default));
         conventionProblemStore.set(null);
      } catch (e) {
         // Keep the last rules that loaded, so a half-typed edit does not break the editor
         conventionProblemStore.set((e as Error).message);
      }
   });
}
