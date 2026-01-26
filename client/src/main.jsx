import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { NavidromeProvider } from './contexts/NavidromeContext.jsx'
import { JamProvider } from './contexts/JamContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <NavidromeProvider>
        <JamProvider>
          <App />
        </JamProvider>
      </NavidromeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
