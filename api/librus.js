"use strict";

const https = require("https");
const http = require("http");

// Funkcja do wykonania zapytania HTTP z ciasteczkami
function makeRequest(options, postData, cookies) {
    return new Promise((resolve, reject) => {
        const cookieHeader = Object.entries(cookies || {})
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");

        const reqOptions = {
            ...options,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent":
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
                Referer: "https://synergia.librus.pl/",
                Cookie: cookieHeader || "",
                ...options.headers,
            },
        };

        const req = https.request(reqOptions, (res) => {
            let body = "";
            const newCookies = {};

            (res.headers["set-cookie"] || []).forEach((cookie) => {
                const [nameVal] = cookie.split(";");
                const [name, val] = nameVal.split("=");
                if (name && val) newCookies[name.trim()] = val.trim();
            });

            res.on("data", (chunk) => (body += chunk));
            res.on("end", () =>
                resolve({ body, status: res.statusCode, cookies: newCookies, headers: res.headers })
            );
        });

        req.on("error", reject);
        if (postData) req.write(postData);
        req.end();
    });
}

// Parsowanie ocen z HTML Librusa
function parseGrades(html) {
    const grades = [];
    // Librus używa tabeli z ocenami - szukamy wierszy tabeli
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

    rows.forEach(row => {
        // Wyciągnij komórki
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        if (cells.length >= 3) {
            const subject = cells[0] ? cells[0].replace(/<[^>]+>/g, '').trim() : '';
            const gradeText = cells.slice(1).map(c => c.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

            if (subject && gradeText.length > 0) {
                gradeText.forEach(gt => {
                    if (gt && gt !== '' && !/^\s*$/.test(gt)) {
                        grades.push({ subject, grade: gt, desc: 'Ocena' });
                    }
                });
            }
        }
    });

    return grades;
}

// Parsowanie planu lekcji z HTML
function parseTimetable(html) {
    const lessons = [];
    const cells = html.match(/<td[^>]*class="[^"]*plan[^"]*"[^>]*>([\s\S]*?)<\/td>/gi) || [];
    cells.forEach((cell, idx) => {
        const text = cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text && text.length > 2) {
            lessons.push({ subject: text, time: '', room: '' });
        }
    });
    return lessons;
}

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method Not Allowed" });

    const { login, pass } = req.body;
    if (!login || !pass)
        return res.status(400).json({ error: "Brak danych logowania." });

    try {
        let sessionCookies = {};

        // KROK 1: Pobierz stronę logowania (zdobądź CSRF token i ciasteczka sesji)
        const loginPage = await makeRequest(
            { hostname: "synergia.librus.pl", path: "/loguj", method: "GET" },
            null,
            {}
        );

        // Zbierz ciasteczka z odpowiedzi
        Object.assign(sessionCookies, loginPage.cookies);

        // Wyciągnij token CSRF z formularza jeśli istnieje
        const csrfMatch = loginPage.body.match(/name="_token"\s+value="([^"]+)"/);
        const csrfToken = csrfMatch ? csrfMatch[1] : '';

        // KROK 2: Wykonaj POST logowania
        const formData = new URLSearchParams({
            login: login,
            pass: pass,
            ...(csrfToken ? { _token: csrfToken } : {})
        }).toString();

        const loginResp = await makeRequest(
            {
                hostname: "synergia.librus.pl",
                path: "/loguj",
                method: "POST",
                headers: { "Content-Length": Buffer.byteLength(formData) },
            },
            formData,
            sessionCookies
        );

        Object.assign(sessionCookies, loginResp.cookies);

        // Sprawdź czy logowanie było udane (szukamy przekierowania lub braku słowa "Błędny")
        const loginSuccess =
            loginResp.status === 302 ||
            (loginResp.body && !loginResp.body.includes('Błędny login') && !loginResp.body.includes('Podaj login'));

        if (!loginSuccess) {
            return res.status(401).json({
                error: "Nieprawidłowy login lub hasło Synergia."
            });
        }

        // KROK 3: Jeśli przekierowanie - podążaj za nim
        if (loginResp.status === 302 && loginResp.headers.location) {
            const redirectPath = loginResp.headers.location.startsWith('http')
                ? new URL(loginResp.headers.location).pathname
                : loginResp.headers.location;

            await makeRequest(
                { hostname: "synergia.librus.pl", path: redirectPath, method: "GET" },
                null,
                sessionCookies
            );
        }

        // KROK 4: Pobierz oceny, frekwencję i plan lekcji równolegle
        const [gradesPage, absencePage, timetablePage] = await Promise.allSettled([
            makeRequest(
                { hostname: "synergia.librus.pl", path: "/przegladaj_oceny/uczen", method: "GET" },
                null, sessionCookies
            ),
            makeRequest(
                { hostname: "synergia.librus.pl", path: "/przegladaj_nb/uczen", method: "GET" },
                null, sessionCookies
            ),
            makeRequest(
                { hostname: "synergia.librus.pl", path: "/przegladaj_plan_lekcji", method: "GET" },
                null, sessionCookies
            )
        ]);

        // Parsuj oceny
        let grades = [];
        if (gradesPage.status === 'fulfilled') {
            grades = parseGrades(gradesPage.value.body);
        }

        // Parsuj frekwencję - szukamy procentu w HTML
        let attendance = { presence_percentage: 0, late_count: 0, excused: 0, unexcused: 0 };
        if (absencePage.status === 'fulfilled') {
            const absHtml = absencePage.value.body;
            const percentMatch = absHtml.match(/(\d+[,.]?\d*)\s*%/);
            if (percentMatch) {
                attendance.presence_percentage = parseFloat(percentMatch[1].replace(',', '.'));
            }
        }

        // Parsuj plan lekcji
        let timetable = [];
        if (timetablePage.status === 'fulfilled') {
            timetable = parseTimetable(timetablePage.value.body);
        }

        return res.status(200).json({
            status: "success",
            data: { grades, attendance, timetable },
        });

    } catch (err) {
        console.error("Librus Error:", err);
        return res.status(500).json({
            error: "Błąd serwera: " + (err.message || "nieznany błąd"),
        });
    }
};
