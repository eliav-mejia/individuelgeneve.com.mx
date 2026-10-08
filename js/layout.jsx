// Shared by EVERY page: brand config, header, footer, accounts (staging), bag, cookie notice, PageHero, renderPage().
// Load order on each page: tailwind.config.js → layout.jsx → acceso.jsx → (tienda.jsx | reservas.jsx) → page script.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// --- BRAND ---
const BRAND = {
    name: 'Individuel Genève',
    tagline: 'Cuidado de la piel con activos esenciales',
    email: 'hola@individuelgeneve.com.mx',
    phone: '+52 55 0000 0000',                       // [verificar] número de atención
    whatsapp: '5200000000000',                       // [verificar] solo dígitos, formato internacional
    address: 'Av. Tamaulipas 150, piso 15, Torre B, Ciudad de México, CP 06140',   // [verificar]
    instagram: 'https://www.instagram.com/individuelgeneve.mx/',
    hours: 'Lunes a sábado · 10:00 – 19:00',
};

// Shipping (MXN): flat rate, free from the threshold. Shown in the top banner, the bag and the terms.
const SHIPPING_MXN = 149;
const FREE_SHIPPING_MXN = 1200;

const NAV_LINKS = [
    { href: '/pages/tienda/', label: 'Tienda' },
    { href: '/pages/ingredientes/', label: 'Ingredientes' },
    { href: '/pages/tratamientos/', label: 'Tratamientos' },
];

const isActive = (href) => window.location.pathname.startsWith(href.replace(/\/$/, ''));

const formatMXN = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

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
    cookiesText: 'Usamos cookies necesarias para tu bolsa y tu sesión. Con tu permiso, también para medir y mejorar el sitio.',
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
const openAuth = (mode = 'login') => window.dispatchEvent(new CustomEvent('ig-open-auth', { detail: mode }));

// --- BAG (cart) ---
// { [productId]: quantity } in 'ig-bolsa', synced between tabs. Prices and stock always come from the catalogue
// (js/tienda.jsx), never from here, so an edited localStorage cannot change a price.
const bag = {
    read: () => store.read('ig-bolsa', {}),
    save: (items) => { try { store.write('ig-bolsa', items); } catch (e) {} window.dispatchEvent(new Event('ig-bolsa')); },
    add: (id, qty = 1) => { const items = bag.read(); items[id] = (items[id] || 0) + qty; bag.save(items); },
    set: (id, qty) => { const items = bag.read(); if (qty > 0) items[id] = qty; else delete items[id]; bag.save(items); },
    clear: () => bag.save({}),
};

const useBag = () => useStoreEvent('ig-bolsa', ['ig-bolsa'], bag.read);

// --- ICONS (1.4px line, matches the light type) ---
const Icon = ({ d, className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {d}
    </svg>
);
const IconUser = (p) => <Icon {...p} d={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />;
const IconBag = (p) => <Icon {...p} d={<><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>} />;
const IconMenu = (p) => <Icon {...p} d={<path d="M4 8h16M4 16h16" />} />;
const IconClose = (p) => <Icon {...p} d={<path d="M6 6l12 12M18 6L6 18" />} />;
const IconArrow = (p) => <Icon {...p} d={<path d="M5 12h14M13 6l6 6-6 6" />} />;
const IconCheck = (p) => <Icon {...p} d={<path d="M5 12.5l4.5 4.5L19 7" />} />;

// --- LOGO ---
const Logo = ({ light = false, size = 'text-4xl' }) => (
    <a href="/" className={`inline-flex flex-col items-center leading-none ${light ? 'text-white' : 'text-ink'}`} aria-label={`${BRAND.name}, inicio`}>
        <span className={`font-script ${size}`}>Individuel</span>
        <span className="label !text-[0.55rem] !tracking-[0.5em] -mt-1 pl-[0.5em]">Genève</span>
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
    const items = useBag();
    const count = Object.values(items).reduce((a, b) => a + b, 0);
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
                <p className="label !text-[0.62rem]">Envío gratis desde {formatMXN(FREE_SHIPPING_MXN)} · Fórmulas esenciales, sin perfume añadido</p>
            </div>

            <header className={`sticky top-0 z-50 bg-white/90 backdrop-blur-md transition-shadow ${scrolled ? 'shadow-[0_1px_0_#ebe5e6]' : ''}`}>
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-20 md:h-24 grid grid-cols-3 items-center">
                    <nav className="hidden md:flex items-center gap-8" aria-label="Principal">
                        {NAV_LINKS.map(l => (
                            <a key={l.href} href={l.href} aria-current={isActive(l.href) ? 'page' : undefined}
                               className={`label transition-colors ${isActive(l.href) ? 'text-ink border-b border-blush-400 pb-1' : 'text-ink-400 hover:text-ink'}`}>{l.label}</a>
                        ))}
                    </nav>
                    <button className="md:hidden justify-self-start" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><IconMenu className="w-6 h-6" /></button>

                    <div className="justify-self-center"><Logo size="text-3xl md:text-4xl" /></div>

                    <div className="justify-self-end flex items-center gap-5 md:gap-7">
                        <a href="/pages/tratamientos/#reservar" className="hidden lg:inline-flex btn btn-blush !py-3 !px-5">Reservar cita</a>
                        {accountButton}
                        <a href="/pages/bolsa/" className="relative hover:text-blush-500" aria-label={`Bolsa, ${count} productos`}>
                            <IconBag />
                            {count > 0 && <span className="absolute -top-2 -right-2.5 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-blush-300 text-ink text-[0.65rem] font-medium flex items-center justify-center">{count}</span>}
                        </a>
                    </div>
                </div>
            </header>

            {menuOpen && (
                <div className="fixed inset-0 z-[70] bg-white animate-fade-in flex flex-col" role="dialog" aria-modal="true" aria-label="Menú">
                    <div className="h-20 px-4 flex items-center justify-between">
                        <Logo size="text-3xl" />
                        <button onClick={() => setMenuOpen(false)} aria-label={TXT.close}><IconClose className="w-6 h-6" /></button>
                    </div>
                    <nav className="flex-1 flex flex-col items-center justify-center gap-8">
                        {NAV_LINKS.map(l => <a key={l.href} href={l.href} className="font-serif text-4xl">{l.label}</a>)}
                        <a href="/pages/tratamientos/#reservar" className="btn btn-blush mt-4">Reservar cita</a>
                        {user
                            ? <a href="/pages/cuenta/" className="label text-ink-400">{TXT.account}</a>
                            : <button onClick={() => { setMenuOpen(false); setAuthMode('login'); }} className="label text-ink-400">{TXT.login}</button>}
                    </nav>
                </div>
            )}

            <main id="main" className="flex-1">{children}</main>

            <Footer />

            {authMode && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthMode(null)} />}
            {typeof AccessGate !== 'undefined' && <AccessGate />}
            <CookieConsent />
        </div>
    );
};

const FOOTER_COLUMNS = [
    { title: 'Tienda', links: [
        { href: '/pages/tienda/', label: 'Todos los productos' },
        { href: '/pages/tienda/?cat=tratar', label: 'Sérums' },
        { href: '/pages/tienda/?cat=hidratar', label: 'Hidratación' },
        { href: '/pages/tienda/?cat=proteger', label: 'Protección solar' },
    ] },
    { title: 'La casa', links: [
        { href: '/pages/ingredientes/', label: 'Ingredientes' },
        { href: '/pages/tratamientos/', label: 'Tratamientos en cabina' },
        { href: '/pages/cuenta/', label: 'Mi cuenta' },
    ] },
    { title: 'Legal', links: [
        { href: '/pages/terminos/', label: 'Términos y condiciones' },
        { href: '/pages/privacidad/', label: 'Aviso de privacidad' },
    ] },
];

const Footer = () => (
    <footer className="bg-ink text-white/80 mt-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-20 grid gap-12 md:grid-cols-5">
            <div className="md:col-span-2">
                <Logo light size="text-5xl" />
                <p className="mt-6 text-sm max-w-xs leading-relaxed">{BRAND.tagline}. Pocos ingredientes, en la concentración que funciona, explicados con claridad.</p>
                <a href={BRAND.instagram} target="_blank" rel="noopener noreferrer" className="label inline-block mt-6 text-blush-300 hover:text-white">Instagram ↗</a>
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
                <p>{BRAND.address} · {BRAND.hours}</p>
                <p>© {new Date().getFullYear()} {BRAND.name} · <a href={`mailto:${BRAND.email}`} className="hover:text-white">{BRAND.email}</a></p>
            </div>
        </div>
    </footer>
);

// --- SHARED SECTIONS ---
const PageHero = ({ eyebrow, title, script, intro, children }) => (
    <section className="wash">
        <div className="max-w-4xl mx-auto px-4 md:px-8 pt-20 pb-16 md:pt-28 md:pb-24 text-center animate-rise-in">
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
    <div className={`mb-14 ${align === 'center' ? 'text-center' : ''} reveal`}>
        {kicker && <p className="label text-ink-400 mb-4">{kicker}</p>}
        <h2 className="text-4xl md:text-5xl leading-tight">{children} {script && <span className="font-script text-blush-500">{script}</span>}</h2>
    </div>
);

const renderPage = (Page) => {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <Layout>
            <Page />
        </Layout>
    );
};
