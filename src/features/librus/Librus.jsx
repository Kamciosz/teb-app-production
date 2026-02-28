import React from 'react'
import { GraduationCap } from 'lucide-react'

export default function Librus() {
    return (
        <div className="pb-10 pt-4">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-primary">Dziennik Szkolny</h2>
                <span className="text-xs text-gray-500">Bezpieczne złącze Librus Synergia (Szyfrowane E2E)</span>
            </div>

            <div className="bg-surface border border-gray-800 p-6 rounded-xl shadow-lg mt-10 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-purple-500"></div>
                <GraduationCap className="mx-auto text-gray-400 mb-4" size={50} />

                <h3 className="text-lg font-bold text-white mb-2">Brak autoryzacji</h3>
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                    Zaloguj się do konta edukacyjnego <strong>Librus Synergia</strong>, aby zsynchronizować w tle swoje uśrednione oceny i powiadomienia o sprawdzianach. <br /><br />
                    Zgodnie z protokołem, dane RODO nie opuszczają Twojego smartfona – serwer Zarządu SU ich nie przechowuje!
                </p>

                <button onClick={() => alert("W przyszłości otworzy się oficjalny autoryzator API Librus Synergia Oauth. W tej chwili czekamy na spięcie tokenów ze szkołą.")} className="bg-[#e91e63] text-white px-6 py-3 rounded-lg font-bold w-full transition transform hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(233,30,99,0.3)]">
                    Połącz Dziennik Librus
                </button>
            </div>
        </div>
    )
}
