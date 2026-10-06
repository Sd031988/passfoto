/** Hintergrundton nach amtlichem Prüfraster. */
export type BackgroundTone = 'weiss' | 'hellgrau' | 'creme' | 'blaugrau' | 'hell'

/** Vertrauensgrad einer Angabe: nur `offiziell` belegte Werte sind zwingend. */
export type Confidence = 'offiziell' | 'praxis'

export interface HeadSpec {
  /** Kinn bis Scheitel in Millimetern – untere Grenze. */
  minMm: number
  /** Kinn bis Scheitel in Millimetern – obere Grenze. */
  maxMm: number
  /** Wunschmaß, auf das automatisch zugeschnitten wird (immer innerhalb min/max). */
  targetMm: number
  /** Anteil an der Bildhöhe, falls amtlich als Prozentwert definiert. */
  minRatio?: number
  maxRatio?: number
  /** Wird „Kinn bis Haaransatz" statt „Kinn bis Scheitel" gemessen. */
  measureToHairline?: boolean
}

export interface FaceWidthSpec {
  minMm: number
  maxMm: number
}

export interface BackgroundSpec {
  tones: BackgroundTone[]
  /** Reines Weiß nur zulässig, wenn ausdrücklich erlaubt. */
  allowPureWhite: boolean
  /** Mindesthelligkeit des Hintergrunds als sRGB-Relativluminanz (0..1). */
  minLuminance: number
  /** Mindestkontrast |Hintergrund – Gesicht| in Luminanz (0..1). */
  minContrast: number
  /** Muster/Strukturen im Hintergrund sind unzulässig. */
  uniformRequired: boolean
}

export interface DigitalSpec {
  /** Exakte Pixelmaße des Upload-Portals, falls vorgegeben. */
  widthPx?: number
  heightPx?: number
  /** Mindestauflösung, falls nur eine Untergrenze gefordert wird. */
  minWidthPx?: number
  minHeightPx?: number
  maxWidthPx?: number
  maxHeightPx?: number
  minBytes?: number
  maxBytes?: number
  formats: Array<'jpeg' | 'png'>
  /** Empfohlene JPEG-Qualität. */
  quality: number
  /** Erlaubte Abweichung des Seitenverhältnisses in Prozent. */
  aspectTolerancePercent?: number
}

export interface Preset {
  id: string
  /** Kurzlabel für die UI. */
  label: string
  /** Kurzlabel für en-US. */
  labelEn: string
  group: 'eu' | 'americas' | 'asia-pacific' | 'other'
  /** ISO-3166 alpha-2, oder `EU` / `SCHENGEN` / `XA`. */
  region: string
  widthMm: number
  heightMm: number
  /** Empfohlene Druckauflösung. */
  dpi: number
  head: HeadSpec
  faceWidth?: FaceWidthSpec
  /**
   * Abstand Scheitel -> oberer Bildrand in mm.
   * Wenn nicht gesetzt: `freeSpaceTopRatio` wird auf die freie Fläche angewendet.
   */
  topMarginMm?: number
  /** Anteil der freien Fläche oberhalb des Scheitels. */
  freeSpaceTopRatio?: number
  /** Augenlinie als Anteil der Bildhöhe von oben (Zielwert für den Zuschnitt). */
  eyeLineFromTop?: number
  /** Amtlich zulässiges Band der Augenlinie, Anteil der Bildhöhe von oben. */
  eyeLineRangeFromTop?: [number, number]
  background: BackgroundSpec
  glasses: 'verboten' | 'ohne-tinte' | 'ohne-reflexion'
  headCovering: 'religioes' | 'verboten' | 'erlaubt'
  digital: DigitalSpec
  /** Empfohlene Druckbögen. */
  printSheets: Array<'a4' | 'letter' | '4x6' | 'a6'>
  /** Anzahl gedruckter Fotos, die typischerweise verlangt werden. */
  printCopies: number
  /** Gültigkeit des Fotos in Monaten. */
  maxAgeMonths: number
  notes: string[]
  /** Hinweis, dass das Foto nicht bei der Behörde eingereicht werden darf. */
  authorityRestriction?: string
  source: { label: string; url: string }
  /** Datum der letzten Prüfung der Angaben. */
  verifiedAt: string
  confidence: Confidence
}

export interface PresetRegistry {
  presets: Preset[]
  byId: Record<string, Preset>
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info'

export type CheckCategory =
  | 'masse'
  | 'gesicht'
  | 'haltung'
  | 'ausdruck'
  | 'licht'
  | 'hintergrund'
  | 'qualitaet'
  | 'datei'

/** Messwerte, die aus Bild und Gesichtserkennung stammen. */
export interface PhotoMetrics {
  /** Quelle des Scheitelpunkts. */
  crownSource: 'segmentation' | 'schaetzung' | 'manuell'
  /** Kopfhöhe (Kinn bis Scheitel) in Millimetern, bezogen auf das Ausgabeformat. */
  headHeightMm: number
  /** Gesichtshöhe in Millimetern im Ausgabeformat. */
  faceHeightMm: number
  /** Gesichtsmittellinie als Anteil der Bildbreite (0 = links). */
  centerXRatio: number
  /** Augenlinie als Anteil der Bildhöhe (0 = oben). */
  eyeLineFromTop: number
  /** Abstand Scheitel -> oberer Rand in Millimetern. */
  topMarginMm: number
  faceWidthMm: number
  rollDeg: number
  yawDeg: number
  pitchDeg: number
  eyeOpenLeft: number
  eyeOpenRight: number
  mouthOpen: number
  smile: number
  facesDetected: number
  /** Scheitel liegt im Bild (nicht abgeschnitten). */
  crownInsideFrame: boolean
  /** Schärfe: Varianz des Laplace-Operators im Gesichtsausschnitt. */
  sharpness: number
  /** Mittlere Helligkeit des Gesichts (0..1). */
  faceLuminance: number
  /** Anteil überbelichteter Pixel im Gesicht (0..1). */
  faceHighlightClip: number
  /** Anteil unterbelichteter Pixel im Gesicht (0..1). */
  faceShadowClip: number
  /** Asymmetrischer Schatten im Gesicht (0 = symmetrisch). */
  faceShadowAsymmetry: number
  /** Mittlere Helligkeit des Hintergrunds (0..1). */
  backgroundLuminance: number
  /** Standardabweichung der Hintergrundhelligkeit (0..1). */
  backgroundVariance: number
  /** Strukturmaß des Hintergrunds (Kantenenergie, 0 = glatt). */
  backgroundTexture: number
  /** Mittlere Farbsättigung des Hintergrunds (0..1). */
  backgroundSaturation: number
  /** Farbstich: Differenz des Mittelwerts der Rot-/Grünkanäle im Gesicht. */
  faceColorCast: number
  /** Kontrast |Hintergrund – Gesicht|. */
  backgroundContrast: number
  /** Auflösung der Ausgabe in Pixeln. */
  outputWidthPx: number
  outputHeightPx: number
  /** Dateigröße des geplanten Exports in Bytes. */
  outputBytes: number
}

export interface CheckResult {
  id: string
  category: CheckCategory
  labelKey: string
  status: CheckStatus
  /** Gemessener Wert als Text. */
  measured: string
  /** Zielvorgabe als Text. */
  target: string
  /** Maschinenlesbarer Ist-Wert. */
  value: number
  /** Toleranzband als [min, max]. */
  range?: [number, number]
  hintKey?: string
}