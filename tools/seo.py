#!/usr/bin/env python3
"""SEO for every page: <head> tags, JSON-LD, static HTML for crawlers, sitemap.xml and robots.txt.

    python tools/seo.py          (tools/generar-paginas-producto.py runs it at the end)

Single source of truth for titles and descriptions: PAGES below (static pages) and the product / blog data in
public/db/*.json (generated pages). Safe to re-run: it replaces what it wrote before.

What it writes in each page:
- <head>: <title>, description, robots, canonical, Open Graph, Twitter and one JSON-LD @graph, between
  <!-- seo --> … <!-- /seo -->.
- <div id="root">: between <!--seo-root--> … <!--/seo-root--> a loading ring (.page-loader) on every page and, on the home,
  the shop, every product and every blog post, plain HTML (h1, text, links) in .seo-static for crawlers that do not run
  JavaScript. With JavaScript both are hidden/replaced: <html class="js"> hides .seo-static (css/site.css) and React
  clears #root when it renders, so visitors only see the ring for a moment and then the page.
- One page per old Squarespace URL (MOVED in 404.html) with canonical + meta refresh: permanent redirect that Google
  follows (GitHub Pages has no HTTP 301).
Brand keywords: Individuel Genève / Individuel Geneve, Individuel México, cosméticos Individuel, Shop Individuel,
producto original, distribuidor autorizado, cosméticos personalizados para todo tipo de piel.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://individuelgeneve.com.mx'      # canonical domain (CNAME). The old Squarespace site used www.
TODAY = '2026-11-01'
BRAND = 'Individuel Genève'
DEFAULT_IMAGE = '/img/inicio/01.webp'
NOINDEX = {'pages/cuenta/', 'pages/gracias/'}

ORG = {
    '@type': 'Organization', '@id': f'{SITE}/#organization',
    'name': 'Individuel Genève México', 'alternateName': ['Individuel Geneve', 'Individuel México', 'Individuel Cosméticos'],
    'legalName': 'BELLEZA PRO MX S.A. de C.V.', 'url': f'{SITE}/', 'logo': f'{SITE}/img/logo.webp',
    'description': 'Distribuidor autorizado de Individuel Genève en México: cosméticos originales personalizados para todo tipo de piel.',
    'sameAs': ['https://www.instagram.com/individuelgeneve.mx'],
    'contactPoint': {'@type': 'ContactPoint', 'telephone': '+52-55-2307-6185', 'contactType': 'customer service',
                     'areaServed': 'MX', 'availableLanguage': 'es'},
}
BUSINESS = {
    '@type': 'BeautySalon', '@id': f'{SITE}/#salon',
    'name': 'Individuel Genève Condesa', 'url': f'{SITE}/', 'image': f'{SITE}{DEFAULT_IMAGE}', 'logo': f'{SITE}/img/logo.webp',
    'telephone': '+52-55-2307-6185', 'parentOrganization': {'@id': f'{SITE}/#organization'},
    'address': {'@type': 'PostalAddress', 'streetAddress': 'Av. Tamaulipas 150, piso 15, torre B', 'addressLocality': 'Ciudad de México',
                'addressRegion': 'CDMX', 'postalCode': '06140', 'addressCountry': 'MX'},
    'geo': {'@type': 'GeoCoordinates', 'latitude': 19.4090682, 'longitude': -99.1759227},
    'openingHoursSpecification': [
        {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], 'opens': '08:00', 'closes': '20:00'},
        {'@type': 'OpeningHoursSpecification', 'dayOfWeek': ['Saturday', 'Sunday'], 'opens': '10:00', 'closes': '16:00'},
    ],
}
WEBSITE = {'@type': 'WebSite', '@id': f'{SITE}/#website', 'name': BRAND, 'alternateName': ['Individuel Geneve', 'Shop Individuel', 'Individuel México'],
           'url': f'{SITE}/', 'inLanguage': 'es-MX', 'publisher': {'@id': f'{SITE}/#organization'}}

# path → (title, description, breadcrumb label). Titles ≤ ~65 characters, descriptions ≤ ~160.
PAGES = {
    '': ('Individuel Genève México | Cosméticos originales y faciales',
         'Distribuidor autorizado de Individuel Genève en México: cosméticos originales personalizados para todo tipo de piel y tratamientos faciales en CDMX.', None),
    'pages/tienda/': ('Shop Individuel México | Cosméticos Individuel Genève originales',
                      'Línea Advance Pro en su envase sellado de grado médico. Un producto de Individuel Genéve. Edición limitada en México. Consulta precios y disponibilidad.', 'Shop Individuel'),
    'pages/promociones/': ('Promociones y cupones Individuel Genève | Advance Pro',
                           'Cupones Individuel Genève en México: descuentos en la línea Advance Pro, en compras desde $10,000 y en productos en oferta. Producto original.', 'Promociones'),
    'pages/ingredientes/': ('Ingredientes de los cosméticos Individuel Genève',
                            'Glosario de activos de los cosméticos Individuel Genève Advance Pro: ácido hialurónico, péptidos, vitaminas, niacinamida, AHA y extractos botánicos.', 'Ingredientes'),
    'pages/tratamientos/': ('Tratamientos faciales Individuel Genève en CDMX | Menú de servicios',
                            'Faciales de hidratación, microdermoabrasión, antiedad SonNext y reducción corporal con Ballancer. Dermo-análisis con especialistas certificadas en la Condesa.', 'Menú de servicios'),
    'pages/capsulas/': ('Cápsulas de tratamiento | Individuel Genève México',
                        'Fórmulas de mantenimiento Individuel en cápsulas importadas de un solo uso: Línea Natural, Línea de infusiones y Línea APL.', 'Cápsulas'),
    'pages/tecnologias/': ('Aparatología no invasiva | Individuel Genève México',
                           'Tecnologías de primer nivel en Individuel Genève: SonNext (ultrasonido no térmico), Ballancer Gold (drenaje linfático) y Tecnología MIT.', 'Tecnologías'),
    'pages/tecnologias/sonnext/': ('SonNext: ultrasonido no térmico | Individuel Genève',
                                   'Tratamiento antiedad SonNext en Individuel Genève: ultrasonido terapéutico no térmico para lifting y reducción, sin daño por calor.', 'SonNext'),
    'pages/tecnologias/ballancer/': ('Ballancer Gold: drenaje linfático | Individuel Genève',
                                     'Ballancer Gold en Individuel Genève CDMX: drenaje linfático, reducción de celulitis y moldeado corporal con tecnología patentada aprobada por la FDA.', 'Ballancer Gold'),
    'pages/tecnologias/mit/': ('Tecnología MIT y certificaciones | Individuel Genève',
                               'Tecnología MIT FDA Approved: cuatro tecnologías en un dispositivo y diez cápsulas patentadas. Certificaciones ISO 22716, ISO 9001 e ISO 13485.', 'Tecnología MIT'),
    'pages/especialistas/': ('Especialistas certificadas | Individuel Genève México',
                             'Conoce al equipo de Individuel Genève en México: especialistas capacitadas en cosmetología y aparatología que te atienden de forma personalizada.', 'Especialistas'),
    'pages/nosotros/': ('Individuel en México: distribuidor autorizado | BELLEZA PRO MX',
                        'Individuel Genève en México es operado por BELLEZA PRO MX, distribuidor autorizado de fórmulas cosméticas originales con certificaciones internacionales.', 'Individuel en México'),
    'pages/partners/': ('Partners de Individuel Genève en Europa y México',
                        'Encuentra las colecciones Individuel Genève en lugares selectos de Europa. ¿Quieres ser partner o distribuidor de Individuel en México?', 'Partners'),
    'pages/bolsa-de-trabajo/': ('Bolsa de trabajo | Individuel Genève México',
                                'Vacantes en Individuel Genève México: Skin specialist y Brand Advocate. Únete a un equipo de estetistas con estándares internacionales.', 'Bolsa de trabajo'),
    'pages/protocolo-de-seguridad/': ('Protocolo de seguridad | Individuel Genève México',
                                      'Registro de clientes y especialistas, limpieza de equipos, fórmulas en cápsulas selladas de un solo uso y monitoreo en tiempo real.', 'Protocolo de seguridad'),
    'pages/contacto/': ('Contacto Individuel Genève México | WhatsApp y dirección',
                        'Agenda por WhatsApp +52 55 2307 6185. Av. Tamaulipas 150, Condesa, CDMX. Lunes a viernes 8:00–20:00, sábado y domingo 10:00–16:00.', 'Contacto'),
    'pages/blog/': ('Blog de skincare y tratamientos | Individuel Genève',
                    'Piel informada: artículos de Individuel Genève sobre hidratación, antioxidantes, ultrasonido no térmico, minerales y tratamientos faciales.', 'Blog'),
    'pages/terminos/': ('Términos y condiciones | Individuel Genève México',
                        'Reservaciones, modificación de citas, garantía sobre tratamientos y reembolsos de productos Individuel Genève en México.', 'Términos y condiciones'),
    'pages/privacidad/': ('Políticas de privacidad | Individuel Genève México',
                          'Qué información recopila Individuel Genève México, cómo la usamos y protegemos, y cómo contactarnos.', 'Políticas de privacidad'),
    'pages/devoluciones/': ('Políticas de devolución | Individuel Genève México',
                            'Reembolsos y cambios de productos Individuel Genève dentro de los primeros 7 días naturales después de tu compra.', 'Políticas de devolución'),
    'pages/cuenta/': ('Mi cuenta | Individuel Genève', 'Tus citas y tu perfil en Individuel Genève.', 'Mi cuenta'),
    'pages/gracias/': ('Gracias por tu compra | Individuel Genève', 'Confirmación de compra en Individuel Genève.', 'Gracias'),
}
PARENTS = {'pages/tecnologias/sonnext/': 'pages/tecnologias/', 'pages/tecnologias/ballancer/': 'pages/tecnologias/', 'pages/tecnologias/mit/': 'pages/tecnologias/'}

e = lambda s: html.escape(str(s), quote=True)


def load(name):
    return json.loads((ROOT / 'public' / 'db' / f'{name}.json').read_text(encoding='utf-8'))


def breadcrumb(items):
    return {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i, 'name': name, 'item': f'{SITE}/{path}'} for i, (name, path) in enumerate(items, 1)]}


def crumbs_for(path):
    items = [('Inicio', '')]
    if path in PARENTS: items.append((PAGES[PARENTS[path]][2], PARENTS[path]))
    if path: items.append((PAGES[path][2], path))
    return items


def head(path, title, desc, image, og_type, graph):
    url = f'{SITE}/{path}'
    img = SITE + image if image.startswith('/') else image
    robots = 'noindex, follow' if path in NOINDEX else 'index, follow, max-image-preview:large'
    ld = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return f'''<!-- seo: generated by tools/seo.py, edit PAGES there -->
    <script>document.documentElement.classList.add('js');</script>
    <title>{e(title)}</title>
    <meta name="description" content="{e(desc)}">
    <meta name="robots" content="{robots}">
    <link rel="canonical" href="{url}">
    <meta property="og:site_name" content="{BRAND}">
    <meta property="og:locale" content="es_MX">
    <meta property="og:type" content="{og_type}">
    <meta property="og:title" content="{e(title)}">
    <meta property="og:description" content="{e(desc)}">
    <meta property="og:url" content="{url}">
    <meta property="og:image" content="{e(img)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{e(title)}">
    <meta name="twitter:description" content="{e(desc)}">
    <meta name="twitter:image" content="{e(img)}">
    <script type="application/ld+json">{ld}</script>
    <!-- /seo -->'''


OLD_TAGS = re.compile(r'\s*(<!-- seo:.*?<!-- /seo -->|<title>.*?</title>|<meta (?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>'
                      r'|<link rel="canonical"[^>]*>|<script type="application/ld\+json">.*?</script>)', re.S)


def write(path, head_html, root_html=None):
    f = ROOT / path / 'index.html'
    s = f.read_text(encoding='utf-8')
    s = OLD_TAGS.sub('', s)
    s = re.sub(r'(<meta name="viewport"[^>]*>)', lambda m: m.group(1) + '\n    ' + head_html, s, count=1)
    s = re.sub(r'<div id="root">(?:<!--seo-root-->.*?<!--/seo-root-->)?</div>',
               lambda m: f'<div id="root"><!--seo-root-->{LOADER}{root_html or ""}<!--/seo-root--></div>', s, count=1, flags=re.S)
    f.write_text(s, encoding='utf-8', newline='\n')


# Grey ring shown until React renders (css/site.css .page-loader); only visible when JavaScript runs.
LOADER = '<div class="page-loader" role="status" aria-label="Cargando"><span></span></div>'


def static_root(path, inner):
    """Plain HTML for crawlers (class seo-static: hidden when JavaScript runs); links relative to the page."""
    rel = '../' * path.count('/') or './'
    inner = re.sub(r'(href|src)="/(?!/)', lambda m: f'{m.group(1)}="{rel}', inner)
    return f'\n        <main class="seo-static max-w-5xl mx-auto px-4 py-16 text-ink">{inner}</main>\n    '


def product_list(products):
    return '<ul>' + ''.join(f'<li><a href="/pages/tienda/{p["slug"]}/">{e(p["name"])} · Individuel Genève Advance Pro{(" " + p["size"]) if p["size"] else ""}</a></li>'
                            for p in products) + '</ul>'


def main():
    products = [p for p in load('productos')['products'] if p.get('active', True)]
    cats = {c['id']: c['label'] for c in load('categorias')['categories']}
    posts = load('blog')['posts']
    claims = 'Producto original · Distribuidor autorizado en México · Personalizado para todo tipo de piel'
    urls = []

    # --- static pages ---
    for path, (title, desc, _) in PAGES.items():
        if not (ROOT / path / 'index.html').exists():
            print(f'OJO  falta {path}index.html'); continue
        graph = [{'@type': 'WebPage', '@id': f'{SITE}/{path}#webpage', 'url': f'{SITE}/{path}', 'name': title, 'description': desc,
                  'inLanguage': 'es-MX', 'isPartOf': {'@id': f'{SITE}/#website'}}]
        root = None
        if path == '':
            graph += [ORG, WEBSITE, BUSINESS]
            root = static_root(path, f'''<h1>{BRAND} México: cosméticos originales y tratamientos faciales</h1>
            <p>Distribuidor autorizado de Individuel Genève (Individuel Geneve) en México. Cosméticos Individuel personalizados para todo tipo de piel, producto original, y tratamientos faciales y corporales no invasivos en la Condesa, Ciudad de México.</p>
            <p>{claims}</p>
            <h2><a href="/pages/tienda/">Shop Individuel: cosméticos Individuel Genève</a></h2>{product_list(products)}
            <p><a href="/pages/tratamientos/">Menú de servicios</a> · <a href="/pages/tecnologias/">Tecnologías</a> · <a href="/pages/blog/">Blog</a> · <a href="/pages/contacto/">Contacto</a></p>''')
        else:
            graph.append(breadcrumb(crumbs_for(path)))
        if path == 'pages/tienda/':
            graph[0]['@type'] = 'CollectionPage'
            graph.append({'@type': 'ItemList', 'name': 'Cosméticos Individuel Genève Advance Pro', 'numberOfItems': len(products),
                          'itemListElement': [{'@type': 'ListItem', 'position': i, 'url': f'{SITE}/pages/tienda/{p["slug"]}/', 'name': p['name']}
                                              for i, p in enumerate(products, 1)]})
            root = static_root(path, f'''<h1>Shop Mexico · Individuel Genève: línea de grado médico</h1>
            <p>Línea Advance Pro en su envase sellado de grado médico. Un producto de Individuel Genéve. Edición limitada en México. Consulta precios y disponibilidad.</p>
            <p>{claims}</p>{product_list(products)}''')
        if path == 'pages/contacto/':
            graph.append(BUSINESS)
        write(path, head(path, title, desc, DEFAULT_IMAGE, 'website', graph), root)
        if path not in NOINDEX: urls.append((path, '1.0' if path == '' else '0.9' if path == 'pages/tienda/' else '0.6'))

    # --- products ---
    for p in products:
        path = f'pages/tienda/{p["slug"]}/'
        photos = ([p['commercial_image']] if p.get('commercial_image') else []) + p['images']   # studio photo first
        size = f' {p["size"]}' if p['size'] else ''
        title = f'{p["name"]}{size} · Individuel Genève | Original'
        first = re.split(r'(?<=\.)\s', p['description'], maxsplit=1)[0]
        desc = f'{p["name"]} de Individuel Genève, producto original de distribuidor autorizado en México. {first}'
        if len(desc) > 165: desc = desc[:162].rsplit(' ', 1)[0] + '…'
        product = {'@type': 'Product', '@id': f'{SITE}/{path}#product', 'name': f'{p["name"]} Individuel Genève', 'sku': p['sku'],
                   'description': p['description'], 'image': [SITE + i for i in photos], 'url': f'{SITE}/{path}',
                   'brand': {'@type': 'Brand', 'name': BRAND}, 'category': ', '.join(cats.get(c, c) for c in p['category_ids']),
                   'manufacturer': {'@type': 'Organization', 'name': BRAND}}
        if p.get('price_mxn') is not None:   # Google needs a price to show an Offer
            product['offers'] = {'@type': 'Offer', 'url': f'{SITE}/{path}', 'priceCurrency': 'MXN', 'price': p['price_mxn'],
                                 'itemCondition': 'https://schema.org/NewCondition',
                                 'availability': 'https://schema.org/' + ('InStock' if p['stock'] > 0 else 'OutOfStock'),
                                 'seller': {'@id': f'{SITE}/#organization'}}
        graph = [product, breadcrumb([('Inicio', ''), ('Shop Individuel', 'pages/tienda/'), (p['name'], path)])]
        img = photos[0] if photos else DEFAULT_IMAGE
        root = static_root(path, f'''<p><a href="/pages/tienda/">Shop Individuel</a></p>
            <h1>{e(p["name"])}{e(size)} · Individuel Genève Advance Pro</h1>
            <img src="{img}" alt="{e(p["name"])} Individuel Genève" width="400" height="400">
            <p>{e(p["description"])}</p>{f"<p>Activos: {e(p['actives'])}.</p>" if p.get('actives') else ''}
            <p>{claims}</p>''')
        write(path, head(path, title, desc, img, 'product', graph), root)
        urls.append((path, '0.8'))

    # --- blog posts ---
    for p in posts:
        path = f'pages/blog/{p["slug"]}/'
        t = p['title'][:1].upper() + p['title'][1:]
        title = f'{t} | Blog Individuel Genève'
        desc = (p['excerpt'] or t)[:160]
        img = p['cover'] or DEFAULT_IMAGE
        graph = [{'@type': 'BlogPosting', '@id': f'{SITE}/{path}#article', 'headline': t, 'description': desc, 'datePublished': p['date'],
                  'image': SITE + img, 'url': f'{SITE}/{path}', 'inLanguage': 'es-MX',
                  'author': {'@type': 'Person', 'name': p.get('author') or BRAND}, 'publisher': {'@id': f'{SITE}/#organization'}},
                 breadcrumb([('Inicio', ''), ('Blog', 'pages/blog/'), (t, path)])]
        body = ''.join(f'<h2>{e(b["v"])}</h2>' if b['t'] == 'h' else f'<p>{e(b["v"])}</p>' for b in p['blocks'] if b['t'] in ('h', 'p', 'li', 'quote'))
        root = static_root(path, f'<p><a href="/pages/blog/">Blog Individuel Genève</a></p><h1>{e(t)}</h1>{body}')
        write(path, head(path, title, desc, img, 'article', graph), root)
        urls.append((path, '0.5'))

    # --- redirect pages for the old Squarespace URLs ---
    # GitHub Pages cannot answer with HTTP 301, and 404.html (MOVED) is served with status 404, which Google does not
    # follow. So each old URL gets a real page (HTTP 200) with canonical + instant meta refresh, which Google treats as a
    # permanent redirect. MOVED in 404.html stays the single list (and the fallback for any other variant).
    moved = re.findall(r"^\s*'(/[^']*)': '(/[^']*)',?$", (ROOT / '404.html').read_text(encoding='utf-8'), re.M)
    stubs = 0
    for old, new in moved:
        if old.startswith('/pages/'): continue          # old staging pages: never indexed, 404.html is enough
        folder = old.strip('/')
        rel = '../' * (folder.count('/') + 1) + new.lstrip('/')
        f = ROOT / folder / 'index.html'
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(f'''<!DOCTYPE html>
<html lang="es-MX">
<head>
    <meta charset="UTF-8">
    <!-- Old Squarespace URL {old}: permanent redirect to {new}. Generated by tools/seo.py from MOVED in 404.html. -->
    <title>{BRAND} · Esta página se movió</title>
    <link rel="canonical" href="{SITE}{new.split('#')[0]}">
    <meta http-equiv="refresh" content="0; url={rel}">
    <script>location.replace({json.dumps(rel)}{'' if '#' in new else ' + location.hash'});</script>
</head>
<body>
    <p>Esta página se movió a <a href="{rel}">{SITE}{new}</a>.</p>
</body>
</html>
''', encoding='utf-8', newline='\n')
        stubs += 1

    # --- sitemap.xml + robots.txt ---
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    xml += [f'  <url><loc>{SITE}/{u}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>' for u, pr in urls]
    xml.append('</urlset>')
    (ROOT / 'sitemap.xml').write_text('\n'.join(xml) + '\n', encoding='utf-8', newline='\n')
    (ROOT / 'robots.txt').write_text(f'''User-agent: *
Allow: /
Disallow: /pages/cuenta/
Disallow: /pages/gracias/

Sitemap: {SITE}/sitemap.xml
''', encoding='utf-8', newline='\n')
    print(f'seo  {len(urls)} URLs en sitemap.xml · {len(PAGES)} páginas · {len(products)} productos · {len(posts)} artículos · {stubs} redirecciones')


if __name__ == '__main__':
    main()
