# snonux — Static microblog generator

snonux is the static microblog engine behind [snonux.foo](https://snonux.foo). It processes source files from an input directory into a self-contained static site with paginated HTML pages, an Atom feed, and themed WebGL backgrounds.

## Quick start

```sh
go build -o snonux ./cmd/snonux
./snonux --input ./inbox --output ./dist
```

## Creating posts

Drop files into the input directory (`./inbox` by default). Each file becomes one post. Supported formats:

### Plain text (.txt)

```
inbox/
  thoughts.txt
```

The text content is rendered as-is into a post.

### Markdown (.md)

```
inbox/
  update.md
```

Standard Markdown is converted to HTML (GitHub Flavored Markdown supported). Raw HTML blocks are passed through.

### Markdown with embedded images

Reference a local image from your Markdown file using standard `![alt](filename)` syntax. Place the image file in the same input directory:

```
inbox/
  update.md
  screenshot.png
```

Where `update.md` contains:

```markdown
Check out this screenshot!

![screenshot](screenshot.png)

Pretty neat, right?
```

The image file is automatically copied into the post's asset directory, and the `<img>` src is rewritten to the correct path. The image file is consumed together with the Markdown file and removed from the input directory after processing.

**Note:** The image filename in the Markdown must match the actual file in the inbox. Remote URLs (`http://`, `https://`) are left as-is and not downloaded.

### Images (.png, .jpg, .gif)

```
inbox/
  photo.jpg
```

A standalone image file becomes its own post. Images wider than 1024px are downscaled and re-encoded as JPEG at 80% quality.

### Audio (.mp3)

```
inbox/
  voice-note.mp3
```

An audio file becomes a post with an embedded HTML5 audio player.

### After processing

All source files are removed from the input directory once they have been successfully processed into the output directory.

## Command-line flags

```
--input DIR      Input directory for new source files (default: ./inbox)
--output DIR     Output directory for generated site (default: ./dist)
--base-url URL   Base URL for Atom feed links (default: https://snonux.foo)
--theme NAME     Visual theme, or "random" (default: random)
--sync           Rsync output to pi0/pi1 after generation (LAN, then WireGuard fallback)
--list-themes    Print available theme names and exit
--version        Print version and exit
```

## Themes

Each run can use a different visual theme. Use `--list-themes` to see all available themes, or `--theme random` (the default) to pick one at random.

## Games

Every theme comes with its own small arcade game — three levels and a
celebratory ending, sound and music, progress saved in a cookie. Start it from the **Play** button on the
splash screen, the button in the header, the `game` button in the fx row, or
with the `a` key; `Esc` quits. **All games**, next to the splash and header
buttons, opens a menu with a picture and a short description of every theme's
game, so any of them can be played from any theme (on a narrow phone the
button is on the splash only). On a phone the game goes fullscreen with an
on-screen pad beside (or below) the playfield, and `✕` quits.

The shared engine is `internal/generator/templates/shared/games.js`; each
game lives in `internal/generator/templates/themes/<name>/game.js`. See
[docs/games.md](docs/games.md) for the engine API and how to write and test a
game. `mage gamesE2E` smoke-tests all of them in headless Chrome, `mage
gamesTouchE2E` does the same on an emulated phone with real touch events,
`mage gamesCampaign` has each game's bot play its whole campaign by input
only (desktop and phone), and
`GAMES_GPU=1 node integrationtests/games/cpu.mjs` measures what each game
costs in frame rate and CPU.

## Output structure

```
dist/
  index.html                        # Page 1 (newest posts)
  page2.html                        # Page 2, etc.
  atom.xml                          # Atom feed (last 42 entries)
  favicon.ico
  posts/
    2026-04-16-120000/
      post.json                     # Post metadata and rendered HTML
      screenshot.png                # Asset (if any)
    ...
```

## License

See [LICENSE](LICENSE).

### Third-party assets

The bundled web fonts listed below are self-hosted. Their theme
stylesheets make no runtime requests to Google Fonts, gstatic, int10h,
or any font CDN. Each bundled font file lives next to its theme stylesheet under
`internal/generator/templates/themes/<name>/`, is committed to git,
and is shipped to `dist/themes/<name>/` together with a
`FONT_LICENSE.txt` containing the source URL, version/date, and full
attribution.

Bundled web fonts:

- **aurora** — *Manrope* Regular + SemiBold (.woff2, latin+latin-ext) by
  Mikhail Sharanda, from [Google Fonts](https://fonts.google.com/specimen/Manrope),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/aurora/FONT_LICENSE.txt](internal/generator/templates/themes/aurora/FONT_LICENSE.txt).
- **dos** — *WebPlus IBM VGA 8x16* (.woff) by VileR, from the
  [Ultimate Oldschool PC Font Pack v2.2](https://int10h.org/oldschool-pc-fonts/),
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  See [internal/generator/templates/themes/dos/FONT_LICENSE.txt](internal/generator/templates/themes/dos/FONT_LICENSE.txt).
- **nukem** — *Web437 IBM VGA 8x16* (.woff) by VileR, from the
  [Ultimate Oldschool PC Font Pack v2.2](https://int10h.org/oldschool-pc-fonts/),
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  See [internal/generator/templates/themes/nukem/FONT_LICENSE.txt](internal/generator/templates/themes/nukem/FONT_LICENSE.txt).
- **biomech** — *Oxanium* Regular + Bold (.woff2, latin+latin-ext) by
  Tyler Finck, from [Google Fonts](https://fonts.google.com/specimen/Oxanium),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/biomech/FONT_LICENSE.txt](internal/generator/templates/themes/biomech/FONT_LICENSE.txt).
- **cosmos** — *Exo 2* Regular + SemiBold (.woff2, latin+latin-ext) by
  Natanael Gama, from [Google Fonts](https://fonts.google.com/specimen/Exo+2),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/cosmos/FONT_LICENSE.txt](internal/generator/templates/themes/cosmos/FONT_LICENSE.txt).
- **cathedral** — *Cinzel* Regular and *Spectral* Regular + SemiBold
  (.woff2, latin+latin-ext) by Natanael Gama and Production Type, from
  Google Fonts ([Cinzel](https://fonts.google.com/specimen/Cinzel),
  [Spectral](https://fonts.google.com/specimen/Spectral)),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/cathedral/FONT_LICENSE.txt](internal/generator/templates/themes/cathedral/FONT_LICENSE.txt).
- **matrix** — *VT323* Regular (.woff2, latin+latin-ext) by Peter Hull,
  from [Google Fonts](https://fonts.google.com/specimen/VT323),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/matrix/FONT_LICENSE.txt](internal/generator/templates/themes/matrix/FONT_LICENSE.txt).
- **noir** — *Playfair Display* Regular + Bold and *IBM Plex Mono* Regular
  (.woff2, latin+latin-ext) by Claus Eggers Sørensen, Mike Abbink, Bold Monday,
  and IBM, from Google Fonts
  ([Playfair Display](https://fonts.google.com/specimen/Playfair+Display),
  [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono)),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/noir/FONT_LICENSE.txt](internal/generator/templates/themes/noir/FONT_LICENSE.txt).
- **neon** — *Orbitron* Regular + Medium + Bold (.woff2, latin+latin-ext)
  by The Orbitron Project Authors, from
  [Google Fonts](https://fonts.google.com/specimen/Orbitron),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/neon/FONT_LICENSE.txt](internal/generator/templates/themes/neon/FONT_LICENSE.txt).
- **ocean** — *Outfit* Regular + Medium (.woff2, latin+latin-ext) by
  Rodrigo Fuenzalida, from [Google Fonts](https://fonts.google.com/specimen/Outfit),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/ocean/FONT_LICENSE.txt](internal/generator/templates/themes/ocean/FONT_LICENSE.txt).
- **plasma** — *Rajdhani* Regular + SemiBold (.woff2, latin+latin-ext) by
  Indian Type Foundry, from [Google Fonts](https://fonts.google.com/specimen/Rajdhani),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/plasma/FONT_LICENSE.txt](internal/generator/templates/themes/plasma/FONT_LICENSE.txt).
- **retrofuture** — *Orbitron* Regular + Bold and *Share Tech Mono* Regular
  (.woff2, latin+latin-ext) by The Orbitron Project Authors and Carrois
  Apostrophe, from Google Fonts ([Orbitron](https://fonts.google.com/specimen/Orbitron),
  [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono)),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/retrofuture/FONT_LICENSE.txt](internal/generator/templates/themes/retrofuture/FONT_LICENSE.txt).
- **retro** — *VT323* Regular (.woff2, latin+latin-ext) by Peter Hull,
  from [Google Fonts](https://fonts.google.com/specimen/VT323),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/retro/FONT_LICENSE.txt](internal/generator/templates/themes/retro/FONT_LICENSE.txt).
- **surveillance** — *Share Tech Mono* Regular (.woff2, latin+latin-ext)
  by Carrois Apostrophe, from [Google Fonts](https://fonts.google.com/specimen/Share+Tech+Mono),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/surveillance/FONT_LICENSE.txt](internal/generator/templates/themes/surveillance/FONT_LICENSE.txt).
- **synthwave** — *Russo One* Regular (.woff2, latin+latin-ext) by
  Jovanny Lemonad and *Share Tech Mono* Regular (.woff2, latin+latin-ext) by
  Carrois Apostrophe, from Google Fonts
  ([Russo One](https://fonts.google.com/specimen/Russo+One),
  [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono)),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/synthwave/FONT_LICENSE.txt](internal/generator/templates/themes/synthwave/FONT_LICENSE.txt).
- **spaceage** — *Space Mono* Regular + Bold (.woff2, latin+latin-ext) by
  Colophon Foundry, from [Google Fonts](https://fonts.google.com/specimen/Space+Mono),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/spaceage/FONT_LICENSE.txt](internal/generator/templates/themes/spaceage/FONT_LICENSE.txt).
- **terminal** — *JetBrains Mono* Regular + Bold (.woff2, latin+latin-ext) by
  JetBrains, from [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/terminal/FONT_LICENSE.txt](internal/generator/templates/themes/terminal/FONT_LICENSE.txt).
- **tropicale** — *Quicksand* Regular + Medium (.woff2, latin+latin-ext) by
  Andrew Paglinawan, from [Google Fonts](https://fonts.google.com/specimen/Quicksand),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/tropicale/FONT_LICENSE.txt](internal/generator/templates/themes/tropicale/FONT_LICENSE.txt).
- **volcano** — *Bebas Neue* Regular and *Inter* Regular + SemiBold
  (.woff2, latin+latin-ext) by Ryoichi Tsunekawa and Rasmus Andersson,
  from Google Fonts ([Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue),
  [Inter](https://fonts.google.com/specimen/Inter)),
  [SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/).
  See [internal/generator/templates/themes/volcano/FONT_LICENSE.txt](internal/generator/templates/themes/volcano/FONT_LICENSE.txt).

When adding a new bundled font:

1. Download the actual file (`.woff2` preferred, `.woff` accepted) into
   `internal/generator/templates/themes/<name>/` and commit it.
2. Add or update `internal/generator/templates/themes/<name>/FONT_LICENSE.txt`
   with attribution, license, source URL, and version/date.
3. Add an `@font-face` block in that theme's `theme.css` using a
   relative `url(...)` to the bundled file.
4. Add a bullet here pointing at the new `FONT_LICENSE.txt`.

The embed pipeline ([internal/generator/templates/embed.go](internal/generator/templates/embed.go))
automatically picks up `*.woff`, `*.woff2`, and `FONT_LICENSE.txt`
inside any theme directory, and `writeThemeAsset` copies them out to
`dist/themes/<name>/` — no Go code changes needed for new fonts.
