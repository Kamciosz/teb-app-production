import React from 'react'
import { CheckCircle2 } from 'lucide-react'

export default function Librus() {

    // W prawdziwej aplikacji tutaj następuje "Fetch" z tokenu bezpośrednio do interfejsu
    // Supabase RODO nie uczestniczy w trzymaniu poniższych ocen
    const MOCK_GRADES = [
        { id: 1, subject: "Matematyka", grade: "4+", desc: "Sprawdzian - Funkcje" },
        { id: 2, subject: "Język r. Obcy", grade: "5", desc: "Zadanie Domowe" },
        { id: 3, subject: "Prac. Prog. (AI)", grade: "6", desc: "Laboratorium API" },
        { id: 4, subject: "Bazy Danych", grade: "4", desc: "SQL - Złączenia" },
    ]

    return (
        <div className="pb-10">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-primary">Dziennik Szkolny</h2>
                <span className="text-xs text-gray-500">Read-Only mode. (Szyfrowane E2E)</span>
            </div>

            <div className="bg-gradient-to-br from-primary/10 to-surface border-l-4 border-primary p-4 rounded-xl shadow-lg mb-8">
                <div className="text-sm text-gray-400 mb-1">Status na dzisiaj</div>
                <div className="text-lg font-bold text-white flex gap-2 items-center">
                    <CheckCircle2 className="text-primary" size={20} /> Połączenie API Nawiązane
                </div>
            </div>

            <h3 className="text-md font-bold text-white mb-4 ml-2">Moje Ostatnie Oceny</h3>

            <div className="grid grid-cols-2 gap-4">
                {MOCK_GRADES.map(g => (
                    <div key={g.id} className="bg-surface border border-gray-800 p-4 rounded-xl text-center shadow-lg">
                        <div className="text-xs text-gray-400 mb-2 truncate">{g.subject}</div>
                        <div className="text-3xl font-bold text-primary">{g.grade}</div>
                        <div className="text-xs text-gray-500 mt-2 truncate">{g.desc}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}
