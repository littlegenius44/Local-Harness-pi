import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

/**
 * Render the neutral product mark at the size requested by the sidebar or hero.
 * @param props - Host-supplied mark geometry.
 * @returns the Local-Harness-pi mark.
 */
export function OfficialBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return (
    <svg role="img" aria-label="Local-Harness-pi" width={size} height={size} className={className} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#182333" />
      <path d="M6 8h4v16H6zm0 12h9v4H6zm9-9h12v3H15zm2 3h3v10h-3zm6 0h3v10h-3z" fill="#fff" />
      <circle cx="26" cy="6" r="2" fill="#60a5fa" />
    </svg>
  )
}

/**
 * Render the product name independently of the slotted mark.
 * @returns the Local-Harness-pi name.
 */
export function OfficialBrandName() {
  return <span>Local-Harness-pi</span>
}
