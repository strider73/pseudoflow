const port = process.argv[2] ?? '9223';
const pages = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
const page = pages.find(candidate => candidate.type === 'page' && candidate.url.includes('127.0.0.1:4179'));
if (!page) throw new Error('PseudoFlow page not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const handlers = pending.get(message.id);
  if (!handlers) return;
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(JSON.stringify(message.error)));
  else handlers.resolve(message.result);
});

function call(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function setFile(path) {
  const input = await call('Runtime.evaluate', { expression: `document.querySelector('#file-import')` });
  if (!input.result.objectId) {
    const pageState = await evaluate(`({ url: location.href, title: document.title, text: document.body?.innerText })`);
    throw new Error(`File input not found: ${JSON.stringify(pageState)}`);
  }
  const description = await call('DOM.describeNode', { objectId: input.result.objectId });
  await call('DOM.setFileInputFiles', {
    backendNodeId: description.node.backendNodeId,
    files: [path],
  });
  await new Promise(resolve => setTimeout(resolve, 250));
}

function snapshot() {
  return evaluate(`(() => ({
    tabs: [...document.querySelectorAll('.tab')].map(tab => ({
      name: tab.querySelector('.name')?.textContent,
      active: tab.classList.contains('active'),
      modified: tab.querySelector('.close')?.classList.contains('modified'),
    })),
    fileName: document.querySelector('#file-name')?.value ?? document.querySelector('input[type="text"]')?.value,
    editor: document.querySelector('#editor-editable-area')?.innerText,
  }))()`);
}

await call('Runtime.enable');
await call('DOM.enable');
await call('Page.reload', { ignoreCache: true });
await new Promise(resolve => setTimeout(resolve, 500));
await setFile(`${process.cwd()}/test/valid-en.pff`);
await setFile(`${process.cwd()}/test/legacy-plain.pff`);
await setFile(`${process.cwd()}/test/content-with-separator.pff`);
const before = await snapshot();
await evaluate(`document.querySelectorAll('.tab')[0].click()`);
await new Promise(resolve => setTimeout(resolve, 250));
const after = await snapshot();
console.log(JSON.stringify({ before, after }, null, 2));
socket.close();
