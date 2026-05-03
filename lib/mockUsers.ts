/**
 * Mock multi-user list for the access terminal at "/".
 *
 * No backend, no auth — just visual entries the user picks before
 * entering /dashboard. The selected user's `id` is persisted to
 * sessionStorage("trading_user") on entry; downstream code can read
 * that key once we wire per-user data filtering.
 */
export interface MockUser {
  id:       string;   // stable slug, e.g. "nico"
  name:     string;   // display name
  role:     string;   // short label under the name
  initials: string;   // 2-char monogram for the HUD avatar
}

export const MOCK_USERS: MockUser[] = [
  { id: "nico", name: "Nico Buslon", role: "Operator",  initials: "NB" },
  { id: "test", name: "Test User",   role: "Sandbox",   initials: "TU" },
  { id: "demo", name: "Demo Trader", role: "Read-only", initials: "DT" },
];
