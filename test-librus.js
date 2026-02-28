import Librus from 'librus-api';

async function test() {
    console.log("Inicjalizacja testu librus-api...");
    const client = new Librus();
    try {
        await client.authorize('12194674u', 'kamciosz12%Pusia');
        console.log("Zalogowano pomyślnie!");

        const grades = await client.info.getGrades();
        console.log("Oceny:", JSON.stringify(grades).substring(0, 200) + "...");

        const attendance = await client.info.getAttendances();
        console.log("Frekwencja:", JSON.stringify(attendance).substring(0, 200) + "...");

    } catch (e) {
        console.error("Błąd podczas logowania:", e);
    }
}

test();
