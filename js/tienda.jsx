// Shop only (index, /pages/tienda/, product pages, /pages/ingredientes/).
// Data layer (db), catalogue hook, product image, «Comprar ahora» (Stripe Payment Links), cards and product page.
// No cart: each product is bought on its own through its Stripe Payment Link.
// Catalogue: the Advance Pro line, migrated from the Squarespace export (public/db/productos.json).

// --- DATA LAYER ---
// The ONLY place that knows where shop data comes from. Today: static JSON in /public/db (loadJson, js/layout.jsx).
// Launch: replace the bodies of db.* with Supabase queries (supabase/README.md) and keep the same return shapes.
const db = {
    // { categories, products, ingredients } with inactive products filtered out.
    catalog: () => Promise.all([loadJson('categorias'), loadJson('productos'), loadJson('ingredientes')]).then(([c, p, i]) => ({
        categories: [...c.categories].sort((a, b) => a.sort_order - b.sort_order),
        products: p.products.filter(x => x.active !== false),
        ingredients: i.ingredients,
    })),
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

const primaryCategory = (catalog, p) => catalog.category[p.category_ids[0]];

// --- PRODUCT IMAGE ---
// images[0] is the packshot, images[1] the information card from the original boutique.
const ProductImage = ({ product, index = 0, className = '' }) => (
    product.images && product.images[index]
        ? <Img src={product.images[index]} alt={`${product.name} Individuel Genève${product.size ? ` ${product.size}` : ''}${index ? ' · información del producto' : ''}`} className={`object-contain mix-blend-multiply ${className}`} />
        : <div className={`flex items-center justify-center font-script text-3xl text-blush-500 ${className}`}>Individuel</div>
);

// --- BUY NOW (Stripe Payment Links) ---
// One Payment Link per product, created in the Stripe Dashboard (Products → Payment Links) with the price in MXN,
// shipping address collection and, if wanted, adjustable quantity. Paste its URL in `stripe_url` (productos.json).
// After payment, set the link's confirmation page to redirect to https://individuelgeneve.com.mx/pages/gracias/.
// Stripe sends the receipt; orders and payments are managed in the Stripe Dashboard, not on this site.
// Only https://buy.stripe.com/ links are accepted, so an edited JSON cannot send buyers elsewhere.
// Without a link the button falls back to ordering by WhatsApp.
const STRIPE_LINK_PREFIX = 'https://buy.stripe.com/';

const checkoutUrl = (product, user) => {
    if (typeof product.stripe_url !== 'string' || !product.stripe_url.startsWith(STRIPE_LINK_PREFIX)) return null;
    const url = new URL(product.stripe_url);
    url.searchParams.set('client_reference_id', product.sku.replace(/[^A-Za-z0-9_-]/g, '_'));   // shows the SKU on the payment
    url.searchParams.set('locale', 'es-419');
    if (user) url.searchParams.set('prefilled_email', user.email);
    return url.toString();
};

const BuyButton = ({ product, className = '', compact = false }) => {
    const user = useUser();
    if (product.stock <= 0) return <button className={`btn btn-light ${className}`} disabled>Agotado</button>;
    const url = checkoutUrl(product, user);
    if (url) return <a href={url} className={`btn btn-dark ${className}`}>Comprar ahora</a>;
    return (
        <a href={waLink(`Hola, quiero comprar ${product.name} (${product.sku}).`)} target="_blank" rel="noopener noreferrer" className={`btn btn-light ${className}`}>
            {compact ? 'Pedir' : 'Pedir por WhatsApp'}
        </a>
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
    const soldOut = product.stock <= 0;
    return (
        <article className="group reveal flex flex-col">
            <a href={`/pages/tienda/${product.slug}/`} className="block relative rounded-3xl bg-blush-50 aspect-[4/5] overflow-hidden">
                <ProductImage product={product} className="absolute inset-0 w-full h-full p-4 transition-transform duration-700 group-hover:scale-[1.04]" />
                {product.size && <span className="absolute top-5 left-5 label text-ink-400">{product.size}</span>}
                {soldOut && <span className="absolute top-5 right-5 label bg-white px-3 py-1.5 rounded-full">Agotado</span>}
            </a>
            <div className="pt-5 flex-1 flex flex-col">
                <p className="label text-ink-400">{product.line}{category ? ` · ${category.label}` : ''}</p>
                <h3 className="text-2xl mt-2"><a href={`/pages/tienda/${product.slug}/`} className="hover:text-blush-500">{product.name}</a></h3>
                <p className="text-sm text-ink-500 mt-1 flex-1 line-clamp-2">{product.description}</p>
                <div className="flex items-center justify-between gap-3 mt-5">
                    <span className={product.price_mxn == null ? 'text-sm text-ink-400' : 'font-serif text-xl'}>{formatPrice(product.price_mxn)}</span>
                    <BuyButton product={product} compact className="!py-2.5 !px-4 shrink-0" />
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
    const [shown, setShown] = useState(0);
    const [tab, setTab] = useState('descripcion');

    if (catalog.status === 'loading') return <div className="max-w-6xl mx-auto px-4 py-24"><ProductGridSkeleton n={2} /></div>;
    if (catalog.status === 'error') return <LoadError />;
    if (!product) return (
        <PageHero eyebrow="Boutique" title="Producto" script="no encontrado" intro="Puede que ya no esté disponible.">
            <a href="/pages/tienda/" className="btn btn-dark mt-10">Ver la boutique</a>
        </PageHero>
    );

    const cat = primaryCategory(catalog, product);
    const note = stockNote(product.stock);
    const ingredients = product.ingredient_ids.map(id => catalog.ingredient[id]).filter(Boolean);
    const related = catalog.products.filter(p => p.id !== product.id && p.category_ids.some(c => product.category_ids.includes(c))).slice(0, 4);
    const tabs = [
        { id: 'descripcion', label: 'Descripción', body: <p>{product.description}</p> },
        ingredients.length > 0 && { id: 'activos', label: 'Activos', body: (
            <ul className="space-y-4">{ingredients.map(i => (
                <li key={i.id}><a href={`/pages/ingredientes/#${i.id}`} className="font-serif text-xl hover:text-blush-500">{i.name}</a>
                    <span className="label text-ink-400 ml-3">{i.family}</span><p className="text-sm text-ink-500 mt-1">{i.what}</p>
                    {i.caution && <p className="text-sm text-blush-500 mt-1">{i.caution}</p>}</li>
            ))}</ul>) },
        { id: 'detalles', label: 'Detalles', body: (
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
                <dt className="text-ink-400">Línea</dt><dd>{product.line}</dd>
                {product.size && <><dt className="text-ink-400">Contenido</dt><dd>{product.size}</dd></>}
                <dt className="text-ink-400">SKU</dt><dd>{product.sku}</dd>
                <dt className="text-ink-400">Categorías</dt><dd>{product.category_ids.map(c => catalog.category[c]?.label).filter(Boolean).join(' · ')}</dd>
            </dl>) },
    ].filter(Boolean);

    return (
        <>
            <section className="max-w-7xl mx-auto px-4 md:px-8 pt-8 md:pt-14 pb-16 grid md:grid-cols-2 gap-10 md:gap-20 items-start">
                <div className="md:sticky md:top-32 animate-fade-in">
                    <div className="rounded-[2rem] bg-blush-50 aspect-square relative overflow-hidden">
                        <ProductImage product={product} index={shown} className="absolute inset-0 w-full h-full p-6" />
                    </div>
                    {product.images.length > 1 && (
                        <div className="flex gap-3 mt-4">
                            {product.images.map((src, i) => (
                                <button key={src} onClick={() => setShown(i)} aria-pressed={shown === i} aria-label={`Imagen ${i + 1}`}
                                    className={`w-20 h-20 rounded-2xl bg-blush-50 overflow-hidden border ${shown === i ? 'border-ink' : 'border-transparent'}`}>
                                    <ProductImage product={product} index={i} className="w-full h-full p-1" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="animate-rise-in">
                    <nav className="label text-ink-400 mb-8" aria-label="Ruta">
                        <a href="/pages/tienda/" className="hover:text-ink">Boutique</a>{cat && <> / <a href={`/pages/tienda/?cat=${cat.id}`} className="hover:text-ink">{cat.label}</a></>}
                    </nav>
                    <h1>
                        <span className="block font-script text-4xl text-blush-500">Individuel Genève</span>
                        <span className="block text-5xl md:text-6xl mt-1">{product.name}</span>
                    </h1>
                    <p className="label text-ink-400 mt-2">Línea {product.line}{product.size ? ` · ${product.size}` : ''}</p>
                    {product.actives && <p className="label text-ink-400 mt-5 !tracking-[0.18em] leading-relaxed">{product.actives}</p>}
                    <p className="text-lg text-ink-500 mt-6 leading-relaxed">{product.description}</p>
                    <div className="flex items-baseline justify-between mt-10 pt-6 border-t border-ink-line">
                        <span className={product.price_mxn == null ? 'font-serif text-2xl text-ink-500' : 'font-serif text-4xl'}>{formatPrice(product.price_mxn)}</span>
                        <span className={`label ${note.cls}`}>{note.text}</span>
                    </div>
                    <BuyButton product={product} className="w-full mt-6" />
                    <ClaimsRow className="!justify-start mt-6 !text-[0.62rem]" />
                    <p className="text-xs text-ink-400 mt-4 text-center">
                        {checkoutUrl(product, null)
                            ? 'Pago seguro con Stripe. Recibirás tu recibo por correo electrónico.'
                            : 'Te confirmamos precio, envío y forma de pago por WhatsApp.'}{' '}
                        <a href={waLink(`Hola, quiero información de ${product.name} (${product.sku}).`)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">¿Dudas? Escríbenos</a>
                    </p>

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
                    <SectionTitle kicker="De la misma categoría" script="rutina">Completa tu</SectionTitle>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
                        {related.map(p => <ProductCard key={p.id} product={p} category={primaryCategory(catalog, p)} />)}
                    </div>
                </section>
            )}
        </>
    );
};

const renderProduct = () => renderPage(ProductPage);
