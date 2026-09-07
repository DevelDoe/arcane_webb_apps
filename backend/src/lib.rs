use tauri::{
    menu::{Menu, PredefinedMenuItem, Submenu},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

fn web_app_label(id: &str) -> Result<String, String> {
    if id.is_empty() || !id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-') {
        return Err("Invalid web app identifier".into());
    }
    Ok(format!("web-app-{id}"))
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
        .build()
        .map_err(|error| error.to_string())?;
    Ok(())
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
            let close_window = PredefinedMenuItem::close_window(app, Some("Close Window"))?;
            let window_menu = Submenu::with_items(app, "Window", true, &[&close_window])?;
            Menu::with_items(app, &[&window_menu])
        })
        .setup(|app| {
            app.handle().plugin(tauri_plugin_store::Builder::default().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_web_app,
            open_settings_window,
            reset_local_user_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Arcane Webb Apps");
}
