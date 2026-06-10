import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Summit',
    short_name: 'Summit',
    description: 'Track your summer goals and daily progress',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c1320',
    theme_color: '#0c1320',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
