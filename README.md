# Arcane Web Apps

<p align="center">
  <img src="assets/webb-apps-icon-source.png" alt="Arcane Web Apps icon" width="180" />
</p>

Turn the websites you use every day into focused desktop apps.

Add a URL, give it a name, and Web Apps opens it in a clean, frameless window.
Optional global shortcuts keep each app one keystroke away.

## Features

- Turn any website into a frameless desktop window
- Launch apps with optional global keyboard shortcuts
- Keep Web Apps running quietly in the menu bar or system tray
- Edit and organize your apps locally
- No account, telemetry, or cloud service

## Install

Download the latest version from
[GitHub Releases](https://github.com/DevelDoe/arcane_webb_apps/releases).

The current macOS build is for Apple Silicon and is unsigned. If macOS blocks it,
extract the app, control-click it, and choose **Open** once.

## Getting started

1. Open Web Apps and select **Add web app**.
2. Enter a name and website URL.
3. Optionally focus the shortcut field and press your preferred key combination.
4. Select the app card—or use its shortcut—to launch it.

Use the settings icon or right-click an app to edit it. Drag a frameless window from
the small handle at its top. Close it with `⌘W` on macOS or `Ctrl+W` on Windows and Linux.
Reload with `⌘R`/`Ctrl+R`, minimize with `⌘M`/`Alt+F9`, and toggle
fullscreen with `⌃⌘F`/`F11`. Open DevTools with `F12`. On macOS you can also use **Window → Toggle Developer Tools**.

On macOS, closing the main launcher hides Web Apps in the menu bar, where it
continues listening for your shortcuts. On Windows, **Close** quits the app.
**Minimize** sends it to the tray when that setting is on (the default). Choose
**Quit Web Apps** from the tray (Windows) or menu bar (macOS) to stop it completely.

Start on boot is on by default on Windows and macOS. You can change it in Settings.

> [!NOTE]
> Some websites restrict sign-in or features inside embedded webviews. Those
> restrictions are controlled by the website.

## Build from source

Install [Rust](https://www.rust-lang.org/tools/install), Node.js 20+, the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), and Tauri CLI 2.

```sh
git clone git@github.com:DevelDoe/arcane_webb_apps.git
cd arcane_webb_apps/frontend
npm install
cd ../backend
cargo tauri dev
```

## Windows

Web Apps uses WebView2 (bundled with Windows 11 and recent Microsoft Edge).

- Packaged builds should not open a console window. `cargo tauri dev` still uses the terminal you launched it from.
- Press `F12` or `Ctrl+Shift+I` in the focused window to open DevTools. You can also use **Window → Toggle Developer Tools**.
- Native logs are appended to `%APPDATA%\com.develdoe.arcanewebbapps\logs\web-apps.log`.

## Privacy

Your URLs, shortcuts, and preferences stay in the local application store. Websites
still connect to their own servers as they normally would in a browser.

## License

[MIT](LICENSE)
