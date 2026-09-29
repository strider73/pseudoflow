<script lang="ts">
   import { translationStore } from "../lib/stores";

   export let tabs: { id: number, name: string, path: string | null, modified: boolean }[] = [];
   export let activeTabId: number;
   export let onSelect: (id: number) => void = () => {};
   export let onClose: (id: number) => void = () => {};
   export let onNew: () => void = () => {};

   function closeClick(e: MouseEvent, id: number) {
      e.stopPropagation();
      onClose(id);
   }

   // Middle click closes a tab, as in browsers
   function mouseUp(e: MouseEvent, id: number) {
      if (e.button === 1) onClose(id);
   }
</script>

<div id="tabbar">
   {#each tabs as tab (tab.id)}
      <div
         class="tab"
         class:active={tab.id === activeTabId}
         title={tab.path || tab.name}
         role="tab"
         tabindex="0"
         aria-selected={tab.id === activeTabId}
         on:click={() => onSelect(tab.id)}
         on:mouseup={e => mouseUp(e, tab.id)}
         on:keydown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(tab.id); }}
      >
         <span class="name">{tab.name}</span>
         <span
            class="close"
            class:modified={tab.modified}
            role="button"
            tabindex="-1"
            title={$translationStore.APP_TAB_CLOSE}
            on:click={e => closeClick(e, tab.id)}
            on:keydown={() => {}}
         >
            <span class="dot">&#9679;</span>
            <span class="x">&times;</span>
         </span>
      </div>
   {/each}
   <div class="new" role="button" tabindex="0" title={$translationStore.APP_TAB_NEW}
      on:click={onNew} on:keydown={e => { if (e.key === 'Enter' || e.key === ' ') onNew(); }}>+</div>
</div>

<style lang="scss">
   @use "../styles/variables.scss" as *;

   #tabbar {
      height: $tabbar-height;
      width: 100vw;
      display: flex;
      align-items: flex-end;
      background-color: $surface-background;
      border-bottom: 1px solid $border-color;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;

      &::-webkit-scrollbar {
         display: none;
      }
   }

   .tab {
      height: calc(100% - 4px);
      max-width: 14rem;
      min-width: 6rem;
      padding: 0 0.4rem 0 0.8rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-shrink: 0;
      color: $linenumbers-foreground;
      font-size: 0.8rem;
      cursor: pointer;
      border-right: 1px solid $border-color;
      border-radius: 0.4rem 0.4rem 0 0;
      user-select: none;

      &:hover {
         color: $fileinfo-foreground;
      }

      &.active {
         background-color: $editor-background;
         color: $fileinfo-foreground;
         box-shadow: inset 0 2px 0 $accent-color;
      }

      .name {
         flex: 1;
         overflow: hidden;
         text-overflow: ellipsis;
         white-space: nowrap;
      }
   }

   // Shows a dot for unsaved changes, turning into × on hover
   .close {
      width: 1.2rem;
      height: 1.2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.3rem;
      font-size: 1rem;
      line-height: 1;

      .dot {
         display: none;
         font-size: 0.6rem;
      }

      .x {
         visibility: hidden;
      }

      &.modified {
         .dot { display: inline; }
         .x { display: none; }
      }

      &:hover {
         background-color: $border-color;

         .dot { display: none; }
         .x { display: inline; visibility: visible; }
      }
   }

   .tab:hover .close .x,
   .tab.active .close .x {
      visibility: visible;
   }

   .new {
      height: 100%;
      padding: 0 0.8rem;
      display: flex;
      align-items: center;
      color: $linenumbers-foreground;
      font-size: 1.2rem;
      cursor: pointer;
      flex-shrink: 0;

      &:hover {
         color: $accent-color;
      }
   }
</style>
