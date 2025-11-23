use crate::logilinux;
use std::sync::Mutex;

// Wrapper to make the raw pointer Send + Sync
// Safety: We only access this from async commands which run on the same thread pool
struct LibraryPtr(*const logilinux::Library);
unsafe impl Send for LibraryPtr {}
unsafe impl Sync for LibraryPtr {}

// Global library instance
static LIBRARY: Mutex<Option<LibraryPtr>> = Mutex::new(None);

fn get_library() -> Result<&'static logilinux::Library, String> {
    let mut lib_opt = LIBRARY.lock().unwrap();
    
    if lib_opt.is_none() {
        eprintln!("🔧 Creating LogiLinux library instance (first time)...");
        let lib = Box::new(
            logilinux::Library::new()
                .map_err(|e| format!("Failed to initialize logilinux: {}", e))?
        );
        let lib_ptr = Box::into_raw(lib);
        *lib_opt = Some(LibraryPtr(lib_ptr));
        eprintln!("✓ Library instance created and cached");
    }
    
    unsafe {
        Ok(&*lib_opt.as_ref().unwrap().0)
    }
}

#[tauri::command]
pub async fn set_key_image(key_index: i32, jpeg_base64: String) -> Result<bool, String> {
    // Decode base64 to binary
    use base64::{engine::general_purpose, Engine as _};
    let jpeg_data = general_purpose::STANDARD
        .decode(&jpeg_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    eprintln!(
        "set_key_image: key_index={}, jpeg_size={} bytes",
        key_index,
        jpeg_data.len()
    );

    // Get the cached library instance (created once, reused forever)
    let lib = get_library()?;

    // Find device - the C++ FFI layer caches devices by type
    let device = lib
        .find_device(logilinux::ffi::DeviceType_DEVICE_TYPE_CREATIVE_CONSOLE)
        .ok_or_else(|| "No MX Keypad device found".to_string())?;

    if !device.has_capability(logilinux::ffi::DeviceCapability_CAPABILITY_LCD_DISPLAY) {
        return Err("Device does not have LCD display capability".to_string());
    }

    // Initialize device - only happens once due to C++ caching
    if !device.initialize() {
        return Err("Failed to initialize device LCD".to_string());
    }

    // Set the key image
    device
        .set_key_image(key_index, &jpeg_data)
        .map_err(|e| format!("Failed to set key image: {}", e))
}
