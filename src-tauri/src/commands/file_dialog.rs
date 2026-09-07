use tauri::command;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use base64::{engine::general_purpose, Engine as _};

fn resolve_icon(icon: &str, desktop_file: &PathBuf) -> Option<String> {
    let icon_path = PathBuf::from(icon);
    if icon_path.is_absolute() && icon_path.is_file() {
        return Some(icon.to_string());
    }

    let name = icon_path.file_name()?.to_str()?;
    let stem = name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(name);
    let mut candidates = vec![
        PathBuf::from("/usr/share/pixmaps"),
        PathBuf::from("/usr/share/icons/hicolor/apps"),
        PathBuf::from("/usr/share/icons/hicolor/scalable/apps"),
        PathBuf::from("/usr/share/icons/hicolor/128x128/apps"),
        PathBuf::from("/usr/share/icons/hicolor/64x64/apps"),
        PathBuf::from("/usr/share/icons/hicolor/48x48/apps"),
        PathBuf::from("/usr/share/icons/hicolor/32x32/apps"),
        PathBuf::from("/usr/share/icons/hicolor/24x24/apps"),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        candidates.push(PathBuf::from(home).join(".local/share/icons"));
    }
    if let Some(parent) = desktop_file.parent() {
        candidates.push(parent.to_path_buf());
    }

    for directory in candidates {
        for extension in ["png", "svg", "xpm"] {
            let candidate = directory.join(format!("{stem}.{extension}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
        // Do not recursively scan broad icon roots here: this command runs
        // when opening the picker and scanning thousands of files per app
        // makes the dialog appear unresponsive.
    }
    None
}

fn icon_data_url(path: Option<String>) -> Option<String> {
    let path = PathBuf::from(path?);
    let bytes = fs::read(&path).ok()?;
    let mime = match path.extension().and_then(|ext| ext.to_str()).unwrap_or("") {
        "svg" => "image/svg+xml",
        "xpm" => "image/x-xpixmap",
        _ => "image/png",
    };
    Some(format!("data:{mime};base64,{}", general_purpose::STANDARD.encode(bytes)))
}

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

#[command]
pub fn select_app_binary() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new().pick_file();

    Ok(file.map(|path| path.to_string_lossy().to_string()))
}

#[derive(Debug, Serialize)]
pub struct InstalledApplication {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
}

#[command]
pub fn list_installed_applications() -> Result<Vec<InstalledApplication>, String> {
    let mut applications = Vec::new();
    let mut directories = vec![PathBuf::from("/usr/share/applications")];

    if let Ok(home) = std::env::var("HOME") {
        directories.push(PathBuf::from(home).join(".local/share/applications"));
    }

    for directory in directories {
        let entries = match fs::read_dir(directory) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("desktop") {
                continue;
            }

            let contents = match fs::read_to_string(&path) {
                Ok(contents) => contents,
                Err(_) => continue,
            };
            let is_application = contents.lines().any(|line| line == "Type=Application");
            let hidden = contents.lines().any(|line| {
                line == "NoDisplay=true" || line == "Hidden=true"
            });
            if !is_application || hidden {
                continue;
            }

            let name = contents
                .lines()
                .find_map(|line| line.strip_prefix("Name=").map(str::trim))
                .filter(|name| !name.is_empty());
            let id = path.file_stem().and_then(|name| name.to_str());
            let icon = contents
                .lines()
                .find_map(|line| line.strip_prefix("Icon=").map(str::trim))
                .and_then(|icon| resolve_icon(icon, &path))
                .and_then(|path| icon_data_url(Some(path)));

            if let (Some(name), Some(id)) = (name, id) {
                applications.push(InstalledApplication {
                    id: id.to_string(),
                    name: name.to_string(),
                    icon,
                });
            }
        }
    }

    applications.sort_by_key(|application| application.name.to_lowercase());
    applications.dedup_by(|left, right| left.id == right.id);
    Ok(applications)
}
