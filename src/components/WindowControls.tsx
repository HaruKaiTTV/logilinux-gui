import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export function WindowControls() {
  return (
    <div className="flex items-center gap-1" onMouseDown={(event) => event.stopPropagation()}>
      <button onClick={() => appWindow.minimize()} className="window-control" aria-label="Minimize" title="Minimize">−</button>
      <button onClick={() => appWindow.toggleMaximize()} className="window-control" aria-label="Maximize" title="Maximize">□</button>
      <button onClick={() => appWindow.close()} className="window-control hover:bg-red-500/80" aria-label="Close" title="Close">×</button>
    </div>
  );
}

export function WindowDragRegion() {
  return <div className="absolute inset-0 -z-0" data-tauri-drag-region />;
}
