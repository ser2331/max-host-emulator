import type { Platform } from './types.ts';

export type Capability =
  | 'deviceStorage'
  | 'secureStorage'
  | 'haptic'
  | 'shareContent'
  | 'shareMaxContent'
  | 'biometric'
  | 'nfc'
  | 'brightness'
  | 'screenCapture'
  | 'swipes'
  | 'launchContext'
  | 'codeReader'
  | 'requestPhone';

export type PlatformProfile = {
  platform: Platform;
  label: string;
  version: string;
  deviceName: string;
  capabilities: Record<Capability, boolean>;
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  deviceStorage: 'DeviceStorage',
  secureStorage: 'SecureStorage',
  haptic: 'Haptic',
  shareContent: 'Share',
  shareMaxContent: 'Share MAX',
  biometric: 'Biometric',
  nfc: 'NFC',
  brightness: 'Brightness',
  screenCapture: 'Screenshot',
  swipes: 'Swipes',
  launchContext: 'Launch context',
  codeReader: 'QR',
  requestPhone: 'Телефон',
};

const CAPABILITY_ORDER: Capability[] = [
  'deviceStorage',
  'secureStorage',
  'haptic',
  'shareContent',
  'shareMaxContent',
  'biometric',
  'nfc',
  'brightness',
  'screenCapture',
  'swipes',
  'launchContext',
  'codeReader',
  'requestPhone',
];

const none: Record<Capability, boolean> = {
  deviceStorage: false,
  secureStorage: false,
  haptic: false,
  shareContent: false,
  shareMaxContent: false,
  biometric: false,
  nfc: false,
  brightness: false,
  screenCapture: false,
  swipes: false,
  launchContext: false,
  codeReader: false,
  requestPhone: false,
};

function hostIsMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
}

function caps(enabled: Capability[]): Record<Capability, boolean> {
  const next = { ...none };
  for (const capability of enabled) next[capability] = true;
  return next;
}

export const PROFILES: Record<Platform, PlatformProfile> = {
  web: {
    platform: 'web',
    label: 'web — браузер',
    version: '26.20.0',
    deviceName: hostIsMac() ? 'Chrome, macOS' : 'Chrome, Windows',
    // В MAX Host эмуляторе миниаппы ожидают DeviceStorage.
    // Поэтому пробрасываем device/secure storage и для web-профиля.
    capabilities: caps(['deviceStorage', 'secureStorage', 'shareMaxContent', 'requestPhone']),
  },
  desktop: {
    platform: 'desktop',
    label: 'desktop — Windows',
    version: '26.20.0',
    deviceName: hostIsMac()
      ? 'MAX Host, macOS Tahoe (26.6)'
      : 'MAX Host, Windows 11 Version 25H2',
    capabilities: caps([
      'deviceStorage',
      'secureStorage',
      'shareMaxContent',
      'screenCapture',
      'codeReader',
      'requestPhone',
    ]),
  },
  android: {
    platform: 'android',
    label: 'android — Pixel',
    version: '26.19.2',
    deviceName: 'Google Pixel 6, Android 17',
    capabilities: caps([
      'deviceStorage',
      'secureStorage',
      'haptic',
      'shareContent',
      'shareMaxContent',
      'biometric',
      'nfc',
      'brightness',
      'screenCapture',
      'swipes',
      'launchContext',
      'codeReader',
      'requestPhone',
    ]),
  },
  ios: {
    platform: 'ios',
    label: 'ios — iPhone',
    version: '26.20.0',
    deviceName: 'iPhone 16, iOS 26.5',
    capabilities: caps([
      'deviceStorage',
      'secureStorage',
      'haptic',
      'shareContent',
      'shareMaxContent',
      'biometric',
      'brightness',
      'screenCapture',
      'swipes',
      'launchContext',
      'codeReader',
      'requestPhone',
    ]),
  },
};

export function isPlatform(value: string): value is Platform {
  return value === 'web' || value === 'ios' || value === 'android' || value === 'desktop';
}

export function getProfile(platform: Platform): PlatformProfile {
  return PROFILES[platform];
}

export function capabilityList(): Capability[] {
  return CAPABILITY_ORDER;
}

export function capabilityForMethod(type: string): Capability | null {
  if (type.startsWith('WebAppDeviceStorage')) return 'deviceStorage';
  if (type.startsWith('WebAppSecureStorage')) return 'secureStorage';
  if (type.startsWith('WebAppHaptic')) return 'haptic';
  if (type.includes('Biometric')) return 'biometric';
  if (type.includes('Nfc') || type.includes('NFC')) return 'nfc';

  switch (type) {
    case 'WebAppShare':
      return 'shareContent';
    case 'WebAppMaxShare':
      return 'shareMaxContent';
    case 'WebAppChangeScreenBrightness':
      return 'brightness';
    case 'WebAppSetupScreenCaptureBehavior':
      return 'screenCapture';
    case 'WebAppSetupSwipesBehavior':
      return 'swipes';
    case 'WebAppGetLaunchContext':
      return 'launchContext';
    case 'WebAppOpenCodeReader':
      return 'codeReader';
    case 'WebAppRequestPhone':
      return 'requestPhone';
    default:
      return null;
  }
}
