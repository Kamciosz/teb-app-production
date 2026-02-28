// CommonJS - wymagany przez librus-api
"use strict";
const Librus = require('librus-api');

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { login, pass } = req.body;

    if (!login || !pass) {
        return res.status(400).json({ error: 'Brak danych logowania.' });
    }

    const client = new Librus();

    try {
        // Autoryzacja w serwisie Synergia
        await client.authorize(login, pass);
    } catch (authError) {
        console.error('Librus Auth Error:', authError.message || authError);
        return res.status(401).json({ error: 'Nieprawidłowy login lub hasło. Sprawdź dane logowania Synergia.' });
    }

    try {
        // Równoległe pobieranie danych
        const [gradesRaw, absencesRaw, timetableRaw] = await Promise.allSettled([
            client.info.getGrades(),
            client.absence.getAbsences(),
            client.calendar.getTimetable()
        ]);

        // Oceny
        let grades = [];
        if (gradesRaw.status === 'fulfilled' && gradesRaw.value) {
            const gradesData = gradesRaw.value;

            // librus-api zwraca tablicę obiektów z polem 'grades' per przedmiot LUB płaską tablicę
            if (Array.isArray(gradesData)) {
                gradesData.forEach(item => {
                    if (item.grades && Array.isArray(item.grades)) {
                        // Struktura: {title: 'Matematyka', grades: [{grade: '5', title: 'Sprawdzian', ...}]}
                        item.grades.forEach(g => {
                            grades.push({
                                subject: item.title || item.name || 'Nieznany przedmiot',
                                grade: g.grade || g.value || '-',
                                desc: g.title || g.description || 'Wpis',
                                date: g.date || '',
                                weight: g.weight || 1
                            });
                        });
                    } else if (item.grade !== undefined) {
                        // Płaska lista ocen
                        grades.push({
                            subject: item.subject || item.title || 'Nieznany przedmiot',
                            grade: item.grade || item.value || '-',
                            desc: item.description || item.title || 'Wpis',
                            date: item.date || '',
                            weight: item.weight || 1
                        });
                    }
                });
            }
        }

        // Nieobecności / frekwencja
        let attendance = { presence_percentage: 0, late_count: 0, excused: 0, unexcused: 0 };
        if (absencesRaw.status === 'fulfilled' && absencesRaw.value) {
            const abs = absencesRaw.value;
            if (abs && typeof abs === 'object') {
                attendance = {
                    presence_percentage: abs.presence_percentage || abs.percent || abs.percentage || 0,
                    late_count: abs.late_count || abs.late || 0,
                    excused: abs.excused_count || abs.excused || abs.justified || 0,
                    unexcused: abs.unexcused_count || abs.unexcused || abs.unjustified || 0
                };
            }
        }

        // Plan lekcji
        let timetable = [];
        if (timetableRaw.status === 'fulfilled' && timetableRaw.value) {
            const tt = timetableRaw.value;
            if (Array.isArray(tt)) {
                timetable = tt.map(item => ({
                    subject: item.subject || item.title || '',
                    room: item.room || item.classroom || '',
                    start_time: item.start || item.startTime || item.start_time || '',
                    end_time: item.end || item.endTime || item.end_time || '',
                    day: item.day || item.dayOfWeek || ''
                }));
            }
        }

        return res.status(200).json({
            status: 'success',
            data: { grades, attendance, timetable }
        });

    } catch (dataError) {
        console.error('Librus Data Error:', dataError.message || dataError);
        // Zalogowaliśmy się ale błąd przy pobieraniu - oddajemy puste dane z info o sukcesie logowania
        return res.status(200).json({
            status: 'partial',
            message: 'Zalogowano, ale błąd pobierania danych: ' + (dataError.message || 'nieznany błąd'),
            data: { grades: [], attendance: { presence_percentage: 0, late_count: 0, excused: 0, unexcused: 0 }, timetable: [] }
        });
    }
};
