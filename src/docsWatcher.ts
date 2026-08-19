export type DocsWatchResult = {
  checkedAt: number;
  hash: string;
  previousHash: string | null;
  changed: boolean;
  missing: string[];
};

const DOCS_URL = '/__max_docs/bridge';
const STORAGE_KEY = 'max-host-docs-hash';

export const KNOWN_HOST_METHODS = [
  'WebAppReady',
  'WebAppClose',
  'WebAppSetupBackButton',
  'WebAppBackButtonPressed',
  'WebAppSetupClosingBehavior',
  'WebAppOpenLink',
  'WebAppOpenMaxLink',
  'WebAppDownloadFile',
  'WebAppDeviceStorageSaveKey',
  'WebAppDeviceStorageGetKey',
  'WebAppDeviceStorageClear',
  'WebAppSecureStorageSaveKey',
  'WebAppSecureStorageGetKey',
  'WebAppSecureStorageClear',
  'WebAppHapticFeedbackImpact',
  'WebAppHapticFeedbackNotification',
  'WebAppHapticFeedbackSelectionChange',
  'WebAppGetViewportSize',
  'WebAppGetLaunchContext',
  'WebAppChangeScreenBrightness',
  'WebAppSetupScreenCaptureBehavior',
  'WebAppSetupSwipesBehavior',
  'WebAppShare',
  'WebAppMaxShare',
  'WebAppRequestPhone',
  'WebAppOpenCodeReader',
  'WebAppBiometryGetInfo',
  'WebAppBiometryRequestAccess',
  'WebAppBiometryUpdateToken',
  'WebAppBiometryRequestAuth',
  'WebAppBiometryOpenSettings',
  'WebAppNfcGetInfo',
  'WebAppNfcOpenSystemSettings',
  'WebAppNfcEmulateNfcTag',
];

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function watchDocs(): Promise<DocsWatchResult> {
  const response = await fetch(DOCS_URL, { cache: 'no-store' });
  const text = await response.text();
  const hash = await sha256(text);
  const previousHash = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, hash);

  const mentioned = new Set(
    [...text.matchAll(/WebApp[A-Za-z]+/g)].map(match => match[0]),
  );
  const missing = [...mentioned].filter(
    name =>
      name.startsWith('WebApp') &&
      !KNOWN_HOST_METHODS.includes(name) &&
      !['WebAppData', 'WebAppPlatform', 'WebAppVersion', 'WebAppDeviceName', 'WebAppStartParam'].includes(
        name,
      ),
  );

  return {
    checkedAt: Date.now(),
    hash,
    previousHash,
    changed: Boolean(previousHash && previousHash !== hash),
    missing: [...new Set(missing)].sort(),
  };
}
