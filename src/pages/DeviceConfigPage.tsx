import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

interface DeviceConfigPageProps {
  deviceName: string;
  deviceType: string;
  onBack: () => void;
}

interface DeviceEvent {
  type: "ButtonPress" | "ButtonRelease" | "Rotation";
  button_code?: number;
  delta?: number;
  rotation_type?: string;
}

interface Action {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  command?: string;
  keyCombo?: string;
  rotationOnly?: boolean;
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

const AVAILABLE_ACTIONS: Action[] = [
  { id: "mute", name: "Toggle Mute", description: "Mute/unmute audio", category: "MEDIA & VOLUME", icon: "🔇", command: "pactl set-sink-mute @DEFAULT_SINK@ toggle" },
  { id: "volume-control", name: "Volume Control", description: "Adjust volume with rotation", category: "MEDIA & VOLUME", icon: "🔊", command: "volume-control", rotationOnly: true },
  { id: "brightness-control", name: "Brightness Control", description: "Adjust brightness with rotation", category: "MEDIA & VOLUME", icon: "☀️", command: "brightness-control", rotationOnly: true },
  { id: "scroll-control", name: "Scroll Control", description: "Scroll up/down with rotation", category: "MEDIA & VOLUME", icon: "🖱️", command: "scroll-control", rotationOnly: true },
  
  { id: "lockscreen", name: "Lock Screen", description: "Lock with hyprlock", category: "SYSTEM", icon: "🔒", command: "hyprlock" },
  { id: "custom-command", name: "Custom Command", description: "Execute any shell command", category: "SYSTEM", icon: "💻", command: "custom-command" },
  
  { id: "workspace-goto", name: "Go to Workspace", description: "Switch to specific workspace", category: "NAVIGATION", icon: "🎯", command: "workspace-goto" },
  { id: "workspace-prev", name: "Previous Workspace", description: "Switch to previous workspace", category: "NAVIGATION", icon: "⬅️", command: "hyprctl dispatch workspace e-1" },
  { id: "workspace-next", name: "Next Workspace", description: "Switch to next workspace", category: "NAVIGATION", icon: "➡️", command: "hyprctl dispatch workspace e+1" },
  
  { id: "custom-keybind", name: "Custom Keybind", description: "Press any key combination", category: "KEYBOARD", icon: "⌨️", keyCombo: "custom-keybind" },
  
  { id: "open-terminal", name: "Open Terminal", description: "Launch terminal", category: "OPEN", icon: "⌨️", command: "kitty" },
  { id: "open-browser", name: "Open Browser", description: "Launch Firefox", category: "OPEN", icon: "🌐", command: "firefox" },
  { id: "open-filemanager", name: "Open File Manager", description: "Launch Dolphin", category: "OPEN", icon: "📁", command: "dolphin" },
];
export function DeviceConfigPage({ deviceName, deviceType, onBack }: DeviceConfigPageProps) {
  const [activePage, setActivePage] = useState(1);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [configApp, setConfigApp] = useState("All Apps"); // The app we're configuring
  const [savedApps, setSavedApps] = useState<string[]>([]); // List of apps that have saved configs
  const [showAddAppModal, setShowAddAppModal] = useState(false);
  const [newAppName, setNewAppName] = useState("");

  

  const [selectedComponent, setSelectedComponent] = useState<number | null>(null);
  const [activeButtons, setActiveButtons] = useState<Set<number>>(new Set());
  const [dialRotation, setDialRotation] = useState(0);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelOffset, setWheelOffset] = useState(0);
  const [dialAngle, setDialAngle] = useState(0);
  const [buttonMappings, setButtonMappings] = useState<ButtonMapping>({});
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configAction, setConfigAction] = useState<Action | null>(null);
  const [tempMinVolume, setTempMinVolume] = useState(0);
  const [tempMaxVolume, setTempMaxVolume] = useState(100);
  const [tempSensitivity, setTempSensitivity] = useState(1);
  const [tempMinBrightness, setTempMinBrightness] = useState(0);
  const [tempMaxBrightness, setTempMaxBrightness] = useState(100);
  const [tempBrightnessSensitivity, setTempBrightnessSensitivity] = useState(1);
  const [tempWorkspaceNumber, setTempWorkspaceNumber] = useState(1);
  const [tempKeyCombo, setTempKeyCombo] = useState("");
  const [isListeningForKeys, setIsListeningForKeys] = useState(false);
  const [tempAllowHold, setTempAllowHold] = useState(false);
  const [tempCustomCommand, setTempCustomCommand] = useState("");
  const dialSensitivity = 1;
  const dialSensitivityRef = useRef(dialSensitivity);
  const buttonMappingsRef = useRef<ButtonMapping>({});
  const dialAngleRef = useRef(0);

  // Image state
  const [imageLibrary, setImageLibrary] = useState<KeypadImage[]>([]);
  const [tileImageMappings, setTileImageMappings] = useState<TileImageMapping>({});
  const [selectedTiles, setSelectedTiles] = useState<number[]>([]);
  const [imageMode, setImageMode] = useState<'single' | 'multi'>('single');
  const [showImageManager, setShowImageManager] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'actions' | 'images'>('actions');
  const lastSyncedMappingsRef = useRef<string>('');
  const isLoadingMappingsRef = useRef(false);
  const isLoadingActionsRef = useRef(false);

  const isKeypad = deviceType === "CREATIVE_CONSOLE";

  // Load list of apps that have configurations
  useEffect(() => {
    const apps = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`button-mappings-${deviceType}-`) && !key.includes('All Apps')) {
        // Extract app name from key like "button-mappings-CREATIVE_CONSOLE-firefox-page-1"
        const match = key.match(/button-mappings-[^-]+-(.+)-page-\d+/);
        if (match && match[1]) {
          apps.add(match[1]);
        }
      }
    }
    setSavedApps(Array.from(apps).sort());
  }, [deviceType, buttonMappings]); // Re-scan when mappings change

  useEffect(() => {
    dialAngleRef.current = dialAngle;
  }, [dialAngle]);

  useEffect(() => {
    buttonMappingsRef.current = buttonMappings;
  }, [buttonMappings]);

  // Load the active page for the current app when switching apps
  useEffect(() => {
    const savedPage = localStorage.getItem(`active-page-${configApp}`);
    if (savedPage) {
      const pageNum = parseInt(savedPage, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= 5) {
        setActivePage(pageNum);
      }
    } else {
      // Default to page 1 if no saved page for this app
      setActivePage(1);
    }
  }, [configApp]);

  useEffect(() => {
    isLoadingActionsRef.current = true;
    const saved = localStorage.getItem(`button-mappings-${deviceType}-${configApp}-page-${activePage}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setButtonMappings(parsed);
      } catch (e) {
        console.error('Failed to load button mappings:', e);
      }
    } else {
      setButtonMappings({});
    }
    // Allow saving after state update completes
    setTimeout(() => {
      isLoadingActionsRef.current = false;
    }, 0);
  }, [deviceType, activePage, configApp]);

  useEffect(() => {
    // Don't save while loading from localStorage
    if (isLoadingActionsRef.current) {
      return;
    }
    // Always save buttonMappings, even if empty (to persist clearing assignments)
    localStorage.setItem(`button-mappings-${deviceType}-${configApp}-page-${activePage}`, JSON.stringify(buttonMappings));
    console.log(`💾 Saved ${Object.keys(buttonMappings).length} button mappings for ${configApp} - ${deviceType} page ${activePage}`);
  }, [buttonMappings, deviceType, activePage, configApp]);

  useEffect(() => {
    // Store active page per app so each app has its own set of 5 pages
    localStorage.setItem(`active-page-${configApp}`, activePage.toString());
    // Clear tile selection when page changes
    setSelectedTiles([]);
  }, [activePage, configApp]);

  // Load image library from localStorage (shared across all pages)
  useEffect(() => {
    const savedLibrary = localStorage.getItem('keypad-images');
    if (savedLibrary) {
      try {
        setImageLibrary(JSON.parse(savedLibrary));
      } catch (e) {
        console.error('Failed to load image library:', e);
      }
    }
  }, []);

  // Load tile-image mappings for current page
  useEffect(() => {
    isLoadingMappingsRef.current = true;
    // Clear last synced state when page changes to force a fresh sync
    lastSyncedMappingsRef.current = '';
    
    const savedMappings = localStorage.getItem(`keypad-tile-images-${configApp}-page-${activePage}`);
    if (savedMappings) {
      try {
        setTileImageMappings(JSON.parse(savedMappings));
      } catch (e) {
        console.error('Failed to load tile-image mappings:', e);
      }
    } else {
      setTileImageMappings({});
    }
    // Use setTimeout to ensure state update completes before allowing sync
    setTimeout(() => {
      isLoadingMappingsRef.current = false;
    }, 0);
  }, [activePage, configApp]);

  // Save tile-image mappings for current page
  useEffect(() => {
    if (Object.keys(tileImageMappings).length > 0) {
      localStorage.setItem(`keypad-tile-images-${configApp}-page-${activePage}`, JSON.stringify(tileImageMappings));
    }
  }, [tileImageMappings, activePage, configApp]);

  // Send images to physical device when page changes or mappings change
  useEffect(() => {
    if (!isKeypad) return;
    
    // Don't sync while we're still loading mappings from localStorage
    if (isLoadingMappingsRef.current) {
      console.log(`⏸️ Deferring sync - still loading mappings for page ${activePage}`);
      return;
    }

    // Create a key representing the current state (only page and mappings, not library)
    const currentStateKey = `${activePage}:${JSON.stringify(tileImageMappings)}`;
    
    // Skip if nothing changed
    if (lastSyncedMappingsRef.current === currentStateKey) {
      console.log(`⏭️ Skipping sync - no changes (page ${activePage})`);
      return;
    }

    // Update all device images when page changes or mappings change
    const updateDeviceImages = async () => {
      console.log(`🔄 Syncing images to device (page ${activePage})`);
      
      // For each tile (0-8), send the appropriate image or clear it
      for (let i = 0; i < 9; i++) {
        const mapping = tileImageMappings[i];
        if (mapping) {
          const image = imageLibrary.find(img => img.id === mapping.imageId);
          if (image) {
            // If this tile has position info (multi-tile), send the sliced portion
            await sendImageToDevice(i, image, mapping.position);
          }
        } else {
          // No mapping for this tile - send blank image to clear it
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
      
      // Mark this state as synced
      lastSyncedMappingsRef.current = currentStateKey;
      console.log(`✓ Sync complete (page ${activePage})`);
    };

    updateDeviceImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, tileImageMappings, isKeypad]);
  // Note: imageLibrary intentionally NOT in deps - we only sync when mappings change

  useEffect(() => {
    console.log('🚀 DeviceConfigPage: Registering event listener');
    
    const unlisten = listen<DeviceEvent>("device-event", (event) => {
      handleDeviceEvent(event.payload);
    });

    return () => {
      console.log('🧹 DeviceConfigPage: Cleaning up event listener');
      unlisten.then(fn => fn());
    };
  }, []);

  const handleDeviceEvent = (event: DeviceEvent) => {
    if (event.type === "ButtonPress" && event.button_code !== undefined) {
      setActiveButtons(prev => new Set(prev).add(event.button_code!));
      setSelectedComponent(event.button_code);
      
      // Don't execute actions in config page - only update UI
      // Actions will be executed by DevicesPage when not in config mode
    } else if (event.type === "ButtonRelease" && event.button_code !== undefined) {
      setActiveButtons(prev => {
        const next = new Set(prev);
        next.delete(event.button_code!);
        return next;
      });
      
      // Don't execute actions in config page
    } else if (event.type === "Rotation" && event.delta !== undefined) {
      if (event.rotation_type === "DIAL") {
        const sensitivity = dialSensitivityRef.current;
        setDialRotation(event.delta);
        setDialAngle(prev => prev + event.delta * sensitivity);
        setTimeout(() => setDialRotation(0), 300);
        
        // Don't execute actions in config page
      } else if (event.rotation_type === "WHEEL") {
        setWheelRotation(event.delta);
        setWheelOffset(prev => prev - event.delta * 3);
        setTimeout(() => setWheelRotation(0), 300);
        
        // Don't execute actions in config page
      }
    }
  };

  const executeAction = async (action: Action, isPress: boolean = true) => {
    if (action.keyCombo) {
      if (action.keyCombo === "custom-keybind" && action.config?.keyCombo) {
        const allowHold = action.config.allowHold ?? false;
        try {
          await invoke("execute_key_combo", { 
            combo: action.config.keyCombo,
            hold: allowHold,
            press: isPress
          });
        } catch (err) {
        }
      } else if (action.keyCombo !== "custom-keybind") {
        try {
          await invoke("execute_key_combo", { 
            combo: action.keyCombo,
            hold: false,
            press: true
          });
        } catch (err) {
        }
      }
    } else if (action.command) {
      if (action.command === "workspace-goto") {
        const workspaceNum = action.config?.workspaceNumber ?? 1;
        const command = `hyprctl dispatch workspace ${workspaceNum}`;
        try {
          await invoke("execute_command", { command });
        } catch (err) {
        }
      } else if (action.command === "custom-command") {
        const customCmd = action.config?.customCommand ?? "";
        if (customCmd) {
          try {
            await invoke("execute_command", { command: customCmd });
          } catch (err) {
          }
        }
      } else {
        try {
          await invoke("execute_command", { command: action.command });
        } catch (err) {
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
        }
      }
      return;
    }
    
    const times = Math.abs(delta);
    for (let i = 0; i < times; i++) {
      await executeAction(action);
    }
  };

  const assignAction = (action: Action) => {
    if (selectedComponent !== null) {
      setButtonMappings(prev => ({
        ...prev,
        [selectedComponent]: action
      }));
    }
  };

  const clearMapping = () => {
    if (selectedComponent !== null) {
      setButtonMappings(prev => {
        const updated = { ...prev };
        delete updated[selectedComponent];
        return updated;
      });
    }
  };

  // Image handling functions
  const createBlankImage = (): string => {
    // Create a blank 118x118 black image
    const canvas = document.createElement('canvas');
    canvas.width = 118;
    canvas.height = 118;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return '';

    // Fill with black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 118, 118);

    // Convert to JPEG and return base64
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const downscaleImage = async (base64Image: string, targetWidth: number, targetHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw image scaled to target dimensions
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        // Convert to base64
        const downscaled = canvas.toDataURL('image/jpeg', 0.85);
        resolve(downscaled);
      };
      img.onerror = reject;
      img.src = base64Image;
    });
  };

  const calculateGridDimensions = (tiles: number[]): { rows: number; cols: number } => {
    if (tiles.length === 0) return { rows: 1, cols: 1 };
    
    const minTile = Math.min(...tiles);
    const maxTile = Math.max(...tiles);
    
    const minRow = Math.floor(minTile / 3);
    const minCol = minTile % 3;
    const maxRow = Math.floor(maxTile / 3);
    const maxCol = maxTile % 3;
    
    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;
    
    return { rows, cols };
  };

  const convertImageToKeypadFormat = async (base64Image: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas at 118x118 (MX Keypad key size)
        const canvas = document.createElement('canvas');
        canvas.width = 118;
        canvas.height = 118;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw image centered and scaled to fit
        ctx.drawImage(img, 0, 0, 118, 118);

        // Convert to JPEG at 85% quality (matching the example)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert to JPEG'));
              return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              // Extract base64 part (remove data:image/jpeg;base64, prefix)
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

  // Slice an image into a grid portion for multi-tile display
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

        // Calculate the portion of the source image to draw
        const srcWidth = img.width / totalCols;
        const srcHeight = img.height / totalRows;
        const srcX = col * srcWidth;
        const srcY = row * srcHeight;

        // Draw the sliced portion
        ctx.drawImage(
          img,
          srcX, srcY, srcWidth, srcHeight,  // Source rectangle
          0, 0, 118, 118                     // Destination rectangle
        );

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
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

  const sendImageToDevice = async (
    keyIndex: number,
    image: KeypadImage,
    slicePosition?: { row: number; col: number; rows: number; cols: number }
  ) => {
    try {
      let jpegBase64: string;
      
      // If slice position is provided, slice the image
      if (slicePosition) {
        jpegBase64 = await sliceImageForTile(
          image.base64,
          slicePosition.row,
          slicePosition.col,
          slicePosition.rows,
          slicePosition.cols
        );
      } else {
        // Convert full image to keypad format (118x118 JPEG)
        jpegBase64 = await convertImageToKeypadFormat(image.base64);
      }
      
      // Send to device
      await invoke('set_key_image', {
        keyIndex,
        jpegBase64
      });
      
      console.log(`✅ Image sent to physical device key ${keyIndex}${slicePosition ? ` (slice ${slicePosition.row},${slicePosition.col})` : ''}`);
    } catch (error) {
      console.error(`Failed to send image to device key ${keyIndex}:`, error);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      
      // Downscale the image based on mode
      let processedBase64 = base64;
      if (imageMode === 'single') {
        // Single tile: downscale to 118x118
        processedBase64 = await downscaleImage(base64, 118, 118);
      } else if (imageMode === 'multi' && selectedTiles.length > 0) {
        // Multi-tile: calculate dimensions based on grid
        const { rows, cols } = calculateGridDimensions(selectedTiles);
        const width = cols * 118;
        const height = rows * 118;
        processedBase64 = await downscaleImage(base64, width, height);
      }
      // If multi-tile but no tiles selected yet, keep original size
      
      const newImage: KeypadImage = {
        id: `img-${Date.now()}`,
        name: file.name,
        base64: processedBase64,
        tiles: [],
        createdAt: Date.now()
      };

      const updatedLibrary = [...imageLibrary, newImage];
      setImageLibrary(updatedLibrary);
      localStorage.setItem('keypad-images', JSON.stringify(updatedLibrary));
    };
    reader.readAsDataURL(file);
  };

  const deleteImage = (imageId: string) => {
    // Remove from library
    const updatedLibrary = imageLibrary.filter(img => img.id !== imageId);
    setImageLibrary(updatedLibrary);
    localStorage.setItem('keypad-images', JSON.stringify(updatedLibrary));

    // Remove from all page mappings for the current app
    for (let page = 1; page <= 5; page++) {
      const mappingsKey = `keypad-tile-images-${configApp}-page-${page}`;
      const savedMappings = localStorage.getItem(mappingsKey);
      if (savedMappings) {
        try {
          const mappings: TileImageMapping = JSON.parse(savedMappings);
          const updatedMappings: TileImageMapping = {};
          Object.entries(mappings).forEach(([tileIndex, data]) => {
            if (data.imageId !== imageId) {
              updatedMappings[Number(tileIndex)] = data;
            }
          });
          localStorage.setItem(mappingsKey, JSON.stringify(updatedMappings));
          if (page === activePage) {
            setTileImageMappings(updatedMappings);
          }
        } catch (e) {
          console.error('Failed to update mappings for page', page, e);
        }
      }
    }
  };

  const assignImageToTile = (imageId: string, tileIndex: number) => {
    const image = imageLibrary.find(img => img.id === imageId);
    if (!image) return;

    setTileImageMappings(prev => ({
      ...prev,
      [tileIndex]: { imageId }
    }));

    // Send to physical device
    sendImageToDevice(tileIndex, image);
  };

  const assignImageToMultipleTiles = (imageId: string, tiles: number[]) => {
    if (tiles.length === 0) return;

    const image = imageLibrary.find(img => img.id === imageId);
    if (!image) return;

    // Calculate grid position for multi-tile spanning
    const minTile = Math.min(...tiles);
    const maxTile = Math.max(...tiles);
    const minRow = Math.floor(minTile / 3);
    const maxRow = Math.floor(maxTile / 3);
    const minCol = minTile % 3;
    const maxCol = maxTile % 3;
    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;

    const newMappings: TileImageMapping = { ...tileImageMappings };
    tiles.forEach((tile) => {
      const row = Math.floor(tile / 3) - minRow;
      const col = (tile % 3) - minCol;
      newMappings[tile] = {
        imageId,
        position: { row, col, rows, cols }
      };

      // For multi-tile, slice and send the appropriate portion to each tile
      const slicePosition = { row, col, rows, cols };
      sendImageToDevice(tile, image, slicePosition);
    });

    setTileImageMappings(newMappings);
  };

  const clearTileImage = (tileIndex: number) => {
    setTileImageMappings(prev => {
      const updated = { ...prev };
      delete updated[tileIndex];
      return updated;
    });

    // Send blank image to physical device
    const blankBase64 = createBlankImage();
    if (blankBase64) {
      const blankImageObj: KeypadImage = {
        id: `blank-${Date.now()}`,
        name: 'blank',
        base64: blankBase64,
        tiles: [],
        createdAt: Date.now()
      };
      sendImageToDevice(tileIndex, blankImageObj);
    }
  };

  const toggleTileSelection = (tileIndex: number) => {
    console.log('Toggle tile selection:', { tileIndex, imageMode, currentSelectedTiles: selectedTiles });
    if (imageMode === 'single') {
      setSelectedTiles([tileIndex]);
    } else {
      setSelectedTiles(prev => {
        if (prev.includes(tileIndex)) {
          return prev.filter(t => t !== tileIndex);
        } else {
          return [...prev, tileIndex].sort((a, b) => a - b);
        }
      });
    }
  };

  const sections = [
    "MEDIA & VOLUME",
    "OPEN",
    "NAVIGATION",
    "SYSTEM",
    "MOUSE",
    "KEYBOARD",
    "DATE AND TIME",
    "CONTROL CENTER",
    "WIDGETS",
    "ADVANCED"
  ];

  return (
    <div className="dark-bg w-screen h-screen flex overflow-hidden text-white">
      {/* Main App Window */}
      <div className="w-full h-full bg-[#111111] overflow-hidden relative flex">
      {/* LEFT PANEL: Device View */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="h-16 flex items-center justify-between px-6 z-10"
        >
          {/* Back Button */}
          <button 
            onClick={onBack}
            className="hover:bg-white/10 p-2 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>

          {/* App Selector with Add Option */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 border border-white/10">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"/>
              </svg>
              <select
                value={configApp}
                onChange={(e) => {
                  if (e.target.value === "__add_new__") {
                    setShowAddAppModal(true);
                  } else {
                    setConfigApp(e.target.value);
                  }
                }}
                className="bg-transparent text-sm font-bold text-cyan-400 border-none outline-none cursor-pointer pr-2"
              >
                <option value="All Apps" className="bg-[#1a1a1a] text-white">📱 All Apps (Default)</option>
                {savedApps.map(app => (
                  <option key={app} value={app} className="bg-[#1a1a1a] text-white">🎯 {app}</option>
                ))}
                <option value="__add_new__" className="bg-[#1a1a1a] text-green-400">➕ Add New App...</option>
              </select>
            </div>
            
            {/* Delete App Button - only show if not "All Apps" */}
            {configApp !== "All Apps" && (
              <button
                onClick={() => {
                  const confirmDelete = window.confirm(
                    `Delete all configurations for "${configApp}"?\n\n` +
                    `This will permanently remove:\n` +
                    `- All button mappings (5 pages)\n` +
                    `- All tile images (5 pages)\n` +
                    `- Page settings\n\n` +
                    `This action cannot be undone!`
                  );
                  
                  if (confirmDelete) {
                    // Delete all data for this app
                    const keysToDelete: string[] = [];
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (key && (
                        key.includes(`-${configApp}-page-`) ||
                        key === `active-page-${configApp}`
                      )) {
                        keysToDelete.push(key);
                      }
                    }
                    
                    // Delete all matching keys
                    keysToDelete.forEach(key => localStorage.removeItem(key));
                    
                    // Remove from saved apps list
                    setSavedApps(prev => prev.filter(app => app !== configApp));
                    
                    // Switch to "All Apps"
                    setConfigApp("All Apps");
                    
                    console.log(`🗑️ Deleted all configurations for ${configApp}`);
                    alert(`✅ Successfully deleted all configurations for "${configApp}"`);
                  }
                }}
                className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 transition-colors"
                title={`Delete all configurations for ${configApp}`}
              >
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            
            <span className="text-xs text-gray-500">
              Configuring: <span className="text-cyan-400 font-bold">{configApp}</span>
            </span>
          </div>

          {/* Spacer */}
          <div className="w-8"></div>
        </motion.header>

        {/* Device Stage */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="flex-1 flex flex-col items-center justify-center relative pb-8"
        >
          {isKeypad ? (
            <KeypadConfigView 
              activeButtons={activeButtons}
              selectedComponent={selectedComponent}
              onComponentClick={(code) => {
                if (activeTab === 'images') {
                  if (code < 9) {  // Only allow tile selection for grid buttons (0-8)
                    toggleTileSelection(code);
                  }
                } else {
                  setSelectedComponent(code);
                }
              }}
              buttonMappings={buttonMappings}
              tileImageMappings={tileImageMappings}
              imageLibrary={imageLibrary}
              selectedTiles={selectedTiles}
              activeTab={activeTab}
            />
          ) : (
            <DialConfigView 
              activeButtons={activeButtons}
              dialAngle={dialAngle}
              wheelOffset={wheelOffset}
              selectedComponent={selectedComponent}
              onComponentClick={setSelectedComponent}
              buttonMappings={buttonMappings}
            />
          )}

          {/* Pagination Controls */}
          <div className="mt-12 flex items-center bg-[#222] rounded px-1 py-1 border border-white/5 shadow-lg">
            <span className="text-[10px] text-gray-400 font-bold px-2 uppercase tracking-widest">Pages</span>
            {[1, 2, 3, 4, 5].map(page => (
              <button
                key={page}
                onClick={() => setActivePage(page)}
                className={`w-6 h-6 text-xs font-bold rounded-sm flex items-center justify-center transition-colors ${
                  activePage === page
                    ? "bg-cyan-400 text-black shadow-[0_0_10px_rgba(103,232,249,0.3)]"
                    : "text-gray-400 hover:bg-white/5"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Bottom Dock */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.2 }}
          className="h-16 px-8 flex items-center justify-between"
        >
          <div className="flex gap-6 text-gray-600">
            <svg className="w-5 h-5 hover:text-white transition-colors cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            <svg className="w-5 h-5 hover:text-white transition-colors cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>

          {/* Device Selector */}
          <div className="flex gap-8 items-center">
            <svg className="w-6 h-6 text-gray-700 hover:text-gray-500 transition-colors cursor-pointer" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 12h4v10H6V12zm8-8h4v18h-4V4zM2 16h4v6H2v-6z"/>
            </svg>
            <div className="text-cyan-400 border-b-2 border-cyan-400 pb-2 px-1">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h4v4H4V6zm6 0h4v4h-4V6zm6 0h4v4h-4V6zM4 12h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
              </svg>
            </div>
            <svg className="w-6 h-6 text-gray-700 hover:text-gray-500 transition-colors cursor-pointer" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </div>

          <div className="flex gap-6 text-gray-500">
            <svg className="w-5 h-5 hover:text-white transition-colors cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg className="w-5 h-5 hover:text-white transition-colors cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </motion.div>

        {/* Beta Tag */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-[#ff3b30] text-white text-[10px] font-bold px-4 py-1 rounded-t-md tracking-wider shadow-lg">
            BETA
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Actions Sidebar */}
      <motion.div
        initial={{ x: 340, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="w-[340px] bg-black border-l border-white/10 flex flex-col"
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          {isKeypad ? (
            <div className="flex gap-2 flex-1">
              <button
                onClick={() => setActiveTab('actions')}
                className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded transition-all ${
                  activeTab === 'actions'
                    ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                Actions
              </button>
              <button
                onClick={() => setActiveTab('images')}
                className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded transition-all ${
                  activeTab === 'images'
                    ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                Images
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 border border-orange-500/50 rounded px-2 py-1 cursor-pointer">
              <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h4v4H4V6zm6 0h4v4h-4V6zm6 0h4v4h-4V6zM4 12h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
              </svg>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">All Actions</span>
            </div>
          )}
          <button className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors ml-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>

        {/* Smart Create Button */}
        <div className="px-4 pt-4 pb-3">
          <button className="w-full bg-black/40 hover:bg-black/60 text-white font-bold py-3 px-4 rounded-lg transition-all border border-white/10 hover:border-transparent hover:shadow-[0_0_20px_rgba(168,85,247,0.4),0_0_40px_rgba(59,130,246,0.3)] hover:ring-2 hover:ring-purple-500/50 flex items-center justify-center gap-2 group">
            <svg className="w-5 h-5 text-gray-400 group-hover:text-purple-400 transition-colors" fill="currentColor" viewBox="0 0 256 256">
              <path d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144Z"></path>
            </svg>
            <span className="text-sm tracking-wide text-gray-300 group-hover:text-white transition-colors">SMART CREATE</span>
          </button>
        </div>

        {/* Selected Component Indicator */}
        {selectedComponent !== null && (
          <div className="px-4 py-3 bg-cyan-400/10 border-b border-cyan-400/20">
            <div className="text-xs text-gray-400 mb-1">SELECTED COMPONENT</div>
            <div className="text-sm font-bold text-cyan-400">
              {isKeypad ? (
                selectedComponent === 0xa1 ? "Left Arrow (P1)" :
                selectedComponent === 0xa2 ? "Right Arrow (P2)" :
                `Button ${selectedComponent + 1}`
              ) : (
                selectedComponent === 275 ? "Top Left Button" :
                selectedComponent === 276 ? "Top Right Button" :
                selectedComponent === 277 ? "Bottom Left Button" :
                selectedComponent === 278 ? "Bottom Right Button" :
                selectedComponent === 1000 ? "Main Dial (Rotation)" :
                selectedComponent === 1001 ? "Roller Wheel" :
                `Component ${selectedComponent}`
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Click an action below to assign
              {buttonMappings[selectedComponent] && (
                <span className="block mt-1 text-cyan-400">
                  Currently: {buttonMappings[selectedComponent]?.name}
                  {buttonMappings[selectedComponent]?.id === "custom-keybind" && 
                   buttonMappings[selectedComponent]?.config?.keyCombo && (
                    <span className="ml-2 font-mono text-xs">({buttonMappings[selectedComponent].config.keyCombo})</span>
                  )}
                </span>
              )}
            </div>
            {buttonMappings[selectedComponent] && (
              <button
                onClick={clearMapping}
                className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Clear Assignment
              </button>
            )}
          </div>
        )}

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
          {activeTab === 'actions' ? (
            <>
          {sections.map(section => {
            const isRotationComponent = selectedComponent === 1000 || selectedComponent === 1001;
            const categoryActions = AVAILABLE_ACTIONS.filter(a => {
              if (a.category !== section) return false;
              
              if (a.rotationOnly && !isRotationComponent) return false;
              
              return true;
            });
            
            if (categoryActions.length === 0) return null;

            return (
              <div key={section} className="mb-6">
                <div
                  onClick={() => setExpandedSection(expandedSection === section ? null : section)}
                  className="flex items-center gap-3 cursor-pointer mb-3 px-1 hover:opacity-80 transition-opacity"
                >
                  <svg 
                    className={`w-3 h-3 text-gray-500 transition-transform ${expandedSection === section ? 'rotate-0' : '-rotate-90'}`} 
                    fill="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                  </svg>
                  <span className="text-[11px] font-bold text-gray-300 tracking-widest uppercase">{section}</span>
                  <span className="text-[10px] text-gray-600">({categoryActions.length})</span>
                </div>

                {expandedSection === section && (
                  <div className="flex flex-col gap-1 ml-6">
                    {categoryActions.map(action => (
                      <div key={action.id} className="relative">
                        <button
                          onClick={() => assignAction(action)}
                          disabled={selectedComponent === null}
                          className={`w-full text-left p-2.5 rounded-md transition-all ${
                            selectedComponent === null
                              ? 'opacity-40 cursor-not-allowed'
                              : 'hover:bg-white/5 cursor-pointer border border-transparent hover:border-cyan-400/30'
                          } ${
                            selectedComponent !== null && buttonMappings[selectedComponent]?.id === action.id
                              ? 'bg-cyan-400/20 border-cyan-400/50'
                              : 'bg-black/40'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-base">{action.icon}</span>
                            <span className="text-xs font-bold text-white">{action.name}</span>
                            {action.rotationOnly && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">ROTATION</span>
                            )}
                            {(action.id === "volume-control" || action.id === "brightness-control" || action.id === "workspace-goto" || action.id === "custom-keybind" || action.id === "custom-command") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfigAction(action);
                                  setTempMinVolume(action.config?.minVolume ?? 0);
                                  setTempMaxVolume(action.config?.maxVolume ?? 100);
                                  setTempSensitivity(action.config?.sensitivity ?? 1);
                                  setTempMinBrightness(action.config?.minBrightness ?? 0);
                                  setTempMaxBrightness(action.config?.maxBrightness ?? 100);
                                  setTempBrightnessSensitivity(action.config?.brightnessSensitivity ?? 1);
                                  setTempWorkspaceNumber(action.config?.workspaceNumber ?? 1);
                                  setTempKeyCombo(action.config?.keyCombo ?? "");
                                  setTempAllowHold(action.config?.allowHold ?? false);
                                  setTempCustomCommand(action.config?.customCommand ?? "");
                                  setShowConfigModal(true);
                                }}
                                className="ml-auto text-gray-400 hover:text-cyan-400 transition-colors"
                                title={
                                  action.id === "volume-control" ? "Configure volume range" :
                                  action.id === "brightness-control" ? "Configure brightness range" :
                                  action.id === "workspace-goto" ? "Configure workspace number" : 
                                  action.id === "custom-keybind" ? "Configure keybind" :
                                  action.id === "custom-command" ? "Configure command" :
                                  "Configure"
                                }
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500">{action.description}</div>
                          {action.keyCombo && (
                            <div className="text-[9px] text-gray-600 mt-1 font-mono">{action.keyCombo}</div>
                          )}
                          {action.id === "volume-control" && action.config && (
                            <div className="text-[9px] text-cyan-400 mt-1">
                              Range: {action.config.minVolume}% - {action.config.maxVolume}%
                            </div>
                          )}
                          {action.id === "brightness-control" && action.config && (
                            <div className="text-[9px] text-cyan-400 mt-1">
                              Range: {action.config.minBrightness}% - {action.config.maxBrightness}%
                            </div>
                          )}
                          {action.id === "workspace-goto" && action.config && (
                            <div className="text-[9px] text-cyan-400 mt-1">
                              Workspace: {action.config.workspaceNumber}
                            </div>
                          )}
                          {action.id === "custom-keybind" && action.config?.keyCombo && (
                            <div className="text-[9px] text-cyan-400 mt-1 font-mono">
                              {action.config.keyCombo}
                            </div>
                          )}
                          {action.id === "custom-command" && action.config?.customCommand && (
                            <div className="text-[9px] text-cyan-400 mt-1 font-mono truncate" title={action.config.customCommand}>
                              {action.config.customCommand}
                            </div>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
            </>
          ) : (
            // Images Panel
            <div className="flex flex-col gap-4">
              {/* Image Upload Section */}
              <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-4">
                <h3 className="text-sm font-bold text-white mb-3">Upload Image</h3>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="block w-full px-4 py-3 bg-cyan-400/10 hover:bg-cyan-400/20 border border-cyan-400/30 rounded cursor-pointer text-center text-sm text-cyan-400 font-bold transition-colors"
                >
                  Choose Image File
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  Supported: PNG, JPG, GIF
                  {imageMode === 'single' && (
                    <span className="block mt-1 text-cyan-400">Will be downscaled to 118×118</span>
                  )}
                  {imageMode === 'multi' && selectedTiles.length > 0 && (() => {
                    const { rows, cols } = calculateGridDimensions(selectedTiles);
                    const width = cols * 118;
                    const height = rows * 118;
                    return <span className="block mt-1 text-cyan-400">Will be downscaled to {width}×{height}</span>;
                  })()}
                </p>
              </div>

              {/* Image Mode Toggle */}
              <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-4">
                <h3 className="text-sm font-bold text-white mb-3">Selection Mode</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setImageMode('single');
                      setSelectedTiles([]);
                    }}
                    className={`flex-1 px-3 py-2 text-xs font-bold uppercase rounded transition-all ${
                      imageMode === 'single'
                        ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50'
                        : 'bg-black/40 text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Single Tile
                  </button>
                  <button
                    onClick={() => {
                      setImageMode('multi');
                      setSelectedTiles([]);
                    }}
                    className={`flex-1 px-3 py-2 text-xs font-bold uppercase rounded transition-all ${
                      imageMode === 'multi'
                        ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50'
                        : 'bg-black/40 text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Multi-Tile
                  </button>
                </div>
                {imageMode === 'multi' && selectedTiles.length > 0 && (
                  <div className="mt-3 text-xs text-cyan-400">
                    Selected: {selectedTiles.length} tiles
                  </div>
                )}
                {/* Clear All Images button */}
                <button
                  onClick={() => {
                    // Clear all tile mappings
                    setTileImageMappings({});
                    // Persist the cleared mappings to localStorage
                    localStorage.setItem(`keypad-tile-images-${configApp}-page-${activePage}`, JSON.stringify({}));
                    // Send blank images to all keys on device
                    const blankBase64 = createBlankImage();
                    if (blankBase64) {
                      const blankImageObj: KeypadImage = {
                        id: `blank-${Date.now()}`,
                        name: 'blank',
                        base64: blankBase64,
                        tiles: [],
                        createdAt: Date.now()
                      };
                      for (let i = 0; i < 9; i++) {
                        sendImageToDevice(i, blankImageObj);
                      }
                    }
                  }}
                  className="mt-3 w-full px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-bold uppercase rounded transition-all"
                >
                  Clear All Images (Page {activePage})
                </button>
              </div>

              {/* Image Library */}
              <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-4">
                <h3 className="text-sm font-bold text-white mb-3">Image Library ({imageLibrary.length})</h3>
                {imageLibrary.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-8">No images uploaded yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
                    {imageLibrary.map(image => (
                      <div
                        key={image.id}
                        className="bg-black/40 border border-white/10 rounded-lg overflow-hidden hover:border-cyan-400/30 transition-colors"
                      >
                        <div className="aspect-square relative">
                          <img
                            src={image.base64}
                            alt={image.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-2">
                          <p className="text-xs text-white truncate mb-2" title={image.name}>
                            {image.name}
                          </p>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                console.log('Assign clicked', { imageMode, selectedTiles, imageId: image.id });
                                if (imageMode === 'single' && selectedTiles.length === 1) {
                                  console.log('Assigning to single tile:', selectedTiles[0]);
                                  assignImageToTile(image.id, selectedTiles[0]);
                                  setSelectedTiles([]);
                                } else if (imageMode === 'multi' && selectedTiles.length > 0) {
                                  console.log('Assigning to multiple tiles:', selectedTiles);
                                  assignImageToMultipleTiles(image.id, selectedTiles);
                                  setSelectedTiles([]);
                                }
                              }}
                              disabled={selectedTiles.length === 0}
                              className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                                selectedTiles.length > 0
                                  ? 'bg-cyan-400/20 text-cyan-400 hover:bg-cyan-400/30'
                                  : 'bg-black/40 text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              Assign
                            </button>
                            <button
                              onClick={() => deleteImage(image.id)}
                              className="px-2 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs rounded transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>

    {/* Configuration Modal */}
    <AnimatePresence>
    {showConfigModal && configAction && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-[#1a1a1a] border border-white/10 rounded-lg p-6 w-96 shadow-2xl"
        >
          <h3 className="text-lg font-bold text-white mb-4">
            {configAction.id === "volume-control" ? "Configure Volume Control" :
             configAction.id === "brightness-control" ? "Configure Brightness Control" :
             configAction.id === "workspace-goto" ? "Configure Workspace" :
             configAction.id === "custom-keybind" ? "Configure Keybind" :
             configAction.id === "custom-command" ? "Configure Command" : "Configure"}
          </h3>
          
          <div className="space-y-4 mb-6">
            {configAction.id === "volume-control" ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Minimum Volume (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={tempMinVolume}
                    onChange={(e) => setTempMinVolume(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Maximum Volume (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={tempMaxVolume}
                    onChange={(e) => setTempMaxVolume(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-2">Sensitivity</label>
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={tempSensitivity}
                    onChange={(e) => setTempSensitivity(Math.min(10, Math.max(0.1, parseFloat(e.target.value) || 1)))}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="text-xs text-gray-500 bg-black/40 rounded p-3 border border-white/5">
                  <div className="mb-1">💡 <strong>How it works:</strong></div>
                  <div>One full rotation (360°) will adjust volume across the full range from {tempMinVolume}% to {tempMaxVolume}%.</div>
                  <div className="mt-2">Sensitivity {tempSensitivity}x: {tempSensitivity > 1 ? 'Faster' : tempSensitivity < 1 ? 'Slower' : 'Normal'} volume changes.</div>
                </div>
              </>
            ) : configAction.id === "brightness-control" ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Minimum Brightness (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={tempMinBrightness}
                    onChange={(e) => setTempMinBrightness(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Maximum Brightness (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={tempMaxBrightness}
                    onChange={(e) => setTempMaxBrightness(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-2">Sensitivity</label>
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={tempBrightnessSensitivity}
                    onChange={(e) => setTempBrightnessSensitivity(Math.min(10, Math.max(0.1, parseFloat(e.target.value) || 1)))}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="text-xs text-gray-500 bg-black/40 rounded p-3 border border-white/5">
                  <div className="mb-1">💡 <strong>How it works:</strong></div>
                  <div>One full rotation (360°) will adjust brightness across the full range from {tempMinBrightness}% to {tempMaxBrightness}%.</div>
                  <div className="mt-2">Sensitivity {tempBrightnessSensitivity}x: {tempBrightnessSensitivity > 1 ? 'Faster' : tempBrightnessSensitivity < 1 ? 'Slower' : 'Normal'} brightness changes.</div>
                </div>
              </>
            ) : configAction.id === "workspace-goto" ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Workspace Number</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={tempWorkspaceNumber}
                    onChange={(e) => setTempWorkspaceNumber(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="text-xs text-gray-500 bg-black/40 rounded p-3 border border-white/5">
                  <div className="mb-1">💡 <strong>How it works:</strong></div>
                  <div>Press this button to switch to workspace {tempWorkspaceNumber}.</div>
                </div>
              </>
            ) : configAction.id === "custom-keybind" ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Key Combination</label>
                  <div
                    tabIndex={0}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      const keys: string[] = [];
                      if (e.ctrlKey) keys.push("ctrl");
                      if (e.shiftKey) keys.push("shift");
                      if (e.altKey) keys.push("alt");
                      if (e.metaKey) keys.push("super");
                      
                      if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
                        keys.push(e.key.toLowerCase());
                      }
                      
                      if (keys.length > 0) {
                        setTempKeyCombo(keys.join("+"));
                        setIsListeningForKeys(false);
                      }
                    }}
                    onFocus={() => setIsListeningForKeys(true)}
                    onBlur={() => setIsListeningForKeys(false)}
                    className={`w-full bg-black/40 border ${isListeningForKeys ? 'border-cyan-400 ring-2 ring-cyan-400/50' : 'border-white/10'} rounded px-3 py-2 text-white text-sm cursor-pointer hover:border-cyan-400 transition-all focus:outline-none text-center font-mono`}
                  >
                    {isListeningForKeys ? (
                      <span className="text-cyan-400 animate-pulse">Press any key combination...</span>
                    ) : tempKeyCombo ? (
                      <span className="text-white">{tempKeyCombo}</span>
                    ) : (
                      <span className="text-gray-500">Click here and press keys...</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tempAllowHold}
                      onChange={(e) => setTempAllowHold(e.target.checked)}
                      className="w-4 h-4 bg-black/40 border border-white/10 rounded text-cyan-400 focus:ring-2 focus:ring-cyan-400/50"
                    />
                    <span className="text-sm text-gray-300">Allow Hold</span>
                  </label>
                  <div className="text-xs text-gray-500 mt-1 ml-6">
                    When enabled, keys will be held down while the button is pressed and released when the button is released.
                  </div>
                </div>

                <div className="text-xs text-gray-500 bg-black/40 rounded p-3 border border-white/5">
                  <div className="mb-1">💡 <strong>How it works:</strong></div>
                  <div>Click the box above and press any key combination. Examples: ctrl+c, ctrl+shift+t, super+e</div>
                </div>
              </>
            ) : configAction.id === "custom-command" ? (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-2">Shell Command</label>
                  <input
                    type="text"
                    value={tempCustomCommand}
                    onChange={(e) => setTempCustomCommand(e.target.value)}
                    placeholder="Enter shell command... (e.g., brightnessctl set 10%+)"
                    className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/50 focus:outline-none font-mono"
                  />
                </div>

                <div className="text-xs text-gray-500 bg-black/40 rounded p-3 border border-white/5">
                  <div className="mb-1">💡 <strong>How it works:</strong></div>
                  <div>Enter any shell command to execute when the button is pressed. Examples:</div>
                  <ul className="list-disc ml-4 mt-2 space-y-1">
                    <li><code className="text-cyan-400">brightnessctl set 10%+</code> - Increase brightness</li>
                    <li><code className="text-cyan-400">notify-send "Hello"</code> - Show notification</li>
                    <li><code className="text-cyan-400">systemctl suspend</code> - Suspend system</li>
                  </ul>
                </div>
              </>
            ) : null}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfigModal(false)}
              className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const actionIndex = AVAILABLE_ACTIONS.findIndex(a => a.id === configAction.id);
                if (actionIndex !== -1) {
                  if (configAction.id === "volume-control") {
                    AVAILABLE_ACTIONS[actionIndex] = {
                      ...AVAILABLE_ACTIONS[actionIndex],
                      config: {
                        minVolume: tempMinVolume,
                        maxVolume: tempMaxVolume,
                        sensitivity: tempSensitivity
                      }
                    };
                  } else if (configAction.id === "brightness-control") {
                    AVAILABLE_ACTIONS[actionIndex] = {
                      ...AVAILABLE_ACTIONS[actionIndex],
                      config: {
                        minBrightness: tempMinBrightness,
                        maxBrightness: tempMaxBrightness,
                        brightnessSensitivity: tempBrightnessSensitivity
                      }
                    };
                  } else if (configAction.id === "workspace-goto") {
                    AVAILABLE_ACTIONS[actionIndex] = {
                      ...AVAILABLE_ACTIONS[actionIndex],
                      config: {
                        workspaceNumber: tempWorkspaceNumber
                      }
                    };
                  } else if (configAction.id === "custom-keybind") {
                    AVAILABLE_ACTIONS[actionIndex] = {
                      ...AVAILABLE_ACTIONS[actionIndex],
                      config: {
                        keyCombo: tempKeyCombo,
                        allowHold: tempAllowHold
                      }
                    };
                  } else if (configAction.id === "custom-command") {
                    AVAILABLE_ACTIONS[actionIndex] = {
                      ...AVAILABLE_ACTIONS[actionIndex],
                      config: {
                        customCommand: tempCustomCommand
                      }
                    };
                  }
                }
                
                if (selectedComponent !== null && buttonMappings[selectedComponent]?.id === configAction.id) {
                  if (configAction.id === "volume-control") {
                    setButtonMappings(prev => ({
                      ...prev,
                      [selectedComponent]: {
                        ...configAction,
                        config: {
                          minVolume: tempMinVolume,
                          maxVolume: tempMaxVolume,
                          sensitivity: tempSensitivity
                        }
                      }
                    }));
                  } else if (configAction.id === "brightness-control") {
                    setButtonMappings(prev => ({
                      ...prev,
                      [selectedComponent]: {
                        ...configAction,
                        config: {
                          minBrightness: tempMinBrightness,
                          maxBrightness: tempMaxBrightness,
                          brightnessSensitivity: tempBrightnessSensitivity
                        }
                      }
                    }));
                  } else if (configAction.id === "workspace-goto") {
                    setButtonMappings(prev => ({
                      ...prev,
                      [selectedComponent]: {
                        ...configAction,
                        config: {
                          workspaceNumber: tempWorkspaceNumber
                        }
                      }
                    }));
                  } else if (configAction.id === "custom-keybind") {
                    setButtonMappings(prev => ({
                      ...prev,
                      [selectedComponent]: {
                        ...configAction,
                        config: {
                          keyCombo: tempKeyCombo,
                          allowHold: tempAllowHold
                        }
                      }
                    }));
                  } else if (configAction.id === "custom-command") {
                    setButtonMappings(prev => ({
                      ...prev,
                      [selectedComponent]: {
                        ...configAction,
                        config: {
                          customCommand: tempCustomCommand
                        }
                      }
                    }));
                  }
                }
                
                setShowConfigModal(false);
              }}
              className="flex-1 px-4 py-2 bg-cyan-400 hover:bg-cyan-500 text-black font-bold rounded transition-colors"
            >
              Save
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
    </AnimatePresence>

      {/* Add App Modal */}
      {showAddAppModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">Add New App Configuration</h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter the window class name for the application you want to configure.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-2">Window Class Name</label>
              <input
                type="text"
                value={newAppName}
                onChange={(e) => setNewAppName(e.target.value)}
                placeholder="e.g., firefox, code, discord"
                className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded text-white text-sm focus:outline-none focus:border-cyan-400"
                autoFocus
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 mb-4">
              <p className="text-xs text-blue-300 mb-2 font-semibold">💡 How to find window class:</p>
              <ul className="text-xs text-blue-200 space-y-1 list-disc list-inside">
                <li>Run: <code className="bg-black/40 px-1 rounded">hyprctl activewindow -j | jq -r '.class'</code></li>
                <li>Common examples: firefox, code, discord, kitty, chrome</li>
                <li>Case-sensitive - must match exactly</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (newAppName.trim()) {
                    const trimmedName = newAppName.trim();
                    if (!savedApps.includes(trimmedName)) {
                      setSavedApps(prev => [...prev, trimmedName]);
                    }
                    setConfigApp(trimmedName);
                    setNewAppName("");
                    setShowAddAppModal(false);
                  }
                }}
                className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!newAppName.trim()}
              >
                Add App
              </button>
              <button
                onClick={() => {
                  setNewAppName("");
                  setShowAddAppModal(false);
                }}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeypadConfigView({ activeButtons, selectedComponent, onComponentClick, buttonMappings, tileImageMappings, imageLibrary, selectedTiles, activeTab }: {
  activeButtons: Set<number>;
  selectedComponent: number | null;
  onComponentClick: (code: number) => void;
  buttonMappings: ButtonMapping;
  tileImageMappings: TileImageMapping;
  imageLibrary: KeypadImage[];
  selectedTiles: number[];
  activeTab: 'actions' | 'images';
}) {
  // Helper function to get image for a tile
  const getTileImage = (tileIndex: number) => {
    const mapping = tileImageMappings[tileIndex];
    if (!mapping) return null;
    const image = imageLibrary.find(img => img.id === mapping.imageId);
    return image ? { image, position: mapping.position } : null;
  };

  return (
    <div className="device-casing w-48 h-[13.5rem] rounded-[2rem] relative flex flex-col items-center pt-4 px-2 pb-3 transform scale-[1.3]">
      {/* Cable */}
      <div className="cable"></div>

      {/* Button Container - Fixed width for alignment */}
      <div className="flex flex-col w-full max-w-[136px]">
        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {Array.from({ length: 9 }).map((_, i) => {
            const tileImageData = getTileImage(i);
            const isSelected = selectedTiles.includes(i);
            
            return (
            <div
              key={i}
              onClick={() => onComponentClick(i)}
              className={`keypad-btn w-10 h-10 rounded-lg cursor-pointer transition-all relative overflow-hidden ${
                activeButtons.has(i) ? 'scale-95 brightness-150' : ''
              } ${
                selectedComponent === i && activeTab === 'actions' ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
              } ${
                isSelected && activeTab === 'images' ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
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
              
              {/* Action indicator (overlaid on image if present) */}
              {buttonMappings[i] && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)] z-10"></div>
              )}
            </div>
            );
          })}
        </div>

        {/* Bottom Row: Arrows & Logo */}
        <div className="flex items-end w-full mt-auto">
          <div className="flex gap-2">
            <div 
              onClick={() => onComponentClick(0xa1)}
              className={`arrow-btn w-10 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all relative ${
                activeButtons.has(0xa1) ? 'scale-95 brightness-150' : ''
              } ${
                selectedComponent === 0xa1 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
              }`}
            >
              <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 256 256">
                <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"></path>
              </svg>
              {buttonMappings[0xa1] && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
              )}
            </div>
            <div 
              onClick={() => onComponentClick(0xa2)}
              className={`arrow-btn w-10 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all relative ${
                activeButtons.has(0xa2) ? 'scale-95 brightness-150' : ''
              } ${
                selectedComponent === 0xa2 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
              }`}
            >
              <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 256 256">
                <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
              </svg>
              {buttonMappings[0xa2] && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
              )}
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

function DialConfigView({ activeButtons, dialAngle, wheelOffset, selectedComponent, onComponentClick, buttonMappings }: {
  activeButtons: Set<number>;
  dialAngle: number;
  wheelOffset: number;
  selectedComponent: number | null;
  onComponentClick: (code: number) => void;
  buttonMappings: ButtonMapping;
}) {
  // 275 = Top Left button
  // 276 = Top Right button  
  // 277 = Bottom Left button
  // 278 = Bottom Right button
  // 1000 = Main Dial (custom code for clicking on dial)
  // 1001 = Roller Wheel (custom code for clicking on wheel)

  return (
    <div className="device-casing w-64 h-64 rounded-[2.5rem] relative transform scale-110">
      {/* Top Left: Small Buttons */}
      <div className="absolute top-7 left-7 flex gap-2">
        <div 
          onClick={() => onComponentClick(275)}
          className={`tactile-btn w-7 h-7 rounded-full flex items-center justify-center relative cursor-pointer transition-all ${
            activeButtons.has(275) ? 'scale-95 brightness-150' : ''
          } ${
            selectedComponent === 275 ? '!border-2 !border-cyan-400' : ''
          }`}
        >
          {buttonMappings[275] && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#282828] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
        <div 
          onClick={() => onComponentClick(276)}
          className={`tactile-btn w-7 h-7 rounded-full flex items-center justify-center relative cursor-pointer transition-all ${
            activeButtons.has(276) ? 'scale-95 brightness-150' : ''
          } ${
            selectedComponent === 276 ? '!border-2 !border-cyan-400' : ''
          }`}
        >
          {buttonMappings[276] && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#282828] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>

      {/* Center Top: Logo & LED */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <span className="text-[#555] font-bold text-[11px] tracking-tight opacity-80">logi</span>
        <div className="w-1 h-1 rounded-full led-green"></div>
      </div>

      {/* Top Right: Roller with Ridges */}
      <div className="absolute top-7 right-6">
        <div 
          onClick={() => onComponentClick(1001)}
          className={`w-14 h-8 rounded bg-[#181818] p-[2px] shadow-[inset_0_1px_3px_rgba(0,0,0,1)] overflow-hidden cursor-pointer transition-all relative ${
            selectedComponent === 1001 ? '!border-2 !border-cyan-400' : 'border-b border-white/5'
          }`}
        >
          <div 
            className="roller-wheel w-full h-full rounded-[1px] transition-all duration-300"
            style={{ 
              backgroundPositionY: `${wheelOffset}px`
            }}
          ></div>
          {buttonMappings[1001] && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#282828] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>

      {/* Center: The Big Dial */}
      <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full bg-[#1a1a1a] shadow-inner flex items-center justify-center">
        <div
          onClick={() => onComponentClick(1000)}
          className={`main-dial w-32 h-32 rounded-full relative cursor-pointer transition-all duration-300 ${
            selectedComponent === 1000 ? '!border-[3px] !border-cyan-400' : ''
          }`}
          style={{ transform: `rotate(${dialAngle}deg)` }}
        >
          {/* Indicator dot */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/20 shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]"></div>
          {buttonMappings[1000] && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1a1a1a] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="absolute bottom-6 left-6">
        <div 
          onClick={() => onComponentClick(277)}
          className={`tactile-btn w-10 h-10 rounded-full flex items-center justify-center relative cursor-pointer transition-all ${
            activeButtons.has(277) ? 'scale-95 brightness-150' : ''
          } ${
            selectedComponent === 277 ? '!border-2 !border-cyan-400' : ''
          }`}
        >
          {buttonMappings[277] && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#282828] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>
      <div className="absolute bottom-6 right-6">
        <div 
          onClick={() => onComponentClick(278)}
          className={`tactile-btn w-10 h-10 rounded-full flex items-center justify-center relative cursor-pointer transition-all ${
            activeButtons.has(278) ? 'scale-95 brightness-150' : ''
          } ${
            selectedComponent === 278 ? '!border-2 !border-cyan-400' : ''
          }`}
        >
          {buttonMappings[278] && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#282828] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>
    </div>
  );
}