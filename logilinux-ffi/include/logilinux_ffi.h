#ifndef LOGILINUX_FFI_H
#define LOGILINUX_FFI_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void *LogiLinuxLibrary;
typedef void *LogiLinuxDevice;

typedef enum {
  DEVICE_TYPE_UNKNOWN = 0,
  DEVICE_TYPE_DIALPAD = 1,
  DEVICE_TYPE_CREATIVE_CONSOLE = 2,
} DeviceType;

typedef enum {
  CAPABILITY_ROTATION = 0,
  CAPABILITY_BUTTONS = 1,
  CAPABILITY_HIGH_RES_SCROLL = 2,
  CAPABILITY_LCD_DISPLAY = 3,
} DeviceCapability;

typedef enum {
  EVENT_TYPE_ROTATION = 0,
  EVENT_TYPE_BUTTON_PRESS = 1,
  EVENT_TYPE_BUTTON_RELEASE = 2,
  EVENT_TYPE_DEVICE_CONNECTED = 3,
  EVENT_TYPE_DEVICE_DISCONNECTED = 4,
} EventType;

typedef enum {
  ROTATION_TYPE_DIAL = 0,
  ROTATION_TYPE_WHEEL = 1,
} RotationType;

typedef struct {
  char name[256];
  char device_path[512];
  uint16_t vendor_id;
  uint16_t product_id;
  DeviceType device_type;
} DeviceInfo;

typedef struct {
  EventType type;
  uint64_t timestamp;
} BaseEvent;

typedef struct {
  BaseEvent base;
  RotationType rotation_type;
  int32_t delta;
  int32_t delta_high_res;
  uint16_t raw_event_code;
} RotationEvent;

typedef struct {
  BaseEvent base;
  uint32_t button_code;
  bool pressed;
} ButtonEvent;

typedef struct {
  BaseEvent base;
  char device_path[512];
} DeviceEvent;

typedef void (*EventCallback)(void *user_data, EventType type,
                              const void *event_data);

LogiLinuxLibrary logilinux_library_new(void);
void logilinux_library_free(LogiLinuxLibrary lib);

int logilinux_discover_devices(LogiLinuxLibrary lib, DeviceInfo *devices,
                               int max_devices);
LogiLinuxDevice logilinux_find_device(LogiLinuxLibrary lib, DeviceType type);

bool logilinux_device_get_info(LogiLinuxDevice device, DeviceInfo *info);
DeviceType logilinux_device_get_type(LogiLinuxDevice device);
bool logilinux_device_has_capability(LogiLinuxDevice device,
                                     DeviceCapability cap);

void logilinux_device_set_callback(LogiLinuxDevice device,
                                   EventCallback callback, void *user_data);
void logilinux_device_start_monitoring(LogiLinuxDevice device);
void logilinux_device_stop_monitoring(LogiLinuxDevice device);
bool logilinux_device_is_monitoring(LogiLinuxDevice device);

bool logilinux_device_grab_exclusive(LogiLinuxDevice device, bool grab);
bool logilinux_device_initialize(LogiLinuxDevice device);

// LCD Display functions (MX Keypad only)
bool logilinux_device_set_key_image(LogiLinuxDevice device, int key_index,
                                    const uint8_t *jpeg_data, size_t jpeg_size);
bool logilinux_device_set_key_gif(LogiLinuxDevice device, int key_index,
                                  const uint8_t *gif_data, size_t gif_size,
                                  bool loop);
void logilinux_device_stop_key_animation(LogiLinuxDevice device, int key_index);
void logilinux_device_stop_all_animations(LogiLinuxDevice device);

void logilinux_device_free(LogiLinuxDevice device);
void logilinux_get_version(int *major, int *minor, int *patch);

#ifdef __cplusplus
}
#endif

#endif // LOGILINUX_FFI_H
