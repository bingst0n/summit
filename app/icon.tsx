import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0c1320',
        borderRadius: 40,
      }}
    >
      <svg
        width="124"
        height="124"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ff7847"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 20l7-14 4 8 2-4 5 10z" />
      </svg>
    </div>,
    { ...size }
  )
}
