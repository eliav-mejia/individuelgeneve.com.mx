// Shop only (index, /pages/tienda/, product pages, /pages/bolsa/, /pages/cuenta/, /pages/ingredientes/).
// Data layer (db), catalogue hook, product illustration, cards, product page, bag and orders.

// --- DATA LAYER ---
// The ONLY place that knows where data comes from. Today: static JSON in /public/db (staging).
// Launch: replace the bodies of db.* with Supabase queries (supabase/README.md) and keep the same return shapes.
const DB_BASE = '/public/db';
const jsonCache = {};
const loadJson = (name) => jsonCache[name] || (jsonCache[name] =
    fetch(`${DB_BASE}/${name}.json`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); }));

const db = {
    // { categories, products, ingredients } with inactive products filtered out.
    catalog: () => Promise.all([loadJson('categorias'), loadJson('productos'), loadJson('ingredientes')]).then(([c, p, i]) => ({
        categories: [...c.categories].sort((a, b) => a.sort_order - b.sort_order),
        products: p.products.filter(x => x.active !== false),
        ingredients: i.ingredients,
    })),

    // STAGING: orders are stored in this browser ('ig-pedidos') and sent by WhatsApp.
    // Launch: insert into `orders` / `order_items` via an Edge Function that re-prices from the DB and opens a
    // Stripe / Mercado Pago checkout. Never trust prices sent by the browser.
    createOrder: async ({ user, lines, subtotal, shipping }) => {
        const order = {
            id: `IG-${Date.now().toString(36).toUpperCase()}`,
            email: user ? user.email : null,
            created_at: new Date().toISOString(),
            status: 'pendiente',
            lines: lines.map(l => ({ id: l.product.id, sku: l.product.sku, name: l.product.name, qty: l.qty, price_mxn: l.product.price_mxn })),
            subtotal, shipping, total: subtotal + shipping,
        };
        const all = store.read('ig-pedidos', []);
        try { store.write('ig-pedidos', [order, ...all]); } catch (e) {}
        return order;
    },
    ordersFor: async (email) => store.read('ig-pedidos', []).filter(o => o.email === email),
};

const useCatalog = () => {
    const [state, setState] = useState({ status: 'loading', categories: [], products: [], ingredients: [] });
    useEffect(() => {
        let alive = true;
        db.catalog()
            .then(data => alive && setState({ status: 'ready', ...data }))
            .catch(err => { console.error('[tienda] No se pudo cargar el catálogo:', err); alive && setState(s => ({ ...s, status: 'error' })); });
        return () => { alive = false; };
    }, []);
    return useMemo(() => ({
        ...state,
        byId: Object.fromEntries(state.products.map(p => [p.id, p])),
        bySlug: Object.fromEntries(state.products.map(p => [p.slug, p])),
        ingredient: Object.fromEntries(state.ingredients.map(i => [i.id, i])),
        category: Object.fromEntries(state.categories.map(c => [c.id, c])),
    }), [state]);
};

// Bag lines with live prices and stock from the catalogue. Quantities above stock are clipped.
const useBagLines = (catalog) => {
    const items = useBag();
    const lines = Object.entries(items)
        .map(([id, qty]) => ({ product: catalog.byId[id], qty }))
        .filter(l => l.product && l.product.stock > 0)
        .map(l => ({ ...l, qty: Math.min(l.qty, l.product.stock) }));
    const subtotal = lines.reduce((s, l) => s + l.qty * l.product.price_mxn, 0);
    const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_MXN ? 0 : SHIPPING_MXN;
    return { lines, subtotal, shipping, total: subtotal + shipping, count: lines.reduce((a, l) => a + l.qty, 0) };
};


const ROUTINE_LABEL = { am: 'Mañana', pm: 'Noche', 'am-pm': 'Mañana y noche' };

const productNumber = (p) => `N°${p.id.slice(-2)}`;

// --- PRODUCT ILLUSTRATION ---
// Drawn in SVG so the catalogue works without photos. To use photos later, add `image` to the product and
// render <img> here when it exists.
const Bottle = ({ product, className = '' }) => {
    const { bottle, tint } = product;
    const ink = '#2f2f33';
    const label = (y, h = 46) => (
        <g>
            <rect x="70" y={y} width="60" height={h} rx="2" fill="#fff" opacity="0.92" />
            <text x="100" y={y + 16} textAnchor="middle" fontFamily="Pinyon Script, cursive" fontSize="13" fill={ink}>Individuel</text>
            <text x="100" y={y + 28} textAnchor="middle" fontFamily="Jost, sans-serif" fontSize="5" letterSpacing="1" fill={ink}
                  {...(product.name.length > 12 ? { textLength: 54, lengthAdjust: 'spacingAndGlyphs' } : {})}>{product.name.toUpperCase()}</text>
            <text x="100" y={y + 38} textAnchor="middle" fontFamily="Jost, sans-serif" fontSize="5" letterSpacing="1" fill="#6e6e74">{product.concentration} · {product.size_ml} ml</text>
        </g>
    );
    const shapes = {
        dropper: <g>
            <rect x="92" y="38" width="16" height="34" rx="8" fill={ink} />
            <rect x="86" y="68" width="28" height="18" rx="2" fill={ink} />
            <rect x="64" y="84" width="72" height="116" rx="10" fill={tint} stroke="#e6d3d6" />
            {label(118)}
        </g>,
        pump: <g>
            <rect x="78" y="40" width="34" height="8" rx="2" fill={ink} />
            <rect x="96" y="46" width="8" height="22" fill={ink} />
            <rect x="84" y="66" width="32" height="16" rx="3" fill={ink} />
            <rect x="62" y="80" width="76" height="122" rx="14" fill={tint} stroke="#e6d3d6" />
            {label(118)}
        </g>,
        jar: <g>
            <rect x="52" y="108" width="96" height="24" rx="4" fill={ink} />
            <rect x="48" y="130" width="104" height="70" rx="16" fill={tint} stroke="#e6d3d6" />
            {label(142)}
        </g>,
        tube: <g>
            <path d="M68 40 h64 l-6 132 h-52z" fill={tint} stroke="#e6d3d6" />
            <rect x="80" y="170" width="40" height="30" rx="4" fill={ink} />
            {label(80)}
        </g>,
        mist: <g>
            <rect x="88" y="34" width="24" height="26" rx="6" fill="#fff" stroke="#e6d3d6" />
            <rect x="84" y="58" width="32" height="20" rx="3" fill={ink} />
            <rect x="66" y="76" width="68" height="126" rx="30" fill={tint} stroke="#e6d3d6" />
            {label(120)}
        </g>,
    };
    return (
        <svg viewBox="0 0 200 220" className={className} role="img" aria-label={`${product.name}, ${product.size_ml} ml`}>
            <ellipse cx="100" cy="206" rx="58" ry="6" fill="#2f2f33" opacity="0.07" />
            {shapes[bottle] || shapes.dropper}
        </svg>
    );
};

// --- STOCK ---
const stockNote = (stock) =>
    stock <= 0 ? { text: 'Agotado', cls: 'text-ink-400' }
    : stock === 1 ? { text: 'Última unidad', cls: 'text-blush-500' }
    : stock <= 3 ? { text: `Solo quedan ${stock}`, cls: 'text-blush-500' }
    : { text: 'Disponible', cls: 'text-ink-400' };

// --- CARD ---
const ProductCard = ({ product, category }) => {
    const [added, setAdded] = useState(false);
    const soldOut = product.stock <= 0;
    const add = () => { bag.add(product.id); setAdded(true); setTimeout(() => setAdded(false), 1600); };
    return (
        <article className="group reveal flex flex-col">
            <a href={`/pages/tienda/${product.slug}/`} className="block relative rounded-3xl bg-blush-50 aspect-[4/5] overflow-hidden">
                <Bottle product={product} className="absolute inset-0 w-full h-full p-8 transition-transform duration-700 group-hover:scale-[1.04]" />
                <span className="absolute top-5 left-5 label text-ink-400">{productNumber(product)}</span>
                {soldOut && <span className="absolute top-5 right-5 label bg-white px-3 py-1.5 rounded-full">Agotado</span>}
            </a>
            <div className="pt-5 flex-1 flex flex-col">
                <p className="label text-ink-400">{category ? category.label : ''} · {product.hero_ingredient}</p>
                <h3 className="text-2xl mt-2"><a href={`/pages/tienda/${product.slug}/`} className="hover:text-blush-500">{product.name}</a></h3>
                <p className="text-sm text-ink-500 mt-1 flex-1">{product.short}</p>
                <div className="flex items-center justify-between mt-5">
                    <span className="font-serif text-xl">{formatMXN(product.price_mxn)}</span>
                    <button onClick={add} disabled={soldOut} className="btn btn-light !py-2.5 !px-4">
                        {soldOut ? 'Agotado' : added ? <><IconCheck className="w-4 h-4" /> Añadido</> : 'Añadir'}
                    </button>
                </div>
            </div>
        </article>
    );
};

const ProductGridSkeleton = ({ n = 4 }) => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
        {Array.from({ length: n }, (_, i) => (
            <div key={i} className="animate-pulse"><div className="rounded-3xl bg-blush-50 aspect-[4/5]" /><div className="h-4 bg-blush-50 rounded mt-5 w-2/3" /><div className="h-6 bg-blush-50 rounded mt-3" /></div>
        ))}
    </div>
);

const LoadError = () => (
    <p className="text-center text-ink-400 py-20">No pudimos cargar el catálogo. Recarga la página en un momento.</p>
);

// --- PRODUCT PAGE ---
// Each /pages/tienda/<slug>/index.html calls renderProduct(); the slug comes from the URL.
const ProductPage = () => {
    const catalog = useCatalog();
    const slug = window.location.pathname.split('/').filter(Boolean).pop();
    const product = catalog.bySlug[slug];
    const [qty, setQty] = useState(1);
    const [added, setAdded] = useState(false);
    const [tab, setTab] = useState('uso');

    if (catalog.status === 'loading') return <div className="max-w-6xl mx-auto px-4 py-24"><ProductGridSkeleton n={2} /></div>;
    if (catalog.status === 'error') return <LoadError />;
    if (!product) return (
        <PageHero eyebrow="Tienda" title="Producto" script="no encontrado" intro="Puede que ya no esté disponible.">
            <a href="/pages/tienda/" className="btn btn-dark mt-10">Ver la tienda</a>
        </PageHero>
    );

    const cat = catalog.category[product.category_id];
    const note = stockNote(product.stock);
    const soldOut = product.stock <= 0;
    const related = catalog.products.filter(p => p.id !== product.id && p.ingredient_ids.some(i => product.ingredient_ids.includes(i) || (catalog.ingredient[i] || {}).pairs_with?.some(x => product.ingredient_ids.includes(x)))).slice(0, 4);
    const add = () => { bag.add(product.id, qty); setAdded(true); setTimeout(() => setAdded(false), 1800); };
    const tabs = [
        { id: 'uso', label: 'Modo de uso', body: <p>{product.how_to_use}</p> },
        { id: 'activos', label: 'Activos', body: (
            <ul className="space-y-4">{product.ingredient_ids.map(id => catalog.ingredient[id]).filter(Boolean).map(i => (
                <li key={i.id}><a href={`/pages/ingredientes/#${i.id}`} className="font-serif text-xl hover:text-blush-500">{i.name}</a>
                    <span className="label text-ink-400 ml-3">{i.family}</span><p className="text-sm text-ink-500 mt-1">{i.what}</p>
                    {i.caution && <p className="text-sm text-blush-500 mt-1">{i.caution}</p>}</li>
            ))}</ul>) },
        { id: 'inci', label: 'Fórmula completa', body: <p className="text-sm leading-relaxed text-ink-500">{product.inci}</p> },
    ];

    return (
        <>
            <section className="max-w-7xl mx-auto px-4 md:px-8 pt-8 md:pt-14 pb-16 grid md:grid-cols-2 gap-10 md:gap-20 items-start">
                <div className="md:sticky md:top-32 rounded-[2rem] bg-blush-50 aspect-square relative animate-fade-in">
                    <Bottle product={product} className="absolute inset-0 w-full h-full p-12 md:p-16" />
                    <span className="absolute top-6 left-6 label text-ink-400">{productNumber(product)}</span>
                </div>
                <div className="animate-rise-in">
                    <nav className="label text-ink-400 mb-8" aria-label="Ruta">
                        <a href="/pages/tienda/" className="hover:text-ink">Tienda</a> / <a href={`/pages/tienda/?cat=${cat.id}`} className="hover:text-ink">{cat.label}</a>
                    </nav>
                    <p className="font-script text-4xl text-blush-500">{product.hero_ingredient}</p>
                    <h1 className="text-5xl md:text-6xl mt-1">{product.name}</h1>
                    <p className="text-lg text-ink-500 mt-6 leading-relaxed">{product.description}</p>
                    <dl className="grid grid-cols-3 gap-4 my-10 py-6 border-y border-ink-line text-center">
                        <div><dt className="label text-ink-400">Contenido</dt><dd className="font-serif text-xl mt-1">{product.size_ml} ml</dd></div>
                        <div><dt className="label text-ink-400">Rutina</dt><dd className="font-serif text-xl mt-1">{ROUTINE_LABEL[product.routine]}</dd></div>
                        <div><dt className="label text-ink-400">Piel</dt><dd className="font-serif text-xl mt-1">{product.skin_types[0]}</dd></div>
                    </dl>
                    <div className="flex items-baseline justify-between">
                        <span className="font-serif text-4xl">{formatMXN(product.price_mxn)}</span>
                        <span className={`label ${note.cls}`}>{note.text}</span>
                    </div>
                    <div className="flex gap-3 mt-6">
                        <div className="flex items-center border border-ink-line rounded-full">
                            <button className="w-11 h-12 text-lg" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Menos" disabled={soldOut}>−</button>
                            <span className="w-6 text-center" aria-live="polite">{qty}</span>
                            <button className="w-11 h-12 text-lg" onClick={() => setQty(q => Math.min(product.stock, q + 1))} aria-label="Más" disabled={soldOut || qty >= product.stock}>+</button>
                        </div>
                        <button className="btn btn-dark flex-1" onClick={add} disabled={soldOut}>
                            {soldOut ? 'Agotado' : added ? <><IconCheck className="w-4 h-4" /> En tu bolsa</> : 'Añadir a la bolsa'}
                        </button>
                    </div>
                    {added && <a href="/pages/bolsa/" className="block text-center label text-ink-400 hover:text-ink mt-4">Ver bolsa →</a>}
                    <p className="text-xs text-ink-400 mt-6">Envío gratis desde {formatMXN(FREE_SHIPPING_MXN)} · Sin perfume añadido · No probado en animales</p>

                    <div className="mt-12">
                        <div className="flex gap-6 border-b border-ink-line" role="tablist">
                            {tabs.map(t => (
                                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                                    className={`label pb-3 -mb-px border-b ${tab === t.id ? 'border-ink text-ink' : 'border-transparent text-ink-400'}`}>{t.label}</button>
                            ))}
                        </div>
                        <div className="pt-6 text-ink-500 leading-relaxed" role="tabpanel">{tabs.find(t => t.id === tab).body}</div>
                    </div>
                </div>
            </section>

            {related.length > 0 && (
                <section className="max-w-7xl mx-auto px-4 md:px-8 py-16">
                    <SectionTitle kicker="Combina bien con" script="tu rutina">Completa</SectionTitle>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
                        {related.map(p => <ProductCard key={p.id} product={p} category={catalog.category[p.category_id]} />)}
                    </div>
                </section>
            )}
        </>
    );
};

const renderProduct = () => renderPage(ProductPage);
