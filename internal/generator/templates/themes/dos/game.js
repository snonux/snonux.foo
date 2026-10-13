/*
 * DIGGER.EXE — the dos theme's game: a CGA tunnel digger.
 *
 * Drive the digger through the dirt and collect every emerald. Monsters crawl
 * out of the corner nest and hunt through the tunnels (nobbins), dig their own
 * way (hobbins, from level 5) or drift straight through the soil (the TSR
 * ghost, from level 9). Gold bags wobble and fall once they are undermined:
 * they crush whatever is below and burst into gold after a long drop. The
 * laser needs a slow recharge, and a cherry turns the tables for a while.
 *
 * Everything lives on a 20x10 grid of 48 px cells. Movers travel from cell
 * centre to cell centre at a speed in cells per second, so the grid stays
 * exact while motion is still integrated with dt.
 *
 * The field starts right under the engine's HUD strip, which leaves a 30 px
 * prompt line at the bottom: tall enough for 20 px text, the smallest that
 * is still readable on a phone.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var T = 48, COLS = 20, ROWS = 10, OY = G.HUD, BAR_Y = OY + ROWS * T;
    // CGA palette 1, high intensity: the only four colours on screen.
    var BLACK = '#000000', CYAN = '#55ffff', MAGENTA = '#ff55ff', WHITE = '#ffffff';
    var DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
    var DIR_NAMES = ['left', 'right', 'up', 'down'];
    var D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    var START = { c: 10, r: 9 };
    var NESTS = [{ c: 19, r: 0 }, { c: 0, r: 0 }];
    var RUN_SPEED = 4.8, DIG_SPEED = 3.4, SHOT_SPEED = 13;      // cells per second
    var BAG_G = 34, BAG_VMAX = 12;                              // cells per second (squared)
    var REFILL_AGE = 8, LOST_AGE = 3, FAR = 999, TOUCH_SCALE = 1.15;
    // Monster speed in cells per second: it climbs a little on every level
    // and stops at DIG_SPEED, so even on level 10 a digger that is cutting
    // fresh tunnel is never run down from behind by a nobbin.
    var MONSTER_SPEED = 2.3, MONSTER_STEP = 0.12;
    // Laser recharge in seconds, again growing by a small step per level.
    var RECHARGE = 3, RECHARGE_STEP = 0.2;
    var GEM_NOTES = [523, 587, 659, 698, 784, 880, 988, 1047];  // a rising scale for emerald streaks

    function abs(v) { return Math.abs(v); }

    // One entry per level. `tunnels` are the pre-dug corridors [c0, r0, c1, r1]
    // that always join the nest(s) to the start cell, so an idle player is
    // always found. `kinds` is the spawn order: n nobbin, h hobbin, g ghost.
    var LEVELS = [
        { tunnels: [[19, 0, 10, 0], [10, 0, 10, 9]], bags: 3, rocks: 0, max: 1, spawn: 5, kinds: 'n', nests: 1,
            gems: function (c, r) { return (c >= 2 && c <= 7 && r >= 2 && r <= 4) || (c >= 12 && c <= 17 && r >= 5 && r <= 7) || (c >= 3 && c <= 7 && r >= 7 && r <= 8); } },
        { tunnels: [[19, 0, 19, 4], [19, 4, 4, 4], [4, 4, 4, 9], [4, 9, 10, 9]], bags: 5, rocks: 0, max: 2, spawn: 5, kinds: 'n', nests: 1,
            gems: function (c, r) { return (r === 1 || r === 6 || r === 8) && c >= 1 && c <= 18; } },
        { tunnels: [[19, 0, 14, 0], [14, 0, 14, 6], [14, 6, 6, 6], [6, 6, 6, 2], [10, 6, 10, 9]], bags: 5, rocks: 0, max: 2, spawn: 4.5, kinds: 'n', nests: 1, cherry: true,
            gems: function (c, r) { return abs(c - 3) + abs(r - 4) <= 2 || abs(c - 17) + abs(r - 5) <= 2 || abs(c - 10) + abs(r - 3) <= 2 || abs(c - 4) + abs(r - 8) <= 1 || abs(c - 15) + abs(r - 8) <= 1; } },
        { tunnels: [[19, 0, 19, 2], [19, 2, 0, 2], [10, 2, 10, 9], [3, 2, 3, 7], [16, 2, 16, 7]], bags: 6, rocks: 14, max: 3, spawn: 4.5, kinds: 'n', nests: 1, cherry: true,
            gems: function (c, r) { return (c + r) % 2 === 0 && r >= 4 && r <= 8; } },
        { tunnels: [[19, 0, 12, 0], [12, 0, 12, 4], [12, 4, 7, 4], [7, 4, 7, 9], [7, 9, 10, 9]], bags: 6, rocks: 0, max: 3, spawn: 4.5, kinds: 'nnh', nests: 1, cherry: true,
            gems: function (c, r) { return c % 2 === 1 && r >= 2 && r <= 8; } },
        { tunnels: [[19, 0, 19, 8], [19, 8, 1, 8], [10, 8, 10, 9], [1, 8, 1, 1], [1, 1, 16, 1]], bags: 14, stack: true, rocks: 6, max: 3, spawn: 4, kinds: 'nnh', nests: 1, cherry: true,
            gems: function (c, r) { return ((r === 3 || r === 4 || r === 6) && c >= 3 && c <= 17) || (r === 7 && c >= 6 && c <= 14); } },
        { tunnels: [[0, 0, 19, 0], [10, 0, 10, 9], [4, 0, 4, 5], [15, 0, 15, 5]], bags: 7, rocks: 0, max: 4, spawn: 4, kinds: 'nhn', nests: 2, cherry: true,
            gems: function (c, r) { return (c + r * 2) % 8 < 3 && r >= 2; } },
        { tunnels: [[19, 0, 19, 3], [19, 3, 13, 3], [13, 3, 13, 6], [13, 6, 7, 6], [7, 6, 7, 9], [7, 9, 10, 9]], bags: 7, rocks: 0, max: 4, spawn: 4, kinds: 'nnh', nests: 1, cherry: true, refill: true,
            gems: function (c, r) { return ((r === 1 || r === 8) && c >= 2 && c <= 17) || ((c === 2 || c === 17) && r >= 2 && r <= 7) || ((r === 4 || r === 5) && c >= 5 && c <= 11); } },
        { tunnels: [[19, 0, 10, 0], [10, 0, 10, 9], [2, 5, 17, 5]], bags: 8, rocks: 8, max: 4, spawn: 4, kinds: 'nhng', nests: 1, cherry: true,
            gems: function (c, r, rnd) { return rnd() < 0.27; } },
        { tunnels: [[0, 0, 0, 4], [19, 0, 19, 4], [0, 4, 19, 4], [10, 4, 10, 9], [5, 4, 5, 8], [14, 4, 14, 8]], bags: 10, rocks: 12, max: 5, spawn: 4.5, kinds: 'nhnhg', nests: 2, cherry: true, refill: true,
            gems: function (c, r) { return c % 3 !== 1 && r % 2 === 1; } }
    ];

    // ------------------------------------------------------------------
    // Grid helpers
    // ------------------------------------------------------------------

    function idx(c, r) { return r * COLS + c; }
    function inside(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
    function open(s, c, r) { return inside(c, r) && !s.dirt[idx(c, r)] && !s.rock[idx(c, r)]; }
    // Pixel centre of a mover that is `p` of the way from its cell to the next.
    function px(e) { return (e.c + e.dc * e.p + 0.5) * T; }
    function py(e) { return OY + (e.r + e.dr * e.p + 0.5) * T; }
    function cellX(c) { return (c + 0.5) * T; }
    function cellY(r) { return OY + (r + 0.5) * T; }

    // A bag that rests (or wobbles) in this cell; falling bags block nothing.
    function bagAt(s, c, r) {
        for (var i = 0; i < s.bags.length; i++) {
            var b = s.bags[i];
            if (b.c === c && b.r === r && b.state !== 'fall' && !b.gone) return b;
        }
        return null;
    }

    function beep(freq, dur, slide, delay, vol) {
        G.tone(freq, dur, { type: 'square', vol: vol || 0.1, slide: slide, delay: delay });
    }

    // The DOS prompt at the bottom types out one line per event.
    function say(s, text) { s.msg = text; s.msgAt = s.time; }

    // ------------------------------------------------------------------
    // Level construction (seeded, so a level is the same on every visit)
    // ------------------------------------------------------------------

    function carveTunnels(s) {
        s.cfg.tunnels.forEach(function (t) {
            var dc = Math.sign(t[2] - t[0]), dr = Math.sign(t[3] - t[1]), c = t[0], r = t[1];
            s.dirt[idx(c, r)] = false;
            while (c !== t[2] || r !== t[3]) { c += dc; r += dr; s.dirt[idx(c, r)] = false; }
        });
        s.dirt[idx(START.c, START.r)] = false;
    }

    // Rocks never touch each other, not even diagonally, so they can never
    // wall an emerald in.
    function placeRocks(s, rnd) {
        for (var n = 0, tries = 0; n < s.cfg.rocks && tries < 600; tries++) {
            var c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS), near = false;
            if (!s.dirt[idx(c, r)] || (abs(c - START.c) < 2 && r > 6)) continue;
            for (var dr = -1; dr <= 1; dr++) {
                for (var dc = -1; dc <= 1; dc++) if (inside(c + dc, r + dr) && s.rock[idx(c + dc, r + dr)]) near = true;
            }
            if (near) continue;
            s.rock[idx(c, r)] = true; s.dirt[idx(c, r)] = false; n++;
        }
    }

    function newBag(c, r) {
        return { c: c, r: r, y: r, vy: 0, r0: r, state: 'rest', t: 0, slide: 0, pushed: false, gone: false };
    }

    // Bags start on solid dirt with room to fall once it is dug away. The
    // "stack" level piles a second bag on top for chain reactions.
    function placeBags(s, rnd) {
        for (var n = 0, tries = 0; n < s.cfg.bags && tries < 800; tries++) {
            var c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * (ROWS - 2));
            var free = s.dirt[idx(c, r)] && s.dirt[idx(c, r + 1)] && !bagAt(s, c, r) && !bagAt(s, c, r + 1);
            if (!free || (abs(c - START.c) < 2 && r > 5)) continue;
            s.bags.push(newBag(c, r)); n++;
            if (s.cfg.stack && r > 0 && s.dirt[idx(c, r - 1)] && !bagAt(s, c, r - 1)) { s.bags.push(newBag(c, r - 1)); n++; }
        }
    }

    function placeGems(s, rnd) {
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                if (!s.dirt[idx(c, r)] || bagAt(s, c, r) || !s.cfg.gems(c, r, rnd)) continue;
                s.gem[idx(c, r)] = true; s.left++;
            }
        }
    }

    function newPlayer() {
        return { c: START.c, r: START.r, dc: 0, dr: 0, ldc: 0, ldr: 0, p: 0, speed: RUN_SPEED, face: 'up', dig: false };
    }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 7919 + 13), n = COLS * ROWS;
        var s = {
            cfg: cfg, level: level, touch: G.isTouch(), time: 0, left: 0, dirt: [], rock: [], gem: [], dug: [], dist: [],
            bags: [], golds: [], enemies: [], shot: null, cherry: null, pl: newPlayer(), want: null, dir: null,
            charge: 1, recharge: RECHARGE + level * RECHARGE_STEP, power: 0, combo: 0, dead: 0, inv: 0,
            spawnT: 2.2, spawned: 0, cherryT: 14, pathT: 0, refillT: 0, digT: 0, tickT: 0,
            streak: 0, lastGem: -9, msg: 'DIGGER.EXE /LEVEL:' + level, msgAt: 0
        };
        for (var i = 0; i < n; i++) { s.dirt.push(true); s.rock.push(false); s.gem.push(false); s.dug.push(0); s.dist.push(FAR); }
        carveTunnels(s);
        for (i = 0; i < cfg.nests; i++) s.dirt[idx(NESTS[i].c, NESTS[i].r)] = false;
        placeRocks(s, rnd);
        placeBags(s, rnd);
        placeGems(s, rnd);
        return s;
    }

    // ------------------------------------------------------------------
    // Movement shared by the digger and the monsters
    // ------------------------------------------------------------------

    // Advances a mover along its current cell-to-cell hop. `start` picks the
    // next hop whenever the mover sits on a cell centre; `arrive` runs when a
    // hop completes. Left-over progress carries into the next hop so speed
    // does not depend on where the tick boundaries fall.
    function stepMover(s, e, dt, start, arrive) {
        if (!e.dc && !e.dr) {
            start(s, e);
            if (!e.dc && !e.dr) return;
        }
        e.p += e.speed * dt;
        if (e.p < 1) return;
        var rest = e.p - 1;
        e.c += e.dc; e.r += e.dr; e.ldc = e.dc; e.ldr = e.dr;
        e.dc = 0; e.dr = 0; e.p = 0;
        if (arrive) arrive(s, e);
        start(s, e);
        if (e.dc || e.dr) e.p = Math.min(rest, 0.9);
    }

    // Removes the dirt of a cell and stamps when it was last used, which is
    // what the refilling levels age against. Returns whether dirt was dug.
    function digCell(s, c, r) {
        var i = idx(c, r), was = s.dirt[i];
        if (was || s.dug[i] > 0) s.dug[i] = s.time;
        s.dirt[i] = false;
        return was;
    }

    // ------------------------------------------------------------------
    // The digger
    // ------------------------------------------------------------------

    // The most recently pressed direction wins while it is held, so a turn
    // can be buffered before the digger reaches the junction.
    function readWant(s) {
        DIR_NAMES.forEach(function (n) { if (G.hit[n]) s.want = n; });
        if (s.want && G.key[s.want]) { s.dir = s.want; return; }
        s.dir = null;
        DIR_NAMES.forEach(function (n) { if (!s.dir && G.key[n]) s.dir = n; });
    }

    // An emerald that ends up under a bag would be out of reach (bags cannot
    // be entered from above or below), so the bag grinds it to dust instead.
    function crushGem(s, c, r) {
        var i = idx(c, r);
        if (!s.gem[i]) return;
        s.gem[i] = false; s.left--;
        G.burst(cellX(c), cellY(r), { n: 8, color: CYAN });
        beep(1200, 0.08, 300, 0, 0.08);
    }

    // A monster standing in (or stepping into) a cell holds a pushed bag
    // back. The ghost does not count: it passes through bags anyway.
    function monsterIn(s, c, r) {
        return s.enemies.some(function (e) {
            return e.kind !== 'g' && ((e.c === c && e.r === r) || (e.c + e.dc === c && e.r + e.dr === r));
        });
    }

    // Bags only slide sideways, and never onto a rock, another bag or a
    // monster. Sliding one over an emerald is allowed but costs the emerald.
    function pushBag(s, bag, d) {
        var c = bag.c + d[0];
        if (d[1] || !inside(c, bag.r) || s.rock[idx(c, bag.r)] || bagAt(s, c, bag.r) || monsterIn(s, c, bag.r)) return false;
        bag.c = c; bag.slide = -d[0]; bag.pushed = true; bag.state = 'rest';
        crushGem(s, c, bag.r);
        beep(110, 0.08, 80);
        return true;
    }

    // The cherry is a turbo for the digger as well as a fright for monsters.
    function playerSpeed(s, dig) { return (dig ? DIG_SPEED : RUN_SPEED) * (s.power > 0 ? 1.25 : 1); }

    function playerStart(s, pl) {
        if (!s.dir) return;
        var d = DIRS[s.dir], c = pl.c + d[0], r = pl.r + d[1];
        // Turning to face a wall still aims the laser that way.
        pl.face = s.dir;
        if (!inside(c, r) || s.rock[idx(c, r)]) return;
        var bag = bagAt(s, c, r);
        if (bag && !pushBag(s, bag, d)) return;
        pl.dig = digCell(s, c, r);
        pl.dc = d[0]; pl.dr = d[1];
        pl.speed = playerSpeed(s, pl.dig);
    }

    // Emeralds picked up in quick succession climb a scale; a full octave
    // pays a bonus, as in the original.
    function collectGem(s, pl) {
        var i = idx(pl.c, pl.r);
        if (!s.gem[i]) return;
        s.gem[i] = false; s.left--;
        s.streak = s.time - s.lastGem < 1.3 ? Math.min(7, s.streak + 1) : 0;
        s.lastGem = s.time;
        beep(GEM_NOTES[s.streak], 0.09, 0, 0, 0.12);
        G.addScore(25);
        G.burst(px(pl), py(pl), { n: 6, color: CYAN, speed: 120, life: 0.35 });
        if (s.streak === 7) {
            G.addScore(250); G.popup(px(pl), py(pl) - 16, 'OCTAVE +250', WHITE);
            s.streak = 0; s.lastGem = -9;
            say(s, 'EMERALD.DAT: 8 in a row');
        }
    }

    // Backing out of a half-dug cell runs through tunnel that is already
    // open, so it is no longer a dig: full speed, no drill noise.
    function reverse(s, pl, name) {
        pl.c += pl.dc; pl.r += pl.dr;
        pl.dc = -pl.dc; pl.dr = -pl.dr; pl.p = 1 - pl.p;
        pl.face = name; pl.dig = false; pl.speed = playerSpeed(s, false);
    }

    function updatePlayer(s, dt) {
        var pl = s.pl, d = s.dir && DIRS[s.dir];
        // Turning back mid-hop is instant; every other turn waits for the
        // next cell centre.
        if (d && (pl.dc || pl.dr) && d[0] === -pl.dc && d[1] === -pl.dr) reverse(s, pl, s.dir);
        stepMover(s, pl, dt, playerStart, collectGem);
        if ((pl.dc || pl.dr) && s.digT <= 0) {
            s.digT = pl.dig ? 0.09 : 0.16;
            if (pl.dig) beep(90 + Math.random() * 60, 0.03, 0, 0, 0.07);
            else beep(60, 0.02, 0, 0, 0.04);
        }
    }

    function killPlayer(s, text) {
        if (s.dead > 0 || s.inv > 0) return;
        if (G.loseLife() <= 0) return;
        s.dead = 1.5;
        say(s, text + ' - Abort, Retry, Fail?');
        G.burst(px(s.pl), py(s.pl), { n: 24, color: WHITE, speed: 200, life: 0.7 });
        // A little PC-speaker dirge while the tombstone rises.
        [330, 330, 294, 262, 196].forEach(function (f, i) { beep(f, 0.2, 0, 0.25 + i * 0.2, 0.12); });
    }

    // After a death the digger restarts at the bottom with the tunnels,
    // emeralds and bags as they were; only the monsters are sent home.
    function respawn(s) {
        var bag = bagAt(s, START.c, START.r);
        if (bag) bag.gone = true;
        s.pl = newPlayer();
        s.enemies = []; s.shot = null; s.power = 0; s.want = null;
        s.spawnT = 2; s.inv = 2; s.charge = 1;
        say(s, 'RETRY');
    }

    // ------------------------------------------------------------------
    // Laser
    // ------------------------------------------------------------------

    function fire(s) {
        // Holding the phone button retries at the same recharge rate as tapping.
        if (!(s.touch ? G.key.a : G.hit.a)) return;
        if (s.charge < 1 || s.shot) { if (G.hit.a) beep(70, 0.05, 0, 0, 0.06); return; }
        var d = DIRS[s.pl.face];
        s.shot = { x: px(s.pl), y: py(s.pl), dc: d[0], dr: d[1] };
        s.charge = 0;
        beep(1500, 0.18, 200, 0, 0.11);
    }

    function killEnemy(s, e, points, label) {
        e.gone = true;
        G.addScore(points);
        G.popup(px(e), py(e) - 14, label + ' +' + points, WHITE);
        G.burst(px(e), py(e), { n: 18, color: e.kind === 'h' ? MAGENTA : CYAN, speed: 220, life: 0.6 });
        beep(400, 0.22, 60, 0, 0.14); beep(200, 0.2, 40, 0.06, 0.1);
        say(s, NAMES[e.kind] + ' terminated');
    }

    // A burst bag leaves a pile of gold where it was.
    function spillGold(s, b) {
        b.gone = true;
        s.golds.push({ c: b.c, r: b.r, t: 10 });
        G.burst(cellX(b.c), cellY(b.r), { n: 16, color: CYAN, speed: 200, life: 0.6, gravity: 500 });
        [784, 988, 1175, 1568].forEach(function (f, k) { beep(f, 0.06, 0, k * 0.05); });
        say(s, 'GOLD.DAT spilled - grab it');
    }

    // The bolt flies down the tunnel and fizzles on the first dirt or rock.
    // A bag in its way bursts into gold, so no bag can ever wall the digger
    // or an emerald in for good.
    function updateShot(s, dt) {
        var sh = s.shot;
        if (!sh) return;
        sh.x += sh.dc * SHOT_SPEED * T * dt; sh.y += sh.dr * SHOT_SPEED * T * dt;
        var c = Math.floor(sh.x / T), r = Math.floor((sh.y - OY) / T), bag = inside(c, r) && bagAt(s, c, r);
        if (bag) { spillGold(s, bag); s.shot = null; return; }
        if (!open(s, c, r)) {
            G.burst(sh.x, sh.y, { n: 8, color: WHITE, speed: 140, life: 0.3 });
            beep(160, 0.06, 90);
            s.shot = null;
            return;
        }
        for (var i = 0; i < s.enemies.length; i++) {
            var e = s.enemies[i];
            if (e.gone || G.dist(sh.x, sh.y, px(e), py(e)) > T * 0.55) continue;
            killEnemy(s, e, 250, 'ZAP');
            s.shot = null;
            return;
        }
    }

    // ------------------------------------------------------------------
    // Gold bags
    // ------------------------------------------------------------------

    function supported(s, b) {
        var r = b.r + 1;
        return r >= ROWS || s.dirt[idx(b.c, r)] || s.rock[idx(b.c, r)] || !!bagAt(s, b.c, r);
    }

    // Anything under a falling bag is flattened; the digger only when the
    // bag is coming down onto him, not when it drops away below.
    function crush(s, b) {
        var bx = cellX(b.c), by = cellY(b.y), pl = s.pl;
        s.enemies.forEach(function (e) {
            if (!e.gone && abs(px(e) - bx) < T * 0.6 && abs(py(e) - by) < T * 0.75) killEnemy(s, e, 300, 'CRUSH');
        });
        if (abs(px(pl) - bx) < T * 0.6 && abs(py(pl) - by) < T * 0.75 && by < py(pl) + T * 0.2) killPlayer(s, 'BAG.SYS fell on DIGGER');
    }

    function landBag(s, b) {
        b.y = b.r; b.vy = 0;
        G.shake(4, 0.15);
        // A long drop splits the bag open; a short one leaves it intact.
        if (b.r - b.r0 >= 2) { spillGold(s, b); return; }
        b.state = 'rest';
        beep(70, 0.12, 40, 0, 0.16);
        crushGem(s, b.c, b.r);
    }

    function fallBag(s, b, dt) {
        b.vy = Math.min(BAG_VMAX, b.vy + BAG_G * dt);
        b.y += b.vy * dt;
        if (b.y >= b.r + 1) b.r++;
        if (supported(s, b) && b.y >= b.r) { landBag(s, b); return; }
        crush(s, b);
    }

    // Undermined bags wobble as a warning before they drop. A bag shoved
    // over a hole goes almost at once, which makes it a weapon.
    function updateBag(s, b, dt) {
        b.slide -= Math.sign(b.slide) * Math.min(abs(b.slide), RUN_SPEED * dt);
        if (b.state === 'fall') { fallBag(s, b, dt); return; }
        if (supported(s, b)) { b.state = 'rest'; b.pushed = false; return; }
        if (b.state === 'rest') {
            b.state = 'wobble'; b.t = b.pushed ? 0.35 : 1.2; b.pushed = false;
            say(s, 'BAG.SYS unstable');
        }
        b.t -= dt;
        if (b.t > 0) return;
        b.state = 'fall'; b.y = b.r; b.r0 = b.r; b.vy = 0;
        beep(900, 0.4, 120, 0, 0.08);
    }

    function updateBags(s, dt) {
        var wobbling = false;
        s.bags.forEach(function (b) {
            updateBag(s, b, dt);
            if (b.state === 'wobble') wobbling = true;
        });
        s.bags = s.bags.filter(function (b) { return !b.gone; });
        if (wobbling && s.tickT <= 0) { s.tickT = 0.12; beep(180 + Math.random() * 60, 0.04, 0, 0, 0.07); }
    }

    // Spilled gold is worth a lot but does not last, and monsters eat it.
    function updateGolds(s, dt) {
        var pl = s.pl;
        s.golds = s.golds.filter(function (g) {
            var x = cellX(g.c), y = cellY(g.r);
            g.t -= dt;
            if (s.dead <= 0 && G.dist(x, y, px(pl), py(pl)) < T * 0.6) {
                G.addScore(500); G.popup(x, y - 14, 'GOLD +500', WHITE);
                [1047, 1319, 1568, 2093].forEach(function (f, k) { beep(f, 0.07, 0, k * 0.05, 0.12); });
                return false;
            }
            var eaten = s.enemies.some(function (e) { return e.kind !== 'g' && G.dist(x, y, px(e), py(e)) < T * 0.5; });
            if (eaten) beep(140, 0.15, 70);
            return !eaten && g.t > 0;
        });
    }

    // ------------------------------------------------------------------
    // Monsters
    // ------------------------------------------------------------------

    var NAMES = { n: 'NOBBIN.EXE', h: 'HOBBIN.COM', g: 'GHOST.TSR' };
    // What each kind may walk into: nobbins need a tunnel, hobbins chew
    // through dirt, the ghost ignores the map altogether.
    var PASS = {
        n: function (s, c, r) { return open(s, c, r) && !bagAt(s, c, r); },
        h: function (s, c, r) { return inside(c, r) && !s.rock[idx(c, r)] && !bagAt(s, c, r); },
        g: function (s, c, r) { return inside(c, r); }
    };

    // Tunnel distance from every reachable cell to the digger (breadth-first).
    function computeDist(s) {
        var pl = s.pl, d = s.dist, q = [], head = 0;
        for (var i = 0; i < d.length; i++) d[i] = FAR;
        var c0 = pl.p > 0.5 ? pl.c + pl.dc : pl.c, r0 = pl.p > 0.5 ? pl.r + pl.dr : pl.r;
        d[idx(c0, r0)] = 0; q.push(c0, r0);
        while (head < q.length) {
            var c = q[head++], r = q[head++], n = d[idx(c, r)] + 1;
            for (var k = 0; k < 4; k++) {
                var nc = c + D4[k][0], nr = r + D4[k][1];
                if (!PASS.n(s, nc, nr) || d[idx(nc, nr)] <= n) continue;
                d[idx(nc, nr)] = n; q.push(nc, nr);
            }
        }
    }

    // Lower is better. Nobbins follow the tunnel distance; hobbins weigh the
    // tunnel route against simply digging straight at the digger; the ghost
    // takes the straight line. With the cherry active everyone runs away.
    function rate(s, e, c, r) {
        var man = abs(c - s.pl.c) + abs(r - s.pl.r), d = s.dist[idx(c, r)];
        if (s.power > 0) return -man;
        if (e.kind === 'g') return man;
        if (e.kind === 'n') return d;
        return d < FAR ? Math.min(d, man + 4) : man + 2;
    }

    function chooseDir(s, e) {
        var opts = D4.filter(function (d) { return PASS[e.kind](s, e.c + d[0], e.r + d[1]); });
        // Like every maze monster they do not turn back unless cornered,
        // which gives the digger a way to shake them off at junctions.
        var fwd = opts.filter(function (d) { return d[0] !== -e.ldc || d[1] !== -e.ldr; });
        if (fwd.length) opts = fwd;
        if (!opts.length) return null;
        if (e.kind === 'n' && Math.random() < 0.12) return G.pick(opts);
        var best = null, bestV = 0;
        opts.forEach(function (d) {
            var v = rate(s, e, e.c + d[0], e.r + d[1]);
            // Ties are broken at random so cut-off nobbins wander.
            if (!best || v < bestV || (v === bestV && Math.random() < 0.5)) { best = d; bestV = v; }
        });
        return best;
    }

    function enemyStart(s, e) {
        var d = chooseDir(s, e);
        if (!d) return;
        var dug = e.kind === 'h' && digCell(s, e.c + d[0], e.r + d[1]);
        if (dug) beep(70 + Math.random() * 30, 0.04, 0, 0, 0.05);
        e.dc = d[0]; e.dr = d[1];
        e.speed = e.base * (dug ? 0.5 : 1) * (s.power > 0 ? 0.6 : 1);
    }

    function spawnEnemy(s) {
        var cfg = s.cfg, nest = NESTS[s.spawned % cfg.nests], kind = cfg.kinds.charAt(s.spawned % cfg.kinds.length);
        // One ghost at a time is plenty: nothing on the map slows it down.
        if (kind === 'g' && s.enemies.some(function (e) { return e.kind === 'g'; })) kind = 'n';
        var base = kind === 'g' ? 1.4 + s.level * 0.06 : Math.min(DIG_SPEED, MONSTER_SPEED + s.level * MONSTER_STEP) * (kind === 'h' ? 0.9 : 1);
        s.spawned++;
        s.enemies.push({ kind: kind, c: nest.c, r: nest.r, dc: 0, dr: 0, ldc: 0, ldr: 0, p: 0, base: base, speed: base, born: 0.8, lost: 0, mutant: false, gone: false });
        beep(220, 0.1, 440, 0, 0.08); beep(330, 0.1, 660, 0.1, 0.08);
        if (s.spawned <= cfg.kinds.length) say(s, 'Loading ' + NAMES[kind] + '...');
    }

    function updateSpawns(s, dt) {
        // A full house holds the timer back so a kill is not answered
        // by an instant replacement.
        if (s.enemies.length >= s.cfg.max) { s.spawnT = Math.max(s.spawnT, 1.5); return; }
        s.spawnT -= dt;
        if (s.spawnT > 0) return;
        s.spawnT = s.cfg.spawn;
        spawnEnemy(s);
    }

    // A nobbin can lose every route to the digger: tunnels silt up on the
    // DEFRAG levels, and on any level a bag that drops into a tunnel plugs
    // it. It would idle for the rest of the level, hold a spawn slot and
    // leave a digger behind the plug safe for ever, so after a while it
    // turns hobbin and digs its way through. Where soil does not creep back
    // the plug is the digger's own doing and buys a longer respite.
    function mutateLost(s, e, dt) {
        if (e.kind !== 'n') return;
        e.lost = s.dist[idx(e.c, e.r)] >= FAR ? e.lost + dt : 0;
        if (e.lost < (s.cfg.refill ? LOST_AGE : LOST_AGE * 3)) return;
        e.kind = 'h'; e.base *= 0.9; e.mutant = true;
        beep(180, 0.2, 90, 0, 0.1);
        say(s, 'NOBBIN.EXE mutated: ' + NAMES.h);
    }

    // The mutation lasts only as long as it is needed: back in a tunnel that
    // leads to the digger the monster is a nobbin again, so the early levels
    // never keep a digging enemy.
    function revertMutant(s, e) {
        if (!e.mutant || e.kind !== 'h' || s.dist[idx(e.c, e.r)] >= FAR) return;
        e.kind = 'n'; e.base /= 0.9; e.mutant = false; e.lost = 0;
    }

    function touchPlayer(s, e) {
        if (G.dist(px(e), py(e), px(s.pl), py(s.pl)) > T * 0.62) return;
        if (s.power > 0) {
            s.combo++;
            killEnemy(s, e, 200 * s.combo, 'CHOMP');
            return;
        }
        killPlayer(s, NAMES[e.kind] + ' caught DIGGER');
    }

    function updateEnemies(s, dt) {
        s.pathT -= dt;
        if (s.pathT <= 0) { s.pathT = 0.15; computeDist(s); }
        s.enemies.forEach(function (e) {
            if (e.gone) return;
            // A freshly spawned monster materialises first: harmless and still.
            if (e.born > 0) { e.born -= dt; return; }
            mutateLost(s, e, dt);
            revertMutant(s, e);
            stepMover(s, e, dt, enemyStart, null);
            touchPlayer(s, e);
        });
        s.enemies = s.enemies.filter(function (e) { return !e.gone; });
    }

    // ------------------------------------------------------------------
    // Cherry, refilling tunnels, timers
    // ------------------------------------------------------------------

    // The cherry shows up in a tunnel some way off, so fetching it is a risk.
    function placeCherry(s) {
        var cells = [];
        for (var r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                if (open(s, c, r) && !bagAt(s, c, r) && abs(c - s.pl.c) + abs(r - s.pl.r) >= 5) cells.push({ c: c, r: r, t: 10 });
            }
        }
        if (!cells.length) return;
        s.cherry = G.pick(cells);
        beep(660, 0.08, 0, 0); beep(880, 0.08, 0, 0.09);
        say(s, 'CHERRY.COM found');
    }

    function eatCherry(s) {
        s.cherry = null;
        s.power = Math.max(4.5, 8 - s.level * 0.3); s.combo = 0; s.cherryT = 22;
        G.addScore(100); G.flash(MAGENTA, 0.2);
        [523, 659, 784, 1047, 1319].forEach(function (f, k) { beep(f, 0.08, 0, k * 0.06, 0.12); });
        say(s, 'CHERRY.COM: monsters are edible!');
    }

    function updateCherry(s, dt) {
        var ch = s.cherry;
        if (!s.cfg.cherry) return;
        if (!ch) {
            s.cherryT -= dt;
            if (s.cherryT <= 0 && s.power <= 0) { s.cherryT = 6; placeCherry(s); }
            return;
        }
        ch.t -= dt;
        if (G.dist(cellX(ch.c), cellY(ch.r), px(s.pl), py(s.pl)) < T * 0.6) eatCherry(s);
        else if (ch.t <= 0 || !open(s, ch.c, ch.r)) { s.cherry = null; s.cherryT = 16; }
    }

    // Whether anything is in (or heading for) a cell, so it must stay open.
    function occupied(s, c, r) {
        // Movers also keep the cells next to them open, so soil never walls
        // one in where it stands.
        function near(e) { return abs(e.c - c) + abs(e.r - r) <= 1 || (e.c + e.dc === c && e.r + e.dr === r); }
        if (near(s.pl) || s.enemies.some(near)) return true;
        if (s.cherry && s.cherry.c === c && s.cherry.r === r) return true;
        if (s.golds.some(function (g) { return g.c === c && g.r === r; })) return true;
        return s.bags.some(function (b) { return b.c === c && (b.r === r || (b.state === 'fall' && b.r + 1 === r)); });
    }

    // On the DEFRAG levels soil creeps back into dug tunnels that have not
    // been used for a while, oldest first, so escape routes close behind you.
    function refill(s, dt) {
        s.refillT -= dt;
        if (s.refillT > 0) return;
        s.refillT = 0.35;
        var best = -1, age = REFILL_AGE;
        for (var i = 0; i < s.dug.length; i++) {
            var a = s.time - s.dug[i];
            if (s.dug[i] > 0 && !s.dirt[i] && a > age && !occupied(s, i % COLS, Math.floor(i / COLS))) { best = i; age = a; }
        }
        if (best < 0) return;
        s.dirt[best] = true; s.dug[best] = 0;
        G.burst(cellX(best % COLS), cellY(Math.floor(best / COLS)), { n: 6, color: MAGENTA, speed: 60, life: 0.4 });
        beep(55, 0.05, 0, 0, 0.06);
    }

    function tickTimers(s, dt) {
        s.digT -= dt; s.tickT -= dt;
        if (s.inv > 0) s.inv -= dt;
        if (s.charge < 1) {
            s.charge = Math.min(1, s.charge + dt / s.recharge);
            if (s.charge >= 1) { beep(880, 0.05, 0, 0, 0.08); beep(1320, 0.07, 0, 0.06, 0.08); }
        }
        if (s.power <= 0) return;
        s.power -= dt;
        // A nervous two-note tick that speeds up as the cherry wears off.
        if (s.tickT <= 0) { s.tickT = s.power < 2 ? 0.12 : 0.24; beep(s.power < 2 ? 330 : 494, 0.04, 0, 0, 0.06); }
        if (s.power <= 0) say(s, 'CHERRY.COM exited');
    }

    function update(s, dt) {
        s.time += dt;
        tickTimers(s, dt);
        updateBags(s, dt);
        updateGolds(s, dt);
        if (s.dead > 0) {
            s.dead -= dt;
            if (s.dead <= 0) respawn(s);
            return;
        }
        readWant(s);
        updatePlayer(s, dt);
        fire(s);
        updateShot(s, dt);
        updateSpawns(s, dt);
        updateEnemies(s, dt);
        updateCherry(s, dt);
        if (s.cfg.refill) refill(s, dt);
        if (s.left <= 0) G.win(500 + G.lives * 250);
    }

    // ------------------------------------------------------------------
    // Drawing: the field
    // ------------------------------------------------------------------

    function box(ctx, color, x, y, w, h) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

    // Dirt is a magenta raster over black (stripes one way or the other, or a
    // weave, depending on the level); tunnels are then cut out of it in black.
    function drawDirt(s, ctx) {
        var h = ROWS * T, style = s.level % 3, step = s.touch ? 12 : 6, x, y, i;
        box(ctx, BLACK, 0, 0, G.W, G.H);
        ctx.fillStyle = MAGENTA;
        ctx.beginPath();
        if (style === 1) for (x = 0; x < G.W; x += step) ctx.rect(x, OY, 3, h);
        else for (y = 0; y < h; y += step) ctx.rect(0, OY + y, G.W, 3);
        if (style === 2) for (x = 0; x < G.W; x += step * 2) ctx.rect(x, OY, 3, h);
        ctx.fill();
        ctx.fillStyle = BLACK;
        ctx.beginPath();
        for (i = 0; i < s.dirt.length; i++) {
            if (!s.dirt[i]) ctx.rect((i % COLS) * T, OY + Math.floor(i / COLS) * T, T, T);
        }
        ctx.fill();
    }

    // Tunnels that are about to silt up show a thickening sprinkle of soil.
    function drawRefill(s, ctx) {
        if (!s.cfg.refill) return;
        ctx.fillStyle = MAGENTA;
        for (var i = 0; i < s.dug.length; i++) {
            var left = REFILL_AGE - (s.time - s.dug[i]);
            if (s.dirt[i] || s.dug[i] <= 0 || left > 4) continue;
            var x = (i % COLS) * T, y = OY + Math.floor(i / COLS) * T, n = Math.min(12, Math.floor((4 - left) * 3) + 1);
            for (var k = 0; k < n; k++) ctx.fillRect(x + (k * 19 + i * 7) % 42, y + (k * 31 + i * 3) % 42, 6, 3);
        }
    }

    function drawRocks(s, ctx) {
        for (var i = 0; i < s.rock.length; i++) {
            if (!s.rock[i]) continue;
            var x = (i % COLS) * T, y = OY + Math.floor(i / COLS) * T;
            box(ctx, WHITE, x + 3, y + 3, T - 6, T - 6);
            box(ctx, CYAN, x + 3, y + T - 11, T - 6, 8);
            box(ctx, CYAN, x + T - 11, y + 3, 8, T - 6);
            box(ctx, BLACK, x + 10, y + 14, 14, 3);
            box(ctx, BLACK, x + 21, y + 17, 3, 12);
            box(ctx, BLACK, x + 24, y + 26, 10, 3);
        }
    }

    function diamondPath(ctx, x, y, w, h) {
        ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x - w, y);
        ctx.closePath();
    }

    function diamond(ctx, x, y, w, h) {
        ctx.beginPath(); diamondPath(ctx, x, y, w, h); ctx.fill();
    }

    // Keep the whole map visible: hiding distant bags or nests removes the
    // warning a player needs. Larger sprites and quieter soil survive downscale.
    function spriteScale(s, ctx, x, y) {
        ctx.save();
        if (!s.touch) return;
        ctx.translate(x, y); ctx.scale(TOUCH_SCALE, TOUCH_SCALE); ctx.translate(-x, -y);
    }

    function drawGems(s, ctx) {
        if (s.touch) { drawPhoneGems(s, ctx); return; }
        var beat = Math.floor(s.time * 8);
        for (var i = 0; i < s.gem.length; i++) {
            if (!s.gem[i]) continue;
            var c = i % COLS, r = Math.floor(i / COLS), x = cellX(c), y = cellY(r);
            ctx.fillStyle = BLACK; diamond(ctx, x, y, 19, 16);
            ctx.fillStyle = CYAN; diamond(ctx, x, y, 15, 12);
            ctx.fillStyle = WHITE; diamond(ctx, x - 3, y - 3, 6, 4);
            // A glint runs across the field so the screen is never still.
            if ((c * 7 + r * 13 + beat) % 19 === 0) { box(ctx, WHITE, x + 3, y - 9, 3, 13); box(ctx, WHITE, x - 2, y - 4, 13, 3); }
        }
    }

    function drawPhoneGems(s, ctx) {
        var beat = Math.floor(s.time * 8), layers = [[BLACK, 19, 16], [CYAN, 15, 12], [WHITE, 6, 4]];
        // Gems occupy disjoint cells, so their same-colour shapes can be batched.
        layers.forEach(function (layer, n) {
            ctx.fillStyle = layer[0]; ctx.beginPath();
            for (var i = 0; i < s.gem.length; i++) {
                if (!s.gem[i]) continue;
                var c = i % COLS, r = Math.floor(i / COLS), x = cellX(c), y = cellY(r);
                diamondPath(ctx, x - (n === 2 ? 3 : 0), y - (n === 2 ? 3 : 0), layer[1] * TOUCH_SCALE, layer[2] * TOUCH_SCALE);
                if (n === 2 && (c * 7 + r * 13 + beat) % 19 === 0) {
                    ctx.rect(x + 3, y - 9, 3, 13); ctx.rect(x - 2, y - 4, 13, 3);
                }
            }
            ctx.fill();
        });
    }

    // The nest is a pulsing square portal; it flashes just before a spawn.
    function drawNests(s, ctx) {
        var warn = s.spawnT < 1 && s.enemies.length < s.cfg.max && Math.floor(s.time * 10) % 2 === 0;
        for (var n = 0; n < s.cfg.nests; n++) {
            var x = NESTS[n].c * T, y = OY + NESTS[n].r * T, ph = Math.floor(s.time * 6) % 3;
            for (var k = 0; k < 4; k++) {
                var inset = 2 + k * 6;
                box(ctx, warn ? WHITE : ((k + ph) % 3 === 0 ? MAGENTA : ((k + ph) % 3 === 1 ? CYAN : BLACK)), x + inset, y + inset, T - inset * 2, T - inset * 2);
            }
        }
    }

    // ------------------------------------------------------------------
    // Drawing: things
    // ------------------------------------------------------------------

    function disc(ctx, color, x, y, rx, ry) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry || rx, 0, 0, Math.PI * 2); ctx.fill();
    }

    function drawBags(s, ctx) {
        s.bags.forEach(function (b) {
            var x = cellX(b.c + b.slide), y = cellY(b.y);
            if (b.state === 'wobble') x += Math.sin(s.time * 38) * 3.5;
            spriteScale(s, ctx, x, y);
            disc(ctx, BLACK, x, y + 3, 19, 20);
            disc(ctx, WHITE, x, y + 4, 16, 16);
            box(ctx, WHITE, x - 7, y - 19, 14, 8);
            box(ctx, CYAN, x - 9, y - 13, 18, 4);
            G.text('$', x, y + 12, { size: 20, bold: true, color: MAGENTA, align: 'center' });
            ctx.restore();
        });
    }

    function drawGolds(s, ctx) {
        s.golds.forEach(function (g) {
            if (g.t < 3 && Math.floor(s.time * 8) % 2) return;
            var x = cellX(g.c), y = cellY(g.r) + 12, glint = Math.floor(s.time * 7) % 5;
            [[-12, 0], [0, 0], [12, 0], [-6, -9], [6, -9]].forEach(function (p, k) {
                disc(ctx, BLACK, x + p[0], y + p[1], 9, 7);
                disc(ctx, k === glint ? WHITE : CYAN, x + p[0], y + p[1], 7, 5);
            });
        });
    }

    function drawCherry(s, ctx) {
        var ch = s.cherry;
        if (!ch || (ch.t < 3 && Math.floor(s.time * 8) % 2)) return;
        var x = cellX(ch.c), y = cellY(ch.r) + Math.sin(s.time * 5) * 3;
        box(ctx, CYAN, x - 7, y - 14, 3, 14); box(ctx, CYAN, x - 7, y - 16, 14, 3); box(ctx, CYAN, x + 6, y - 14, 3, 16);
        disc(ctx, MAGENTA, x - 6, y + 6, 9); disc(ctx, MAGENTA, x + 8, y + 9, 9);
        box(ctx, WHITE, x - 10, y + 1, 4, 4); box(ctx, WHITE, x + 4, y + 4, 4, 4);
    }

    // Eyes track the digger. Fleeing monsters turn white and their eyes go
    // blank.
    function drawEyes(s, ctx, x, y, e, scared) {
        var lx = Math.sign(px(s.pl) - px(e)) * 2, ly = Math.sign(py(s.pl) - py(e)) * 2;
        [-7, 7].forEach(function (o) {
            box(ctx, scared ? BLACK : WHITE, x + o - 4, y - 8, 8, 9);
            if (!scared) box(ctx, BLACK, x + o - 2 + lx, y - 5 + ly, 4, 4);
        });
    }

    function drawNobbin(s, ctx, x, y, e, scared, step) {
        var body = scared ? WHITE : CYAN;
        disc(ctx, body, x, y - 2, 17, 15);
        box(ctx, body, x - 13 + (step ? 0 : 4), y + 9, 7, 9);
        box(ctx, body, x + 6 - (step ? 0 : 4), y + 9, 7, 9);
        drawEyes(s, ctx, x, y, e, scared);
        box(ctx, BLACK, x - 5, y + 5, 10, 2);
    }

    // The hobbin is all jaw: a white skull with magenta teeth that chomp.
    function drawHobbin(s, ctx, x, y, e, scared, step) {
        var gap = step ? 3 : 8;
        box(ctx, WHITE, x - 17, y - 17, 34, 20);
        box(ctx, scared ? CYAN : MAGENTA, x - 17, y + 3, 34, gap);
        box(ctx, WHITE, x - 17, y + 3 + gap, 34, 17 - gap);
        ctx.fillStyle = WHITE;
        for (var k = 0; k < 4; k++) { ctx.fillRect(x - 14 + k * 8, y + 3, 4, 3); ctx.fillRect(x - 10 + k * 8, y + gap, 4, 3); }
        drawEyes(s, ctx, x, y - 3, e, true);
        box(ctx, scared ? CYAN : MAGENTA, x - 9, y - 9, 4, 5); box(ctx, scared ? CYAN : MAGENTA, x + 5, y - 9, 4, 5);
    }

    // The ghost is drawn as scan lines that roll, so the dirt shows through.
    function drawGhost(s, ctx, x, y, scared) {
        var roll = Math.floor(s.time * 12) % 4;
        ctx.fillStyle = scared ? CYAN : WHITE;
        for (var k = -18 + roll; k < 18; k += 4) {
            var half = k < -6 ? 17 - (-6 - k) * 0.9 : 17;
            ctx.fillRect(x - half, y + k, half * 2, 2);
        }
        box(ctx, MAGENTA, x - 10, y - 8, 7, 8); box(ctx, MAGENTA, x + 3, y - 8, 7, 8);
    }

    function drawEnemies(s, ctx) {
        // Near the end of the cherry the monsters blink back to their colour.
        var scared = s.power > 0 && (s.power > 2 || Math.floor(s.time * 8) % 2 === 0);
        s.enemies.forEach(function (e) {
            var x = px(e), y = py(e), step = Math.floor(s.time * 7 + e.c + e.r) % 2 === 0;
            if (e.born > 0 && Math.floor(s.time * 14) % 2) return;
            if (s.power > 0) x += Math.sin(s.time * 50 + e.c) * 1.5;
            spriteScale(s, ctx, x, y);
            if (s.touch) disc(ctx, BLACK, x, y, 20, 22);
            if (e.kind === 'n') drawNobbin(s, ctx, x, y, e, scared, step);
            else if (e.kind === 'h') drawHobbin(s, ctx, x, y, e, scared, step);
            else drawGhost(s, ctx, x, y, scared);
            ctx.restore();
        });
    }

    // Drawn facing right and then turned, so one sprite serves all four ways.
    function drawDigger(s, ctx) {
        var pl = s.pl, moving = pl.dc || pl.dr, spin = Math.floor(s.time * (moving ? 16 : 5)) % 2;
        spriteScale(s, ctx, px(pl), py(pl));
        ctx.translate(px(pl), py(pl));
        if (pl.face === 'left') ctx.scale(-1, 1);
        else if (pl.face !== 'right') ctx.rotate(pl.face === 'up' ? -Math.PI / 2 : Math.PI / 2);
        box(ctx, WHITE, -17, -10, 22, 19);
        box(ctx, CYAN, -13, -17, 13, 8);
        box(ctx, BLACK, -10, -15, 7, 4);
        ctx.fillStyle = s.power > 0 ? WHITE : MAGENTA;
        ctx.beginPath(); ctx.moveTo(5, -12); ctx.lineTo(21, -1); ctx.lineTo(5, 10); ctx.closePath(); ctx.fill();
        // The drill bit's thread alternates to make it turn.
        box(ctx, s.power > 0 ? MAGENTA : WHITE, 7 + spin * 4, -7 + spin * 2, 3, 13 - spin * 5);
        box(ctx, CYAN, -17, 9, 9, 8); box(ctx, CYAN, -4, 9, 9, 8);
        box(ctx, BLACK, -14 + spin * 3, 12, 3, 3); box(ctx, BLACK, -1 + spin * 3, 12, 3, 3);
        ctx.restore();
    }

    function drawTombstone(s, ctx) {
        var x = px(s.pl), y = py(s.pl) + Math.max(0, s.dead - 1.1) * 60;
        disc(ctx, WHITE, x, y - 6, 15);
        box(ctx, WHITE, x - 15, y - 6, 30, 26);
        box(ctx, CYAN, x - 19, y + 16, 38, 6);
        G.text('RIP', x, y + 8, { size: s.touch ? 20 : 14, bold: true, color: BLACK, align: 'center' });
    }

    function drawPlayer(s, ctx) {
        if (s.dead > 0) { drawTombstone(s, ctx); return; }
        // Blink while the respawn shield is up.
        if (s.inv > 0 && Math.floor(s.time * 12) % 2) return;
        drawDigger(s, ctx);
    }

    function drawShot(s, ctx) {
        var sh = s.shot;
        if (!sh) return;
        var len = s.touch ? 26 : 22, thin = s.touch ? 9 : 6, w = sh.dc ? len : thin, h = sh.dc ? thin : len;
        box(ctx, Math.floor(s.time * 30) % 2 ? WHITE : CYAN, sh.x - w / 2, sh.y - h / 2, w, h);
        box(ctx, MAGENTA, sh.x - sh.dc * 18 - 3, sh.y - sh.dr * 18 - 3, 6, 6);
    }

    // The laser's charge as ten cells: stubs while it recharges, full bars
    // (white once it is ready) as it fills.
    function drawGauge(s, ctx) {
        var cells = Math.floor(s.charge * 10), ready = s.charge >= 1;
        if (s.touch) {
            G.text(ready ? 'FIRE READY' : 'FIRE ' + Math.floor(s.charge * 100) + '%', 948, BAR_Y + 25,
                { size: 26, color: ready ? WHITE : CYAN, align: 'right', max: 164 });
            return;
        }
        G.text(ready ? 'LASER RDY' : 'LASER', 846, BAR_Y + 22, { size: 20, color: ready ? WHITE : MAGENTA, align: 'right', max: 100 });
        for (var k = 0; k < 10; k++) {
            box(ctx, k < cells ? (ready ? WHITE : CYAN) : MAGENTA, 854 + k * 10, BAR_Y + (k < cells ? 5 : 15), 8, k < cells ? 20 : 4);
        }
    }

    // The bottom line is a DOS prompt that types the latest event, next to
    // the laser's charge gauge (and the cherry timer while it runs).
    function drawStatus(s, ctx) {
        if (s.touch) { drawPhoneStatus(s, ctx); return; }
        var shown = s.msg.slice(0, Math.floor((s.time - s.msgAt) * 40)), cursor = Math.floor(s.time * 3) % 2 ? '_' : ' ';
        box(ctx, BLACK, 0, BAR_Y, G.W, G.H - BAR_Y);
        G.text('C:\\DIGGER>' + shown + cursor, 8, BAR_Y + 22, { size: 20, color: CYAN, max: 540 });
        drawGauge(s, ctx);
        if (s.power <= 0) return;
        G.text('TURBO', 614, BAR_Y + 22, { size: 20, color: WHITE, align: 'right', max: 56 });
        box(ctx, MAGENTA, 622, BAR_Y + 7, Math.max(0, s.power) * 10, 16);
    }

    function drawPhoneStatus(s, ctx) {
        box(ctx, BLACK, 0, BAR_Y, G.W, G.H - BAR_Y);
        // The prompt is decorative; the event and both ability states matter
        // on a narrow screen. Give each its own fixed region so they coexist.
        G.text(s.msg.replace(' - Abort, Retry, Fail?', '').replace('NOBBIN.EXE', 'NOBBIN')
            .replace('HOBBIN.COM', 'HOBBIN').replace('CHERRY.COM', 'CHERRY'),
            8, BAR_Y + 25, { size: 26, color: CYAN, max: 550 });
        if (s.power > 0) G.text('TURBO ' + Math.ceil(s.power) + 's', 570, BAR_Y + 25,
            { size: 26, color: WHITE, max: 180 });
        drawGauge(s, ctx);
    }

    function draw(s, ctx) {
        drawDirt(s, ctx);
        drawRefill(s, ctx);
        drawRocks(s, ctx);
        drawGems(s, ctx);
        drawNests(s, ctx);
        drawGolds(s, ctx);
        drawCherry(s, ctx);
        drawBags(s, ctx);
        drawEnemies(s, ctx);
        drawPlayer(s, ctx);
        drawShot(s, ctx);
        drawStatus(s, ctx);
    }

    function hud(s) { return 'EMERALDS ' + s.left; }

    G.register('dos', {
        title: 'DIGGER.EXE',
        blurb: 'Dig out every emerald. Drop gold bags on whatever crawls out of the nest.',
        controls: [
            'ARROWS / PAD dig and drive · push gold bags sideways',
            'SPACE / FIRE laser down the tunnel (slow recharge) · it bursts a bag too',
            'Undermined bags wobble, then fall: they crush monsters - and you',
            'A long fall bursts a bag into gold · the cherry makes monsters edible'
        ],
        levelNames: ['AUTOEXEC.BAT', 'CONFIG.SYS', 'CHERRY.COM', 'BAD SECTORS', 'HOBBIN.COM', 'GOLDRUSH.ZIP', 'DUAL BOOT', 'DEFRAG', 'GHOST.TSR', 'FORMAT C:'],
        colors: { bg: BLACK, fg: WHITE, accent: CYAN, dim: MAGENTA },
        lives: 4,
        // PC-speaker flavour: nothing but square waves, and only a tick of
        // percussion under a bouncing arpeggio tune.
        music: {
            bpm: 132, root: 48, scale: 'major', prog: [0, 0, 3, 4, 0, 0, 4, 0],
            bass: 'x.o.x.o.x.o.5.o.',
            lead: [
                '0.2.4.2.7.4.2.4.', '0.2.4.2.7---4...', '3.5.7.5.a.7.5.7.', '4.6.8.6.b---8...',
                '9.7.4.7.9.7.4.2.', '0.2.4.7.9---7...', '8.6.4.6.8.b.8.6.', '7.4.2.4.0---....'
            ],
            arp: '....0.......2...',
            drums: { k: 'x.......x.......', h: '..x...x...x...x.' },
            leadWave: 'square', bassWave: 'square', arpWave: 'square', leadOct: 1
        },
        // Grid movement: one direction at a time, so a thumb a little off
        // axis cannot hold two. A is the laser; nothing sits on B.
        touch: { a: 'FIRE', hide: ['b'], dirs: 4 },
        init: init, update: update, draw: draw, hud: hud
    });
})();
