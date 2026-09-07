#!/usr/bin/env bash
set -Eeuo pipefail

export GDK_BACKEND="${GDK_BACKEND:-x11}"
export WEBKIT_DISABLE_COMPOSITING_MODE="${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"

if command -v ydotool >/dev/null 2>&1 && [[ ! -S /tmp/.ydotool_socket ]]; then
    systemctl --user start ydotool.service 2>/dev/null || true
    if [[ ! -S /tmp/.ydotool_socket ]] && command -v ydotoold >/dev/null 2>&1; then
        ydotoold --socket-path=/tmp/.ydotool_socket >/tmp/logilinux-ydotoold.log 2>&1 &
    fi
fi

exec /usr/local/lib/logilinux-gui-bin "$@"
