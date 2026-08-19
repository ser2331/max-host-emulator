export type Platform = 'ios' | 'android' | 'desktop' | 'web';

export type LaunchEntryPoint = 'tabbar' | 'default';

export type HostUser = {
  id: number;
  first_name: string;
  last_name: string;
  username?: string;
  language_code: string;
  photo_url?: string;
};

export type HostChat = {
  id: number;
  type: string;
};

export type BridgeEvent = {
  at: number;
  direction: 'in' | 'out';
  type: string;
  payload: Record<string, unknown>;
};

export type HostState = {
  miniAppUrl: string;
  botToken: string;
  platform: Platform;
  version: string;
  deviceName: string;
  startParam: string;
  user: HostUser;
  backVisible: boolean;
  needCloseConfirm: boolean;
  iframeSrc: string;
};
