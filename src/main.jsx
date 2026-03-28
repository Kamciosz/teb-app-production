import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './pwaInstallPrompt.js'

// Skrypt rejestracji Service Workera obsługiwany automatycznie przez VitePWA

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
