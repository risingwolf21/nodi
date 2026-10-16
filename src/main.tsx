import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from "@/lib/auth-provider";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    <UpdatePrompt />
  </StrictMode>,
)
