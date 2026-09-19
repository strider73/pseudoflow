const UMAMI_HOST = 'https://analytics.binmatter.tools';
const WEBSITE_ID = '6c2925ec-cbea-45b5-bfcf-63deec2017f4';
const PROXIED_SCRIPT = '/analytics/script.js';
const VISITOR_ID_KEY = 'pseudoflow.analytics.id';

function isTauri() {
  return typeof import.meta.env.TAURI_PLATFORM !== 'undefined';
}

function isDev() {
  return import.meta.env.DEV || import.meta.env.TAURI_DEBUG === 'true';
}

function getPlatform() {
  if (isDev()) return 'dev';
  if (!isTauri()) return 'web';

  const platform = import.meta.env.TAURI_PLATFORM;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'mac';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

function randomId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function getVisitorId() {
  try {
    const stored = localStorage.getItem(VISITOR_ID_KEY);
    if (stored) return stored;

    const id = randomId();
    localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

function initAnalytics() {
  if (!window.umami) return;

  if (typeof window.umami.identify === 'function') {
    window.umami.identify(getVisitorId(), { platform: getPlatform() });
  } else {
    window.umami.track('platform', { platform: 'unknown' });
  }

  window.umami.track();
}

function injectTracker(src, onError) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.dataset.websiteId = WEBSITE_ID;
  script.dataset.autoPageview = 'false';
  script.onload = () => {
    if (window.umami) initAnalytics();
    else if (onError) onError();
  };
  if (onError) script.onerror = onError;
  document.head.appendChild(script);
}

if (window.umami) {
  initAnalytics();
} else if (import.meta.env.PROD && !isTauri()) {
  injectTracker(PROXIED_SCRIPT, () => injectTracker(`${UMAMI_HOST}/script.js`));
} else {
  injectTracker(`${UMAMI_HOST}/script.js`);
}
