import React from 'react'
import { Store, GraduationCap, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Features() {
    return (
        <div className="pb-10 pt-2">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-primary">Szkolne Funkcje</h2>
                <span className="text-xs text-gray-500">Wszystkie usługi SU w jednym miejscu</span>
            </div>

            <div className="flex flex-col gap-4">
                <Link to="/vinted" className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between transition hover:border-primary">
                    <div className="flex items-center gap-4">
                        <div className="bg-primary/20 p-3 rounded-full text-primary">
                            <Store size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">TEB Vinted</h3>
                            <p className="text-xs text-gray-400">Szkolny ryneczek podręczników</p>
                        </div>
                    </div>
                    <ChevronRight className="text-gray-600" />
                </Link>

                <Link to="/librus" className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between transition hover:border-secondary">
                    <div className="flex items-center gap-4">
                        <div className="bg-secondary/20 p-3 rounded-full text-secondary">
                            <GraduationCap size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Dziennik Librus</h3>
                            <p className="text-xs text-gray-400">Podgląd Ocen (Oauth2)</p>
                        </div>
                    </div>
                    <ChevronRight className="text-gray-600" />
                </Link>
            </div>
        </div>
    )
}
