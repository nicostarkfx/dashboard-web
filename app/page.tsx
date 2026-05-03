import { AuthContainer } from "@/components/AuthContainer";

/**
 * Access terminal — root route.
 *
 * Renders the HUD-styled auth shell (login / register / forgot — view
 * switching lives inside <AuthContainer />). No backend yet: a successful
 * login or register stashes the normalized email in
 * sessionStorage("trading_user") and routes to /dashboard.
 *
 * The header ("ACCESS TERMINAL / TRADING SYSTEM") is rendered *inside*
 * AuthContainer so the whole access screen can be centered as a single
 * unit.
 */
export default function AccessTerminal() {
  return <AuthContainer />;
}
