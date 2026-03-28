const LETTER_VARIANTS = {
    a: '[a4@ą]+',
    c: '[cć]+',
    d: '[d]+',
    e: '[e3ę]+',
    h: '[h]+',
    i: '[i1!lł|]+',
    j: '[j]+',
    k: '[k]+',
    l: '[lł1!|]+',
    o: '[o0ó]+',
    p: '[p]+',
    r: '[r]+',
    s: '[s5$ś]+',
    t: '[t7]+',
    u: '[uµv]+',
    w: '(?:w|vv)+',
    y: '[y]+',
    z: '[zżź2]+'
}

const BANNED_STEMS = [
    'kurwa',
    'kurwy',
    'kurwi',
    'wypierdalac',
    'spierdalac',
    'pierdolic',
    'jebac',
    'jebie',
    'chuj',
    'huj',
    'pizda',
    'skurwysyn',
    'kutas',
    'cwel',
    'pedal',
    'dziwka',
    'suka',
    'sucza',
    'zjeb',
    'pojeb',
    'przyjeb'
]

function buildProfanityRegex(stem) {
    const separator = '[\\s._\\-]*'
    const parts = stem.split('').map((char) => LETTER_VARIANTS[char] || char)
    return new RegExp(parts.join(separator), 'giu')
}

const BANNED_REGEXES = BANNED_STEMS.map(buildProfanityRegex)

export const WordFilter = {
    clean(text) {
        if (!text) return ''

        return BANNED_REGEXES.reduce(
            (cleaned, regex) => cleaned.replace(regex, '####'),
            text
        )
    }
}
