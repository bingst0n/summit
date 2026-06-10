// Server-renderable SVG: the season as a mountain ridge. The portion already
// climbed is solid ember with a soft fill; the remainder is a dashed outline
// ending in a flag at the summit (the season's end date).

const W = 360
const H = 88

// Fixed ridgeline (x rises with time, y falls as elevation gains).
const RIDGE: Array<[number, number]> = [
  [0, 80], [28, 64], [52, 70], [82, 48], [104, 54], [142, 38],
  [168, 46], [208, 26], [246, 34], [290, 14], [330, 22], [360, 6],
]

/** Interpolate the ridge's y at a given x. */
function yAt(x: number): number {
  for (let i = 1; i < RIDGE.length; i++) {
    const [x0, y0] = RIDGE[i - 1]
    const [x1, y1] = RIDGE[i]
    if (x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0)
      return y0 + t * (y1 - y0)
    }
  }
  return RIDGE[RIDGE.length - 1][1]
}

interface ElevationProfileProps {
  /** Fraction of the season elapsed, 0..1. */
  fraction: number
  /** e.g. "YOU · 29% CLIMBED" */
  leftLabel: string
  /** e.g. "SUMMIT · AUG 31" */
  rightLabel: string
}

export default function ElevationProfile({ fraction, leftLabel, rightLabel }: ElevationProfileProps) {
  const f = Math.min(Math.max(fraction, 0), 1)
  const px = W * f
  const py = yAt(px)

  const climbed = [...RIDGE.filter(([x]) => x < px), [px, py] as [number, number]]
  const remaining = [[px, py] as [number, number], ...RIDGE.filter(([x]) => x > px)]
  const toPath = (pts: Array<[number, number]>) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')

  const [sx, sy] = RIDGE[RIDGE.length - 1]

  return (
    <div className="bg-panel border border-line rounded-2xl px-3.5 pt-4 pb-2.5">
      <svg viewBox={`0 0 ${W} ${H}`} fill="none" className="w-full h-[88px] block" aria-hidden>
        {f > 0 && (
          <>
            <path d={toPath(climbed)} stroke="#ff7847" strokeWidth="2.5" strokeLinejoin="round" />
            <path
              d={`${toPath(climbed)} L${px} ${H} L0 ${H} Z`}
              fill="rgba(255,120,71,.12)"
            />
          </>
        )}
        {f < 1 && (
          <path
            d={toPath(remaining)}
            stroke="#3a587f"
            strokeWidth="2"
            strokeDasharray="4 5"
            strokeLinejoin="round"
          />
        )}
        {/* you are here */}
        <circle cx={px} cy={py} r="5" fill="#ff7847" />
        <circle cx={px} cy={py} r="10" fill="none" stroke="#ff7847" strokeOpacity=".4" />
        {/* summit flag */}
        <path d={`M${sx} ${sy} L${sx} ${sy - 8} L${sx - 8} ${sy - 5} L${sx} ${sy - 2}`} fill="#9ecfff" />
        <circle cx={sx} cy={sy} r="3" fill="#9ecfff" />
      </svg>
      <div className="flex justify-between font-mono text-[10.5px] text-mut mt-1.5">
        <span><b className="text-ember font-semibold">{leftLabel}</b></span>
        <span>{rightLabel}</span>
      </div>
    </div>
  )
}
