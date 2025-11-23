use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PythonPlugin {
    pub name: String,
    pub path: String,
    pub description: String,
}

pub struct PluginState {
    running_plugins: Mutex<HashMap<String, Child>>,
}

impl Default for PluginState {
    fn default() -> Self {
        Self {
            running_plugins: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub async fn scan_python_plugins() -> Result<Vec<PythonPlugin>, String> {
    let sdk_path = PathBuf::from("/home/ron0/development/cpp-projects/logilinux-sdk/examples");
    
    if !sdk_path.exists() {
        return Err(format!("SDK examples directory not found at {:?}", sdk_path));
    }

    let mut plugins = Vec::new();
    
    match std::fs::read_dir(&sdk_path) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("py") {
                    if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                        let description = read_plugin_description(&path)
                            .unwrap_or_else(|| "No description available".to_string());
                        
                        plugins.push(PythonPlugin {
                            name: name.to_string(),
                            path: path.to_string_lossy().to_string(),
                            description,
                        });
                    }
                }
            }
        }
        Err(e) => return Err(format!("Failed to read SDK examples directory: {}", e)),
    }

    plugins.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(plugins)
}

fn read_plugin_description(path: &PathBuf) -> Option<String> {
    use std::io::{BufRead, BufReader};
    
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut in_docstring = false;
    let mut description = String::new();
    
    for line in reader.lines().take(20) {
        if let Ok(line) = line {
            let trimmed = line.trim();
            
            if trimmed.starts_with("\"\"\"") || trimmed.starts_with("'''") {
                if in_docstring {
                    break;
                } else {
                    in_docstring = true;
                    let text = trimmed.trim_start_matches("\"\"\"").trim_start_matches("'''").trim();
                    if !text.is_empty() && !text.starts_with("\"\"\"") && !text.starts_with("'''") {
                        description.push_str(text);
                    }
                }
            } else if in_docstring {
                description.push(' ');
                description.push_str(trimmed);
            }
            
            if !in_docstring && trimmed.starts_with('#') && description.is_empty() {
                let comment = trimmed.trim_start_matches('#').trim();
                if !comment.is_empty() {
                    description.push_str(comment);
                }
            }
        }
    }
    
    if description.is_empty() {
        None
    } else {
        Some(description.chars().take(200).collect())
    }
}

#[tauri::command]
pub async fn run_python_plugin(
    plugin_path: String,
    state: State<'_, PluginState>,
) -> Result<String, String> {
    // Use absolute path to SDK
    let sdk_path = PathBuf::from("/home/ron0/development/cpp-projects/logilinux-sdk");
    
    // Use the SDK's venv
    let venv_python = sdk_path.join("venv/bin/python");
    
    if !venv_python.exists() {
        return Err(format!(
            "Python venv not found at {:?}. Please set up the SDK venv first.",
            venv_python
        ));
    }

    let lib_path = sdk_path.join("logilinux-driver/build/lib");
    let mut env_path = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
    if !env_path.is_empty() {
        env_path.push(':');
    }
    env_path.push_str(&lib_path.to_string_lossy());

    let plugin_name = PathBuf::from(&plugin_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mut running = state.running_plugins.lock().map_err(|e| e.to_string())?;
    if running.contains_key(&plugin_name) {
        return Err(format!("Plugin '{}' is already running", plugin_name));
    }

    let child = Command::new(venv_python)
        .arg(&plugin_path)
        .current_dir(&sdk_path)
        .env("LD_LIBRARY_PATH", env_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start plugin: {}", e))?;

    running.insert(plugin_name.clone(), child);

    Ok(format!("Started plugin: {}", plugin_name))
}

#[tauri::command]
pub async fn stop_python_plugin(
    plugin_name: String,
    state: State<'_, PluginState>,
) -> Result<String, String> {
    let mut running = state.running_plugins.lock().map_err(|e| e.to_string())?;
    
    if let Some(mut child) = running.remove(&plugin_name) {
        let _ = child.kill();
        let _ = child.wait();
        Ok(format!("Stopped plugin: {}", plugin_name))
    } else {
        Err(format!("Plugin '{}' is not running", plugin_name))
    }
}

#[tauri::command]
pub async fn get_plugin_status(
    plugin_name: String,
    state: State<'_, PluginState>,
) -> Result<bool, String> {
    let running = state.running_plugins.lock().map_err(|e| e.to_string())?;
    Ok(running.contains_key(&plugin_name))
}
