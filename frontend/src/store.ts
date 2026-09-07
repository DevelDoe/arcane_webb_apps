import { load, type Store } from "@tauri-apps/plugin-store";

let shellStore: Store | null = null;

async function getShellStore(): Promise<Store> {
  if (!shellStore) shellStore = await load("shell.json", { defaults: {}, autoSave: 250 });
  return shellStore;
}

export type WebbAppsSettings = {
  alwaysOnTop: boolean;
  compactMode: boolean;
  dismissCloseHint: boolean;
};

export type WebApp = {
  id: string;
  name: string;
  url: string;
  shortcut: string;
};

const defaults: WebbAppsSettings = {
  alwaysOnTop: false,
  compactMode: false,
  dismissCloseHint: false,
};

export async function readSettings(): Promise<WebbAppsSettings> {
  const shellStore = await getShellStore();
  return {
    alwaysOnTop: (await shellStore.get<boolean>("settings.alwaysOnTop")) ?? defaults.alwaysOnTop,
    compactMode: (await shellStore.get<boolean>("settings.compactMode")) ?? defaults.compactMode,
    dismissCloseHint: (await shellStore.get<boolean>("settings.dismissCloseHint")) ?? defaults.dismissCloseHint,
  };
}

export async function writeSettings(settings: WebbAppsSettings): Promise<void> {
  const shellStore = await getShellStore();
  await shellStore.set("settings.alwaysOnTop", settings.alwaysOnTop);
  await shellStore.set("settings.compactMode", settings.compactMode);
  await shellStore.set("settings.dismissCloseHint", settings.dismissCloseHint);
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
