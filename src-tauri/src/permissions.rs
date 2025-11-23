use std::env;
use std::process::Command;

pub fn check_device_permissions() -> Result<bool, String> {
    let test_path = "/dev/input";

    match std::fs::read_dir(test_path) {
        Ok(_) => Ok(true),
        Err(e) => {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                Ok(false)
            } else {
                Err(format!("Failed to check permissions: {}", e))
            }
        }
    }
}

pub fn get_permission_help() -> String {
    let user = env::var("USER").unwrap_or_else(|_| "user".to_string());

    format!(
        r#"Device access requires elevated permissions.

To fix this permanently:

1. Install udev rules:
   sudo cp 99-logitech-devices.rules /etc/udev/rules.d/
   sudo udevadm control --reload-rules
   sudo udevadm trigger

2. Add your user to the input group:
   sudo usermod -aG input {}

3. Log out and log back in

4. Reconnect your Logitech device

Alternatively, you can run the app with:
   pkexec logilinux-gui
or
   sudo -E logilinux-gui
"#,
        user
    )
}

pub fn try_elevate() -> Result<(), String> {
    if Command::new("which")
        .arg("pkexec")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        let exe =
            env::current_exe().map_err(|e| format!("Failed to get executable path: {}", e))?;

        let status = Command::new("pkexec")
            .arg(&exe)
            .env("DISPLAY", env::var("DISPLAY").unwrap_or_default())
            .env("XAUTHORITY", env::var("XAUTHORITY").unwrap_or_default())
            .env("WEBKIT_DISABLE_COMPOSITING_MODE", "1")
            .status()
            .map_err(|e| format!("Failed to run pkexec: {}", e))?;

        if status.success() {
            std::process::exit(0);
        } else {
            Err("pkexec was cancelled or failed".to_string())
        }
    } else {
        Err("pkexec not found. Please install polkit.".to_string())
    }
}
