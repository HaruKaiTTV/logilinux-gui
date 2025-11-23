import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DeviceConfigPage } from "./DeviceConfigPage";

interface DeviceInfo {
  id: string;
  name: string;
  device_type: string;
  vendor_id: number;
  product_id: number;
  is_connected: boolean;
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

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [greeting, setGreeting] = useState("Good Afternoon");
  const [activeButtons, setActiveButtons] = useState<Set<number>>(new Set());
  const [dialRotation, setDialRotation] = useState(0);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [wheelOffset, setWheelOffset] = useState(0);
  const [dialAngle, setDialAngle] = useState(0);
  const [dialSensitivity, setDialSensitivity] = useState(1);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const dialSensitivityRef = useRef(dialSensitivity);
  const buttonMappingsRef = useRef<ButtonMapping>({});
  const dialAngleRef = useRef(0);
  const selectedDeviceRef = useRef<DeviceInfo | null>(null);

  useEffect(() => {
    dialAngleRef.current = dialAngle;
  }, [dialAngle]);

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  // Load button mappings from localStorage
  const loadMappings = () => {
    const deviceTypes = ["DIALPAD", "KEYPAD", "default"];
    
    for (const deviceType of deviceTypes) {
      const storageKey = `button-mappings-${deviceType}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          buttonMappingsRef.current = parsed;
          return;
        } catch (err) {
          // Failed to parse
        }
      }
    }
  };

  // Load mappings on mount and when devices change
  useEffect(() => {
    loadMappings();
  }, [devices]);

  // Reload mappings when returning from config page
  useEffect(() => {
    if (!selectedDevice) {
      // Just came back from config page, reload mappings
      loadMappings();
    }
  }, [selectedDevice]);

  // Keep ref in sync with state
  useEffect(() => {
    dialSensitivityRef.current = dialSensitivity;
  }, [dialSensitivity]);

  useEffect(() => {
    // Set greeting based on time of day
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good Morning");
    else if (hour < 18) setGreeting("Good Afternoon");
    else setGreeting("Good Evening");

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
      clearInterval(interval);
      unlisten.then(fn => fn());
    };
  }, []);

  const handleDeviceEvent = (event: DeviceEvent) => {
    // Don't execute actions if we're in the config page (selectedDevice is set)
    // The config page has its own event listener
    if (selectedDeviceRef.current) {
      return;
    }

    if (event.type === "ButtonPress" && event.button_code !== undefined) {
      setActiveButtons(prev => new Set(prev).add(event.button_code!));
      
      const action = buttonMappingsRef.current[event.button_code];
      if (action) {
        executeAction(action, true); // true = press
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
      <DeviceConfigPage
        deviceName={selectedDevice.name}
        deviceType={selectedDevice.device_type}
        onBack={() => setSelectedDevice(null)}
      />
    );
  }

  return (
    <div className="dark-bg w-screen h-screen flex overflow-hidden text-white">
      {/* Main App Window */}
      <div className="w-full h-full bg-[#111111] flex flex-col relative overflow-hidden">

        {/* Header */}
        <header className="h-20 flex items-center justify-between px-8 border-b border-white/5">
          <h1 className="text-2xl font-bold tracking-wide text-white">{greeting}</h1>

          <div className="flex items-center gap-6 text-xs font-bold text-gray-400 tracking-wider">
            <button className="hover:text-white transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path>
              </svg>
              ADD DEVICE
            </button>

            <button className="hover:text-white transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 256 256">
                <path d="M213.85,125.46l-112,120a8,8,0,0,1-13.69-7l14.66-73.33L45.19,143.49a8,8,0,0,1-3-13l112-120a8,8,0,0,1,13.69,7L153.18,90.9l57.63,21.61a8,8,0,0,1,3,12.95Z"></path>
              </svg>
              SMART ACTIONS
            </button>

            <div className="w-[1px] h-4 bg-gray-700 mx-2"></div>

            <button className="hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
                <path d="M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144Z"></path>
              </svg>
            </button>

            {/* User Avatar */}
            <div className="w-8 h-8 rounded-full bg-indigo-600 overflow-hidden border border-white/20 cursor-pointer">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=C" alt="User" />
            </div>

            <button className="hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 256 256">
                <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.48,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z"></path>
              </svg>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 flex items-center justify-center gap-16 pb-8">
          {devices.length === 0 ? (
            <div className="text-center">
              <div className="text-gray-500 text-lg font-medium mb-2">No devices connected</div>
              <div className="text-gray-600 text-sm">Connect your MX Dialpad to get started</div>
            </div>
          ) : (
            <>
              {devices.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  activeButtons={activeButtons}
                  dialRotation={dialRotation}
                  wheelRotation={wheelRotation}
                  wheelOffset={wheelOffset}
                  dialAngle={dialAngle}
                  onClick={() => setSelectedDevice(device)}
                />
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
    </div>
  );
}

function DeviceCard({ device, activeButtons, dialRotation, wheelRotation, wheelOffset, dialAngle, onClick }: {
  device: DeviceInfo;
  activeButtons: Set<number>;
  dialRotation: number;
  wheelRotation: number;
  wheelOffset: number;
  dialAngle: number;
  onClick: () => void;
}) {
  // DIALPAD = MX Dialpad Mouse (dial controller)
  // CREATIVE_CONSOLE = MX Creative Console (keypad)
  const isDial = device.device_type === "DIALPAD";

  return (
    <div className="flex flex-col items-center cursor-pointer transition-transform hover:scale-105" onClick={onClick}>
      <div className="h-72 flex items-center justify-center">
        {isDial ? (
          <DialDevice activeButtons={activeButtons} dialRotation={dialRotation} wheelRotation={wheelRotation} wheelOffset={wheelOffset} dialAngle={dialAngle} />
        ) : (
          <div className="scale-[1.2]">
            <KeypadDevice activeButtons={activeButtons} />
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
    </div>
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

function KeypadDevice({ activeButtons }: { activeButtons: Set<number> }) {
  // MX Keypad button codes:
  // 0-8 = Grid buttons (3x3 layout)
  // 0xa1 (161) = P1 (Left navigation)
  // 0xa2 (162) = P2 (Right navigation)
  
  return (
    <div className="device-casing w-48 h-[13.5rem] rounded-[2rem] relative flex flex-col items-center pt-4 px-2 pb-3">
      {/* Cable */}
      <div className="cable"></div>

      {/* Button Container - Fixed width for alignment */}
      <div className="flex flex-col w-full max-w-[136px]">
        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={`keypad-btn w-10 h-10 rounded-lg transition-transform ${activeButtons.has(i) ? 'scale-95 brightness-150' : ''}`}
            ></div>
          ))}
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
