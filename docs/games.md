# Theme games

Every theme has its own small arcade game. Visitors start it from the **Play**
button on the splash screen, the button in the header, the `game` button in the
fx row, or the `a` key. `Esc` quits from any screen. The **All games** button
beside the splash and header buttons opens a menu of every theme's game (see
[The overview menu](#the-overview-menu)).

- `internal/generator/templates/shared/games.js` — **SnoGame**, the shared engine
- `internal/generator/templates/shared/arcade.js` — the menu of all games
- `internal/generator/templates/themes/<theme>/game.js` — one game per theme
- `internal/generator/templates/themes/<theme>/game-thumb.jpg` — its picture in the menu
- `integrationtests/games/` — the Chrome test tools (`e2e.mjs`, `campaign.mjs`, `play.mjs`)
- `integrationtests/games/bots/<theme>.js` — the bot that plays a game's campaign

The engine owns the overlay, the loop, input, audio, effects, menus, the
three-level flow, the ending scene and the save cookie. A game only
describes its own world.

## Writing a game

A game is one self-contained file that registers itself under its theme name.
`themes/breakout/game.js` is the reference implementation; read it first.

```js
(function () {
    'use strict';
    var G = window.SnoGame;

    function init(level) { return { /* fresh state for this level */ }; }
    function update(s, dt) { /* advance one tick; call G.win() / G.die() */ }
    function draw(s, ctx) { /* paint the whole 960x540 frame */ }

    G.register('mytheme', {
        title: 'MY GAME',
        blurb: 'One line that says what to do.',
        controls: ['← → move', 'SPACE jump'],          // 1-4 short lines
        levelNames: ['…', '…', '…'],                     // exactly three
        colors: { bg: '#000', fg: '#fff', accent: '#0ff', dim: '#888' },
        lives: 3,
        music: { /* see Music */ },
        init: init, update: update, draw: draw,
        hud: function (s) { return 'FUEL 80'; },       // optional, right side of the HUD
        cursor: 'none',                                // optional CSS cursor during a level
                                                       // (menus always show the pointer)
        touch: { a: 'JUMP', hide: ['up', 'down', 'b'] }, // optional touch pad setup (see Touch)
        ending: { title: 'CASE CLOSED', colors: ['#f33', '#fff'] } // optional (see The ending)
    });
})();
```

### Rules

1. **Three levels that differ.** `init(level)` gets 1..3: an introduction, a
   development and a finale. Each must add something (new enemy, hazard,
   layout, mechanic), not only raise a speed; the game's signature late
   mechanic or boss belongs in level 3. Build layouts from `G.rng(seed)` so a
   level is the same on every visit.
2. **Winnable and losable through play.** Every level needs a reachable goal
   that calls `G.win(bonus)`, and a way to fail that calls `G.die()` or
   `G.loseLife()`. Level 1 should take a new player about a minute; level 3
   should be a satisfying finale a casual player can still finish. Aim for
   1-3 minutes per level: the point of three levels is that people finish.
3. **Action first.** The player must be doing something every second.
4. **Sound.** Give every meaningful event a sound (`G.sfx` presets or your own
   `G.tone` / `G.noise`), and compose a `music` track that suits the theme.
5. **Physics where it fits**: gravity, inertia, bounce, momentum — integrate
   with `dt`, do not move things by fixed pixel steps per frame.
6. **Look like the theme.** Use the theme's palette (see its `theme.css`) and
   draw with canvas primitives; there are no image assets. Text uses the
   theme's own font through `G.text`.
7. **Always animate.** Something on screen must change every half second even
   if the player does nothing (the e2e test checks this).
8. **No state outside `s`.** `init` may be called at any time (title screen
   preview, every move of the level select, restart after death), so it must
   not play sounds or change the score. `draw` is also called on a state that
   `update` has never seen (title and intro screens). Module-level variables
   may only hold constants. Never touch the DOM, cookies, timers or `window`
   events.
9. **Keep the top 30 px clear** (`y < G.HUD`): the engine draws the HUD there.
10. **House style**: functions of about 30 lines (never above 50), comments that
    explain why, no dead code. Reserved keys: `Esc`, `Enter`, `P`, `M`.
11. **Playable on a phone.** Every game must be winnable with the touch pad
    and taps alone; see [Touch](#touch).

### The ending

Clearing level 3 does not show a plain banner: the engine opens the ending
scene. The game's `update` stops, its last frame stays behind (dimmed), and
fireworks go up over the title, the score and two buttons, **PLAY AGAIN**
(a new run from level 1) and **LEVELS** (the title screen). `← →` pick,
`ENTER` confirms, a tap on a button picks and confirms; for its first 1.2
seconds the scene ignores input so a held fire button cannot skip it. `Esc`
or `✕` quits as anywhere else. Pause, mute and the hidden-tab pause work as
on every screen, and quitting or relaunching leaves nothing of it behind.

A game gives the scene its own character with `def.ending`; every field is
optional and a game that declares nothing gets the fireworks in its colours.

```js
ending: {
    title: 'CASE CLOSED',        // the big line (default 'YOU WIN')
    text: 'The city sleeps.',    // a line under it
    colors: ['#f33', '#fff'],    // the firework palette (default: accent, fg, gold, pink)
    fireworks: true,             // false switches the engine's fireworks off
    draw: function (e, ctx, G) { // the theme's own scene, behind the fireworks
        // e.t: seconds since the scene opened; e.score, e.level;
        // e.data: a scratch object kept for the scene's lifetime;
        // e.rng: a seeded 0..1 generator
    }
}
```

`draw` is called every frame on top of the dimmed last frame of level 3 and
under the fireworks and the text, so keep it to the middle band (y 210-370
is covered by text less than the rest) or to large shapes. It runs only
after the real third-level goal; the same rules as `draw` apply (no sounds,
no state outside `e.data`, a few hundred canvas calls at most).

### Saves

The save is one cookie per game: `unlocked.hiscore.lastLevel.won`. A save
from the old ten-level campaigns is migrated, not thrown away: levels above 3
are capped at 3 (so a player who had got past level 3 finds all three open)
and the high score and the completed star stay. Anything malformed falls
back to a fresh save.

### The API

State and flow:

| | |
|---|---|
| `G.W`, `G.H`, `G.HUD`, `G.STEP`, `G.LEVELS` | 960, 540, 30, 1/60, 3 |
| `G.level`, `G.lives`, `G.score`, `G.t` | current level, lives left, run score, seconds played since the level's last `init` (it restarts after `G.die()`) |
| `G.win(bonus)` | level cleared; `bonus` is added to the score |
| `G.die()` | lose a life and restart the level from `init` (after a one-second freeze) |
| `G.loseLife()` | lose a life but keep playing; returns lives left (0 means the engine already showed game over) |
| `G.isTouch()` | true when the player is on the touch pad (see Touch) |
| `G.gameOver()` | end the run at once, whatever lives are left (a clock that ran out, a trace that completed) |
| `G.addScore(n)` | add to the score |
| `G.addLife(max)` | one extra life unless that would exceed `max` (default 5); never removes one; do not write `G.lives` yourself |

Lives are reset to `def.lives` at the start of each level. Set `lives: 1` for
one-hit games.

Input (logical buttons work with keyboard and the touch pad):

| | |
|---|---|
| `G.key.left/right/up/down` | held: arrows or WASD |
| `G.key.a` | held: Space, Z or J |
| `G.key.b` | held: X, K or Shift |
| `G.hit.left` … `G.hit.b` | true only on the tick the button went down |
| `G.down(code)`, `G.pressed(code)` | raw `KeyboardEvent.code`, e.g. `'KeyW'` vs `'ArrowUp'` for twin-stick games |
| `G.mouse.x/y` | pointer in canvas coordinates |
| `G.mouse.down`, `G.mouse.hit` | left button held / just pressed |
| `G.mouse.rdown`, `G.mouse.rhit` | right button |

A game that uses the mouse must still be fully playable with the keyboard.

### Touch

On a phone the engine goes
fullscreen and asks for landscape where the browser allows it, and adds an
on-screen pad. The pad never covers the playfield: in landscape the canvas
shrinks to leave a gutter on each side (direction pad left, action buttons
right), in portrait the canvas sits at the top with the pad below it. The
`✕` button quits. A tap anywhere but on the pad or `✕` confirms every menu
screen; on the title screen a tap on a level box (or ◀ ▶ on the pad) picks
that level, and a tap that only just misses a box does nothing.

A phone is any device whose main pointer is coarse, and also any visitor
whose last action was a finger on the screen (some phone browsers report a
fine pointer; a touch-screen laptop gets the pad when it is touched and
loses it for the next game once a key or mouse button is used).
`G.isTouch()` tells a game which it is: ask it in `init` if the game has a
slimmer phone variant, and never query `(pointer: coarse)` yourself. The HUD
and the title screen's small print are drawn larger on a phone.

While a game is open the page's own `requestAnimationFrame` callbacks (the
theme's animated backdrop) are parked and handed back on quit, so the
backdrop costs the game nothing.

The pad holds keys, so a game needs no touch code of its own:

| Pad | Sends | The game reads |
|---|---|---|
| direction pad | `ArrowLeft` `ArrowRight` `ArrowUp` `ArrowDown` | `G.key.left` … `G.key.down`, `G.hit.*` |
| **A** | `Space` | `G.key.a`, `G.hit.a` |
| **B** | `KeyX` | `G.key.b`, `G.hit.b` |

The direction pad is an 8-way stick: its corners give diagonals (two
directions held at once) and a thumb can slide from one direction to the next.
Each part of the pad follows its own finger, so holding a direction while
pressing A or B works. Buttons are at least 48 CSS px; only on a very small
phone held sideways (or with a `twin` pad on a small one) do they shrink, to 40
at the least, so that the canvas stays about 280 px wide.

`def.touch` tunes the pad; every field is optional, and a game that declares
nothing gets the full pad above.

```js
touch: {
    a: 'JUMP', b: 'BOMB',     // labels for the action buttons (keep them to ~5 letters)
    hide: ['up', 'down'],     // buttons this game does not use: left right up down a b
    dirs: 4,                  // one direction at a time instead of eight with diagonals
    twin: true                // twin-stick: see below
}
```

- **`hide`** every button the game ignores: fewer buttons are bigger targets
  and leave more room for the canvas. With `up` and `down` hidden the pad is
  two buttons side by side. A game played by taps on the canvas alone may
  hide all six: it then gets only the `✕` button and the largest canvas.
- **`dirs: 4`** is for grid and maze games. The default stick has eight 45°
  sectors, so a thumb a little off axis holds two directions at once; with
  `dirs: 4` each direction owns a full quarter and exactly one is held.
- **`twin: true`** is for twin-stick games that read the two halves of the
  keyboard apart. The left pad then sends `KeyW` `KeyA` `KeyS` `KeyD` (move)
  and a second direction pad on the right sends the arrow keys (fire); read
  them with `G.down('KeyW')` / `G.down('ArrowUp')`. `G.key.left` and friends
  are true for either pad, exactly as on the keyboard. A and B stay (above the
  right pad) unless hidden. Two pads cost canvas width in landscape, so hide
  A and B when the game can do without them.

A finger on the canvas is the mouse: `G.mouse.x/y` jump to it, `G.mouse.down`
is true while it rests and `G.mouse.hit` on the tick it lands. What a phone
does not have:

- **No hover.** `G.mouse.x/y` only change while a finger is down, and they
  jump rather than glide. Do not require the pointer to be moved somewhere
  before a click; a tap must aim and act at once.
- **No right button.** `G.mouse.rdown` / `G.mouse.rhit` never fire. Anything
  on the right button must also be on A or B.
- **No other keys.** Only the codes in the table (plus W A S D with `twin`)
  exist. `P` and `M` are missing too; a game paused by a hidden tab resumes
  on a tap.
- **Less room.** The canvas is about 580x326 CSS px on a phone held sideways
  and as small as 390x219 on one held upright, where everything is drawn at
  40% size. Anything the player must read during play should be 20 px or
  more in canvas units, and nothing should hinge on a one-pixel detail.

The `controls` lines on the title screen are the only instructions a player
gets, so name the pad buttons there next to the keys (`SPACE / A jump`), using
the labels given in `def.touch`. The engine's own hints already say `TAP`
instead of `ENTER` on a phone.

Helpers:

| | |
|---|---|
| `G.clamp(v, lo, hi)`, `G.lerp(a, b, t)`, `G.dist(ax, ay, bx, by)` | math |
| `G.rnd(a, b)`, `G.pick(arr)` | unseeded random (effects, AI jitter) |
| `G.rng(seed)` | returns a seeded `() => 0..1` generator (level layouts) |
| `G.aabb(a, b)` | overlap of two `{x, y, w, h}` rectangles |
| `G.circ(ax, ay, ar, bx, by, br)` | overlap of two circles |
| `G.circRect(cx, cy, r, rx, ry, rw, rh)` | circle against rectangle |
| `G.closestOnSeg(px, py, ax, ay, bx, by)` | `{x, y, t}` nearest point on a segment |
| `G.tileMove(body, dt, tileSize, solid)` | moves `{x, y, w, h, vx, vy}` against a tile grid; `solid(tx, ty)` returns whether a tile blocks; sets `body.ground`, `body.ceil`, `body.wall` (-1/0/1) |

Notes on `G.tileMove`: `solid` is called with negative and out-of-range tile
indices, so bounds-check inside it. `body.ground` is true whenever the body
stands on a tile; `ceil` and `wall` only on the tick it ran into one. Never
place a body inside a solid tile (spawning, tiles that turn solid): it is
pushed out by its leading edge and will jump. The helper knows only solid
tiles — one-way and moving platforms are the game's own job (move the body
with the platform, and treat a one-way tile as solid only while the body is
falling and its feet were above the tile's top on the previous tick).

Effects (all in world coordinates; set `G.cam.x/y` if your world scrolls and
subtract it yourself when drawing):

| | |
|---|---|
| `G.burst(x, y, {n, color, speed, life, size, gravity, angle, spread, drag})` | particles |
| `G.popup(x, y, text, color)` | floating score text |
| `G.shake(magnitude, seconds)`, `G.flash(color, seconds)` | screen shake / flash |
| `G.text(str, x, y, {size, color, align, bold, glow, max, baseline})` | text in the theme font |
| `G.font(px, bold)` | CSS font string, for `ctx.font` |

Sound:

| | |
|---|---|
| `G.sfx(name)` | presets: `shoot laser boom bigboom jump coin power hit hurt bounce blip click alarm splash thrust win over` |
| `G.tone(freq, dur, {type, vol, slide, delay, attack})` | one oscillator note; `slide` glides to that frequency |
| `G.noise(dur, {vol, freq, slide, filter, q, delay})` | filtered noise: explosions, wind, engines |

The engine already plays `hurt` on a lost life, `win` on a cleared level and
`over` on game over. Do not call a sound every tick: gate continuous sounds
(engines, alarms) with a timer.

### Music

Sixteen steps make a bar. `prog` gives one chord root (a scale degree) per bar;
the pattern strings loop on their own length.

```js
music: {
    bpm: 126,                 // later levels play 2% faster each
    root: 45,                 // MIDI note of the bass register (45 = A2)
    scale: 'mixolydian',      // major minor dorian phrygian lydian mixolydian
                              // harmonic pentatonic majorpenta blues whole
    prog: [0, 3, 4, 0],
    bass: 'x..x..x.x..x.o..', // x = chord root, o = octave above, 5 = perfect fifth
    lead: ['4.4.7.4.2...4...', '5.5.7.5.3...2...'],   // scale degrees in base 36
                              // (0-9, a-z), '.' = rest, '-' = hold the note
    arp:  '0121',             // chord tones 0-3 on every step ('.' = rest)
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    leadWave: 'square', bassWave: 'triangle', arpWave: 'square', leadOct: 2
}
```

The bass and the arp follow `prog`; the lead does not — its degrees are
absolute in the scale, so write it to fit the chords. Arp tones are stacked
thirds (root, third, fifth, octave) in seven-note scales and neighbouring
scale tones in the five- and six-note ones. The tune starts on the title
screen and restarts with each level.

Write a tune that fits: the lead should be at least four bars and must not be
a copy of another game's.

## The overview menu

`shared/arcade.js` lists every game as a card: picture, title, theme and the
game's `blurb`. A card starts that game on whatever theme is active, and
quitting it returns to the menu (the engine fires a `sno-game-quit` event on
`document` when a game closes). `Esc`, the close button or a click beside the
panel closes it; the arrow keys or vi-style `h`/`j`/`k`/`l` walk the
cards. While it is open the page behind is `inert`. On a screen narrower
than 600px only the splash has the **All games** button: several themes'
headers have no room for a second one.

A new or changed game needs two things for it:

- its `blurb` repeated in the `BLURBS` list of `arcade.js` (the menu cannot
  read `game.js`, which is only fetched on first play) — `go test` fails when
  the two differ;
- its picture: `node integrationtests/games/thumbs.mjs <theme>` plays level 3
  with a seeded bot and writes `game-thumb.jpg` (320x180). Run it again after
  changing how the game looks, and commit the file.

## Testing

Requirements: node 22 or newer and Chrome or Chromium (found at the usual
paths, or set `CHROME=/path/to/chrome`). Nothing is npm-installed. A missing
browser is a failed test run, never a pass.

```sh
# Develop: launch your game, start a level, run a snippet, take a screenshot.
node integrationtests/games/play.mjs mytheme --level=3 --shot=/tmp/l3.jpg
node integrationtests/games/play.mjs mytheme --eval=/tmp/bot.js
node integrationtests/games/play.mjs mytheme --serve     # play it yourself

# Playability: the theme's bot plays the whole campaign by input only.
node integrationtests/games/campaign.mjs mytheme --shots=/tmp/shots
node integrationtests/games/campaign.mjs --touch mytheme            # phone, landscape
node integrationtests/games/campaign.mjs --touch=portrait mytheme
node integrationtests/games/campaign.mjs --levels=3 --seed=4 mytheme # one level, another seed

# Smoke tests of the engine flow, on desktop and on a phone.
node integrationtests/games/e2e.mjs mytheme --shots=/tmp/shots
node integrationtests/games/e2e.mjs --touch mytheme --shots=/tmp/shots

# The phone layout: an emulated phone (landscape, or --touch=portrait).
node integrationtests/games/play.mjs mytheme --touch --shot=/tmp/phone.jpg
```

Without theme names `campaign.mjs` and `e2e.mjs` run every game;
`campaign.mjs` then fails for any theme that has no bot (`--allow-missing`
skips those instead). `mage gamesE2E`, `mage gamesTouchE2E` and
`mage gamesCampaign` run them for all games.

### Smoke tests and playability tests

The two kinds prove different things, and a game needs both.

**`e2e.mjs` is a smoke test of the engine flow.** It plays each level with a
random bot for 15 seconds to shake out exceptions and, where that bot does
not win (it usually does not), forces the win with `debug.win()` to check the
clear, unlock, ending and save flow. A pass says nothing about whether a
level *can* be won.

**`campaign.mjs` is the playability test.** Each theme has a bot in
`integrationtests/games/bots/<theme>.js`, one expression:

```js
({
    // Called every tick of play; returns that tick's input, as debug.step takes it.
    play: function (s, G, mem) { return { right: s.ball.x > s.paddle.x, a: true }; },
    // Optional negative control (default: do nothing): must lose level 1.
    fail: function (s, G, mem) { return { a: true }; },
    budget: 300   // optional: game seconds a level may take (default 360)
})
```

`s` (the game's state) and `G` (the engine) are read-only views: the bot may
read anything to steer, but a write throws, and a bot that calls `G.win`,
`G.die`, `G.loseLife`, `G.gameOver`, `G.addScore`, `G.addLife` or any
`SnoGame.debug` hook fails the run. No forced wins, no invulnerability, no
teleports, no edits to the world: only the buttons, the mouse and taps a
player has. `mem` is the bot's own scratch object, fresh for each level.

The run, per theme: fresh cookies and a seeded `Math.random` (`--seed`), the
game launched, level 1 started from the title by a real `Enter` (a real tap
with `--touch`), each level played to its natural end, a real `Enter`/tap on
LEVEL CLEAR to go on, so levels 1 → 2 → 3 → ending run without any
`debug.start`. A game over is retried from its own screen (`--retries`,
default 2). The ending must appear, animate and hold; LEVELS on it must lead
to the title with the campaign saved, and the save must survive a reload.
Then the negative control plays level 1 with `fail` and must reach a natural
game over with lives lost. Each level prints its result, game seconds, lives
lost and retries (`--json=file` writes them); a level over its budget, a
stalled or throwing bot, an engine error or a page error fails the theme
with a screenshot, and the exit status is nonzero.

The bot drives the logical buttons through `debug.step`, which is what the
keyboard and the touch pad feed; `e2e.mjs` and `e2e.mjs --touch` prove that
real key presses and real touches reach those buttons, and `campaign.mjs
--touch` does every menu step with real taps on an emulated phone (the game
then also runs its `G.isTouch()` variant).

Before a game is done: the campaign passes on desktop and on a phone in both
orientations, `e2e.mjs` passes both ways, and you have looked at
screenshots of all three levels and the ending (`--shots`): nothing overlaps
the HUD and the goal is readable.

### What e2e.mjs checks

`e2e.mjs` checks in real Chrome: all four launchers, `Esc`, real key
presses, a canvas that draws and keeps changing with no input, pause, music,
sound effects made by the game itself (the engine's own jingles do not
count), a random bot on all three levels without exceptions, the unlock
cookie, the ending (it opens after level 3 only, animates, stops the game and
leads to the title), the level select and the cookie's survival across a
reload. Its engine checks cover save parsing and the migration of old
ten-level saves, `debug.start(4)` not starting a fourth level, Enter on level
2's clear opening level 3, the ending's input delay, PLAY AGAIN and LEVELS,
a theme's `def.ending`, and cleanup after quit and relaunch.

`e2e.mjs --touch` turns Chrome into a phone (844x390 landscape and 390x844
portrait, touch screen, coarse pointer) and uses real touch events: the game
launches from a tap on the splash button; the pad is visible, inside the
viewport, at least 48 px per button and nowhere on the canvas or the close
button; every pad button holds its key while touched and only then; two
fingers hold two buttons; a full direction pad gives diagonals and follows a
sliding thumb; a tap on the canvas starts the level and, in play, puts
`SnoGame.mouse` under the finger; `✕` quits. It checks the pad against the
game's `def.touch`, and tries the `def.touch` options themselves on a stand-in
game. It does not judge whether the game is *fun* on a phone: play a level
with `--touch` screenshots in front of you, and on a real phone if you can.

`GAMES_GPU=1 node integrationtests/games/cpu.mjs [theme…]` measures what a
game costs: frame rate, JS time per frame and Chrome's CPU use on levels 1
and 3. A game should hold 60 fps at well under one core. Its cost is mostly
the canvas calls the browser has to rasterise, not its JS: keep a frame to a
few hundred calls, draw static scenery (walls, mazes, backdrops) once into an
offscreen canvas and blit it, batch same-coloured shapes into one path, and
avoid `shadowBlur` on anything drawn many times.

`play.mjs --eval` evaluates one expression in the page. The test hooks:

| | |
|---|---|
| `SnoGame.debug.start(level)` | jump straight into play (1..3; a higher level starts level 3) |
| `SnoGame.debug.step(n, input)` | run `n` ticks synchronously; `input` is `{left, right, up, down, a, b, codes: {KeyW: true}, mouse: {x, y, down, rdown}}` or a function `(i, s, G) => input`. A button held at the end of one call and the start of the next stays held (one `G.hit` edge, not one per call); `debug.start` forgets what was held |
| `SnoGame.debug.state()` | `{screen, level, lives, score, …}`; `screen` is `play`, `clear`, `over`, `victory`, … |
| `SnoGame.debug.s()` | the game's own state object |
| `SnoGame.debug.ending()` | while the ending is on screen: `{t, choice, shells, sparks, fireworks, title}`, else `null` |
| `SnoGame.debug.errors` | exceptions thrown by `init` / `update` / `draw` |
| `SnoGame.debug.win()`, `.lose()` | force a win or a game over: engine-flow smoke tests only, never proof of playability |

Because `step` runs faster than real time, a scripted bot can play a whole
level in milliseconds; `campaign.mjs` uses exactly this, which is why a
campaign bot is the way to show a level can be won.

## The games

Each spec is the contract for that theme's game. Details may be tuned for
fun, but the core mechanic and the goal must stay. Each game has three
levels (introduction, development, finale); where a spec below still
describes a longer arc, its section is rewritten when that game is
converted.

### aurora — Polar Rush (downhill ski slalom)
Top-down downhill run under the northern lights; the slope scrolls up as the
skier descends. `← →` carve (turning bleeds speed, with inertia), `↓` tuck for
speed, `SPACE` jump (also off ramps, for airtime and points). Pass between
slalom gate flags (a miss costs time), dodge pines, rocks and ice crevasses
(crash = lose a life, short stun). Reach the finish line before the clock runs
out. Levels: longer and denser courses; side wind gusts from level 3; a yeti
that chases when you are slow from level 4; moguls and ice patches (no grip)
from level 6; an avalanche wall closing from behind from level 8; level 10 is a
storm run with everything. Draw aurora ribbons in the sky strip and snow
spray particles. Music: airy lydian arpeggios.

### biomech — Spine Crawler (centipede-style shooter)
A segmented biomechanical worm winds down through a field of bone nodes; it
turns and drops a row whenever it meets a node or a wall. The player's turret
moves freely in the bottom quarter (`arrows`), `SPACE` rapid fire. A shot
segment calcifies into a node and splits the worm in two. Clear every segment
to win the level. Also: spore droppers that fall leaving nodes, parasites that
zigzag through the player zone, a fast eye that poisons nodes. Levels: longer
and faster worms, several worms at once, regenerating nodes, and at level 10 a
Queen that spawns worms and must be shot in the head. Wet, fleshy noise-based
sounds; phrygian music.

### brutalist — Wrecking Ball (pendulum demolition)
Side view. Drive a crane along the ground (`← →`); its ball hangs on a chain
and swings as a real pendulum (drive to build momentum, `↑ ↓` reel the chain
in or out). Concrete towers are built from blocks with gravity: knock out
support and what is above falls and breaks. Damage depends on impact speed;
rebar blocks need a hard hit. Demolish the target percentage before the timer
ends. Falling slabs that hit the cab cost a life. Levels: taller and wider
structures, rebar cores, glass (bonus) floors, a second timer-fused charge
block that explodes when hit, and at level 10 a megastructure. Heavy thuds,
dust particles, industrial dorian music.

### cathedral — Gargoyle (joust-style flapping combat)
A stone gargoyle in a cathedral nave. `SPACE` flaps against gravity, `← →`
steer, the screen wraps left/right, stone ledges to land on. Collide with a
demon: whoever is higher wins; the loser bursts into a soul orb. Collect the
orb before it re-hatches into a tougher demon. Clear all demons in every wave
of the level. Holy fire along the floor kills. Levels: more waves, faster
demon tiers, bat swarms that push you, crumbling ledges, a swinging censer
hazard, and at level 10 an archdemon that needs three strikes from above.
Organ-like harmonic-minor music, bell sounds.

### cosmos — Gravity Well (asteroids with gravity)
`← →` rotate, `↑` thrust, `SPACE` fire, `X` hyperspace (risky random jump).
Ship, rocks and bullets all feel the pull of black holes and stars, so shots
curve and rocks slingshot; the screen wraps. Rocks split twice. Destroy every
rock to clear the level; falling into a well kills. Levels: more wells, a
binary pair that orbits, saucers that shoot back from level 4, a pulsar that
sweeps a deadly beam from level 7, level 10 circles a giant hole. Spacey
dorian pads and arps.

### dos — DIGGER.EXE (CGA tunnel digger)
Grid-based digging in the CGA palette (black, cyan, magenta, white) with the
DOS font. `arrows` dig through dirt, `SPACE` fires a shot down the tunnel
(slow recharge). Collect every emerald to clear the level. Enemies come out of
a corner nest and chase through tunnels; later ones dig too. Gold bags fall
when undermined (they wobble first): they crush enemies and the player, and
burst into gold if they fall far. Levels: ten maps, more and faster enemies,
more bags, digging enemies from level 5, a bonus cherry that turns the tables
for a few seconds. PC-speaker style square-wave sounds and music.

### invaders — Formation (fixed shooter)
A marching formation that speeds up as it thins, bunkers that erode where
they are hit, a bonus saucer across the top. `← →` move, `SPACE` fire (one or
two shots on screen). Destroy the formation before it lands. Levels: different
formation shapes, divers that peel off and swoop from level 3, shielded
invaders, splitting invaders, capsules (rapid, double, shield), a mothership
boss at levels 5 and 10. Classic four-note march that speeds up with the
formation, layered over the sequencer.

### matrix — Bullet Time (time moves when you move)
Top-down rooms in green code. Time runs at full speed only while the player
moves or shoots; standing still slows everything to a crawl, so bullets can be
read and dodged. `WASD`/arrows move, mouse aims and clicks to shoot
(keyboard: `SPACE` shoots toward the facing direction). One hit kills.
Agents patrol, take cover and fire; picked-up guns have limited ammo; with no
ammo, running into an agent from behind takes them down. Clear the room.
Levels: ten rooms with more walls and agents, shotgun agents, agents that
dodge, a sentinel drone that only moves in real time, level 10 is the lobby
with pillars. `lives: 1`. Digital glitch sounds, dark minor music that slows
down with time is a bonus, not a requirement.

### neon — Light Cycles (tron arena)
Grid arena. Every cycle leaves a solid wall of light; hitting any wall
destroys you. `arrows` turn, `SPACE` boost (limited charge). Outlast every AI
rider; win the required number of rounds to clear the level. Levels: more and
smarter riders (they look ahead and cut you off), faster cycles, arena
obstacles, trails that decay, a shrinking arena from level 8, level 10 is a
duel series against an expert. Neon glow, pentatonic synth lead.

### noir — Midnight Alley (crosshair gallery shooter)
A rainy alley front: windows, doors, a parked car. Gangsters pop out and take
aim (a visible draw timer); shoot them before they fire. Civilians and the
informant also appear — shooting one costs a life. Mouse moves the crosshair
(keyboard: arrows move it, `SPACE` shoots), `X` or right click reloads the
six-shot revolver. Hit the level's quota to clear it. Levels: faster draws,
more simultaneous targets, runners crossing the street, hostage shields,
drive-by cars, level 10 is the boss behind cover. Mostly black and white with
one red accent, rain particles, slow blues music with a walking bass.

### nukem — Nukem Time (run'n'gun platformer)
Side-scrolling tile levels (use `G.tileMove`). `← →` run, `↑` jump, `SPACE`
shoot, `X` throws a grenade (limited). Find the keycard, reach the exit door. Enemies: walking
grunts, turrets, flying drones. Exploding barrels chain-react. Health, ammo
power-ups (spread, rapid). Levels: ten scrolling stages built from a seeded
generator with hand-shaped chunks (gaps never wider than the jump), moving
platforms, acid pools, lifts, more enemy types, and a boss at level 10.
Player has a health bar inside each life. Loud square-wave rock riff.

### ocean — Deep Channel (submarine cave scroller)
The trench scrolls right to left. The sub has buoyancy and inertia: `↑ ↓`
ballast, `← →` trim speed. `SPACE` fires torpedoes forward, `X` drops depth
charges. Oxygen drains — collect bubble columns. Touching the cave or a
creature costs hull. Reach the end of the trench. Levels: narrower caves,
jellyfish fields, mines on chains, anglerfish that lunge, enemy subs, dark
zones lit only by the headlight, currents, a kraken boss at level 10.
Sonar pings, muffled noise, slow lydian music.

### pacmaze — Neon Maze (maze chase)
Grid maze, eat every pellet. Four ghosts with different behaviour (chaser,
ambusher, flanker, wanderer), scatter/chase phases, power pellets that turn
them vulnerable, side tunnels, bonus fruit. `arrows` steer with buffered
turns. Levels: ten different mazes (hand-drawn as strings), faster ghosts,
shorter power time, and extra twists late on (a fifth ghost, a dark level with
limited sight). The classic wakka sound, siren that rises as pellets run out.

### pinball — Electro Ball (pinball)
A real table: gravity, two flippers that add momentum when they swing
(`←` left, `→` right), `SPACE` plunger (hold to charge), pop bumpers,
slingshots, drop targets, lanes, a spinner. Ball against line segments and
circles with proper reflection and restitution; sub-step the ball so it never
tunnels through a flipper. Each level is a mission on a changed table: score
target plus a named goal (light all lanes, drop all targets, lock two balls
for multiball …). Four balls per level; losing all is game over. `↓` nudges
(too much tilts). Flipping again and again with no ball near the flippers
heats the coils until the flippers rest for a moment, so flapping blindly
does not keep a ball alive. Bells, chimes and knocker sounds; ragtime-ish major music.

### plasma — Plasma Storm (vertical bullet-hell shmup)
`arrows` move in all directions, `SPACE` fire (hold; while firing the ship
moves slower and its small hitbox is shown, for threading bullets), `X` bomb
(clears bullets, limited). Enemies arrive in scripted waves
with bullet patterns (aimed, radial, spiral). Collect plasma orbs: three of a
colour merge into a weapon upgrade (spread / beam / homing). Each level ends
with a boss with a health bar and phases. Levels: denser patterns, new enemy
types, tougher bosses. Small hitbox, generous graze. Fast driving minor music.

### retro — Carrier Lost (gravity-flip runner)
Amber monochrome. A data packet runs automatically along a phone line
corridor; `SPACE` flips gravity between floor and ceiling. Spikes, gaps,
sliding blocks and noise bursts kill. Reach the end of the line (a distance
goal, with a progress bar); a checkpoint halfway. Levels: faster scroll,
tighter patterns, moving blocks, zones where flipping is jammed for a moment,
double-speed stretches, level 10 mixes all. Deterministic layouts. Modem
handshake noises, chiptune pentatonic music.

### retrofuture — Atomic Defense (missile command)
Six domed cities and three missile batteries with limited ammunition. Mouse
aims (keyboard: arrows move the cursor), click or `SPACE` fires from the
nearest battery with ammo; the counter-missile explodes at the cursor in an
expanding blast that chains. Enemy ICBMs streak down, some split (MIRV),
smart bombs dodge blasts, saucers cross and bomb. Survive every wave of the
level with at least one city. Levels: faster and more missiles, MIRVs,
smart bombs, saucers, night levels with only trails visible; bonus city for
points. Googie styling, theremin-like sine slides, optimistic major music.

### spaceage — Orbital Dock (thrust lander)
`← →` rotate, `↑` or `SPACE` thrust. Gravity, inertia, limited fuel. Land on
the pad gently and upright (speed and angle limits shown); crash otherwise.
Terrain is a jagged cave/landscape. Levels: tighter caves, wind, moving pads,
fuel pickups, gun turrets to avoid, cargo to pick up and deliver (two
landings), low and high gravity worlds, level 10 docks with a rotating
starbase. Engine rumble, radio beeps, calm space-age music.

### surveillance — Blind Spot (stealth action)
Top-down facility. `arrows` move, `X` sprint (noisy), `SPACE` EMP pulse
(limited charges, disables nearby cameras for a few seconds). Collect every
data drive and reach the exit. Rotating cameras and patrolling guards have
vision cones blocked by walls; being seen fills a detection meter — full means
caught (lose a life). Laser tripwires that blink, pressure plates, drones that
investigate noise. Levels: ten facility layouts with more devices and tighter
timing; level 10 has a moving searchlight grid. CRT-green on black with red
alerts; tense sparse music, alarm when spotted.

### synthwave — Outrun the Sun (pseudo-3D racer)
Classic segment-projected road toward a striped sun. `← →` steer, `↑`
accelerate, `↓` brake, `SPACE` nitro. Curves push the car outward; leaving the
road slows you; hitting traffic or roadside objects costs speed. Reach the
finish before the timer hits zero; every checkpoint adds time and nitro, and
squeezing past traffic refills the tank. One life: the clock running out ends
the race. Levels: 1 *Sunset Strip* — gentle S-bends along the coast with light
traffic; 2 *Midnight Storm* — hills through a rainy night city, trucks, oil
slicks and a road that pushes harder in the bends; 3 *Outrun the Sun* — the
finale: hairpins and crests with oncoming lanes, roadworks, crosswind gusts,
oil and trucks. Each level's clock is set from what a casual driver holds
there. The ending: the car crosses the line as a striped sun sinks into a
neon grid between palm silhouettes, under neon fireworks. Engine pitch
follows speed. Driving synthwave music with a gated-snare beat.

### terminal — kill -9 (ASCII twin-stick arena shooter)
Everything is drawn as monospace glyphs in terminal green. `WASD` moves the
`@`, the arrow keys fire in eight directions (mouse aim and click also work).
Rogue processes swarm: `Z` zombies shamble, `&` forks split when shot,
`d` daemons keep distance and shoot, `>` pipes dash in lines, `#` root shells
soak damage. Pickups: `$` score, `+` life, `!` spread shot, `*` bomb. Clear
every wave in the level. Levels: 1 */bin/sh* — zombies, then splitting forks
and the first daemons; 2 *| pipeline* — pipes dashing between solid
directories, root shells, daemons, and two `[fork]` spawners that must be
destroyed; 3 *init (pid 1)* — a fork bomb whose forks grow and replicate up
to a full process table, then `init` itself, a boss that cycles rings, fans,
adopted orphans and, at half health, spirals and pipes (it wakes at the end
of the arena away from the player). The ending: a shell types out an empty
process table and a zero load average while ASCII fireworks burst above.
Bell and keyclick sounds, fast square-wave music.

### tetris — Block Blaster (quarth-style block shooter)
A wall of block rows with gaps descends from the top. The launcher at the
bottom moves by column (`← →`) and fires a block up its column (`SPACE`); the
block sticks under the lowest block there. A row with no gaps clears (line
clear), and everything above it drops. Lose a life when the wall reaches the
launcher line. Clear the level's line quota. `↓` speeds the descent for bonus
points. Levels: 1 *First Wall* — plain rows with one or two single gaps, 36
lines; 2 *Steel and Bombs* — a faster wall with wide gaps, two-row wells,
steel plates that need two hits and bombs that blast the neighbouring rows,
40 lines; 3 *Block Blaster* — the last wall, fastest, with everything plus
rows that slide sideways on a beat and surges that slam it down a cell, 44
lines. Speeds and quotas are set so a player who takes 0.7 s per shot wins
every level in one to one and a half minutes. The ending: a wall drops into
the middle of the screen and clears from the bottom up in one long combo,
each row bursting into flying blocks, under block-coloured fireworks.
Tetromino colours, chunky clear effects, a brisk minor-key folk-dance style
tune of your own.

### tropicale — Island Hopper (classic jump'n'run)
Side-scrolling tile platformer (use `G.tileMove`). `← →` run with
acceleration, `SPACE` or `↑` jump (variable height, coyote time, jump
buffering). Stomp crabs, avoid urchins (not stompable) and swooping gulls,
bounce on springy palm leaves, ride rafts across water, collect pineapples
(100 = extra life), touch checkpoint flags (each adds time to the tide
clock), reach the tiki totem. Falling in water or touching an enemy from the
side costs a life. Each level is built from a seeded chunk generator whose
chunks are clearable on their own, so gaps are always clearable. Levels:
1 *Shell Beach* — crabs, gaps, islets, urchins, a spring and a raft across a
lagoon; 2 *Glow Cave* — under a cave roof with falling stalactites, moving
planks over wide water, crumbling slabs and a coconut-throwing monkey;
3 *Totem Storm* — the finale: tide surges that flood the low beaches, gulls,
fast red crabs, a lift up a cliff and the totem at the end. The ending: an
island festival at the totem, torches, lanterns and dancing silhouettes
between palms, under tropical fireworks. Bright major-pentatonic calypso
tune.

### volcano — Magma Rising (vertical climber)
The lava rises without pause. `← →` run, `SPACE` jump, wall-jump off the
shaft walls. Climb ledges (solid, crumbling, moving), ride steam geysers,
dodge falling lava bombs and fire bats. Reach the crater rim (a height goal,
shown as a meter). Touching lava is instant death. Levels: taller shafts,
faster lava, more crumbling ledges, earthquakes that shake ledges loose,
lava-fall columns that switch on and off, level 10 is an eruption with
everything. Camera follows upward. Rumbling noise bed, urgent phrygian music.
