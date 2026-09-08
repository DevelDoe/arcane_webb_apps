import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { ipc } from "./ipc";
import { readSettings, readWebApps, setCloseHintDismissed, type WebApp, writeSettings, writeWebApps } from "./store";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app")!;
if (!app) throw new Error("Missing #app root");

let registeredShortcuts = new Set<string>();

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

function shortcutFromKeyEvent(event: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  if ((event.key === "Backspace" || event.key === "Delete") && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
    return "";
  }

  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");

  const primaryKey = event.code || event.key;
  return [...modifiers, primaryKey].join("+");
}

async function syncShortcuts(webApps: WebApp[]): Promise<string[]> {
  const errors: string[] = [];
  for (const shortcut of registeredShortcuts) await unregister(shortcut).catch(() => undefined);
  registeredShortcuts = new Set();

  for (const webApp of webApps) {
    if (!webApp.shortcut) continue;
    try {
      await register(webApp.shortcut, () => void requestWebAppLaunch(webApp));
      registeredShortcuts.add(webApp.shortcut);
    } catch (reason) {
      errors.push(`${webApp.name}: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }
  return errors;
}

function closeShortcut(): string {
  if (/Mac|iPhone|iPad|iPod/.test(navigator.platform)) return "⌘W";
  if (/Win/.test(navigator.platform)) return "Ctrl+W or Alt+F4";
  return "Ctrl+W";
}

async function requestWebAppLaunch(webApp: WebApp): Promise<void> {
  const settings = await readSettings();
  if (settings.dismissCloseHint) {
    await ipc.openWebApp(webApp.id, webApp.name, webApp.url);
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
  const webApps = await readWebApps();
  await getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop);
  const shortcutErrors = await syncShortcuts(webApps);
  app.innerHTML = `
    <section class="workspace-shell">
      <header class="titlebar" data-tauri-drag-region>
        <div><span class="brand-dot"></span><strong>ARCANE WEBB APPS</strong></div>
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
              <div class="app-icon">${escapeHtml(webApp.name.slice(0, 1).toUpperCase())}</div>
              <div class="app-info">
                <h2>${escapeHtml(webApp.name)}</h2>
                <p>${escapeHtml(new URL(webApp.url).hostname)}</p>
                ${webApp.shortcut ? `<div class="app-shortcut"><span>Shortcut</span><kbd title="${escapeHtml(webApp.shortcut)}">${escapeHtml(webApp.shortcut)}</kbd></div>` : `<div class="app-shortcut muted-shortcut">No shortcut</div>`}
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
    shortcutInput.value = webApp?.shortcut ?? "";
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
    if (shortcut !== null) shortcutInput.value = shortcut;
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

  document.querySelectorAll<HTMLButtonElement>("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const webApp = webApps.find((candidate) => candidate.id === button.dataset.deleteId);
      if (!webApp || !confirm(`Remove ${webApp.name}?`)) return;
      await writeWebApps(webApps.filter((candidate) => candidate.id !== webApp.id));
      await renderWorkspace();
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const error = document.querySelector<HTMLElement>("#form-error");
    try {
      const name = String(data.get("name") ?? "").trim();
      const url = normalizeUrl(String(data.get("url") ?? ""));
      const shortcut = String(data.get("shortcut") ?? "").trim();
      const editingId = form.dataset.editingId || null;
      if (!name) throw new Error("Give the web app a name.");
      if (shortcut && webApps.some((candidate) => candidate.id !== editingId && candidate.shortcut.toLowerCase() === shortcut.toLowerCase())) {
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
    await ipc.openWebApp(webApp.id, webApp.name, webApp.url);
  });
}

async function renderSettings(): Promise<void> {
  const settings = await readSettings();
  app.innerHTML = `
    <section class="settings-shell">
      <p class="eyebrow">ARCANE WEBB APPS</p>
      <h1>Settings</h1>
      <label class="setting-row"><span><strong>Always on top</strong><small>Keep Webb Apps above other windows.</small></span><input id="always-on-top" type="checkbox" ${settings.alwaysOnTop ? "checked" : ""} /></label>
      <label class="setting-row"><span><strong>Compact interface</strong><small>Reserve space for a denser future workspace.</small></span><input id="compact-mode" type="checkbox" ${settings.compactMode ? "checked" : ""} /></label>
      <div class="settings-actions"><button class="danger" id="reset-button">Reset local data</button><button id="close-button">Done</button></div>
    </section>`;

  const persist = async () => {
    const next = {
      alwaysOnTop: document.querySelector<HTMLInputElement>("#always-on-top")?.checked ?? false,
      compactMode: document.querySelector<HTMLInputElement>("#compact-mode")?.checked ?? false,
      dismissCloseHint: settings.dismissCloseHint,
    };
    await writeSettings(next);
    const mainWindow = (await getAllWindows()).find((window) => window.label === "main");
    await mainWindow?.setAlwaysOnTop(next.alwaysOnTop);
  };
  document.querySelectorAll<HTMLInputElement>(".setting-row input").forEach((input) => input.addEventListener("change", () => void persist()));
  document.querySelector("#reset-button")?.addEventListener("click", () => void ipc.resetLocalData());
  document.querySelector("#close-button")?.addEventListener("click", () => void getCurrentWindow().close());
}

async function bootstrap(): Promise<void> {
  if (new URLSearchParams(location.search).get("view") === "settings") {
    await renderSettings();
    return;
  }
  await renderWorkspace();
}

void bootstrap();
