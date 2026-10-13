/*
 * Carrier Lost — the retro theme's game.
 *
 * A data packet runs by itself along a phone-line corridor; SPACE flips
 * gravity between the floor wire and the ceiling wire. Spikes, breaks in the
 * wire, sliding blocks, swinging blocks and bursts of line noise kill. Reach
 * the far end of the line; a relay halfway is the checkpoint.
 *
 * It is a one-button game. On a phone (coarse pointer) the pad shows only
 * FLIP, and a tap anywhere on the picture flips as well; a mouse click does
 * nothing, so the desktop game is unchanged.
 *
 * Every hazard is a pure function of the packet's position (a slider's place,
 * a swinging block's height, whether a noise burst is live), never of time.
 * That keeps a level identical on every attempt, lets a respawn simply move
 * the packet back, and lets the generator prove that a path exists: each
 * hazard knows the stretch d0..d1 of packet positions over which its lane is
 * deadly, and consecutive stretches always leave room for a flip.
 */
(function () {
    'use strict';
    var G = window.SnoGame;

    var PX = 180, PS = 22;                      // packet: screen x and size
    var CEIL = 112, FLOOR = 442, MID = (CEIL + FLOOR) / 2;
    var GRAV = 6000, VMAX = 1100;
    var FLIP_T = 0.4;                           // seconds a flip takes, rounded up
    var BUFFER = 0.12;                          // a press this early still counts on landing
    var REDIAL = 1.1;                           // pause after a crash
    var SPIKE_H = 30, PIT = 46, FALL_OUT = 50;
    var SLIDE_D = 640, SLIDE_K = 0.6, SLIDE_S = 56;
    var MOV_W = 50, MOV_H = 170, MOV_A = (FLOOR - CEIL - MOV_H) / 2, MOV_WAVE = 300;
    var BURST_H = 150, BURST_WARN = 520, BURST_ON = 260;
    var FOG_SIGHT = 430;
    var HOT = '#ffe08a', AMBER = '#ffb000', MIDC = '#b87e00', DIM = '#7a5200', DARK = '#2e1f00', BG = '#0a0800';
    var BIT_NOTES = [660, 784, 880, 988, 1175];

    // v: scroll speed. secs: nominal length. react: seconds between the end
    // of a hazard on one wire and the start of the next one on the other,
    // which is the least time the flip can be pressed in (the generator
    // guarantees it; a flip may also start while the last spikes are still
    // passing under the far wire, so a played window is about 0.4s longer).
    // tight: how much of `react` is left inside a zigzag. keep: share of
    // hazards on the lane the packet is NOT on (they punish flipping by
    // rhythm). kinds: pattern weights.
    // The numbers are tuned with a bot that presses mid-window with Gaussian
    // timing error (0.15s, a casual player): it clears level 7 about nine
    // times in ten and level 10 about seven in ten. `react` therefore falls
    // gently; speed, the mix of kinds and the stretches carry the rest of
    // the rise. Level 8 is not much
    // wider than level 9 because its double-speed stretches hold only plain
    // hazards and would otherwise be a rest.
    var LEVELS = [
        { v: 270, secs: 46, react: 1.10, tight: 0.6, keep: 0, kinds: { spike: 1 } },
        { v: 290, secs: 50, react: 0.95, tight: 0.6, keep: 0.12, kinds: { spike: 3, gap: 3 } },
        { v: 310, secs: 54, react: 0.85, tight: 0.6, keep: 0.15, kinds: { spike: 2, gap: 2, slider: 3 } },
        { v: 325, secs: 57, react: 0.75, tight: 0.6, keep: 0.18, kinds: { spike: 2, gap: 2, slider: 1, burst: 3 } },
        { v: 340, secs: 60, react: 0.70, tight: 0.90, keep: 0.20, kinds: { spike: 2, gap: 2, slider: 1, burst: 1, zig: 3 } },
        { v: 350, secs: 62, react: 0.66, tight: 0.75, keep: 0.22, kinds: { spike: 2, gap: 2, slider: 1, burst: 1, zig: 1, mover: 4 } },
        { v: 360, secs: 64, react: 0.60, tight: 0.80, keep: 0.22, kinds: { spike: 2, gap: 2, slider: 1, burst: 1, zig: 1, mover: 1, jam: 4 } },
        { v: 370, secs: 68, react: 0.54, tight: 0.70, keep: 0.26, kinds: { spike: 2, gap: 2, slider: 1, burst: 1, zig: 1, mover: 1, jam: 1, turbo: 1.5 } },
        { v: 380, secs: 70, react: 0.48, tight: 0.65, keep: 0.28, kinds: { spike: 2, gap: 2, slider: 1, burst: 1, zig: 1, mover: 1, jam: 1, fog: 2 } },
        { v: 395, secs: 78, react: 0.36, tight: 0.60, keep: 0.30, kinds: { spike: 2, gap: 2, slider: 2, burst: 2, zig: 2, mover: 2, jam: 2, turbo: 1.5, fog: 1.5 } }
    ];
    // Every kind a level enables appears at least once before the relay and
    // once after it, whatever the seed rolls. The slots of a half are spread
    // over this share of it, so that the last one is not due at the very end,
    // where a double-speed stretch could carry the cursor past it.
    var QUOTA_SPREAD = 0.8;
    // After the relay the flip windows shrink to this share of `react`.
    var SECOND_HALF = 0.88;
    // Inside a double-speed or dropout stretch only the plainest hazards
    // appear: the stretch itself is the difficulty.
    var MODE_KINDS = { spike: 1, gap: 1 };

    // ------------------------------------------------------------------
    // Level generator
    // ------------------------------------------------------------------

    // Each shape turns "this lane becomes deadly at packet position d0" into
    // geometry, and reports d1, where the lane is safe again. The hazard
    // itself starts a little after d0, the taller the later, so that a flip
    // begun exactly at d0 still clears it.
    var SHAPES = {
        spike: function (d0, v, rnd) {
            var x = d0 + PS + v * 0.1, w = Math.round((50 + rnd() * 100) * v / 300);
            return { x: x, w: w, d1: x + w };
        },
        gap: function (d0, v, rnd) {
            var w = Math.round((110 + rnd() * 80) * v / 300);
            return { x: d0 + PS, w: w, d1: d0 + PS + w };
        },
        burst: function (d0, v, rnd) {
            var x = d0 + PS + v * 0.27, w = Math.round((140 + rnd() * 100) * v / 300);
            return { x: x, w: w, d1: x + w };
        },
        mover: function (d0, v) {
            var x = d0 + PS + v * 0.3;
            return { x: x, w: MOV_W, d1: x + MOV_W };
        },
        // A slider waits at x until the packet passes x0, then runs towards
        // it; the two meet (1 + SLIDE_K) times sooner than a parked block.
        slider: function (d0, v) {
            var x0 = d0 + v * 0.22 - (SLIDE_D - PS) / (1 + SLIDE_K);
            return { x0: x0, x: x0 + SLIDE_D, w: SLIDE_S, d1: x0 + (SLIDE_D + SLIDE_S) / (1 + SLIDE_K) };
        }
    };

    function localSpeed(t) { return t.mode === 'turbo' ? t.c.v * 2 : t.c.v; }

    // One slot per enabled kind and half of the line (0 before the relay,
    // 1 after it), spread evenly along that half.
    function buildQuota(c, len) {
        var kinds = Object.keys(c.kinds), slots = [];
        for (var half = 0; half < 2; half++) {
            for (var i = 0; i < kinds.length; i++) {
                slots.push({ kind: kinds[i], half: half, at: len / 2 * (half + QUOTA_SPREAD * (i + 1) / (kinds.length + 1)) });
            }
        }
        return slots;
    }

    // A first-half slot not yet looked at: the relay waits for these, or a
    // kind due just before it would slip into the second half.
    function firstHalfPending(t) { return t.quota.length > 0 && t.quota[0].half === 0; }

    // The kind a quota slot still owes once the cursor has passed it, if any.
    // t.count is the tally of the current half (the relay resets it), and a
    // second-half slot is never judged before the relay stands.
    function owedKind(t) {
        while (t.quota.length && t.quota[0].at <= t.x && (t.cpX || firstHalfPending(t))) {
            var q = t.quota.shift();
            if (!t.count[q.kind]) return q.kind;
        }
        return null;
    }

    // Weighted pick; outside a stretch the quota goes first, so the weights
    // decide the mix but never whether a kind shows up at all.
    function pickKind(t) {
        var owed = t.mode ? null : owedKind(t);
        if (owed) return owed;
        var kinds = t.mode ? MODE_KINDS : t.c.kinds, total = 0, k;
        for (k in kinds) total += kinds[k];
        var r = t.rnd() * total;
        for (k in kinds) { r -= kinds[k]; if (r < 0) return k; }
        return 'spike';
    }

    // Bits hang in the safe lane across a hazard: they are score, and they
    // show a new player where to be.
    function addBits(t, h) {
        var y = h.lane > 0 ? CEIL + 36 : FLOOR - 36;
        for (var i = 0; i < 3; i++) t.bits.push({ x: G.lerp(h.d0, h.d1, i / 2) + PS / 2, y: y, got: false });
    }

    // The earliest position at which the player can be asked to leave
    // `lane`: the last hazard on the other wire must have gone by, with the
    // level's reaction window on top, and the packet must have landed from
    // the previous forced flip even if that one was pressed at the last moment.
    function flipPoint(t, lane, v, tight) {
        var space = v * t.react * (tight ? t.c.tight : 1);
        return Math.max(t.x, t.end[-lane] + space, t.lastFlip + v * (FLIP_T + 0.05));
    }

    // Puts one hazard on `lane`. If that is the packet's lane the player has
    // to flip, so the hazard is pushed back to the next flip point.
    function place(t, kind, lane, tight) {
        var v = localSpeed(t), must = lane === t.lane;
        var d0 = must ? flipPoint(t, lane, v, tight) : t.x;
        var h = SHAPES[kind](d0, v, t.rnd);
        h.type = kind; h.lane = lane; h.d0 = d0; h.done = false;
        t.haz.push(h);
        addBits(t, h);
        t.end[lane] = Math.max(t.end[lane], h.d1);
        if (must) { t.lane = -lane; t.lastFlip = d0; }
        t.x = h.d1 + v * (0.1 + t.rnd() * 0.45);
        return h;
    }

    // A run of alternating spikes with barely more than a flip between them.
    function zigzag(t) {
        var n = 3 + Math.floor(t.rnd() * 3);
        for (var i = 0; i < n; i++) {
            var h = place(t, 'spike', t.lane, i > 0);
            if (i < n - 1) t.x = h.d1;
        }
    }

    // A jammed zone: no flipping inside, and all its hazards sit on one lane,
    // so the player has to read it and commit before the zone begins.
    function jam(t, lane) {
        var v = t.c.v, z0 = t.x;
        if (lane === t.lane) { z0 = flipPoint(t, lane, v, false); t.lastFlip = z0; }
        var n = 2 + Math.floor(t.rnd() * 2), h;
        t.x = z0 + v * 0.35;
        t.lane = -lane;                         // from here on the packet rides the free lane
        for (var i = 0; i < n; i++) h = place(t, t.rnd() < 0.5 ? 'spike' : 'gap', lane, false);
        var z1 = h.d1 + v * 0.15;
        t.zones.push({ type: 'jam', x0: z0, x1: z1 });
        t.end[lane] = z1;                       // the flip back cannot start before the zone ends
        t.x = z1 + v * 0.2;
    }

    // Opens a double-speed ('turbo') or dropout ('fog') stretch; the patterns
    // that follow fall inside it until closeMode.
    function openMode(t, kind) {
        var v = t.c.v, len = kind === 'turbo' ? v * 2 * (3 + t.rnd() * 1.5) : v * (4 + t.rnd() * 2);
        var z = { type: kind, x0: t.x + v * 0.3, x1: t.x + v * 0.3 + len };
        t.zones.push(z);
        t.mode = kind; t.zone = z;
        t.x = z.x0 + v * 0.9;
    }

    // After double speed the packet needs a moment to slow down before the
    // generator may assume normal speed again. The cursor only ever moves
    // forward: the last hazard of the stretch may already reach past that.
    function closeMode(t) {
        var z = t.zone;
        z.x1 = Math.min(z.x1, t.x);
        t.x = Math.max(t.x, z.x1 + t.c.v * (t.mode === 'turbo' ? 1.4 : 0.3));
        t.mode = null; t.zone = null;
    }

    // The checkpoint. A respawned packet stands on the floor, so the next
    // hazard is forced onto the floor: doing nothing must never be safe.
    // Past the relay the flip windows are narrower, so the second half is
    // the harder one (which is why the relay hands back a life).
    function relay(t) {
        if (t.mode) closeMode(t);
        t.cpX = t.x + t.c.v * 0.5;
        t.x = t.cpX + t.c.v * 1.3;
        t.lane = 1; t.force = true; t.lastFlip = t.cpX;
        t.react = t.c.react * SECOND_HALF;
        t.end = { '1': t.cpX, '-1': t.cpX };
        t.count = {};                           // the quota starts again for the second half
    }

    function pattern(t) {
        var kind = pickKind(t), keep = !t.force && t.rnd() < t.c.keep;
        var lane = keep ? -t.lane : t.lane;
        t.count[kind] = (t.count[kind] || 0) + 1;
        // Opening a stretch places no hazard, so it must not use up the
        // "next hazard goes on the floor" flag.
        if (kind === 'turbo' || kind === 'fog') { openMode(t, kind); return; }
        t.force = false;
        if (kind === 'zig') zigzag(t);
        else if (kind === 'jam') jam(t, lane);
        else place(t, kind, lane, false);
    }

    function buildLine(level) {
        var c = LEVELS[level - 1], len = c.v * c.secs;
        var t = {
            c: c, rnd: G.rng(level * 7919 + 13), haz: [], zones: [], bits: [], x: c.v * 2.4, lane: 1,
            end: { '1': 0, '-1': 0 }, mode: null, zone: null, force: true, cpX: 0,
            react: c.react, lastFlip: 0, count: {}, quota: buildQuota(c, len)
        };
        while (t.x < len) {
            if (t.mode && t.x >= t.zone.x1) closeMode(t);
            if (!t.cpX && t.x > len / 2 && !firstHalfPending(t)) relay(t);
            pattern(t);
        }
        if (t.mode) closeMode(t);
        return { haz: t.haz, zones: t.zones, bits: t.bits, cpX: t.cpX, len: t.x + c.v * 1.2 };
    }

    // A phone: the pad and the canvas are the only controls there.
    function coarse() {
        return G.isTouch();
    }

    function init(level) {
        var line = buildLine(level), v = LEVELS[level - 1].v;
        return {
            v: v, len: line.len, haz: line.haz, zones: line.zones, bits: line.bits, cpX: line.cpX,
            x: 0, prevX: 0, y: FLOOR - PS, vy: 0, g: 1, ground: true, speed: v * 0.5,
            want: 0, buf: 0, cp: false, redial: 0, started: false, squash: 0, combo: 0, touch: coarse()
        };
    }

    // ------------------------------------------------------------------
    // Sounds
    // ------------------------------------------------------------------

    // The answer tone, the two-tone chatter and the hiss of a modem training.
    function handshake(vol) {
        G.tone(2100, 0.16, { type: 'sine', vol: vol });
        for (var i = 0; i < 4; i++) G.tone(i % 2 ? 2400 : 1200, 0.06, { type: 'square', vol: vol * 0.6, delay: 0.18 + i * 0.07 });
        G.noise(0.3, { filter: 'bandpass', freq: 1500, slide: 2800, q: 5, vol: vol, delay: 0.47 });
    }

    // Four touch-tone digits: each is one row and one column frequency.
    function dialTones() {
        var rows = [697, 770, 852, 941], cols = [1209, 1336, 1477];
        for (var i = 0; i < 4; i++) {
            G.tone(G.pick(rows), 0.08, { type: 'sine', vol: 0.13, delay: 0.3 + i * 0.13 });
            G.tone(G.pick(cols), 0.08, { type: 'sine', vol: 0.13, delay: 0.3 + i * 0.13 });
        }
    }

    function flipSound(g) {
        G.tone(g < 0 ? 420 : 760, 0.09, { type: 'square', vol: 0.13, slide: g < 0 ? 900 : 300 });
    }

    function denySound() {
        G.tone(110, 0.16, { type: 'sawtooth', vol: 0.2 });
        G.tone(117, 0.16, { type: 'sawtooth', vol: 0.2 });
    }

    function zoneSound(type, entering) {
        if (type === 'turbo') G.tone(entering ? 220 : 1320, 0.35, { type: 'sawtooth', vol: 0.12, slide: entering ? 1320 : 220 });
        else if (type === 'jam' && entering) G.noise(0.3, { filter: 'bandpass', freq: 900, q: 8, vol: 0.25 });
        else if (type === 'fog' && entering) G.noise(0.6, { filter: 'highpass', freq: 3000, slide: 800, vol: 0.2 });
        else G.tone(990, 0.07, { type: 'triangle', vol: 0.12 });
    }

    // ------------------------------------------------------------------
    // Update
    // ------------------------------------------------------------------

    function zoneAt(s, type) {
        for (var i = 0; i < s.zones.length; i++) {
            var z = s.zones[i];
            if (z.type === type && s.x >= z.x0 && s.x < z.x1) return z;
        }
        return null;
    }

    function crossed(s, x) { return s.prevX < x && s.x >= x; }

    function sliderX(h, px) { return h.x - SLIDE_K * Math.max(0, px - h.x0); }

    // A swinging block reaches its deadly wire exactly as the packet arrives.
    // The wave is long enough that the block is already on its way there
    // when it scrolls into view, so what the player sees is where it is going.
    function moverY(h, px) { return MID + h.lane * MOV_A * Math.cos((h.x - px) / MOV_WAVE) - MOV_H / 2; }

    // The rectangle that kills, or null (gaps kill by letting the packet
    // fall out, and a noise burst is harmless until it goes live).
    function hazardBox(h, px) {
        var floor = h.lane > 0;
        if (h.type === 'spike') return { x: h.x + 5, y: floor ? FLOOR - 22 : CEIL, w: h.w - 10, h: 22 };
        if (h.type === 'slider') return { x: sliderX(h, px), y: floor ? FLOOR - SLIDE_S : CEIL, w: SLIDE_S, h: SLIDE_S };
        if (h.type === 'mover') return { x: h.x, y: moverY(h, px), w: MOV_W, h: MOV_H };
        if (h.type === 'burst' && h.x - px < BURST_ON) return { x: h.x, y: floor ? FLOOR - BURST_H : CEIL, w: h.w, h: BURST_H };
        return null;
    }

    function denyFlip(s) {
        denySound();
        G.popup(s.x + PS / 2, s.y - 8 * s.g, 'JAMMED', HOT);
        G.shake(3, 0.12);
    }

    // SPACE (FLIP on the pad) toggles, and so does a tap anywhere on the
    // canvas of a phone; up/down pick a wire. A flip needs a wire under the
    // packet; a press just before landing is remembered so that fast
    // rhythms do not depend on a single frame.
    function steer(s, dt) {
        if (G.hit.a || (s.touch && G.mouse.hit)) { s.want = -s.g; s.buf = BUFFER; }
        else if (G.hit.up) { s.want = -1; s.buf = BUFFER; }
        else if (G.hit.down) { s.want = 1; s.buf = BUFFER; }
        if (s.buf <= 0) return;
        s.buf -= dt;
        if (!s.ground || s.want === s.g) return;
        s.buf = 0;
        if (zoneAt(s, 'jam')) { denyFlip(s); return; }
        s.g = s.want; s.ground = false;
        flipSound(s.g);
        G.burst(s.x + PS / 2, s.g < 0 ? FLOOR : CEIL, { n: 5, color: MIDC, speed: 90, life: 0.3, size: 2 });
    }

    function scroll(s, dt) {
        var target = zoneAt(s, 'turbo') ? s.v * 2 : s.v;
        s.speed += (target - s.speed) * Math.min(1, dt * 5);
        s.x += s.speed * dt;
        G.cam.x = s.x - PX;
    }

    // Is there wire on `lane` under the packet's centre?
    function hasWire(s, lane) {
        var cx = s.x + PS / 2;
        for (var i = 0; i < s.haz.length; i++) {
            var h = s.haz[i];
            if (h.type === 'gap' && h.lane === lane && cx >= h.x && cx <= h.x + h.w) return false;
        }
        return true;
    }

    // Gravity with a terminal speed. The packet only lands if it reaches the
    // wire from the corridor side: once it has dropped into a break it keeps
    // falling even when the wire resumes beside it.
    function fall(s, dt) {
        var rest = s.g > 0 ? FLOOR - PS : CEIL;
        s.vy = G.clamp(s.vy + s.g * GRAV * dt, -VMAX, VMAX);
        var ny = s.y + s.vy * dt;
        var reached = (ny - rest) * s.g >= 0, fromInside = (s.y - rest) * s.g <= 10;
        if (reached && fromInside && hasWire(s, s.g)) {
            if (!s.ground) {
                s.squash = 0.12;
                G.noise(0.05, { freq: 500, vol: 0.16 });
                G.burst(s.x + PS / 2, s.g > 0 ? FLOOR : CEIL, { n: 4, color: DIM, speed: 80, life: 0.25, size: 2 });
            }
            s.y = rest; s.vy = 0; s.ground = true;
            return;
        }
        s.y = ny; s.ground = false;
    }

    function collect(s) {
        var cx = s.x + PS / 2, cy = s.y + PS / 2;
        for (var i = 0; i < s.bits.length; i++) {
            var b = s.bits[i];
            if (b.got || Math.abs(b.x - cx) > 20 || Math.abs(b.y - cy) > 30) continue;
            b.got = true;
            G.addScore(10);
            G.tone(BIT_NOTES[s.combo++ % BIT_NOTES.length], 0.05, { type: 'square', vol: 0.07 });
        }
    }

    // Sounds and score for what the packet has just run past. Everything is
    // detected by crossing a position, so nothing here needs a timer.
    function hazardEvents(s) {
        for (var i = 0; i < s.haz.length; i++) {
            var h = s.haz[i];
            if (h.type === 'burst' && crossed(s, h.x - BURST_WARN)) G.tone(1760, 0.05, { type: 'square', vol: 0.08 });
            if (h.type === 'burst' && crossed(s, h.x - BURST_ON)) G.noise(0.35, { filter: 'highpass', freq: 2500, vol: 0.18 });
            if (h.type === 'slider' && crossed(s, h.x0)) G.noise(0.4, { filter: 'bandpass', freq: 300, slide: 1400, q: 3, vol: 0.2 });
            if (!h.done && crossed(s, h.d1)) { h.done = true; G.addScore(5 * G.level); }
        }
    }

    function lineEvents(s) {
        s.zones.forEach(function (z) {
            if (crossed(s, z.x0)) zoneSound(z.type, true);
            if (crossed(s, z.x1)) zoneSound(z.type, false);
        });
        if (!s.cp && crossed(s, s.cpX)) {
            s.cp = true;
            G.addScore(100);
            // The relay also hands back one lost life (never more than the
            // three a level starts with): the generator narrows the flip
            // windows after it (SECOND_HALF).
            G.addLife(3);
            G.popup(s.x + 40, MID, 'RELAY LOCKED', HOT);
            handshake(0.12);
        }
    }

    function lethal(s) {
        if (s.y > FLOOR + FALL_OUT || s.y + PS < CEIL - FALL_OUT) return true;
        var me = { x: s.x + 3, y: s.y + 3, w: PS - 6, h: PS - 6 };
        for (var i = 0; i < s.haz.length; i++) {
            var box = hazardBox(s.haz[i], s.x);
            if (box && G.aabb(me, box)) return true;
        }
        return false;
    }

    // A crash costs a life and starts the redial pause; on the last life the
    // engine has already shown game over and update is not called again.
    function crash(s) {
        G.burst(s.x + PS / 2, G.clamp(s.y + PS / 2, CEIL, FLOOR), { n: 26, color: HOT, speed: 320, life: 0.7, size: 4 });
        G.noise(0.5, { vol: 0.3, freq: 3000, slide: 200 });
        G.tone(880, 0.5, { type: 'sawtooth', vol: 0.1, slide: 55 });
        G.flash(AMBER, 0.12);
        s.combo = 0;
        if (G.loseLife() > 0) { s.redial = REDIAL; dialTones(); }
    }

    // Back to the relay if it was reached, else to the start of the line.
    function respawn(s) {
        s.x = s.prevX = s.cp ? s.cpX : 0;
        s.y = FLOOR - PS; s.vy = 0; s.g = 1; s.ground = true;
        s.speed = s.v * 0.5; s.buf = 0; s.redial = 0;
        G.cam.x = s.x - PX;
        handshake(0.1);
    }

    function update(s, dt) {
        // init must stay silent, so the opening handshake waits for the first tick.
        if (!s.started) { s.started = true; handshake(0.1); }
        if (s.redial > 0) {
            s.redial -= dt;
            if (s.redial <= 0) respawn(s);
            return;
        }
        if (s.squash > 0) s.squash -= dt;
        steer(s, dt);
        scroll(s, dt);
        fall(s, dt);
        collect(s);
        hazardEvents(s);
        lineEvents(s);
        s.prevX = s.x;
        if (lethal(s)) { crash(s); return; }
        if (s.x >= s.len) G.win(500 + G.lives * 250);
    }

    // ------------------------------------------------------------------
    // Drawing (world x maps to screen x through `cam`)
    // ------------------------------------------------------------------

    function onScreen(x, w, cam) { return x + w > cam - 20 && x < cam + G.W + 20; }

    // Telephone poles drift by slower than the line, and the carrier wave
    // never stops, so the picture is alive even while the packet waits.
    function drawBack(s, ctx, cam) {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = '#140d00';
        ctx.fillRect(0, G.HUD, G.W, CEIL - G.HUD);
        ctx.fillRect(0, FLOOR, G.W, G.H - FLOOR);
        ctx.fillStyle = DARK;
        for (var x = -((cam * 0.35) % 240); x < G.W; x += 240) {
            ctx.fillRect(x, CEIL, 4, FLOOR - CEIL);
            ctx.fillRect(x - 20, CEIL + 44, 44, 3);
            ctx.fillRect(x - 14, CEIL + 64, 32, 3);
        }
        ctx.strokeStyle = DARK; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i <= G.W; i += s.touch ? 16 : 8) {
            var y = MID + Math.sin(i * 0.035 + G.t * 5 + cam * 0.01) * 9 * (1 + Math.sin(i * 0.004 + G.t));
            if (i) ctx.lineTo(i, y); else ctx.moveTo(i, y);
        }
        ctx.stroke();
    }

    // Both wires, with tick marks that show the speed, and the breaks cut
    // out of them as black pits.
    function drawWires(s, ctx, cam) {
        ctx.fillStyle = AMBER;
        ctx.fillRect(0, CEIL - 4, G.W, 4);
        ctx.fillRect(0, FLOOR, G.W, 4);
        ctx.fillStyle = DIM;
        for (var x = -(cam % 48); x < G.W; x += 48) {
            ctx.fillRect(x, CEIL - 14, 2, 8);
            ctx.fillRect(x, FLOOR + 6, 2, 8);
        }
        s.haz.forEach(function (h) {
            if (h.type !== 'gap' || !onScreen(h.x, h.w, cam)) return;
            var y = h.lane > 0 ? FLOOR - 1 : CEIL - PIT + 1;
            ctx.fillStyle = '#000';
            ctx.fillRect(h.x - cam, y, h.w, PIT);
            ctx.fillStyle = HOT;
            ctx.fillRect(h.x - cam - 3, h.lane > 0 ? FLOOR : CEIL - 12, 3, 12);
            ctx.fillRect(h.x - cam + h.w, h.lane > 0 ? FLOOR : CEIL - 12, 3, 12);
        });
    }

    function drawJam(ctx, x0, x1) {
        ctx.strokeStyle = DARK; ctx.lineWidth = 3;
        ctx.beginPath();
        for (var x = x0 - (FLOOR - CEIL); x < x1; x += 26) {
            ctx.moveTo(x, FLOOR); ctx.lineTo(x + (FLOOR - CEIL), CEIL);
        }
        ctx.stroke();
        G.text('JAMMED - NO FLIP', x0 + 10, MID + 8, { size: 24, color: MIDC });
    }

    function drawTurbo(ctx, x0, x1) {
        ctx.strokeStyle = DIM; ctx.lineWidth = 3;
        ctx.beginPath();
        for (var x = x0 + ((G.t * 300) % 80); x < x1; x += 80) {
            ctx.moveTo(x - 14, MID - 22); ctx.lineTo(x, MID); ctx.lineTo(x - 14, MID + 22);
        }
        ctx.stroke();
        G.text('2X SPEED', x0 + 10, CEIL + 26, { size: 24, color: MIDC });
    }

    // Zones are painted behind the hazards, clipped to the corridor so their
    // hatching never spills over the wires.
    function drawZones(s, ctx, cam) {
        s.zones.forEach(function (z) {
            if (!onScreen(z.x0, z.x1 - z.x0, cam)) return;
            var x0 = z.x0 - cam, x1 = z.x1 - cam;
            ctx.save();
            ctx.beginPath(); ctx.rect(x0, CEIL, x1 - x0, FLOOR - CEIL); ctx.clip();
            if (z.type === 'jam') drawJam(ctx, x0, x1);
            else if (z.type === 'turbo') drawTurbo(ctx, x0, x1);
            else G.text('DROPOUT', x0 + 10, CEIL + 26, { size: 24, color: MIDC });
            ctx.restore();
            ctx.fillStyle = MIDC;
            ctx.fillRect(x0 - 1, CEIL, 2, FLOOR - CEIL);
            ctx.fillRect(x1 - 1, CEIL, 2, FLOOR - CEIL);
        });
    }

    function drawSpike(h, ctx, x) {
        var n = Math.max(1, Math.round(h.w / 24)), tw = h.w / n;
        var base = h.lane > 0 ? FLOOR : CEIL, tip = base - h.lane * SPIKE_H;
        ctx.fillStyle = AMBER;
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
            ctx.moveTo(x + i * tw, base); ctx.lineTo(x + (i + 0.5) * tw, tip); ctx.lineTo(x + (i + 1) * tw, base);
        }
        ctx.fill();
    }

    function drawSlider(h, ctx, x, s) {
        var y = h.lane > 0 ? FLOOR - SLIDE_S : CEIL, moving = s.x > h.x0;
        ctx.fillStyle = moving ? HOT : AMBER;
        ctx.fillRect(x, y, SLIDE_S, SLIDE_S);
        ctx.fillStyle = BG;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + SLIDE_S / 2); ctx.lineTo(x + 34, y + 12); ctx.lineTo(x + 34, y + SLIDE_S - 12);
        ctx.fill();
        if (!moving) return;
        ctx.fillStyle = MIDC;
        for (var i = 0; i < 3; i++) ctx.fillRect(x + SLIDE_S + 8 + i * 14, y + 10 + i * 16, 26 - i * 6, 3);
    }

    function drawMover(h, ctx, x, s) {
        var y = moverY(h, s.x);
        ctx.fillStyle = DARK;
        ctx.fillRect(x + MOV_W / 2 - 2, CEIL, 4, FLOOR - CEIL);     // the rail it rides on
        ctx.fillStyle = AMBER;
        ctx.fillRect(x, y, MOV_W, MOV_H);
        ctx.fillStyle = BG;
        for (var i = 14; i < MOV_H - 8; i += 16) ctx.fillRect(x + 6, y + i, MOV_W - 12, 5);
        // A bright arrowhead on the end that leads towards the deadly wire:
        // far away the block still hangs near the other wire, and a glance
        // must tell where it is going, not where it is.
        var tip = h.lane > 0 ? y + MOV_H - 4 : y + 4, base = tip - h.lane * 24;
        ctx.fillStyle = HOT;
        ctx.beginPath();
        ctx.moveTo(x + 5, base); ctx.lineTo(x + MOV_W / 2, tip); ctx.lineTo(x + MOV_W - 5, base);
        ctx.fill();
    }

    // Invisible until the packet is close, then a flickering outline, then
    // live static: the warning is the only time the player gets.
    function drawBurst(h, ctx, x, s) {
        var dx = h.x - s.x, y = h.lane > 0 ? FLOOR - BURST_H : CEIL;
        if (dx > BURST_WARN) return;
        if (dx > BURST_ON) {
            // A phone shrinks this tell to a few pixels. Keep its outline
            // present throughout the warning, pulsing rather than vanishing.
            if (!s.touch && Math.floor(G.t * 12) % 2) return;
            ctx.globalAlpha = s.touch && Math.floor(G.t * 12) % 2 ? 0.65 : 1;
            ctx.strokeStyle = HOT; ctx.lineWidth = s.touch ? 4 : 2;
            ctx.setLineDash([8, 8]);
            ctx.strokeRect(x, y, h.w, BURST_H);
            ctx.setLineDash([]);
            G.text('!', x + h.w / 2, y + BURST_H / 2 + 14, { size: 44, color: HOT, align: 'center' });
            ctx.globalAlpha = 1;
            return;
        }
        ctx.fillStyle = 'rgba(255,176,0,0.22)';
        ctx.fillRect(x, y, h.w, BURST_H);
        for (var i = 0; i < h.w / (s.touch ? 6 : 3); i++) {
            ctx.fillStyle = Math.random() < 0.5 ? HOT : AMBER;
            ctx.fillRect(x + G.rnd(0, h.w - 14), y + G.rnd(0, BURST_H - 4), G.rnd(4, 14), G.rnd(2, 4));
        }
    }

    var PAINT = { spike: drawSpike, slider: drawSlider, mover: drawMover, burst: drawBurst };

    function drawHazards(s, ctx, cam) {
        s.haz.forEach(function (h) {
            if (h.type === 'gap') return;
            var x = h.type === 'slider' ? sliderX(h, s.x) : h.x;
            if (onScreen(x, h.w, cam)) PAINT[h.type](h, ctx, x - cam, s);
        });
    }

    function drawBits(s, ctx, cam) {
        var r = (s.touch ? 8 : 5) + Math.sin(G.t * 8);
        ctx.fillStyle = HOT;
        s.bits.forEach(function (b) {
            if (b.got || !onScreen(b.x, 0, cam)) return;
            var x = b.x - cam;
            ctx.beginPath();
            ctx.moveTo(x, b.y - r); ctx.lineTo(x + r, b.y); ctx.lineTo(x, b.y + r); ctx.lineTo(x - r, b.y);
            ctx.fill();
        });
    }

    // The relay (checkpoint) and the far end of the line are both posts
    // across the corridor; the relay lights up once it is locked.
    function drawPosts(s, ctx, cam) {
        var posts = [[s.cpX, 'RELAY', s.cp], [s.len, 'CONNECT', true]];
        posts.forEach(function (p) {
            if (!onScreen(p[0], 120, cam)) return;
            var x = p[0] - cam;
            ctx.fillStyle = p[2] ? HOT : DIM;
            for (var y = CEIL; y < FLOOR; y += 20) ctx.fillRect(x - 2, y + ((G.t * 30) % 20) - 10, 4, 10);
            ctx.fillStyle = BG;
            ctx.fillRect(x - 2, FLOOR, 4, 12);
            G.text(p[1], x + 10, MID - 40, { size: 22, color: p[2] ? HOT : DIM });
        });
    }

    // The packet stretches along its fall and squashes when it lands; its
    // two "header bits" sit on the side gravity pulls towards.
    function drawPacket(s, ctx) {
        if (s.redial > 0) return;
        var stretch = Math.min(8, Math.abs(s.vy) / 140), q = Math.max(0, s.squash) * 50;
        var w = PS + q - stretch * 0.5, h = PS - q + stretch;
        var x = PX + (PS - w) / 2, y = s.g > 0 ? s.y + PS - h : s.y;
        ctx.fillStyle = DIM;
        for (var i = 1; i <= 3; i++) ctx.fillRect(PX - i * 11, s.y - s.vy * 0.012 * i + i * 2, PS - i * 4, PS - i * 4);
        ctx.shadowColor = AMBER; ctx.shadowBlur = s.touch ? 0 : 14;
        ctx.fillStyle = HOT;
        ctx.fillRect(x, y, w, h);
        ctx.shadowBlur = 0;
        ctx.fillStyle = BG;
        var ey = s.g > 0 ? y + h - 9 : y + 4;
        ctx.fillRect(x + w - 8, ey, 4, 5);
        ctx.fillRect(x + w - 15, ey, 4, 5);
    }

    // In a dropout the far part of the line is lost in static; the curtain
    // fades in and out over the first and last stretch of the zone.
    function drawFog(s, ctx) {
        var z = zoneAt(s, 'fog');
        if (!z) return;
        var a = G.clamp((s.x - z.x0) / 150, 0, 1) * G.clamp((z.x1 - s.x) / 150, 0, 1);
        var x0 = PX + FOG_SIGHT, top = CEIL - PIT, h = FLOOR - CEIL + PIT * 2;
        for (var i = 0; i < 4; i++) {
            ctx.fillStyle = 'rgba(10,8,0,' + (a * 0.97 * (i + 1) / 4) + ')';
            ctx.fillRect(x0 + i * 14, top, i < 3 ? 14 : G.W - x0, h);
        }
        ctx.fillStyle = DIM;
        ctx.globalAlpha = a;
        for (var n = 0; n < (s.touch ? 40 : 90); n++) ctx.fillRect(G.rnd(x0, G.W), G.rnd(top, top + h), G.rnd(3, 16), 2);
        ctx.globalAlpha = 1;
    }

    function drawBar(s, ctx) {
        var x = 200, w = 560, y = 506, p = G.clamp(s.x / s.len, 0, 1);
        ctx.strokeStyle = DIM; ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, 12);
        ctx.fillStyle = AMBER;
        ctx.fillRect(x + 3, y + 3, (w - 6) * p, 6);
        ctx.fillStyle = s.cp ? HOT : MIDC;
        ctx.fillRect(x + w * s.cpX / s.len - 1, y - 5, 3, 22);
        G.text('LINE', x - 12, y + 12, { size: s.touch ? 28 : 20, color: s.touch ? AMBER : MIDC, align: 'right' });
        G.text(Math.floor(p * 100) + '%', x + w + 12, y + 12, { size: s.touch ? 28 : 20, color: AMBER });
    }

    // Zone labels in the world scroll away before a stretch ends. Repeat
    // every active mode above the wires, leaving both deadly lanes visible.
    function drawTouchStatus(s) {
        if (!s.touch || s.redial > 0) return;
        var modes = [];
        if (zoneAt(s, 'jam')) modes.push('JAMMED - NO FLIP');
        if (zoneAt(s, 'turbo')) modes.push('2X SPEED');
        if (zoneAt(s, 'fog')) modes.push('DROPOUT');
        if (modes.length) G.text(modes.join(' / '), G.W / 2, 70, { size: 28, color: HOT, align: 'center' });
        var ready = s.ground ? 'FLIP READY' : 'LAND TO FLIP';
        G.text(zoneAt(s, 'jam') ? 'FLIP LOCKED' : ready, G.W / 2, 478, { size: 26, color: AMBER, align: 'center' });
    }

    function drawMessages(s, ctx) {
        if (s.redial > 0) {
            if (Math.floor(G.t * 6) % 2) G.text('CARRIER LOST', G.W / 2, MID - 6, { size: 54, color: HOT, align: 'center', glow: AMBER });
            var dots = '....'.slice(0, 1 + Math.floor((REDIAL - s.redial) * 4) % 4);
            G.text('REDIALING' + dots, G.W / 2, MID + 34, { size: 26, color: AMBER, align: 'center' });
        } else if (G.level === 1 && s.x < 420) {
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(G.t * 6);
            G.text(s.touch ? 'TAP TO FLIP GRAVITY' : 'SPACE FLIPS GRAVITY', G.W / 2, MID - 60, { size: 30, color: AMBER, align: 'center' });
            ctx.globalAlpha = 1;
        }
    }

    function draw(s, ctx) {
        var cam = s.x - PX;
        drawBack(s, ctx, cam);
        drawZones(s, ctx, cam);
        drawWires(s, ctx, cam);
        drawPosts(s, ctx, cam);
        drawBits(s, ctx, cam);
        drawHazards(s, ctx, cam);
        drawPacket(s, ctx);
        drawFog(s, ctx);
        drawBar(s, ctx);
        drawTouchStatus(s);
        drawMessages(s, ctx);
    }

    function hud(s) {
        var z = zoneAt(s, 'jam') ? '  JAMMED' : (zoneAt(s, 'turbo') ? '  2X' : '');
        return (s.cp ? 'RELAY OK' : 'NO RELAY') + z;
    }

    G.register('retro', {
        title: 'CARRIER LOST',
        blurb: 'Ride the phone line to the far end. Flip between the wires to stay alive.',
        controls: [
            'SPACE / FLIP / tap: flip gravity (only on a wire)',
            'UP / DOWN keys: straight to the ceiling / floor wire',
            'The relay halfway is your checkpoint and restores one life'
        ],
        levelNames: ['Dial Tone', 'Handshake', 'Party Line', 'Line Noise', 'Crosstalk', 'Switchboard', 'Jammer', 'Overclock', 'Dropout', 'No Carrier'],
        colors: { bg: BG, fg: AMBER, accent: HOT, dim: DIM },
        lives: 3,
        music: {
            bpm: 144, root: 45, scale: 'pentatonic', prog: [0, 0, 3, 2, 0, 0, 4, 3],
            bass: 'x..x..o.x..x.5o.',
            lead: [
                '5.3.5.7.5-3.5...', '7.8.7.5.3-5-3...', '8.7.8.9.8-7.5...', '7.5.7.8.7-5-2...',
                '5.58.5.7a.87.5..', 'a.8.7.5.7-8-a...', '9.8.9.a.9-7.4...', '8.7.5.3.5---....'
            ],
            arp: '0213',
            drums: { k: 'x..x..x...x.x...', s: '....x.......x..x', h: 'x.xxx.xxx.xxx.xx' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'square', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // One button: FLIP alone is a big target, and the canvas is another.
        touch: { a: 'FLIP', hide: ['left', 'right', 'up', 'down', 'b'] }
    });
})();
