// Google Fonts has 1800+ free families. We don't ship them all up front
// (that would be an enormous download for no reason) - instead we ship this
// list of names to browse/search, and only load the *actual* font file for
// whichever one the person picks, using Google's free CSS2 endpoint (no API
// key needed). Typing any other valid Google Fonts name also works, since
// loadGoogleFont() just asks Google for whatever name it's given.
export const GOOGLE_FONTS: string[] = [
  // Sans-serif
  'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Inter', 'Nunito', 'Nunito Sans',
  'Raleway', 'Ubuntu', 'Work Sans', 'Rubik', 'Mulish', 'Karla', 'DM Sans', 'Manrope',
  'Barlow', 'Josefin Sans', 'Quicksand', 'Heebo', 'Hind', 'Cabin', 'Assistant', 'Fira Sans',
  'PT Sans', 'Source Sans Pro', 'Noto Sans', 'Titillium Web', 'Oxygen', 'Overpass',
  'Public Sans', 'Figtree', 'Sora', 'Outfit', 'Plus Jakarta Sans', 'Lexend', 'Urbanist',
  'Space Grotesk', 'Jost', 'Epilogue', 'Red Hat Display',

  // Serif
  'Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Noto Serif', 'Crimson Text',
  'Libre Baskerville', 'Cormorant Garamond', 'EB Garamond', 'Bitter', 'Vollkorn',
  'Source Serif Pro', 'Frank Ruhl Libre', 'Domine', 'Spectral', 'Cardo', 'Rokkitt',
  'Zilla Slab', 'Josefin Slab', 'Alegreya', 'Prata', 'Cormorant', 'Marcellus',

  // Display / Decorative
  'Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Passion One', 'Alfa Slab One',
  'Righteous', 'Fjalla One', 'Bangers', 'Fredoka', 'Baloo 2', 'Comfortaa', 'Lobster',
  'Pacifico', 'Permanent Marker', 'Amatic SC', 'Abril Fatface', 'Staatliches', 'Teko',
  'Big Shoulders Display', 'Unbounded', 'Bungee', 'Chewy', 'Luckiest Guy', 'Shrikhand',
  'Monoton', 'Chivo', 'Syne', 'Barriecito', 'Rammetto One',

  // Handwriting / Script
  'Dancing Script', 'Great Vibes', 'Sacramento', 'Satisfy', 'Caveat', 'Kalam',
  'Shadows Into Light', 'Indie Flower', 'Courgette', 'Parisienne', 'Allura', 'Tangerine',
  'Marck Script', 'Homemade Apple', 'Yellowtail', 'Cookie', 'Playball', 'Kaushan Script',
  'Norican', 'Pinyon Script', 'Alex Brush', 'Handlee', 'Patrick Hand', 'Neucha',

  // Monospace
  'Roboto Mono', 'Space Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code',
  'Source Code Pro', 'Inconsolata', 'Courier Prime', 'Overpass Mono', 'DM Mono',

  // International-friendly
  'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans Devanagari', 'Hind Siliguri',
  'Baloo Bhai 2', 'Mukta', 'Poppins', 'Rubik', 'Tajawal', 'Cairo', 'Almarai',
]

const loadedFonts = new Set<string>()

// Injects a <link> tag for the given Google Fonts family so it can actually
// be used in CSS. Safe to call repeatedly - it only loads each font once.
export function loadGoogleFont(fontFamily: string) {
  if (typeof document === 'undefined') return
  if (loadedFonts.has(fontFamily)) return

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@400;600;700&display=swap`
  document.head.appendChild(link)
  loadedFonts.add(fontFamily)
}

// Loads many fonts at once using a single request per batch (Google's CSS2
// endpoint accepts multiple family= params in one URL), so a font list can
// show real font previews without firing 100+ separate network requests.
export function loadGoogleFontsBatch(fontFamilies: string[]) {
  if (typeof document === 'undefined') return

  const toLoad = fontFamilies.filter((f) => f && !loadedFonts.has(f))
  if (toLoad.length === 0) return

  const CHUNK_SIZE = 40
  for (let i = 0; i < toLoad.length; i += CHUNK_SIZE) {
    const chunk = toLoad.slice(i, i + CHUNK_SIZE)
    const familyParams = chunk.map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`).join('&')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`
    document.head.appendChild(link)
    chunk.forEach((f) => loadedFonts.add(f))
  }
}
