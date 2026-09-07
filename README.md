# Arcane Webb Apps

<p align="center">
  <img src="assets/webb-apps-icon-source.png" alt="Arcane Webb Apps icon" width="180" />
</p>

Turn the websites you use every day into focused desktop apps.

Add a URL, give it a name, and Webb Apps opens it in a clean, frameless window.
Optional global shortcuts keep each app one keystroke away.

## Features

- Turn any website into a frameless desktop window
- Launch apps with optional global keyboard shortcuts
- Keep Webb Apps running quietly in the menu bar or system tray
- Edit and organize your apps locally
- No account, telemetry, or cloud service

## Install

Download the latest version from
[GitHub Releases](https://github.com/DevelDoe/arcane_webb_apps/releases).

The current macOS build is for Apple Silicon and is unsigned. If macOS blocks it,
extract the app, control-click it, and choose **Open** once.

## Getting started

1. Open Webb Apps and select **Add web app**.
2. Enter a name and website URL.
3. Optionally focus the shortcut field and press your preferred key combination.
4. Select the app card—or use its shortcut—to launch it.

Use the settings icon or right-click an app to edit it. Drag a frameless window from
the small handle at its top. Close it with `⌘W` on macOS or `Ctrl+W` on Windows and
Linux.

Closing the main launcher sends Webb Apps to the menu bar or system tray, where it
continues listening for your shortcuts. Choose **Quit Webb Apps** from the tray menu
to stop it completely.

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

## Privacy

Your URLs, shortcuts, and preferences stay in the local application store. Websites
still connect to their own servers as they normally would in a browser.

## License

[MIT](LICENSE)
