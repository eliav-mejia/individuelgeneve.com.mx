// Shared by EVERY page: brand config, header, footer, accounts (staging), cookie notice, PageHero, renderPage().
// Load order on each page: tailwind.config.js → layout.jsx → acceso.jsx → (tienda.jsx | reservas.jsx) → page script.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// --- BASE PATH ---
// The site is served at the domain root (individuelgeneve.com.mx) or under a sub-path in staging
// (eliav-mejia.github.io/individuelgeneve.com.mx/). Code and data write root paths ('/pages/…', '/img/…', '/public/db/…');
// BASE is prepended here, in one place: every href/src rendered by React and every fetch('/…'). BASE is '' on the real domain.
// HTML <head> tags use paths relative to the page (../../js/…) for the same reason.
const BASE = (() => {
    const s = document.querySelector('script[src$="js/layout.jsx"]');
    return s ? new URL(s.src).pathname.replace(/\/js\/layout\.jsx$/, '') : '';
})();
const withBase = (u) => (BASE && typeof u === 'string' && u[0] === '/' && u[1] !== '/' && !u.startsWith(BASE + '/') ? BASE + u : u);
// Current path without BASE: use it instead of location.pathname when comparing against site paths.
const PATH = window.location.pathname.slice(BASE.length) || '/';

if (BASE) {
    const createElement = React.createElement;
    React.createElement = function (type, props, ...children) {
        if (props && (typeof props.href === 'string' || typeof props.src === 'string')) {
            props = { ...props };
            if (typeof props.href === 'string') props.href = withBase(props.href);
            if (typeof props.src === 'string') props.src = withBase(props.src);
        }
        return createElement.call(this, type, props, ...children);
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => nativeFetch(withBase(input), init);
}

// --- BRAND ---
// Source: individuelgeneve.com.mx (Squarespace), read 2026-11-01.
const BRAND = {
    name: 'Individuel Genève',
    tagline: 'Expertos en hidratación & rejuvenecimiento',
    operator: 'BELLEZA PRO MX S.A. de C.V.',
    email: 'atencion@individuelgeneve.mx',          // [verificar] la web original escribe «atención@» (con acento, no válido)
    emailPrivacy: 'info@individuelgeneve.mx',
    emailJobs: 'reclutamiento@individuelgeneve.mx',
    phone: '+52 1 55 2307 6185',
    whatsapp: '5215523076185',                       // WhatsApp de atención (2026-11-01). Solo dígitos, formato internacional (wa.me)
    address: 'Av. Tamaulipas 150, piso 15, torre B, Condesa, Ciudad de México, CP 06140',
    instagram: 'https://www.instagram.com/individuelgeneve.mx',
    hours: 'Lun – vie 8:00 – 20:00 · Sáb y dom 10:00 – 16:00',
    url: 'https://individuelgeneve.com.mx',             // public domain: links shared in WhatsApp messages
    mapUrl: 'https://maps.google.com/?q=Av.+Tamaulipas+150,+Condesa,+Ciudad+de+M%C3%A9xico',
};

// Brand claims shown on the home, shop and product pages (SEO: tools/seo.py uses the same wording).
// «Distribuidor autorizado» comes from the original site (Individuel en México, operado por BELLEZA PRO MX). [verificar con el cliente]
const BRAND_CLAIMS = ['Producto original', 'Distribuidor autorizado en México', 'Personalizado para todo tipo de piel'];

// Stacked one per line on mobile, in a row from sm. align="start" left-aligns it (product page).
const ClaimsRow = ({ dark = false, align = 'center', className = '' }) => (
    <ul className={`flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-2 label !tracking-[0.18em] sm:!tracking-[0.28em] ${align === 'start' ? 'items-start sm:justify-start' : 'items-center sm:justify-center'} ${dark ? 'text-white/80' : 'text-ink-400'} ${className}`}>
        {BRAND_CLAIMS.map(c => <li key={c} className="flex items-center gap-2 text-left"><IconCheck className={`w-4 h-4 shrink-0 ${dark ? 'text-blush-300' : 'text-blush-500'}`} />{c}</li>)}
    </ul>
);

// --- ACCOUNTS SWITCH ---
// false (2026-11-01): no login, no registration, no profile icon. The account code below (auth, AuthModal, AccessGate,
// /pages/cuenta/) stays in place for v1.2 (Supabase Auth); set to true to show it again. With false: openAuth() does
// nothing, auth.signup/login refuse, /pages/cuenta/ shows «próximamente» and bookings go through WhatsApp.
const ACCOUNTS_ENABLED = false;

// Opening hours by day (the same values drive the booking agenda in public/db/tratamientos.json).
const OPENING_HOURS = [
    ['Lunes', '8:00 – 20:00'], ['Martes', '8:00 – 20:00'], ['Miércoles', '8:00 – 20:00'], ['Jueves', '8:00 – 20:00'],
    ['Viernes', '8:00 – 20:00'], ['Sábado', '10:00 – 16:00'], ['Domingo', '10:00 – 16:00'],
];

const waLink = (text = 'Hola, quiero agendar una cita en Individuel Genève.') => `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(text)}`;

// Main menu (desktop and mobile). «Menú de servicios» (/pages/tratamientos/) is hidden here on purpose; the page stays
// reachable from the home page (hero, services section, «Agendar valoración») and the WhatsApp calls to action.
// The pink header button is «Promociones» (/pages/promociones/).
const NAV_LINKS = [
    { href: '/pages/tienda/', label: 'Boutique' },
    { href: '/pages/tecnologias/', label: 'Tecnologías' },
    { href: '/pages/blog/', label: 'Blog' },
    { href: '/pages/contacto/', label: 'Contacto' },
];

const isActive = (href) => PATH.startsWith(href.replace(/\/$/, ''));

const formatMXN = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
// Prices the client has not published yet are null.
const formatPrice = (n, fallback = 'Precio a consultar') => (n == null ? fallback : formatMXN(n));

// --- LOCAL STORAGE (every key starts with "ig-") ---
const store = {
    read: (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    write: (key, value) => { localStorage.setItem(key, JSON.stringify(value)); },   // throws if storage is blocked
    remove: (key) => { try { localStorage.removeItem(key); } catch (e) {} },
};

// Subscribe a component to a custom window event and to localStorage changes from other tabs.
const useStoreEvent = (eventName, keys, read) => {
    const [value, setValue] = useState(read);
    useEffect(() => {
        const update = () => setValue(read());
        const onStorage = (e) => { if (keys.includes(e.key)) update(); };
        window.addEventListener(eventName, update);
        window.addEventListener('storage', onStorage);
        return () => { window.removeEventListener(eventName, update); window.removeEventListener('storage', onStorage); };
    }, []);
    return value;
};

// --- TEXT ---
const TXT = {
    login: 'Iniciar sesión', signup: 'Crear cuenta', account: 'Mi cuenta', logout: 'Cerrar sesión', close: 'Cerrar',
    name: 'Nombre', email: 'Email', password: 'Contraseña', passwordHint: 'Mínimo 8 caracteres',
    loginIntro: 'Bienvenida de nuevo. Accede para ver tus pedidos y citas.',
    signupIntro: 'Crea tu cuenta para guardar tu rutina, tus pedidos y tus citas.',
    noAccount: '¿Aún no tienes cuenta?', haveAccount: '¿Ya tienes cuenta?',
    errWrong: 'Email o contraseña incorrectos.', errExists: 'Ya existe una cuenta con ese email.',
    errShort: 'La contraseña debe tener al menos 8 caracteres.',
    errStorage: 'Tu navegador bloquea el almacenamiento local; no se puede iniciar sesión.',
    errCrypto: 'Abre el sitio por https para iniciar sesión.',
    working: 'Un momento...',
    staging: 'Versión de prueba: tu cuenta se guarda solo en este navegador.',
    cookiesTitle: 'Cookies',
    cookiesText: 'Usamos cookies necesarias para que el sitio funcione. Con tu permiso, también para medir y mejorarlo.',
    cookiesAccept: 'Aceptar todas', cookiesReject: 'Solo necesarias', cookiesMore: 'Aviso de privacidad',
};

// --- ACCOUNTS (login / sign up) ---
// STAGING: there is no server yet, so accounts live only in this browser ('ig-users', salted SHA-256) and the session in
// 'ig-session'. Before launch, replace the four functions of `auth` with Supabase Auth (see supabase/README.md):
//   current → supabase.auth.getUser() · signup → auth.signUp() · login → auth.signInWithPassword() · logout → auth.signOut()
// Nothing else in the site needs to change.
const hashPassword = async (password, salt) => {
    if (!window.crypto || !crypto.subtle) throw new Error(TXT.errCrypto);
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
};

const notifyAuth = () => window.dispatchEvent(new Event('ig-auth'));

const auth = {
    current: () => {
        const email = store.read('ig-session', null);
        const user = email && store.read('ig-users', {})[email];
        return user ? { name: user.name, email } : null;
    },
    signup: async ({ name, email, password }) => {
        if (!ACCOUNTS_ENABLED) throw new Error('Las cuentas aún no están disponibles.');
        email = email.trim().toLowerCase();
        if (password.length < 8) throw new Error(TXT.errShort);
        const users = store.read('ig-users', {});
        if (users[email]) throw new Error(TXT.errExists);
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        users[email] = { name: name.trim(), salt, hash: await hashPassword(password, salt), created: new Date().toISOString() };
        try { store.write('ig-users', users); store.write('ig-session', email); } catch (e) { throw new Error(TXT.errStorage); }
        notifyAuth();
        return { name, email };
    },
    login: async ({ email, password }) => {
        if (!ACCOUNTS_ENABLED) throw new Error('Las cuentas aún no están disponibles.');
        email = email.trim().toLowerCase();
        const user = store.read('ig-users', {})[email];
        if (!user || user.hash !== await hashPassword(password, user.salt)) throw new Error(TXT.errWrong);
        try { store.write('ig-session', email); } catch (e) { throw new Error(TXT.errStorage); }
        notifyAuth();
        return { name: user.name, email };
    },
    logout: () => { store.remove('ig-session'); notifyAuth(); },
};

const useUser = () => useStoreEvent('ig-auth', ['ig-session', 'ig-users'], auth.current);

// Any page can ask for the login pop-up: openAuth('login' | 'signup').
const openAuth = (mode = 'login') => { if (ACCOUNTS_ENABLED) window.dispatchEvent(new CustomEvent('ig-open-auth', { detail: mode })); };

// --- ICONS (1.4px line, matches the light type) ---
const Icon = ({ d, className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {d}
    </svg>
);
const IconUser = (p) => <Icon {...p} d={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />;
const IconMenu = (p) => <Icon {...p} d={<path d="M4 8h16M4 16h16" />} />;
const IconClose = (p) => <Icon {...p} d={<path d="M6 6l12 12M18 6L6 18" />} />;
const IconArrow = (p) => <Icon {...p} d={<path d="M5 12h14M13 6l6 6-6 6" />} />;
const IconCheck = (p) => <Icon {...p} d={<path d="M5 12.5l4.5 4.5L19 7" />} />;

// --- LOGO ---
// The client's logo (img/logo.webp, ink #2f2f33; img/logo-blanco.webp for dark backgrounds), from the original site.
// Source: IndividuelOperadoPorBELLEZAPROMX.png (transparent PNG, 2500 × 1166), trimmed and resized to 900 px.
const Logo = ({ light = false, className = 'h-14' }) => (
    <a href="/" className="inline-block shrink-0" aria-label={`${BRAND.name}, inicio`}>
        <img src={light ? '/img/logo-blanco.webp' : '/img/logo.webp'} alt={`${BRAND.name} · Operado por BELLEZA PRO MX`}
             width="900" height="408" className={`w-auto ${className}`} />
    </a>
);

// --- AUTH POP-UP ---
const AuthModal = ({ mode, setMode, onClose, locked = false, notice = null, footer = null }) => {
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const isSignup = mode === 'signup';

    useEffect(() => {
        if (locked) return;
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [locked]);

    const submit = async (e) => {
        e.preventDefault();
        setError(''); setBusy(true);
        try {
            await (isSignup ? auth.signup(form) : auth.login(form));
            onClose();
        } catch (err) { setError(err.message); }
        setBusy(false);
    };
    const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fade-in"
             role="dialog" aria-modal="true" aria-labelledby="auth-title"
             onClick={(e) => !locked && e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 md:p-10 animate-rise-in">
                {!locked && (
                    <button onClick={onClose} className="absolute top-5 right-5 text-ink-400 hover:text-ink" aria-label={TXT.close}><IconClose /></button>
                )}
                <div className="text-center mb-8">
                    <p className="font-script text-4xl text-blush-500 mb-1">{isSignup ? 'Bienvenida' : 'Hola de nuevo'}</p>
                    <h2 id="auth-title" className="text-3xl">{isSignup ? TXT.signup : TXT.login}</h2>
                    <p className="text-sm text-ink-400 mt-2">{notice || (isSignup ? TXT.signupIntro : TXT.loginIntro)}</p>
                </div>
                <form onSubmit={submit} className="space-y-4">
                    {isSignup && (
                        <label className="block"><span className="label text-ink-400">{TXT.name}</span>
                            <input className="field mt-2" required autoComplete="name" {...field('name')} /></label>
                    )}
                    <label className="block"><span className="label text-ink-400">{TXT.email}</span>
                        <input className="field mt-2" type="email" required autoComplete="email" {...field('email')} /></label>
                    <label className="block"><span className="label text-ink-400">{TXT.password}</span>
                        <input className="field mt-2" type="password" required minLength={8} placeholder={isSignup ? TXT.passwordHint : ''}
                               autoComplete={isSignup ? 'new-password' : 'current-password'} {...field('password')} /></label>
                    {error && <p className="text-sm text-blush-500" role="alert">{error}</p>}
                    <button className="btn btn-dark w-full !mt-6" disabled={busy}>{busy ? TXT.working : (isSignup ? TXT.signup : TXT.login)}</button>
                </form>
                <p className="text-center text-sm text-ink-400 mt-6">
                    {isSignup ? TXT.haveAccount : TXT.noAccount}{' '}
                    <button className="text-ink underline underline-offset-4" onClick={() => { setError(''); setMode(isSignup ? 'login' : 'signup'); }}>
                        {isSignup ? TXT.login : TXT.signup}
                    </button>
                </p>
                <p className="text-center text-[0.7rem] text-ink-400 mt-4">{TXT.staging}</p>
                {footer}
            </div>
        </div>
    );
};

// --- COOKIE NOTICE ---
const COOKIE_KEY = 'ig-cookies';
window.IG_COOKIES = (store.read(COOKIE_KEY, null) || {}).choice || null;
const hasCookieConsent = () => window.IG_COOKIES === 'all';

const CookieConsent = () => {
    const [open, setOpen] = useState(!window.IG_COOKIES);
    if (!open) return null;
    const choose = (choice) => {
        window.IG_COOKIES = choice;
        try { store.write(COOKIE_KEY, { choice, at: new Date().toISOString() }); } catch (e) {}
        setOpen(false);
    };
    return (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:max-w-sm z-[90] bg-white border border-ink-line rounded-2xl shadow-xl p-6 animate-rise-in" role="dialog" aria-label={TXT.cookiesTitle}>
            <p className="font-serif text-2xl mb-2">{TXT.cookiesTitle}</p>
            <p className="text-sm text-ink-500 mb-4">{TXT.cookiesText} <a href="/pages/privacidad/" className="underline underline-offset-4">{TXT.cookiesMore}</a></p>
            <div className="flex gap-2">
                <button className="btn btn-dark flex-1 !px-4" onClick={() => choose('all')}>{TXT.cookiesAccept}</button>
                <button className="btn btn-light flex-1 !px-4" onClick={() => choose('necessary')}>{TXT.cookiesReject}</button>
            </div>
        </div>
    );
};

// --- REVEAL ON SCROLL ---
const useReveal = () => {
    useEffect(() => {
        const io = new IntersectionObserver((entries) => entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        }), { threshold: 0.12 });
        const scan = () => document.querySelectorAll('.reveal:not(.is-in)').forEach(el => io.observe(el));
        scan();
        const mo = new MutationObserver(scan);
        mo.observe(document.getElementById('root'), { childList: true, subtree: true });
        return () => { io.disconnect(); mo.disconnect(); };
    }, []);
};

// --- LAYOUT ---
const Layout = ({ children }) => {
    const user = useUser();
    const [menuOpen, setMenuOpen] = useState(false);
    const [authMode, setAuthMode] = useState(null);
    const [scrolled, setScrolled] = useState(false);
    useReveal();

    useEffect(() => {
        const onOpen = (e) => setAuthMode(e.detail || 'login');
        const onScroll = () => setScrolled(window.scrollY > 24);
        window.addEventListener('ig-open-auth', onOpen);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => { window.removeEventListener('ig-open-auth', onOpen); window.removeEventListener('scroll', onScroll); };
    }, []);

    useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : ''; }, [menuOpen]);

    const accountButton = user
        ? <a href="/pages/cuenta/" className="flex items-center gap-2 hover:text-blush-500" aria-label={TXT.account}><IconUser /><span className="hidden lg:inline text-sm">{user.name.split(' ')[0]}</span></a>
        : <button onClick={() => setAuthMode('login')} className="hover:text-blush-500" aria-label={TXT.login}><IconUser /></button>;

    return (
        <div className="min-h-screen flex flex-col">
            <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] bg-white px-4 py-2 rounded">Saltar al contenido</a>

            <div className="bg-ink text-white text-center py-2.5 px-4">
                <p className="label !text-[0.68rem] sm:!text-[0.62rem]"><span className="hidden sm:inline">{BRAND.tagline} · </span>{PATH === '/'
                    ? <a href="/pages/tienda/" className="underline underline-offset-4 hover:text-blush-300">Shop Individuel</a>   /* home = shop only: no booking link */
                    : <a href={waLink()} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-blush-300">Agenda por WhatsApp</a>}</p>
            </div>

            <header className={`sticky top-0 z-50 bg-white/90 backdrop-blur-md transition-shadow ${scrolled ? 'shadow-[0_1px_0_#ebe5e6]' : ''}`}>
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 md:h-24 flex items-center justify-between gap-6">
                    <button className="xl:hidden p-2.5 -ml-2.5" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><IconMenu className="w-6 h-6" /></button>

                    <div className="xl:order-first"><Logo className="h-12 md:h-[3.75rem]" /></div>

                    <nav className="hidden xl:flex items-center gap-7" aria-label="Principal">
                        {NAV_LINKS.map(l => (
                            <a key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}
                               className={`label whitespace-nowrap transition-colors ${isActive(l.href) ? 'text-ink border-b border-blush-400 pb-1' : 'text-ink-400 hover:text-ink'}`}>{l.label}</a>
                        ))}
                    </nav>

                    <div className="flex items-center gap-5 md:gap-7">
                        <a href="/pages/promociones/" aria-current={isActive('/pages/promociones/') ? 'page' : undefined} className="hidden lg:inline-flex btn btn-blush !py-3 !px-5">Promociones</a>
                        {ACCOUNTS_ENABLED && accountButton}
                    </div>
                </div>
            </header>

            {menuOpen && (
                <div className="fixed inset-0 z-[70] bg-white animate-fade-in flex flex-col" role="dialog" aria-modal="true" aria-label="Menú">
                    <div className="h-20 px-4 flex items-center justify-between">
                        <Logo className="h-12" />
                        <button onClick={() => setMenuOpen(false)} aria-label={TXT.close}><IconClose className="w-6 h-6" /></button>
                    </div>
                    <nav className="flex-1 flex flex-col items-center justify-center gap-7 overflow-y-auto py-8">
                        {NAV_LINKS.map(l => <a key={l.href} href={l.href} className="font-serif text-4xl">{l.label}</a>)}
                        <a href="/pages/promociones/" className="btn btn-blush mt-4">Promociones</a>
                        {ACCOUNTS_ENABLED && (user
                            ? <a href="/pages/cuenta/" className="label text-ink-400">{TXT.account}</a>
                            : <button onClick={() => { setMenuOpen(false); setAuthMode('login'); }} className="label text-ink-400">{TXT.login}</button>)}
                    </nav>
                </div>
            )}

            <main id="main" className="flex-1">{children}</main>

            <Footer />

            {ACCOUNTS_ENABLED && authMode && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthMode(null)} />}
            {ACCOUNTS_ENABLED && typeof AccessGate !== 'undefined' && <AccessGate />}
            <CookieConsent />
        </div>
    );
};

// Same columns as the original footer.
const FOOTER_COLUMNS = [
    { title: 'Nosotros', links: [
        { href: '/pages/blog/', label: 'Artículos' },
        { href: '/pages/nosotros/', label: 'BELLEZA PRO MX' },
        { href: '/pages/bolsa-de-trabajo/', label: 'Bolsa de trabajo' },
        { href: '/pages/especialistas/', label: 'Especialistas' },
        { href: '/pages/partners/', label: 'Partners' },
    ] },
    { title: 'Nuestras políticas', links: [
        { href: '/pages/terminos/', label: 'Términos y condiciones' },
        { href: '/pages/privacidad/', label: 'Políticas de privacidad' },
        { href: '/pages/protocolo-de-seguridad/', label: 'Protocolo de seguridad' },
        { href: '/pages/devoluciones/', label: 'Políticas de devolución' },
    ] },
    { title: 'Fórmulas', links: [
        { href: '/pages/tienda/', label: 'Advance Pro' },
        { href: '/pages/capsulas/', label: 'Cápsulas' },
        { href: '/pages/ingredientes/', label: 'Ingredientes' },
    ] },
    { title: 'Tecnologías', links: [
        { href: '/pages/tecnologias/ballancer/', label: 'Ballancer Gold' },
        { href: '/pages/tecnologias/mit/', label: 'Tecnología MIT' },
        { href: '/pages/tecnologias/sonnext/', label: 'SonNext' },
    ] },
];

const Footer = () => (
    <footer className="bg-ink text-white/80 mt-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-14 md:py-20 grid grid-cols-2 gap-x-6 gap-y-10 md:gap-12 lg:grid-cols-6">
            <div className="col-span-2">
                <Logo light className="h-24" />
                <p className="mt-6 text-sm max-w-xs leading-relaxed">Distribuidor autorizado de Individuel Genève en México. Cosméticos originales personalizados para todo tipo de piel y tratamientos faciales no invasivos.</p>
                <div className="flex gap-6 mt-6">
                    <a href={waLink()} target="_blank" rel="noopener noreferrer" className="label text-blush-300 hover:text-white">WhatsApp ↗</a>
                    <a href={BRAND.instagram} target="_blank" rel="noopener noreferrer" className="label text-blush-300 hover:text-white">Instagram ↗</a>
                </div>
            </div>
            {FOOTER_COLUMNS.map(col => (
                <div key={col.title}>
                    <p className="label text-white mb-5">{col.title}</p>
                    <ul className="space-y-3 text-sm">
                        {col.links.map(l => <li key={l.href}><a href={l.href} className="hover:text-blush-300">{l.label}</a></li>)}
                    </ul>
                </div>
            ))}
        </div>
        <div className="border-t border-white/10">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 flex flex-col md:flex-row gap-2 justify-between text-xs text-white/60">
                <p>Operado por {BRAND.operator} · {BRAND.address}</p>
                <p>© {new Date().getFullYear()} {BRAND.name} · <a href={`mailto:${BRAND.email}`} className="hover:text-white">{BRAND.email}</a></p>
            </div>
        </div>
    </footer>
);

// --- SHARED SECTIONS ---
const PageHero = ({ eyebrow, title, script, intro, children }) => (
    <section className="wash">
        <div className="max-w-4xl mx-auto px-4 md:px-8 pt-14 pb-12 md:pt-28 md:pb-24 text-center animate-rise-in">
            {eyebrow && <p className="label text-ink-400 mb-6">{eyebrow}</p>}
            <h1 className="text-5xl md:text-7xl leading-[1.05]">
                {title} {script && <span className="font-script text-blush-500 text-[1.15em] block md:inline">{script}</span>}
            </h1>
            {intro && <p className="mt-8 text-lg text-ink-500 max-w-2xl mx-auto leading-relaxed">{intro}</p>}
            {children}
        </div>
    </section>
);

const SectionTitle = ({ kicker, script, children, align = 'center' }) => (
    <div className={`mb-10 md:mb-14 ${align === 'center' ? 'text-center' : ''} reveal`}>
        {kicker && <p className="label text-ink-400 mb-4">{kicker}</p>}
        <h2 className="text-4xl md:text-5xl leading-tight">{children} {script && <span className="font-script text-blush-500">{script}</span>}</h2>
    </div>
);

// --- PUBLIC DATA (static JSON in /public/db; see public/db/README.md) ---
const DB_BASE = '/public/db';
const jsonCache = {};
const loadJson = (name) => jsonCache[name] || (jsonCache[name] =
    fetch(`${DB_BASE}/${name}.json`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); }));

// { status: 'loading' | 'ready' | 'error', data }
const useJson = (name) => {
    const [state, setState] = useState({ status: 'loading', data: null });
    useEffect(() => {
        let alive = true;
        loadJson(name).then(data => alive && setState({ status: 'ready', data }))
            .catch(err => { console.error(`[datos] ${name}:`, err); alive && setState({ status: 'error', data: null }); });
        return () => { alive = false; };
    }, [name]);
    return state;
};

const Img = ({ src, alt = '', className = '', ...rest }) => (
    <img src={src} alt={alt} loading="lazy" decoding="async" className={className} {...rest} />
);

// Rich text from the migrated posts: [{ t: 'h' | 'p' | 'li' | 'quote' | 'img', v }]. Consecutive li become one list.
const Blocks = ({ blocks, className = '' }) => {
    const out = [];
    blocks.forEach((b, i) => {
        if (b.t === 'li') {
            const last = out[out.length - 1];
            if (last && last.list) last.items.push(b); else out.push({ list: true, key: i, items: [b] });
        } else out.push({ ...b, key: i });
    });
    return (
        <div className={`space-y-5 text-ink-500 leading-relaxed ${className}`}>
            {out.map(b => b.list
                ? <ul key={b.key} className="list-disc pl-6 space-y-2">{b.items.map((x, j) => <li key={j}>{x.v}</li>)}</ul>
                : b.t === 'h' ? <h2 key={b.key} className="text-3xl text-ink !mt-10">{b.v}</h2>
                : b.t === 'quote' ? <blockquote key={b.key} className="font-serif text-2xl text-ink border-l-2 border-blush-300 pl-6">{b.v}</blockquote>
                : b.t === 'img' ? <Img key={b.key} src={b.v} className="w-full rounded-3xl !my-10" />
                : <p key={b.key} className="whitespace-pre-line">{b.v}</p>)}
        </div>
    );
};

// Call to action used at the end of most pages.
const WhatsAppCTA = ({ title = '¿Necesitas ayuda?', text = 'Agenda una valoración para platicar opciones de tratamiento.', message }) => (
    <section className="max-w-4xl mx-auto px-4 md:px-8 py-14 md:py-20 text-center reveal">
        <p className="font-script text-5xl text-blush-500">{title}</p>
        <p className="text-ink-500 mt-4 max-w-xl mx-auto">{text}</p>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
            <a href={waLink(message)} target="_blank" rel="noopener noreferrer" className="btn btn-dark">WhatsApp</a>
            <a href="/pages/tratamientos/?tratamiento=valoracion#reservar" className="btn btn-light">Agendar valoración</a>
        </div>
    </section>
);

// Legal pages (terms, privacy, returns). sections: [{ id, title, body: [string | string[] (list)] }].
// Text in [brackets] is a pending value, highlighted until filled in.
const Mark = ({ children }) => String(children).split(/(\[[^\]]+\])/g)
    .map((p, i) => p.startsWith('[') ? <mark key={i} className="bg-blush-200 px-1 rounded">{p}</mark> : p);

const LegalPage = ({ eyebrow, title, script, intro, sections }) => (
    <>
        <PageHero eyebrow={eyebrow} title={title} script={script} intro={intro} />
        <section className="max-w-6xl mx-auto px-4 md:px-8 pb-16 grid md:grid-cols-4 gap-12">
            <nav className="hidden md:block md:sticky md:top-32 self-start text-sm space-y-3" aria-label="Índice">
                {sections.map(s => <a key={s.id} href={`#${s.id}`} className="block text-ink-400 hover:text-ink">{s.title}</a>)}
            </nav>
            <div className="md:col-span-3 space-y-14">
                {sections.map(s => (
                    <article key={s.id} id={s.id} className="scroll-mt-32">
                        <h2 className="text-3xl mb-4">{s.title}</h2>
                        <div className="space-y-4 text-ink-500 leading-relaxed">
                            {s.body.map((p, i) => Array.isArray(p)
                                ? <ul key={i} className="list-disc pl-6 space-y-2">{p.map((x, j) => <li key={j}><Mark>{x}</Mark></li>)}</ul>
                                : <p key={i}><Mark>{p}</Mark></p>)}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    </>
);

const renderPage = (Page) => {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <Layout>
            <Page />
        </Layout>
    );
};
