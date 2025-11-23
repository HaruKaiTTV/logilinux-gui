import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);

// Hide splash screen after app loads
setTimeout(() => {
  const splash = document.getElementById("splash-screen");
  if (splash) {
    splash.style.opacity = "0";
    splash.style.transition = "opacity 0.3s ease-out";
    setTimeout(() => splash.remove(), 300);
  }
}, 500);
