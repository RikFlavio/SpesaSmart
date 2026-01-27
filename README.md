# SmartSpesa 🛒

Lista della spesa intelligente con scanner barcode - Progressive Web App

## Features

- 📷 **Scanner Barcode** - Scansiona i codici a barre con la fotocamera
- 🔍 **Open Food Facts API** - Riconoscimento automatico prodotti
- 📱 **PWA** - Installabile su smartphone, funziona offline
- 🏷️ **Categorie personalizzabili** - Crea, modifica, elimina categorie con emoji
- ✅ **Modalità spesa** - Spunta i prodotti mentre fai la spesa
- 🔒 **Privacy-first** - Tutti i dati salvati localmente in IndexedDB
- 📤 **Export/Import JSON** - Backup e ripristino dati

## Deploy su GitHub Pages

1. Crea un nuovo repository su GitHub
2. Carica tutti i file in questo folder
3. Vai su **Settings** → **Pages**
4. Seleziona **Source**: `Deploy from a branch`
5. Seleziona **Branch**: `main` e folder `/ (root)`
6. Clicca **Save**

Il sito sarà disponibile su: `https://tuousername.github.io/nome-repo/`

## Struttura File

```
├── index.html          # App principale (HTML + CSS)
├── app.js              # Logica JavaScript
├── manifest.json       # Configurazione PWA
├── sw.js               # Service Worker per offline
├── favicon.ico         # Favicon (nel root)
├── apple-touch-icon.png # Apple touch icon (180x180)
└── icons/              # Tutte le icone PWA
    ├── icon-16.png ... icon-512.png
    ├── scan-shortcut.png
    └── add-shortcut.png
```

## Privacy

Tutti i dati sono salvati **solo sul tuo dispositivo** usando IndexedDB.
Nessun dato viene inviato a server esterni (eccetto le query a Open Food Facts per cercare i prodotti).

## Novità v2

- ✨ Modal in-app (niente più alert/prompt del browser)
- 📊 Campo barcode anche nel form manuale
- 🏷️ Categorie personalizzabili con emoji picker
- 🎨 Codice separato in HTML + JS per manutenibilità
