import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Bezwzględne zerowanie cache'u po stronie PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        let workersKilled = false;
        for (let registration of registrations) {
            registration.unregister();
            workersKilled = true;
        }
        if (workersKilled) {
            console.log("Stary Service Worker został usunięty. Wymuszam odświeżenie najnowszego kodu binarnego z serwera w celu zlikwidowania błędu logowania.")
            window.location.reload(true);
        }
    }).catch(function (err) {
        console.log('Błąd podczas usuwania zarejestrowanego Service Workera: ', err);
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
)
