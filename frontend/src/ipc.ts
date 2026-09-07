import { invoke } from "@tauri-apps/api/core";

export const ipc = {
  openWebApp: (id: string, name: string, url: string) =>
    invoke<void>("open_web_app", { id, name, url }),
  openSettings: () => invoke<void>("open_settings_window"),
  resetLocalData: () => invoke<void>("reset_local_user_data"),
};
