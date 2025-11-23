use tauri::command;

#[command]
pub fn select_python_file() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Python Files", &["py"])
        .pick_file();
    
    match file {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}
