import type { Preset } from '../types'

const VERIFIED_AT = '2026-10-05'

const SOURCE_PASSV = {
  label: 'PassV Anlage 8 / BMI-Fotomustertafel',
  url: 'https://www.gesetze-im-internet.de/passv_2007/anlage_8.html',
}

const BG_LIGHT: Preset['background'] = {
  tones: ['hellgrau', 'weiss'],
  allowPureWhite: true,
  minLuminance: 0.6,
  minContrast: 0.12,
  uniformRequired: true,
}

/** EU-/ICAO-Grundraster: 35 x 45 mm, Gesicht 70–80 % der Bildhöhe. */
function euBase(id: string, region: string, label: string, labelEn: string, overrides: Partial<Preset> = {}): Preset {
  return {
    id,
    label,
    labelEn,
    group: 'eu',
    region,
    widthMm: 35,
    heightMm: 45,
    dpi: 600,
    head: { minMm: 32, maxMm: 36, targetMm: 34, minRatio: 0.7, maxRatio: 0.8 },
    topMarginMm: 3,
    freeSpaceTopRatio: 0.27,
    background: BG_LIGHT,
    glasses: 'ohne-reflexion',
    headCovering: 'religioes',
    digital: {
      formats: ['jpeg'],
      quality: 0.92,
      minWidthPx: 600,
      minHeightPx: 800,
    },
    printSheets: ['a4', '4x6'],
    printCopies: 2,
    maxAgeMonths: 6,
    notes: [],
    source: SOURCE_PASSV,
    verifiedAt: VERIFIED_AT,
    confidence: 'offiziell',
    ...overrides,
  }
}

export const EU_PRESETS: Preset[] = [
  euBase('de-personalausweis', 'DE', 'Deutschland – Personalausweis / Reisepass', 'Germany – ID card / passport', {
    printCopies: 2,
    authorityRestriction:
      'Seit 01.05.2025 wird das Passbild für Personalausweis, Reisepass und Aufenthaltstitel digital übermittelt und muss von der Behörde oder einem zugelassenen Fotodienst erstellt werden. Eigenaufnahmen werden von den meisten Bürgerämtern nicht angenommen. Vor der Verwendung bitte bestätigen lassen.',
    notes: [
      'Gesichtshöhe laut neuer PassV-Fassung als Anteil: 70–80 % der Bildhöhe (entspricht ca. 32–36 mm).',
      'Der Messpunkt liegt laut Mustertafel beim Haaransatz; der Scheitel darf bei hohen Frisuren aus dem Bild ragen.',
      'Für Führerschein, Gesundheitskarte, Bewerbung und Visum gelten dieselben Maße ohne die digitale Pflicht.',
    ],
    digital: {
      formats: ['jpeg'],
      quality: 0.92,
      minWidthPx: 413,
      minHeightPx: 531,
    },
  }),
  euBase('eu-schengen-visum', 'EU', 'Schengen-Visum (35 × 45 mm)', 'Schengen visa (35 × 45 mm)', {
    label: 'Schengen-Visum – Kurzzeit (alle 29 Staaten)',
    notes: [
      'Einheitliches Format nach ICAO Doc 9303; einzelne Konsulate verlangen abweichende Hintergrundtöne oder Dateigrößen.',
      'Hintergrund: weiß oder hellgrau – bei Zweifeln hellgrau wählen.',
      'Viele Antragszentren verlangen eine Auflösung ab 600 × 800 px, teilweise mit Dateigrößenbegrenzung.',
    ],
    printCopies: 2,
  }),
  euBase('fr-france', 'FR', 'Frankreich – Passeport / CNI', 'France – passport / ID card', {
    background: {
      tones: ['hellgrau', 'blaugrau'],
      allowPureWhite: false,
      minLuminance: 0.55,
      minContrast: 0.15,
      uniformRequired: true,
    },
    notes: [
      'Frankreich weicht von den übrigen EU-Staaten ab: reines Weiß ist als Hintergrund ausgeschlossen.',
      'Foto darf nicht älter als 6 Monate sein und muss von einer befugten Person oder zugelassener Kabine erstellt werden.',
    ],
    source: { label: 'service-public.gouv.fr – F10619', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F10619' },
  }),
  euBase('nl-paspoort', 'NL', 'Niederlande – Paspoort / ID-kaart', 'Netherlands – passport / ID card', {
    head: { minMm: 26, maxMm: 30, targetMm: 28 },
    faceWidth: { minMm: 16, maxMm: 20 },
    notes: [
      'Gesichtshöhe altersabhängig: bis einschließlich 10 Jahre 19–30 mm, ab 11 Jahren 26–30 mm.',
      'Zusätzlich wird die Gesichtsbreite von Ohransatz zu Ohransatz mit 16–20 mm geprüft.',
    ],
    source: {
      label: 'rijksoverheid.nl – Eisen pasfoto',
      url: 'https://www.rijksoverheid.nl/themas/migratie-en-reizen/paspoort-en-identiteitskaart/eisen-pasfoto-paspoort-id-kaart',
    },
  }),
  euBase('fi-passi', 'FI', 'Finnland – Passi / henkilökortti', 'Finland – passport / ID card', {
    widthMm: 36,
    heightMm: 47,
    head: { minMm: 32, maxMm: 36, targetMm: 34 },
    topMarginMm: 5,
    notes: [
      'Finnland ist die Abweichung im Schengen-Raum: 36 × 47 mm statt 35 × 45 mm.',
      'Scheitel 4–6 mm vom oberen Rand, Kinn 7–9 mm vom unteren Rand, Gesichtsmittellinie höchstens 1,5 mm versetzt.',
      'Digital exakt 500 × 653 px als JPEG, maximal 250 kB.',
    ],
    digital: {
      widthPx: 500,
      heightPx: 653,
      formats: ['jpeg'],
      quality: 0.9,
    },
    source: { label: 'SäädK 1168/2016 § 2 (Finlex)', url: 'https://www.finlex.fi/en/eli/kaannos/2016/20161168' },
  }),
  euBase('pl-dowod', 'PL', 'Polen – Dowód osobisty / paszport', 'Poland – ID card / passport', {
    notes: [
      'Polen prüft zusätzlich, dass die Augenlinie horizontal durch beide Pupillen verläuft (kein Kopfneigen).',
      'Digitale Auflösung ab 492 × 610 px.',
    ],
    digital: {
      formats: ['jpeg'],
      quality: 0.92,
      minWidthPx: 492,
      minHeightPx: 610,
    },
    source: { label: 'gov.pl – Anforderungen Passfoto', url: 'https://www.gov.pl/web/gov/paszport' },
  }),
  euBase('at-reisepass', 'AT', 'Österreich – Reisepass / Personalausweis', 'Austria – passport / ID card', {
    notes: [
      'Kopf nimmt ca. zwei Drittel des Bildes ein und darf nicht höher als 36 mm sein.',
      'Mindestabstand zwischen den Augenmitten 8 mm, optimal 10 mm.',
      'Das Foto darf den Kopf nicht verzerren oder in den Proportionen verändern.',
    ],
    source: { label: 'oesterreich.gv.at – Passbildkriterien', url: 'https://www.oesterreich.gv.at/de/lexicon/P/Seite.991253' },
  }),
  euBase('es-dni', 'ES', 'Spanien – DNI / Reisepass', 'Spain – ID card / passport', {
    notes: ['Einheitliches EU-Raster, Hintergrund weiß und ohne Schatten.'],
  }),
  euBase('it-fototessera', 'IT', 'Italien – Fototessera / passaporto', 'Italy – ID card / passport', {
    notes: ['Hintergrund weiß oder sehr hell, ohne Schatten und Muster.'],
  }),
  euBase('eu-visum-45x35', 'EU', 'Visum Altformat – 45 × 35 mm', 'Visa (legacy 45 × 35 mm)', {
    widthMm: 45,
    heightMm: 35,
    // Das Altformat ist quer und damit deutlich kleiner als 35 × 45 mm hochkant.
    head: { minMm: 24, maxMm: 28, targetMm: 26 },
    topMarginMm: 1.5,
    notes: [
      'Älteres horizontal stehendes Visumformat, das manche Konsulate und Botchaften weiterhin verwenden.',
      'Kurzzeit-Schengen-Visum ist heute üblicherweise 35 × 45 mm hochkant – bitte beim Antragszentrum prüfen.',
    ],
    confidence: 'praxis',
    printSheets: ['a4'],
  }),
]