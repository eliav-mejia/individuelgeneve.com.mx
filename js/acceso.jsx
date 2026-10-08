// Shared by EVERY page, right after layout.jsx: login pop-ups per section. Layout renders <AccessGate /> when it exists.
// required → the page stays behind a pop-up that cannot be closed until the visitor logs in.
// optional → shown once per browser session; it can be closed.
// Never add a rule for /pages/terminos/ or /pages/privacidad/: legal pages must always be reachable.
// NOTE: this is a UX gate, not security. Real protection comes from Supabase RLS (supabase/migrations/), which only
// returns a customer's own orders and appointments, whatever the browser does.

const ACCESS_RULES = [
    { path: '/pages/cuenta/', mode: 'required', notice: 'Inicia sesión para ver tu rutina, tus pedidos y tus citas.' },
];

const ACCESS_TXT = { home: 'Volver al inicio', terms: 'Aviso de privacidad' };

const AccessGate = () => {
    const user = useUser();
    const rule = ACCESS_RULES.find(r => window.location.pathname.startsWith(r.path));
    const seenKey = rule && `ig-access-${rule.path}`;
    const [dismissed, setDismissed] = useState(() => {
        try { return !!(seenKey && sessionStorage.getItem(seenKey)); } catch (e) { return false; }
    });
    const [mode, setMode] = useState('login');

    if (!rule || user || dismissed) return null;

    const close = () => {
        if (rule.mode === 'required') return;
        try { sessionStorage.setItem(seenKey, '1'); } catch (e) {}
        setDismissed(true);
    };

    return (
        <AuthModal mode={mode} setMode={setMode} onClose={close} locked={rule.mode === 'required'} notice={rule.notice}
            footer={rule.mode === 'required' && (
                <div className="flex justify-center gap-6 mt-6 label text-ink-400">
                    <a href="/" className="hover:text-ink">{ACCESS_TXT.home}</a>
                    <a href="/pages/privacidad/" className="hover:text-ink">{ACCESS_TXT.terms}</a>
                </div>
            )} />
    );
};
