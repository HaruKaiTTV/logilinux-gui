import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { DeviceConfigPage } from "./DeviceConfigPage";
import logiLogo from "../assets/logilogo.svg";

interface DeviceInfo {
  id: string;
  name: string;
  device_type: string;
  vendor_id: number;
  product_id: number;
  is_connected: boolean;
}

interface DeviceEvent {
  type: "ButtonPress" | "ButtonRelease" | "Rotation" | "DeviceConnected" | "DeviceDisconnected";
  button_code?: number;
  delta?: number;
  rotation_type?: string;
  device_path?: string;
}

interface Action {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  command?: string;
  keyCombo?: string;
  rotationOnly?: boolean; // Only available for dial/wheel
  config?: {
    minVolume?: number;
    maxVolume?: number;
    sensitivity?: number;
    minBrightness?: number;
    maxBrightness?: number;
    brightnessSensitivity?: number;
    workspaceNumber?: number;
    keyCombo?: string;
    allowHold?: boolean;
    customCommand?: string;
  };
}

type ButtonMapping = {
  [key: number]: Action | null;
};

interface KeypadImage {
  id: string;
  name: string;
  base64: string;
  tiles: number[];
  createdAt: number;
}

type TileImageMapping = {
  [tileIndex: number]: {
    imageId: string;
    position?: { row: number; col: number; rows: number; cols: number };
  };
};

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [activeButtons, setActiveButtons] = useState<Set<number>>(new Set());
  const [dialRotation, setDialRotation] = useState(0);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelOffset, setWheelOffset] = useState(0);
  const [dialAngle, setDialAngle] = useState(0);
  const [dialSensitivity, setDialSensitivity] = useState(1);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialSensitivityRef = useRef(dialSensitivity);
  const buttonMappingsRef = useRef<ButtonMapping>({});
  const dialAngleRef = useRef(0);
  const selectedDeviceRef = useRef<DeviceInfo | null>(null);

  // Image state
  const [imageLibrary, setImageLibrary] = useState<KeypadImage[]>([]);
  const [tileImageMappings, setTileImageMappings] = useState<TileImageMapping>({});
  const [activeApp, setActiveApp] = useState("All Apps");
  const activeAppRef = useRef("All Apps");
  const appSwitchDebounceRef = useRef<number | null>(null);
  const blankImageCacheRef = useRef<string | null>(null);
  const lastSyncedMappingsRef = useRef<string>("");  // Track last synced state as JSON string

  useEffect(() => {
    dialAngleRef.current = dialAngle;
  }, [dialAngle]);

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  useEffect(() => {
    activeAppRef.current = activeApp;
  }, [activeApp]);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsDropdownRef.current && !settingsDropdownRef.current.contains(event.target as Node)) {
        setShowSettingsDropdown(false);
      }
    };

    if (showSettingsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingsDropdown]);

  // Poll for active window
  useEffect(() => {
    const pollActiveWindow = async () => {
      try {
        const window = await invoke<{ class: string; title: string }>("get_active_window");
        // Use the window class if available, otherwise fall back to "All Apps"
        // Only fall back if class is truly empty or undefined, not if it's a valid string
        let appName = (window.class && window.class.trim() !== "" && window.class !== "unknown") 
          ? window.class 
          : "All Apps";
        
        // If the active window is the logilinux-gui app itself, always use "All Apps"
        // This prevents the app from loading its own override when focused
        if (appName.toLowerCase().includes("logilinux") || appName.toLowerCase().includes("tauri")) {
          appName = "All Apps";
        }
        
        if (appName !== activeApp) {
          setActiveApp(appName);
          // The useEffect watching activeApp will handle reloading
        }
      } catch (err) {
        // Failed to get active window, fall back to "All Apps"
        if (activeApp !== "All Apps") {
          setActiveApp("All Apps");
        }
      }
    };

    // Poll every 1000ms (1 second) - reduced from 500ms for better performance
    const interval = setInterval(pollActiveWindow, 1000);
    return () => clearInterval(interval);
  }, [activeApp]);

  // Helper function to create a blank image
  const createBlankImage = (): string => {
    // Return cached blank image if available
    if (blankImageCacheRef.current) {
      return blankImageCacheRef.current;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 118;
    canvas.height = 118;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return '';

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 118, 118);
    const blankImage = canvas.toDataURL('image/jpeg', 0.85);
    
    // Cache for future use
    blankImageCacheRef.current = blankImage;
    return blankImage;
  };

  // Helper function to convert image to keypad format
  const convertImageToKeypadFormat = async (base64Image: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 118;
        canvas.height = 118;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, 118, 118);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert to JPEG'));
              return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = reject;
      img.src = base64Image;
    });
  };

  // Helper function to slice multi-tile images
  const sliceImageForTile = async (
    base64Image: string,
    row: number,
    col: number,
    totalRows: number,
    totalCols: number
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 118;
        canvas.height = 118;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        const sourceWidth = img.width / totalCols;
        const sourceHeight = img.height / totalRows;
        const sourceX = col * sourceWidth;
        const sourceY = row * sourceHeight;

        ctx.drawImage(
          img,
          sourceX, sourceY, sourceWidth, sourceHeight,
          0, 0, 118, 118
        );

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert to JPEG'));
              return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = reject;
      img.src = base64Image;
    });
  };

  // Send image to physical device
  const sendImageToDevice = async (
    keyIndex: number,
    image: KeypadImage,
    slicePosition?: { row: number; col: number; rows: number; cols: number }
  ) => {
    try {
      let jpegBase64: string;
      
      if (slicePosition) {
        jpegBase64 = await sliceImageForTile(
          image.base64,
          slicePosition.row,
          slicePosition.col,
          slicePosition.rows,
          slicePosition.cols
        );
      } else {
        jpegBase64 = await convertImageToKeypadFormat(image.base64);
      }
      
      await invoke('set_key_image', {
        keyIndex,
        jpegBase64
      });
      
      console.log(`✅ Image sent to device key ${keyIndex}`);
    } catch (error) {
      console.error(`Failed to send image to device key ${keyIndex}:`, error);
    }
  };

  // Load button mappings from localStorage
  const loadMappings = () => {
    const app = activeAppRef.current;
    // Load the active page for the current app
    const activePage = parseInt(localStorage.getItem(`active-page-${app}`) || "1", 10);
    
    console.log(`📥 Loading mappings for app: "${app}", page: ${activePage}`);
    
    // Determine device types to try based on connected devices
    let deviceTypesToTry: string[] = [];
    
    // Check what devices are connected
    const hasKeypad = devices.some(d => d.device_type === "CREATIVE_CONSOLE");
    const hasDialpad = devices.some(d => d.device_type === "DIALPAD");
    
    // Prioritize the actually connected device type
    if (hasKeypad) {
      deviceTypesToTry.push("CREATIVE_CONSOLE");
    }
    if (hasDialpad) {
      deviceTypesToTry.push("DIALPAD");
    }
    
    // Add fallback device types
    deviceTypesToTry.push("default");
    
    // Also try the other types if nothing found yet (for backwards compatibility)
    if (!hasKeypad) deviceTypesToTry.push("CREATIVE_CONSOLE");
    if (!hasDialpad) deviceTypesToTry.push("DIALPAD");
    
    console.log(`  🎯 Device types to try (in order):`, deviceTypesToTry);
    
    for (const deviceType of deviceTypesToTry) {
      // Try app-specific config first, then fall back to "All Apps"
      const storageKeys = [
        `button-mappings-${deviceType}-${app}-page-${activePage}`,
        `button-mappings-${deviceType}-All Apps-page-${activePage}`,
      ];
      
      console.log(`  🔍 Trying device type: ${deviceType}`);
      
      for (const storageKey of storageKeys) {
        console.log(`    🔑 Checking key: ${storageKey}`);
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            buttonMappingsRef.current = parsed;
            console.log(`    ✅ Loaded ${Object.keys(parsed).length} button mappings from ${storageKey}`);
            console.log(`    📋 Mappings:`, parsed);
            return;
          } catch (err) {
            console.error(`Failed to parse mappings for ${deviceType}:`, err);
          }
        }
      }
    }
    console.log(`⚠️ No button mappings found for ${app} page ${activePage}`);
    buttonMappingsRef.current = {};
  };

  // Load image library and mappings
  const loadImageData = () => {
    // Load image library (shared across all pages)
    const savedLibrary = localStorage.getItem('keypad-images');
    if (savedLibrary) {
      try {
        setImageLibrary(JSON.parse(savedLibrary));
      } catch (e) {
        console.error('Failed to load image library:', e);
      }
    }

    // Load tile-image mappings for active page (app-specific)
    const app = activeAppRef.current;
    const activePage = parseInt(localStorage.getItem(`active-page-${app}`) || "1", 10);
    
    // Try app-specific config first, then fall back to "All Apps"
    const storageKeys = [
      `keypad-tile-images-${app}-page-${activePage}`,
      `keypad-tile-images-All Apps-page-${activePage}`,
    ];
    
    let loaded = false;
    for (const storageKey of storageKeys) {
      const savedMappings = localStorage.getItem(storageKey);
      if (savedMappings) {
        try {
          setTileImageMappings(JSON.parse(savedMappings));
          console.log(`📋 Loaded tile images from ${storageKey}`);
          loaded = true;
          break;
        } catch (e) {
          console.error('Failed to load tile-image mappings:', e);
        }
      }
    }
    
    // If no config found for this app or All Apps, clear the mappings
    if (!loaded) {
      console.log(`⚠️ No tile image mappings found for ${app}, clearing`);
      setTileImageMappings({});
    }
  };

  // Export all configuration data
  const exportConfig = async () => {
    try {
      const exportData: any = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        data: {}
      };

      // Export all localStorage data related to configurations
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('button-mappings-') ||
          key.startsWith('keypad-tile-images-') ||
          key.startsWith('keypad-images') ||
          key.startsWith('active-page-')
        )) {
          const value = localStorage.getItem(key);
          if (value) {
            exportData.data[key] = value;
          }
        }
      }

      const jsonContent = JSON.stringify(exportData, null, 2);
      const defaultFilename = `logilinux-config-${new Date().toISOString().split('T')[0]}.json`;
      
      // Use Tauri command to show save dialog and write file
      await invoke('save_config_file', {
        content: jsonContent,
        defaultFilename: defaultFilename
      });

      console.log('✅ Configuration exported successfully');
    } catch (error) {
      console.error('Failed to export configuration:', error);
      if (error !== 'User cancelled') {
        alert('❌ Failed to export configuration');
      }
    }
  };

  // Import configuration data
  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importData = JSON.parse(content);

        if (!importData.version || !importData.data) {
          alert('Invalid configuration file format');
          return;
        }

        // Confirm before importing
        const confirm = window.confirm(
          `Import configuration from ${importData.exportDate || 'unknown date'}?\n\n` +
          `This will replace ALL current configurations including:\n` +
          `- Button mappings\n` +
          `- Tile images\n` +
          `- Page settings\n` +
          `- All app-specific profiles\n\n` +
          `This action cannot be undone!`
        );

        if (!confirm) return;

        // Import all data
        Object.entries(importData.data).forEach(([key, value]) => {
          localStorage.setItem(key, value as string);
        });

        // Reload all data
        loadMappings();
        loadImageData();

        alert('✅ Configuration imported successfully! Reloading...');
        window.location.reload(); // Reload to ensure all state is fresh
      } catch (error) {
        console.error('Failed to import configuration:', error);
        alert('❌ Failed to import configuration. Please check the file format.');
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be imported again
    event.target.value = '';
  };

  // Load mappings on mount and when devices change
  useEffect(() => {
    loadMappings();
    loadImageData();
  }, [devices]);

  // Reload mappings and images when active app changes (with debouncing)
  useEffect(() => {
    // Clear any pending reload
    if (appSwitchDebounceRef.current) {
      clearTimeout(appSwitchDebounceRef.current);
    }
    
    // Debounce the reload to prevent rapid switches from causing multiple reloads
    appSwitchDebounceRef.current = window.setTimeout(() => {
      console.log(`🔄 App switched to: ${activeApp}`);
      loadMappings();
      loadImageData();
    }, 300); // 300ms debounce
    
    return () => {
      if (appSwitchDebounceRef.current) {
        clearTimeout(appSwitchDebounceRef.current);
      }
    };
  }, [activeApp]);

  // Sync images to physical device when tileImageMappings or activeApp changes
  useEffect(() => {
    // Only sync if we have a keypad device
    const hasKeypad = devices.some(d => d.device_type === "CREATIVE_CONSOLE");
    if (!hasKeypad || selectedDevice) return; // Don't sync while in config page
    
    const syncImagesToDevice = async () => {
      // Check if mappings actually changed
      const currentMappings = JSON.stringify(tileImageMappings);
      if (currentMappings === lastSyncedMappingsRef.current) {
        console.log(`⏩ Skipping image sync - no changes detected`);
        return;
      }
      
      console.log(`🔄 Syncing images to device for ${activeApp}`);
      const previousMappings: TileImageMapping = lastSyncedMappingsRef.current 
        ? JSON.parse(lastSyncedMappingsRef.current) 
        : {};
      
      for (let i = 0; i < 9; i++) {
        const currentMapping = tileImageMappings[i];
        const previousMapping = previousMappings[i];
        
        // Skip if this tile hasn't changed
        if (JSON.stringify(currentMapping) === JSON.stringify(previousMapping)) {
          continue;
        }
        
        if (currentMapping) {
          const image = imageLibrary.find(img => img.id === currentMapping.imageId);
          if (image) {
            console.log(`  📷 Updating tile ${i}`);
            await sendImageToDevice(i, image, currentMapping.position);
          }
        } else {
          // No mapping - send blank image
          console.log(`  ⬛ Clearing tile ${i}`);
          const blankBase64 = createBlankImage();
          if (blankBase64) {
            const blankImageObj: KeypadImage = {
              id: `blank-${Date.now()}`,
              name: 'blank',
              base64: blankBase64,
              tiles: [],
              createdAt: Date.now()
            };
            await sendImageToDevice(i, blankImageObj);
          }
        }
      }
      
      // Update last synced state
      lastSyncedMappingsRef.current = currentMappings;
      console.log(`✓ Image sync complete for ${activeApp}`);
    };
    
    syncImagesToDevice();
  }, [tileImageMappings, activeApp, devices, selectedDevice, imageLibrary]);

  // Reload mappings when returning from config page
  useEffect(() => {
    if (!selectedDevice) {
      // Just came back from config page, reload everything
      // Note: This will trigger the activeApp effect to reload, so we just need
      // to ensure state is fresh. Clear the debounce to make it happen immediately.
      if (appSwitchDebounceRef.current) {
        clearTimeout(appSwitchDebounceRef.current);
      }
      loadMappings();
      loadImageData();
      // Force image sync on next render by clearing the last synced state
      lastSyncedMappingsRef.current = "";
    }
  }, [selectedDevice]);

  // Keep ref in sync with state
  useEffect(() => {
    dialSensitivityRef.current = dialSensitivity;
  }, [dialSensitivity]);

  useEffect(() => {
    console.log('🚀 DevicesPage mounting - registering event listener');
    
    // Initial load of mappings and images
    loadMappings();
    loadImageData();

    // Initial discovery
    discoverDevices();

    // Poll for devices every 2 seconds
    const interval = setInterval(() => {
      discoverDevices();
    }, 2000);

    // Start device monitoring
    startMonitoring();

    // Listen for device events
    const unlisten = listen<DeviceEvent>("device-event", (event) => {
      handleDeviceEvent(event.payload);
    });

    return () => {
      console.log('🧹 DevicesPage unmounting - cleaning up event listener');
      clearInterval(interval);
      unlisten.then(fn => fn());
    };
  }, []);

  const handleDeviceEvent = async (event: DeviceEvent) => {
    console.log('🎮 Device event received:', event);
    
    // Handle device connection/disconnection
    if (event.type === "DeviceConnected") {
      console.log('🔌 Device connected, reloading mappings...');
      console.log('📋 Current mappings before reload:', buttonMappingsRef.current);
      // Reload device list and wait for it
      await discoverDevices();
      // Small delay to ensure state updates
      await new Promise(resolve => setTimeout(resolve, 100));
      // Now reload button mappings and images with updated device list
      loadMappings();
      loadImageData();
      console.log('📋 Current mappings after reload:', buttonMappingsRef.current);
      return;
    }
    
    if (event.type === "DeviceDisconnected") {
      console.log('🔌 Device disconnected');
      await discoverDevices();
      return;
    }
    
    // Don't execute actions if we're in the config page (selectedDevice is set)
    // The config page has its own event listener
    if (selectedDeviceRef.current) {
      console.log('⏸️  Ignoring event - in config page');
      return;
    }

    if (event.type === "ButtonPress" && event.button_code !== undefined) {
      setActiveButtons(prev => new Set(prev).add(event.button_code!));
      
      const action = buttonMappingsRef.current[event.button_code];
      console.log(`🔍 Button ${event.button_code} pressed, action:`, action);
      if (action) {
        console.log(`▶️  Executing action:`, action.name);
        executeAction(action, true); // true = press
      } else {
        console.log(`⚠️  No action mapped for button ${event.button_code}`);
        console.log('📋 Current mappings:', buttonMappingsRef.current);
      }
    } else if (event.type === "ButtonRelease" && event.button_code !== undefined) {
      setActiveButtons(prev => {
        const next = new Set(prev);
        next.delete(event.button_code!);
        return next;
      });
      
      // Handle key release for hold actions
      const action = buttonMappingsRef.current[event.button_code];
      if (action && action.keyCombo && action.config?.allowHold) {
        executeAction(action, false); // false = release
      }
    } else if (event.type === "Rotation" && event.delta !== undefined) {
      
      if (event.rotation_type === "DIAL") {
        const sensitivity = dialSensitivityRef.current;
        setDialRotation(event.delta);
        setDialAngle(prev => prev + event.delta * sensitivity);
        setTimeout(() => setDialRotation(0), 300);
        
        const action = buttonMappingsRef.current[1000];
        if (action && event.delta) {
          executeRotationAction(action, event.delta);
        }
      } else if (event.rotation_type === "WHEEL") {
        setWheelRotation(event.delta);
        setWheelOffset(prev => prev - event.delta * 3);
        setTimeout(() => setWheelRotation(0), 300);
        
        const action = buttonMappingsRef.current[1001];
        if (action && event.delta) {
          executeRotationAction(action, event.delta);
        }
      }
    }
  };

  const executeAction = async (action: Action, isPress: boolean = true) => {
    if (action.keyCombo) {
      if (action.keyCombo === "custom-keybind" && action.config?.keyCombo) {
        // Execute the custom keybind from config
        const allowHold = action.config.allowHold ?? false;
        try {
          await invoke("execute_key_combo", { 
            combo: action.config.keyCombo,
            hold: allowHold,
            press: isPress
          });
        } catch (err) {
          // Failed
        }
      } else if (action.keyCombo !== "custom-keybind") {
        // Execute predefined keybind (always press+release together)
        try {
          await invoke("execute_key_combo", { 
            combo: action.keyCombo,
            hold: false,
            press: true
          });
        } catch (err) {
          // Failed
        }
      }
    } else if (action.command) {
      if (action.command === "workspace-goto") {
        // Handle workspace goto with config
        const workspaceNum = action.config?.workspaceNumber ?? 1;
        const command = `hyprctl dispatch workspace ${workspaceNum}`;
        try {
          await invoke("execute_command", { command });
        } catch (err) {
          // Failed
        }
      } else if (action.command === "custom-command") {
        // Handle custom command from config
        const customCmd = action.config?.customCommand ?? "";
        if (customCmd) {
          try {
            await invoke("execute_command", { command: customCmd });
          } catch (err) {
            // Failed
          }
        }
      } else {
        try {
          await invoke("execute_command", { command: action.command });
        } catch (err) {
          // Failed
        }
      }
    }
  };

  const executeRotationAction = async (action: Action, delta: number) => {
    if (action.command === "volume-control") {
      const minVol = action.config?.minVolume ?? 0;
      const maxVol = action.config?.maxVolume ?? 100;
      const sensitivity = action.config?.sensitivity ?? 1;
      
      const volumeRange = maxVol - minVol;
      const volumeChange = (volumeRange / 360) * delta * sensitivity;
      
      const direction = volumeChange > 0 ? "+" : "-";
      const absChange = Math.abs(volumeChange);
      const volumeCommand = `pactl set-sink-volume @DEFAULT_SINK@ ${direction}${absChange.toFixed(2)}%`;
      
      try {
        await invoke("execute_command", { command: volumeCommand });
      } catch (err) {
        // Failed
      }
      return;
    }
    
    if (action.command === "brightness-control") {
      const minBright = action.config?.minBrightness ?? 0;
      const maxBright = action.config?.maxBrightness ?? 100;
      const sensitivity = action.config?.brightnessSensitivity ?? 1;
      
      const brightnessRange = maxBright - minBright;
      const brightnessChange = (brightnessRange / 360) * delta * sensitivity;
      
      const direction = brightnessChange > 0 ? "+" : "-";
      const absChange = Math.abs(brightnessChange);
      const brightnessCommand = `brightnessctl set ${absChange.toFixed(2)}%${direction}`;
      
      try {
        await invoke("execute_command", { command: brightnessCommand });
      } catch (err) {
        // Failed
      }
      return;
    }
    
    if (action.command === "scroll-control") {
      // Simulate mouse scroll events
      const scrollAmount = Math.abs(delta);
      const direction = delta > 0 ? "up" : "down";
      
      try {
        await invoke("execute_scroll", { direction, amount: scrollAmount });
      } catch (err) {
        // Fallback: use xdotool if available
        try {
          const scrollCmd = delta > 0 
            ? `xdotool click 4` // scroll up
            : `xdotool click 5`; // scroll down
          
          for (let i = 0; i < scrollAmount; i++) {
            await invoke("execute_command", { command: scrollCmd });
          }
        } catch (fallbackErr) {
          // Failed
        }
      }
      return;
    }
    
    const times = Math.abs(delta);
    for (let i = 0; i < times; i++) {
      await executeAction(action);
    }
  };

  const startMonitoring = async () => {
    try {
      await invoke("start_device_monitoring");
    } catch (err) {
      // Failed
    }
  };

  const discoverDevices = async () => {
    try {
      const discovered = await invoke<DeviceInfo[]>("discover_devices");
      setDevices(discovered);
    } catch (err) {
      setDevices([]);
    }
  };

  // If a device is selected, show config page (AFTER all hooks)
  if (selectedDevice) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="config"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <DeviceConfigPage
            deviceName={selectedDevice.name}
            deviceType={selectedDevice.device_type}
            onBack={() => setSelectedDevice(null)}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="devices"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="dark-bg w-screen h-screen flex overflow-hidden text-white"
      >
      {/* Main App Window */}
      <div className="w-full h-full bg-[#111111] flex flex-col relative overflow-hidden">

        {/* Header */}
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="h-20 flex items-center justify-between px-8 border-b border-white/5"
        >
          <img src={logiLogo} alt="LogiLinux" className="h-8" />

          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
            {/* Active App Indicator */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
              </svg>
              <span className="text-sm font-bold text-cyan-400">{activeApp}</span>
            </div>

            <div className="flex items-center gap-6 text-xs font-bold text-gray-400 tracking-wider">
            <button className="hover:text-white transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path>
              </svg>
              ADD DEVICE
            </button>

            <button className="hover:text-white transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                <path d="M224.83,114.78l-26.26-26.26a1.42,1.42,0,0,0-.1-.11l-18.31-18.3A44.07,44.07,0,0,0,118,32h-2a44.08,44.08,0,0,0-43.8,40H56a16,16,0,0,0-16,16v32a8,8,0,0,0,16,0V88h56v80H56v-8a8,8,0,0,0-16,0v8a16,16,0,0,0,16,16h16.2A44.08,44.08,0,0,0,116,224h2a44.07,44.07,0,0,0,62.16-38.11l18.31-18.31a1.42,1.42,0,0,0,.11-.1l26.26-26.26A16,16,0,0,0,224.83,114.78ZM116,208a28,28,0,0,1,0-56h2a28,28,0,0,1,19.6,8l-28.95,28.94A8,8,0,0,0,120,200a28.06,28.06,0,0,1-4,8Zm2-136a28.08,28.08,0,0,1,27.71,24H120a8,8,0,0,0,0,16h26.88A28.11,28.11,0,0,1,135.3,131.3L116,112.69V96h2a28,28,0,0,1,0,56h-2a28,28,0,0,1-2.31-.12L125.89,139.7a8,8,0,0,0-11.31,0l-13.89,13.89A43.83,43.83,0,0,0,116,208h2a27.87,27.87,0,0,1-19.6-8l28.95-28.94A8,8,0,0,0,136,160a28.06,28.06,0,0,1,4-8Zm82.41,52.68-21.65,21.65L159.88,127.46l21.65-21.65Z"></path>
              </svg>
              CUSTOM ACTIONS
            </button>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-bold text-gray-400 tracking-wider">
            <div className="w-[1px] h-4 bg-gray-700 mx-2"></div>

            {/* Profile Button with Dropdown */}
            <div className="relative" ref={settingsDropdownRef}>
              <button 
                onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
                className="hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z"></path>
                </svg>
              </button>

              {/* Profile Dropdown */}
              <AnimatePresence>
                {showSettingsDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 mt-2 w-48 bg-gray-900/40 backdrop-blur-md border border-white/5 rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="py-1">
                      {/* Import/Export Buttons */}
                      <div className="px-2 py-2 flex gap-2">
                        <label className="flex-1 px-3 py-2 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors rounded-lg cursor-pointer">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={importConfig}
                            className="hidden"
                          />
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
                            <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-42.34-61.66a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L120,164.69V120a8,8,0,0,1,16,0v44.69l10.34-10.35A8,8,0,0,1,157.66,154.34Z"></path>
                          </svg>
                          Import
                        </label>
                        <button 
                          onClick={exportConfig}
                          className="flex-1 px-3 py-2 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors rounded-lg"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 256 256">
                            <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-42.34-77.66a8,8,0,0,1-11.32,11.32L136,139.31V184a8,8,0,0,1-16,0V139.31l-10.34,10.35a8,8,0,0,1-11.32-11.32l24-24a8,8,0,0,1,11.32,0Z"></path>
                          </svg>
                          Export
                        </button>
                      </div>
                      <div className="border-t border-white/5 my-1"></div>
                      <button className="w-full px-4 py-2.5 text-left text-sm text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors">
                        General Settings
                      </button>
                      <button className="w-full px-4 py-2.5 text-left text-sm text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors">
                        Appearance
                      </button>
                      <button className="w-full px-4 py-2.5 text-left text-sm text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors">
                        Notifications
                      </button>
                      <div className="border-t border-white/5 my-1"></div>
                      <button className="w-full px-4 py-2.5 text-left text-sm text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-colors">
                        About
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.header>

        {/* Content Area */}
        <main className="flex-1 flex items-center justify-center gap-16 pb-8">
          {devices.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="text-gray-500 text-lg font-medium mb-2">No devices connected</div>
              <div className="text-gray-600 text-sm">Connect your MX Dialpad to get started</div>
            </motion.div>
          ) : (
            <>
              {devices.map((device, index) => (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <DeviceCard
                    device={device}
                    activeButtons={activeButtons}
                    dialRotation={dialRotation}
                    wheelRotation={wheelRotation}
                    wheelOffset={wheelOffset}
                    dialAngle={dialAngle}
                    tileImageMappings={tileImageMappings}
                    imageLibrary={imageLibrary}
                    onClick={() => setSelectedDevice(device)}
                  />
                </motion.div>
              ))}
            </>
          )}
        </main>

        {/* Bottom Beta Tag */}
        <div className="absolute bottom-0 w-full flex justify-center pointer-events-none">
          <div className="bg-[#ff3b30] text-white text-[10px] font-extrabold px-6 py-1 rounded-t text-center tracking-widest shadow-[0_0_15px_rgba(255,59,48,0.4)]">
            BETA
          </div>
        </div>
      </div>

      {/* Stylized Background Blur blobs */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-40 animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-40"></div>
      </div>
      </motion.div>
    </AnimatePresence>
  );
}

function DeviceCard({ device, activeButtons, dialRotation, wheelRotation, wheelOffset, dialAngle, tileImageMappings, imageLibrary, onClick }: {
  device: DeviceInfo;
  activeButtons: Set<number>;
  dialRotation: number;
  wheelRotation: number;
  wheelOffset: number;
  dialAngle: number;
  tileImageMappings: TileImageMapping;
  imageLibrary: KeypadImage[];
  onClick: () => void;
}) {
  // DIALPAD = MX Dialpad Mouse (dial controller)
  // CREATIVE_CONSOLE = MX Creative Console (keypad)
  const isDial = device.device_type === "DIALPAD";

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center cursor-pointer"
      onClick={onClick}
    >
      <div className="h-72 flex items-center justify-center">
        {isDial ? (
          <DialDevice activeButtons={activeButtons} dialRotation={dialRotation} wheelRotation={wheelRotation} wheelOffset={wheelOffset} dialAngle={dialAngle} />
        ) : (
          <div className="scale-[1.2]">
            <KeypadDevice 
              activeButtons={activeButtons} 
              tileImageMappings={tileImageMappings}
              imageLibrary={imageLibrary}
            />
          </div>
        )}
      </div>

      {/* Battery/Connection Badge */}
      {isDial ? (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] px-4 py-1.5 rounded-md text-[10px] font-semibold text-gray-400 flex items-center gap-2 border border-white/5 shadow-lg">
          <div className="w-1 h-1 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]"></div>
          <span className="text-[9px] tracking-wider uppercase">100% Charged</span>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] px-4 py-1.5 rounded-md text-[10px] font-semibold text-gray-400 flex items-center gap-2 border border-white/5 shadow-lg">
          <div className="w-1 h-1 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.8)]"></div>
          <span className="text-[9px] tracking-wider uppercase">Connected</span>
        </div>
      )}
    </motion.div>
  );
}

function DialDevice({ activeButtons, dialRotation, wheelRotation, wheelOffset, dialAngle }: {
  activeButtons: Set<number>;
  dialRotation: number;
  wheelRotation: number;
  wheelOffset: number;
  dialAngle: number;
}) {
  // MX Dialpad button codes:
  // 275 = Top Left button
  // 276 = Top Right button  
  // 277 = Bottom Left button
  // 278 = Bottom Right button

  return (
    <div className="device-casing w-64 h-64 rounded-[2.5rem] relative">
      {/* Top Left: Small Buttons */}
      <div className="absolute top-7 left-7 flex gap-2">
        <div className={`tactile-btn w-7 h-7 rounded-full flex items-center justify-center relative transition-transform ${activeButtons.has(275) ? 'scale-95 brightness-150' : ''}`}></div>
        <div className={`tactile-btn w-7 h-7 rounded-full flex items-center justify-center relative transition-transform ${activeButtons.has(276) ? 'scale-95 brightness-150' : ''}`}></div>
      </div>

      {/* Center Top: Logo & LED */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <span className="text-[#555] font-bold text-[11px] tracking-tight opacity-80">logi</span>
        <div className="w-1 h-1 rounded-full led-green"></div>
      </div>

      {/* Top Right: Roller with Ridges */}
      <div className="absolute top-7 right-6">
        <div className="w-14 h-8 rounded bg-[#181818] p-[2px] shadow-[inset_0_1px_3px_rgba(0,0,0,1)] border-b border-white/5 overflow-hidden">
          <div 
            className="roller-wheel w-full h-full rounded-[1px] transition-all duration-300"
            style={{ 
              backgroundPositionY: `${wheelOffset}px`
            }}
          ></div>
        </div>
      </div>

      {/* Center: The Big Dial */}
      <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full bg-[#1a1a1a] shadow-inner flex items-center justify-center">
        <div
          className="main-dial w-32 h-32 rounded-full relative transition-transform duration-300"
          style={{ transform: `rotate(${dialAngle}deg)` }}
        >
          {/* Indicator dot */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/20 shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]"></div>
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="absolute bottom-6 left-6">
        <div className={`tactile-btn w-10 h-10 rounded-full flex items-center justify-center relative transition-transform ${activeButtons.has(277) ? 'scale-95 brightness-150' : ''}`}></div>
      </div>
      <div className="absolute bottom-6 right-6">
        <div className={`tactile-btn w-10 h-10 rounded-full flex items-center justify-center relative transition-transform ${activeButtons.has(278) ? 'scale-95 brightness-150' : ''}`}></div>
      </div>
    </div>
  );
}

function KeypadDevice({ activeButtons, tileImageMappings, imageLibrary }: { 
  activeButtons: Set<number>;
  tileImageMappings: TileImageMapping;
  imageLibrary: KeypadImage[];
}) {
  // MX Keypad button codes:
  // 0-8 = Grid buttons (3x3 layout)
  // 0xa1 (161) = P1 (Left navigation)
  // 0xa2 (162) = P2 (Right navigation)
  
  // Helper function to get image for a tile
  const getTileImage = (tileIndex: number) => {
    if (!tileImageMappings) return null;
    const mapping = tileImageMappings[tileIndex];
    if (!mapping) return null;
    const image = imageLibrary.find(img => img.id === mapping.imageId);
    return image ? { image, position: mapping.position } : null;
  };
  
  return (
    <div className="device-casing w-48 h-[13.5rem] rounded-[2rem] relative flex flex-col items-center pt-4 px-2 pb-3">
      {/* Cable */}
      <div className="cable"></div>

      {/* Button Container - Fixed width for alignment */}
      <div className="flex flex-col w-full max-w-[136px]">
        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {Array.from({ length: 9 }).map((_, i) => {
            const tileImageData = getTileImage(i);
            
            return (
            <div
              key={i}
              className={`keypad-btn w-10 h-10 rounded-lg transition-transform relative overflow-hidden ${
                activeButtons.has(i) ? 'scale-95 brightness-150' : ''
              }`}
            >
              {/* Image background */}
              {tileImageData && (
                <div className="absolute inset-0">
                  {tileImageData.position ? (
                    // Multi-tile image - show slice
                    <div
                      className="w-full h-full"
                      style={{
                        backgroundImage: `url(${tileImageData.image.base64})`,
                        backgroundSize: `${tileImageData.position.cols * 100}% ${tileImageData.position.rows * 100}%`,
                        backgroundPosition: `${(tileImageData.position.col / (tileImageData.position.cols - 1)) * 100}% ${(tileImageData.position.row / (tileImageData.position.rows - 1)) * 100}%`,
                      }}
                    />
                  ) : (
                    // Single-tile image
                    <img
                      src={tileImageData.image.base64}
                      alt="Tile"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Bottom Row: Arrows & Logo */}
        <div className="flex items-end w-full mt-auto">
          <div className="flex gap-2">
            <div className={`arrow-btn w-10 h-8 rounded-lg flex items-center justify-center transition-transform ${activeButtons.has(0xa1) ? 'scale-95 brightness-150' : ''}`}>
              <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 256 256">
                <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"></path>
              </svg>
            </div>
            <div className={`arrow-btn w-10 h-8 rounded-lg flex items-center justify-center transition-transform ${activeButtons.has(0xa2) ? 'scale-95 brightness-150' : ''}`}>
              <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 256 256">
                <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
              </svg>
            </div>
          </div>
          <div className="ml-auto flex items-end justify-end w-10 -ml-1 -translate-y-2">
            <span className="text-[#444] font-bold text-[10px]">logi</span>
          </div>
        </div>
      </div>
    </div>
  );
}
