[English](README.md) | [Français](README.fr.md)

# cerfaparse

Convertit les formulaires CERFA PDF non interactifs en PDF remplissables (AcroForm) avec des définitions de champs en JSON.

## Fonctionnalités

1. Extrait les cases caractères et les cases à cocher depuis la géométrie du PDF (via SVG)
2. Extrait les libellés depuis la couche texte du PDF
3. Associe les libellés aux groupes de champs pour générer des noms de champs pertinents
4. Injecte des champs AcroForm (champs texte à cases + cases à cocher) dans le PDF
5. Produit un fichier `.fields.json` avec toutes les définitions de champs (nom, type, libellé, position, maxLength)

## Prérequis

- Node.js >= 20
- Outils CLI [Poppler](https://poppler.freedesktop.org/) (`pdftocairo`, `pdftotext`, `pdfinfo`)

```bash
# macOS
brew install poppler

# Debian/Ubuntu
sudo apt-get install poppler-utils
```

## Installation

```bash
npm install cerfaparse
```

## Utilisation en ligne de commande

```bash
npx cerfaparse convert <input.pdf> [-o <output.pdf>]
```

Exemple :

```bash
npx cerfaparse convert docs/pdf-cerfa_cs8_bleu-recto-verso-140x202mm.pdf -o /tmp/cs8-fillable.pdf
```

Cela produit :
- `/tmp/cs8-fillable.pdf` — le PDF original avec les champs AcroForm superposés
- `/tmp/cs8-fillable.fields.json` — les définitions de champs en JSON

## Format de sortie JSON (compatible ngx-formly)

Le JSON de sortie utilise des définitions de champs compatibles [ngx-formly](https://formly.dev/) (`key`, `type`, `props`) avec les métadonnées spatiales intégrées dans `props` :

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "fields": [
        {
          "key": "p1_nom",
          "type": "input",
          "props": {
            "label": "Nom :",
            "maxLength": 9,
            "page": 1,
            "pdfRect": { "x": 50.4, "y": 505.6, "width": 104.1, "height": 10.9 }
          }
        },
        {
          "key": "p1_oui",
          "type": "checkbox",
          "props": {
            "label": "Oui",
            "page": 1,
            "pdfRect": { "x": 288.1, "y": 472.3, "width": 8.0, "height": 8.0 }
          }
        }
      ]
    }
  ]
}
```

### Types de champs

| Type | Description | Props |
|------|-------------|-------|
| `input` | Champ texte — rendu libre dans formly, une case par caractère (peigne) dans le PDF lorsque `maxLength` est défini | `maxLength`, `label`, `page`, `pdfRect` |
| `checkbox` | Case à cocher | `label`, `page`, `pdfRect` |

## Utilisation en tant que bibliothèque (Node.js)

```typescript
import { convert } from 'cerfaparse';

const { pdfOut, jsonOut, fields } = await convert('input.pdf', 'output.pdf');
```

Ou utilisez les fonctions individuellement :

```typescript
import { extractBoxes } from 'cerfaparse';
import { extractSvg } from 'cerfaparse';
```

## Utilisation avec Angular / ngx-formly

Le JSON de sortie est directement compatible avec [ngx-formly](https://formly.dev/). Exécutez `convert` au moment du build, puis utilisez les champs JSON tels quels :

```typescript
// Charger le JSON généré
import fieldDefs from './assets/cerfa-cs8.fields.json';

// Les champs sont déjà compatibles formly — il suffit de les aplatir
const formlyFields = fieldDefs.pages.flatMap(page => page.fields);
// Chaque champ contient : { key, type, props: { label, maxLength?, page, pdfRect } }
```

Les champs utilisent les types formly standard (`input`, `checkbox`). La prop `maxLength` limite la longueur de saisie dans le formulaire ; lors du remplissage du PDF, `maxLength` déclenche le rendu en peigne (un caractère par case).

Pour remplir le PDF côté client avec [pdf-lib](https://pdf-lib.js.org/) (fonctionne dans le navigateur) :

```typescript
import { PDFDocument } from 'pdf-lib';

const pdfBytes = await fetch('/assets/cerfa-cs8-fillable.pdf').then(r => r.arrayBuffer());
const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();

for (const [key, value] of Object.entries(formValues)) {
  const field = fieldDefs.pages.flatMap(p => p.fields).find(f => f.key === key);
  if (!field) continue;
  if (field.type === 'input') {
    form.getTextField(key).setText(String(value));
  } else {
    const cb = form.getCheckBox(key);
    value ? cb.check() : cb.uncheck();
  }
}

const filledBytes = await pdfDoc.save();
// Déclencher le téléchargement ou l'affichage
```

## Tests

```bash
npx vitest run
```

## Fonctionnement

1. **pdftocairo** convertit chaque page du PDF en SVG
2. Les éléments SVG `<path>` avec un remplissage blanc sont classés comme cases caractères (contour blanc, épaisseur ~1) ou cases à cocher (contour foncé, épaisseur ~0.5)
3. Les matrices de transformation affine SVG (y compris les transformations des ancêtres `<g>`/`<use>`) sont composées pour convertir les coordonnées SVG en coordonnées PDF (origine en bas à gauche, Y vers le haut)
4. Les cases sont regroupées en lignes par proximité Y, puis découpées en champs par écarts X
5. **pdftotext** fournit le texte des libellés et leurs positions via la sortie bbox, associés aux groupes de champs par proximité spatiale
6. **pdf-lib** injecte les champs AcroForm avec des fonds transparents aux coordonnées PDF calculées
