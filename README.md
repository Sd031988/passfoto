# Passfoto Studio

Normgerechte Pass- und Visumfotos als installierbare Web-App. Die Auswertung
erfolgt vollständig im Browser: kein Upload, kein Server, keine Cookies, keine
Analyse. Alle Modelle liegen lokal im Projekt, die App funktioniert nach dem
ersten Laden offline.

## Was die App kann

- 62 Presets für Europa, Türkei, Naher Osten, Afrika, Asien und Amerika
- Aufnahme über Kamera oder Upload eines vorhandenen Fotos.
- Gesichtserkennung, Pose- und Blinkmessung, Hintergrund- und
  Beleuchtungsanalyse.
- Automatischer Zuschnitt auf das Zielformat mit manueller Korrektur von
  Kopfhöhe, Position und Zoom.
- Prüfung aller typischen Ablehnungsgründe mit Klartext-Hinweisen.
- Export als JPEG oder PNG mit korrekter DPI-Angabe, als PDF-Druckbogen mit
  Schnittmarken oder als mehrere Fotos in einem Dokument.

## Wichtiger Hinweis zur Nutzung in Deutschland

Seit dem 1. Mai 2025 werden digitale Passbilder in Deutschland nur noch von
Fotonachweis-Apps akzeptiert, die durch die Bundesdruckerei zertifiziert sind.
Mit dem eigenen Handy erstellte Fotos werden bei Personalausweis und Reisepass
in der Regel nicht anerkannt. Die App ist als Vorprüfung und für alle
Dokumente gedacht, bei denen ein eigenes Passfoto eingereicht wird
(Konsulate, Visa-Stellen, Studienbewerbung, Führerscheinantragungen).

## Installieren

```bash
npm install
npm run dev
```

Für die Installation als App wird der Produktionsbuild benötigt, weil der
Service Worker nur dort aktiviert wird:

```bash
npm run build
npm run preview
```

Die Kamera funktioniert nur über `localhost` oder HTTPS. Der Build ist auf den öffentlichen Pfad `/passfoto/` eingestellt, weil die App im Repository `SDApp` unter diesem Pfad ausgeliefert wird. Für einen lokalen Test in der Wurzel genügt `BASE_PATH=/`:

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Typprüfung und Produktionsbuild |
| `npm run preview` | Produktionsbuild lokal ausliefern |
| `npm run test` | Tests einmal ausführen |
| `npm run test:watch` | Tests im Überwachungsmodus |
| `npm run lint` | oxlint |
| `npm run icons` | PWA-Icons neu erzeugen |
| `npm run sync:assets` | MediaPipe-Modelle und WASM nach `public/` kopieren |

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/core/` | Presets, Einheiten, Crop-Geometrie, Prüflogik, Pipeline |
| `src/imaging/` | Pixelanalyse, Rendern, JPEG/DPI, PDF, Druckbogen |
| `src/vision/` | MediaPipe-Anbindung, Landmarken, Pose, Haarsegmentierung |
| `src/ui/` | Kamera-Hook, Live-Overlay, Komponenten |
| `src/i18n/` | Deutsche und englische Texte |
| `public/` | Manifest, Icons, MediaPipe-Modelle und WASM |
| `pwa/` | Vorlage des generierten Service Workers |

## Auslieferung im SDApp-Repository

Im Repository `SDApp` liegen der React-Quellcode unter `passfoto/source/` und
der daraus erzeugte, von GitHub Pages ausgelieferte Stand direkt unter
`passfoto/`. Details zu Aufbau, Build und Veröffentlichung stehen in
`../DEPLOYMENT.md`.

## Presets und Quellen

Hinweis: Die Funktion „Foto bearbeiten“ (Hintergrund ersetzen, Licht, Farbe, Schärfe) ist bisher nur in der ausgelieferten Fassung im SDApp-Repository enthalten; ihr Quellcode liegt noch nicht in diesem Repository und muss vom lokalen Rechner nachgetragen werden.


Jedes Preset trägt Quelle, Prüfdatum und eine Einordnung als `offiziell` oder
`praxis`. Angaben mit `praxis` beruhen auf Erfahrungswerten und sollten vor
einer amtlichen Einreichung gegengeprüft werden. Die Daten stehen in
`src/core/presets/`.

## Datenschutz

Es findet keine Übertragung von Bildern statt. Gespeichert wird nichts im
Browser, auch nicht im Cache der App.
