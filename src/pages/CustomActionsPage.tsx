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
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pluginToDelete, setPluginToDelete] = useState<PythonPlugin | null>(null);
  const [hoveredPlugin, setHoveredPlugin] = useState<string | null>(null);
  const [newPlugin, setNewPlugin] = useState({
    name: "",
    description: "",
    path: "",
  });

  useEffect(() => {
    loadPlugins();
  }, []);

  const getCustomPlugins = (): PythonPlugin[] => {
    try {
      const stored = localStorage.getItem('customPlugins');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const saveCustomPlugins = (customPlugins: PythonPlugin[]) => {
    try {
      localStorage.setItem('customPlugins', JSON.stringify(customPlugins));
    } catch (err) {
      console.error('Failed to save custom plugins:', err);
    }
  };

  const loadPlugins = async () => {
    try {
      // Scan the logilinux-sdk examples directory
      const scannedPlugins = await invoke<PythonPlugin[]>("scan_python_plugins");
      
      // Load custom plugins from localStorage
      const customPlugins = getCustomPlugins();
      
      // Merge scanned and custom plugins, removing duplicates by path
      const allPlugins = [...scannedPlugins, ...customPlugins];
      const uniquePlugins = allPlugins.filter((plugin, index, self) => 
        index === self.findIndex((p) => p.path === plugin.path)
      );
      
      setPlugins(uniquePlugins);
    } catch (err) {
      console.error("Failed to load plugins:", err);
      // Fallback: load custom plugins + hardcoded list
      const customPlugins = getCustomPlugins();
      const fallbackPlugins = [
        { name: "Snake Game", path: "/home/ron0/development/cpp-projects/logilinux-sdk/examples/snake_game.py", description: "Play snake on the keypad", isRunning: false },
        { name: "Example Plugin", path: "/home/ron0/development/cpp-projects/logilinux-sdk/examples/example_plugin.py", description: "Basic keypad example", isRunning: false },
      ];
      const allPlugins = [...fallbackPlugins, ...customPlugins];
      const uniquePlugins = allPlugins.filter((plugin, index, self) => 
        index === self.findIndex((p) => p.path === plugin.path)
      );
      setPlugins(uniquePlugins);
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

  const selectFile = async () => {
    try {
      const selected = await invoke<string | null>('select_python_file');
      
      if (selected) {
        setNewPlugin(prev => ({ ...prev, path: selected }));
        
        // Auto-populate name from filename if empty
        if (!newPlugin.name) {
          const filename = selected.split('/').pop()?.replace('.py', '') || '';
          const name = filename.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          setNewPlugin(prev => ({ ...prev, name }));
        }
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const addCustomPlugin = () => {
    if (!newPlugin.name || !newPlugin.path) {
      setOutput("Error: Name and path are required\n");
      return;
    }

    const customPlugin: PythonPlugin = {
      name: newPlugin.name,
      path: newPlugin.path,
      description: newPlugin.description || "Custom plugin",
      isRunning: false
    };

    // Save to localStorage
    const customPlugins = getCustomPlugins();
    customPlugins.push(customPlugin);
    saveCustomPlugins(customPlugins);

    // Update UI
    setPlugins([...plugins, customPlugin]);
    setShowAddDialog(false);
    setNewPlugin({ name: "", description: "", path: "" });
    setOutput(`Added custom plugin: ${newPlugin.name}\n`);
  };

  const deletePlugin = () => {
    if (!pluginToDelete) return;

    // Check if it's a custom plugin (not from SDK examples)
    const isCustomPlugin = !pluginToDelete.path.includes('/logilinux-sdk/examples/');
    
    if (isCustomPlugin) {
      // Remove from localStorage
      const customPlugins = getCustomPlugins();
      const updatedCustomPlugins = customPlugins.filter(p => p.path !== pluginToDelete.path);
      saveCustomPlugins(updatedCustomPlugins);
    }

    // Update UI
    setPlugins(plugins.filter(p => p.path !== pluginToDelete.path));
    if (selectedPlugin?.path === pluginToDelete.path) {
      setSelectedPlugin(null);
    }
    setOutput(`Removed plugin: ${pluginToDelete.name}\n`);
    setShowDeleteDialog(false);
    setPluginToDelete(null);
  };

  return (
    <div className="w-full h-full bg-[#0a0a0a] flex flex-col text-white">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Plugin List */}
        <div className="w-1/3 border-r border-white/5 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Available Plugins</h2>
              <button
                onClick={() => setShowAddDialog(true)}
                className="px-3 py-1 text-xs bg-cyan-500 hover:bg-cyan-600 rounded transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"></path>
                </svg>
                Add Custom
              </button>
            </div>
            <div className="space-y-2">
              {plugins.map((plugin, index) => (
                <motion.div
                  key={index}
                  whileHover={{ scale: 1.02 }}
                  onMouseEnter={() => setHoveredPlugin(plugin.path)}
                  onMouseLeave={() => setHoveredPlugin(null)}
                  className={`p-4 rounded-lg border transition-all cursor-pointer relative ${
                    selectedPlugin?.path === plugin.path
                      ? 'bg-cyan-500/10 border-cyan-500/50'
                      : 'bg-gray-900/40 border-white/5 hover:border-white/10'
                  }`}
                  onClick={() => setSelectedPlugin(plugin)}
                >
                  {/* Delete button - only show on hover for custom plugins */}
                  {hoveredPlugin === plugin.path && !plugin.path.includes('/logilinux-sdk/examples/') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPluginToDelete(plugin);
                        setShowDeleteDialog(true);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/20 hover:bg-red-500 rounded transition-colors group"
                      title="Delete plugin"
                    >
                      <svg className="w-4 h-4 text-red-400 group-hover:text-white" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path>
                      </svg>
                    </button>
                  )}
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

      {/* Add Custom Plugin Dialog */}
      {showAddDialog && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-full max-w-md"
          >
            <h2 className="text-xl font-bold mb-4">Add Custom Plugin</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Plugin Name</label>
                <input
                  type="text"
                  value={newPlugin.name}
                  onChange={(e) => setNewPlugin(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none"
                  placeholder="My Custom Action"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Description</label>
                <textarea
                  value={newPlugin.description}
                  onChange={(e) => setNewPlugin(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none resize-none"
                  placeholder="What does this plugin do?"
                  rows={3}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Python File Path</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="text"
                    value={newPlugin.path}
                    onChange={(e) => setNewPlugin(prev => ({ ...prev, path: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-white focus:border-cyan-500 outline-none font-mono text-xs"
                    placeholder="/path/to/plugin.py"
                  />
                  <button
                    onClick={selectFile}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-xs"
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddDialog(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addCustomPlugin}
                className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors"
              >
                Add Plugin
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && pluginToDelete && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-full max-w-md"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/20 rounded-lg">
                <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path>
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2">Delete Plugin?</h2>
                <p className="text-sm text-gray-400">
                  Are you sure you want to delete <span className="font-semibold text-white">"{pluginToDelete.name}"</span>? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setPluginToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deletePlugin}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
