<script lang="ts">
   import { onMount } from "svelte";
    import { translationStore, defaultName, fileNameStore, flowchartDrawingStore, errorStore, syntaxErrorsStore, codeWordLang, codeWordStore, APP_VERSION } from "./lib/stores";
   import type * as atype from "./lib/analyzers/atypes"
   import Topbar from "./components/Topbar.svelte";
   import TabBar from "./components/TabBar.svelte";
   import type { EditorUndo } from "./lib/undo";
   import Editor from "./components/Editor.svelte";
   import Output from "./components/Output.svelte";
   import Chart from "./components/Chart.svelte";
   import ErrorPanel from "./components/ErrorPanel.svelte";
   import Modal from "./components/Modal.svelte";
   import SaveModal from "./components/modals/SaveModal.svelte";
   import SettingsModal from "./components/modals/SettingsModal.svelte";
   import InformationModal from "./components/modals/InformationModal.svelte";
    import LanguageMismatchModal from "./components/modals/LanguageMismatchModal.svelte";
   import FormatVersionModal from "./components/modals/FormatVersionModal.svelte";

   import { analyze } from "./lib/analyzers/analyze";
   import { interpreter, interpreterReset, addSentence } from "./lib/code/interpreter";
    import { parsePffFile, serializePffFile, createPffMeta, updatePffMeta, compareVersions, detectLanguage } from "./lib/pff";
    import type { PffMeta, ParseResult } from "./lib/pff";

    const isTauri = typeof import.meta.env.TAURI_PLATFORM !== 'undefined';
   
    let modal: any;
   let isProgramRunning: boolean = false;
   let isChartVisible: boolean = false;
   let enableUserInput: boolean;
   let pseudocode: string;
   let lastPseudocode: string;
   let savedPseudocode: string;
   let syntaxTree: object = { body: null };
   let outputText: string;
   let pendingSentencesToExecute: atype.SentencesNode[];
   let lastExecutedSentence: atype.SentencesNode;
   let timeoutToParse: any;
   let pffMeta: PffMeta | null = null;
    let showNewVersionWarning = false;
   let versionWarningTimer: any = null;
   let versionWarningCountdown = 0;

    let pointerStartX, rightColumnStartWidth;
    let editorRef: any;

   // Open documents. The active one lives in the page variables above
   // (pseudocode, savedPseudocode, pffMeta, fileNameStore); the others are parked here.
   type DocTab = {
      id: number,
      name: string,
      path: string | null,
      pseudocode: string,
      savedPseudocode: string,
      pffMeta: PffMeta | null,
      undo?: EditorUndo
   };
   let nextTabId = 1;
   let tabs: DocTab[] = [createTab()];
   let activeTabId = tabs[0].id;
   let tabPendingClose: number | null = null;

   $: syncActiveTab(pseudocode, savedPseudocode, pffMeta, $fileNameStore);
   // Must come after syncActiveTab so the tab bar sees the tab it just updated
   $: tabList = tabs.map(t => ({ id: t.id, name: t.name, path: t.path, modified: isModified(t) }));

   function createTab(): DocTab {
      return { id: nextTabId++, name: defaultName, path: null, pseudocode: '', savedPseudocode: '', pffMeta: null };
   }

   function isModified(tab: DocTab): boolean {
      return (tab.pseudocode || '') !== (tab.savedPseudocode || '');
   }

   function activeTab(): DocTab {
      return tabs.find(t => t.id === activeTabId)!;
   }

   function baseName(path: string): string {
      return path.split(/(\\|\/)/g).pop()!;
   }

   // Copy the page state into the active tab so the tab bar and switching see it
   function syncActiveTab(..._deps: unknown[]) {
      const tab = tabs?.find(t => t.id === activeTabId);
      if (!tab) return;
      tab.pseudocode = pseudocode || '';
      tab.savedPseudocode = savedPseudocode || '';
      tab.pffMeta = pffMeta;
      tab.name = $fileNameStore;
      tabs = tabs;
   }

   function switchTab(id: number) {
      if (id === activeTabId || !tabs.some(t => t.id === id)) return;
      syncActiveTab();
      const current = activeTab();
      const target = tabs.find(t => t.id === id)!;

      // Stop anything running for the tab being left
      isProgramRunning = false;
      enableUserInput = false;
      interpreterReset();
      outputText = '';
      clearTimeout(timeoutToParse);
      clearInterval(versionWarningTimer);
      showNewVersionWarning = false;

      if (editorRef) current.undo = editorRef.swapUndo(target.undo);
      activeTabId = id;
      pffMeta = target.pffMeta;
      savedPseudocode = target.savedPseudocode;
      pseudocode = target.pseudocode;
      fileNameStore.set(target.name);
      lastPseudocode = '';
      syntaxTree = { body: null };
      errorStore.set([]);
      generateTree();
   }

   function newTab() {
      syncActiveTab();
      const tab = createTab();
      tabs = [...tabs, tab];
      switchTab(tab.id);
   }

   function cycleTab(step: number) {
      const index = tabs.findIndex(t => t.id === activeTabId);
      switchTab(tabs[(index + step + tabs.length) % tabs.length].id);
   }

   // Opens a file in its own tab; an already open file just gets focused, and an
   // empty untitled tab is reused instead of leaving it behind
   function openInTab(rawText: string, path: string | null, fileName: string) {
      syncActiveTab();
      const existing = path ? tabs.find(t => t.path === path) : undefined;
      if (existing) {
         switchTab(existing.id);
         return;
      }
      const current = activeTab();
      const reusable = current.path === null && !current.pseudocode && !isModified(current);
      if (!reusable) newTab();
      loadFileContent(rawText, fileName);
      activeTab().name = fileName;
      activeTab().path = path;
      if (path) lastFolder = path.slice(0, path.length - baseName(path).length);
      tabs = tabs;
   }

   function closeTab(id: number) {
      syncActiveTab();
      const tab = tabs.find(t => t.id === id);
      if (!tab) return;
      if (isModified(tab)) {
         switchTab(id);
         tabPendingClose = id;
         modal = {
            titleKey: 'APP_SAVE_TITLE',
            component: SaveModal,
            saveDialog: true
         };
         return;
      }
      removeTab(id);
   }

   function removeTab(id: number) {
      const index = tabs.findIndex(t => t.id === id);
      if (index < 0) return;
      if (tabs.length === 1) {
         const fresh = createTab();
         tabs = [...tabs, fresh];
         switchTab(fresh.id);
      }
      else if (id === activeTabId) {
         const neighbour = tabs[index + 1] ?? tabs[index - 1];
         switchTab(neighbour.id);
      }
      tabs = tabs.filter(t => t.id !== id);
   }

    function handleWindowKeydown(event: KeyboardEvent) {
       clearTimeout(timeoutToParse);
       timeoutToParse = setTimeout(generateTree, 350);

       if (event.ctrlKey && event.code === 'Tab') {
          event.preventDefault();
          cycleTab(event.shiftKey ? -1 : 1);
       } else if (event.code === 'F5') {
          event.preventDefault();
          if (!isProgramRunning) {
             isProgramRunning = true;
             prepareExecution();
          }
       } else if (event.code === 'Escape' && isProgramRunning) {
          interpreterReset();
          enableUserInput = false;
          isProgramRunning = false;
       } else if (event.code === 'Escape' && modal) {
          closeModal();
       }
    }

   // Re-parse when pseudocode language changes
   codeWordStore.subscribe(() => {
      lastPseudocode = '';
      clearTimeout(timeoutToParse);
      timeoutToParse = setTimeout(generateTree, 350);
   });

   // Generate tree and perform pre-execution tasks on run button press
    function prepareExecution() {
       generateTree()
       if ($syntaxErrorsStore && $errorStore.some(e => e.type === 'syntax')) {
         isProgramRunning = false;
         return;
      }
      outputText = "<div class=\"hl-comments\">" + $translationStore.APP_PROGRAM_STARTED + " ***</div>";
      interpreterReset();
      execute(syntaxTree['body']);
   }

   // Generate syntax tree for code interpretation and flowchart visualization
   function generateTree() {
      if (pseudocode && pseudocode !== lastPseudocode) {
         lastPseudocode = pseudocode;
         const result = analyze(pseudocode);
         syntaxTree = result.program ?? { body: null };
         errorStore.set(result.errors);
      }
   }

   // Run program using interpreter, store progress in case of interruption
   function execute(sentences?: atype.SentencesNode[]) {
      const execution = interpreter(sentences);
      outputText += execution.prints;
      enableUserInput = execution.interruptedForInput;
      pendingSentencesToExecute = execution.pendingSentences;
      lastExecutedSentence = execution.lastNode;

      if (!enableUserInput && !pendingSentencesToExecute.length) {
         outputText += "<div class=\"hl-comments\">" + $translationStore.APP_PROGRAM_END + " ***</div>";
      }
   }

   // Insert assignment node into the tree using the value captured from the user
    function capturedMessage(e: CustomEvent<{text: string}>) {
       const value = e.detail.text? e.detail.text : false;
      enableUserInput = false;
      addSentence({ 
         name: 'AssignmentNode', 
         identifier: { name: 'IdentifierNode', value: lastExecutedSentence['identifier'].value }, 
         value: { name: 'StringNode', value: value as string } 
      }, 0)

      outputText += "<span class=\"hl-read\" style=\"opacity: 0.5\">" + e.detail.text.replaceAll(' ', '&nbsp;') + "</span><br>";
      execute();
   }

   // Parse file content, handle language/version checks, load into editor
   function loadFileContent(rawText: string, fileName: string) {
      const parsed = parsePffFile(rawText);
      pffMeta = parsed.meta;
      pseudocode = parsed.content;
      savedPseudocode = pseudocode;
      clearInterval(versionWarningTimer);
      showNewVersionWarning = false;
      fileNameStore.set(fileName);
      editorRef?.resetUndo();
      generateTree();

      if (parsed.oldFormat) {
         modal = {
            component: FormatVersionModal,
         };
         return;
      }

      if (!parsed.meta) {
         const detected = detectLanguage(parsed.content);
         if (detected && detected !== codeWordLang) {
            modal = {
               component: LanguageMismatchModal,
               componentProps: { fileLang: detected }
            };
         }
      }

      if (parsed.meta && parsed.meta.lang !== codeWordLang) {
         modal = {
            component: LanguageMismatchModal,
            componentProps: { fileLang: parsed.meta.lang }
         };
      }

      if (parsed.meta && compareVersions(parsed.meta.version, APP_VERSION) > 0) {
         showNewVersionWarning = true;
         versionWarningCountdown = 30;
         clearInterval(versionWarningTimer);
         versionWarningTimer = setInterval(() => {
            versionWarningCountdown -= 1;
            if (versionWarningCountdown <= 0) {
               clearInterval(versionWarningTimer);
               showNewVersionWarning = false;
            }
         }, 1000);
      }
   }

   // Import code from a file using an input element in HTML
    function importDataFromFile(e: Event) {
        const target = e.target as HTMLInputElement;
       if (!target.files || !target.files[0]) return;
       const fileName = target.files[0].name;

       const reader = new FileReader();
		reader.addEventListener("load", (event) => {
          openInTab(event.target.result.toString(), null, fileName);
		});
		reader.readAsText(e.target.files[0], "UTF-8");
    }

   // Folder of the active file, or of the last file opened or saved
   let lastFolder = '';
   function currentFolder(): string {
      const path = activeTab().path;
      return path ? path.slice(0, path.length - baseName(path).length) : lastFolder;
   }

   // Handle "New file" button in top bar: ask for a name in the current folder,
   // create the empty file there and open it in a new tab
   async function newButtonClick() {
      if (!isTauri) {
         newTab();
         return;
      }
      try {
         const { save } = await import("@tauri-apps/api/dialog");
         const { invoke } = await import("@tauri-apps/api/tauri");
         let filePath = await save({
            defaultPath: currentFolder() + 'untitled.pff',
            filters: [{ name: 'PseudoFlow', extensions: ['pff'] }]
         });
         if (!filePath) return;
         if (!/\.pff$/i.test(filePath)) filePath += '.pff';
         const fileContents = serializePffFile(createPffMeta(codeWordLang, APP_VERSION), '');
         await invoke('save_file', { path: filePath, contents: fileContents });
         openInTab(fileContents, filePath, baseName(filePath));
      } catch (err) {
         console.error('Tauri API error:', err);
      }
   }

   // Handle "Open" button in top bar
   function importButtonClick() {
      if (isTauri) {
          import("@tauri-apps/api/dialog").then(async ({ open }) => {
            const { readTextFile } = await import("@tauri-apps/api/fs");
            const selected = await open({ defaultPath: currentFolder() || undefined, multiple: true });
            const filePaths = selected === null ? [] : Array.isArray(selected) ? selected : [selected];
            for (const filePath of filePaths) {
               const data = await readTextFile(filePath);
               openInTab(data.toString(), filePath, baseName(filePath));
            }
          }).catch(err => console.error('Tauri API error:', err));
      } else {
         document.getElementById("file-import").click();
      }
   }

   // Files opened from Finder (double-click, "Open With") are queued by the
   // native side until the page is ready to take them
   onMount(() => {
      let unlisten: (() => void) | undefined;
      const restoring = restoreSession();
      if (!isTauri) return;
      import("@tauri-apps/api/event").then(async ({ listen }) => {
         await restoring;
         unlisten = await listen('opened-files', () => openQueuedFiles());
         openQueuedFiles();
      }).catch(err => console.error('Tauri API error:', err));
      return () => unlisten?.();
   });

   // Open tabs are kept in localStorage as they change, so they come back even
   // if the app was killed rather than closed
   const SESSION_KEY = 'pseudoflow-session';
   type SavedTab = Pick<DocTab, 'name' | 'path' | 'pseudocode' | 'savedPseudocode' | 'pffMeta'>;
   let sessionRestored = false;
   let sessionTimer: any;

   $: scheduleSessionSave(tabList, activeTabId);

   function scheduleSessionSave(..._deps: unknown[]) {
      if (!sessionRestored) return;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(saveSession, 300);
   }

   function saveSession() {
      try {
         const saved: SavedTab[] = tabs.map(({ name, path, pseudocode, savedPseudocode, pffMeta }) =>
            ({ name, path, pseudocode, savedPseudocode, pffMeta }));
         const active = tabs.findIndex(t => t.id === activeTabId);
         localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: saved, active }));
      } catch (err) {
         console.error('Could not save session:', err);
      }
   }

   async function restoreSession() {
      try {
         const raw = localStorage.getItem(SESSION_KEY);
         const session = raw ? JSON.parse(raw) : null;
         if (!session || !Array.isArray(session.tabs) || session.tabs.length === 0) return;

         const restored: DocTab[] = [];
         let active = 0;
         for (const [index, saved] of (session.tabs as SavedTab[]).entries()) {
            const tab: DocTab = { ...createTab(), ...saved };
            // A file with no unsaved edits is read again in case it changed on disk
            if (isTauri && tab.path && !isModified(tab)) {
               try {
                  const { readTextFile } = await import("@tauri-apps/api/fs");
                  const parsed = parsePffFile(await readTextFile(tab.path));
                  tab.pseudocode = tab.savedPseudocode = parsed.content;
                  tab.pffMeta = parsed.meta;
               } catch {
                  continue; // the file is gone
               }
            }
            if (index === session.active) active = restored.length;
            restored.push(tab);
         }
         // Skip if nothing survived or a file was opened while restoring
         if (restored.length === 0 || tabs.length > 1 || activeTab().pseudocode) return;

         const target = restored[active];
         tabs = restored;
         activeTabId = target.id;
         pffMeta = target.pffMeta;
         savedPseudocode = target.savedPseudocode;
         pseudocode = target.pseudocode;
         fileNameStore.set(target.name);
         if (target.path) lastFolder = target.path.slice(0, target.path.length - baseName(target.path).length);
         editorRef?.resetUndo();
         lastPseudocode = '';
         generateTree();
      } catch (err) {
         console.error('Could not restore session:', err);
      } finally {
         sessionRestored = true;
         saveSession();
      }
   }

   async function openQueuedFiles() {
      try {
         const { invoke } = await import("@tauri-apps/api/tauri");
         const paths = await invoke<string[]>('take_opened_files');
         const { readTextFile } = await import("@tauri-apps/api/fs");
         for (const filePath of paths) {
            const data = await readTextFile(filePath);
            openInTab(data.toString(), filePath, baseName(filePath));
         }
      } catch (err) {
         console.error('Could not open file:', err);
      }
   }

   // Handle "Save" button in top bar. A tab with a known file is saved in place;
   // otherwise (or after renaming it in the file box) a save dialog asks where.
   async function exportButtonClick(): Promise<boolean> {
      const tab = activeTab();
      // Read contenteditable directly so an immediate click cannot save stale bound text.
      const contentAtSave = editorRef?.getCurrentText() ?? pseudocode;
      if (contentAtSave !== pseudocode) pseudocode = contentAtSave;
      const contentChanged = contentAtSave !== savedPseudocode;
      let meta: PffMeta;
      if (pffMeta) {
         meta = contentChanged ? updatePffMeta(pffMeta, APP_VERSION) : pffMeta;
      } else {
         meta = createPffMeta(codeWordLang, APP_VERSION);
      }
      const fileContents = serializePffFile(meta, contentAtSave);

      if (isTauri) {
         try {
            const { invoke } = await import("@tauri-apps/api/tauri");
            let filePath = tab.path && baseName(tab.path) === $fileNameStore ? tab.path : null;
            if (!filePath) {
               const { save } = await import("@tauri-apps/api/dialog");
               const folder = tab.path ? tab.path.slice(0, tab.path.length - baseName(tab.path).length) : '';
               filePath = await save({ defaultPath: folder + $fileNameStore });
            }
            if (!filePath) return false;
            await invoke('save_file', { path: filePath, contents: fileContents });

            // The user may have switched tabs while the dialog was open
            tab.path = filePath;
            lastFolder = filePath.slice(0, filePath.length - baseName(filePath).length);
            if (tab.id === activeTabId) {
               fileNameStore.set(baseName(filePath));
               savedPseudocode = contentAtSave;
               pffMeta = meta;
            } else {
               tab.name = baseName(filePath);
               tab.savedPseudocode = contentAtSave;
               tab.pffMeta = meta;
            }
            tabs = tabs;
            return true;
         } catch (err) {
            console.error('Tauri API error:', err);
            return false;
         }
      }
      let textBlob = new Blob([fileContents], {type: 'text/plain'});
      let tempLink = document.createElement("a");
      tempLink.setAttribute('href', URL.createObjectURL(textBlob));
      tempLink.setAttribute('download', $fileNameStore);
      tempLink.click();
      tempLink.remove();
      URL.revokeObjectURL(tempLink.href);
      savedPseudocode = contentAtSave;
      pffMeta = meta;
      return true;
   }

   // Handle "Run" button in top bar
   function runButtonClick(running: boolean) {
      if (running) {
         prepareExecution();
      }
      else {
         interpreterReset();
         enableUserInput = false;
      }
   }

   // Handle "Settings" button in top bar
   function settingsButtonClick() {
      modal = {
         titleKey: 'APP_SETTINGS_TITLE',
         component: SettingsModal
      };
   }

    // Handle "Information" button in top bar
    function infoButtonClick() {
       modal = {
          titleKey: 'APP_INFO_TITLE',
          component: InformationModal
       };
    }

    function undoClick() { editorRef?.undoAction(); }
    function redoClick() { editorRef?.redoAction(); }

   // Used in save-warning-dialog modal when closing a tab with unsaved changes
   async function saveAndClose() {
      const id = tabPendingClose;
      closeModal();
      if (id !== null && await exportButtonClick()) {
         removeTab(id);
      }
   }

   // Used in save-warning-dialog modal: close the tab without saving
   function closeAndNew() {
      const id = tabPendingClose;
      closeModal();
      if (id !== null) removeTab(id);
   }

   function closeModal() {
      modal = undefined;
      tabPendingClose = null;
   }

   function startResizing(event) {
      pointerStartX = event.clientX;
      rightColumnStartWidth = document.getElementById('flowchart-area').offsetWidth;
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResizing);
      document.body.classList.add('no-select');
   }

   function resize(event) {
      const currentX = event.clientX;
      const deltaX = currentX - pointerStartX;
      const rightColumnWidth = Math.max(rightColumnStartWidth - deltaX, 300);
      const leftColumnWidth = document.getElementById('wrapper').offsetWidth - rightColumnWidth;

      document.getElementById('flowchart-area').style.width = `${rightColumnWidth}px`;
      document.getElementById('resizer').style.right = `${rightColumnWidth}px`;
      document.getElementById('text-area').style.width = `${leftColumnWidth}px`;
      document.getElementById('output-area').style.width = `${leftColumnWidth}px`;
   }

   function stopResizing() {
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResizing);
      document.body.classList.remove('no-select');
   }

</script>

<svelte:window on:keydown={handleWindowKeydown} />

<Topbar 
   onRunButtonClick={runButtonClick}
   onNewButtonClick={newButtonClick}
   onImportButtonClick={importButtonClick}
   onExportButtonClick={exportButtonClick}
   onSettingsButtonClick={settingsButtonClick}
   onInfoButtonClick={infoButtonClick}
   onUndoClick={undoClick}
   onRedoClick={redoClick}
   bind:isProgramRunning={isProgramRunning}
   bind:isChartVisible={isChartVisible} />

<TabBar
   tabs={tabList}
   activeTabId={activeTabId}
   onSelect={switchTab}
   onClose={closeTab}
   onNew={newTab} />

{#if showNewVersionWarning}
<div id="version-warning">
   <span>{$translationStore.APP_FILE_NEW_VERSION}</span>
   <span class="right-group">
      <span class="countdown">{versionWarningCountdown}s</span>
      <span class="close" role="button" tabindex="0" on:click={() => { clearInterval(versionWarningTimer); showNewVersionWarning = false; }} on:keydown={() => { clearInterval(versionWarningTimer); showNewVersionWarning = false; }}>&times;</span>
   </span>
</div>
{/if}

<div id="wrapper" on:mousedown={generateTree}>
   {#if $flowchartDrawingStore}
   <div id="flowchart-area" class:active={isChartVisible}>
      <Chart syntaxTree="{syntaxTree['body']}"></Chart>
   </div>
   {/if}
   <div id="output-area" class:active="{isProgramRunning}" class:twoColumnLayout="{$flowchartDrawingStore}">
      <Output content="{outputText}" isInputPromptEnabled="{enableUserInput}" on:message={capturedMessage} />
   </div>
   <div id="resizer" on:mousedown={startResizing}></div>
   <div id="text-area" class:twoColumnLayout="{$flowchartDrawingStore}">
      <Editor bind:editorText={pseudocode} bind:this={editorRef} />
      <ErrorPanel />
   </div>
</div>

<input type="file" id="file-import" on:change={importDataFromFile} />

{#if modal} 
<Modal title="{modal.titleKey ? $translationStore[modal.titleKey] : ''}" component="{modal.component}" saveDialog="{modal.saveDialog}" componentProps="{modal.componentProps || {}}"
   on:closeModal="{closeModal}"
   on:saveAndClose="{saveAndClose}"
   on:closeAndNew="{closeAndNew}"></Modal> 
{/if}

<style lang="scss">
   @use "./styles/variables.scss" as *;

   #version-warning {
      height: 2rem;
      background: $accent-color;
      color: black;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 1rem;
      font-size: 0.85rem;

      .right-group {
         display: flex;
         align-items: center;
         gap: 0.5rem;
      }

      .countdown {
         opacity: 0.7;
         font-size: 0.8rem;
      }

      .close {
         cursor: pointer;
         font-size: 1.2rem;
         line-height: 1;
         padding: 0 0.3rem;
      }
   }

   #wrapper {
      height: calc(100% - $topbar-height - $tabbar-height);
      background: $editor-background;
      overflow: hidden;

      #resizer {
         width: 8px;
         height: calc(100vh - $topbar-height - $tabbar-height);
         cursor: ew-resize;
         border-right: 1px solid $accent-color;
         position: absolute;
         right: 40%;
         z-index: 10;
         opacity: 0;
         transition: opacity 0.4s;
         
         &:hover, &:active {
            opacity: 1;
         }
      }

      #text-area {
         display: flex;
         width: 100%;
         max-width: 100%;
         flex-direction: column;
         background-color: $editor-background;
         height: calc(100vh - $topbar-height - $tabbar-height);
         overflow: hidden;
         position: absolute;

         &.twoColumnLayout {
            @media screen and (min-width: $breakpoint) {
               width: 60%;
            }
         }
      }

      #output-area {
         width: 100%;
         max-width: 100%;
         height: calc(100% - $topbar-height - $tabbar-height);
         background-color: $flowchart-background;
          color: var(--color-text-primary, white);
          position: absolute;
           left: 0;
         transform: translateX(100vw);
         transition: all 0.2s;
         overflow-y: auto;
         z-index: 2;
         opacity: 0;
         
         &.active {
            opacity: 1;
            transform: translateX(0%);
         }

         &.twoColumnLayout {
            @media screen and (min-width: $breakpoint) {
               width: 60%;
            }
         }
      }

       #flowchart-area {
          width: 100%;
          max-width: 100%;
          min-width: 300px;
          height: calc(100% - $topbar-height - $tabbar-height);
          background-color: $flowchart-background;
          color: var(--color-text-primary, white);
          border-left: 1px solid $editor-background;
          position: absolute;
          right: 0;
          z-index: 0;
          overflow: hidden;

         &.active {
            z-index: 3;
         }

         @media screen and (min-width: $breakpoint) {
            width: 40%;
            z-index: 3;
         }
      }
   }

   #file-import {
      position: absolute;
      left: -9999px;
      top: -9999px;
   }
</style>
