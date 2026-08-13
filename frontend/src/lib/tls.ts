export const TLS_OPTIONS = [
  { value: "only_http", label: "http://", menuLabel: "Only HTTP" },
  { value: "only_https", label: "https://", menuLabel: "Only HTTPS" },
  {
    value: "redirect_http_to_https",
    label: "http:// → https://",
    menuLabel: "Redirect HTTP to HTTPS",
  },
  {
    value: "both_http_and_https",
    label: "http:// + https://",
    menuLabel: "HTTP and HTTPS",
  },
] as const

export function getTlsMenuLabel(value: string | null) {
  if (!value) return "—"
  return TLS_OPTIONS.find((option) => option.value === value)?.menuLabel ?? value
}
