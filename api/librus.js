import Librus from 'librus-api';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { login, pass } = req.body;

    if (!login || !pass) {
        return res.status(400).json({ error: 'Brak danych logowania' });
    }

    try {
        const client = new Librus();

        // Autoryzacja
        await client.authorize(login, pass);

        // Pobieranie ocen i frekwencji
        const gradesData = await client.info.getGrades();
        const attendanceData = await client.info.getAttendances();
        const timetableData = await client.info.getTimetable(); // Tygodniowy plan

        res.status(200).json({
            status: 'success',
            data: {
                grades: gradesData,
                attendance: attendanceData,
                timetable: timetableData
            }
        });
    } catch (error) {
        console.error('Błąd autoryzacji Librus:', error);
        res.status(401).json({ error: 'Błąd logowania. Sprawdź poprawność danych (Librus Synergia).' });
    }
}
