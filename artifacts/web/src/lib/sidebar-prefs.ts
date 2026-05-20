const SIDEBAR_COOKIE = "sidebar_state";
const LEGACY_COLLAPSED_KEY = "nav-collapsed";

/** Read persisted sidebar open state (cookie + legacy localStorage). */
export function getInitialSidebarOpen(): boolean {
  if (typeof document === "undefined") return true;

  try {
    const legacy = localStorage.getItem(LEGACY_COLLAPSED_KEY);
    if (legacy === "true") return false;
  } catch {
    /* ignore */
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${SIDEBAR_COOKIE}=([^;]*)`));
  if (match) return match[1] === "true";

  return true;
}
