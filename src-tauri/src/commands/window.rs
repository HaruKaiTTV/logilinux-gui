use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ActiveWindow {
    pub class: String,
    pub title: String,
}

#[tauri::command]
pub async fn get_active_window() -> Result<ActiveWindow, String> {
    // Use hyprctl to get the active window info on Hyprland
    let output = Command::new("hyprctl")
        .args(&["activewindow", "-j"])
        .output()
        .map_err(|e| format!("Failed to execute hyprctl: {}", e))?;

    if !output.status.success() {
        return Err("hyprctl command failed".to_string());
    }

    let json_str =
        String::from_utf8(output.stdout).map_err(|e| format!("Failed to parse output: {}", e))?;

    // Parse the JSON output
    let parsed: serde_json::Value =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let class = parsed["class"].as_str().unwrap_or("unknown").to_string();

    let title = parsed["title"].as_str().unwrap_or("unknown").to_string();

    Ok(ActiveWindow { class, title })
}
