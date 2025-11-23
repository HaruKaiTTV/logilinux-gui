import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";

interface PythonPlugin {
  name: string;
  path: string;
  description?: string;
  isRunning: boolean;
}

export function CustomActionsPage({ onBack }: { onBack: () => void }) {
  const [plugins, setPlugins] = useState<PythonPlugin[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<PythonPlugin | null>(null);
  const [output, setOutput] = useState<string>("");

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      // Scan the logilinux-sdk examples directory
      const pluginList = await invoke<PythonPlugin[]>("scan_python_plugins");
      setPlugins(pluginList);
    } catch (err) {
      console.error("Failed to load plugins:", err);
      // Fallback: hardcoded list of known plugins
      setPlugins([
        { name: "Example Plugin", path: "/home/ron0/development/cpp-projects/logilinux-sdk/examples/example_plugin.py", description: "Basic plugin demonstrating SDK usage", isRunning: false },
        { name: "Utility Panel", path: "/home/ron0/development/cpp-projects/logilinux-sdk/examples/utility_panel.py", description: "System utilities", isRunning: false },
        { name: "Snake Game", path: "/home/ron0/development/cpp-projects/logilinux-sdk/examples/snake_game.py", description: "Play snake on the keypad", isRunning: false },
        { name: "Tic Tac Toe", path: "/home/ron0/development/cpp-projects/logilinux-sdk/examples/tictactoe_game.py", description: "Two-player tic tac toe", isRunning: false },
      ]);
    }
  };

  const runPlugin = async (plugin: PythonPlugin) => {
    try {
      setSelectedPlugin(plugin);
      setOutput(`Starting ${plugin.name}...\n`);
      
      const result = await invoke<string>("run_python_plugin", { 
        pluginPath: plugin.path 
      });
      
      setOutput(prev => prev + result);
      setPlugins(plugins.map(p => 
        p.path === plugin.path ? { ...p, isRunning: true } : p
      ));
    } catch (err) {
      setOutput(prev => prev + `\nError: ${err}\n`);
    }
  };

  const stopPlugin = async (plugin: PythonPlugin) => {
    try {
      await invoke("stop_python_plugin", { 
        pluginName: plugin.name 
      });
      
      setPlugins(plugins.map(p => 
        p.path === plugin.path ? { ...p, isRunning: false } : p
      ));
      setOutput(prev => prev + `\nStopped ${plugin.name}\n`);
    } catch (err) {
      setOutput(prev => prev + `\nError stopping: ${err}\n`);
    }
  };

  return (
    <div className="w-full h-full bg-[#0a0a0a] flex flex-col text-white">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Plugin List */}
        <div className="w-1/3 border-r border-white/5 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Available Plugins</h2>
            <div className="space-y-2">
              {plugins.map((plugin, index) => (
                <motion.div
                  key={index}
                  whileHover={{ scale: 1.02 }}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    selectedPlugin?.path === plugin.path
                      ? 'bg-cyan-500/10 border-cyan-500/50'
                      : 'bg-gray-900/40 border-white/5 hover:border-white/10'
                  }`}
                  onClick={() => setSelectedPlugin(plugin)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-bold text-white">{plugin.name}</h3>
                      {plugin.description && (
                        <p className="text-xs text-gray-400 mt-1">{plugin.description}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1 font-mono truncate">{plugin.path.split('/').pop()}</p>
                    </div>
                    {plugin.isRunning && (
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-2"></div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    {!plugin.isRunning ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          runPlugin(plugin);
                        }}
                        className="px-3 py-1 text-xs bg-cyan-500 hover:bg-cyan-600 rounded transition-colors"
                      >
                        Run
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          stopPlugin(plugin);
                        }}
                        className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 rounded transition-colors"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Plugin Details & Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPlugin ? (
            <>
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-bold">{selectedPlugin.name}</h2>
                <p className="text-sm text-gray-400 mt-1">{selectedPlugin.description}</p>
                <p className="text-xs text-gray-500 mt-2 font-mono">{selectedPlugin.path}</p>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="px-6 py-3 border-b border-white/5">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Output</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-black/30 font-mono text-xs">
                  <pre className="text-gray-300 whitespace-pre-wrap">{output || "No output yet. Click 'Run' to start the plugin."}</pre>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-42.34-61.66a8,8,0,0,1,0,11.32l-24,24a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L120,164.69V120a8,8,0,0,1,16,0v44.69l10.34-10.35A8,8,0,0,1,157.66,154.34Z"></path>
                </svg>
                <p className="text-sm">Select a plugin to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
