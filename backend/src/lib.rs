use tauri::{
    menu::{Menu, MenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

fn show_launcher(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn web_app_label(id: &str) -> Result<String, String> {
    if id.is_empty() || !id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-') {
        return Err("Invalid web app identifier".into());
    }
    Ok(format!("web-app-{id}"))
}

fn drag_handle_script(window_label: &str) -> String {
    format!(
        r#"
        (() => {{
          const installDragHandle = () => {{
            if (document.getElementById('__webb_apps_drag_handle')) return;
            const handle = document.createElement('button');
            handle.id = '__webb_apps_drag_handle';
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
        }})();
        "#
    )
}

#[tauri::command]
fn open_web_app(app: tauri::AppHandle, id: String, name: String, url: String) -> Result<(), String> {
    let label = web_app_label(&id)?;
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let external_url = url
        .parse()
        .map_err(|error| format!("Invalid web app URL: {error}"))?;
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(external_url))
        .title(name)
        .inner_size(1180.0, 780.0)
        .min_inner_size(480.0, 360.0)
        .decorations(false)
        .initialization_script(drag_handle_script(&format!("web-app-{id}")))
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_open_web_app(app: tauri::AppHandle, id: String, name: String, url: String) -> Result<(), String> {
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
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("index.html?view=settings".into()))
        .title("App Settings")
        .inner_size(520.0, 420.0)
        .min_inner_size(420.0, 320.0)
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
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
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .menu(|app| {
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
            let mut window_menu_builder = SubmenuBuilder::new(app, "Window")
                .item(&reload_window)
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
                "minimize-focused-window" => {
                    let _ = window.minimize();
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
        })
        .setup(|app| {
            app.handle().plugin(tauri_plugin_store::Builder::default().build())?;

            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

            let open_launcher = MenuItem::with_id(app, "tray-open", "Open Webb Apps", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "tray-quit", "Quit Webb Apps", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_launcher, &quit])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("application icon is configured"))
                .tooltip("Arcane Webb Apps")
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
                main_window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_to_hide.hide();
                    }
                });
            }
            show_launcher(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_web_app,
            update_open_web_app,
            open_settings_window,
            reset_local_user_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Arcane Webb Apps");
}
