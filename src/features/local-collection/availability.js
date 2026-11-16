export function isLocalCollectionEnabled(
  dev = import.meta.env.DEV,
  hostname = globalThis.location?.hostname
) {
  return dev && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}
