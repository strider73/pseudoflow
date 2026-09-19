/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Umami {
   track(eventName: string, data?: Record<string, unknown>): void;
   identify(data: Record<string, unknown>): void;
}

interface Window {
   umami?: Umami;
}
