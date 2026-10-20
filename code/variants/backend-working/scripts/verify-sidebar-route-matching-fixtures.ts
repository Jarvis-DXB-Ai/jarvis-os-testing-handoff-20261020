import assert from "node:assert/strict"

import { resolveSidebarActiveHref, isClientTreeRoute } from "../src/components/layout/sidebar-route-matching.js"

const hrefs = ["/", "/clients", "/workspaces/social-media", "/finance", "/tasks", "/roadmap", "/agents", "/tools", "/skills", "/models", "/prompt-inspector", "/system-operations", "/organisation-structure", "/packages", "/pitch-deck"]

const activeCount = (pathname: string) => Number(Boolean(resolveSidebarActiveHref(pathname, hrefs)))

assert.equal(resolveSidebarActiveHref("/", hrefs), "/")
assert.equal(resolveSidebarActiveHref("/clients", hrefs), "/clients")
assert.equal(resolveSidebarActiveHref("/clients/8d771fc0-2914-57cc-90f1-9ab90f4611fd/brain", hrefs), null)
assert.equal(resolveSidebarActiveHref("/tasks", hrefs), "/tasks")
assert.equal(resolveSidebarActiveHref("/workspaces/social-media", hrefs), "/workspaces/social-media")
assert.equal(resolveSidebarActiveHref("/finance", hrefs), "/finance")
assert.equal(resolveSidebarActiveHref("/agents?view=runs".split("?")[0], hrefs), "/agents")
assert.equal(resolveSidebarActiveHref("/agent-runs", hrefs), "/agents")
assert.equal(resolveSidebarActiveHref("/roadmap", hrefs), "/roadmap")
assert.equal(resolveSidebarActiveHref("/queue", hrefs), "/system-operations")
assert.equal(resolveSidebarActiveHref("/tools/research", hrefs), "/tools")
assert.equal(resolveSidebarActiveHref("/models", hrefs), "/models")
assert.equal(activeCount("/tasks"), 1)
assert.equal(activeCount("/queue"), 1)

assert.equal(resolveSidebarActiveHref("/office/demo", [...hrefs, "/office"]), null)
assert.equal(isClientTreeRoute("/office/demo"), true)
assert.equal(isClientTreeRoute("/office"), false)
console.log("Sidebar active-route fixtures passed.")
