import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { ipc } from "./ipc";
import { readSettings, readWebApps, setCloseHintDismissed, type WebApp, writeSettings, writeWebApps } from "./store";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app")!;
if (!app) throw new Error("Missing #app root");

let registeredShortcuts = new Set<string>();
let shortcutSync: Promise<string[]> = Promise.resolve([]);

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function normalizeUrl(value: string): string {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an HTTP or HTTPS website URL.");
  return url.toString();
}

function isMac(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function normalizeShortcutKey(part: string): string {
  if (/^Key[A-Z]$/i.test(part)) return part.slice(3).toUpperCase();
  if (/^Digit[0-9]$/i.test(part)) return part.slice(5);
  if (/^F\d{1,2}$/i.test(part)) return part.toUpperCase();
  const arrows: Record<string, string> = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  };
  if (arrows[part]) return arrows[part];
  if (part.length === 1) return part.toUpperCase();
  return part;
}

function pushModifier(modifiers: string[], modifier: string): void {
  if (!modifiers.includes(modifier)) modifiers.push(modifier);
}

function normalizeShortcut(value: string): string {
  const parts = value.split("+").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";
  const modifiers: string[] = [];
  let key = "";
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (["commandorcontrol", "cmdorctrl"].includes(lower)) {
      pushModifier(modifiers, isMac() ? "Command" : "Control");
      continue;
    }
    if (["cmd", "command", "meta", "super"].includes(lower)) {
      pushModifier(modifiers, "Command");
      continue;
    }
    if (lower === "control" || lower === "ctrl") {
      pushModifier(modifiers, "Control");
      continue;
    }
    if (lower === "alt" || lower === "option") {
      pushModifier(modifiers, "Alt");
      continue;
    }
    if (lower === "shift") {
      pushModifier(modifiers, "Shift");
      continue;
    }
    key = normalizeShortcutKey(part);
  }
  return key ? [...modifiers, key].join("+") : "";
}

function formatShortcutForDisplay(shortcut: string): string {
  const normalized = normalizeShortcut(shortcut);
  if (isMac()) {
    return normalized
      .replaceAll("Command+", "⌘")
      .replaceAll("Control+", "⌃")
      .replaceAll("Alt+", "⌥")
      .replaceAll("Shift+", "⇧");
  }
  return normalized
    .replaceAll("Command", "Cmd")
    .replaceAll("Control", "Ctrl");
}

function formatShortcutError(shortcut: string, reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  const label = formatShortcutForDisplay(shortcut);
  if (/already registered/i.test(raw)) return `${label} is already in use`;
  return raw.replace(/HotKey \{[^}]+\}/g, label);
}

function shortcutFromKeyEvent(event: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  if ((event.key === "Backspace" || event.key === "Delete") && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
    return "";
  }

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.metaKey) modifiers.push("Command");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return normalizeShortcut([...modifiers, event.code || event.key].join("+"));
}

async function registerShortcuts(webApps: WebApp[]): Promise<string[]> {
  const errors: string[] = [];
  await unregisterAll().catch(() => undefined);
  registeredShortcuts = new Set();

  for (const webApp of webApps) {
    const shortcut = normalizeShortcut(webApp.shortcut);
    if (!shortcut) continue;
    try {
      await register(shortcut, (event) => {
        if (event.state !== "Pressed") return;
        void requestWebAppLaunch(webApp);
      });
      registeredShortcuts.add(shortcut);
    } catch (reason) {
      errors.push(`${webApp.name}: ${formatShortcutError(shortcut, reason)}`);
    }
  }
  return errors;
}

function syncShortcuts(webApps: WebApp[]): Promise<string[]> {
  const next = shortcutSync.then(
    () => registerShortcuts(webApps),
    () => registerShortcuts(webApps),
  );
  shortcutSync = next;
  return next;
}

function faviconUrl(websiteUrl: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(websiteUrl).hostname)}&sz=128`;
}

function closeShortcut(): string {
  if (isMac()) return "⌘W";
  return "Ctrl+W";
}

function isWindows(): boolean {
  return /Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent);
}

async function applyShellPrefs(startOnBoot: boolean, minimizeToTray: boolean): Promise<void> {
  await ipc.applyShellPrefs(startOnBoot, minimizeToTray);
}

function installWindowShortcuts(): void {
  if (!isWindows()) return;
  window.addEventListener("keydown", (event) => {
    const current = getCurrentWindow();
    const ctrl = event.ctrlKey || event.metaKey;
    if (event.key === "F11") {
      event.preventDefault();
      void current.isFullscreen().then((isFull) => current.setFullscreen(!isFull));
      return;
    }
    if (ctrl && event.key.toLowerCase() === "w") {
      event.preventDefault();
      void current.close();
      return;
    }
    if (ctrl && event.key.toLowerCase() === "r") {
      event.preventDefault();
      location.reload();
      return;
    }
    if (event.altKey && event.key === "F9") {
      event.preventDefault();
      void current.minimize();
    }
  });
}

async function launchWebApp(webApp: WebApp): Promise<void> {
  try {
    await ipc.openWebApp(webApp.id, webApp.name, webApp.url);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    window.alert(`Could not open ${webApp.name}: ${message}`);
  }
}

async function requestWebAppLaunch(webApp: WebApp): Promise<void> {
  const settings = await readSettings();
  if (settings.dismissCloseHint) {
    await launchWebApp(webApp);
    return;
  }

  const mainWindow = getCurrentWindow();
  await mainWindow.show();
  await mainWindow.setFocus();
  const dialog = document.querySelector<HTMLDialogElement>("#close-hint-dialog");
  const appName = document.querySelector<HTMLElement>("#close-hint-app-name");
  const shortcut = document.querySelector<HTMLElement>("#close-shortcut");
  const checkbox = document.querySelector<HTMLInputElement>("#hide-close-hint");
  if (!dialog || !appName || !shortcut || !checkbox) return;
  appName.textContent = webApp.name;
  shortcut.textContent = closeShortcut();
  checkbox.checked = false;
  dialog.dataset.pendingAppId = webApp.id;
  dialog.showModal();
}

async function renderWorkspace(): Promise<void> {
  const settings = await readSettings();
  const storedWebApps = await readWebApps();
  const webApps = storedWebApps.map((webApp) => ({ ...webApp, shortcut: normalizeShortcut(webApp.shortcut) }));
  if (webApps.some((webApp, index) => webApp.shortcut !== storedWebApps[index]?.shortcut)) {
    await writeWebApps(webApps);
  }
  await applyShellPrefs(settings.startOnBoot, settings.minimizeToTray).catch(() => undefined);
  await getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop);
  const shortcutErrors = await syncShortcuts(webApps);
  app.innerHTML = `
    <section class="workspace-shell">
      <header class="titlebar" data-tauri-drag-region>
        <div><span class="brand-dot"></span><strong>ARCANE WEB APPS</strong></div>
        <nav>
          <button class="ghost" id="settings-button">Settings</button>
          <button id="add-button">Add web app</button>
        </nav>
      </header>
      <div class="workspace">
        <p class="eyebrow">YOUR WEB APPS</p>
        <h1>Everything you use,<br />one shortcut away.</h1>
        <p class="muted">Turn any website into a focused, frameless desktop window.</p>
        ${shortcutErrors.length ? `<div class="notice">Some shortcuts could not be registered:<br />${shortcutErrors.map(escapeHtml).join("<br />")}</div>` : ""}
        <div class="app-grid">
          ${webApps.length ? webApps.map((webApp) => `
            <article class="app-card" data-open-id="${webApp.id}" tabindex="0" title="Open ${escapeHtml(webApp.name)} · Right-click to edit">
              <div class="app-icon">
                <span class="app-letter">${escapeHtml(webApp.name.slice(0, 1).toUpperCase())}</span>
                <img class="app-favicon" src="${escapeHtml(faviconUrl(webApp.url))}" alt="" onerror="this.classList.add('is-failed')" />
              </div>
              <div class="app-info">
                <h2>${escapeHtml(webApp.name)}</h2>
                <p>${escapeHtml(new URL(webApp.url).hostname)}</p>
                ${webApp.shortcut ? `<div class="app-shortcut"><span>Shortcut</span><kbd title="${escapeHtml(webApp.shortcut)}">${escapeHtml(formatShortcutForDisplay(webApp.shortcut))}</kbd></div>` : `<div class="app-shortcut muted-shortcut">No shortcut</div>`}
              </div>
              <div class="card-actions">
                <button class="icon-button" data-card-action data-edit-id="${webApp.id}" aria-label="Edit ${escapeHtml(webApp.name)}" title="Edit web app">&#9881;&#65038;</button>
                <button class="icon-button" data-card-action data-delete-id="${webApp.id}" aria-label="Remove ${escapeHtml(webApp.name)}" title="Remove web app">×</button>
              </div>
            </article>`).join("") : `
            <button class="empty-state" id="empty-add-button">
              <span>＋</span><strong>Add your first web app</strong><small>Paste a URL and optionally assign a global shortcut.</small>
            </button>`}
        </div>
      </div>
      <dialog id="app-dialog">
        <form method="dialog" id="app-form">
          <div class="dialog-heading"><div><p class="eyebrow" id="app-form-eyebrow">NEW WEB APP</p><h2 id="app-form-title">Add a website</h2></div><button type="button" class="icon-button" id="cancel-button">×</button></div>
          <label>Name<input name="name" placeholder="Linear" autocomplete="off" required /></label>
          <label>Website URL<input name="url" placeholder="linear.app" inputmode="url" autocomplete="url" required /></label>
          <label>Global shortcut <span class="optional">Optional</span><input class="shortcut-input" name="shortcut" placeholder="Focus here, then press your shortcut" autocomplete="off" readonly /></label>
          <p class="hint">Press the keys together to record them. Backspace or Delete clears the shortcut.</p>
          <p class="error" id="form-error"></p>
          <div class="dialog-actions"><button type="button" class="ghost" id="cancel-secondary">Cancel</button><button type="submit" id="app-form-submit">Add web app</button></div>
        </form>
      </dialog>
      <dialog id="close-hint-dialog" class="hint-dialog">
        <div class="shortcut-hero" id="close-shortcut">⌘W</div>
        <p class="eyebrow">QUICK REMINDER</p>
        <h2>Using <span id="close-hint-app-name"></span></h2>
        <div class="usage-tips">
          <p><strong>Close it</strong><span>Press <b id="close-shortcut-copy">${closeShortcut()}</b> to close the frameless window.</span></p>
          <p><strong>Move it</strong><span>Drag the small fixed handle at the top of the web app. It floats over the page and takes up no layout space.</span></p>
          <p><strong>Place it</strong><span>For fast, precise positioning, a Special/Hyper key or a window-zoning app is usually the best experience.</span></p>
        </div>
        <label class="check-row"><input id="hide-close-hint" type="checkbox" /> Don’t show this again</label>
        <div class="dialog-actions"><button type="button" class="ghost" id="close-hint-cancel">Cancel</button><button type="button" id="close-hint-continue">Open web app</button></div>
      </dialog>
      <dialog id="delete-dialog" class="hint-dialog">
        <p class="eyebrow">REMOVE WEB APP</p>
        <h2>Remove <span id="delete-app-name"></span>?</h2>
        <p class="muted">This only removes it from Web Apps. The website itself is unchanged.</p>
        <div class="dialog-actions"><button type="button" class="ghost" id="delete-cancel">Cancel</button><button type="button" class="danger" id="delete-confirm">Remove</button></div>
      </dialog>
    </section>`;

  document.querySelector("#settings-button")?.addEventListener("click", () => void ipc.openSettings());
  const dialog = document.querySelector<HTMLDialogElement>("#app-dialog");
  const form = document.querySelector<HTMLFormElement>("#app-form");
  const showAppForm = (webApp?: WebApp) => {
    if (!dialog || !form) return;
    form.reset();
    form.dataset.editingId = webApp?.id ?? "";
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const urlInput = form.elements.namedItem("url") as HTMLInputElement;
    const shortcutInput = form.elements.namedItem("shortcut") as HTMLInputElement;
    nameInput.value = webApp?.name ?? "";
    urlInput.value = webApp?.url ?? "";
    const shortcut = webApp?.shortcut ? normalizeShortcut(webApp.shortcut) : "";
    shortcutInput.dataset.shortcut = shortcut;
    shortcutInput.value = shortcut ? formatShortcutForDisplay(shortcut) : "";
    document.querySelector("#app-form-eyebrow")!.textContent = webApp ? "EDIT WEB APP" : "NEW WEB APP";
    document.querySelector("#app-form-title")!.textContent = webApp ? `Edit ${webApp.name}` : "Add a website";
    document.querySelector("#app-form-submit")!.textContent = webApp ? "Save changes" : "Add web app";
    document.querySelector("#form-error")!.textContent = "";
    dialog.showModal();
    nameInput.focus();
  };
  document.querySelector("#add-button")?.addEventListener("click", () => showAppForm());
  document.querySelector("#empty-add-button")?.addEventListener("click", () => showAppForm());
  document.querySelector("#cancel-button")?.addEventListener("click", () => dialog?.close());
  document.querySelector("#cancel-secondary")?.addEventListener("click", () => dialog?.close());

  const shortcutInput = form?.elements.namedItem("shortcut") as HTMLInputElement | null;
  shortcutInput?.addEventListener("keydown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const shortcut = shortcutFromKeyEvent(event);
    if (shortcut !== null) {
      shortcutInput.dataset.shortcut = shortcut;
      shortcutInput.value = shortcut ? formatShortcutForDisplay(shortcut) : "";
    }
  });

  document.querySelectorAll<HTMLElement>("[data-open-id]").forEach((card) => {
    const open = () => {
      const webApp = webApps.find((candidate) => candidate.id === card.dataset.openId);
      if (webApp) void requestWebAppLaunch(webApp);
    };
    card.addEventListener("click", (event) => {
      if (!(event.target as HTMLElement).closest("[data-card-action]")) open();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") open();
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const webApp = webApps.find((candidate) => candidate.id === card.dataset.openId);
      if (webApp) showAppForm(webApp);
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-edit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const webApp = webApps.find((candidate) => candidate.id === button.dataset.editId);
      if (webApp) showAppForm(webApp);
    });
  });

  const deleteDialog = document.querySelector<HTMLDialogElement>("#delete-dialog");
  const deleteAppName = document.querySelector<HTMLElement>("#delete-app-name");
  document.querySelectorAll<HTMLButtonElement>("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const webApp = webApps.find((candidate) => candidate.id === button.dataset.deleteId);
      if (!webApp || !deleteDialog || !deleteAppName) return;
      deleteAppName.textContent = webApp.name;
      deleteDialog.dataset.pendingAppId = webApp.id;
      deleteDialog.showModal();
    });
  });
  document.querySelector("#delete-cancel")?.addEventListener("click", () => deleteDialog?.close());
  document.querySelector("#delete-confirm")?.addEventListener("click", async () => {
    const webApp = webApps.find((candidate) => candidate.id === deleteDialog?.dataset.pendingAppId);
    if (!webApp) return;
    await writeWebApps(webApps.filter((candidate) => candidate.id !== webApp.id));
    deleteDialog?.close();
    await renderWorkspace();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const error = document.querySelector<HTMLElement>("#form-error");
    try {
      const name = String(data.get("name") ?? "").trim();
      const url = normalizeUrl(String(data.get("url") ?? ""));
      const shortcut = normalizeShortcut(shortcutInput?.dataset.shortcut ?? String(data.get("shortcut") ?? ""));
      const editingId = form.dataset.editingId || null;
      if (!name) throw new Error("Give the web app a name.");
      if (shortcut && webApps.some((candidate) => candidate.id !== editingId && normalizeShortcut(candidate.shortcut).toLowerCase() === shortcut.toLowerCase())) {
        throw new Error("That shortcut is already assigned to another web app.");
      }
      const nextWebApps = editingId
        ? webApps.map((candidate) => candidate.id === editingId ? { ...candidate, name, url, shortcut } : candidate)
        : [...webApps, { id: crypto.randomUUID(), name, url, shortcut }];
      await writeWebApps(nextWebApps);
      if (editingId) await ipc.updateOpenWebApp(editingId, name, url);
      dialog?.close();
      await renderWorkspace();
    } catch (reason) {
      if (error) error.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  });

  const closeHintDialog = document.querySelector<HTMLDialogElement>("#close-hint-dialog");
  document.querySelector("#close-hint-cancel")?.addEventListener("click", () => closeHintDialog?.close());
  document.querySelector("#close-hint-continue")?.addEventListener("click", async () => {
    const webApp = webApps.find((candidate) => candidate.id === closeHintDialog?.dataset.pendingAppId);
    if (!webApp) return;
    const hideHint = document.querySelector<HTMLInputElement>("#hide-close-hint")?.checked ?? false;
    if (hideHint) {
      await setCloseHintDismissed(true);
    }
    closeHintDialog?.close();
    await launchWebApp(webApp);
  });
}

async function renderSettings(): Promise<void> {
  const settings = await readSettings();
  app.innerHTML = `
    <section class="settings-shell">
      <p class="eyebrow">ARCANE WEB APPS</p>
      <h1>Settings</h1>
      <label class="setting-row"><span><strong>Always on top</strong><small>Keep Web Apps above other windows.</small></span><input id="always-on-top" type="checkbox" ${settings.alwaysOnTop ? "checked" : ""} /></label>
      <label class="setting-row"><span><strong>Start on boot</strong><small>Open Web Apps when you sign in to this computer.</small></span><input id="start-on-boot" type="checkbox" ${settings.startOnBoot ? "checked" : ""} /></label>
      ${isWindows() ? `<label class="setting-row"><span><strong>Minimize to tray</strong><small>Minimize hides the launcher in the tray. Close quits Web Apps.</small></span><input id="minimize-to-tray" type="checkbox" ${settings.minimizeToTray ? "checked" : ""} /></label>` : ""}
      <p class="error" id="settings-error"></p>
      <div class="settings-actions"><button class="danger" id="reset-button">Reset local data</button><button id="close-button">Done</button></div>
    </section>`;

  const persist = async () => {
    const error = document.querySelector<HTMLElement>("#settings-error");
    if (error) error.textContent = "";
    const next = {
      alwaysOnTop: document.querySelector<HTMLInputElement>("#always-on-top")?.checked ?? false,
      dismissCloseHint: settings.dismissCloseHint,
      startOnBoot: document.querySelector<HTMLInputElement>("#start-on-boot")?.checked ?? true,
      minimizeToTray: document.querySelector<HTMLInputElement>("#minimize-to-tray")?.checked ?? settings.minimizeToTray,
    };
    try {
      await writeSettings(next);
      await applyShellPrefs(next.startOnBoot, next.minimizeToTray);
      const mainWindow = (await getAllWindows()).find((window) => window.label === "main");
      await mainWindow?.setAlwaysOnTop(next.alwaysOnTop);
    } catch (reason) {
      if (error) error.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  };
  document.querySelectorAll<HTMLInputElement>(".setting-row input").forEach((input) => input.addEventListener("change", () => void persist()));
  document.querySelector("#reset-button")?.addEventListener("click", () => void ipc.resetLocalData());
  document.querySelector("#close-button")?.addEventListener("click", () => void getCurrentWindow().close());
}

async function bootstrap(): Promise<void> {
  installWindowShortcuts();
  if (new URLSearchParams(location.search).get("view") === "settings") {
    await renderSettings();
    return;
  }
  await renderWorkspace();
}

void bootstrap();
