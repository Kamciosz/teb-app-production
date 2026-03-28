import React from 'react';
import { Shield, Lock, Trash2, Eye, ArrowLeft, Info, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
    const navigate = useNavigate();

    return (
        <div className="pb-20 pt-4 px-2 fade-in">
            <div className="flex items-center gap-3 mb-8">
                <button 
                    onClick={() => navigate(-1)} 
                    className="p-2 bg-surface border border-gray-800 rounded-full text-gray-400 hover:text-white transition"
                >
                    <ArrowLeft size={20} />
                </button>
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Shield className="text-primary" size={24} /> Prywatność
                </h2>
            </div>

            <div className="space-y-6">
                {/* Wstęp */}
                <section className="bg-surface border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                        <Info size={18} className="text-primary" /> O projekcie
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                        TEB-App to szkolna platforma społecznościowa stworzona wyłącznie dla uczniów i nauczycieli TEB Edukacja. 
                        Twoje bezpieczeństwo i prywatność są dla nas priorytetem.
                    </p>
                </section>

                {/* Jakie dane zbieramy */}
                <section className="bg-surface border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Eye size={18} className="text-secondary" /> Jakie dane zbieramy?
                    </h3>
                    <ul className="space-y-4">
                        <li className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                                <Lock size={16} />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">Tożsamość</div>
                                <div className="text-xs text-gray-500">Imię, nazwisko oraz szkolny adres e-mail (@teb.edu.pl).</div>
                            </div>
                        </li>
                        <li className="flex gap-3">
                            <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                                <FileText size={16} />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">Aktywność</div>
                                <div className="text-xs text-gray-500">Wiadomości czatu, oferty na giełdzie Re-Wear oraz posty na tablicy.</div>
                            </div>
                        </li>
                    </ul>
                </section>

                {/* Śmieciarka - GC */}
                <section className="bg-surface border border-gray-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Trash2 size={80} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Trash2 size={18} className="text-red-500" /> System "Śmieciarka"
                    </h3>
                    <p className="text-sm text-gray-400 mb-4 leading-relaxed">
                        Aby dbać o higienę cyfrową i limity serwera, system automatycznie usuwa stare dane:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                        <div className="flex justify-between items-center p-3 bg-background border border-gray-800 rounded-xl">
                            <span className="text-xs font-bold text-gray-300">Wiadomości czatu</span>
                            <span className="text-xs text-red-500 font-bold">Po 8 dniach</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background border border-gray-800 rounded-xl">
                            <span className="text-xs font-bold text-gray-300">Oferty Re-Wear</span>
                            <span className="text-xs text-red-500 font-bold">Po 21 dniach</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background border border-gray-800 rounded-xl">
                            <span className="text-xs font-bold text-gray-300">Raporty</span>
                            <span className="text-xs text-red-500 font-bold">Po 30 dniach</span>
                        </div>
                    </div>
                </section>

                {/* Twoje prawa */}
                <section className="bg-surface border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-bold text-white mb-3">Twoje prawa</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">
                        Masz prawo do wglądu w swoje dane, ich poprawiania oraz żądania usunięcia konta. 
                        Wszystkie zdjęcia profilowe są przechowywane na zewnętrznym serwerze CDN z włączoną kompresją. 
                        Aplikacja nie udostępnia Twoich danych podmiotom trzecim poza infrastrukturą niezbędną do działania (Supabase, Cloudflare R2).
                    </p>
                </section>

                <div className="text-center py-4">
                    <p className="text-[10px] text-gray-600 uppercase font-bold tracking-widest">Wersja regulaminu: release-0.1 (Marzec 2026)</p>
                </div>
            </div>
        </div>
    );
}
