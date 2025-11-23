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

const AVAILABLE_ACTIONS: Action[] = [
  { id: "mute", name: "Toggle Mute", description: "Mute/unmute audio", category: "MEDIA & VOLUME", icon: "🔇", command: "pactl set-sink-mute @DEFAULT_SINK@ toggle" },
  { id: "volume-control", name: "Volume Control", description: "Adjust volume with rotation", category: "MEDIA & VOLUME", icon: "🔊", command: "volume-control", rotationOnly: true },
  { id: "brightness-control", name: "Brightness Control", description: "Adjust brightness with rotation", category: "MEDIA & VOLUME", icon: "☀️", command: "brightness-control", rotationOnly: true },
  
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
  const [activeApp, setActiveApp] = useState("All Apps");
  const [activePage, setActivePage] = useState(1);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  

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

  const isKeypad = deviceType === "CREATIVE_CONSOLE";

  useEffect(() => {
    dialAngleRef.current = dialAngle;
  }, [dialAngle]);

  useEffect(() => {
    buttonMappingsRef.current = buttonMappings;
  }, [buttonMappings]);

  useEffect(() => {
    const saved = localStorage.getItem(`button-mappings-${deviceType}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setButtonMappings(parsed);
      } catch (e) {
      }
    }
  }, [deviceType]);

  useEffect(() => {
    if (Object.keys(buttonMappings).length > 0) {
      localStorage.setItem(`button-mappings-${deviceType}`, JSON.stringify(buttonMappings));
    }
  }, [buttonMappings, deviceType]);

  useEffect(() => {
    const unlisten = listen<DeviceEvent>("device-event", (event) => {
      handleDeviceEvent(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const handleDeviceEvent = (event: DeviceEvent) => {
    if (event.type === "ButtonPress" && event.button_code !== undefined) {
      setActiveButtons(prev => new Set(prev).add(event.button_code!));
      setSelectedComponent(event.button_code);
      
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

          {/* App Selector */}
          <div className="flex items-center gap-6 text-sm font-bold text-gray-500">
            <div 
              className={`cursor-pointer transition-colors ${activeApp === "All Apps" ? "text-cyan-400" : "hover:text-gray-300"}`}
              onClick={() => setActiveApp("All Apps")}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h4v4H4V6zm6 0h4v4h-4V6zm6 0h4v4h-4V6zM4 12h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 18h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
              </svg>
            </div>
            <div className="flex items-center gap-4">
              <span 
                className={`px-2 cursor-pointer transition-colors relative ${activeApp === "Lrc" ? "text-cyan-400 app-active" : "hover:text-gray-300"}`}
                onClick={() => setActiveApp("Lrc")}
              >
                Lrc
                {activeApp === "Lrc" && (
                  <div className="absolute -bottom-2 left-0 w-full h-0.5 bg-cyan-400 shadow-[0_0_8px_rgb(103,232,249)]" />
                )}
              </span>
              <span 
                className={`px-2 cursor-pointer transition-colors ${activeApp === "Ps" ? "text-blue-500" : "hover:text-gray-300"}`}
                onClick={() => setActiveApp("Ps")}
              >
                Ps
              </span>
            </div>
            <svg className="w-5 h-5 text-gray-400 cursor-pointer hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
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
              onComponentClick={setSelectedComponent}
              buttonMappings={buttonMappings}
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
            {[1, 2, 3].map(page => (
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
            <button className="w-6 h-6 text-gray-400 text-xs font-bold hover:bg-white/5 rounded-sm flex items-center justify-center transition-colors">
              +
            </button>
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
          <div className="flex items-center gap-2 border border-orange-500/50 rounded px-2 py-1 cursor-pointer">
            <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h4v4H4V6zm6 0h4v4h-4V6zm6 0h4v4h-4V6zM4 12h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
            </svg>
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wide">All Actions</span>
          </div>
          <button className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors">
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
          {/* Actions by Category */}
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
    </div>
  );
}

function KeypadConfigView({ activeButtons, selectedComponent, onComponentClick, buttonMappings }: {
  activeButtons: Set<number>;
  selectedComponent: number | null;
  onComponentClick: (code: number) => void;
  buttonMappings: ButtonMapping;
}) {
  return (
    <div className="device-casing w-48 h-[13.5rem] rounded-[2rem] relative flex flex-col items-center pt-4 px-2 pb-3 transform scale-[1.3]">
      {/* Cable */}
      <div className="cable"></div>

      {/* Button Container - Fixed width for alignment */}
      <div className="flex flex-col w-full max-w-[136px]">
        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              onClick={() => onComponentClick(i)}
              className={`keypad-btn w-10 h-10 rounded-lg cursor-pointer transition-all relative ${
                activeButtons.has(i) ? 'scale-95 brightness-150' : ''
              } ${
                selectedComponent === i ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
              }`}
            >
              {buttonMappings[i] && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
              )}
            </div>
          ))}
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
            selectedComponent === 275 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
          }`}
        >
          {buttonMappings[275] && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
        <div 
          onClick={() => onComponentClick(276)}
          className={`tactile-btn w-7 h-7 rounded-full flex items-center justify-center relative cursor-pointer transition-all ${
            activeButtons.has(276) ? 'scale-95 brightness-150' : ''
          } ${
            selectedComponent === 276 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
          }`}
        >
          {buttonMappings[276] && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
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
          className={`w-14 h-8 rounded bg-[#181818] p-[2px] shadow-[inset_0_1px_3px_rgba(0,0,0,1)] border-b border-white/5 overflow-hidden cursor-pointer transition-all relative ${
            selectedComponent === 1001 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
          }`}
        >
          <div 
            className="roller-wheel w-full h-full rounded-[1px] transition-all duration-300"
            style={{ 
              backgroundPositionY: `${wheelOffset}px`
            }}
          ></div>
          {buttonMappings[1001] && (
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>

      {/* Center: The Big Dial */}
      <div className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 rounded-full bg-[#1a1a1a] shadow-inner flex items-center justify-center">
        <div
          onClick={() => onComponentClick(1000)}
          className={`main-dial w-32 h-32 rounded-full relative cursor-pointer transition-all duration-300 ${
            selectedComponent === 1000 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
          }`}
          style={{ transform: `rotate(${dialAngle}deg)` }}
        >
          {/* Indicator dot */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/20 shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)]"></div>
          {buttonMappings[1000] && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
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
            selectedComponent === 277 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
          }`}
        >
          {buttonMappings[277] && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>
      <div className="absolute bottom-6 right-6">
        <div 
          onClick={() => onComponentClick(278)}
          className={`tactile-btn w-10 h-10 rounded-full flex items-center justify-center relative cursor-pointer transition-all ${
            activeButtons.has(278) ? 'scale-95 brightness-150' : ''
          } ${
            selectedComponent === 278 ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d0d0d]' : ''
          }`}
        >
          {buttonMappings[278] && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d0d] shadow-[0_0_6px_rgba(34,197,94,0.8)]"></div>
          )}
        </div>
      </div>
    </div>
  );
}

