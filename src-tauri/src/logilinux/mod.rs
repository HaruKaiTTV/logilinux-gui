pub mod ffi;

use std::ffi::CStr;

pub use ffi::{DeviceType, EventType, RotationType};

pub struct Library {
    handle: ffi::LogiLinuxLibrary,
}

#[derive(Debug, Clone)]
pub struct DeviceInfo {
    pub name: String,
    pub device_path: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub device_type: DeviceType,
}

impl Library {
    pub fn new() -> Result<Self, String> {
        unsafe {
            let handle = ffi::logilinux_library_new();
            if handle.is_null() {
                return Err("Failed to create LogiLinux library".to_string());
            }
            Ok(Library { handle })
        }
    }

    pub fn discover_devices(&self) -> Result<Vec<DeviceInfo>, String> {
        unsafe {
            const MAX_DEVICES: usize = 16;
            let mut devices: Vec<ffi::DeviceInfo> = vec![std::mem::zeroed(); MAX_DEVICES];

            let count = ffi::logilinux_discover_devices(
                self.handle,
                devices.as_mut_ptr(),
                MAX_DEVICES as i32,
            );

            if count < 0 {
                return Err("Failed to discover devices".to_string());
            }

            let mut result = Vec::new();
            for i in 0..count as usize {
                let dev = &devices[i];

                let name = CStr::from_ptr(dev.name.as_ptr())
                    .to_string_lossy()
                    .into_owned();
                let device_path = CStr::from_ptr(dev.device_path.as_ptr())
                    .to_string_lossy()
                    .into_owned();

                result.push(DeviceInfo {
                    name,
                    device_path,
                    vendor_id: dev.vendor_id,
                    product_id: dev.product_id,
                    device_type: dev.device_type,
                });
            }

            Ok(result)
        }
    }

    pub fn find_device(&self, device_type: DeviceType) -> Option<Device> {
        unsafe {
            let handle = ffi::logilinux_find_device(self.handle, device_type);
            if handle.is_null() {
                None
            } else {
                Some(Device { handle })
            }
        }
    }

    pub fn version() -> (i32, i32, i32) {
        unsafe {
            let mut major = 0;
            let mut minor = 0;
            let mut patch = 0;
            ffi::logilinux_get_version(&mut major, &mut minor, &mut patch);
            (major, minor, patch)
        }
    }
}

impl Drop for Library {
    fn drop(&mut self) {
        unsafe {
            if !self.handle.is_null() {
                ffi::logilinux_library_free(self.handle);
            }
        }
    }
}

pub struct Device {
    pub(crate) handle: ffi::LogiLinuxDevice,
}

impl Device {
    pub fn get_info(&self) -> Result<DeviceInfo, String> {
        unsafe {
            let mut info: ffi::DeviceInfo = std::mem::zeroed();
            if ffi::logilinux_device_get_info(self.handle, &mut info) {
                let name = CStr::from_ptr(info.name.as_ptr())
                    .to_string_lossy()
                    .into_owned();
                let device_path = CStr::from_ptr(info.device_path.as_ptr())
                    .to_string_lossy()
                    .into_owned();

                Ok(DeviceInfo {
                    name,
                    device_path,
                    vendor_id: info.vendor_id,
                    product_id: info.product_id,
                    device_type: info.device_type,
                })
            } else {
                Err("Failed to get device info".to_string())
            }
        }
    }

    pub fn get_type(&self) -> DeviceType {
        unsafe { ffi::logilinux_device_get_type(self.handle) }
    }

    pub fn has_capability(&self, cap: ffi::DeviceCapability) -> bool {
        unsafe { ffi::logilinux_device_has_capability(self.handle, cap) }
    }

    pub fn start_monitoring(&self) {
        unsafe {
            ffi::logilinux_device_start_monitoring(self.handle);
        }
    }

    pub fn stop_monitoring(&self) {
        unsafe {
            ffi::logilinux_device_stop_monitoring(self.handle);
        }
    }

    pub fn is_monitoring(&self) -> bool {
        unsafe { ffi::logilinux_device_is_monitoring(self.handle) }
    }

    pub fn grab_exclusive(&self, grab: bool) -> bool {
        unsafe { ffi::logilinux_device_grab_exclusive(self.handle, grab) }
    }
}

impl Drop for Device {
    fn drop(&mut self) {
        unsafe {
            if !self.handle.is_null() {
                ffi::logilinux_device_free(self.handle);
            }
        }
    }
}

unsafe impl Send for Library {}
unsafe impl Sync for Library {}
