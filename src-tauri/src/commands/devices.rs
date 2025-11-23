use crate::logilinux;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub is_connected: bool,
}

fn device_type_to_string(dt: logilinux::DeviceType) -> String {
    use crate::logilinux::ffi;

    if dt == ffi::DeviceType_DEVICE_TYPE_DIALPAD {
        "DIALPAD".to_string()
    } else if dt == ffi::DeviceType_DEVICE_TYPE_CREATIVE_CONSOLE {
        "CREATIVE_CONSOLE".to_string()
    } else {
        "UNKNOWN".to_string()
    }
}

#[tauri::command]
pub async fn discover_devices() -> Result<Vec<DeviceInfo>, String> {
    let lib =
        logilinux::Library::new().map_err(|e| format!("Failed to initialize logilinux: {}", e))?;

    let devices = lib
        .discover_devices()
        .map_err(|e| format!("Failed to discover devices: {}", e))?;

    use std::collections::BTreeMap;
    let mut unique_devices: BTreeMap<String, DeviceInfo> = BTreeMap::new();

    for dev in devices {
        let id = format!("{:04x}:{:04x}", dev.vendor_id, dev.product_id);

        let is_hidraw = dev.device_path.contains("/dev/hidraw");
        let should_replace = if let Some(existing) = unique_devices.get(&id) {
            is_hidraw && !existing.id.contains("hidraw")
        } else {
            true
        };

        if should_replace {
            unique_devices.insert(
                id.clone(),
                DeviceInfo {
                    id,
                    name: dev.name,
                    device_type: device_type_to_string(dev.device_type),
                    vendor_id: dev.vendor_id,
                    product_id: dev.product_id,
                    is_connected: true,
                },
            );
        }
    }

    let result: Vec<DeviceInfo> = unique_devices.into_values().collect();

    Ok(result)
}
