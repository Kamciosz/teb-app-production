export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { login, pass } = req.body;
    if (!login || !pass) return res.status(400).json({ error: "Brak danych logowania." });

    try {
        const response = await fetch("https://librus-proxy-production.up.railway.app/librus", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ login, pass })
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        console.error("Railway proxy fetch error:", err);
        return res.status(500).json({ error: "Błąd połączenia z serwerem API na Railway." });
    }
}
