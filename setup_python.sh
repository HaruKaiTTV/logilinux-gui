#!/usr/bin/env bash

# Set up the Python environment used by LogiLinux example plugins.
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required but was not found in PATH." >&2
    exit 1
fi

SDK_URL="${SDK_URL:-https://github.com/HaruKaiTTV/logilinux-sdk.git}"
SDK_PATH="${SDK_PATH:-../logilinux-sdk}"

if [[ ! -d "$SDK_PATH/.git" ]]; then
    if [[ -e "$SDK_PATH" ]]; then
        echo "Error: SDK_PATH exists but is not a Git checkout: $SDK_PATH" >&2
        echo "Remove it or set SDK_PATH to the logilinux-sdk checkout." >&2
        exit 1
    fi

    if ! command -v git >/dev/null 2>&1; then
        echo "Error: git is required to download logilinux-sdk." >&2
        exit 1
    fi

    echo "Cloning logilinux-sdk into $SDK_PATH"
    git clone --recurse-submodules "$SDK_URL" "$SDK_PATH"
fi

SDK_PATH="$(cd -- "$SDK_PATH" && pwd)"

if ! git -C "$SDK_PATH" submodule update --init --recursive; then
    echo "Error: failed to initialize logilinux-sdk submodules." >&2
    exit 1
fi

# Keep the environment at the path used by logilinux.config.json.
VENV_PATH="$SCRIPT_DIR/venv"
if [[ ! -x "$VENV_PATH/bin/python" ]]; then
    echo "Creating Python virtual environment at $VENV_PATH"
    python3 -m venv "$VENV_PATH"
fi

PYTHON="$VENV_PATH/bin/python"

if [[ -n "$SDK_PATH" && -f "$SDK_PATH/requirements.txt" ]]; then
    echo "Installing SDK requirements"
    "$PYTHON" -m pip install -r "$SDK_PATH/requirements.txt"
elif [[ -n "$SDK_PATH" && ( -f "$SDK_PATH/pyproject.toml" || -f "$SDK_PATH/setup.py" ) ]]; then
    echo "Installing the SDK Python package"
    "$PYTHON" -m pip install -e "$SDK_PATH"
else
    echo "No SDK dependency manifest found; environment is ready."
fi

echo "Python environment ready: $PYTHON"
