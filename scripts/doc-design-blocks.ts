/** Syntax validation for approved preimplementation design excerpts. */
import ts from 'typescript'

const designOwners = new Set([
  'docs/architecture/interface-contracts.md',
  'docs/superpowers/plans/2026-09-10-local-harness-pi-pr-a-dsh-baseline.md',
  'docs/superpowers/plans/2026-09-10-local-harness-pi-pr-b-pi-kernel.md',
  'docs/superpowers/plans/2026-09-10-local-harness-pi-pr-c-product-loop.md',
  'docs/superpowers/plans/2026-09-18-agent-machine-seam-rectification.md',
  'docs/superpowers/plans/2026-09-27-local-harness-pi-pr-b-minimal-serial.md',
])

/**
 * Enforce ownership before accepting syntax-only validation of a future API.
 * @param file - Primary repository-relative Markdown file after pairing deduplication.
 * @param code - Design excerpt.
 * @returns Ownership or syntax errors; current package examples cannot opt in.
 */
export function validateDesignBlock(file: string, code: string): string[] {
  return designOwners.has(file.replaceAll('\\', '/'))
    ? designBlockErrors(code)
    : ['Design fences are limited to the approved implementation plans and interface specification.']
}

/**
 * Parse a complete TypeScript design excerpt without claiming its future APIs exist.
 * @param code - Complete declarations or statements, including enclosing context.
 * @returns Syntax diagnostics; an empty list means syntax only is valid.
 */
export function designBlockErrors(code: string): string[] {
  const file = ts.createSourceFile('design.ts', code, ts.ScriptTarget.Latest, true)
  const host = ts.createCompilerHost({ noEmit: true, noResolve: true })
  const original = host.getSourceFile.bind(host)
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    name === 'design.ts' ? file : original(name, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram(['design.ts'], { noEmit: true, noResolve: true }, host)
  return program.getSyntacticDiagnostics(file).map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}
