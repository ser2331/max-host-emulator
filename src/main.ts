import "./style.css";
import { APP_NAME, APP_VERSION } from "./appInfo.ts";
import { watchDocs } from "./docsWatcher.ts";
import { signInitData } from "./initData.ts";
import QRCode from "qrcode";
import { getBiometry, getNfc, resetNativeState } from "./nativeState.ts";
import {
  CAPABILITY_LABELS,
  capabilityList,
  getProfile,
  isPlatform,
  type PlatformProfile,
} from "./platforms.ts";
import {
  handleBridgeMessage,
  sendBackPressed,
  type ProtocolContext,
} from "./protocol.ts";
import {
  createSheetController,
  isSheetMode,
  type SheetMode,
} from "./sheets.ts";
import type {
  BridgeEvent,
  HostUser,
  LaunchEntryPoint,
  Platform,
} from "./types.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("#app is missing");
}

const defaultPhone = "+79990000000";
const defaultUser: HostUser = {
  id: 10001,
  first_name: "Демо",
  last_name: "Пользователь",
  username: "demo",
  language_code: "ru",
  photo_url: "https://example.com/photo.jpg",
};

const defaultChat = {
  id: 20001,
  type: "DIALOG",
};
const devLanUrls = __DEV_LAN_URLS__;

app.innerHTML = `
  <div class="banner" id="docs-banner"></div>
  <div class="mobile-tabs" id="mobile-tabs" role="tablist" aria-label="Mobile navigation" hidden>
    <button type="button" role="tab" aria-selected="true" id="tab-settings" data-tab="settings" class="mobile-tab active">
      1. Настройки
    </button>
    <button type="button" role="tab" aria-selected="false" id="tab-app" data-tab="app" class="mobile-tab">
      2. Миниапп
    </button>
    <button type="button" role="tab" aria-selected="false" id="tab-logs" data-tab="logs" class="mobile-tab">
      3. Логи
    </button>
  </div>
  <div class="layout">
    <aside class="panel" id="pane-settings">
      <div class="panel-scroll">
        <div class="brand">
          <h1>${APP_NAME}</h1>
          <span class="version">v${APP_VERSION}</span>
        </div>
        <p class="tagline">Стенд хоста мини-приложений</p>
        <div class="settings">
                <details class="settings-group" open>
          <summary>Стенд</summary>
          <div class="settings-body">
            <label>URL миниаппа
              <input id="miniapp-url" value="https://localhost:5173/max-mini-app/" />
            </label>
            <label>Токен бота
              <input id="bot-token" type="password" placeholder="для подписи initData" />
            </label>
            <label>Платформа
              <select id="platform">
                <option value="web">web — браузер</option>
                <option value="ios">ios — iPhone</option>
                <option value="android">android — Pixel</option>
                <option value="desktop">desktop — Windows</option>
              </select>
            </label>
            <div class="profile-meta" id="profile-meta"></div>
            <div class="caps" id="caps"></div>
            <label>Нативные шиты
              <select id="sheet-mode">
                <option value="ask">спрашивать</option>
                <option value="allow">всегда разрешать</option>
                <option value="deny">всегда отказывать</option>
              </select>
            </label>
            <label>Источник запуска
              <select id="entry-point">
                <option value="default">default — чат / список</option>
                <option value="tabbar">tabbar</option>
              </select>
            </label>
            <label>start_param
              <input id="start-param" />
            </label>
            <label>URL эмулятора для телефона
              <input id="mobile-host-url" placeholder="https://192.168.x.x:4173" />
            </label>
            <div class="mobile-host-presets" id="mobile-host-presets"></div>
            <div class="inline-grid">
              <label>Ширина окна (web/desktop)
                <input id="window-width" type="number" min="320" step="10" value="960" />
              </label>
              <label>Высота окна (web/desktop)
                <input id="window-height" type="number" min="480" step="10" value="680" />
              </label>
            </div>
            <div class="qr-card">
              <div class="qr-card-head">
                <strong>Открыть на телефоне</strong>
                <button id="refresh-qr" type="button" class="secondary">Обновить QR</button>
              </div>
              <img id="mobile-qr" alt="QR для открытия MAX Host на телефоне" hidden />
              <a id="mobile-link" target="_blank" rel="noopener noreferrer"></a>
              <p id="mobile-qr-hint" class="hint"></p>
            </div>
          </div>
        </details>
        <details class="settings-group" open>
          <summary>Пользователь</summary>
          <div class="settings-body">
            <label>ID пользователя
              <input id="user-id" value="${defaultUser.id}" />
            </label>
            <label>Имя
              <input id="first-name" value="${defaultUser.first_name}" />
            </label>
            <label>Фамилия
              <input id="last-name" value="${defaultUser.last_name}" />
            </label>
            <label>Фото URL
              <input id="photo-url" value="${defaultUser.photo_url ?? ""}" />
            </label>
          </div>
        </details>
        <details class="settings-group" open>
          <summary>Чат</summary>
          <div class="settings-body">
            <label>ID чата
              <input id="chat-id" value="${defaultChat.id}" />
            </label>
            <label>Тип чата
              <select id="chat-type">
                <option value="DIALOG" ${defaultChat.type === "DIALOG" ? "selected" : ""}>DIALOG</option>
                <option value="CHAT" ${defaultChat.type === "CHAT" ? "selected" : ""}>CHAT</option>
                <option value="CHANNEL" ${defaultChat.type === "CHANNEL" ? "selected" : ""}>CHANNEL</option>
              </select>
            </label>
          </div>
        </details>
        <details class="settings-group">
          <summary>Сервис</summary>
          <div class="settings-body">
            <button id="reset-native" type="button" class="secondary">Сбросить биометрию / NFC</button>
          </div>
        </details>
</div>

        <div class="panel-actions">
          <button id="reload" type="button">Открыть миниапп</button>
        </div>
      </div>
    </aside>
    <main class="stage" id="pane-app">
      <div class="chrome" id="chrome" data-platform="web">
        <div class="chrome-status" aria-hidden="true"></div>
        <div class="chrome-bar">
          <button id="back" type="button" hidden>←</button>
          <div class="chrome-title">
            <div>Mini App</div>
            <div class="chrome-sub" id="chrome-sub"></div>
          </div>
          <div class="chrome-menu">
            <button
              id="chrome-menu"
              type="button"
              class="chrome-menu-trigger"
              aria-label="Меню"
              aria-haspopup="menu"
              aria-expanded="false"
            >
              <span class="chrome-menu-dots" aria-hidden="true"></span>
            </button>
            <div class="chrome-menu-panel" id="chrome-menu-panel" role="menu" hidden>
              <button type="button" id="chrome-refresh" role="menuitem">Обновить</button>
            </div>
          </div>
          <button id="close" type="button">✕</button>
        </div>
        <iframe id="miniapp" allow="clipboard-read; clipboard-write"></iframe>
        <div class="chrome-nav" aria-hidden="true"></div>
      </div>
      <div class="sheet" id="sheet" hidden>
        <div class="sheet-card">
          <h3 id="sheet-title"></h3>
          <p id="sheet-body"></p>
          <label id="sheet-input-wrap" hidden>
            <span id="sheet-input-label"></span>
            <input id="sheet-input" />
          </label>
          <div class="sheet-actions">
            <button type="button" id="sheet-allow">Разрешить</button>
            <button type="button" id="sheet-deny" class="secondary">Отказать</button>
            <button type="button" id="sheet-error" class="ghost">Ошибка</button>
          </div>
        </div>
      </div>
    </main>
    <aside class="log" id="pane-logs">
            <div class="log-header">
          <h2>Bridge log</h2>
        </div>
                <details class="status-panel" open>
          <summary>Host status</summary>
          <pre id="status-json"></pre>
        </details>
      <div class="log-scroll">


        <div id="events"></div>
      </div>
    </aside>
  </div>
`;

const iframe = document.querySelector<HTMLIFrameElement>("#miniapp")!;
const eventsEl = document.querySelector("#events")!;
const bannerEl = document.querySelector("#docs-banner")!;
const backBtn = document.querySelector<HTMLButtonElement>("#back")!;
const closeBtn = document.querySelector<HTMLButtonElement>("#close")!;
const chromeMenuBtn = document.querySelector<HTMLButtonElement>("#chrome-menu")!;
const chromeMenuPanel = document.querySelector<HTMLDivElement>("#chrome-menu-panel")!;
const chromeRefreshBtn = document.querySelector<HTMLButtonElement>("#chrome-refresh")!;
const platformSelect = document.querySelector<HTMLSelectElement>("#platform")!;
const chromeEl = document.querySelector<HTMLDivElement>("#chrome")!;
const stageEl = document.querySelector<HTMLElement>("#pane-app")!;
const chromeSubEl = document.querySelector("#chrome-sub")!;
const profileMetaEl = document.querySelector("#profile-meta")!;
const capsEl = document.querySelector("#caps")!;
const userIdInput = document.querySelector<HTMLInputElement>("#user-id")!;
const photoUrlInput = document.querySelector<HTMLInputElement>("#photo-url")!;
const chatIdInput = document.querySelector<HTMLInputElement>("#chat-id")!;
const chatTypeSelect = document.querySelector<HTMLSelectElement>("#chat-type")!;
const miniAppUrlInput =
  document.querySelector<HTMLInputElement>("#miniapp-url")!;
const botTokenInput = document.querySelector<HTMLInputElement>("#bot-token")!;
const startParamInput =
  document.querySelector<HTMLInputElement>("#start-param")!;
const mobileHostUrlInput =
  document.querySelector<HTMLInputElement>("#mobile-host-url")!;
const mobileHostPresetsEl =
  document.querySelector<HTMLDivElement>("#mobile-host-presets")!;
const windowWidthInput =
  document.querySelector<HTMLInputElement>("#window-width")!;
const windowHeightInput =
  document.querySelector<HTMLInputElement>("#window-height")!;
const entryPointSelect =
  document.querySelector<HTMLSelectElement>("#entry-point")!;
const firstNameInput = document.querySelector<HTMLInputElement>("#first-name")!;
const lastNameInput = document.querySelector<HTMLInputElement>("#last-name")!;
const sheetEl = document.querySelector<HTMLDivElement>("#sheet")!;
const sheetTitleEl = document.querySelector("#sheet-title")!;
const sheetBodyEl = document.querySelector("#sheet-body")!;
const sheetInputWrap =
  document.querySelector<HTMLLabelElement>("#sheet-input-wrap")!;
const sheetInputLabel = document.querySelector("#sheet-input-label")!;
const sheetInput = document.querySelector<HTMLInputElement>("#sheet-input")!;
const sheetModeSelect =
  document.querySelector<HTMLSelectElement>("#sheet-mode")!;
const statusJsonEl = document.querySelector<HTMLPreElement>("#status-json")!;

const settingsPaneEl = document.querySelector<HTMLElement>("#pane-settings")!;
const appPaneEl = document.querySelector<HTMLElement>("#pane-app")!;
const logsPaneEl = document.querySelector<HTMLElement>("#pane-logs")!;
const mobileTabsEl = document.querySelector<HTMLDivElement>("#mobile-tabs")!;
const mobileTabButtons = {
  settings: document.querySelector<HTMLButtonElement>("#tab-settings")!,
  app: document.querySelector<HTMLButtonElement>("#tab-app")!,
  logs: document.querySelector<HTMLButtonElement>("#tab-logs")!,
};
const mobileQrImg = document.querySelector<HTMLImageElement>("#mobile-qr")!;
const mobileLinkEl = document.querySelector<HTMLAnchorElement>("#mobile-link")!;
const mobileQrHintEl = document.querySelector<HTMLParagraphElement>("#mobile-qr-hint")!;

function selectedEntryPoint(): LaunchEntryPoint {
  const value = entryPointSelect.value;
  return value === "tabbar" ? "tabbar" : "default";
}

function botTokenValue(): string {
  return botTokenInput.value.trim() || "emulator-dev-token";
}

function selectedSheetMode(): SheetMode {
  const value = sheetModeSelect.value;
  return isSheetMode(value) ? value : "ask";
}

function selectedPlatform(): Platform {
  const value = platformSelect.value;
  return isPlatform(value) ? value : "web";
}

function selectedUserId(): number {
  const raw = userIdInput.value.trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : defaultUser.id;
}

function selectedPhotoUrl(): string {
  return photoUrlInput.value.trim();
}

function selectedWindowWidth(): number {
  const value = Number(windowWidthInput.value.trim());
  return Number.isFinite(value) && value >= 320 ? value : 960;
}

function selectedWindowHeight(): number {
  const value = Number(windowHeightInput.value.trim());
  return Number.isFinite(value) && value >= 480 ? value : 680;
}

function selectedMobileHostUrl(): string {
  return mobileHostUrlInput.value.trim();
}

function renderMobileHostPresets(): void {
  if (!devLanUrls.length) {
    mobileHostPresetsEl.innerHTML =
      '<div class="hint">LAN IP не найден автоматически. Проверьте, что ПК подключен к сети.</div>';
    return;
  }

  mobileHostPresetsEl.innerHTML = devLanUrls
    .map(
      (url) =>
        `<button type="button" class="chip-button" data-mobile-host="${url}">${url}</button>`,
    )
    .join("");

  for (const button of mobileHostPresetsEl.querySelectorAll<HTMLButtonElement>(
    "[data-mobile-host]",
  )) {
    button.addEventListener("click", () => {
      const nextUrl = button.dataset.mobileHost ?? "";
      mobileHostUrlInput.value = nextUrl;
      saveSettings();
      renderStatus();
      void renderMobileQr();
    });
  }
}

function selectedChat(): { id: number; type: string } {
  const rawId = chatIdInput.value.trim();
  const n = Number(rawId);
  const id = Number.isFinite(n) && n > 0 ? n : defaultChat.id;
  const type = chatTypeSelect.value || defaultChat.type;
  return { id, type };
}

const SETTINGS_KEY = "max-host-settings:v1";

type HostSettings = {
  miniAppUrl: string;
  botToken: string;
  platform: Platform;
  sheetMode: SheetMode;
  entryPoint: LaunchEntryPoint;
  startParam: string;
  mobileHostUrl: string;
  windowWidth: number;
  windowHeight: number;
  firstName: string;
  lastName: string;
  userId: number;
  photoUrl: string;
  chatId: number;
  chatType: string;
};

function readSettings(): HostSettings {
  return {
    miniAppUrl: miniAppUrlInput.value.trim(),
    botToken: botTokenInput.value,
    platform: selectedPlatform(),
    sheetMode: selectedSheetMode(),
    entryPoint: selectedEntryPoint(),
    startParam: startParamInput.value,
    mobileHostUrl: selectedMobileHostUrl(),
    windowWidth: selectedWindowWidth(),
    windowHeight: selectedWindowHeight(),
    firstName: firstNameInput.value,
    lastName: lastNameInput.value,
    userId: selectedUserId(),
    photoUrl: selectedPhotoUrl(),
    chatId: selectedChat().id,
    chatType: selectedChat().type,
  };
}

function applySettings(next: Partial<HostSettings>): void {
  if (next.miniAppUrl != null) miniAppUrlInput.value = next.miniAppUrl;
  if (next.botToken != null) botTokenInput.value = next.botToken;
  if (next.platform != null) platformSelect.value = next.platform;
  if (next.sheetMode != null) sheetModeSelect.value = next.sheetMode;
  if (next.entryPoint != null) entryPointSelect.value = next.entryPoint;
  if (next.startParam != null) startParamInput.value = next.startParam;
  if (next.mobileHostUrl != null) mobileHostUrlInput.value = next.mobileHostUrl;
  if (next.windowWidth != null) windowWidthInput.value = String(next.windowWidth);
  if (next.windowHeight != null) windowHeightInput.value = String(next.windowHeight);

  if (next.firstName != null) firstNameInput.value = next.firstName;
  if (next.lastName != null) lastNameInput.value = next.lastName;

  if (next.userId != null) userIdInput.value = String(next.userId);
  if (next.photoUrl != null) photoUrlInput.value = next.photoUrl;
  if (next.chatId != null) chatIdInput.value = String(next.chatId);
  if (next.chatType != null) chatTypeSelect.value = next.chatType;
}

function loadSettings(): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<HostSettings>;
    applySettings(parsed);
  } catch (e) {
    console.warn("Failed to load host settings", e);
  }
}

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(readSettings()));
  } catch (e) {
    console.warn("Failed to save host settings", e);
  }
}

function rewriteLoopbackUrl(target: string, mobileHostUrl: string): string {
  try {
    const mobileHost = new URL(mobileHostUrl);
    const url = new URL(target);
    if (
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname.startsWith("127.")
    ) {
      url.protocol = mobileHost.protocol;
      url.hostname = mobileHost.hostname;
    }
    return url.toString();
  } catch {
    return target;
  }
}

function normalizeMobileHostUrl(maybeLoopback: string): string {
  try {
    const url = new URL(maybeLoopback);
    const hostname = url.hostname;
    const isLoopback =
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname.startsWith("127.");

    if (!isLoopback) return url.toString();
    const lan = devLanUrls[0];
    if (!lan) return url.toString();
    return lan;
  } catch {
    return maybeLoopback;
  }
}

function mobileEmulatorUrl(): string | null {
  const mobileHost = normalizeMobileHostUrl(selectedMobileHostUrl());
  if (!mobileHost) return null;

  try {
    const url = new URL(mobileHost);
    const miniAppUrl = rewriteLoopbackUrl(miniAppUrlInput.value.trim(), mobileHost);
    url.searchParams.set("miniappUrl", miniAppUrl);
    url.searchParams.set("platform", selectedPlatform());
    url.searchParams.set("sheetMode", selectedSheetMode());
    url.searchParams.set("entryPoint", selectedEntryPoint());
    const startapp = startParamInput.value.trim();
    if (startapp) url.searchParams.set("startapp", startapp);
    url.searchParams.set("userId", String(selectedUserId()));
    url.searchParams.set("firstName", firstNameInput.value.trim() || defaultUser.first_name);
    url.searchParams.set("lastName", lastNameInput.value.trim() || defaultUser.last_name);
    url.searchParams.set("photoUrl", selectedPhotoUrl());
    url.searchParams.set("chatId", String(selectedChat().id));
    url.searchParams.set("chatType", selectedChat().type);
    url.searchParams.set("windowWidth", String(selectedWindowWidth()));
    url.searchParams.set("windowHeight", String(selectedWindowHeight()));
    return url.toString();
  } catch {
    return null;
  }
}

async function renderMobileQr(): Promise<void> {
  const url = mobileEmulatorUrl();
  if (!url) {
    mobileQrImg.hidden = true;
    mobileLinkEl.textContent = "";
    mobileLinkEl.removeAttribute("href");
    mobileQrHintEl.textContent =
      "Укажите LAN URL эмулятора, например https://192.168.x.x:4173.";
    return;
  }

  const host = new URL(url);
  mobileQrHintEl.textContent =
    "Телефон и ПК должны быть в одной сети. Если браузер предупредит о сертификате Vite HTTPS, подтвердите исключение один раз.";

  mobileLinkEl.href = url;
  mobileLinkEl.textContent = url;
  mobileQrImg.src = await QRCode.toDataURL(url, { width: 220, margin: 1 });
  mobileQrImg.hidden = false;
}

function applyUrlOverrides(): void {
  const params = new URLSearchParams(window.location.search);
  const next: Partial<HostSettings> = {};

  const miniappUrl = params.get("miniappUrl");
  if (miniappUrl) next.miniAppUrl = miniappUrl;
  const platform = params.get("platform");
  if (platform && isPlatform(platform)) next.platform = platform;
  const sheetMode = params.get("sheetMode");
  if (sheetMode && isSheetMode(sheetMode)) next.sheetMode = sheetMode;
  const entryPoint = params.get("entryPoint");
  if (entryPoint === "default" || entryPoint === "tabbar") next.entryPoint = entryPoint;
  const startapp = params.get("startapp");
  if (startapp) next.startParam = startapp;
  const userId = Number(params.get("userId"));
  if (Number.isFinite(userId) && userId > 0) next.userId = userId;
  const firstName = params.get("firstName");
  if (firstName) next.firstName = firstName;
  const lastName = params.get("lastName");
  if (lastName) next.lastName = lastName;
  const photoUrl = params.get("photoUrl");
  if (photoUrl) next.photoUrl = photoUrl;
  const chatId = Number(params.get("chatId"));
  if (Number.isFinite(chatId) && chatId > 0) next.chatId = chatId;
  const chatType = params.get("chatType");
  if (chatType) next.chatType = chatType;
  const windowWidth = Number(params.get("windowWidth"));
  if (Number.isFinite(windowWidth) && windowWidth >= 320) next.windowWidth = windowWidth;
  const windowHeight = Number(params.get("windowHeight"));
  if (Number.isFinite(windowHeight) && windowHeight >= 480) next.windowHeight = windowHeight;

  applySettings(next);
}

/** После ESIA бэк редиректит сюда: /{botName}?startapp={referenceToken} */
function applyStartAppFromUrl(): boolean {
  const search = new URLSearchParams(window.location.search);
  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
    : "";
  const hashParams = new URLSearchParams(hashQuery);
  const token =
    search.get("startapp") ??
    search.get("start_param") ??
    hashParams.get("startapp") ??
    hashParams.get("start_param");
  if (!token?.trim()) return false;

  startParamInput.value = token.trim();
  saveSettings();

  search.delete("startapp");
  search.delete("start_param");
  hashParams.delete("startapp");
  hashParams.delete("start_param");
  const query = search.toString();
  const hashRest = window.location.hash.includes("?")
    ? window.location.hash.slice(1, window.location.hash.indexOf("?"))
    : window.location.hash.slice(1);
  const hashQueryClean = hashParams.toString();
  const hash = hashRest
    ? `#${hashRest}${hashQueryClean ? `?${hashQueryClean}` : ""}`
    : hashQueryClean
      ? `#?${hashQueryClean}`
      : "";
  const cleanUrl = window.location.pathname + (query ? `?${query}` : "") + hash;
  window.history.replaceState({}, "", cleanUrl);

  bannerEl.classList.add("visible");
  bannerEl.textContent = "Получен reference token после ESIA — запускаем миниапп…";
  return true;
}

function renderProfile(profile: PlatformProfile): void {
  chromeEl.dataset.platform = profile.platform;
  stageEl.dataset.platform = profile.platform;
  if (profile.platform === "web" || profile.platform === "desktop") {
    chromeEl.style.width = `${selectedWindowWidth()}px`;
    chromeEl.style.height = `${selectedWindowHeight()}px`;
    chromeEl.style.minHeight = `${selectedWindowHeight()}px`;
  } else {
    chromeEl.style.width = "";
    chromeEl.style.height = "";
    chromeEl.style.minHeight = "";
  }
  chromeSubEl.textContent = `${profile.platform} · ${profile.deviceName}`;
  profileMetaEl.textContent = `${profile.version} · ${profile.deviceName}`;
  capsEl.innerHTML = capabilityList()
    .map((capability) => {
      const on = profile.capabilities[capability];
      return `<span class="cap ${on ? "on" : "off"}">${CAPABILITY_LABELS[capability]}</span>`;
    })
    .join("");
  renderStatus();
}

function renderStatus(): void {
  const profile = getProfile(selectedPlatform());
  const chat = selectedChat();
  const user = {
    id: selectedUserId(),
    first_name: firstNameInput.value.trim() || defaultUser.first_name,
    last_name: lastNameInput.value.trim() || defaultUser.last_name,
    username: defaultUser.username,
    language_code: defaultUser.language_code,
    photo_url: selectedPhotoUrl() || defaultUser.photo_url,
  };

  statusJsonEl.textContent = JSON.stringify(
    {
      app: { name: APP_NAME, version: APP_VERSION },
      profile: {
        platform: profile.platform,
        label: profile.label,
        version: profile.version,
        deviceName: profile.deviceName,
      },
      launch: {
        entryPoint: selectedEntryPoint(),
        sheetMode: selectedSheetMode(),
        startParam: startParamInput.value.trim(),
        mobileHostUrl: selectedMobileHostUrl(),
      },
      initDataPreview: {
        user,
        chat,
      },
      nativeState: {
        biometry: getBiometry(selectedPlatform()),
        nfc: getNfc(selectedPlatform()),
      },
    },
    null,
    2,
  );
}

const sheets = createSheetController({
  getMode: selectedSheetMode,
  readInput: () => sheetInput.value,
  render: (request) => {
    if (!request) {
      sheetEl.hidden = true;
      sheetInputWrap.hidden = true;
      sheetInput.value = "";
      return;
    }
    sheetTitleEl.textContent = request.title;
    sheetBodyEl.textContent = request.body;
    if (request.input) {
      sheetInputWrap.hidden = false;
      sheetInputLabel.textContent = request.input.label;
      sheetInput.value = request.input.value;
      sheetInput.placeholder = request.input.placeholder ?? "";
    } else {
      sheetInputWrap.hidden = true;
      sheetInput.value = "";
    }
    sheetEl.hidden = false;
  },
});

document
  .querySelector("#sheet-allow")!
  .addEventListener("click", () => sheets.decide("allow"));
document
  .querySelector("#sheet-deny")!
  .addEventListener("click", () => sheets.decide("deny"));
document
  .querySelector("#sheet-error")!
  .addEventListener("click", () => sheets.decide("error"));

let needCloseConfirm = false;
const events: BridgeEvent[] = [];

const log = (event: BridgeEvent) => {
  events.unshift(event);
  eventsEl.innerHTML = events
    .slice(0, 80)
    .map(
      (item) =>
        `<div class="event ${item.direction}"><strong>${item.direction}</strong> ${item.type}\n${JSON.stringify(item.payload, null, 2)}</div>`,
    )
    .join("");
};

const ctx = (): ProtocolContext => ({
  iframe,
  platform: selectedPlatform(),
  userId: selectedUserId(),
  botToken: botTokenValue(),
  phone: defaultPhone,
  entryPoint: selectedEntryPoint(),
  askSheet: sheets.ask,
  log,
  onStateChange: renderStatus,
  onBackVisible: (visible) => {
    backBtn.hidden = !visible;
  },
  onCloseConfirm: (value) => {
    needCloseConfirm = value;
  },
  onClose: () => {
    iframe.removeAttribute("src");
  },
  onOpenLink: (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
});

window.addEventListener("message", (event) => {
  if (event.source !== iframe.contentWindow) return;
  handleBridgeMessage(ctx(), event.data);
});

async function buildIframeSrc(): Promise<string> {
  const miniAppUrl = document
    .querySelector<HTMLInputElement>("#miniapp-url")!
    .value.trim();
  const token = botTokenValue();
  const profile = getProfile(selectedPlatform());
  const startParam = document
    .querySelector<HTMLInputElement>("#start-param")!
    .value.trim();
  const userId = selectedUserId();
  const user: HostUser = {
    ...defaultUser,
    id: userId,
    first_name: firstNameInput.value.trim() || defaultUser.first_name,
    last_name: lastNameInput.value.trim() || defaultUser.last_name,
    photo_url: selectedPhotoUrl() || defaultUser.photo_url,
  };
  const chat = selectedChat();

  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `host_${Date.now()}`,
    chat: JSON.stringify(chat),
    user: JSON.stringify({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      language_code: user.language_code,
      photo_url: user.photo_url,
    }),
  };
  if (startParam) fields.start_param = startParam;

  const webAppData = await signInitData(fields, token);
  const url = new URL(miniAppUrl);
  url.hash = new URLSearchParams({
    WebAppData: webAppData,
    WebAppPlatform: profile.platform,
    WebAppVersion: profile.version,
    WebAppDeviceName: profile.deviceName,
    MaxHost: "1",
    MaxHostReload: String(Date.now()),
  }).toString();
  return url.toString();
}

async function reloadMiniApp(): Promise<void> {
  sheets.cancelAll();
  renderProfile(getProfile(selectedPlatform()));
  const nextSrc = await buildIframeSrc();
  iframe.removeAttribute("src");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  iframe.src = nextSrc;
}

function setChromeMenuOpen(open: boolean): void {
  chromeMenuPanel.hidden = !open;
  chromeMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function toggleChromeMenu(): void {
  setChromeMenuOpen(chromeMenuPanel.hidden);
}

chromeMenuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleChromeMenu();
});

chromeRefreshBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setChromeMenuOpen(false);
  void reloadMiniApp();
});

chromeMenuPanel.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.querySelector("#refresh-qr")!.addEventListener("click", () => {
  void renderMobileQr();
});

document.addEventListener("click", (event) => {
  if (chromeMenuPanel.hidden) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (chromeMenuBtn.contains(target) || chromeMenuPanel.contains(target)) return;
  setChromeMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setChromeMenuOpen(false);
});

document.querySelector("#reload")!.addEventListener("click", () => {
  void reloadMiniApp();
});

document.querySelector("#reset-native")!.addEventListener("click", () => {
  resetNativeState(selectedPlatform());
  sheets.cancelAll();
  renderStatus();
});

platformSelect.addEventListener("change", () => {
  void reloadMiniApp();
});

backBtn.addEventListener("click", () => sendBackPressed(ctx()));
closeBtn.addEventListener("click", () => {
  if (needCloseConfirm && !window.confirm("Закрыть мини-приложение?")) return;
  sheets.cancelAll();
  iframe.removeAttribute("src");
});

loadSettings();
applyUrlOverrides();
if (!mobileHostUrlInput.value.trim()) {
  mobileHostUrlInput.value = devLanUrls[0] ?? window.location.origin;
}
const esiaReturn = applyStartAppFromUrl();

const persistTargets: Array<HTMLElement & { value: string }> = [
  miniAppUrlInput,
  botTokenInput,
  platformSelect,
  entryPointSelect,
  startParamInput,
  mobileHostUrlInput,
  windowWidthInput,
  windowHeightInput,
  userIdInput,
  photoUrlInput,
  chatIdInput,
  chatTypeSelect,
  sheetModeSelect,
  firstNameInput,
  lastNameInput,
];

for (const el of persistTargets) {
  el.addEventListener("input", () => {
    saveSettings();
    renderStatus();
    void renderMobileQr();
    renderProfile(getProfile(selectedPlatform()));
  });
  el.addEventListener("change", () => {
    saveSettings();
    renderStatus();
    void renderMobileQr();
    renderProfile(getProfile(selectedPlatform()));
  });
}

type MobileTab = "settings" | "app" | "logs";
let activeMobileTab: MobileTab = "app";

function setMobileTab(tab: MobileTab): void {
  settingsPaneEl.classList.toggle("mobile-pane--hidden", tab !== "settings");
  appPaneEl.classList.toggle("mobile-pane--hidden", tab !== "app");
  logsPaneEl.classList.toggle("mobile-pane--hidden", tab !== "logs");

  // In case the iframe has been hidden during initial load.
  if (tab === "app" && !iframe.getAttribute("src")) {
    void reloadMiniApp();
  }

  for (const [key, btn] of Object.entries(mobileTabButtons) as Array<
    [MobileTab, HTMLButtonElement]
  >) {
    const isActive = key === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }
}

function syncMobileTabs(): void {
  const isMobile = window.matchMedia("(max-width: 720px)").matches;
  mobileTabsEl.hidden = !isMobile;

  if (!isMobile) {
    settingsPaneEl.classList.remove("mobile-pane--hidden");
    appPaneEl.classList.remove("mobile-pane--hidden");
    logsPaneEl.classList.remove("mobile-pane--hidden");
    return;
  }

  setMobileTab(activeMobileTab);
}

mobileTabButtons.settings.addEventListener("click", () => {
  activeMobileTab = "settings";
  setMobileTab(activeMobileTab);
});
mobileTabButtons.app.addEventListener("click", () => {
  activeMobileTab = "app";
  setMobileTab(activeMobileTab);
});
mobileTabButtons.logs.addEventListener("click", () => {
  activeMobileTab = "logs";
  setMobileTab(activeMobileTab);
});

window.addEventListener("resize", syncMobileTabs);
syncMobileTabs();

renderMobileHostPresets();
void renderMobileQr();
void reloadMiniApp().then(() => {
  if (esiaReturn) {
    bannerEl.classList.add("visible");
    bannerEl.textContent =
      "Миниапп запущен с reference token из ESIA (startapp в URL).";
  }
});

void watchDocs()
  .then((result) => {
    if (!result.changed && result.missing.length === 0) return;
    bannerEl.classList.add("visible");
    bannerEl.textContent = result.changed
      ? `Документация MAX Bridge обновилась. Проверьте хост. Не покрыто: ${result.missing.join(", ") || "—"}`
      : `В документации есть методы вне стенда: ${result.missing.join(", ")}`;
  })
  .catch(() => {
    bannerEl.classList.add("visible");
    bannerEl.textContent = "Не удалось проверить документацию MAX Bridge.";
  });
