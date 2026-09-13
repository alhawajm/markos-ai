# Local UI fonts

IBM Plex Sans and IBM Plex Sans Arabic, normal weights 400/500/600/700.

Source: [IBM/plex](https://github.com/IBM/plex), revision `bf260093582f04622aacc1e9f9ca604d7ccd0c42`, downloaded 2026-09-10.

Unmodified WOFF2 files are from `packages/plex-sans/fonts/complete/woff2/` and `packages/plex-sans-arabic/fonts/complete/woff2/`. The upstream license is included in `OFL.txt`.

`../fonts.ts` loads them through Next's local font loader. Fonts are served with the application; builds and page rendering do not require Google Fonts. Preloading all eight files is disabled, so the browser requests the faces used on the current page.
