import { signContact } from './initData.ts';
import {
  getBiometricToken,
  getBiometry,
  getNfc,
  patchBiometry,
  patchNfc,
  setBiometricToken,
} from './nativeState.ts';
import { capabilityForMethod, getProfile } from './platforms.ts';
import type { SheetRequest, SheetResult } from './sheets.ts';
import { storageClear, storageGet, storageSet, type StorageKind } from './storage.ts';
import type { BridgeEvent, LaunchEntryPoint, Platform } from './types.ts';

export type ProtocolContext = {
  iframe: HTMLIFrameElement;
  platform: Platform;
  userId: number;
  botToken: string;
  phone: string;
  entryPoint: LaunchEntryPoint;
  log: (event: BridgeEvent) => void;
  askSheet: (request: SheetRequest) => Promise<SheetResult>;
  onStateChange?: () => void;
  onBackVisible: (visible: boolean) => void;
  onCloseConfirm: (needConfirmation: boolean) => void;
  onClose: () => void;
  onOpenLink: (url: string) => void;
};

function methodSnake(type: string): string {
  const rest = type.startsWith('WebApp') ? type.slice('WebApp'.length) : type;
  return rest.match(/[A-Z][a-z]*/g)?.map(part => part.toLowerCase()).join('_') ?? 'unknown_method';
}

function notSupportedCode(type: string): string {
  return `client.${methodSnake(type)}.not_supported`;
}

function reply(
  ctx: ProtocolContext,
  type: string,
  payload: Record<string, unknown>,
): void {
  const frameWindow = ctx.iframe.contentWindow;
  if (!frameWindow) return;
  const message = { type, ...payload };
  ctx.log({ at: Date.now(), direction: 'out', type, payload });
  frameWindow.postMessage(JSON.stringify(message), '*');
}

function ok(
  ctx: ProtocolContext,
  type: string,
  requestId: unknown,
  extra: Record<string, unknown> = {},
): void {
  // requestId обычно строка, но на некоторых платформах/реализациях может быть number.
  // Если просто не ответить — миниапп будет ждать до request_timeout.
  if (requestId === undefined || requestId === null) return;
  if (requestId === '') return;
  reply(ctx, type, { requestId, ...extra });
}

function fail(
  ctx: ProtocolContext,
  type: string,
  requestId: unknown,
  code: string,
): void {
  const payload = { error: { code } };
  if (requestId !== undefined && requestId !== null && requestId !== '') {
    reply(ctx, type, { requestId, ...payload });
    return;
  }
  ctx.log({ at: Date.now(), direction: 'out', type, payload });
}

function storageKind(type: string): StorageKind {
  return type.startsWith('WebAppSecureStorage') ? 'secure' : 'device';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function applySheet(
  ctx: ProtocolContext,
  type: string,
  requestId: unknown,
  request: SheetRequest,
  codes: { deny: string; error: string },
): Promise<{ decision: 'allow'; input: string } | null> {
  const result = await ctx.askSheet(request);
  if (result.decision === 'allow') return result;
  fail(ctx, type, requestId, result.decision === 'deny' ? codes.deny : codes.error);
  return null;
}

export function handleBridgeMessage(ctx: ProtocolContext, raw: unknown): void {
  void handleBridgeMessageAsync(ctx, raw);
}

async function handleBridgeMessageAsync(ctx: ProtocolContext, raw: unknown): Promise<void> {
  if (typeof raw !== 'string') return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const type = String(parsed.type ?? '');
  if (!type.startsWith('WebApp')) return;

  ctx.log({ at: Date.now(), direction: 'in', type, payload: parsed });
  const requestId = parsed.requestId;
  const profile = getProfile(ctx.platform);
  const capability = capabilityForMethod(type);

  if (capability && !profile.capabilities[capability]) {
    fail(ctx, type, requestId, notSupportedCode(type));
    return;
  }

  switch (type) {
    case 'WebAppReady':
      return;
    case 'WebAppClose':
      ctx.onClose();
      return;
    case 'WebAppSetupBackButton':
      ctx.onBackVisible(Boolean(parsed.isVisible));
      return;
    case 'WebAppSetupClosingBehavior':
      ctx.onCloseConfirm(Boolean(parsed.needConfirmation));
      return;
    case 'WebAppOpenLink':
    case 'WebAppOpenMaxLink':
      ctx.onOpenLink(String(parsed.url ?? ''));
      return;
    case 'WebAppDeviceStorageSaveKey':
    case 'WebAppSecureStorageSaveKey': {
      const result = storageSet(
        ctx.platform,
        storageKind(type),
        String(parsed.key ?? ''),
        parsed.value == null ? null : String(parsed.value),
      );
      if (!result.ok) {
        fail(ctx, type, requestId, result.code);
        return;
      }
      ok(ctx, type, requestId, { status: 'updated' });
      return;
    }
    case 'WebAppDeviceStorageGetKey':
    case 'WebAppSecureStorageGetKey':
      ok(ctx, type, requestId, {
        value: storageGet(ctx.platform, storageKind(type), String(parsed.key ?? '')),
      });
      return;
    case 'WebAppDeviceStorageClear':
    case 'WebAppSecureStorageClear':
      storageClear(ctx.platform, storageKind(type));
      ok(ctx, type, requestId, { status: 'cleared' });
      return;
    case 'WebAppHapticFeedbackImpact':
    case 'WebAppHapticFeedbackNotification':
    case 'WebAppHapticFeedbackSelectionChange':
      ok(ctx, type, requestId, {});
      return;
    case 'WebAppChangeScreenBrightness':
      ok(ctx, type, requestId, { maxBrightness: Boolean(parsed.maxBrightness) });
      return;
    case 'WebAppSetupScreenCaptureBehavior':
      ok(ctx, type, requestId, {
        isScreenCaptureEnabled: Boolean(parsed.isScreenCaptureEnabled),
      });
      return;
    case 'WebAppSetupSwipesBehavior':
      ok(ctx, type, requestId, {
        allowVerticalSwipes: Boolean(parsed.allowVerticalSwipes),
      });
      return;
    case 'WebAppGetViewportSize':
      ok(ctx, type, requestId, {
        width: String(ctx.iframe.clientWidth),
        height: String(ctx.iframe.clientHeight),
      });
      return;
    case 'WebAppGetLaunchContext':
      ok(ctx, type, requestId, { entryPoint: ctx.entryPoint });
      return;
    case 'WebAppDownloadFile': {
      const url = String(parsed.url ?? '');
      if (!url.startsWith('https://')) {
        fail(ctx, type, requestId, 'client.download_file.invalid_request');
        return;
      }
      const fileName = text(parsed.file_name) || url;
      const result = await ctx.askSheet({
        title: 'Скачать файл',
        body: fileName,
      });
      if (result.decision === 'error') {
        fail(ctx, type, requestId, 'client.download_file.request_error');
        return;
      }
      if (result.decision === 'deny') {
        ok(ctx, type, requestId, { status: 'cancelled' });
        return;
      }
      ctx.onOpenLink(url);
      ok(ctx, type, requestId, { status: 'downloading' });
      return;
    }
    case 'WebAppShare': {
      const shareText = text(parsed.text);
      const shareLink = text(parsed.link);
      if (!shareText && !shareLink) {
        fail(ctx, type, requestId, 'client.share.invalid_request');
        return;
      }
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Системный шеринг',
          body: [shareText, shareLink].filter(Boolean).join('\n'),
        },
        { deny: 'client.share.user_cancelled', error: 'client.share.request_error' },
      );
      if (!allowed) return;
      ok(ctx, type, requestId, {});
      return;
    }
    case 'WebAppMaxShare': {
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Шеринг в MAX',
          body: JSON.stringify(
            {
              text: parsed.text,
              link: parsed.link,
              chatId: parsed.chatId,
              messageId: parsed.messageId,
            },
            null,
            2,
          ),
        },
        { deny: 'client.max_share.user_cancelled', error: 'client.max_share.request_error' },
      );
      if (!allowed) return;
      ok(ctx, type, requestId, {});
      return;
    }
    case 'WebAppRequestPhone': {
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Запрос номера',
          body: `Миниапп запрашивает номер ${ctx.phone}`,
        },
        {
          deny: 'client.request_phone.user_refused_provide_phone_number',
          error: 'client.request_phone.request_error',
        },
      );
      if (!allowed) return;
      ok(
        ctx,
        type,
        requestId,
        await signContact({
          phone: ctx.phone,
          userId: ctx.userId,
          botToken: ctx.botToken,
        }),
      );
      return;
    }
    case 'WebAppOpenCodeReader': {
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Сканер QR',
          body: parsed.fileSelect ? 'Камера или файл из галереи' : 'Только камера',
          input: {
            label: 'Содержимое кода',
            value: 'emulator-code',
            placeholder: 'текст QR',
          },
        },
        {
          deny: 'client.open_code_reader.user_cancelled',
          error: 'client.open_code_reader.request_error',
        },
      );
      if (!allowed) return;
      ok(ctx, type, requestId, { value: allowed.input || 'emulator-code' });
      return;
    }
    case 'WebAppBiometryGetInfo':
      ok(ctx, type, requestId, getBiometry(ctx.platform));
      return;
    case 'WebAppBiometryRequestAccess': {
      const info = getBiometry(ctx.platform);
      if (!info.available) {
        fail(ctx, type, requestId, 'client.biometry_request_access.not_supported');
        return;
      }
      if (info.accessRequested) {
        ok(ctx, type, requestId, info);
        return;
      }
      const result = await ctx.askSheet({
        title: 'Биометрия',
        body: text(parsed.reason) || 'Миниапп запрашивает доступ к биометрии',
      });
      if (result.decision === 'error') {
        fail(ctx, type, requestId, 'client.biometry_request_access.request_error');
        return;
      }
      ok(
        ctx,
        type,
        requestId,
        patchBiometry(ctx.platform, {
          accessRequested: true,
          accessGranted: result.decision === 'allow',
        }),
      );
      ctx.onStateChange?.();
      return;
    }
    case 'WebAppBiometryRequestAuth': {
      const info = getBiometry(ctx.platform);
      if (!info.available) {
        fail(ctx, type, requestId, 'client.biometry_request_auth.not_supported');
        return;
      }
      if (!info.accessRequested || !info.accessGranted) {
        fail(ctx, type, requestId, 'client.biometry_request_auth.permission_denied');
        return;
      }
      if (!info.tokenSaved || !getBiometricToken(ctx.platform)) {
        fail(ctx, type, requestId, 'client.biometry_request_auth.not_found');
        return;
      }
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Подтверждение биометрии',
          body: text(parsed.reason) || 'Подтвердите личность',
        },
        {
          deny: 'client.biometry_request_auth.failed',
          error: 'client.biometry_request_auth.request_error',
        },
      );
      if (!allowed) return;
      ok(ctx, type, requestId, {
        status: 'authorized',
        token: getBiometricToken(ctx.platform),
      });
      return;
    }
    case 'WebAppBiometryUpdateToken': {
      const info = getBiometry(ctx.platform);
      if (!info.available) {
        fail(ctx, type, requestId, 'client.biometry_update_token.not_supported');
        return;
      }
      if (!info.accessGranted) {
        fail(ctx, type, requestId, 'client.biometry_update_token.permission_denied');
        return;
      }
      const token = text(parsed.token);
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Сохранить биометрический токен',
          body: token ? 'Токен будет записан в keychain хоста' : 'Токен будет удалён',
        },
        {
          deny: 'client.biometry_update_token.failed',
          error: 'client.biometry_update_token.request_error',
        },
      );
      if (!allowed) return;
      ok(ctx, type, requestId, {
        status: 'updated',
        ...setBiometricToken(ctx.platform, token),
      });
      ctx.onStateChange?.();
      return;
    }
    case 'WebAppBiometryOpenSettings': {
      const info = getBiometry(ctx.platform);
      if (!info.available) {
        fail(ctx, type, requestId, 'client.biometry_open_settings.not_supported');
        return;
      }
      if (info.accessGranted) {
        fail(ctx, type, requestId, 'client.biometry_open_settings.permission_denied');
        return;
      }
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Настройки биометрии',
          body: 'Разрешить доступ в системных настройках?',
        },
        {
          deny: 'client.biometry_open_settings.user_cancelled',
          error: 'client.biometry_open_settings.request_error',
        },
      );
      if (!allowed) return;
      patchBiometry(ctx.platform, { accessRequested: true, accessGranted: true });
      ok(ctx, type, requestId, { status: 'opened' });
      ctx.onStateChange?.();
      return;
    }
    case 'WebAppNfcGetInfo':
      ok(ctx, type, requestId, getNfc(ctx.platform));
      return;
    case 'WebAppNfcOpenSystemSettings': {
      const info = getNfc(ctx.platform);
      if (!info.available) {
        fail(ctx, type, requestId, 'client.nfc_open_system_settings.not_supported');
        return;
      }
      if (info.enabled) {
        fail(ctx, type, requestId, 'client.nfc_open_system_settings.permission_denied');
        return;
      }
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'Настройки NFC',
          body: 'Открыть системные настройки NFC? Миниапп будет закрыт.',
        },
        {
          deny: 'client.nfc_open_system_settings.user_cancelled',
          error: 'client.nfc_open_system_settings.request_error',
        },
      );
      if (!allowed) return;
      patchNfc(ctx.platform, { enabled: true, accessRevoked: false });
      ok(ctx, type, requestId, { status: 'opened' });
      ctx.onStateChange?.();
      ctx.onClose();
      return;
    }
    case 'WebAppNfcEmulateNfcTag': {
      const info = getNfc(ctx.platform);
      if (!info.available) {
        fail(ctx, type, requestId, 'client.nfc_emulate_nfc_tag.not_supported');
        return;
      }
      if (info.accessRevoked) {
        fail(ctx, type, requestId, 'client.nfc_emulate_nfc_tag.access_revoked');
        return;
      }
      if (!info.enabled) {
        fail(ctx, type, requestId, 'client.nfc_emulate_nfc_tag.not_enabled');
        return;
      }
      const payload = text(parsed.nfctag);
      const allowed = await applySheet(
        ctx,
        type,
        requestId,
        {
          title: 'NFC-метка',
          body: payload ? `Эмулировать метку:\n${payload}` : 'Остановить NFC-вещание',
        },
        {
          deny: 'client.nfc_emulate_nfc_tag.user_cancelled',
          error: 'client.nfc_emulate_nfc_tag.request_error',
        },
      );
      if (!allowed) return;
      ok(ctx, type, requestId, { status: payload ? 'emulating' : 'stopped' });
      return;
    }
    default:
      fail(ctx, type, requestId, notSupportedCode(type));
  }
}

export function sendBackPressed(ctx: ProtocolContext): void {
  reply(ctx, 'WebAppBackButtonPressed', {});
}
