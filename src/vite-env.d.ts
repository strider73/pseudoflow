/// <reference types="svelte" />
/// <reference types="vite/client" />

interface Umami {
   track(): void;
   track(eventName: string, data?: Record<string, unknown>): void;
   identify(id: string, data?: Record<string, unknown>): void;
   identify(data: Record<string, unknown>): void;
}

interface Window {
   umami?: Umami;
}
