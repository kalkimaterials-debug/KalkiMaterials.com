# Kalki Materials website

Static site served on Railway.

- `source/` — the original design-tool pages (`*.dc.html`). Edit these.
- `*.dc.html` at the root — generated, plain HTML. Don't edit by hand.
- `site.js` — header menus, forms and hero video on the generated pages.
- `assets/` — images and video. `assets/finishes/` is generated from
  `source/.image-slots.state.json` (the photos dropped into image slots in
  Claude Design); export that file with the pages when you re-download.

After changing anything in `source/`:

```sh
npm install
npm run build   # regenerates the root *.dc.html files
npm start       # preview at http://localhost:3000
```

Commit the regenerated files; Railway runs `npm start` to serve the site.
