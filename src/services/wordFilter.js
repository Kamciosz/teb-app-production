export const WordFilter = {
    // Rygorystyczna lista słów (przykładowa, należy ją rozbudować)
    bannedWords: [
        'kurwa', 'chuj', 'pizda', 'jebać', 'pierdolić', 'skurwysyn', 
        'kutas', 'cwel', 'pedał', 'dziwka', 'suka', 'pizdu', 'jebie',
        'k.u.r.w.a', 'k_u_r_w_a', 'k-u-r-w-a', 'k u r w a',
        'ch.u.j', 'ch-u-j', 'c.h.u.j',
        'j.e.b.a.c', 'j-e-b-a-c'
    ],

    clean: (text) => {
        if (!text) return "";
        let cleaned = text;
        
        WordFilter.bannedWords.forEach(word => {
            // Fuzzy matching: szukamy słowa ignorując wielkość liter i dodając opcjonalne kropki/myślniki między literami
            const pattern = word.split('').join('[\\s\\.\\-_]*');
            const regex = new RegExp(pattern, 'gi');
            cleaned = cleaned.replace(regex, '####');
        });

        return cleaned;
    }
};
