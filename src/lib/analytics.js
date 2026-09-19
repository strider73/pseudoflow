const UMAMI_HOST = 'https://analytics.binmatter.tools';
const WEBSITE_ID = '6c2925ec-cbea-45b5-bfcf-63deec2017f4';
const PROXIED_SCRIPT = '/analytics/script.js';

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

function trackPlatform() {
  if (typeof window.umami?.identify === 'function') {
    window.umami.identify({ platform: getPlatform() });
  } else if (window.umami) {
    window.umami.track('platform', { platform: 'unknown' });
  }
}

function injectTracker(src, onError) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.dataset.websiteId = WEBSITE_ID;
  script.onload = () => {
    if (window.umami) trackPlatform();
    else if (onError) onError();
  };
  if (onError) script.onerror = onError;
  document.head.appendChild(script);
}

if (window.umami) {
  trackPlatform();
} else if (import.meta.env.PROD && !isTauri()) {
  injectTracker(PROXIED_SCRIPT, () => injectTracker(`${UMAMI_HOST}/script.js`));
} else {
  injectTracker(`${UMAMI_HOST}/script.js`);
}
