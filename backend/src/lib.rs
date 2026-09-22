use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
#[cfg(not(target_os = "windows"))]
use tauri::menu::SubmenuBuilder;
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_store::StoreExt;

struct AppPrefs {
    minimize_to_tray: AtomicBool,
}

fn show_launcher(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_to_tray(window: &WebviewWindow) {
    let _ = window.hide();
    let _ = window.unminimize();
}

fn stored_bool(app: &tauri::AppHandle, key: &str, default: bool) -> bool {
    app.store("shell.json")
        .ok()
        .and_then(|store| store.get(key))
        .and_then(|value| value.as_bool())
        .unwrap_or(default)
}

fn minimize_to_tray_enabled(app: &tauri::AppHandle) -> bool {
    app.try_state::<AppPrefs>()
        .map(|prefs| prefs.minimize_to_tray.load(Ordering::Relaxed))
        .unwrap_or(true)
}

fn sync_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    let currently_enabled = manager.is_enabled().unwrap_or(false);
    if enabled == currently_enabled {
        return Ok(());
    }
    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
        log_line(app, "start on boot enabled");
    } else {
        manager.disable().map_err(|error| error.to_string())?;
        log_line(app, "start on boot disabled");
    }
    Ok(())
}

fn web_app_label(id: &str) -> Result<String, String> {
    if id.is_empty() || !id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-') {
        return Err("Invalid web app identifier".into());
    }
    Ok(format!("web-app-{id}"))
}

fn log_line(app: &tauri::AppHandle, message: &str) {
    eprintln!("[arcane-web-apps] {message}");
    let Ok(dir) = app.path().app_log_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("web-apps.log"))
    else {
        return;
    };
    let _ = writeln!(file, "{message}");
}

#[cfg(not(target_os = "windows"))]
fn toggle_devtools(window: &WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

fn drag_handle_script(window_label: &str) -> String {
    let shortcuts = if cfg!(target_os = "windows") {
        format!(
            r#"
            window.addEventListener('keydown', (event) => {{
              const internals = window.__TAURI_INTERNALS__;
              if (!internals) return;
              const ctrl = event.ctrlKey || event.metaKey;
              const label = '{window_label}';
              if (event.key === 'F11') {{
                event.preventDefault();
                internals.invoke('plugin:window|is_fullscreen', {{ label }}).then((isFull) => {{
                  internals.invoke('plugin:window|set_fullscreen', {{ label, value: !isFull }});
                }});
                return;
              }}
              if (ctrl && event.key.toLowerCase() === 'w') {{
                event.preventDefault();
                internals.invoke('plugin:window|close', {{ label }});
                return;
              }}
              if (ctrl && event.key.toLowerCase() === 'r') {{
                event.preventDefault();
                location.reload();
                return;
              }}
              if (event.altKey && event.key === 'F9') {{
                event.preventDefault();
                internals.invoke('plugin:window|minimize', {{ label }});
              }}
            }}, true);
            "#
        )
    } else {
        String::new()
    };
    format!(
        r#"
        (() => {{
          const installDragHandle = () => {{
            if (document.getElementById('__web_apps_drag_handle')) return;
            const handle = document.createElement('button');
            handle.id = '__web_apps_drag_handle';
            handle.type = 'button';
            handle.title = 'Drag window';
            handle.setAttribute('aria-label', 'Drag window');
            handle.textContent = '•••';
            Object.assign(handle.style, {{
              position: 'fixed', top: '6px', left: '50%', transform: 'translateX(-50%)',
              width: '48px', height: '20px', padding: '0', margin: '0',
              border: '1px solid rgba(255,255,255,.28)', borderRadius: '999px',
              color: 'rgba(255,255,255,.82)', background: 'rgba(12,16,20,.72)',
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 2px 10px rgba(0,0,0,.3)', cursor: 'move',
              font: '700 10px/18px system-ui', letterSpacing: '2px',
              zIndex: '2147483647', userSelect: 'none', WebkitUserSelect: 'none'
            }});
            handle.addEventListener('mousedown', (event) => {{
              if (event.button !== 0) return;
              event.preventDefault();
              window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging', {{ label: '{window_label}' }});
            }});
            document.documentElement.appendChild(handle);
          }};
          if (document.readyState === 'loading') {{
            document.addEventListener('DOMContentLoaded', installDragHandle, {{ once: true }});
          }} else {{
            installDragHandle();
          }}
          {shortcuts}
        }})();
        "#
    )
}

// WebView2 deadlocks if a window is created from a synchronous command on Windows.
#[tauri::command]
async fn open_web_app(app: tauri::AppHandle, id: String, name: String, url: String) -> Result<(), String> {
    let label = web_app_label(&id)?;
    log_line(&app, &format!("open_web_app id={id} name={name} url={url}"));
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        log_line(&app, &format!("focused existing window {label}"));
        return Ok(());
    }

    let external_url = url
        .parse()
        .map_err(|error| format!("Invalid web app URL: {error}"))?;
    WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::External(external_url))
        .title(name)
        .inner_size(1180.0, 780.0)
        .min_inner_size(480.0, 360.0)
        .decorations(false)
        .center()
        .devtools(true)
        .enable_clipboard_access()
        .initialization_script(drag_handle_script(&label))
        .build()
        .map_err(|error| {
            let message = error.to_string();
            log_line(&app, &format!("failed to open {label}: {message}"));
            message
        })?;
    log_line(&app, &format!("opened window {label}"));
    Ok(())
}

#[tauri::command]
async fn update_open_web_app(app: tauri::AppHandle, id: String, name: String, url: String) -> Result<(), String> {
    let label = web_app_label(&id)?;
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(());
    };
    let external_url = url
        .parse()
        .map_err(|error| format!("Invalid web app URL: {error}"))?;
    window.set_title(&name).map_err(|error| error.to_string())?;
    window.navigate(external_url).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("index.html?view=settings".into()))
        .title("App Settings")
        .inner_size(520.0, 500.0)
        .min_inner_size(420.0, 360.0)
        .devtools(true)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn apply_shell_prefs(app: tauri::AppHandle, start_on_boot: bool, minimize_to_tray: bool) -> Result<(), String> {
    if let Some(prefs) = app.try_state::<AppPrefs>() {
        prefs.minimize_to_tray.store(minimize_to_tray, Ordering::Relaxed);
    }
    sync_autostart(&app, start_on_boot).map_err(|error| {
        log_line(&app, &format!("failed to update start on boot: {error}"));
        format!("Could not update start on boot: {error}")
    })
}

#[tauri::command]
fn reset_local_user_data(app: tauri::AppHandle) -> Result<(), String> {
    let store_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("shell.json");
    if store_path.exists() {
        std::fs::remove_file(store_path).map_err(|error| error.to_string())?;
    }
    if let Some(main) = app.get_webview_window("main") {
        main.reload().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ));

    #[cfg(not(target_os = "windows"))]
    let builder = builder.menu(|app| {
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let reload_window = MenuItem::with_id(
                app,
                "reload-focused-window",
                "Reload Page",
                true,
                Some("CmdOrCtrl+R"),
            )?;
            let minimize_window = MenuItem::with_id(
                app,
                "minimize-focused-window",
                "Minimize",
                true,
                Some(if cfg!(target_os = "macos") { "Cmd+M" } else { "Alt+F9" }),
            )?;
            let fullscreen_window = MenuItem::with_id(
                app,
                "fullscreen-focused-window",
                "Toggle Full Screen",
                true,
                Some(if cfg!(target_os = "macos") { "Ctrl+Cmd+F" } else { "F11" }),
            )?;
            let close_window = MenuItem::with_id(
                app,
                "close-focused-window",
                "Close Window",
                true,
                Some(if cfg!(target_os = "macos") {
                    "Cmd+W"
                } else if cfg!(target_os = "windows") {
                    "Alt+F4"
                } else {
                    "Ctrl+W"
                }),
            )?;
            let close_window_ctrl = if cfg!(target_os = "windows") {
                Some(MenuItem::with_id(
                    app,
                    "close-focused-window-ctrl",
                    "Close Window (Ctrl+W)",
                    true,
                    Some("Ctrl+W"),
                )?)
            } else {
                None
            };
            let toggle_devtools = MenuItem::with_id(
                app,
                "toggle-devtools",
                "Toggle Developer Tools",
                true,
                None::<&str>,
            )?;
            let mut window_menu_builder = SubmenuBuilder::new(app, "Window")
                .item(&reload_window)
                .item(&toggle_devtools)
                .separator()
                .item(&minimize_window)
                .item(&fullscreen_window)
                .separator()
                .item(&close_window);
            if let Some(close_window_ctrl) = &close_window_ctrl {
                window_menu_builder = window_menu_builder.item(close_window_ctrl);
            }
            let window_menu = window_menu_builder.build()?;
            Menu::with_items(app, &[&edit_menu, &window_menu])
        })
        .on_menu_event(|app, event| {
            let Some(window) = app
                .webview_windows()
                .into_values()
                .find(|window| window.is_focused().unwrap_or(false))
            else {
                return;
            };
            match event.id().as_ref() {
                "reload-focused-window" => {
                    let _ = window.reload();
                }
                "toggle-devtools" => toggle_devtools(&window),
                "minimize-focused-window" => {
                    if cfg!(target_os = "windows")
                        && window.label() == "main"
                        && minimize_to_tray_enabled(app)
                    {
                        hide_to_tray(&window);
                    } else {
                        let _ = window.minimize();
                    }
                }
                "fullscreen-focused-window" => {
                    if let Ok(is_fullscreen) = window.is_fullscreen() {
                        let _ = window.set_fullscreen(!is_fullscreen);
                    }
                }
                "close-focused-window" | "close-focused-window-ctrl" => {
                    let _ = window.close();
                }
                _ => {}
            }
        });

    builder
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

            let start_on_boot = stored_bool(app.handle(), "settings.startOnBoot", true);
            let minimize_to_tray = stored_bool(app.handle(), "settings.minimizeToTray", true);
            app.manage(AppPrefs {
                minimize_to_tray: AtomicBool::new(minimize_to_tray),
            });
            if let Err(error) = sync_autostart(app.handle(), start_on_boot) {
                log_line(app.handle(), &format!("failed to apply start on boot: {error}"));
            }

            let open_launcher = MenuItem::with_id(app, "tray-open", "Open Web Apps", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "tray-quit", "Quit Web Apps", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_launcher, &quit])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("application icon is configured"))
                .tooltip("Arcane Web Apps")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray-open" => show_launcher(app),
                    "tray-quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_launcher(tray.app_handle());
                    }
                })
                .build(app)?;

            if let Some(main_window) = app.get_webview_window("main") {
                let window_to_hide = main_window.clone();
                let app_handle = app.handle().clone();
                main_window.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        if cfg!(target_os = "windows") {
                            app_handle.exit(0);
                        } else {
                            api.prevent_close();
                            let _ = window_to_hide.hide();
                        }
                    }
                    WindowEvent::Resized(_) | WindowEvent::Moved(_) | WindowEvent::Focused(_) => {
                        if cfg!(target_os = "windows")
                            && minimize_to_tray_enabled(&app_handle)
                            && window_to_hide.is_minimized().unwrap_or(false)
                        {
                            hide_to_tray(&window_to_hide);
                        }
                    }
                    _ => {}
                });
            }
            show_launcher(app.handle());
            if let Ok(dir) = app.path().app_log_dir() {
                log_line(
                    app.handle(),
                    &format!("started, log file: {}", dir.join("web-apps.log").display()),
                );
            } else {
                log_line(app.handle(), "started");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_web_app,
            update_open_web_app,
            open_settings_window,
            reset_local_user_data,
            apply_shell_prefs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Arcane Web Apps");
}
