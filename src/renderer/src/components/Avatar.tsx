import type { Account } from '@shared/types'

/** Face from the skin texture: 8×8 face at (8,8), hat layer at (40,8). */
export function Avatar({ account, size = 22 }: { account?: Account; size?: number }) {
  if (!account) {
    return <span className="avatar empty" style={{ width: size, height: size }} aria-hidden />
  }
  if (account.skinUrl) {
    const layer = (x: number) => ({
      backgroundImage: `url(${account.skinUrl})`,
      backgroundSize: `${size * 8}px auto`,
      backgroundPosition: `${-x * (size / 8)}px ${-8 * (size / 8)}px`
    })
    return (
      <span className="avatar skin" style={{ width: size, height: size }} aria-hidden>
        <span style={layer(8)} />
        <span style={layer(40)} />
      </span>
    )
  }
  return (
    <span className="avatar letter" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      {account.name.charAt(0).toUpperCase()}
    </span>
  )
}
