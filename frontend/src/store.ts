import { load, type Store } from "@tauri-apps/plugin-store";

let shellStore: Store | null = null;

async function getShellStore(): Promise<Store> {
  if (!shellStore) shellStore = await load("shell.json", { defaults: {}, autoSave: 250 });
  return shellStore;
}

export type WebAppsSettings = {
  alwaysOnTop: boolean;
  dismissCloseHint: boolean;
  startOnBoot: boolean;
  minimizeToTray: boolean;
};

export type WebApp = {
  id: string;
  name: string;
  url: string;
  shortcut: string;
};

const defaults: WebAppsSettings = {
  alwaysOnTop: false,
  dismissCloseHint: false,
  startOnBoot: true,
  minimizeToTray: true,
};

export async function readSettings(): Promise<WebAppsSettings> {
  const shellStore = await getShellStore();
  return {
    alwaysOnTop: (await shellStore.get<boolean>("settings.alwaysOnTop")) ?? defaults.alwaysOnTop,
    dismissCloseHint: (await shellStore.get<boolean>("settings.dismissCloseHint")) ?? defaults.dismissCloseHint,
    startOnBoot: (await shellStore.get<boolean>("settings.startOnBoot")) ?? defaults.startOnBoot,
    minimizeToTray: (await shellStore.get<boolean>("settings.minimizeToTray")) ?? defaults.minimizeToTray,
  };
}

export async function writeSettings(settings: WebAppsSettings): Promise<void> {
  const shellStore = await getShellStore();
  await shellStore.set("settings.alwaysOnTop", settings.alwaysOnTop);
  await shellStore.delete("settings.compactMode");
  await shellStore.set("settings.dismissCloseHint", settings.dismissCloseHint);
  await shellStore.set("settings.startOnBoot", settings.startOnBoot);
  await shellStore.set("settings.minimizeToTray", settings.minimizeToTray);
  await shellStore.save();
}

export async function setCloseHintDismissed(dismissed: boolean): Promise<void> {
  const shellStore = await getShellStore();
  await shellStore.set("settings.dismissCloseHint", dismissed);
  await shellStore.save();
}

export async function readWebApps(): Promise<WebApp[]> {
  const shellStore = await getShellStore();
  return (await shellStore.get<WebApp[]>("webApps")) ?? [];
}

export async function writeWebApps(webApps: WebApp[]): Promise<void> {
  const shellStore = await getShellStore();
  await shellStore.set("webApps", webApps);
  await shellStore.save();
}
