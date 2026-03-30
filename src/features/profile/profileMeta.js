export const PROFILE_BIO_LIMIT = 160

export const AVAILABLE_BADGES = [
    { id: 'pres_tech', label: 'Przewodniczacy Tech', icon: '🎓', price: 500 },
    { id: 'pres_liceum', label: 'Przewodniczacy Liceum', icon: '📚', price: 500 },
    { id: 'top_rich', label: 'Top Gabka', icon: '💰', price: 1000 },
    { id: 'helper', label: 'Pomocna Dlon', icon: '🤝', price: 200 },
    { id: 'beta_tester', label: 'Beta Tester', icon: '🧪', price: 0 }
]

const ROLE_META = {
    admin: {
        label: 'Prezes SU',
        shortLabel: 'ADMIN',
        badgeClassName: 'bg-red-500/15 text-red-300 border border-red-500/30'
    },
    moderator_users: {
        label: 'Moderator Uzytkownikow',
        shortLabel: 'MOD UZYTK.',
        badgeClassName: 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
    },
    moderator_content: {
        label: 'Moderator Tresci',
        shortLabel: 'MOD TRESCI',
        badgeClassName: 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
    },
    editor: {
        label: 'Redaktor',
        shortLabel: 'REDAKTOR',
        badgeClassName: 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30'
    },
    teacher: {
        label: 'Nauczyciel',
        shortLabel: 'NAUCZYCIEL',
        badgeClassName: 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30'
    },
    tutor: {
        label: 'Korepetytor',
        shortLabel: 'KOREPET.',
        badgeClassName: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
    },
    freelancer: {
        label: 'Freelancer',
        shortLabel: 'FREELANCER',
        badgeClassName: 'bg-violet-500/15 text-violet-200 border border-violet-500/30'
    },
    su_member: {
        label: 'Samorzad',
        shortLabel: 'SAMORZAD',
        badgeClassName: 'bg-fuchsia-500/15 text-fuchsia-200 border border-fuchsia-500/30'
    },
    student: {
        label: 'Uczen',
        shortLabel: 'UCZEN',
        badgeClassName: 'bg-primary/15 text-primary border border-primary/30'
    }
}

export function normalizeRoles(roles, role) {
    const merged = Array.isArray(roles) && roles.length > 0 ? roles : [role || 'student']
    return Array.from(new Set(merged.filter(Boolean)))
}

export function getRoleMeta(role) {
    return ROLE_META[role] || ROLE_META.student
}

export function getRoleLabel(role) {
    return getRoleMeta(role).label
}

export function getRoleShortLabel(role) {
    return getRoleMeta(role).shortLabel
}

export function getRoleBadgeClass(role) {
    return getRoleMeta(role).badgeClassName
}

export function getPrimaryRole(profile) {
    return normalizeRoles(profile?.roles, profile?.role)[0] || 'student'
}

export function getBadgeDefinition(badgeId) {
    return AVAILABLE_BADGES.find(badge => badge.id === badgeId) || null
}

export function getProfileShowcaseItems(profile) {
    const items = []
    const roles = normalizeRoles(profile?.roles, profile?.role)

    roles.forEach(role => {
        if (role !== 'student') {
            items.push({
                id: `role-${role}`,
                label: getRoleLabel(role),
                className: getRoleBadgeClass(role),
                icon: null
            })
        }
    })

    if ((profile?.teb_gabki || 0) > 1000) {
        items.push({
            id: 'rich',
            label: 'Milioner',
            className: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20',
            icon: '💰'
        })
    }

    ;(profile?.badges || []).forEach(badgeId => {
        const badge = getBadgeDefinition(badgeId)
        if (!badge) return
        items.push({
            id: badgeId,
            label: badge.label,
            className: 'bg-primary/10 text-primary border border-primary/20',
            icon: badge.icon
        })
    })

    return items
}

export function getUserInitial(name) {
    return (name || '?').trim().charAt(0).toUpperCase()
}