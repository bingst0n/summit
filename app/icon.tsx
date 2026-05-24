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
        background: '#09090b',
        borderRadius: 40,
      }}
    >
      <span style={{ fontSize: 110, fontWeight: 900, color: '#6366f1', fontFamily: 'sans-serif' }}>
        L
      </span>
    </div>
  )
}
