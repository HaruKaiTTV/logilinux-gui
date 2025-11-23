use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionStatus {
    pub has_access: bool,
    pub message: String,
    pub can_elevate: bool,
}

#[tauri::command]
pub async fn check_permissions() -> Result<PermissionStatus, String> {
    let has_access = crate::permissions::check_device_permissions()?;

    if has_access {
        Ok(PermissionStatus {
            has_access: true,
            message: "Device access is available".to_string(),
            can_elevate: false,
        })
    } else {
        let can_elevate = std::process::Command::new("which")
            .arg("pkexec")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        Ok(PermissionStatus {
            has_access: false,
            message: crate::permissions::get_permission_help(),
            can_elevate,
        })
    }
}

#[tauri::command]
pub async fn request_elevation() -> Result<(), String> {
    crate::permissions::try_elevate()
}
