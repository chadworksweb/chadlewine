import { DEFAULT_NAV_ITEMS, type NavItem } from "./nav-items";

// Launch gating retired (2026-05-26): staging is the go-between, so the nav
// shows every item in every environment. Gate visibility by not merging a
// section to master, not by feature flags.
export async function getVisibleNavItems(): Promise<NavItem[]> {
  return DEFAULT_NAV_ITEMS;
}
