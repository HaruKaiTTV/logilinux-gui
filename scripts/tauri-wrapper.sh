#!/usr/bin/env bash
set -Eeuo pipefail

export GDK_BACKEND="${GDK_BACKEND:-x11}"
export WEBKIT_DISABLE_COMPOSITING_MODE="${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"

if command -v pacman >/dev/null 2>&1 && ! command -v ydotool >/dev/null 2>&1; then
    echo "Installing required dependency: ydotool"
    sudo pacman -S --needed ydotool
fi

if command -v ydotool >/dev/null 2>&1 && [[ ! -S /tmp/.ydotool_socket ]]; then
    systemctl --user start ydotool.service 2>/dev/null || true
    if [[ ! -S /tmp/.ydotool_socket ]] && command -v ydotoold >/dev/null 2>&1; then
        ydotoold --socket-path=/tmp/.ydotool_socket >/tmp/logilinux-ydotoold.log 2>&1 &
    fi
fi

pnpm exec tauri "$@"

if [[ "${1:-}" != "build" ]]; then
    exit 0
fi

if command -v makepkg >/dev/null 2>&1; then
    APP_BINARY="src-tauri/target/release/logilinux-gui"
    FFI_LIB_DIR="$(find src-tauri/target/release/build -type d -path '*/out/lib' -print -quit)"
    if [[ -x "$APP_BINARY" && -f "$FFI_LIB_DIR/liblogilinux-ffi.so" ]]; then
        mkdir -p packaging/.stage
        cp "$APP_BINARY" packaging/.stage/logilinux-gui
        cp "$FFI_LIB_DIR/liblogilinux-ffi.so" packaging/.stage/liblogilinux-ffi.so
        (cd packaging && makepkg -f --noconfirm)
        rm -rf packaging/.stage
        echo "Arch package created in packaging/"
    fi
fi

read -r -p "Install LogiLinux on this computer now? [y/N] " INSTALL_RESPONSE
case "${INSTALL_RESPONSE,,}" in
    y|yes) ;;
    *)
        echo "Build complete. Installation skipped."
        exit 0
        ;;
esac

if command -v pacman >/dev/null 2>&1; then
    APP_BINARY="src-tauri/target/release/logilinux-gui"
    FFI_LIB_DIR="$(find src-tauri/target/release/build -type d -path '*/out/lib' -print -quit)"
    if [[ ! -x "$APP_BINARY" ]]; then
        echo "Build completed, but the application binary was not found at $APP_BINARY." >&2
        exit 1
    fi
    if [[ -z "$FFI_LIB_DIR" || ! -f "$FFI_LIB_DIR/liblogilinux-ffi.so" ]]; then
        echo "Build completed, but liblogilinux-ffi.so was not found." >&2
        exit 1
    fi

    echo "Installing native libraries from $FFI_LIB_DIR to /usr/local/lib"
    sudo install -Dm755 "$FFI_LIB_DIR"/liblogilinux*.so* -t /usr/local/lib
    sudo ldconfig
    echo "Installing Logitech udev rules"
    sudo install -Dm644 udev/50-logi-mx-creative-console-user.rules \
        /etc/udev/rules.d/50-logi-mx-creative-console-user.rules
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    echo "Installing $APP_BINARY and its launcher"
    sudo install -Dm755 "$APP_BINARY" /usr/local/lib/logilinux-gui-bin
    sudo install -Dm755 scripts/logilinux-gui-launcher.sh /usr/local/bin/logilinux-gui
    echo "LogiLinux installed. Run it with: logilinux-gui"
    exit 0
fi

if ! command -v apt-get >/dev/null 2>&1; then
    echo "Build complete. No supported package manager was found; install the generated package manually." >&2
    exit 0
fi

DEB_DIR="src-tauri/target/release/bundle/deb"
DEB_FILE="$(find "$DEB_DIR" -maxdepth 1 -type f -name '*.deb' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-)"

if [[ -z "$DEB_FILE" ]]; then
    echo "Build completed, but no .deb package was found in $DEB_DIR." >&2
    exit 1
fi

echo "Installing $DEB_FILE"
sudo apt-get install -y "$DEB_FILE"
