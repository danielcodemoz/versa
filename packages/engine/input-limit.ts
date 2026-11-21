export function inputByteLimit() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  return Math.min(memory * 48, 192) * 1024 ** 2
}
