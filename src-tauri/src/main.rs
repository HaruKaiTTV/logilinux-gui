#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod logilinux;
mod permissions;

use commands::actions::{execute_command, execute_key_combo, execute_scroll, execute_shell_command};
use commands::devices::discover_devices;
use commands::display::set_key_image;
use commands::events::{start_device_monitoring, stop_device_monitoring};
use commands::file_dialog::{list_installed_applications, select_app_binary, select_python_file};
use commands::file_ops::save_config_file;
use commands::permissions::{check_permissions, request_elevation};
use commands::python_plugins::{scan_python_plugins, run_python_plugin, stop_python_plugin, get_plugin_status, PluginState};
use commands::window::get_active_window;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PluginState::default())
        .invoke_handler(tauri::generate_handler![
            discover_devices,
            check_permissions,
            request_elevation,
            start_device_monitoring,
            stop_device_monitoring,
            execute_key_combo,
            execute_command,
            execute_scroll,
            execute_shell_command,
            set_key_image,
            get_active_window,
            save_config_file,
            scan_python_plugins,
            run_python_plugin,
            stop_python_plugin,
            get_plugin_status,
            select_python_file,
            select_app_binary,
            list_installed_applications,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
