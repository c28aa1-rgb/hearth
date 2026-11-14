/** Automatic memory: 2 GB vanilla, 4 GB modded, 6 GB for big packs; never more than half the Mac's RAM. */
export function autoMemoryMb(modCount: number, systemMb: number): number {
  const want = modCount === 0 ? 2048 : modCount < 60 ? 4096 : 6144
  const cap = Math.floor(systemMb / 2 / 512) * 512
  return Math.max(1024, Math.min(want, cap))
}
