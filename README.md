# gourmet-app
GourmetApp PWA application

## Item Types
The application supports configurable gourmet item types loaded from `item-types-config.json`.

Currently defined types:

- Wine (🍷)
  - Color (enum): Red, White, Rosé, Sparkling, Dessert
  - Vintage (Year) (number)
  - Country (string)
  - Region/Appellation (string)
- Cheese (🧀)
  - Milk (enum): Cow, Goat, Sheep, Buffalo, Mixed, Other
  - Texture (enum): Fresh, Soft, Semi-Soft, Semi-Hard, Hard, Blue
  - Country (string)
  - Region (string)
- Olives (🫒)
  - Color (enum): Green, Black, Purple, Mixed
  - Country (string)
  - Pit (enum): Whole (with pit), Pitted, Stuffed
  - Stuffing (string)
  - Cure Method (enum): Brine, Lye-cured, Water-cured, Dry-salt, Oil-cured
  - Size (enum): S, M, L, XL
- Ham (🍖)
  - Subtype (enum): Prosciutto crudo, Prosciutto cotto, Jamón serrano, Jamón ibérico, Speck, Jambon de Bayonne, Parma (Prosciutto di Parma), San Daniele, Culatello, Other
  - Country (string)
  - Region (string)
- Beer (🍺)
  - Style (enum): Lager, Pilsner, IPA, Pale Ale, Stout, Porter, Wheat, Sour, Belgian, Brown Ale, Amber/Red, Other
  - Color (enum): Pale, Golden, Amber, Brown, Dark
  - Filtering (enum): Filtered, Unfiltered
  - ABV (%) (number)
  - IBU (number)
  - Brewery (string)
  - Country (string)
  - Region (string)

## Updating / Adding Types
To add or adjust a type, edit `item-types-config.json`. Structure:

```
"yourTypeKey": {
  "label": "Display Name",
  "icon": "Emoji/Icon",
  "fields": [
    { "name": "internal_field_name", "label": "Field Label", "type": "enum|number|string", "options": ["..."] }
  ]
}
```

Enum fields require an `options` array. Number and string types don't.

After changing the config, bump the version in `version.json` and update `sw.js` VERSION to force clients to refresh cached assets.

## Versioning
Current version: 0.0.43 (adds Beer Filtering field).

## PWA Update Flow
The service worker caches `item-types-config.json`. A version bump triggers a new cache namespace so new or changed fields become available offline after update.
