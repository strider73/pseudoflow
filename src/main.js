import './styles/base.scss';
import './lib/analytics';
import App from './App.svelte';
import { APP_VERSION } from './lib/version';
import { startConvention } from './lib/convention/app';

document.title = `Pseudoflow-MelUni v${APP_VERSION}`;

// The rules the editor checks code against come from pseudocode-convention.md
const conventionProblem = startConvention();
if (conventionProblem) {
   document.getElementById('app').textContent = 'pseudocode-convention.md could not be loaded: ' + conventionProblem;
}

const app = conventionProblem ? null : new App({
   target: document.getElementById('app')
});

export default app;
