use std::env;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::command;

fn convert_to_ydotool_keys(combo: &str) -> Result<String, String> {
    let normalized = combo.to_lowercase();
    let mut parts: Vec<&str> = normalized.split('+').map(str::trim).collect();
    let modifier_names = ["ctrl", "shift", "alt", "super"];
    if parts.iter().filter(|part| !modifier_names.contains(part)).count() > 1 {
        let mut sequence = Vec::new();
        for part in parts {
            let code = get_key_code(part)?;
            sequence.push(format!("{}:1", code));
            sequence.push(format!("{}:0", code));
        }
        return Ok(sequence.join(" "));
    }
    parts.sort_by_key(|part| !modifier_names.contains(part));
    let mut key_codes = Vec::new();

    for part in &parts[..parts.len() - 1] {
        let code = match *part {
            "ctrl" => "29",
            "shift" => "42",
            "alt" => "56",
            "super" => "125",
            _ => return Err(format!("Unknown modifier: {}", part)),
        };
        key_codes.push(format!("{}:1", code));
    }

    if let Some(key) = parts.last() {
        let code = get_key_code(key)?;
        key_codes.push(format!("{}:1", code));
        key_codes.push(format!("{}:0", code));
    }

    for part in parts[..parts.len() - 1].iter().rev() {
        let code = match *part {
            "ctrl" => "29",
            "shift" => "42",
            "alt" => "56",
            "super" => "125",
            _ => continue,
        };
        key_codes.push(format!("{}:0", code));
    }

    Ok(key_codes.join(" "))
}

fn sequence_text(combo: &str) -> Option<String> {
    let modifiers = ["ctrl", "shift", "alt", "super"];
    let mut text = String::new();
    let mut has_text = false;
    for part in combo.split('+').map(str::trim) {
        if modifiers.contains(&part.to_lowercase().as_str()) { continue; }
        if part.eq_ignore_ascii_case("space") { text.push(' '); has_text = true; continue; }
        if part.chars().count() != 1 { return None; }
        text.push_str(part);
        has_text = true;
    }
    has_text.then_some(text)
}

fn convert_to_ydotool_keys_hold(combo: &str, press: bool) -> Result<String, String> {
    let normalized = combo.to_lowercase();
    let mut parts: Vec<&str> = normalized.split('+').map(str::trim).collect();
    let modifier_names = ["ctrl", "shift", "alt", "super"];
    parts.sort_by_key(|part| !modifier_names.contains(part));
    let mut key_codes = Vec::new();

    if press {
        for part in &parts[..parts.len() - 1] {
            let code = match *part {
                "ctrl" => "29",
                "shift" => "42",
                "alt" => "56",
                "super" => "125",
                _ => return Err(format!("Unknown modifier: {}", part)),
            };
            key_codes.push(format!("{}:1", code));
        }

        if let Some(key) = parts.last() {
            let code = get_key_code(key)?;
            key_codes.push(format!("{}:1", code));
        }
    } else {
        if let Some(key) = parts.last() {
            let code = get_key_code(key)?;
            key_codes.push(format!("{}:0", code));
        }

        for part in parts[..parts.len() - 1].iter().rev() {
            let code = match *part {
                "ctrl" => "29",
                "shift" => "42",
                "alt" => "56",
                "super" => "125",
                _ => continue,
            };
            key_codes.push(format!("{}:0", code));
        }
    }

    Ok(key_codes.join(" "))
}

fn get_key_code(key: &str) -> Result<&'static str, String> {
    match key {
        "ctrl" => Ok("29"), "shift" => Ok("42"), "alt" => Ok("56"), "super" => Ok("125"),
        "a" => Ok("30"),
        "b" => Ok("48"),
        "c" => Ok("46"),
        "d" => Ok("32"),
        "e" => Ok("18"),
        "f" => Ok("33"),
        "g" => Ok("34"),
        "h" => Ok("35"),
        "i" => Ok("23"),
        "j" => Ok("36"),
        "k" => Ok("37"),
        "l" => Ok("38"),
        "m" => Ok("50"),
        "n" => Ok("49"),
        "o" => Ok("24"),
        "p" => Ok("25"),
        "q" => Ok("16"),
        "r" => Ok("19"),
        "s" => Ok("31"),
        "t" => Ok("20"),
        "u" => Ok("22"),
        "v" => Ok("47"),
        "w" => Ok("17"),
        "x" => Ok("45"),
        "y" => Ok("21"),
        "z" => Ok("44"),
        "1" => Ok("2"),
        "2" => Ok("3"),
        "3" => Ok("4"),
        "4" => Ok("5"),
        "5" => Ok("6"),
        "6" => Ok("7"),
        "7" => Ok("8"),
        "8" => Ok("9"),
        "9" => Ok("10"),
        "0" => Ok("11"),
        "space" => Ok("57"),
        " " => Ok("57"),
        "enter" => Ok("28"),
        "return" => Ok("28"),
        "escape" => Ok("1"),
        "esc" => Ok("1"),
        "backspace" => Ok("14"),
        "tab" => Ok("15"),
        "delete" => Ok("111"),
        "insert" => Ok("110"),
        "home" => Ok("102"),
        "end" => Ok("107"),
        "pageup" => Ok("104"),
        "pagedown" => Ok("109"),
        "arrowup" | "up" => Ok("103"),
        "arrowdown" | "down" => Ok("108"),
        "arrowleft" | "left" => Ok("105"),
        "arrowright" | "right" => Ok("106"),
        // On this desktop environment the keyboard's Menu/Application key is
        // emitted as KEY_COMPOSE (127), which is also what ydotool reproduces.
        "menu" | "contextmenu" | "apps" => Ok("127"),
        "f1" => Ok("59"),
        "f2" => Ok("60"),
        "f3" => Ok("61"),
        "f4" => Ok("62"),
        "f5" => Ok("63"),
        "f6" => Ok("64"),
        "f7" => Ok("65"),
        "f8" => Ok("66"),
        "f9" => Ok("67"),
        "f10" => Ok("68"),
        "f11" => Ok("87"),
        "f12" => Ok("88"),
        "minus" | "-" => Ok("12"),
        "equal" | "=" => Ok("13"),
        "bracketleft" | "[" => Ok("26"),
        "bracketright" | "]" => Ok("27"),
        "backslash" | "\\" => Ok("43"),
        "semicolon" | ";" => Ok("39"),
        "quote" | "'" => Ok("40"),
        "comma" | "," => Ok("51"),
        "period" | "." => Ok("52"),
        "slash" | "/" => Ok("53"),
        "backquote" | "`" => Ok("41"),
        _ => Err(format!("Unknown key: {}", key)),
    }
}

#[command]
pub async fn execute_key_combo(combo: String, _mode: Option<String>, hold: bool, press: bool) -> Result<(), String> {
    static KEYBOARD_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let _keyboard_guard = KEYBOARD_LOCK.get_or_init(|| Mutex::new(())).lock()
        .map_err(|_| "Keyboard input lock was poisoned".to_string())?;
    let ydotool_path = "/usr/bin/ydotool";
    eprintln!("Executing ydotool key combo: {combo} (hold={hold}, press={press})");
    // Literal character macros are always typing macros. This also repairs
    // older saved macros whose mode marker was absent or incorrect.
    let text_value = if !hold && press { sequence_text(&combo) } else { None };
    let text_sequence = text_value.is_some();
    eprintln!("Macro classification: text_sequence={text_sequence}, text={text_value:?}");
    let sudo_user = env::var("SUDO_USER").ok();
    let sudo_uid = env::var("SUDO_UID").ok();
    let ydotool_socket = env::var("YDOTOOL_SOCKET").unwrap_or_else(|_| {
        if let Some(ref uid) = sudo_uid {
            format!("/run/user/{}/.ydotool_socket", uid)
        } else {
            "/tmp/.ydotool_socket".to_string()
        }
    });

    if text_sequence {
        let text = text_value.as_ref().unwrap();
        let mut cmd = Command::new(ydotool_path);
        cmd.env("YDOTOOL_SOCKET", &ydotool_socket).arg("type").arg(text);
        cmd.spawn().map_err(|e| format!("Failed to start ydotool typing: {e}"))?;
        eprintln!("ydotool typing command started asynchronously");
        return Ok(());
    }

    let ydotool_keys = if hold {
        convert_to_ydotool_keys_hold(&combo, press)?
    } else {
        convert_to_ydotool_keys(&combo)?
    };

    let output = if let (Some(user), Some(_uid)) = (sudo_user, sudo_uid) {
        let home_dir = format!("/home/{}", user);

        let mut cmd = Command::new("sudo");
        cmd.arg("-u")
            .arg(&user)
            .arg(format!("HOME={}", home_dir))
            .arg(format!("YDOTOOL_SOCKET={}", ydotool_socket));

        let mut ydotool_cmd = cmd.arg(ydotool_path);
        if text_sequence {
            ydotool_cmd = ydotool_cmd.arg("type").arg(text_value.as_ref().unwrap());
        } else {
            ydotool_cmd = ydotool_cmd.arg("key").arg("--key-delay").arg("20");
            for key_code in ydotool_keys.split_whitespace() {
                ydotool_cmd = ydotool_cmd.arg(key_code);
            }
        }

        ydotool_cmd
            .output()
            .map_err(|e| format!("Failed to execute ydotool: {}", e))?
    } else {
        let mut cmd = Command::new(ydotool_path);
        cmd.env("YDOTOOL_SOCKET", &ydotool_socket);
        if text_sequence {
            cmd.arg("type").arg(text_value.as_ref().unwrap());
        } else {
            cmd.arg("key");
        }
        if !text_sequence {
            cmd.arg("--key-delay").arg("20");
            for key_code in ydotool_keys.split_whitespace() {
                cmd.arg(key_code);
            }
        }

        cmd.output()
            .map_err(|e| format!("Failed to execute ydotool: {}", e))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        eprintln!("ydotool command failed: stderr={stderr}, stdout={stdout}, status={}", output.status);
        return Err(format!(
            "ydotool failed - stderr: {}, stdout: {}",
            stderr, stdout
        ));
    }

    eprintln!("ydotool command completed successfully");

    Ok(())
}

#[command]
pub async fn execute_command(command: String) -> Result<(), String> {
    let sudo_user = env::var("SUDO_USER").ok();
    let sudo_uid = env::var("SUDO_UID").ok();
    let display = env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string());
    let wayland_display = env::var("WAYLAND_DISPLAY").ok();
    let xauthority = env::var("XAUTHORITY").ok();
    let hyprland_signature = env::var("HYPRLAND_INSTANCE_SIGNATURE").ok();

    if let (Some(user), Some(uid)) = (sudo_user, sudo_uid) {
        let runtime_dir = format!("/run/user/{}", uid);
        let home_dir = format!("/home/{}", user);

        let mut cmd = Command::new("sudo");
        cmd.arg("-u")
            .arg(&user)
            .arg(format!("DISPLAY={}", display))
            .arg(format!("XDG_RUNTIME_DIR={}", runtime_dir))
            .arg(format!("HOME={}", home_dir));

        if let Some(wd) = wayland_display {
            cmd.arg(format!("WAYLAND_DISPLAY={}", wd));
        }

        if let Some(xa) = xauthority {
            cmd.arg(format!("XAUTHORITY={}", xa));
        }

        if let Some(hs) = hyprland_signature {
            cmd.arg(format!("HYPRLAND_INSTANCE_SIGNATURE={}", hs));
        }

        cmd.arg("sh")
            .arg("-c")
            .arg(&command)
            .spawn()
            .map_err(|e| format!("Failed to execute command: {}", e))?;
    } else {
        Command::new("sh")
            .arg("-c")
            .arg(&command)
            .spawn()
            .map_err(|e| format!("Failed to execute command: {}", e))?;
    }

    Ok(())
}

#[command]
pub async fn execute_shell_command(command: String) -> Result<String, String> {
    let sudo_user = env::var("SUDO_USER").ok();
    let sudo_uid = env::var("SUDO_UID").ok();
    let display = env::var("DISPLAY").unwrap_or_else(|_| ":0".to_string());
    let wayland_display = env::var("WAYLAND_DISPLAY").ok();
    let xauthority = env::var("XAUTHORITY").ok();
    let hyprland_signature = env::var("HYPRLAND_INSTANCE_SIGNATURE").ok();

    let output = if let (Some(user), Some(uid)) = (sudo_user, sudo_uid) {
        let runtime_dir = format!("/run/user/{}", uid);
        let home_dir = format!("/home/{}", user);

        let mut cmd = Command::new("sudo");
        cmd.arg("-u")
            .arg(&user)
            .arg(format!("DISPLAY={}", display))
            .arg(format!("XDG_RUNTIME_DIR={}", runtime_dir))
            .arg(format!("HOME={}", home_dir));

        if let Some(wd) = wayland_display {
            cmd.arg(format!("WAYLAND_DISPLAY={}", wd));
        }

        if let Some(xa) = xauthority {
            cmd.arg(format!("XAUTHORITY={}", xa));
        }

        if let Some(hs) = hyprland_signature {
            cmd.arg(format!("HYPRLAND_INSTANCE_SIGNATURE={}", hs));
        }

        cmd.arg("sh")
            .arg("-c")
            .arg(&command)
            .output()
            .map_err(|e| format!("Failed to execute shell command: {}", e))?
    } else {
        Command::new("sh")
            .arg("-c")
            .arg(&command)
            .output()
            .map_err(|e| format!("Failed to execute shell command: {}", e))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}
