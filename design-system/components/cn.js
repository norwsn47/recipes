// Joins class names, skipping falsy values. Replaces the clsx/tailwind-merge packages.
export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
