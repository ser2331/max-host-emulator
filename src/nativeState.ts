import type { Platform } from './types.ts';
import { getProfile } from './platforms.ts';

export type BiometryInfo = {
  available: boolean;
  accessRequested: boolean;
  accessGranted: boolean;
  type: string[];
  tokenSaved: boolean;
  deviceId: string | null;
};

export type NfcInfo = {
  available: boolean;
  enabled: boolean;
  accessRevoked: boolean;
};

const biometry = new Map<Platform, BiometryInfo>();
const nfc = new Map<Platform, NfcInfo>();
const biometricTokens = new Map<Platform, string>();

function biometryType(platform: Platform): string[] {
  if (platform === 'ios') return ['face'];
  if (platform === 'android') return ['unknown'];
  return ['unknown'];
}

export function getBiometry(platform: Platform): BiometryInfo {
  const existing = biometry.get(platform);
  if (existing) return { ...existing };

  const available = getProfile(platform).capabilities.biometric;
  const state: BiometryInfo = {
    available,
    accessRequested: false,
    accessGranted: false,
    type: biometryType(platform),
    tokenSaved: false,
    deviceId: available ? `max-host-${platform}` : null,
  };
  biometry.set(platform, state);
  return { ...state };
}

export function patchBiometry(platform: Platform, patch: Partial<BiometryInfo>): BiometryInfo {
  const next = { ...getBiometry(platform), ...patch };
  biometry.set(platform, next);
  return { ...next };
}

export function getBiometricToken(platform: Platform): string | null {
  return biometricTokens.get(platform) ?? null;
}

export function setBiometricToken(platform: Platform, token: string): BiometryInfo {
  if (token) biometricTokens.set(platform, token);
  else biometricTokens.delete(platform);
  return patchBiometry(platform, { tokenSaved: token !== '' });
}

export function getNfc(platform: Platform): NfcInfo {
  const existing = nfc.get(platform);
  if (existing) return { ...existing };

  const available = getProfile(platform).capabilities.nfc;
  const state: NfcInfo = {
    available,
    enabled: false,
    accessRevoked: false,
  };
  nfc.set(platform, state);
  return { ...state };
}

export function patchNfc(platform: Platform, patch: Partial<NfcInfo>): NfcInfo {
  const next = { ...getNfc(platform), ...patch };
  nfc.set(platform, next);
  return { ...next };
}

export function resetNativeState(platform?: Platform): void {
  const platforms: Platform[] = platform ? [platform] : ['web', 'ios', 'android', 'desktop'];
  for (const item of platforms) {
    biometry.delete(item);
    nfc.delete(item);
    biometricTokens.delete(item);
  }
}
