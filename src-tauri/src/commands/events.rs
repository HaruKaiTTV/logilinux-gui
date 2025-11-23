use crate::logilinux;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DeviceEvent {
    ButtonPress { button_code: u32 },
    ButtonRelease { button_code: u32 },
    Rotation { delta: i32, rotation_type: String },
    DeviceConnected { device_path: String },
    DeviceDisconnected { device_path: String },
}

#[tauri::command]
pub async fn start_device_monitoring(app: AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        let mut monitored_device_keys = std::collections::HashSet::new();

        loop {
            let lib = match logilinux::Library::new() {
                Ok(l) => l,
                Err(e) => {
                    log::error!("Failed to create library: {}", e);
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    continue;
                }
            };

            let all_devices = match lib.discover_devices() {
                Ok(devices) => devices,
                Err(e) => {
                    log::error!("Failed to discover devices: {}", e);
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    continue;
                }
            };

            log::debug!(
                "🔍 Monitoring loop: Discovered {} device(s), currently monitoring {}",
                all_devices.len(),
                monitored_device_keys.len()
            );

            let mut device_types_to_monitor = std::collections::HashSet::new();
            for dev in &all_devices {
                let device_key = format!("{}:{}", dev.vendor_id, dev.product_id);
                log::debug!(
                    "   Found device: {} (type: {:?})",
                    device_key,
                    dev.device_type
                );
                device_types_to_monitor.insert((device_key, dev.device_type));
            }

            let mut new_devices_found = false;

            for (device_key, device_type) in device_types_to_monitor {
                if monitored_device_keys.contains(&device_key) {
                    log::debug!("   ⏭️ Skipping already monitored device: {}", device_key);
                    continue;
                }

                log::info!(
                    "🆕 New device detected: {}, attempting to start monitoring...",
                    device_key
                );

                let device = lib.find_device(device_type);

                if let Some(device) = device {
                    let mut info = logilinux::ffi::DeviceInfo {
                        name: [0; 256],
                        device_path: [0; 512],
                        vendor_id: 0,
                        product_id: 0,
                        device_type: logilinux::ffi::DeviceType_DEVICE_TYPE_UNKNOWN,
                    };

                    unsafe {
                        logilinux::ffi::logilinux_device_get_info(device.handle, &mut info);
                    }

                    let name = unsafe {
                        std::ffi::CStr::from_ptr(info.name.as_ptr())
                            .to_string_lossy()
                            .into_owned()
                    };

                    let device_type_name = match info.device_type {
                        logilinux::ffi::DeviceType_DEVICE_TYPE_DIALPAD => "DIALPAD",
                        logilinux::ffi::DeviceType_DEVICE_TYPE_CREATIVE_CONSOLE => {
                            "CREATIVE_CONSOLE"
                        }
                        _ => "UNKNOWN",
                    };

                    let device_path = unsafe {
                        std::ffi::CStr::from_ptr(info.device_path.as_ptr())
                            .to_string_lossy()
                            .into_owned()
                    };

                    if info.device_type == logilinux::ffi::DeviceType_DEVICE_TYPE_CREATIVE_CONSOLE {
                        if !device_path.contains("/dev/hidraw") {
                            log::error!(
                                "❌ Creative Console device does not have hidraw path: {}",
                                device_path
                            );
                            log::error!("   This device cannot be initialized. Skipping...");
                            continue;
                        }
                    }

                    unsafe {
                        let initialized =
                            logilinux::ffi::logilinux_device_initialize(device.handle);
                        if initialized {
                        } else {
                            continue; // Skip this device if initialization fails
                        }
                    }

                    let device_handle = device.handle;

                    unsafe {
                        let app_ptr = Box::into_raw(Box::new(app.clone())) as *mut std::ffi::c_void;

                        extern "C" fn event_callback(
                            user_data: *mut std::ffi::c_void,
                            event_type: logilinux::EventType,
                            event_data: *const std::ffi::c_void,
                        ) {
                            log::debug!("Event callback triggered! Type: {:?}", event_type);

                            let app = unsafe { &*(user_data as *const AppHandle) };

                            let event = match event_type {
                                logilinux::ffi::EventType_EVENT_TYPE_BUTTON_PRESS => {
                                    let button_event = unsafe {
                                        &*(event_data as *const logilinux::ffi::ButtonEvent)
                                    };
                                    DeviceEvent::ButtonPress {
                                        button_code: button_event.button_code,
                                    }
                                }
                                logilinux::ffi::EventType_EVENT_TYPE_BUTTON_RELEASE => {
                                    let button_event = unsafe {
                                        &*(event_data as *const logilinux::ffi::ButtonEvent)
                                    };
                                    DeviceEvent::ButtonRelease {
                                        button_code: button_event.button_code,
                                    }
                                }
                                logilinux::ffi::EventType_EVENT_TYPE_ROTATION => {
                                    let rotation_event = unsafe {
                                        &*(event_data as *const logilinux::ffi::RotationEvent)
                                    };
                                    let rotation_type = if rotation_event.rotation_type
                                        == logilinux::ffi::RotationType_ROTATION_TYPE_DIAL
                                    {
                                        "DIAL"
                                    } else {
                                        "WHEEL"
                                    };

                                    DeviceEvent::Rotation {
                                        delta: rotation_event.delta,
                                        rotation_type: rotation_type.to_string(),
                                    }
                                }
                                _ => {
                                    log::warn!("Unknown event type: {:?}", event_type);
                                    return;
                                }
                            };

                            if let Err(e) = app.emit("device-event", &event) {
                                log::error!("Failed to emit event: {}", e);
                            } else {
                                log::debug!("Event emitted successfully");
                            }
                        }

                        logilinux::ffi::logilinux_device_set_callback(
                            device_handle,
                            Some(event_callback),
                            app_ptr,
                        );
                    }

                    device.start_monitoring();

                    if !device.is_monitoring() {
                        log::error!("❌ Failed to start monitoring for: {}", name);
                        continue;
                    }

                    log::info!("✅ Started monitoring device: {}", name);

                    if device.grab_exclusive(true) {
                        log::info!("   🔒 Device grabbed exclusively: {}", name);
                    } else {
                        log::warn!(
                            "   ⚠️ Could not grab device exclusively: {} (may be hidraw device)",
                            name
                        );
                    }

                    monitored_device_keys.insert(device_key.clone());
                    log::info!(
                        "   📝 Added {} to monitored devices (total: {})",
                        device_key,
                        monitored_device_keys.len()
                    );
                    new_devices_found = true;

                    std::mem::forget(device);
                } else {
                    log::warn!("⚠️ Could not find device for key: {}", device_key);
                }
            }

            if new_devices_found {
                log::debug!("Keeping library alive due to new devices");
                std::mem::forget(lib);
            }

            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_device_monitoring() -> Result<(), String> {
    Ok(())
}
