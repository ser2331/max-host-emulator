import type { Platform } from './types.ts';

export type StorageKind = 'device' | 'secure';

export const SECURE_KEY_LIMIT = 10;

const PREFIX = 'max-host-storage:';

function fullPrefix(platform: Platform, kind: StorageKind): string {
  return `${PREFIX}${platform}:${kind}:`;
}

function fullKey(platform: Platform, kind: StorageKind, key: string): string {
  return fullPrefix(platform, kind) + key;
}

export function storageGet(platform: Platform, kind: StorageKind, key: string): string | null {
  return localStorage.getItem(fullKey(platform, kind, key));
}

export function storageKeys(platform: Platform, kind: StorageKind): string[] {
  const prefix = fullPrefix(platform, kind);
  return Object.keys(localStorage)
    .filter(item => item.startsWith(prefix))
    .map(item => item.slice(prefix.length));
}

export function storageSet(
  platform: Platform,
  kind: StorageKind,
  key: string,
  value: string | null,
): { ok: true } | { ok: false; code: string } {
  const storedKey = fullKey(platform, kind, key);
  if (value === null) {
    localStorage.removeItem(storedKey);
    return { ok: true };
  }

  if (kind === 'secure') {
    const exists = localStorage.getItem(storedKey) !== null;
    if (!exists && storageKeys(platform, kind).length >= SECURE_KEY_LIMIT) {
      return { ok: false, code: 'client.secure_storage_save_key.quota_exceeded' };
    }
  }

  localStorage.setItem(storedKey, value);
  return { ok: true };
}

export function storageClear(platform: Platform, kind: StorageKind): void {
  const prefix = fullPrefix(platform, kind);
  Object.keys(localStorage)
    .filter(item => item.startsWith(prefix))
    .forEach(item => localStorage.removeItem(item));
}
