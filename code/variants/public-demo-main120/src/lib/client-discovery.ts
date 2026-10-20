// Owner-requested discovery exclusions (6 September 2026). These do not archive
// tenants, alter financial totals, or prevent historical deep links from working.
const hiddenClientIds = new Set([
  "344da257-e4ec-548c-b3b8-959b3af8d001", // DemoClientC: legacy workspace
  "ae2aa0d1-79d9-5dd1-b656-804e16927959", // DemoClientF: temporarily hidden
  "b29c0cbf-48fa-5e12-b7aa-8848365e66d8", // DemoClientD Dubai: temporarily hidden
]);

export function isClientDiscoverable(id: string): boolean {
  return !hiddenClientIds.has(id);
}
