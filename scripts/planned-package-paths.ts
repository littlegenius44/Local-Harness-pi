/** Exact create targets in implementation plans are prospective, not stale references. */

/**
 * Read explicitly declared creation targets, without exempting current documentation.
 * @param file - Repository-relative Markdown owner.
 * @param text - Plan text containing Create entries.
 * @returns Exact normalized package paths; no glob or traversal exemptions.
 */
export function plannedPackagePaths(file: string, text: string): ReadonlySet<string> {
  if (!file.replaceAll('\\', '/').startsWith('docs/superpowers/plans/')) return new Set()
  const paths = new Set<string>()
  for (const match of text.matchAll(/^- (?:Create|Test)[:：]\s*`(packages\/[A-Za-z0-9._/-]+)`\s*$/gm)) {
    const path = match[1]
    if (path !== undefined && !path.split('/').some(part => part === '.' || part === '..' || part === '')) paths.add(path)
  }
  return paths
}
