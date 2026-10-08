// Booking only (/pages/tratamientos/, /pages/cuenta/, home teaser). Load after layout.jsx and acceso.jsx.
// Data layer (agenda), availability rules and the booking wizard.

// --- DATA LAYER ---
// STAGING: treatments and opening hours come from /public/db/tratamientos.json; appointments live in this browser
// ('ig-citas'), so two visitors cannot see each other's bookings yet.
// Launch: replace the bodies of agenda.* with Supabase calls (supabase/README.md). `appointments` has an exclusion
// constraint that rejects overlapping bookings in the database itself, so double-booking stays impossible even
// if two people confirm the same slot at the same moment.
let agendaPromise = null;
const agenda = {
    config: () => agendaPromise || (agendaPromise =
        fetch('/public/db/tratamientos.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(d => ({ schedule: d.schedule, treatments: d.treatments.filter(t => t.active !== false).sort((a, b) => a.sort_order - b.sort_order) }))),

    // Busy intervals for a day: [{ start, end }] in minutes from midnight.
    busy: async (date) => store.read('ig-citas', [])
        .filter(a => a.date === date && a.status !== 'cancelada')
        .map(a => ({ start: toMin(a.time), end: toMin(a.time) + a.duration_min })),

    book: async (appointment) => {
        const all = store.read('ig-citas', []);
        const clash = all.some(a => a.date === appointment.date && a.status !== 'cancelada'
            && overlaps(toMin(a.time), toMin(a.time) + a.duration_min, toMin(appointment.time), toMin(appointment.time) + appointment.duration_min));
        if (clash) throw new Error('Ese horario se acaba de ocupar. Elige otro, por favor.');
        const saved = { ...appointment, id: `CITA-${Date.now().toString(36).toUpperCase()}`, status: 'confirmada', created_at: new Date().toISOString() };
        try { store.write('ig-citas', [...all, saved]); } catch (e) { throw new Error(TXT.errStorage); }
        window.dispatchEvent(new Event('ig-citas'));
        return saved;
    },

    mine: async (email) => store.read('ig-citas', []).filter(a => a.email === email).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),

    cancel: async (id, email) => {
        const all = store.read('ig-citas', []).map(a => (a.id === id && a.email === email ? { ...a, status: 'cancelada' } : a));
        try { store.write('ig-citas', all); } catch (e) {}
        window.dispatchEvent(new Event('ig-citas'));
    },
};

// --- TIME HELPERS (dates as 'YYYY-MM-DD', times as 'HH:MM', in the studio's local time) ---
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const longDate = (iso) => parseDate(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

// Bookable dates: opening days inside the booking window, minus closed dates.
const bookableDates = (schedule, from = new Date()) => {
    const out = [];
    for (let i = 0; i <= schedule.booking_window_days; i++) {
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
        if (schedule.days.includes(d.getDay()) && !schedule.closed_dates.includes(isoDate(d))) out.push(isoDate(d));
    }
    return out;
};

// Free start times for a treatment on a date, honouring cabins, opening hours and minimum notice.
const freeSlots = (schedule, treatment, date, busy, now = new Date()) => {
    const open = toMin(schedule.open), close = toMin(schedule.close);
    const earliest = new Date(now.getTime() + schedule.min_notice_hours * 3600e3);
    const slots = [];
    for (let t = open; t + treatment.duration_min <= close; t += schedule.slot_min) {
        const start = parseDate(date); start.setMinutes(t);
        if (start < earliest) continue;
        const taken = busy.filter(b => overlaps(b.start, b.end, t, t + treatment.duration_min)).length;
        if (taken < schedule.cabins) slots.push(toHHMM(t));
    }
    return slots;
};

const useAgenda = () => {
    const [state, setState] = useState({ status: 'loading', schedule: null, treatments: [] });
    useEffect(() => {
        agenda.config().then(d => setState({ status: 'ready', ...d })).catch(() => setState(s => ({ ...s, status: 'error' })));
    }, []);
    return state;
};

// --- WIZARD ---
const STEPS = ['Tratamiento', 'Fecha y hora', 'Tus datos', 'Listo'];

const Steps = ({ current }) => (
    <ol className="flex justify-center gap-2 md:gap-6 mb-12" aria-label="Pasos de la reserva">
        {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 label ${i <= current ? 'text-ink' : 'text-ink-400/60'}`} aria-current={i === current ? 'step' : undefined}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[0.65rem] tracking-normal ${i < current ? 'bg-ink text-white' : i === current ? 'bg-blush-200 text-ink' : 'border border-ink-line'}`}>
                    {i < current ? <IconCheck className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
            </li>
        ))}
    </ol>
);

const BookingWizard = ({ initialTreatment = null }) => {
    const { status, schedule, treatments } = useAgenda();
    const user = useUser();
    const [step, setStep] = useState(0);
    const [treatment, setTreatment] = useState(null);
    const [date, setDate] = useState(null);
    const [time, setTime] = useState(null);
    const [slots, setSlots] = useState([]);
    const [form, setForm] = useState({ phone: '', notes: '', consent: false });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);

    const dates = useMemo(() => (schedule ? bookableDates(schedule) : []), [schedule]);

    // Preselect from ?tratamiento=<id> or a card click.
    useEffect(() => {
        if (status !== 'ready') return;
        const id = initialTreatment || new URLSearchParams(window.location.search).get('tratamiento');
        const t = treatments.find(x => x.id === id);
        if (t) { setTreatment(t); setStep(1); }
    }, [status, initialTreatment]);

    useEffect(() => {
        if (!treatment || !date) { setSlots([]); return; }
        agenda.busy(date).then(b => setSlots(freeSlots(schedule, treatment, date, b)));
    }, [treatment, date]);

    if (status === 'loading') return <div className="h-64 rounded-3xl bg-blush-50 animate-pulse" />;
    if (status === 'error') return <p className="text-center text-ink-400">No pudimos cargar la agenda. Recarga la página.</p>;

    const confirm = async (e) => {
        e.preventDefault();
        if (!user) { openAuth('signup'); return; }
        setError(''); setBusy(true);
        try {
            const saved = await agenda.book({
                treatment_id: treatment.id, treatment_name: treatment.name, duration_min: treatment.duration_min, price_mxn: treatment.price_mxn,
                date, time, name: user.name, email: user.email, phone: form.phone.trim(), notes: form.notes.trim(),
            });
            setDone(saved); setStep(3);
        } catch (err) { setError(err.message); }
        setBusy(false);
    };

    const card = 'bg-white border border-ink-line rounded-3xl p-6 md:p-10';

    return (
        <div>
            <Steps current={step} />

            {step === 0 && (
                <div className="grid md:grid-cols-2 gap-5 animate-rise-in">
                    {treatments.map(t => (
                        <button key={t.id} onClick={() => { setTreatment(t); setDate(null); setTime(null); setStep(1); }}
                            className={`text-left ${card} hover:border-blush-400 transition-colors`}>
                            <div className="flex justify-between items-baseline gap-4">
                                <h3 className="text-3xl">{t.name}</h3>
                                <span className="font-serif text-xl whitespace-nowrap">{formatMXN(t.price_mxn)}</span>
                            </div>
                            <p className="label text-ink-400 mt-2">{t.duration_min} min · {t.ideal_for}</p>
                            <p className="text-ink-500 mt-4">{t.short}</p>
                        </button>
                    ))}
                </div>
            )}

            {step === 1 && treatment && (
                <div className={`${card} animate-rise-in`}>
                    <div className="flex flex-wrap justify-between items-baseline gap-2 mb-8">
                        <h3 className="text-3xl">{treatment.name} <span className="label text-ink-400 ml-2">{treatment.duration_min} min</span></h3>
                        <button className="label text-ink-400 hover:text-ink" onClick={() => setStep(0)}>Cambiar tratamiento</button>
                    </div>
                    <p className="label text-ink-400 mb-4">Elige el día</p>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                        {dates.map(d => {
                            const dt = parseDate(d);
                            return (
                                <button key={d} onClick={() => { setDate(d); setTime(null); }} aria-pressed={date === d}
                                    className={`shrink-0 w-[4.5rem] py-3 rounded-2xl border text-center transition-colors ${date === d ? 'bg-ink text-white border-ink' : 'border-ink-line hover:border-blush-400'}`}>
                                    <span className="block label !text-[0.6rem]">{dt.toLocaleDateString('es-MX', { weekday: 'short' })}</span>
                                    <span className="block font-serif text-2xl">{dt.getDate()}</span>
                                    <span className="block text-[0.65rem] opacity-70">{dt.toLocaleDateString('es-MX', { month: 'short' })}</span>
                                </button>
                            );
                        })}
                    </div>
                    {date && (
                        <div className="mt-8 animate-fade-in">
                            <p className="label text-ink-400 mb-4">Horarios disponibles · {longDate(date)}</p>
                            {slots.length === 0
                                ? <p className="text-ink-500">No quedan horarios este día. Prueba con otra fecha.</p>
                                : <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                                    {slots.map(s => (
                                        <button key={s} onClick={() => setTime(s)} aria-pressed={time === s}
                                            className={`py-2.5 rounded-full border text-sm transition-colors ${time === s ? 'bg-blush-200 border-blush-300' : 'border-ink-line hover:border-blush-400'}`}>{s}</button>
                                    ))}
                                </div>}
                        </div>
                    )}
                    <div className="flex justify-end mt-10">
                        <button className="btn btn-dark" disabled={!date || !time} onClick={() => setStep(2)}>Continuar <IconArrow className="w-4 h-4" /></button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <form onSubmit={confirm} className={`${card} grid md:grid-cols-5 gap-10 animate-rise-in`}>
                    <div className="md:col-span-3 space-y-5">
                        {user
                            ? <p className="text-ink-500">Reservas como <strong className="font-medium text-ink">{user.name}</strong> ({user.email}).</p>
                            : <div className="rounded-2xl bg-blush-50 p-5">
                                <p className="text-ink-500">Para confirmar tu cita necesitas una cuenta: así podrás verla, cambiarla o cancelarla.</p>
                                <div className="flex gap-3 mt-4">
                                    <button type="button" className="btn btn-dark !py-3" onClick={() => openAuth('signup')}>Crear cuenta</button>
                                    <button type="button" className="btn btn-light !py-3" onClick={() => openAuth('login')}>Iniciar sesión</button>
                                </div>
                              </div>}
                        <label className="block"><span className="label text-ink-400">Teléfono (WhatsApp)</span>
                            <input className="field mt-2" type="tel" required autoComplete="tel" pattern="[\d\s\(\)\+\-]{10,}" value={form.phone}
                                   onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
                        <label className="block"><span className="label text-ink-400">¿Algo que debamos saber? (opcional)</span>
                            <textarea className="field mt-2" rows="3" maxLength={500} placeholder="Alergias, tratamientos recientes, embarazo…" value={form.notes}
                                      onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
                        <label className="flex gap-3 text-sm text-ink-500">
                            <input type="checkbox" required checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} className="mt-1 accent-[#2f2f33]" />
                            <span>He leído el <a href="/pages/privacidad/" className="underline underline-offset-4">aviso de privacidad</a> y la <a href="/pages/terminos/#citas" className="underline underline-offset-4">política de cancelación</a> (24 h de antelación).</span>
                        </label>
                        {error && <p className="text-sm text-blush-500" role="alert">{error}</p>}
                    </div>
                    <aside className="md:col-span-2 rounded-2xl bg-blush-50 p-6 self-start">
                        <p className="label text-ink-400">Tu cita</p>
                        <p className="font-serif text-3xl mt-3">{treatment.name}</p>
                        <p className="text-ink-500 mt-2 first-letter:uppercase">{longDate(date)}</p>
                        <p className="text-ink-500">{time} – {toHHMM(toMin(time) + treatment.duration_min)} h</p>
                        <p className="font-serif text-2xl mt-6 pt-4 border-t border-blush-200">{formatMXN(treatment.price_mxn)}</p>
                        <p className="text-xs text-ink-400 mt-1">Se paga en cabina.</p>
                        <div className="flex flex-col gap-2 mt-6">
                            <button className="btn btn-dark w-full" disabled={busy}>{busy ? TXT.working : 'Confirmar cita'}</button>
                            <button type="button" className="label text-ink-400 hover:text-ink py-2" onClick={() => setStep(1)}>← Cambiar horario</button>
                        </div>
                    </aside>
                </form>
            )}

            {step === 3 && done && (
                <div className={`${card} text-center animate-rise-in`}>
                    <p className="font-script text-5xl text-blush-500">Te esperamos</p>
                    <h3 className="text-4xl mt-2">Cita confirmada</h3>
                    <p className="text-ink-500 mt-6 first-letter:uppercase">{done.treatment_name} · {longDate(done.date)} · {done.time} h</p>
                    <p className="text-sm text-ink-400 mt-2">Referencia {done.id} · {BRAND.address}</p>
                    <div className="flex flex-wrap justify-center gap-3 mt-10">
                        <a href="/pages/cuenta/" className="btn btn-dark">Ver mis citas</a>
                        <button className="btn btn-light" onClick={() => { setStep(0); setTreatment(null); setDate(null); setTime(null); setDone(null); }}>Reservar otra</button>
                    </div>
                </div>
            )}
        </div>
    );
};
