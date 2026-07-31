import { HelmetProvider } from 'react-helmet-async'
import App from './App.jsx'

export default function AppIsland() {
  return (
    <HelmetProvider>
      <App />
    </HelmetProvider>
  )
}
