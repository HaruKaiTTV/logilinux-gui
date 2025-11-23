use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub async fn save_config_file(
    app: tauri::AppHandle,
    content: String,
    default_filename: String,
) -> Result<(), String> {
    // In Tauri v2, we use rfd (native file dialog) directly
    let file_path: Option<PathBuf> = rfd::FileDialog::new()
        .set_title("Save Configuration")
        .set_file_name(&default_filename)
        .add_filter("JSON", &["json"])
        .save_file();

    match file_path {
        Some(path) => {
            fs::write(&path, content)
                .map_err(|e| format!("Failed to write file: {}", e))?;
            Ok(())
        }
        None => Err("User cancelled".to_string()),
    }
}
