import React from 'react'
import { GraduationCap } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════
// LIBRUS API — RESEARCH NOTES (May 2026)
// ═══════════════════════════════════════════════════════════════════════
// Librus Synergia REST API at api.librus.pl/3.0 with 70+ endpoints.
// OAuth2 (Resource Owner Password Grant).
//   POST https://api.librus.pl/OAuth/Token
//   Authorization: Basic MzU6NjM2YWI0MThjY2JlODgyYjE5YTMzZjU3N2U5NGNiNGY=
//   Body: grant_type=password&username=LOGIN&password=HASLO&librus_long_term_token=1
//   Response: { access_token: "JWT", token_type: "bearer", expires_in: 3600 }
//
// Key endpoints:
//   GET /Me, /Timetables, /Grades, /Grades/Averages, /Attendances
//   GET /SchoolNotices, /HomeWorks, /Subjects, /LuckyNumbers
//   GET /Calendars/Substitutions/...
//
// RECOMMENDED: Frontend (React) → Backend proxy (Node) → Librus API
//   Backend: npm install librus-sdk, create /api/librus endpoints
//   Security: backend stores token in memory, never exposes raw password
// ═══════════════════════════════════════════════════════════════════════

export default function Librus() {
    return (
        <div className="p-4 fade-in">
            <div className="text-center py-20">
                <div className="bg-yellow-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <GraduationCap size={40} className="text-yellow-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Dziennik Librus</h2>
                <p className="text-gray-400 mb-2">Moduł w trakcie integracji</p>
                <div className="inline-block px-4 py-1.5 bg-yellow-500/20 text-yellow-400 text-sm font-bold rounded-full uppercase tracking-wider mb-6">Coming Soon</div>
                <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Pracujemy nad integracją z dziennikiem Librus Synergia.
                    Będzie dostępny wkrótce. Śledź aktualności w aplikacji.
                </p>
                <div className="mt-8 p-4 bg-surface border border-gray-800 rounded-xl max-w-md mx-auto text-left text-sm text-gray-400">
                    <p className="font-bold text-white mb-2">🔧 Planowane funkcje:</p>
                    <ul className="space-y-1.5">
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Podgląd ocen i frekwencji</li>
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Plan lekcji na bieżący tydzień</li>
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Automatyczne logowanie przez OAuth2</li>
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Powiadomienia o nowych ocenach</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
