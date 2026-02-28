"use strict";
const https = require("https");

// Proxy do Railway Playwright server - przekazuje zapytanie dalej
module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { login, pass } = req.body;
    if (!login || !pass) return res.status(400).json({ error: "Brak danych logowania." });

    // Wyślij zapytanie do serwera Railway z Playwright
    const postData = JSON.stringify({ login, pass });

    const options = {
        hostname: "librus-proxy-production.up.railway.app",
        path: "/librus",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(postData),
        },
    };

    return new Promise((resolve) => {
        const proxyReq = https.request(options, (proxyRes) => {
            let body = "";
            proxyRes.on("data", (chunk) => (body += chunk));
            proxyRes.on("end", () => {
                try {
                    const data = JSON.parse(body);
                    res.status(proxyRes.statusCode).json(data);
                } catch {
                    res.status(500).json({ error: "Błąd parsowania odpowiedzi serwera." });
                }
                resolve();
            });
        });

        proxyReq.on("error", (err) => {
            console.error("Railway proxy error:", err);
            res.status(500).json({ error: "Błąd połączenia z serwerem Playwright." });
            resolve();
        });

        // Timeout 60 sekund (Playwright potrzebuje czasu na zalogowanie)
        proxyReq.setTimeout(60000, () => {
            proxyReq.destroy();
            res.status(504).json({ error: "Przekroczono czas oczekiwania. Spróbuj ponownie." });
            resolve();
        });

        proxyReq.write(postData);
        proxyReq.end();
    });
};
