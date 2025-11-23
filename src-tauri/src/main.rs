#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod logilinux;
mod permissions;

use commands::actions::{execute_command, execute_key_combo, execute_shell_command};
use commands::devices::discover_devices;
use commands::events::{start_device_monitoring, stop_device_monitoring};
use commands::permissions::{check_permissions, request_elevation};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            discover_devices,
            check_permissions,
            request_elevation,
            start_device_monitoring,
            stop_device_monitoring,
            execute_key_combo,
            execute_command,
            execute_shell_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
