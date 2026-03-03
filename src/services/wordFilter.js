const badWords = [
    'chuj', 'pizda', 'jebać', 'pierdolić', 'kurwa', 'dziwka',
    'skurwiel', 'cipa', 'pizda', 'kutas', 'dupa', 'pedał'
];

/**
 * Prosty filtr słów (Word Filter)
 * Wersja PWA Lite - cenzura gwiazdkami
 */
export const WordFilter = {
    clean: (text) => {
        if (!text || typeof text !== 'string') return text;
        let cleaned = text;
        badWords.forEach(word => {
            const regex = new RegExp(word, 'gi');
            cleaned = cleaned.replace(regex, (match) => '*'.repeat(match.length));
        });
        return cleaned;
    },

    hasBadWords: (text) => {
        if (!text || typeof text !== 'string') return false;
        return badWords.some(word => new RegExp(word, 'gi').test(text));
    }
};
