// Shop only (index, /pages/tienda/, product pages, /pages/ingredientes/, /pages/promociones/).
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
// images[0] is the packshot (white background, used by every card), images[1] the information card from the original boutique.
// commercial_image (optional) is the studio photo: the main image of the product page; the packshot stays as a white thumbnail.
// Product page gallery: [{ src, alt, kind: 'photo' | 'packshot' | 'info' }], commercial photo first when there is one.
const productGallery = (p) => [
    p.commercial_image && { src: p.commercial_image, kind: 'photo', alt: `${p.name} Individuel Genève${p.size ? ` ${p.size}` : ''}, fotografía de producto` },
    p.images[0] && { src: p.images[0], kind: 'packshot', alt: `${p.name} Individuel Genève${p.size ? ` ${p.size}` : ''}` },
    ...p.images.slice(1).map(src => ({ src, kind: 'info', alt: `${p.name} Individuel Genève · información del producto` })),
].filter(Boolean);

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

// --- COUPONS (public/db/cupones.json, page /pages/promociones/) ---
// «Usar cupón» stores the code in 'ig-cupon'. When it applies to a product, «Comprar ahora» opens the Payment Link with
// ?prefilled_promo_code=<code> and the WhatsApp order mentions it. Stripe validates the code (it must exist as a Promotion code,
// with the same products and minimum order value), so an edited JSON or localStorage cannot create a discount.
// The Payment Link needs «Allow promotion codes» turned on.
const loadCoupons = () => loadJson('cupones').then(d => ({ groups: d.groups, coupons: d.coupons
    .filter(c => c.active !== false && (!c.valid_until || c.valid_until >= isoToday()))
    .sort((a, b) => a.sort_order - b.sort_order) }));
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const couponApplies = (c, p) => !!c && !!p && (
    c.type === 'producto' ? c.product_slugs.includes(p.slug)
    : (!c.line || p.line === c.line) && (!c.category_ids.length || c.category_ids.some(id => p.category_ids.includes(id))));

const couponStore = {
    read: () => store.read('ig-cupon', null),
    set: (code) => { try { code ? store.write('ig-cupon', code) : store.remove('ig-cupon'); } catch (e) {} window.dispatchEvent(new Event('ig-cupon')); },
};

// The selected coupon object (or null), kept in sync between pages and tabs.
const useCoupon = () => {
    const code = useStoreEvent('ig-cupon', ['ig-cupon'], couponStore.read);
    const [coupons, setCoupons] = useState([]);
    useEffect(() => { if (code) loadCoupons().then(d => setCoupons(d.coupons)).catch(() => {}); }, [code]);
    return code ? coupons.find(c => c.code === code) || null : null;
};

const checkoutUrl = (product, user, coupon = null) => {
    if (typeof product.stripe_url !== 'string' || !product.stripe_url.startsWith(STRIPE_LINK_PREFIX)) return null;
    const url = new URL(product.stripe_url);
    url.searchParams.set('client_reference_id', product.sku.replace(/[^A-Za-z0-9_-]/g, '_'));   // shows the SKU on the payment
    url.searchParams.set('locale', 'es-419');
    if (user) url.searchParams.set('prefilled_email', user.email);
    if (couponApplies(coupon, product)) url.searchParams.set('prefilled_promo_code', coupon.code);
    return url.toString();
};

const BuyButton = ({ product, className = '', compact = false }) => {
    const user = useUser();
    const coupon = useCoupon();
    if (product.stock <= 0) return <button className={`btn btn-light ${className}`} disabled>Agotado</button>;
    const url = checkoutUrl(product, user, coupon);
    if (url) return <a href={url} className={`btn btn-dark ${className}`}>Comprar ahora</a>;
    const withCoupon = couponApplies(coupon, product) ? ` con el cupón ${coupon.code}` : '';
    return (
        <a href={waLink(`Hola, quiero comprar ${product.name}${product.size ? ` ${product.size}` : ''} (${product.sku})${product.price_mxn != null ? `, ${formatMXN(product.price_mxn)}` : ''}${withCoupon}.`)} target="_blank" rel="noopener noreferrer" className={`btn btn-light ${className}`}>
            {compact ? 'Pedir' : 'Pedir por WhatsApp'}
        </a>
    );
};

// Shown under the buy button when the selected coupon applies to this product.
const CouponNote = ({ product }) => {
    const coupon = useCoupon();
    if (!couponApplies(coupon, product)) return null;
    return (
        <p className="mt-4 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-blush-100 px-4 py-3">
            <span>Cupón <b className="font-medium tracking-wider">{coupon.code}</b> · {coupon.discount} · se aplica al pagar</span>
            {coupon.min_purchase_mxn && <span className="text-ink-400">Compra mínima {formatMXN(coupon.min_purchase_mxn)}</span>}
            <button className="label text-ink-400 hover:text-ink ml-auto" onClick={() => couponStore.set(null)}>Quitar</button>
        </p>
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
                <p className="label text-ink-400"><span className="hidden sm:inline">{product.line}{category ? ' · ' : ''}</span>{category ? category.label : product.line}</p>
                <h3 className="text-xl sm:text-2xl mt-2 leading-snug"><a href={`/pages/tienda/${product.slug}/`} className="hover:text-blush-500">{product.name}</a></h3>
                <p className="text-sm text-ink-500 mt-1 flex-1 line-clamp-2">{product.description}</p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-5">
                    <span className={product.price_mxn == null ? 'text-sm text-ink-400' : 'font-serif text-xl'}>{formatPrice(product.price_mxn)}</span>
                    <BuyButton product={product} compact className="!py-3 sm:!py-2.5 !px-4 shrink-0 w-full sm:w-auto" />
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
    const gallery = productGallery(product);
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
                    <div className={`rounded-[2rem] relative overflow-hidden aspect-[4/5] ${gallery[shown].kind === 'photo' ? 'bg-ink-line' : 'bg-white border border-ink-line'}`}>
                        <Img key={gallery[shown].src} src={gallery[shown].src} alt={gallery[shown].alt} loading="eager"
                             className={`absolute inset-0 w-full h-full animate-fade-in ${gallery[shown].kind === 'photo' ? 'object-cover' : 'object-contain p-6'}`} />
                    </div>
                    {gallery.length > 1 && (
                        <div className="flex gap-3 mt-4">
                            {gallery.map((g, i) => (
                                <button key={g.src} onClick={() => setShown(i)} aria-pressed={shown === i} aria-label={`Imagen ${i + 1}: ${g.alt}`}
                                    className={`w-20 h-20 rounded-2xl bg-white overflow-hidden border ${shown === i ? 'border-ink' : 'border-ink-line'}`}>
                                    <Img src={g.src} alt="" className={`w-full h-full ${g.kind === 'photo' ? 'object-cover' : 'object-contain p-1'}`} />
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
                    <CouponNote product={product} />
                    <ClaimsRow align="start" className="mt-6 sm:!text-[0.62rem]" />
                    <p className="text-xs text-ink-400 mt-4 text-center">
                        {checkoutUrl(product, null)
                            ? 'Pago seguro con Stripe. Recibirás tu recibo por correo electrónico.'
                            : product.price_mxn != null ? 'Te confirmamos envío y forma de pago por WhatsApp.' : 'Te confirmamos precio, envío y forma de pago por WhatsApp.'}{' '}
                        <a href={waLink(`Hola, quiero información de ${product.name} (${product.sku}).`)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">¿Dudas? Escríbenos</a>
                    </p>

                    <div className="mt-12">
                        <div className="flex gap-6 border-b border-ink-line" role="tablist">
                            {tabs.map(t => (
                                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                                    className={`label py-3 -mb-px border-b ${tab === t.id ? 'border-ink text-ink' : 'border-transparent text-ink-400'}`}>{t.label}</button>
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
