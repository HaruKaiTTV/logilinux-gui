import { DevicesPage } from "./pages/DevicesPage";
import { PermissionGuard } from "./components/PermissionGuard";

function App() {
  return (
    <PermissionGuard>
      <DevicesPage />
    </PermissionGuard>
  );
}

export default App;
