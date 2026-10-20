/*
 * games.js — SnoGame, the small arcade engine behind the per-theme games.
 *
 * Every theme ships one game in themes/<name>/game.js. That file is loaded
 * lazily the first time the game is launched and calls
 * SnoGame.register('<name>', def). The engine owns everything the games have
 * in common, so each game only describes its own world:
 *
 *   - a fullscreen overlay with a 960x540 canvas, scaled to fit the viewport
 *   - a fixed 60 Hz update loop (dt is always SnoGame.STEP)
 *   - keyboard / mouse / touch input, with an on-screen pad on phones that is
 *     laid out beside or below the canvas, never on top of it
 *   - Web Audio sound effects and a step-sequenced music track per game
 *   - particles, floating score popups, screen shake and flashes
 *   - small physics helpers (overlap tests, tile-grid movement)
 *   - title / level select / pause / level clear / game over screens
 *   - three levels per game, with progress saved in a cookie per game, and a
 *     celebratory ending scene (fireworks, or a theme's own) after level 3
 *
 * Esc always quits back to the blog. While a game is open, every key is
 * swallowed in the capture phase so shared.js shortcuts do not fire.
 *
 * The authoring guide, with the full API, lives in docs/games.md.
 */
(function () {
    'use strict';
    if (window.SnoGame) return;

    var W = 960, H = 540, STEP = 1 / 60, HUD_H = 30, LEVELS = 3;
    // Saves written before the three-level campaigns counted up to ten.
    var LEGACY_LEVELS = 10;

    // Theme name → game title. The launch buttons need the title before the
    // game script itself has been fetched, so the list lives here.
    var TITLES = {
        aurora: 'Polar Rush', biomech: 'Spine Crawler', breakout: 'Brick Breaker',
        brutalist: 'Wrecking Ball', cathedral: 'Gargoyle', cosmos: 'Gravity Well',
        dos: 'DIGGER.EXE', invaders: 'Formation', matrix: 'Bullet Time',
        neon: 'Light Cycles', noir: 'Midnight Alley', nukem: 'Nukem Time',
        ocean: 'Deep Channel', pacmaze: 'Neon Maze', pinball: 'Electro Ball',
        plasma: 'Plasma Storm', retro: 'Carrier Lost', retrofuture: 'Atomic Defense',
        spaceage: 'Orbital Dock', surveillance: 'Blind Spot', synthwave: 'Outrun the Sun',
        terminal: 'kill -9', tetris: 'Block Blaster', tropicale: 'Island Hopper',
        volcano: 'Magma Rising'
    };

    var G = window.SnoGame = {
        W: W, H: H, STEP: STEP, HUD: HUD_H, LEVELS: LEVELS, titles: TITLES,
        active: false, level: 1, lives: 3, score: 0, t: 0,
        cam: { x: 0, y: 0 },
        key: { left: false, right: false, up: false, down: false, a: false, b: false },
        hit: {},
        mouse: { x: W / 2, y: H / 2, down: false, hit: false, rdown: false, rhit: false },
        fontFamily: 'monospace'
    };

    var defs = {};          // theme → registered game definition
    var cur = null;         // the running game: { theme, def, s, screen, ... }
    var dom = null;         // overlay nodes: { root, canvas, ctx }
    var scale = 1;          // backing-store pixels per logical pixel
    var raf = 0, lastTime = 0, acc = 0;
    var clockHeld = false;  // debug.hold(): frames still draw, only debug.step() ticks
    var ambientWasPlaying = false;
    var errors = [];

    function noop() {}

    // ------------------------------------------------------------------
    // Math, random and overlap helpers
    // ------------------------------------------------------------------

    G.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
    G.lerp = function (a, b, t) { return a + (b - a) * t; };
    G.dist = function (ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); };
    G.rnd = function (a, b) { return a + Math.random() * (b - a); };
    G.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

    // Deterministic generator (mulberry32) so level layouts built from a seed
    // are identical on every visit.
    G.rng = function (seed) {
        var a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            var t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    // Rectangles are {x, y, w, h} with x/y at the top-left corner.
    G.aabb = function (a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    };
    G.circ = function (ax, ay, ar, bx, by, br) {
        var dx = bx - ax, dy = by - ay, r = ar + br;
        return dx * dx + dy * dy < r * r;
    };
    G.circRect = function (cx, cy, r, rx, ry, rw, rh) {
        var nx = G.clamp(cx, rx, rx + rw), ny = G.clamp(cy, ry, ry + rh);
        var dx = cx - nx, dy = cy - ny;
        return dx * dx + dy * dy < r * r;
    };
    // Closest point to (px,py) on the segment a→b; t is the 0..1 position.
    G.closestOnSeg = function (px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
        var t = len ? G.clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1) : 0;
        return { x: ax + dx * t, y: ay + dy * t, t: t };
    };

    function hitsTiles(b, ts, solid) {
        var x0 = Math.floor(b.x / ts), x1 = Math.floor((b.x + b.w - 0.001) / ts);
        var y0 = Math.floor(b.y / ts), y1 = Math.floor((b.y + b.h - 0.001) / ts);
        for (var ty = y0; ty <= y1; ty++) {
            for (var tx = x0; tx <= x1; tx++) if (solid(tx, ty)) return true;
        }
        return false;
    }

    // Snaps the body back out of the tile it just entered along one axis and
    // records which side it touched.
    function resolveAxis(b, dx, dy, ts) {
        if (dx > 0) { b.x = Math.floor((b.x + b.w) / ts) * ts - b.w; b.wall = 1; }
        else if (dx < 0) { b.x = (Math.floor(b.x / ts) + 1) * ts; b.wall = -1; }
        if (dy > 0) { b.y = Math.floor((b.y + b.h) / ts) * ts - b.h; b.ground = true; }
        else if (dy < 0) { b.y = (Math.floor(b.y / ts) + 1) * ts; b.ceil = true; }
        if (dx) b.vx = 0;
        if (dy) b.vy = 0;
    }

    function moveAxis(b, dx, dy, ts, solid) {
        // Sub-step so a fast body cannot tunnel through a tile.
        var n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (ts * 0.5)) || 1;
        for (var i = 0; i < n; i++) {
            b.x += dx / n; b.y += dy / n;
            if (hitsTiles(b, ts, solid)) { resolveAxis(b, dx, dy, ts); return; }
        }
    }

    // Moves body b ({x, y, w, h, vx, vy}) by its velocity against a tile grid
    // of size ts. solid(tx, ty) says whether a tile blocks. Afterwards
    // b.ground / b.ceil are booleans and b.wall is -1, 0 or 1.
    // b.ground is also true for a body merely resting on a tile (vy = 0), so
    // a game need not push it down every tick to learn that. solid() is
    // called with negative and out-of-range indices and must cope.
    G.tileMove = function (b, dt, ts, solid) {
        b.ground = false; b.ceil = false; b.wall = 0;
        moveAxis(b, b.vx * dt, 0, ts, solid);
        moveAxis(b, 0, b.vy * dt, ts, solid);
        if (!b.ground && b.vy >= 0) {
            // A hair-thin probe: only a body actually touching the tile
            // below counts, not one still falling toward it.
            b.ground = hitsTiles({ x: b.x, y: b.y + b.h, w: b.w, h: 0.01 }, ts, solid);
        }
    };

    // ------------------------------------------------------------------
    // Saved progress: one small cookie per game
    // ------------------------------------------------------------------

    // document.cookie itself can throw (sandboxed frames), so every access
    // is guarded: a game must still run when nothing can be saved.
    function readCookie(name) {
        try {
            var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : null;
        } catch (_) { return null; }
    }

    function writeCookie(name, value) {
        document.cookie = name + '=' + encodeURIComponent(value) +
            '; max-age=31536000; path=/; SameSite=Lax';
    }

    // Cookies are unavailable on file:// pages; localStorage keeps local
    // previews working there. The cookie is the store everywhere else.
    function storeGet(name) {
        var v = readCookie(name);
        if (v !== null) return v;
        try { return localStorage.getItem(name); } catch (_) { return null; }
    }

    function storeSet(name, value) {
        try { writeCookie(name, value); } catch (_) {}
        if (readCookie(name) === value) return;
        try { localStorage.setItem(name, value); } catch (_) {}
    }

    var MAX_SCORE = 999999999;

    // Only plain digit strings count; "4abc" or "-5" are not numbers here.
    function intIn(v, lo, hi, fallback) {
        if (!/^\d{1,9}$/.test(String(v))) return fallback;
        var n = parseInt(v, 10);
        return (n < lo || n > hi) ? fallback : n;
    }

    // Save format: "unlocked.hiscore.lastLevel.won". Anything malformed or
    // out of range falls back to a fresh save rather than being trusted.
    // A save from the old ten-level campaigns (levels up to 10) migrates:
    // its levels are capped at LEVELS, so a player who had got past level 3
    // finds all three open, and the high score and completed star are kept.
    function parseSave(raw) {
        var p = String(raw || '').split('.');
        var save = {
            unlocked: Math.min(LEVELS, intIn(p[0], 1, LEGACY_LEVELS, 1)),
            hi: intIn(p[1], 0, MAX_SCORE, 0),
            last: Math.min(LEVELS, intIn(p[2], 1, LEGACY_LEVELS, 1)),
            won: intIn(p[3], 0, 1, 0)
        };
        if (save.last > save.unlocked) save.last = save.unlocked;
        return save;
    }

    function loadSave(theme) { return parseSave(storeGet('snog_' + theme)); }

    function writeSave() {
        if (!cur) return;
        var s = cur.save;
        if (G.score > s.hi) s.hi = Math.min(MAX_SCORE, Math.floor(G.score));
        storeSet('snog_' + cur.theme, [s.unlocked, s.hi, s.last, s.won].join('.'));
    }

    // ------------------------------------------------------------------
    // Audio: sound effects
    // ------------------------------------------------------------------

    var actx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
    var muted = storeGet('snog_mute') === '1';
    // Counters for the e2e test: `sfx` counts sounds a game asked for itself,
    // as opposed to notes the music sequencer scheduled.
    var audioStats = { tones: 0, noises: 0, musicSteps: 0, sfx: 0, engineSfx: 0 };
    var audioHeld = false;   // true while paused, hidden or quit: nothing may resume the context
    var engineSound = false; // true while the engine itself plays a jingle

    function audio() {
        // No sound once the game is closed, even if a game calls G.tone late.
        if (!G.active) return null;
        if (!actx) {
            try {
                actx = new (window.AudioContext || window.webkitAudioContext)();
                master = actx.createGain();
                master.gain.value = muted ? 0 : 1;
                master.connect(actx.destination);
                musicBus = actx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
                sfxBus = actx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
            } catch (_) { actx = null; return null; }
        }
        if (actx.state === 'suspended' && !audioHeld) actx.resume().catch(noop);
        return actx;
    }

    // Freezes or releases all sound. Pausing, a hidden tab and quitting hold
    // the context so neither the music pump nor a key press can restart it.
    function holdAudio(on) {
        audioHeld = on;
        if (!actx) return;
        if (on) actx.suspend().catch(noop); else actx.resume().catch(noop);
    }

    // Quitting closes the context outright. Suspending it would only freeze
    // the clock, and notes already scheduled (a jingle, the music lookahead)
    // would then play over the next game's title screen.
    function closeAudio() {
        if (actx) actx.close().catch(noop);
        actx = null; master = null; musicBus = null; sfxBus = null; noiseBuf = null;
        audioHeld = false;
    }

    function countSfx(o) {
        if (o.bus) return;
        if (engineSound) audioStats.engineSfx++; else audioStats.sfx++;
    }

    // Engine jingles (hurt, win, over, menu blips) are kept out of the game's
    // own sfx count so the e2e test can tell a silent game from a noisy engine.
    function engineSfx(name) {
        engineSound = true;
        G.sfx(name);
        engineSound = false;
    }

    // Shared attack/decay envelope for both oscillators and noise.
    function envelope(c, t, dur, vol, attack) {
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + (attack || 0.005));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        return g;
    }

    // G.tone(freq, dur, {type, vol, slide, delay, attack}) plays one
    // oscillator note; `slide` glides the pitch to that frequency.
    G.tone = function (freq, dur, o) {
        var c = audio();
        if (!c) return;
        o = o || {};
        audioStats.tones++;
        countSfx(o);
        var t = c.currentTime + (o.delay || 0);
        var osc = c.createOscillator();
        var g = envelope(c, t, dur, o.vol == null ? 0.2 : o.vol, o.attack);
        osc.type = o.type || 'square';
        osc.frequency.setValueAtTime(Math.max(1, freq), t);
        if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slide), t + dur);
        osc.connect(g); g.connect(o.bus || sfxBus);
        osc.start(t); osc.stop(t + dur + 0.03);
    };

    function noiseBuffer(c) {
        if (noiseBuf) return noiseBuf;
        noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return noiseBuf;
    }

    // G.noise(dur, {vol, freq, slide, filter, q, delay, attack}) plays filtered
    // white noise: explosions, hats, wind, engines.
    G.noise = function (dur, o) {
        var c = audio();
        if (!c) return;
        o = o || {};
        audioStats.noises++;
        countSfx(o);
        var t = c.currentTime + (o.delay || 0);
        var src = c.createBufferSource(), f = c.createBiquadFilter();
        var g = envelope(c, t, dur, o.vol == null ? 0.25 : o.vol, o.attack);
        src.buffer = noiseBuffer(c); src.loop = true;
        f.type = o.filter || 'lowpass';
        f.Q.value = o.q || 1;
        f.frequency.setValueAtTime(o.freq || 1200, t);
        if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
        src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
        src.start(t); src.stop(t + dur + 0.03);
    };

    // Ready-made effects every game can use; games add their own flavour by
    // calling G.tone / G.noise directly.
    var SFX = {
        shoot: function () { G.tone(880, 0.09, { slide: 220, vol: 0.12 }); },
        laser: function () { G.tone(1400, 0.16, { type: 'sawtooth', slide: 180, vol: 0.1 }); },
        boom: function () { G.noise(0.35, { freq: 900, slide: 60, vol: 0.35 }); },
        bigboom: function () {
            G.noise(0.8, { freq: 1400, slide: 40, vol: 0.45 });
            G.tone(90, 0.6, { type: 'sine', slide: 30, vol: 0.4 });
        },
        jump: function () { G.tone(260, 0.16, { slide: 620, vol: 0.14 }); },
        coin: function () {
            G.tone(988, 0.07, { vol: 0.13 });
            G.tone(1319, 0.2, { vol: 0.13, delay: 0.07 });
        },
        power: function () {
            [523, 659, 784, 1047].forEach(function (f, i) {
                G.tone(f, 0.12, { type: 'triangle', vol: 0.16, delay: i * 0.06 });
            });
        },
        hit: function () { G.tone(200, 0.08, { slide: 90, vol: 0.18 }); },
        hurt: function () {
            G.tone(320, 0.3, { type: 'sawtooth', slide: 60, vol: 0.22 });
            G.noise(0.2, { freq: 600, vol: 0.2 });
        },
        bounce: function () { G.tone(440, 0.05, { type: 'triangle', vol: 0.15 }); },
        blip: function () { G.tone(660, 0.04, { vol: 0.1 }); },
        click: function () { G.tone(1200, 0.02, { vol: 0.08 }); },
        alarm: function () {
            G.tone(700, 0.18, { vol: 0.14 });
            G.tone(520, 0.18, { vol: 0.14, delay: 0.18 });
        },
        splash: function () { G.noise(0.3, { filter: 'bandpass', freq: 500, slide: 2500, vol: 0.2 }); },
        thrust: function () { G.noise(0.12, { freq: 400, vol: 0.12 }); },
        win: function () {
            [523, 659, 784, 1047, 1319].forEach(function (f, i) {
                G.tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.11 });
            });
        },
        over: function () {
            [392, 330, 262, 196].forEach(function (f, i) {
                G.tone(f, 0.32, { type: 'sawtooth', vol: 0.14, delay: i * 0.2 });
            });
        }
    };

    G.sfx = function (name) { if (SFX[name]) SFX[name](); };

    function setMuted(on) {
        muted = !!on;
        storeSet('snog_mute', muted ? '1' : '0');
        if (master && actx) master.gain.setTargetAtTime(muted ? 0 : 1, actx.currentTime, 0.02);
    }

    // ------------------------------------------------------------------
    // Audio: step-sequenced music
    // ------------------------------------------------------------------
    //
    // A game describes its tune in def.music; see docs/games.md for the
    // format. Sixteen steps make one bar, `prog` holds one chord root (a
    // scale degree) per bar, and the pattern strings loop independently.

    var SCALES = {
        major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
        dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
        lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
        harmonic: [0, 2, 3, 5, 7, 8, 11], pentatonic: [0, 3, 5, 7, 10],
        majorpenta: [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10],
        whole: [0, 2, 4, 6, 8, 10]
    };
    var music = { def: null, step: 0, next: 0, timer: 0, spb: 0.12 };

    function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

    // semis shifts the result by plain semitones (used for a true fifth).
    function scaleHz(m, degree, octave, semis) {
        var sc = SCALES[m.scale] || SCALES.minor, n = sc.length;
        var oct = Math.floor(degree / n), idx = ((degree % n) + n) % n;
        return midiHz((m.root || 45) + 12 * (oct + octave) + sc[idx] + (semis || 0));
    }

    function scaleLen(m) { return (SCALES[m.scale] || SCALES.minor).length; }

    function patAt(p, i) {
        if (!p) return '.';
        if (Array.isArray(p)) p = p.join('');
        return p.length ? p.charAt(i % p.length) : '.';
    }

    // A note is held for as many steps as there are '-' characters after it.
    function heldSteps(p, i) {
        if (Array.isArray(p)) p = p.join('');
        var n = 1;
        while (n < 16 && p.charAt((i + n) % p.length) === '-') n++;
        return n;
    }

    function playBass(m, i, t, root) {
        var ch = patAt(m.bass, i);
        if (ch === '.' || ch === '-') return;
        // 'x' plays the chord root, 'o' the octave above it, '5' a perfect
        // fifth above it (in semitones, so it is right in every scale).
        G.tone(scaleHz(m, root, ch === 'o' ? 1 : 0, ch === '5' ? 7 : 0), music.spb * 1.8, {
            type: m.bassWave || 'triangle', vol: 0.3, bus: musicBus, delay: t
        });
    }

    function playLead(m, i, t) {
        var ch = patAt(m.lead, i);
        if (ch === '.' || ch === '-') return;
        var deg = parseInt(ch, 36);
        if (isNaN(deg)) return;
        G.tone(scaleHz(m, deg, m.leadOct == null ? 2 : m.leadOct), music.spb * heldSteps(m.lead, i) * 0.95, {
            type: m.leadWave || 'square', vol: 0.13, bus: musicBus, delay: t
        });
    }

    function playArp(m, i, t, root) {
        var ch = patAt(m.arp, i);
        if (ch === '.' || ch === '-') return;
        // Chord tones are stacked thirds in seven-note scales; five- and
        // six-note scales use neighbouring scale tones, which stay consonant.
        var n = scaleLen(m), steps = n === 7 ? [0, 2, 4, 7] : [0, 1, 2, n];
        var tone = steps[parseInt(ch, 10) % 4] || 0;
        G.tone(scaleHz(m, root + tone, 1), music.spb * 0.9, {
            type: m.arpWave || 'square', vol: 0.06, bus: musicBus, delay: t
        });
    }

    function playDrums(m, i, t) {
        var d = m.drums || {};
        if (patAt(d.k, i) === 'x') G.tone(150, 0.14, { type: 'sine', slide: 40, vol: 0.5, bus: musicBus, delay: t });
        if (patAt(d.s, i) === 'x') G.noise(0.12, { filter: 'bandpass', freq: 1800, vol: 0.22, bus: musicBus, delay: t });
        if (patAt(d.h, i) === 'x') G.noise(0.035, { filter: 'highpass', freq: 7000, vol: 0.09, bus: musicBus, delay: t });
    }

    function musicStep(i, when) {
        var m = music.def, t = Math.max(0, when - actx.currentTime);
        var prog = m.prog && m.prog.length ? m.prog : [0];
        var root = prog[Math.floor(i / 16) % prog.length];
        audioStats.musicSteps++;
        playBass(m, i, t, root);
        playLead(m, i, t);
        playArp(m, i, t, root);
        playDrums(m, i, t);
    }

    // Schedules a little ahead of the audio clock so timing stays tight even
    // when the main thread is busy drawing.
    function musicPump() {
        if (!music.def || !actx || audioHeld) return;
        // After a stall (busy page, throttled tab) drop the missed steps
        // rather than playing them all at once.
        if (music.next < actx.currentTime) {
            var missed = Math.ceil((actx.currentTime - music.next) / music.spb);
            music.step += missed; music.next += missed * music.spb;
        }
        while (music.next < actx.currentTime + 0.15) {
            musicStep(music.step, music.next);
            music.step++;
            music.next += music.spb;
        }
    }

    function musicStop() {
        if (music.timer) clearInterval(music.timer);
        music.timer = 0; music.def = null;
    }

    // Later levels play the same tune slightly faster to raise the pressure.
    function musicStart(def, level) {
        musicStop();
        var c = audio();
        if (!c || !def) return;
        music.def = def; music.step = 0;
        music.spb = 60 / ((def.bpm || 120) * (1 + 0.02 * (level - 1))) / 4;
        music.next = c.currentTime + 0.08;
        music.timer = setInterval(musicPump, 30);
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------

    // Physical key (KeyboardEvent.code) → logical button. Games that need the
    // two halves separately (twin-stick) read G.down(code) instead.
    var LOGICAL = {
        ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
        Space: 'a', KeyZ: 'a', KeyJ: 'a',
        KeyX: 'b', KeyK: 'b', ShiftLeft: 'b', ShiftRight: 'b'
    };
    var rawDown = {}, rawHit = {};

    G.down = function (code) { return !!rawDown[code]; };
    G.pressed = function (code) { return !!rawHit[code]; };

    function refreshLogical() {
        var k = G.key, name;
        for (name in k) k[name] = false;
        for (var code in LOGICAL) if (rawDown[code]) k[LOGICAL[code]] = true;
    }

    function setRaw(code, on) {
        if (on && !rawDown[code]) {
            rawHit[code] = true;
            if (LOGICAL[code]) G.hit[LOGICAL[code]] = true;
        }
        rawDown[code] = on;
        refreshLogical();
    }

    function clearInput() {
        rawDown = {}; rawHit = {}; G.hit = {};
        G.mouse.down = G.mouse.hit = G.mouse.rdown = G.mouse.rhit = false;
        activePointer = null;
        resetPad();
        refreshLogical();
    }

    // Edge-triggered state lives for exactly one update tick.
    function endTick() {
        rawHit = {}; G.hit = {};
        G.mouse.hit = false; G.mouse.rhit = false;
    }

    function isBrowserShortcut(e) {
        return e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.key);
    }

    // Keys still held when the game quit. Their auto-repeat would otherwise
    // reach the blog (a held arrow key would turn the page).
    var lingering = {};

    function onKeyDown(e) {
        if (!G.active) {
            if (lingering[e.code] && e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); }
            else delete lingering[e.code];
            return;
        }
        // The blog must never see a key while a game is open, modifiers or
        // not; real browser shortcuts still keep their default action.
        e.stopImmediatePropagation();
        if (isBrowserShortcut(e)) return;
        e.preventDefault();
        if (e.code === 'Escape') { G.quit(); return; }
        if (e.repeat || !cur) return;
        audio();
        if (e.code === 'KeyM') { setMuted(!muted); return; }
        if (e.code === 'KeyP' && (cur.screen === 'play' || cur.screen === 'paused')) { togglePause(); return; }
        setRaw(e.code, true);
        if (cur.screen !== 'play') menuKey(e.code);
    }

    function onKeyUp(e) {
        delete lingering[e.code];
        if (!G.active) return;
        // preventDefault too: some browsers activate a focused button on the
        // Space keyup alone.
        e.preventDefault(); e.stopImmediatePropagation();
        setRaw(e.code, false);
    }

    function pointerPos(e) {
        var r = dom.canvas.getBoundingClientRect();
        G.mouse.x = G.clamp((e.clientX - r.left) / r.width * W, 0, W);
        G.mouse.y = G.clamp((e.clientY - r.top) / r.height * H, 0, H);
    }

    // Button state comes from e.buttons, not from which event fired: with two
    // buttons held, the second press and the first release arrive as
    // pointermove, so tracking down/up events alone leaves buttons stuck.
    function syncButtons(e) {
        var left = !!(e.buttons & 1), right = !!(e.buttons & 2), m = G.mouse;
        var leftHit = left && !m.down;
        if (leftHit) m.hit = true;
        if (right && !m.rdown) m.rhit = true;
        m.down = left; m.rdown = right;
        return leftHit;
    }

    // The pointer that pressed on the canvas owns the "mouse" until it lifts.
    // Without this a second finger (on the touch pad, say) reports buttons=0
    // on its own release and would fake a release and a fresh click.
    var activePointer = null;

    function foreignPointer(e) { return activePointer !== null && e.pointerId !== activePointer; }

    function onPointerDown(e) {
        e.preventDefault();
        audio();
        if (foreignPointer(e)) return;
        activePointer = e.pointerId;
        pointerPos(e);
        if (syncButtons(e) && cur && cur.screen !== 'play') menuClick();
    }

    // A pointer that never pressed on the canvas only moves the cursor: its
    // buttons are not ours (a drag in from the letterbox would otherwise
    // leave a button stuck, since its release is ignored too).
    function onPointerMove(e) {
        if (foreignPointer(e)) return;
        pointerPos(e);
        if (activePointer === null) return;
        syncButtons(e);
        if (!e.buttons) activePointer = null;
    }

    function onPointerUp(e) {
        if (e.pointerId !== activePointer) return;
        syncButtons(e);
        if (!e.buttons) activePointer = null;
    }

    // ------------------------------------------------------------------
    // Touch pad
    // ------------------------------------------------------------------
    //
    // On a coarse-pointer device (a phone) the overlay grows an on-screen
    // pad: a direction pad for the left thumb, action buttons for the right.
    // Every button simply holds a key code, so a game sees the pad exactly
    // as it sees the keyboard. A game tunes the pad with def.touch:
    //
    //   { a: 'JUMP', b: 'BOMB', hide: ['up', 'down'], twin: true, dirs: 4 }
    //
    // a / b relabel the action buttons, hide drops buttons the game does not
    // use (left right up down a b; all six leaves a tap-only game with just
    // the close button), and twin turns the left pad into W A S D and adds a
    // second direction pad on the right that sends the arrow keys, for
    // twin-stick games that read the two halves with G.down(code). dirs: 4
    // makes a direction pad report one direction at a time (grid and maze
    // games) instead of the default eight with diagonals.
    //
    // Where the pad goes is decided in resize(): it never covers the canvas.

    var ARROWS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
    var WASD = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' };
    var GLYPH = { left: '◀', right: '▶', up: '▲', down: '▼' };
    // Eight 45° sectors clockwise from "right" (screen y grows downward).
    var SECTORS = [['right'], ['right', 'down'], ['down'], ['down', 'left'],
        ['left'], ['left', 'up'], ['up'], ['up', 'right']];
    var PAD_GAP = 8, CLOSE_W = 48, CLOSE_H = 44, DEAD_ZONE = 0.18;
    var pad = null;         // { el, move, fire, act, parts } while a pad is on screen

    // Whether the player is on a touch screen. The media query alone is not
    // enough: some phones' browsers report a fine pointer (Chrome in the
    // stock Android emulator does), which left a tap-launched game with no
    // pad at all. So the last thing the visitor did also counts: a finger on
    // the screen means touch until a key or a mouse button says otherwise
    // (a laptop with a touch screen gets the pad only when it is touched).
    var lastTouch = false;

    function isCoarse() {
        return lastTouch || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    }

    // SnoGame.isTouch() — true when the pad is the player's controls. Games
    // ask this (in init) to pick their phone variant.
    G.isTouch = isCoarse;

    // The class lets the stylesheet give fingers bigger launch buttons on
    // devices whose media queries deny having a touch screen.
    function notePointer(e) {
        if (e.pointerType === 'touch') lastTouch = true;
        else if (e.pointerType === 'mouse') lastTouch = false;
        document.documentElement.classList.toggle('sno-touch', lastTouch);
    }

    // A first finger on a game that opened without a pad (launched by key or
    // mouse on a touch-screen laptop) brings the pad up. Fullscreen is asked
    // for here because this tap is the user gesture browsers require.
    function onFirstTouch(e) {
        notePointer(e);
        if (!lastTouch || pad || !dom || !cur) return;
        setupPad(cur.def && cur.def.touch);
        if (pad) enterFullscreen(dom.root);
    }

    function padConfig(t) {
        t = t || {};
        var hide = {};
        (t.hide || []).forEach(function (name) { hide[name] = true; });
        return { a: String(t.a || 'A'), b: String(t.b || 'B'), hide: hide, twin: !!t.twin, four: t.dirs === 4 };
    }

    function padButton(parent, code, label, name) {
        var b = document.createElement('span');
        // Word labels ("JUMP") need smaller type than a glyph or one letter.
        b.className = 'sno-game-btn sno-game-btn-' + name + (label.length > 2 ? ' sno-game-btn-long' : '');
        b.setAttribute('data-code', code);
        b.textContent = label;
        parent.appendChild(b);
        return b;
    }

    // In menus the pad works like the keyboard: A confirms, left/right pick
    // the level.
    function pressCode(code) {
        audio();
        setRaw(code, true);
        if (cur && cur.screen !== 'play') menuKey(code);
    }

    // Makes part p hold exactly the codes in `want`, pressing and releasing
    // only what changed, so a thumb resting on a button is one press.
    function holdCodes(p, want) {
        var code;
        for (code in p.held) {
            if (want[code]) continue;
            delete p.held[code];
            p.btn[code].classList.remove('on');
            setRaw(code, false);
        }
        for (code in want) {
            if (p.held[code] || !p.btn[code]) continue;
            p.held[code] = true;
            p.btn[code].classList.add('on');
            pressCode(code);
        }
    }

    // Each part (a direction pad, or one action button) follows the one
    // pointer that pressed it and ignores every other finger. That is what
    // makes multi-touch work: holding a direction and tapping A are two
    // pointers on two parts, and neither release can cancel the other.
    function trackPointer(el, p, wanted) {
        el.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            if (p.pointer !== null) return;
            p.pointer = e.pointerId;
            // Touch pointers are captured by the browser already; this keeps
            // a mouse drag (desktop touch emulation) attached as well.
            try { el.setPointerCapture(e.pointerId); } catch (_) {}
            holdCodes(p, wanted(e));
        });
        el.addEventListener('pointermove', function (e) {
            if (e.pointerId === p.pointer) holdCodes(p, wanted(e));
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
            el.addEventListener(ev, function (e) {
                if (e.pointerId !== p.pointer) return;
                p.pointer = null;
                holdCodes(p, {});
            });
        });
    }

    // Which directions a touch at (e.clientX, e.clientY) means on pad d. A
    // full pad is a real 8-way stick: the angle from its centre picks one of
    // eight sectors, so the corners are diagonals and a thumb can slide from
    // one direction to the next without lifting. With dirs: 4 the sectors
    // are the four quarters, so a thumb slightly off axis in a maze still
    // means one direction. A pad with one axis hidden only looks at which
    // half was touched.
    function dpadWanted(d, e) {
        var r = d.el.getBoundingClientRect(), want = {}, names;
        var dx = (e.clientX - r.left) / r.width * 2 - 1, dy = (e.clientY - r.top) / r.height * 2 - 1;
        if (d.x && d.y) {
            if (Math.hypot(dx, dy) < DEAD_ZONE) return want;
            // Every second sector is a cardinal: step by 90° to skip the diagonals.
            var step = d.four ? Math.PI / 2 : Math.PI / 4;
            names = SECTORS[Math.round(Math.atan2(dy, dx) / step) * (d.four ? 2 : 1) & 7];
        } else {
            names = [d.x ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')];
        }
        names.forEach(function (n) { if (d.codes[n]) want[d.codes[n]] = true; });
        return want;
    }

    // Builds one direction pad sending `codes`; null when the game hides all
    // four directions.
    function buildDpad(parent, codes, cfg, kind) {
        var el = document.createElement('div'), hide = cfg.hide;
        var d = { el: el, codes: {}, btn: {}, held: {}, pointer: null, four: cfg.four };
        ['up', 'left', 'right', 'down'].forEach(function (n) {
            if (hide[n]) return;
            d.codes[n] = codes[n];
            d.btn[codes[n]] = padButton(el, codes[n], GLYPH[n], n);
        });
        d.x = !!(d.codes.left || d.codes.right);
        d.y = !!(d.codes.up || d.codes.down);
        if (!d.x && !d.y) return null;
        // A pad with one axis is just two buttons side by side or stacked.
        d.cols = d.x ? (d.y ? 3 : 2) : 1;
        d.rows = d.y ? (d.x ? 3 : 2) : 1;
        el.className = 'sno-game-dpad sno-game-dpad-' + kind +
            (d.x && d.y ? '' : (d.x ? ' sno-game-dpad-h' : ' sno-game-dpad-v'));
        trackPointer(el, d, function (e) { return dpadWanted(d, e); });
        parent.appendChild(el);
        return d;
    }

    // Builds the action buttons (B before A, so A ends up under the thumb);
    // null when the game hides both.
    function buildActions(parent, cfg) {
        var el = document.createElement('div'), parts = [];
        el.className = 'sno-game-acts';
        el.style.gap = PAD_GAP + 'px';
        [['b', 'KeyX'], ['a', 'Space']].forEach(function (a) {
            if (cfg.hide[a[0]]) return;
            var p = { btn: {}, held: {}, pointer: null }, want = {};
            p.btn[a[1]] = padButton(el, a[1], cfg[a[0]], a[0]);
            want[a[1]] = true;
            trackPointer(p.btn[a[1]], p, function () { return want; });
            parts.push(p);
        });
        if (!parts.length) return null;
        parent.appendChild(el);
        return { el: el, n: parts.length, parts: parts };
    }

    function buildPad(root, cfg) {
        var el = document.createElement('div');
        el.className = 'sno-game-pad';
        el.setAttribute('aria-hidden', 'true');
        var p = { el: el };
        p.move = buildDpad(el, cfg.twin ? WASD : ARROWS, cfg, 'move');
        p.fire = cfg.twin ? buildDpad(el, ARROWS, cfg, 'fire') : null;
        p.act = buildActions(el, cfg);
        p.parts = [p.move, p.fire].filter(Boolean).concat(p.act ? p.act.parts : []);
        root.appendChild(el);
        return p;
    }

    // Forgets every finger on the pad. clearInput() has already dropped the
    // keys themselves; this keeps the pad's own bookkeeping in step.
    function resetPad() {
        if (!pad) return;
        pad.parts.forEach(function (p) {
            for (var code in p.held) p.btn[code].classList.remove('on');
            p.held = {}; p.pointer = null;
        });
    }

    // (Re)builds the pad for a game's def.touch. It runs once with the
    // default pad when the overlay opens, so the loading screen already has
    // the final layout, and again when the game has registered.
    function setupPad(touchDef) {
        if (pad) {
            pad.parts.forEach(function (p) { holdCodes(p, {}); });
            pad.el.remove();
            pad = null;
        }
        if (isCoarse()) pad = buildPad(dom.root, padConfig(touchDef));
        // A phone has no Esc key to name.
        dom.close.textContent = pad ? '✕' : '✕ ESC';
        resize();
    }

    // --- pad layout: pure geometry, applied by resize() ---

    // A pad cell is normally at least 48 CSS px, the smallest target a thumb
    // hits reliably. Only where that would leave next to no playfield (a very
    // small phone held sideways, or two direction pads on a small one) may it
    // shrink, down to MIN_UNIT, until the canvas is MIN_CANVAS_W wide.
    var MIN_UNIT = 40, MIN_CANVAS_W = 280;

    function box(x, y, size) { return { x: x, y: y, w: size.w, h: size.h }; }

    // Preferred cell size: it follows the short side of the screen.
    function padUnit(vw, vh) { return G.clamp(Math.round(Math.min(vw, vh) * 0.135), 48, 68); }

    // Pixel sizes of the pad's parts for cell size c. `column` stacks the
    // action buttons instead of putting them side by side.
    function padSizes(c, column) {
        var b = Math.round(c * 1.15);
        var dsize = function (d) { return d ? { w: d.cols * c, h: d.rows * c } : { w: 0, h: 0 }; };
        var n = pad.act ? pad.act.n : 0, run = n * b + Math.max(0, n - 1) * PAD_GAP;
        var act = !n ? { w: 0, h: 0 } : (column ? { w: b, h: run } : { w: run, h: b });
        return { c: c, column: column, move: dsize(pad.move), fire: dsize(pad.fire), act: act };
    }

    // Largest 16:9 canvas inside the given area, centred (or top-aligned).
    function fitCanvas(x, y, w, h, top) {
        var fit = Math.min(w / W, h / H);
        if (!(fit > 0)) return null;
        var cw = Math.floor(W * fit), ch = Math.floor(H * fit);
        return { x: Math.floor(x + (w - cw) / 2), y: top ? y : Math.floor(y + (h - ch) / 2), w: cw, h: ch, fit: fit };
    }

    // The right-hand parts, right-aligned at xr with the main one (the fire
    // pad of a twin-stick game, else the action buttons) starting at y. A
    // twin-stick game's action buttons sit above its fire pad.
    function placeRight(z, xr, y, out) {
        if (z.fire.w) {
            out.fire = box(xr - z.fire.w, y, z.fire);
            if (z.act.w) out.act = box(xr - z.act.w, y - PAD_GAP - z.act.h, z.act);
        } else if (z.act.w) {
            out.act = box(xr - z.act.w, y, z.act);
        }
        return out;
    }

    // Height of the action buttons above a fire pad (0 without that pair).
    function actsAbove(z) { return z.fire.w && z.act.w ? z.act.h + PAD_GAP : 0; }

    // Landscape: gutters left and right of the canvas. Direction pad in the
    // left one; close button, action buttons and fire pad in the right one.
    // Null when a gutter's contents are taller than the screen.
    function sideLayout(vw, vh, c) {
        var z = padSizes(c, !pad.fire);
        var left = z.move.w ? z.move.w + 2 * PAD_GAP : 0;
        var right = Math.max(z.act.w, z.fire.w, CLOSE_W) + 2 * PAD_GAP;
        var mainH = z.fire.h || z.act.h, top = CLOSE_H + 2 * PAD_GAP + actsAbove(z);
        if (top + mainH + PAD_GAP > vh || z.move.h + 2 * PAD_GAP > vh) return null;
        var canvas = fitCanvas(left, 0, vw - left - right, vh, false);
        if (!canvas) return null;
        // A little below the middle is where thumbs rest on a phone held
        // sideways; the right side also has to stay under the close button.
        var rest = function (h, min) { return Math.round(G.clamp(vh * 0.58 - h / 2, min, vh - h - PAD_GAP)); };
        var out = { z: z, canvas: canvas, close: { x: vw - PAD_GAP - CLOSE_W, y: PAD_GAP, w: CLOSE_W, h: CLOSE_H } };
        if (z.move.w) out.move = box(PAD_GAP, rest(z.move.h, PAD_GAP), z.move);
        return placeRight(z, vw - PAD_GAP, rest(mainH, top), out);
    }

    // Portrait: canvas across the top, the close button right under it, and
    // the pad centred in what is left below (bottoms aligned). Null when the
    // pad is wider than the screen or leaves the canvas no height.
    function belowLayout(vw, vh, c) {
        var z = padSizes(c, false);
        var mainH = z.fire.h || z.act.h, padH = Math.max(z.move.h, mainH + actsAbove(z));
        if (z.move.w + Math.max(z.act.w, z.fire.w) + 3 * PAD_GAP > vw) return null;
        var closeRow = CLOSE_H + 2 * PAD_GAP;
        var canvas = fitCanvas(0, 0, vw, vh - closeRow - padH - PAD_GAP, true);
        if (!canvas) return null;
        var free = canvas.h + closeRow, bottom = Math.round(free + (vh - free + padH) / 2);
        var out = { z: z, canvas: canvas, close: { x: vw - PAD_GAP - CLOSE_W, y: canvas.h + PAD_GAP, w: CLOSE_W, h: CLOSE_H } };
        if (z.move.w) out.move = box(PAD_GAP, bottom - z.move.h, z.move);
        return placeRight(z, vw - PAD_GAP, bottom - mainH, out);
    }

    // Whichever arrangement leaves the bigger playfield wins: beside the
    // canvas on a phone held sideways, below it on one held upright (and on
    // a tablet, where there is room under a full-width canvas either way).
    function roomiest(a, b) {
        if (!a || !b) return a || b;
        return a.canvas.w >= b.canvas.w ? a : b;
    }

    // The layout for a viewport, or null when no pad fits at all. Starts at
    // the comfortable cell size and shrinks it only while the canvas would
    // otherwise be narrower than MIN_CANVAS_W.
    function padLayout(vw, vh) {
        var best = null;
        for (var c = padUnit(vw, vh); c >= MIN_UNIT; c -= 4) {
            best = roomiest(best, roomiest(sideLayout(vw, vh, c), belowLayout(vw, vh, c)));
            if (best && best.canvas.w >= MIN_CANVAS_W) break;
        }
        return best;
    }

    function placeEl(el, r) {
        el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
        el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
    }

    function unplaceEl(el) { el.style.left = el.style.top = el.style.width = el.style.height = ''; }

    // Applies a layout from padLayout(). Without one (a viewport too small
    // for any pad) the pad is hidden and the plain centred canvas is used,
    // so whatever an earlier layout pinned in place is let go again.
    function applyPadLayout(lay) {
        dom.root.classList.toggle('sno-game-touch', !!lay);
        pad.el.style.display = lay ? '' : 'none';
        if (!lay) { unplaceEl(dom.canvas); unplaceEl(dom.close); return; }
        placeEl(dom.canvas, lay.canvas);
        placeEl(dom.close, lay.close);
        pad.el.style.fontSize = Math.round(lay.z.c * 0.38) + 'px';
        if (pad.move) placeEl(pad.move.el, lay.move);
        if (pad.fire) placeEl(pad.fire.el, lay.fire);
        if (pad.act) {
            pad.act.el.style.flexDirection = lay.z.column ? 'column' : 'row';
            placeEl(pad.act.el, lay.act);
        }
    }

    // Phones get the whole screen, turned sideways where the browser allows
    // it. Both are requests a browser may refuse (iOS Safari has neither,
    // and a lock needs fullscreen first); a refusal changes nothing, since
    // the resize-driven layout copes with any viewport.
    function lockLandscape() {
        try {
            var o = window.screen && screen.orientation;
            if (o && o.lock) o.lock('landscape').catch(noop);
        } catch (_) {}
    }

    function enterFullscreen(root) {
        try {
            var req = root.requestFullscreen || root.webkitRequestFullscreen;
            if (!req) return;
            var p = req.call(root, { navigationUI: 'hide' });
            if (p && p.then) p.then(lockLandscape).catch(noop);
        } catch (_) {}
    }

    // Only leaves a fullscreen this overlay itself entered.
    function leaveFullscreen(root) {
        try {
            var el = document.fullscreenElement || document.webkitFullscreenElement;
            if (el !== root) return;
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
            var p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            if (p && p.catch) p.catch(noop);
        } catch (_) {}
    }

    // ------------------------------------------------------------------
    // Effects: particles, popups, shake, flash
    // ------------------------------------------------------------------

    var particles = [], popups = [], shake = { mag: 0, t: 0 }, flash = { color: '#fff', t: 0, max: 0 };
    var MAX_PARTICLES = 600;

    // G.burst(x, y, {n, color, speed, life, size, gravity, angle, spread, drag})
    // sprays particles in world coordinates.
    G.burst = function (x, y, o) {
        o = o || {};
        var n = o.n || 12, spread = o.spread == null ? Math.PI * 2 : o.spread, base = o.angle || 0;
        for (var i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
            var a = base + (Math.random() - 0.5) * spread, sp = (o.speed || 160) * (0.3 + Math.random() * 0.7);
            var life = (o.life || 0.6) * (0.5 + Math.random() * 0.5);
            particles.push({
                x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life, max: life,
                size: o.size || 3, color: o.color || '#fff', g: o.gravity || 0, drag: o.drag || 0
            });
        }
    };

    G.popup = function (x, y, text, color) {
        popups.push({ x: x, y: y, text: String(text), color: color || '#fff', life: 0.9 });
    };
    G.shake = function (mag, time) { shake.mag = Math.max(shake.mag, mag || 6); shake.t = Math.max(shake.t, time || 0.25); };
    G.flash = function (color, time) { flash.color = color || '#fff'; flash.t = flash.max = time || 0.15; };

    function clearFx() { particles.length = 0; popups.length = 0; shake.t = 0; flash.t = 0; }

    function updateFx(dt) {
        var i, p;
        for (i = particles.length - 1; i >= 0; i--) {
            p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.vy += p.g * dt;
            if (p.drag) { p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; }
            p.x += p.vx * dt; p.y += p.vy * dt;
        }
        for (i = popups.length - 1; i >= 0; i--) {
            popups[i].life -= dt; popups[i].y -= 40 * dt;
            if (popups[i].life <= 0) popups.splice(i, 1);
        }
        if (shake.t > 0) shake.t -= dt;
        if (flash.t > 0) flash.t -= dt;
    }

    function drawFx(ctx) {
        var i, p;
        ctx.save();
        ctx.translate(-G.cam.x, -G.cam.y);
        for (i = 0; i < particles.length; i++) {
            p = particles[i];
            ctx.globalAlpha = Math.max(0, p.life / p.max);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        for (i = 0; i < popups.length; i++) {
            p = popups[i];
            ctx.globalAlpha = Math.min(1, p.life * 2);
            G.text(p.text, p.x, p.y, { size: 16, color: p.color, align: 'center', bold: true });
        }
        ctx.restore();
    }

    // ------------------------------------------------------------------
    // Text
    // ------------------------------------------------------------------

    G.font = function (px, bold) { return (bold ? '700 ' : '') + px + 'px ' + G.fontFamily; };

    // G.text(str, x, y, {size, color, align, bold, glow, max, baseline})
    G.text = function (str, x, y, o) {
        var ctx = dom && dom.ctx;
        if (!ctx) return;
        o = o || {};
        ctx.font = G.font(o.size || 16, o.bold);
        ctx.textAlign = o.align || 'left';
        ctx.textBaseline = o.baseline || 'alphabetic';
        ctx.fillStyle = o.color || '#fff';
        if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = 14; }
        if (o.max) ctx.fillText(str, x, y, o.max); else ctx.fillText(str, x, y);
        ctx.shadowBlur = 0;
    };

    // ------------------------------------------------------------------
    // Game flow
    // ------------------------------------------------------------------

    function fail(err) {
        errors.push(String(err && err.stack || err));
        if (window.console) console.error('SnoGame:', err);
        if (cur) { cur.screen = 'error'; cur.timer = 0; }
        musicStop();
    }

    // Runs game-supplied code; one broken game must not take the page down.
    function guard(fn) {
        try { return fn(); } catch (e) { fail(e); return null; }
    }

    // A game's own cursor (def.cursor, e.g. 'none' when it draws a crosshair)
    // applies only while its level is on screen; menus always get the normal
    // pointer so the level boxes stay clickable.
    function applyCursor() {
        if (!dom || !cur) return;
        var inLevel = cur.screen === 'play' || cur.screen === 'intro' || cur.screen === 'dead';
        dom.canvas.style.cursor = (inLevel && cur.def && cur.def.cursor) || 'default';
    }

    function setScreen(name, timer) {
        cur.screen = name; cur.timer = timer || 0; cur.age = 0;
        applyCursor();
        // The key or click that confirmed a menu must not also count as the
        // first press of the level (it would serve the ball, fire, bomb …).
        if (name === 'play') endTick();
    }

    function maxLives() { return cur.def.lives == null ? 3 : cur.def.lives; }

    function initState(level) {
        G.level = level; G.t = 0; G.cam.x = 0; G.cam.y = 0;
        cur.s = guard(function () { return cur.def.init(level, G); });
    }

    function beginLevel(level) {
        // There is no level after the last one, whoever asks for it.
        level = G.clamp(Math.floor(level) || 1, 1, LEVELS);
        clearFx();
        cur.ending = null;
        cur.level = level;
        G.lives = maxLives();
        initState(level);
        if (cur.screen === 'error') return;
        cur.save.last = level;
        writeSave();
        musicStart(cur.def.music, level);
        setScreen('intro', 1.6);
        cur.banner = 'LEVEL ' + level;
    }

    function toTitle() {
        clearFx();
        cur.ending = null;
        cur.sel = cur.save.last;
        G.score = 0;
        G.lives = maxLives();
        initState(cur.sel);
        if (cur.screen !== 'error') setScreen('title');
    }

    // G.win(bonus) — the level's goal has been reached.
    G.win = function (bonus) {
        if (!cur || cur.screen !== 'play') return;
        G.score += bonus || 0;
        cur.bonus = bonus || 0;
        if (cur.level >= LEVELS) cur.save.won = 1;
        else if (cur.level + 1 > cur.save.unlocked) cur.save.unlocked = cur.level + 1;
        writeSave();
        engineSfx('win');
        if (cur.level >= LEVELS) startEnding(); else setScreen('clear', 6);
    };

    function gameOver() {
        writeSave();
        musicStop();
        engineSfx('over');
        setScreen('over');
    }

    // G.gameOver() — ends the run at once, whatever lives are left: for rules
    // such as "the clock ran out" or "the trace completed". One hurt cue, then
    // the usual game-over screen.
    G.gameOver = function () {
        if (!cur || cur.screen !== 'play') return;
        G.lives = 0;
        engineSfx('hurt'); G.shake(8, 0.3);
        gameOver();
    };

    // G.loseLife() — costs one life but the game carries on from where it is
    // (the game handles its own respawn). Returns the lives left.
    G.loseLife = function () {
        if (!cur || cur.screen !== 'play') return G.lives;
        G.lives = Math.floor(G.lives) - 1;
        engineSfx('hurt'); G.shake(8, 0.3);
        if (G.lives <= 0) gameOver();
        return G.lives;
    };

    // G.die() — costs one life and restarts the current level from init().
    G.die = function () {
        if (!cur || cur.screen !== 'play') return;
        if (G.loseLife() > 0) setScreen('dead', 1.0);
    };

    // A bad value (undefined, NaN) is ignored so it cannot poison the score.
    G.addScore = function (n) { if (isFinite(n)) G.score += n; };

    // G.addLife(max) — one extra life unless that would exceed max (default
    // 5, and never less than the game's starting lives). It never takes a
    // life away, whatever max is.
    G.addLife = function (max) {
        var have = Math.floor(G.lives), cap = Math.max(max || 5, cur ? maxLives() : 0);
        G.lives = Math.max(have, Math.min(cap, have + 1));
        return G.lives;
    };

    function respawn() {
        var lives = G.lives;
        initState(cur.level);
        G.lives = lives;
        if (cur.screen === 'error') return;
        cur.banner = 'READY';
        setScreen('intro', 0.9);
    }

    function onTimer() {
        if (cur.screen === 'intro') setScreen('play');
        else if (cur.screen === 'dead') respawn();
        else if (cur.screen === 'clear' && cur.level < LEVELS) beginLevel(cur.level + 1);
    }

    function togglePause() {
        if (cur.screen === 'play') { cur.screen = 'paused'; holdAudio(true); }
        else if (cur.screen === 'paused') { cur.screen = 'play'; holdAudio(false); endTick(); }
    }

    function selectLevel(n) {
        n = G.clamp(n, 1, cur.save.unlocked);
        if (n === cur.sel) return;
        cur.sel = n;
        engineSfx('blip');
        initState(n);
    }

    function menuConfirm() {
        var sc = cur.screen;
        if (sc === 'title') { G.score = 0; beginLevel(cur.sel); }
        else if (sc === 'intro') setScreen('play');
        else if (sc === 'paused') togglePause();
        else if (sc === 'error') quitSoon();
        else if (cur.age < 0.5) return;
        else if (sc === 'clear') beginLevel(cur.level + 1);
        else if (sc === 'over') { G.score = 0; beginLevel(cur.level); }
        else if (sc === 'victory') endingConfirm();
    }

    // Leaves the crashed-game screen a moment after the tap that asked for it.
    // Quitting on the spot would remove the overlay before that tap's click
    // fires, and the click would land on the blog underneath (maybe a link).
    function quitSoon() {
        setTimeout(function () { G.quit(); }, 350);
    }

    function menuKey(code) {
        if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter') { menuConfirm(); return; }
        if (cur.screen === 'victory') { endingKey(LOGICAL[code]); return; }
        if (cur.screen !== 'title') return;
        if (LOGICAL[code] === 'left') selectLevel(cur.sel - 1);
        else if (LOGICAL[code] === 'right') selectLevel(cur.sel + 1);
    }

    // Level boxes on the title screen: three squares in one centred row. On a
    // phone they are bigger (the whole canvas may be 390 px wide there) and a
    // tap counts for a box from half a gap beside it and `slop` above and
    // below it, so a thumb need not be exact.
    var BOX = { size: 64, gap: 28, y: 336, font: 30, base: 43, slop: 0 };
    var TOUCH_BOX = { size: 80, gap: 32, y: 322, font: 36, base: 54, slop: 18 };
    function boxes() { return pad ? TOUCH_BOX : BOX; }
    function boxX(i) {
        var b = boxes();
        return (W - (LEVELS * b.size + (LEVELS - 1) * b.gap)) / 2 + i * (b.size + b.gap);
    }

    // The level box under G.mouse as a 0-based index; null when the click is
    // not about the boxes at all (it then confirms like any other click), and
    // on a phone -1 for a tap in the row's band that is beside the row: a
    // near miss, which must never start a level.
    function boxAt() {
        var b = boxes(), m = G.mouse, pitch = b.size + b.gap, side = pad ? b.gap / 2 : 0;
        if (m.y < b.y - b.slop || m.y > b.y + b.size + b.slop) return null;
        var rel = m.x - boxX(0) + side, i = Math.floor(rel / pitch);
        if (i < 0 || i >= LEVELS) return pad ? -1 : null;
        return rel - i * pitch <= b.size + 2 * side ? i : null;
    }

    function menuClick() {
        if (cur.screen === 'victory') { endingClick(); return; }
        var i = cur.screen === 'title' ? boxAt() : null;
        if (i === null) { menuConfirm(); return; }
        if (i < 0 || i + 1 > cur.save.unlocked) return;
        if (i + 1 === cur.sel) menuConfirm(); else selectLevel(i + 1);
    }

    function tick() {
        if (!cur || !cur.def) return;
        if (cur.screen === 'paused') { endTick(); return; }
        cur.age += STEP;
        if (cur.screen === 'play') {
            G.t += STEP;
            guard(function () { cur.def.update(cur.s, STEP, G); });
        } else if (cur.screen === 'victory') {
            updateEnding(STEP);
        } else if (cur.timer > 0) {
            cur.timer -= STEP;
            if (cur.timer <= 0) onTimer();
        }
        updateFx(STEP);
        endTick();
    }

    // ------------------------------------------------------------------
    // Rendering: HUD and menu screens
    // ------------------------------------------------------------------

    function colors() {
        var c = (cur && cur.def && cur.def.colors) || {};
        return { bg: c.bg || '#05060a', fg: c.fg || '#e8eef5', accent: c.accent || '#4cc9f0', dim: c.dim || '#7a8696' };
    }

    function levelName(n) {
        var names = cur.def.levelNames;
        return names && names[n - 1] ? names[n - 1] : '';
    }

    function pad6(n) { return ('000000' + Math.floor(n)).slice(-6); }

    // Right edge of the HUD text. It stays clear of the ESC button, which
    // lies on the canvas except in the touch layout (there it is in a gutter).
    function hudRight() {
        return dom.root.classList.contains('sno-game-touch') ? W - 12 : W - 84;
    }

    function drawHud(ctx) {
        var c = colors(), name = levelName(cur.level);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, HUD_H);
        // On a phone the canvas is about half size, so the HUD text is as
        // large as the bar allows there.
        var px = pad ? 21 : 15, y = pad ? 23 : 21;
        // The side blocks squeeze rather than run into the score in the
        // middle (about 100px wide at either size).
        var mid = 56, right = hudRight();
        G.text('LV ' + cur.level + '/' + LEVELS + (name ? '  ' + name : ''), 12, y, { size: px, color: c.fg, max: W / 2 - mid - 12 });
        G.text(pad6(G.score), W / 2, y, { size: px + 1, color: c.accent, align: 'center', bold: true });
        var extra = cur.def.hud ? guard(function () { return cur.def.hud(cur.s, G); }) : '';
        var lives = maxLives() > 0 ? new Array(Math.max(0, Math.floor(G.lives) || 0) + 1).join('♥') : '';
        G.text((extra ? extra + '   ' : '') + lives, right, y, { size: px, color: c.fg, align: 'right', max: right - W / 2 - mid });
    }

    function dimScreen(ctx, alpha) {
        ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
        ctx.fillRect(0, 0, W, H);
    }

    function drawLevelBoxes(ctx, c) {
        for (var i = 0; i < LEVELS; i++) {
            var b = boxes(), x = boxX(i), open = i + 1 <= cur.save.unlocked, sel = i + 1 === cur.sel;
            ctx.lineWidth = 2;
            ctx.strokeStyle = open ? c.accent : c.dim;
            ctx.fillStyle = sel ? c.accent : 'rgba(0,0,0,0.5)';
            ctx.fillRect(x, b.y, b.size, b.size);
            ctx.strokeRect(x, b.y, b.size, b.size);
            G.text(String(i + 1), x + b.size / 2, b.y + b.base, {
                size: b.font, bold: true, align: 'center', color: sel ? c.bg : (open ? c.fg : c.dim)
            });
        }
    }

    function drawTitle(ctx) {
        var c = colors(), d = cur.def, lines = d.controls || [], name = levelName(cur.sel);
        // Dark enough that the level's own banners and readouts underneath
        // cannot be mistaken for (or run into) the title text.
        dimScreen(ctx, 0.87);
        // Bigger small print on a phone, where the canvas is about half size.
        var small = pad ? 18 : 15, hint = pad ? 17 : 14;
        G.text(d.title || TITLES[cur.theme], W / 2, 112, { size: 60, bold: true, color: c.accent, align: 'center', glow: c.accent, max: W - 60 });
        G.text(d.blurb || '', W / 2, 154, { size: 18, color: c.fg, align: 'center', max: W - 80 });
        for (var i = 0; i < lines.length; i++) {
            G.text(lines[i], W / 2, (pad ? 194 : 200) + i * 24, { size: small, color: c.dim, align: 'center', max: W - 80 });
        }
        drawLevelBoxes(ctx, c);
        G.text('LEVEL ' + cur.sel + (name ? ' — ' + name : ''), W / 2, 430, { size: 18, color: c.fg, align: 'center', max: W - 80 });
        // The hints name what the player actually has in hand.
        G.text(pad ? 'TAP to start · ' + (pad.move && pad.move.x ? '◀ ▶ or ' : '') + 'tap a box: level · ✕ quit'
            : 'ENTER start · ← → level · P pause · M ' + (muted ? 'unmute' : 'mute') + ' · ESC quit',
            W / 2, 478, { size: hint, color: c.dim, align: 'center', max: W - 40 });
        G.text('HI ' + pad6(cur.save.hi) + (cur.save.won ? '  ★ COMPLETED' : ''), W / 2, 508, { size: hint, color: c.accent, align: 'center' });
    }

    function drawBanner(ctx, big, small, tint) {
        var c = colors();
        ctx.fillStyle = 'rgba(0,0,0,0.66)';
        ctx.fillRect(0, H / 2 - 74, W, 148);
        G.text(big, W / 2, H / 2 + 4, { size: 46, bold: true, color: tint || c.accent, align: 'center', glow: tint || c.accent, max: W - 60 });
        if (small) G.text(small, W / 2, H / 2 + 44, { size: 17, color: c.fg, align: 'center', max: W - 60 });
    }

    function drawScreen(ctx) {
        // On a phone a tap confirms and the ✕ button quits; there is no P
        // key, so a paused game (a hidden tab pauses it) resumes on a tap.
        var sc = cur.screen, go = pad ? 'TAP' : 'ENTER', quit = pad ? '✕' : 'ESC';
        if (sc === 'title') drawTitle(ctx);
        else if (sc === 'intro') drawBanner(ctx, cur.banner, levelName(cur.level));
        else if (sc === 'paused') drawBanner(ctx, 'PAUSED', (pad ? 'TAP' : 'P') + ' resume · ' + quit + ' quit');
        else if (sc === 'clear') drawBanner(ctx, 'LEVEL ' + cur.level + ' CLEAR', (cur.bonus ? 'BONUS ' + cur.bonus + ' · ' : '') + go + ' for level ' + (cur.level + 1) + (cur.level + 1 === LEVELS ? ' · the finale' : ''));
        else if (sc === 'over') drawBanner(ctx, 'GAME OVER', 'SCORE ' + pad6(G.score) + ' · ' + go + ' retry level ' + cur.level + ' · ' + quit + ' quit', '#ff5566');
        else if (sc === 'victory') drawEnding(ctx);
        else if (sc === 'error') drawBanner(ctx, 'GAME CRASHED', quit + ' to return to the blog', '#ff5566');
        else if (sc === 'loading') drawBanner(ctx, 'LOADING', TITLES[cur.theme] || '');
    }

    function drawWorld(ctx) {
        var sx = 0, sy = 0;
        if (shake.t > 0) { sx = (Math.random() - 0.5) * shake.mag * 2; sy = (Math.random() - 0.5) * shake.mag * 2; }
        ctx.save();
        ctx.translate(sx, sy);
        if (cur.s && cur.def && cur.screen !== 'error') {
            ctx.save();
            guard(function () { cur.def.draw(cur.s, ctx, G); });
            ctx.restore();
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
            drawFx(ctx);
        }
        ctx.restore();
    }

    function frame() {
        var ctx = dom.ctx, c = colors();
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.bg;
        ctx.fillRect(0, 0, W, H);
        if (!cur) return;
        drawWorld(ctx);
        if (flash.t > 0) {
            ctx.globalAlpha = Math.max(0, flash.t / flash.max) * 0.7;
            ctx.fillStyle = flash.color;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }
        if (cur.def && cur.screen !== 'title' && cur.screen !== 'loading' && cur.screen !== 'error' && cur.screen !== 'victory') drawHud(ctx);
        drawScreen(ctx);
    }

    // ------------------------------------------------------------------
    // The ending: a celebration after the last level is cleared
    // ------------------------------------------------------------------

    // Clearing level 3 opens this scene instead of a plain banner. It stays
    // until the player picks PLAY AGAIN (a new run from level 1) or LEVELS
    // (the title screen), or quits. The game's update() no longer runs; its
    // last frame stays behind the celebration, dimmed.
    //
    // def.ending (all optional) lets a theme make it its own:
    //   title, text   the big line and the line under it
    //   colors        firework palette (default: the game's accent and fg)
    //   fireworks     false to switch the engine's fireworks off
    //   draw(e, ctx, G)  paints the theme's own scene each frame, behind the
    //                 fireworks; e = { t, score, level, data, rng } where
    //                 `data` is a scratch object that lives as long as the
    //                 scene (games keep no state of their own outside s)
    var ENDING_ARM = 1.2;     // seconds before a key or tap may leave the scene
    var ENDING_SPARKS = 480;  // cap, so a long celebration cannot pile up
    var ENDING_CHOICES = ['PLAY AGAIN', 'LEVELS'];

    function endingDef() { return (cur.def && cur.def.ending) || {}; }

    function startEnding() {
        var d = endingDef(), c = colors();
        musicStop();
        clearFx();
        cur.ending = {
            t: 0, choice: 0, shells: [], sparks: [], next: 0.2, data: {},
            title: d.title || 'YOU WIN', text: d.text || '',
            palette: d.colors && d.colors.length ? d.colors : [c.accent, c.fg, '#ffd166', '#ff6b9d'],
            fireworks: d.fireworks !== false, rng: G.rng(G.score + 7)
        };
        setScreen('victory');
    }

    function launchShell(e) {
        var r = e.rng;
        e.shells.push({
            x: W * (0.15 + r() * 0.7), y: H, vx: (r() - 0.5) * 60, vy: -(420 + r() * 160),
            fuse: 0.75 + r() * 0.45, color: e.palette[Math.floor(r() * e.palette.length)]
        });
    }

    function explodeShell(e, sh) {
        var n = 36 + Math.floor(e.rng() * 24);
        for (var i = 0; i < n && e.sparks.length < ENDING_SPARKS; i++) {
            var a = (i / n) * Math.PI * 2, sp = 120 + e.rng() * 110, life = 1.1 + e.rng() * 0.7;
            e.sparks.push({ x: sh.x, y: sh.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life, max: life, color: sh.color });
        }
        // A soft pop through the engine's own channel: it follows mute and
        // pause like every other sound, and is not counted as the game's.
        engineSound = true;
        G.noise(0.3, { freq: 1800, slide: 200, vol: 0.08 });
        engineSound = false;
    }

    function updateEnding(dt) {
        var e = cur.ending, i;
        if (!e) return;
        e.t += dt;
        if (e.fireworks && (e.next -= dt) <= 0) { launchShell(e); e.next = 0.35 + e.rng() * 0.45; }
        for (i = e.shells.length - 1; i >= 0; i--) {
            var sh = e.shells[i];
            sh.vy += 300 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.fuse -= dt;
            if (sh.fuse <= 0 || sh.vy >= 0) { explodeShell(e, sh); e.shells.splice(i, 1); }
        }
        for (i = e.sparks.length - 1; i >= 0; i--) {
            var p = e.sparks[i];
            p.life -= dt;
            if (p.life <= 0) { e.sparks.splice(i, 1); continue; }
            p.vy += 90 * dt; p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 1.2 * dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
        }
    }

    function drawSparks(ctx, e) {
        var i, p;
        for (i = 0; i < e.shells.length; i++) {
            ctx.globalAlpha = 1; ctx.fillStyle = e.shells[i].color;
            ctx.fillRect(e.shells[i].x - 2, e.shells[i].y - 2, 4, 4);
        }
        for (i = 0; i < e.sparks.length; i++) {
            p = e.sparks[i];
            ctx.globalAlpha = Math.max(0, p.life / p.max);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
    }

    // The two choices as buttons in canvas coordinates; bigger on a phone.
    function endingButtons() {
        var w = pad ? 260 : 220, h = pad ? 70 : 54, gap = 40, y = pad ? 380 : 392;
        var x0 = (W - (2 * w + gap)) / 2;
        return ENDING_CHOICES.map(function (label, i) { return { x: x0 + i * (w + gap), y: y, w: w, h: h, label: label }; });
    }

    function drawEndingPanel(ctx, e) {
        var c = colors(), go = pad ? 'tap a button' : '← → choose · ENTER confirm', quit = pad ? '✕ quit' : 'ESC quit';
        G.text(e.title, W / 2, 150, { size: 64, bold: true, color: c.accent, align: 'center', glow: c.accent, max: W - 60 });
        if (e.text) G.text(e.text, W / 2, 196, { size: 22, color: c.fg, align: 'center', max: W - 80 });
        G.text('All ' + LEVELS + ' levels cleared', W / 2, 262, { size: 22, color: c.fg, align: 'center' });
        G.text('SCORE ' + pad6(G.score) + '   HI ' + pad6(cur.save.hi), W / 2, 306, { size: 28, bold: true, color: c.accent, align: 'center' });
        endingButtons().forEach(function (b, i) {
            var sel = i === e.choice;
            ctx.globalAlpha = 1; ctx.lineWidth = 3;
            ctx.fillStyle = sel ? c.accent : 'rgba(0,0,0,0.6)';
            ctx.strokeStyle = c.accent;
            ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
            G.text(b.label, b.x + b.w / 2, b.y + b.h / 2 + (pad ? 11 : 8), { size: pad ? 30 : 24, bold: true, align: 'center', color: sel ? c.bg : c.fg });
        });
        if (e.t >= ENDING_ARM) G.text(go + ' · ' + quit, W / 2, 500, { size: pad ? 20 : 15, color: c.dim, align: 'center', max: W - 40 });
    }

    function drawEnding(ctx) {
        var e = cur.ending, d = endingDef();
        if (!e) return;
        dimScreen(ctx, 0.74);
        if (d.draw) {
            ctx.save();
            guard(function () { d.draw({ t: e.t, score: G.score, level: cur.level, data: e.data, rng: e.rng }, ctx, G); });
            ctx.restore();
            ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        }
        drawSparks(ctx, e);
        drawEndingPanel(ctx, e);
    }

    function endingConfirm() {
        var e = cur.ending;
        if (!e || e.t < ENDING_ARM) return;
        if (e.choice === 0) { G.score = 0; beginLevel(1); } else toTitle();
    }

    function endingKey(name) {
        var e = cur.ending;
        if (!e || (name !== 'left' && name !== 'right')) return;
        e.choice = name === 'left' ? 0 : 1;
        engineSfx('blip');
    }

    // A click or tap on a button picks it and confirms; anywhere else it
    // confirms what is selected, as on every other menu screen.
    function endingClick() {
        var e = cur.ending, m = G.mouse;
        if (!e) return;
        endingButtons().forEach(function (b, i) {
            if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) e.choice = i;
        });
        endingConfirm();
    }

    // ------------------------------------------------------------------
    // Overlay, main loop, launch and quit
    // ------------------------------------------------------------------

    // Fits the 16:9 canvas into the viewport. With a touch pad on screen the
    // pad's space is reserved first (see padLayout), so the canvas shrinks
    // to leave room and the pad never lies on the playfield.
    function resize() {
        if (!dom) return;
        // The overlay's own box, not window.innerWidth/Height: on a phone
        // whose blog page is wider than the screen the window reports the
        // zoomed-out page size, while the fixed overlay keeps the real one.
        var vw = dom.root.clientWidth, vh = dom.root.clientHeight;
        var lay = pad ? padLayout(vw, vh) : null;
        var fit = lay ? lay.canvas.fit : Math.min(vw / W, vh / H);
        if (pad) applyPadLayout(lay);
        dom.canvas.style.width = Math.floor(W * fit) + 'px';
        dom.canvas.style.height = Math.floor(H * fit) + 'px';
        // Render at device resolution, but never below the logical size and
        // never so large that a slow GPU struggles.
        scale = G.clamp(fit * Math.min(window.devicePixelRatio || 1, 2), 1, 3);
        dom.canvas.width = Math.round(W * scale);
        dom.canvas.height = Math.round(H * scale);
    }

    function loop(now) {
        if (!G.active) return;
        raf = engineRaf(loop);
        acc += Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;
        if (clockHeld) acc = 0;
        while (acc >= STEP) { tick(); acc -= STEP; }
        frame();
    }

    // On a phone "TAP to start" has to hold wherever the thumb lands, so the
    // gutters and the space under the canvas confirm a menu like the canvas
    // does. Pad parts and the close button are targets of their own and the
    // canvas has its own handler; none of them arrive here as e.target.
    // A thumb aiming at the ✕ that lands just beside it must not confirm the
    // menu instead (that would start or restart a level).
    var CLOSE_SLOP = 28;

    function nearClose(e) {
        var r = dom.close.getBoundingClientRect();
        return e.clientX > r.left - CLOSE_SLOP && e.clientX < r.right + CLOSE_SLOP &&
            e.clientY > r.top - CLOSE_SLOP && e.clientY < r.bottom + CLOSE_SLOP;
    }

    function onOverlayTap(e) {
        if (!pad || !dom || e.target !== dom.root || !cur || cur.screen === 'play') return;
        if (nearClose(e)) return;
        audio();
        menuConfirm();
    }

    function openOverlay() {
        var root = document.createElement('div');
        root.id = 'sno-game';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Game');
        var canvas = document.createElement('canvas');
        var close = document.createElement('button');
        close.type = 'button'; close.className = 'sno-game-close'; close.textContent = '✕ ESC';
        close.setAttribute('aria-label', 'Quit game');
        close.addEventListener('click', function () { G.quit(); });
        // A tap that follows another touch closely (a thumb just off the
        // pad) does not always become a click, so a finger lifting off the
        // button quits directly. preventDefault stops the click that would
        // otherwise land on the blog once the overlay is gone.
        close.addEventListener('touchend', function (e) { e.preventDefault(); G.quit(); });
        root.appendChild(canvas); root.appendChild(close);
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointercancel', onPointerUp);
        window.addEventListener('pointerup', onPointerUp);
        // On the whole overlay, not just the canvas: a long press on a pad
        // button would otherwise open the browser's context menu.
        root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        // Capture phase: the pad has to exist before the tap is handled.
        root.addEventListener('pointerdown', onFirstTouch, true);
        root.addEventListener('pointerdown', onOverlayTap);
        root.tabIndex = -1;
        document.body.appendChild(root);
        document.body.classList.add('sno-game-on');
        // Move focus into the dialog so a focused blog button cannot be
        // activated from inside the game.
        root.focus({ preventScroll: true });
        dom = { root: root, canvas: canvas, close: close, ctx: canvas.getContext('2d') };
        G.fontFamily = getComputedStyle(document.body).fontFamily || 'monospace';
        setupPad(null);
    }

    function currentTheme() {
        return window.SNONUX_CURRENT_THEME || document.documentElement.getAttribute('data-sno-theme') || '';
    }

    // Fetches themes/<theme>/game.js. A failed fetch is retried a couple of
    // times before the game is declared broken: one dropped request on a
    // flaky connection (or a busy machine) should not cost the visitor the game.
    var LOAD_TRIES = 3;

    function loadGameScript(theme, attempt) {
        attempt = attempt || 1;
        var s = document.createElement('script');
        var waiting = function () { return cur && cur.theme === theme && !cur.def && cur.screen === 'loading'; };
        s.src = 'themes/' + theme + '/game.js?b=' + encodeURIComponent(window.SNONUX_BUILD || '') +
            (attempt > 1 ? '&try=' + attempt : '');
        s.onerror = function () {
            s.remove();
            if (!waiting()) return;
            if (attempt >= LOAD_TRIES) { fail('could not load ' + s.src); return; }
            setTimeout(function () { if (waiting()) loadGameScript(theme, attempt + 1); }, 400 * attempt);
        };
        // A script with a syntax error loads "successfully" but never
        // registers; do not leave LOADING up forever.
        s.onload = function () { if (waiting()) fail(s.src + ' did not register a game'); };
        document.head.appendChild(s);
    }

    function boot(theme) {
        cur.def = defs[theme];
        setupPad(cur.def.touch);
        musicStart(cur.def.music, 1);
        toTitle();
    }

    // SnoGame.register(theme, def) — called by themes/<theme>/game.js.
    G.register = function (theme, def) {
        defs[theme] = def;
        if (cur && cur.theme === theme && !cur.def) boot(theme);
    };

    // While a game is open the theme's animated backdrop (three.js on most
    // themes) is hidden behind the overlay but would keep rendering, which
    // on a phone costs the game most of its frame rate. So the page's
    // requestAnimationFrame is parked: callbacks asked for during a game are
    // kept and handed to the browser when the game closes. The engine's own
    // loop uses the real function (rafReal).
    var rafReal = null, rafCancelReal = null, rafParked = null, rafNext = -1;
    var rafMoved = {};      // parked id -> real id, for a cancel after release

    function engineRaf(cb) { return (rafReal || window.requestAnimationFrame).call(window, cb); }

    function cancelRaf(id) {
        if (rafParked && rafParked[id]) { delete rafParked[id]; return; }
        if (rafMoved[id]) { id = rafMoved[id]; }
        (rafCancelReal || window.cancelAnimationFrame).call(window, id);
    }

    function holdBackdrop() {
        if (rafParked) return;
        // The browser's own pair is taken once: cancelRaf stays installed
        // after the first game and must never be mistaken for it.
        if (!rafReal) {
            rafReal = window.requestAnimationFrame;
            rafCancelReal = window.cancelAnimationFrame;
        }
        rafParked = {};
        window.requestAnimationFrame = function (cb) { rafParked[rafNext] = cb; return rafNext--; };
        window.cancelAnimationFrame = cancelRaf;
    }

    // Hands every parked callback back to the browser. A caller may still
    // hold a parked id, so cancelling by it keeps working until it has run.
    function releaseBackdrop() {
        if (!rafParked) return;
        var parked = rafParked, real = rafReal;
        window.requestAnimationFrame = rafReal;
        rafParked = null;
        Object.keys(parked).forEach(function (id) {
            rafMoved[id] = real.call(window, function (t) { delete rafMoved[id]; parked[id](t); });
        });
    }

    function pauseAmbient() {
        ambientWasPlaying = !!(window.snonuxAmbientIsPlaying && window.snonuxAmbientIsPlaying());
        if (ambientWasPlaying && window.snonuxAmbientPause) window.snonuxAmbientPause('game');
    }

    // SnoGame.launch(theme) — opens the overlay and starts that theme's game
    // (the active theme's game when no name is given).
    G.launch = function (theme) {
        theme = theme || currentTheme();
        if (G.active || !TITLES[theme]) return false;
        G.active = true;
        errors.length = 0;
        // A new game starts with nothing held, by a finger or by a bot.
        stepMem = newStepMem();
        clearInput(); clearFx();
        pauseAmbient();
        holdBackdrop();
        openOverlay();
        // Must happen inside the tap that launched the game: browsers only
        // grant fullscreen from a user gesture.
        if (pad) enterFullscreen(dom.root);
        holdAudio(false);
        audio();
        cur = { theme: theme, def: null, s: null, screen: 'loading', timer: 0, age: 0, level: 1, sel: 1, save: loadSave(theme) };
        if (defs[theme]) boot(theme); else loadGameScript(theme);
        lastTime = performance.now(); acc = 0;
        raf = engineRaf(loop);
        return true;
    };

    // SnoGame.quit() — closes the game and hands the page back to the blog.
    G.quit = function () {
        if (!G.active) return;
        G.active = false;
        clockHeld = false;
        cancelRaf(raf);
        releaseBackdrop();
        if (cur && cur.def) writeSave();
        musicStop();
        closeAudio();
        // Esc itself is the key most likely still held; it never enters
        // rawDown because it quits before being recorded.
        lingering = rawDown;
        lingering.Escape = true;
        clearInput();
        window.removeEventListener('pointerup', onPointerUp);
        if (dom) leaveFullscreen(dom.root);
        pad = null;
        if (dom && dom.root.parentNode) dom.root.parentNode.removeChild(dom.root);
        document.body.classList.remove('sno-game-on');
        var theme = cur ? cur.theme : '';
        dom = null; cur = null;
        if (ambientWasPlaying && window.snonuxAmbientStart) window.snonuxAmbientStart('game');
        // Give keyboard focus back to the splash when the game was launched
        // from it, so Enter still opens the blog.
        var splash = document.getElementById('splash-overlay');
        if (splash && !splash.classList.contains('splash--dismissed')) splash.focus({ preventScroll: true });
        // Last, so a listener sees a fully closed game: the overview menu
        // (arcade.js) reopens itself after a game that was started from it.
        document.dispatchEvent(new CustomEvent('sno-game-quit', { detail: { theme: theme } }));
    };

    // Outside a game these only keep track of how the visitor is driving
    // the page, so a launch knows whether to bring up the touch pad.
    window.addEventListener('pointerdown', function (e) { if (!G.active) notePointer(e); }, true);
    window.addEventListener('keydown', function (e) { if (!G.active && e.isTrusted) lastTouch = false; }, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('resize', resize);
    // Entering or leaving fullscreen changes the space the pad layout has.
    document.addEventListener('fullscreenchange', resize);
    window.addEventListener('blur', function () { if (G.active) clearInput(); });
    // A hidden tab pauses play and silences every other screen too, so a
    // throttled background tab never plays stuttering music.
    document.addEventListener('visibilitychange', function () {
        if (!G.active || !cur) return;
        if (document.hidden && cur.screen === 'play') togglePause();
        else if (cur.screen !== 'paused') holdAudio(document.hidden);
    });

    // ------------------------------------------------------------------
    // Launch buttons: splash, header and the fx row
    // ------------------------------------------------------------------

    var ICON = '<i class="fas fa-gamepad" aria-hidden="true"></i> ';

    function escapeHTML(s) {
        return String(s).replace(/[&<>"]/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
        });
    }

    // Creates the launch button inside `parent` on first use and keeps its
    // label in step with the active theme's game.
    function ensureButton(parent, cls, wrapCls, title, prepend) {
        var btn = parent.querySelector('.' + cls);
        if (!title) { if (btn) ((wrapCls && btn.closest('.' + wrapCls)) || btn).remove(); return; }
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            var node = btn;
            if (wrapCls) { node = document.createElement('div'); node.className = wrapCls; node.appendChild(btn); }
            if (prepend) parent.insertBefore(node, parent.firstChild); else parent.appendChild(node);
        }
        btn.className = cls + ' sno-game-launch' + (wrapCls ? ' splash-music-btn' : '');
        btn.setAttribute('aria-label', 'Play the game: ' + title);
        // The label is a span of its own: a narrow phone header has room
        // for the icon only (see shared.css).
        btn.innerHTML = ICON + '<span class="sno-game-launch-text">' + (wrapCls ? 'Play ' : '') + escapeHTML(title) + '</span>';
    }

    // snonuxGameDecorate() is idempotent. shared.js calls it again whenever a
    // theme switch has replaced the splash or header markup.
    function decorate() {
        var title = TITLES[currentTheme()];
        var splash = document.getElementById('splash-overlay');
        if (splash) ensureButton(splash.querySelector('.splash-inner') || splash, 'splash-game-btn', 'splash-game-choice', title, false);
        var header = document.querySelector('header');
        if (header) ensureButton(header.querySelector('.nav') || header, 'header-game-btn', '', title, true);
        document.querySelectorAll('[data-sno-fx="game"]').forEach(function (b) {
            b.style.display = title ? '' : 'none';
            if (title) b.setAttribute('aria-label', 'Play the game: ' + title);
        });
    }

    // One delegated capture-phase listener: it runs before the splash's own
    // click-to-dismiss handler, so launching a game leaves the splash open.
    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.sno-game-launch');
        if (!btn) return;
        e.preventDefault(); e.stopPropagation();
        G.launch();
    }, true);

    window.snonuxGameDecorate = decorate;
    window.snonuxGameLaunch = function (theme) { return G.launch(theme); };
    decorate();

    // ------------------------------------------------------------------
    // Test hooks (used by integrationtests/games/e2e.mjs and by game authors)
    // ------------------------------------------------------------------

    // What debug.step() fed the game on its previous tick. It outlives a
    // single step() call: a bot that steps one tick at a time while holding
    // a button must see that button's G.hit edge once, not on every call.
    var stepMem = newStepMem();

    function newStepMem() { return { keys: {}, codes: {}, down: false, rdown: false }; }

    // Logical buttons and raw codes for one scripted tick; edges are judged
    // against stepMem, not against the live state step() wipes when it ends.
    function applyButtons(inp) {
        var k = G.key, codes = inp.codes || {}, name, code;
        for (name in k) {
            k[name] = !!inp[name];
            if (k[name] && !stepMem.keys[name]) G.hit[name] = true;
            stepMem.keys[name] = k[name];
        }
        rawDown = {};
        for (code in codes) {
            if (!codes[code]) continue;
            rawDown[code] = true;
            if (!stepMem.codes[code]) rawHit[code] = true;
        }
        stepMem.codes = rawDown;
    }

    // A tick without `mouse` leaves the buttons as they are, which after a
    // finished step() call means released.
    function applyMouse(m) {
        var gm = G.mouse;
        if (m) {
            if (m.x != null) { gm.x = m.x; gm.y = m.y; }
            gm.down = !!m.down; gm.rdown = !!m.rdown;
            if (gm.down && !stepMem.down) gm.hit = true;
            if (gm.rdown && !stepMem.rdown) gm.rhit = true;
        }
        stepMem.down = gm.down; stepMem.rdown = gm.rdown;
    }

    G.debug = {
        errors: errors,
        parseSave: parseSave,
        state: function () {
            if (!cur) return null;
            return {
                theme: cur.theme, screen: cur.screen, level: cur.level, sel: cur.sel, lives: G.lives,
                score: G.score, unlocked: cur.save.unlocked, hi: cur.save.hi, won: cur.save.won,
                registered: !!cur.def, t: G.t, age: cur.age
            };
        },
        s: function () { return cur && cur.s; },
        // What the registered game declares, so tests can check it is complete.
        def: function () {
            var d = cur && cur.def;
            if (!d) return null;
            return {
                title: d.title || '', blurb: d.blurb || '', controls: (d.controls || []).length,
                levelNames: (d.levelNames || []).length, lives: maxLives(),
                // A tune needs a tempo and at least one voice that plays.
                touch: d.touch || null,
                music: !!(d.music && d.music.bpm && /[0-9a-z]/i.test([].concat(d.music.lead || '', d.music.bass || '', d.music.arp || '').join('')))
            };
        },
        audio: function () {
            return { state: actx ? actx.state : 'none', tones: audioStats.tones, noises: audioStats.noises, musicSteps: audioStats.musicSteps, sfx: audioStats.sfx, engineSfx: audioStats.engineSfx, muted: muted };
        },
        // Jumps straight into play on the given level (no intro banner), with
        // no button remembered as held from earlier step() calls.
        start: function (level) {
            if (!cur || !cur.def) return;
            stepMem = newStepMem();
            G.score = 0; beginLevel(level);
            if (cur.screen !== 'error') setScreen('play');
        },
        // Runs n update ticks synchronously. `input` is either a fixed
        // {left, right, up, down, a, b, codes, mouse} object or a function
        // (i, state, G) returning one per tick — handy for scripted bots.
        // A button held at the end of one call and at the start of the next
        // stays held (no new G.hit edge); start() forgets what was held. The
        // live input state is wiped afterwards, so the real keyboard starts
        // clean.
        step: function (n, input) {
            for (var i = 0; i < n; i++) {
                var inp = (typeof input === 'function' ? input(i, cur.s, G) : input) || {};
                applyButtons(inp);
                applyMouse(inp.mouse);
                tick();
            }
            clearInput();
            return G.debug.state();
        },
        // The ending scene's own state while it is on screen, else null.
        ending: function () {
            var e = cur && cur.screen === 'victory' ? cur.ending : null;
            return e ? { t: e.t, choice: e.choice, shells: e.shells.length, sparks: e.sparks.length, fireworks: e.fireworks, title: e.title } : null;
        },
        // hold(true) stops real time from ticking the game (frames are still
        // drawn), so a bot driving it with step() is the only thing that
        // moves it, however long the test pauses between calls. Quit
        // releases it.
        hold: function (on) { clockHeld = !!on; },
        win: function () { G.win(0); },
        lose: function () { while (cur && cur.screen === 'play') G.loseLife(); }
    };
})();
