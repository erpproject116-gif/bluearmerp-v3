import { IdleLogoutWarning } from "./IdleLogoutWarning";
import { useIdleLogout } from "./useIdleLogout";

export function IdleLogoutGuard() {
  const idle = useIdleLogout();
  return (
    <IdleLogoutWarning
      open={idle.showWarning()}
      onStay={() => idle.stayLoggedIn()}
      onLogout={() => void idle.doLogout()}
    />
  );
}
