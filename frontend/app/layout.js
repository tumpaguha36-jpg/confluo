import './globals.css'
import { Fraunces, Source_Serif_4, Inter } from 'next/font/google'
import { Providers } from './providers'

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-fraunces', axes: ['opsz'] })
const sourceSerif = Source_Serif_4({ subsets: ['latin'], display: 'swap', variable: '--font-serif' })
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

export const metadata = {
  title: 'Confluo — Write together. Never lose a word.',
  description: 'A calm, collaborative rich-text editor with conflict-free merging, live cursors, and offline-safe writing.',
  openGraph: {
    title: 'Confluo — Write together. Never lose a word.',
    description: 'Conflict-free merging, live cursors, offline-safe. A place to write for hours.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Confluo', description: 'Write together. Never lose a word.' },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${sourceSerif.variable} ${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
