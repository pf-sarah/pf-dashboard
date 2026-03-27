import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#6B1A2C',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
      }}
    >
      <span style={{ color: 'white', fontSize: 13, fontWeight: 800, letterSpacing: -0.5, fontFamily: 'sans-serif' }}>
        PF
      </span>
    </div>,
    { ...size }
  );
}
