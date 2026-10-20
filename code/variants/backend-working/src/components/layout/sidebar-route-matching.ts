const SYSTEM_OPERATION_ROUTES = [
  "/queue",
  "/sandbox",
  "/executions",
  "/commands",
  "/tasks",
  "/workflow",
  "/cycles",
  "/deliverables",
  "/audit-reviews",
  "/playbooks",
  "/learning",
  "/research",
  "/workspaces/social-media",
]

const NAVIGATION_ALIASES: Array<{ href: string; routes: string[] }> = [
  { href: "/agents", routes: ["/agent-runs"] },
]

function matchesRoute(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Chooses the single top-level navigation item that owns a route. Client-tree
 * routes intentionally return null because their selected child owns the active
 * treatment; the Clients parent remains expanded but visually neutral.
 */
export function resolveSidebarActiveHref(pathname: string | null, hrefs: readonly string[]) {
  const route = pathname || "/"
  if (route.startsWith("/clients/") || route === "/office/demo") return null

  const directMatch = [...new Set(hrefs)]
    .filter((href) => matchesRoute(route, href))
    .sort((left, right) => right.length - left.length)[0]
  if (directMatch) return directMatch

  const aliasMatch = NAVIGATION_ALIASES.find(({ href, routes }) => hrefs.includes(href) && routes.some((candidate) => matchesRoute(route, candidate)))
  if (aliasMatch) return aliasMatch.href

  if (hrefs.includes("/system-operations") && SYSTEM_OPERATION_ROUTES.some((candidate) => matchesRoute(route, candidate))) {
    return "/system-operations"
  }

  return null
}

export function isClientTreeRoute(pathname: string | null) {
  return pathname === "/office/demo" || Boolean(pathname?.startsWith("/clients/"))
}

