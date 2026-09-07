# Logi## Features

- 🎯 **Real-time Device Detection** - Automatic discovery of connected Logitech devices
- 🖱️ **Interactive Device Visualization** - Realistic 3D-styled device models with live feedback
- 🎨 **Modern Dark UI** - Logi Options+ inspired design with smooth animations
- 🔘 **Button Press Detection** - Visual feedback for all button interactions
- 🎡 **Dial & Wheel Monitoring** - Separate tracking for main dial and scroll wheel
- ⚡ **Event System** - Real-time device event monitoring and handling

A modern, Logi Options+ inspired desktop application for configuring Logitech devices on Linux.

Built with **Tauri 2.0** (Rust backend) + **React 18/TypeScript** (frontend) + **logilinux** C++ library.

## Features

- 🎯 **Real-time Device Detection** - Automatic discovery of connected Logitech devices
- 🖱️ **Interactive Device Visualization** - Realistic 3D-styled device models with live feedback
- 🎨 **Modern Dark UI** - Logi Options+ inspired design with smooth animations
- � **Button Press Detection** - Visual feedback for all button interactions
- 🎡 **Dial & Wheel Monitoring** - Separate tracking for main dial and scroll wheel
- ⚡ **Event System** - Real-time device event monitoring and handling
- � **Permission Management** - Automated udev rules setup for device access

## Supported Devices

- ✅ **MX Dialpad Mouse** - Full support (dial, wheel, 4 buttons)
- 🚧 **MX Creative Console** - Partial support (keypad visualization)

## Prerequisites

### System Dependencies

**Ubuntu/Debian:**

```bash
sudo apt install build-essential curl wget file \
    libwebkit2gtk-4.1-dev libssl-dev \
    libayatana-appindicator3-dev librsvg2-dev \
    cmake pkg-config libudev-dev
```

**Arch Linux:**

```bash
sudo pacman -S base-devel curl wget file \
    webkit2gtk-4.1 openssl \
    libayatana-appindicator librsvg \
    cmake pkgconf systemd
```

**Fedora:**

```bash
sudo dnf install gcc-c++ curl wget file \
    webkit2gtk4.1-devel openssl-devel \
    libappindicator-gtk3-devel librsvg2-devel \
    cmake pkgconfig systemd-devel
```

### Development Tools

```bash
# Install Rust (required for Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Node.js 20+ with pnpm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc  # or ~/.zshrc
nvm install 20
npm install -g pnpm
```

## Building & Running

### 1. Clone the Repository

```bash
git clone https://github.com/HaruKaiTTV/logilinux-gui.git
cd logilinux-gui
```

### 2. Install Dependencies

```bash
# Install frontend packages
pnpm install

# Set up Python environment for custom actions (plugins)
./setup_python.sh
```

The Rust/C++ dependencies will be automatically built on first run.

### 3. Run Development Build

```bash
# Run with Wayland compatibility fix (if needed)
WEBKIT_DISABLE_COMPOSITING_MODE=1 pnpm tauri dev

# Or just
pnpm tauri dev
```

### 4. Build Production Release

```bash
# Build production app (.deb package on Debian/Ubuntu)
pnpm tauri build

# Output will be in: src-tauri/target/release/bundle/
```

## Project Structure

```
logilinux-gui/
├── src/                        # React frontend (TypeScript)
│   ├── components/            # UI components
│   │   ├── layout/           # Layout components (Sidebar, etc)
│   │   └── ui/               # shadcn/ui components
│   ├── pages/                # Page components
│   │   └── DevicesPage.tsx   # Main device management page
│   ├── lib/                  # Utilities
│   └── index.css             # Global styles (device rendering CSS)
│
├── src-tauri/                 # Rust backend (Tauri 2.0)
│   ├── src/
│   │   ├── commands/         # Tauri command handlers
│   │   │   ├── devices.rs    # Device discovery
│   │   │   ├── events.rs     # Event monitoring
│   │   │   └── permissions.rs # Permission checking
│   │   ├── logilinux/        # Rust FFI bindings
│   │   │   ├── ffi.rs        # Raw C bindings (auto-generated)
│   │   │   └── mod.rs        # Safe Rust wrappers
│   │   └── main.rs           # Tauri app entry point
│   ├── build.rs              # Build script (bindgen, CMake)
│   ├── Cargo.toml            # Rust dependencies
│   └── tauri.conf.json       # Tauri configuration
│
├── logilinux-ffi/            # C++ FFI wrapper library
│   ├── CMakeLists.txt        # CMake build config (fetches logilinux from GitHub)
│   ├── include/
│   │   └── logilinux_ffi.h   # C-compatible header
│   └── src/
│       └── logilinux_ffi.cpp # C wrapper implementation
│
└── ref/                      # Reference materials (not used in build)
    ├── logilinux/           # Local copy of logilinux library (reference only)
    └── mock_web/            # Design mockups
```

## Architecture

```
┌──────────────────────────────────┐
│  React Frontend (TypeScript)     │
│  - DevicesPage.tsx               │
│  - Device visualization          │
│  - Event handling & state        │
└──────────┬───────────────────────┘
           │ Tauri IPC (invoke/listen)
┌──────────▼───────────────────────┐
│  Rust Backend (Tauri 2.0)        │
│  - discover_devices()            │
│  - start_device_monitoring()     │
│  - Event emission to frontend    │
└──────────┬───────────────────────┘
           │ FFI (bindgen)
┌──────────▼───────────────────────┐
│  C++ FFI Wrapper                 │
│  - logilinux_ffi.cpp             │
│  - C-compatible interface        │
└──────────┬───────────────────────┘
           │ C++ API
┌──────────▼───────────────────────┐
│  logilinux Library (C++)         │
│  - Device communication          │
│  - Event callbacks               │
│  - HID++ protocol handling       │
└──────────────────────────────────┘
```

## How It Works

1. **Frontend** (React) requests device discovery via Tauri command
2. **Rust backend** calls C++ FFI wrapper functions
3. **C++ wrapper** uses logilinux library to scan `/dev/input/*`
4. **Device events** flow backwards through the stack:
   - C++ callback → Rust event handler → Tauri emit → React listener
5. **UI updates** show real-time visual feedback (button presses, dial rotation)

## Development Commands

```bash
# Frontend development (web preview only)
pnpm dev

# Full Tauri app with hot reload
pnpm tauri dev

# Build production binary
pnpm tauri build

# Build specific bundle types
pnpm tauri build --bundles deb
pnpm tauri build --bundles appimage

# Run Rust tests
cd src-tauri && cargo test

# Check Rust code quality
cd src-tauri && cargo clippy

# Clean build artifacts
rm -rf src-tauri/target logilinux-ffi/build node_modules dist
```

## Troubleshooting

### Device Not Detected

1. **Check device files:**

   ```bash
   ls -l /dev/input/by-id/ | grep -i logitech
   ls -l /dev/input/event*
   ```

2. **Test with console logs:**
   Open DevTools (Ctrl+Shift+I) and watch for device discovery logs.

### Build Fails

1. **Clean everything:**

   ```bash
   rm -rf src-tauri/target logilinux-ffi/build
   cargo clean
   pnpm tauri dev
   ```

2. **Check CMake:**

   ```bash
   cmake --version  # Should be 3.15+
   ```

3. **Check bindgen dependencies:**
   ```bash
   sudo apt install libclang-dev  # Ubuntu/Debian
   sudo pacman -S clang            # Arch
   ```

### Wayland Display Issues

If you see protocol errors:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 pnpm tauri dev
```

### Events Not Working

1. **Check event monitoring started:**
   Look for "✅ Device monitoring started" in console

2. **Check exclusive grab:**
   Look for "Device grabbed exclusively" message

3. **Verify logilinux fetch:**
   ```bash
   ls logilinux-ffi/build/_deps/logilinux-src
   ```

## Current Implementation Status

### ✅ Completed Features

- [x] Full Tauri 2.0 + React + TypeScript project setup
- [x] Logi Options+ inspired dark UI (1100x700 fixed window)
- [x] Realistic MX Dialpad device visualization with:
  - [x] Dot-textured casing
  - [x] 3D tactile buttons with visual press feedback
  - [x] Rotating main dial with indicator dot
  - [x] Rolling scroll wheel with ridges
  - [x] LED indicator
- [x] C++ FFI wrapper (logilinux-ffi) auto-building via CMake
- [x] Rust FFI bindings auto-generation via bindgen
- [x] Device discovery polling (2-second intervals)
- [x] Real-time event monitoring system:
  - [x] Button press/release detection (codes 275-278)
  - [x] Dial rotation tracking (accumulating angle)
  - [x] Wheel rotation tracking (separate from dial)
  - [x] C callback → Rust → Tauri emit → React flow
- [x] Tauri 2.0 capabilities configuration
- [x] Visual feedback animations (button scale, dial rotation, wheel roll)

### 🚧 In Progress / Planned

- [ ] Action mapping configuration
- [ ] Profile management system
- [ ] Settings persistence
- [ ] Multi-device support
- [ ] MX Creative Console full support
- [ ] Custom button assignments
- [ ] Application-specific profiles

## Contributing

Contributions are welcome! Please see [PLAN_WEB.md](./PLAN_WEB.md) for the full development roadmap.

## License

GPL v3

## Acknowledgments

- Built on top of [logilinux](https://github.com/HaruKaiTTV/logilinux) - The core C++ library for Logitech device communication
- Powered by [Tauri](https://tauri.app/) - Rust-based desktop app framework
- UI inspired by Logitech Options+ design language
- Uses [shadcn/ui](https://ui.shadcn.com/) components
