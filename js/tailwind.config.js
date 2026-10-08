// Tailwind (CDN) theme shared by every page. Load right after https://cdn.tailwindcss.com.
// Palette: white · blush (light pink) · ink (dark grey). Tokens mirror the :root variables in /css/site.css.
tailwind.config = {
    theme: {
        extend: {
            colors: {
                blush: { 50: '#fdf8f8', 100: '#faeef0', 200: '#f4dfe2', 300: '#ebc9ce', 400: '#d9a7af', 500: '#c4848e' },
                ink: { DEFAULT: '#2f2f33', 900: '#1f1f22', 700: '#3d3d42', 500: '#5c5c62', 400: '#6e6e74', line: '#ebe5e6' },
            },
            fontFamily: {
                script: ['"Pinyon Script"', 'cursive'],
                serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
                sans: ['Jost', 'system-ui', 'sans-serif'],
            },
            letterSpacing: { label: '0.28em' },
        },
    },
};
