import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/newsreader/500.css'
import '@fontsource/newsreader/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@xterm/xterm/css/xterm.css'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { loadRuntimeConfig } from './runtimeConfig.ts'

async function bootstrap() {
  await loadRuntimeConfig()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
