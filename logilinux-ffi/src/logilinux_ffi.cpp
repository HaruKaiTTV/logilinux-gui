#include "logilinux_ffi.h"
#include <cstring>
#include <iostream>
#include <logilinux/logilinux.h>
#include <map>
#include <memory>
#include <vector>

#include "devices/mx_keypad_device.h"

struct LibraryWrapper {
  std::unique_ptr<LogiLinux::Library> lib;
  std::vector<LogiLinux::DevicePtr> devices;
  // Cache devices by type to reuse the same instance
  std::map<DeviceType, LogiLinux::DevicePtr> device_cache;
};

struct DeviceWrapper {
  LogiLinux::DevicePtr device;
  EventCallback callback;
  void *user_data;
};

static void convert_device_info(const LogiLinux::DeviceInfo &src,
                                DeviceInfo *dst) {
  std::strncpy(dst->name, src.name.c_str(), sizeof(dst->name) - 1);
  dst->name[sizeof(dst->name) - 1] = '\0';

  std::strncpy(dst->device_path, src.device_path.c_str(),
               sizeof(dst->device_path) - 1);
  dst->device_path[sizeof(dst->device_path) - 1] = '\0';

  dst->vendor_id = src.vendor_id;
  dst->product_id = src.product_id;
  dst->device_type = static_cast<DeviceType>(src.type);
}

static DeviceType convert_device_type(LogiLinux::DeviceType type) {
  switch (type) {
  case LogiLinux::DeviceType::DIALPAD:
    return DEVICE_TYPE_DIALPAD;
  case LogiLinux::DeviceType::MX_KEYPAD:
    return DEVICE_TYPE_CREATIVE_CONSOLE;
  default:
    return DEVICE_TYPE_UNKNOWN;
  }
}

static LogiLinux::DeviceType convert_to_cpp_device_type(DeviceType type) {
  switch (type) {
  case DEVICE_TYPE_DIALPAD:
    return LogiLinux::DeviceType::DIALPAD;
  case DEVICE_TYPE_CREATIVE_CONSOLE:
    return LogiLinux::DeviceType::MX_KEYPAD;
  default:
    return LogiLinux::DeviceType::UNKNOWN;
  }
}

LogiLinuxLibrary logilinux_library_new(void) {
  try {
    auto wrapper = new LibraryWrapper();
    wrapper->lib = std::make_unique<LogiLinux::Library>();
    return wrapper;
  } catch (...) {
    return nullptr;
  }
}

void logilinux_library_free(LogiLinuxLibrary lib) {
  if (lib) {
    auto wrapper = static_cast<LibraryWrapper *>(lib);
    delete wrapper;
  }
}

int logilinux_discover_devices(LogiLinuxLibrary lib, DeviceInfo *devices,
                               int max_devices) {
  if (!lib || !devices || max_devices <= 0) {
    return 0;
  }

  try {
    auto wrapper = static_cast<LibraryWrapper *>(lib);
    wrapper->devices = wrapper->lib->discoverDevices();

    int count =
        std::min(static_cast<int>(wrapper->devices.size()), max_devices);
    for (int i = 0; i < count; i++) {
      convert_device_info(wrapper->devices[i]->getInfo(), &devices[i]);
    }

    return count;
  } catch (...) {
    return 0;
  }
}

LogiLinuxDevice logilinux_find_device(LogiLinuxLibrary lib, DeviceType type) {
  if (!lib) {
    return nullptr;
  }

  try {
    auto wrapper = static_cast<LibraryWrapper *>(lib);

    // Check if we already have this device cached
    auto cached = wrapper->device_cache.find(type);
    LogiLinux::DevicePtr device;

    if (cached != wrapper->device_cache.end()) {
      // Reuse cached device
      device = cached->second;
      std::cerr << "🔧 Reusing cached device for type " << type << std::endl;
    } else {
      // Find and cache the device
      device = wrapper->lib->findDevice(convert_to_cpp_device_type(type));
      if (!device) {
        return nullptr;
      }
      wrapper->device_cache[type] = device;
      std::cerr << "🔧 Cached new device for type " << type << std::endl;
    }

    auto dev_wrapper = new DeviceWrapper();
    dev_wrapper->device = device;
    dev_wrapper->callback = nullptr;
    dev_wrapper->user_data = nullptr;

    return dev_wrapper;
  } catch (...) {
    return nullptr;
  }
}

bool logilinux_device_get_info(LogiLinuxDevice device, DeviceInfo *info) {
  if (!device || !info) {
    return false;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    convert_device_info(wrapper->device->getInfo(), info);
    return true;
  } catch (...) {
    return false;
  }
}

DeviceType logilinux_device_get_type(LogiLinuxDevice device) {
  if (!device) {
    return DEVICE_TYPE_UNKNOWN;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    return convert_device_type(wrapper->device->getType());
  } catch (...) {
    return DEVICE_TYPE_UNKNOWN;
  }
}

bool logilinux_device_has_capability(LogiLinuxDevice device,
                                     DeviceCapability cap) {
  if (!device) {
    return false;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    LogiLinux::DeviceCapability cpp_cap =
        static_cast<LogiLinux::DeviceCapability>(cap);
    return wrapper->device->hasCapability(cpp_cap);
  } catch (...) {
    return false;
  }
}

void logilinux_device_set_callback(LogiLinuxDevice device,
                                   EventCallback callback, void *user_data) {
  if (!device) {
    return;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    wrapper->callback = callback;
    wrapper->user_data = user_data;

    if (callback) {
      wrapper->device->setEventCallback([wrapper](LogiLinux::EventPtr event) {
        if (!wrapper->callback)
          return;

        switch (event->type) {
        case LogiLinux::EventType::ROTATION: {
          auto rot_event =
              std::static_pointer_cast<LogiLinux::RotationEvent>(event);
          RotationEvent c_event;
          c_event.base.type = EVENT_TYPE_ROTATION;
          c_event.base.timestamp = rot_event->timestamp;
          c_event.rotation_type =
              static_cast<RotationType>(rot_event->rotation_type);
          c_event.delta = rot_event->delta;
          c_event.delta_high_res = rot_event->delta_high_res;
          c_event.raw_event_code = rot_event->raw_event_code;
          wrapper->callback(wrapper->user_data, EVENT_TYPE_ROTATION, &c_event);
          break;
        }
        case LogiLinux::EventType::BUTTON_PRESS:
        case LogiLinux::EventType::BUTTON_RELEASE: {
          auto btn_event =
              std::static_pointer_cast<LogiLinux::ButtonEvent>(event);
          ButtonEvent c_event;
          c_event.base.type = btn_event->pressed ? EVENT_TYPE_BUTTON_PRESS
                                                 : EVENT_TYPE_BUTTON_RELEASE;
          c_event.base.timestamp = btn_event->timestamp;
          c_event.button_code = btn_event->button_code;
          c_event.pressed = btn_event->pressed;
          wrapper->callback(wrapper->user_data, c_event.base.type, &c_event);
          break;
        }
        case LogiLinux::EventType::DEVICE_CONNECTED:
        case LogiLinux::EventType::DEVICE_DISCONNECTED: {
          auto dev_event =
              std::static_pointer_cast<LogiLinux::DeviceEvent>(event);
          DeviceEvent c_event;
          c_event.base.type =
              event->type == LogiLinux::EventType::DEVICE_CONNECTED
                  ? EVENT_TYPE_DEVICE_CONNECTED
                  : EVENT_TYPE_DEVICE_DISCONNECTED;
          c_event.base.timestamp = dev_event->timestamp;
          std::strncpy(c_event.device_path, dev_event->device_path.c_str(),
                       sizeof(c_event.device_path) - 1);
          c_event.device_path[sizeof(c_event.device_path) - 1] = '\0';
          wrapper->callback(wrapper->user_data, c_event.base.type, &c_event);
          break;
        }
        }
      });
    }
  } catch (...) {
  }
}

void logilinux_device_start_monitoring(LogiLinuxDevice device) {
  if (!device) {
    return;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    wrapper->device->startMonitoring();
  } catch (...) {
  }
}

void logilinux_device_stop_monitoring(LogiLinuxDevice device) {
  if (!device) {
    return;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    wrapper->device->stopMonitoring();
  } catch (...) {
  }
}

bool logilinux_device_is_monitoring(LogiLinuxDevice device) {
  if (!device) {
    return false;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    return wrapper->device->isMonitoring();
  } catch (...) {
    return false;
  }
}

bool logilinux_device_grab_exclusive(LogiLinuxDevice device, bool grab) {
  if (!device) {
    return false;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    return wrapper->device->grabExclusive(grab);
  } catch (...) {
    return false;
  }
}

bool logilinux_device_initialize(LogiLinuxDevice device) {
  if (!device) {
    std::cerr << "logilinux_device_initialize: device is null" << std::endl;
    return false;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    auto *keypad =
        dynamic_cast<LogiLinux::MXKeypadDevice *>(wrapper->device.get());
    if (keypad) {
      std::cerr << "Attempting to initialize MXKeypadDevice..." << std::endl;
      bool result = keypad->initialize();
      if (!result) {
        std::cerr << "MXKeypadDevice initialization returned false!"
                  << std::endl;
        std::cerr << "This likely means:" << std::endl;
        std::cerr << "  1. hidraw device path is empty (device not found)"
                  << std::endl;
        std::cerr << "  2. Cannot open hidraw device (permission denied)"
                  << std::endl;
        std::cerr << "Try running with: sudo -E "
                     "WEBKIT_DISABLE_COMPOSITING_MODE=1 pnpm tauri dev"
                  << std::endl;
      } else {
        std::cerr << "MXKeypadDevice initialized successfully!" << std::endl;
      }
      return result;
    }
    return true;
  } catch (const std::exception &e) {
    std::cerr << "Exception in logilinux_device_initialize: " << e.what()
              << std::endl;
    return false;
  } catch (...) {
    std::cerr << "Unknown exception in logilinux_device_initialize"
              << std::endl;
    return false;
  }
}

bool logilinux_device_set_key_image(LogiLinuxDevice device, int key_index,
                                    const uint8_t *jpeg_data,
                                    size_t jpeg_size) {
  if (!device || !jpeg_data || jpeg_size == 0) {
    std::cerr << "logilinux_device_set_key_image: invalid parameters"
              << std::endl;
    return false;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    auto *keypad =
        dynamic_cast<LogiLinux::MXKeypadDevice *>(wrapper->device.get());

    if (!keypad) {
      std::cerr
          << "logilinux_device_set_key_image: device is not an MXKeypadDevice"
          << std::endl;
      return false;
    }

    // Convert C array to std::vector
    std::vector<uint8_t> jpeg_vec(jpeg_data, jpeg_data + jpeg_size);

    std::cerr << "Setting key " << key_index << " image (" << jpeg_size
              << " bytes)" << std::endl;
    bool result = keypad->setKeyImage(key_index, jpeg_vec);

    if (!result) {
      std::cerr << "Failed to set key image for key " << key_index << std::endl;
    }

    return result;
  } catch (const std::exception &e) {
    std::cerr << "Exception in logilinux_device_set_key_image: " << e.what()
              << std::endl;
    return false;
  } catch (...) {
    std::cerr << "Unknown exception in logilinux_device_set_key_image"
              << std::endl;
    return false;
  }
}

bool logilinux_device_set_key_gif(LogiLinuxDevice device, int key_index,
                                  const uint8_t *gif_data, size_t gif_size,
                                  bool loop) {
  if (!device || !gif_data || gif_size == 0) {
    std::cerr << "logilinux_device_set_key_gif: invalid parameters"
              << std::endl;
    return false;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    auto *keypad =
        dynamic_cast<LogiLinux::MXKeypadDevice *>(wrapper->device.get());

    if (!keypad) {
      std::cerr
          << "logilinux_device_set_key_gif: device is not an MXKeypadDevice"
          << std::endl;
      return false;
    }

    // Convert C array to std::vector
    std::vector<uint8_t> gif_vec(gif_data, gif_data + gif_size);

    std::cerr << "Setting key " << key_index << " GIF (" << gif_size
              << " bytes, loop=" << loop << ")" << std::endl;
    bool result = keypad->setKeyGif(key_index, gif_vec, loop);

    if (!result) {
      std::cerr << "Failed to set key GIF for key " << key_index << std::endl;
    }

    return result;
  } catch (const std::exception &e) {
    std::cerr << "Exception in logilinux_device_set_key_gif: " << e.what()
              << std::endl;
    return false;
  } catch (...) {
    std::cerr << "Unknown exception in logilinux_device_set_key_gif"
              << std::endl;
    return false;
  }
}

void logilinux_device_stop_key_animation(LogiLinuxDevice device,
                                         int key_index) {
  if (!device) {
    return;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    auto *keypad =
        dynamic_cast<LogiLinux::MXKeypadDevice *>(wrapper->device.get());

    if (keypad) {
      keypad->stopKeyAnimation(key_index);
    }
  } catch (...) {
    std::cerr << "Exception in logilinux_device_stop_key_animation"
              << std::endl;
  }
}

void logilinux_device_stop_all_animations(LogiLinuxDevice device) {
  if (!device) {
    return;
  }

  try {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    auto *keypad =
        dynamic_cast<LogiLinux::MXKeypadDevice *>(wrapper->device.get());

    if (keypad) {
      keypad->stopAllAnimations();
    }
  } catch (...) {
    std::cerr << "Exception in logilinux_device_stop_all_animations"
              << std::endl;
  }
}

void logilinux_device_free(LogiLinuxDevice device) {
  if (device) {
    auto wrapper = static_cast<DeviceWrapper *>(device);
    delete wrapper;
  }
}

void logilinux_get_version(int *major, int *minor, int *patch) {
  auto version = LogiLinux::Library::getVersion();
  if (major)
    *major = version.major;
  if (minor)
    *minor = version.minor;
  if (patch)
    *patch = version.patch;
}
