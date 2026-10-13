/*
 * Nukem Time — the nukem theme's game: a run'n'gun platformer.
 *
 * A warhead is counting down somewhere in the level. Run and gun through a
 * side-scrolling stage, find the keycard, and get through the exit door
 * before the clock hits zero. Every stage is stitched together from
 * hand-shaped chunks by a seeded generator, so a level is the same on every
 * visit but no two levels share a layout.
 *
 * Each level brings something new: turrets (2), drones (3), acid pools (4),
 * moving platforms and troopers that shoot back (5), lifts (6), hopping
 * mutants (7), laser gates (8), a blackout with only a torch (9) and the
 * Overlord, a mech that carries the keycard itself (10).
 *
 * Two things keep the pressure on: when the clock runs out the warhead ends
 * the run outright, and whoever camps in one spot gets shelled (waiting for
 * a lift or a moving platform is not camping).
 *
 * On a phone the pad carries every control: the stick runs, jumps (up) and
 * ducks (down), A fires and B throws a grenade.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var T = 30, ROWS = 18, FLOOR = 16;              // tile size, grid height, row of the ground surface
    // A jump rises 108 px (3.6 tiles) and carries 5.4 tiles, so the chunks
    // below never ask for more than a 4-tile gap or a 3-tile step.
    var GRAV = 1500, RUN = 215, JUMP = 570;
    var LEASH = 330;                                // how far a posted drone strays from its post
    var RED = '#ff0000', GOLD = '#ffd700', YEL = '#ffcc00', BLOOD = '#cc0000';
    var LIGHT = '#e0e0e0', GREY = '#3a3a3a', DARK = '#111111', ACID = '#7dff3a', SKIN = '#e8b890';

    var THEMES = [
        { wall: '#3a3a3a', top: '#ffcc00', sky: '#140404', glow: '#5a0d0d' },
        { wall: '#4a3a2a', top: '#ffd700', sky: '#0f0803', glow: '#5a300a' },
        { wall: '#2e3440', top: '#e0e0e0', sky: '#07070f', glow: '#3a1030' },
        { wall: '#2f3a2a', top: '#7dff3a', sky: '#040a04', glow: '#12300f' },
        { wall: '#4a2a1a', top: '#ff6a00', sky: '#120803', glow: '#5a2a0a' },
        { wall: '#3a3a44', top: '#ffd700', sky: '#08080c', glow: '#2a2a3a' },
        { wall: '#3a2a3a', top: '#ff3a8a', sky: '#0c050c', glow: '#3a0f3a' },
        { wall: '#2a2a2a', top: '#ff0000', sky: '#0a0000', glow: '#4a0000' },
        { wall: '#33332a', top: '#ffcc00', sky: '#000000', glow: '#1a1a0a' },
        { wall: '#3a1a1a', top: '#ffd700', sky: '#1a0000', glow: '#8a1010' }
    ];

    // ------------------------------------------------------------------
    // Level chunks
    // ------------------------------------------------------------------
    //
    // The last string of a chunk is the ground row. Legend:
    //   # steel   c crate (shootable)   ~ acid   B barrel   K keycard   D exit
    //   e ground enemy (type depends on the level)   j hopper   t turret
    //   d drone   X boss
    //   h health   s spread gun   r rapid gun   n grenades   ! laser gate
    //   M--- platform sliding along the dashes (W starts at the far end)
    //   L with | above it: a lift that rides up the bars
    // Every chunk starts and ends on two columns of plain ground (the seam is
    // also the checkpoint) and can be crossed in both directions, so a player
    // who walked past the keycard can always go back for it. Nothing solid
    // hangs over a gap: a ceiling there would cut the jump short. A laser gate
    // stands on at least two tiles of floor on either side, never over acid:
    // a lit gate throws the player back, and that must not be into a pool.

    var START = ['            ', '            ', '############'];
    var END = ['              ', '           D  ', '##############'];
    var ARENA = [
        '                                      ',
        '      cc                      cc      ',
        '   h  cc    B      X      B   cc  n   ',
        '######################################'
    ];
    var KEYS = [
        { min: 1, rows: ['        K         ', '       ###        ', '     ##   ##   e  ', '  e               ', '##################'] },
        { min: 1, rows: ['           K        ', '          ###       ', '       ##     t     ', '    ##       ###    ', '  e      B        e ', '####################'] },
        { min: 5, rows: ['                      ', '          K           ', '    M-------------    ', '####~~~~~~~~~~~~~~####'] }
    ];
    var CHUNKS = [
        { min: 1, rows: ['                ', '     e    B  e  ', '################'] },
        { min: 1, rows: ['                  ', '      h     s     ', '  e            t  ', '#####   ###   ####'] },
        { min: 1, rows: ['          t         ', '         ###    s   ', '      #######  e    ', '   ############## B ', '####################'] },
        { min: 1, rows: ['    e      r     ', '   ###    ###    ', '       c         ', ' B     c   B   e ', '#################'] },
        { min: 1, rows: ['                   ', '  e    B    B   e  ', '####  ##   ##  ####'] },
        { min: 2, rows: ['            t     ', '     #    ####    ', '  e  #  e      h  ', '##################'] },
        { min: 2, rows: ['        t           ', '      #####     n   ', '                    ', '   e         ####   ', '             ####  e', '####################'] },
        { min: 3, rows: ['    d        d      ', '                    ', '       cc           ', '  e    cc    B   e  ', '####################'] },
        { min: 3, rows: ['   d       d       d  ', '                      ', '      ##       ##     ', '  e        B       e  ', '######################'] },
        { min: 4, rows: ['                     ', '          h          ', '  e               e  ', '####~~~##~~~##~~~####'] },
        { min: 4, rows: ['     d          d     ', '                      ', '        ##    ##      ', '  B                 n ', '#####~~~~~~~~~~~~#####'] },
        { min: 4, rows: ['                       ', '  e       t         e  ', '####~~~~#####~~~~######'] },
        { min: 5, rows: ['          s             ', '                        ', '                      e ', '    M-------------      ', '####~~~~~~~~~~~~~~######'] },
        { min: 5, rows: ['       d             h      ', '                            ', '                            ', '    M--------  W--------    ', '####                    ####'] },
        { min: 5, rows: ['                          ', '             r         e  ', '     M------   W------    ', '####~~~~~~~~~~~~~~~~~~####'] },
        { min: 6, rows: ['            e t          ', '    |   ##########  |    ', '    |   ##########  |    ', '    |   ##########  |    ', '    |   ##########  |    ', '    |   ##########  |    ', '    L   ##########  L    ', '#########################'] },
        { min: 6, rows: ['                h           ', '       |      #####         ', '       |      ######        ', '       |      #######       ', '  ##   |      ########   e  ', '  ##   L      #########     ', '####~~~~~~~~~~##############'] },
        { min: 7, rows: ['    ###      ###    ', '                    ', '  j   e  B   e   j  ', '####################'] },
        { min: 7, rows: ['      j        j      ', '     ###      ###     ', '  e        B       e  ', '######################'] },
        { min: 8, rows: ['      !     !       ', '      !     !    r  ', '      !  e  !       ', '      !     !       ', '####################'] },
        { min: 8, rows: ['   !             !    ', '   !             !    ', '   !             !    ', ' e !             !  e ', '######~~~##~~~########'] }
    ];

    var KINDS = {
        grunt: { w: 20, h: 26, hp: 2, score: 100 }, trooper: { w: 20, h: 26, hp: 3, score: 200 },
        hopper: { w: 22, h: 18, hp: 2, score: 150 }, turret: { w: 24, h: 20, hp: 4, score: 250 },
        drone: { w: 28, h: 16, hp: 2, score: 200 }, boss: { w: 64, h: 72, hp: 150, score: 5000 }
    };

    // x is the horizontal centre, feet the bottom edge. `seed` (0..1) spreads
    // out timers so a row of enemies does not act in lockstep. Enemies gain
    // one hit point at level 5 and another at level 10: more than that and a
    // casual player is still shooting when the next one arrives. The
    // Overlord's 150 are a good half minute of steady fire.
    function makeEnemy(kind, x, feet, level, seed) {
        var k = KINDS[kind], hp = k.hp + (kind === 'boss' ? 0 : Math.floor(level / 5));
        return {
            kind: kind, x: x - k.w / 2, y: feet - k.h, w: k.w, h: k.h, vx: 0, vy: 0, hp: hp, max: hp,
            dir: -1, t: seed, cool: 0.8 + seed, flash: 0, ph: seed * 6, n: 0, burst: 0, bt: 0, air: false
        };
    }

    function groundKind(L) {
        var roster = L.level >= 7 ? ['grunt', 'trooper', 'hopper', 'hopper'] : (L.level >= 5 ? ['grunt', 'trooper'] : ['grunt']);
        return roster[Math.floor(L.rnd() * roster.length)];
    }

    function addEnemy(L, kind, c, r) {
        var e = makeEnemy(kind, c * T + T / 2, (r + 1) * T, L.level, L.rnd());
        L.enemies.push(e);
        return e;
    }

    function addPickup(kind) {
        return function (L, c, r) { L.pickups.push({ kind: kind, x: c * T, y: r * T }); };
    }

    // The dashes after an M/W (or the bars above an L) give the travel; the
    // platform itself is three tiles wide.
    function addMover(L, c, r, dx, dy, far) {
        var dist = Math.abs(dx) + Math.abs(dy);
        var m = {
            ax: c * T, ay: r * T, bx: c * T + dx, by: r * T - dy, x: 0, y: 0, w: 3 * T, h: 12,
            dx: 0, dy: 0, phase: far ? 0.5 : 0, period: 2.6 + dist / 45
        };
        // Placed from its phase right away, so a level that has not been
        // updated yet (the title screen preview) already draws it correctly.
        placeMover(m, 0);
        L.movers.push(m);
    }

    // Platforms ease between their two ends and rest there for a moment, so
    // there is time to step on and off.
    function placeMover(m, t) {
        var f = (t / m.period + m.phase) % 1, tri = f < 0.5 ? f * 2 : 2 - f * 2;
        var u = G.clamp((tri - 0.12) / 0.76, 0, 1);
        u = u * u * (3 - 2 * u);
        m.x = G.lerp(m.ax, m.bx, u); m.y = G.lerp(m.ay, m.by, u);
    }

    function runLength(rows, i, j, di, dj, ch) {
        var n = 0;
        while (rows[i + di * (n + 1)] && rows[i + di * (n + 1)].charAt(j + dj * (n + 1)) === ch) n++;
        return n;
    }

    var SPAWN = {
        // Early levels thin the crowd out; by level 10 every marker is used.
        e: function (L, c, r) { if (L.rnd() < 0.6 + L.level * 0.04) addEnemy(L, groundKind(L), c, r); },
        t: function (L, c, r) { if (L.level >= 2) addEnemy(L, 'turret', c, r); },
        // A drone patrols the stretch it was posted to (`home`); see aiDrone.
        d: function (L, c, r) { if (L.level >= 3) addEnemy(L, 'drone', c, r).home = c * T; },
        j: function (L, c, r) { addEnemy(L, 'hopper', c, r); },
        X: function (L, c, r) { addEnemy(L, 'boss', c, r); L.arena = { x0: (c - 17) * T, x1: (c + 17) * T }; },
        B: function (L, c, r) { L.barrels.push({ x: c * T + 5, y: r * T + 4, w: 20, h: 26, fuse: -1 }); },
        h: addPickup('h'), s: addPickup('s'), r: addPickup('r'), n: addPickup('n'),
        K: function (L, c, r) { L.card = { x: c * T, y: r * T }; },
        D: function (L, c, r) { L.door = { x: c * T, y: (r - 1) * T, w: T, h: 2 * T }; },
        M: function (L, c, r, rows, i, j) { addMover(L, c, r, (runLength(rows, i, j, 0, 1, '-') - 2) * T, 0, false); },
        W: function (L, c, r, rows, i, j) { addMover(L, c, r, (runLength(rows, i, j, 0, 1, '-') - 2) * T, 0, true); },
        L: function (L, c, r, rows, i, j) { addMover(L, c, r, 0, runLength(rows, i, j, -1, 0, '|') * T, false); },
        '!': function (L, c, r) { L.lasers.push({ x: c * T + 11, y: r * T, w: 8, h: T, ph: c * 0.37 }); }
    };

    function newLevel(level) {
        var map = [];
        for (var r = 0; r < ROWS; r++) map.push([]);
        return {
            level: level, rnd: G.rng(level * 7919 + 13), map: map, w: 0, enemies: [], barrels: [], pickups: [],
            movers: [], lasers: [], checks: [], card: null, door: null, arena: null
        };
    }

    function placeChunk(L, rows) {
        var x0 = L.w, w = rows[0].length, top = FLOOR - rows.length + 1, r, c;
        for (r = 0; r < ROWS; r++) for (c = 0; c < w; c++) L.map[r][x0 + c] = ' ';
        for (var i = 0; i < rows.length; i++) {
            for (var j = 0; j < w; j++) {
                var ch = rows[i].charAt(j);
                if (ch === '#' || ch === 'c' || ch === '~') L.map[top + i][x0 + j] = ch;
                else if (SPAWN[ch]) SPAWN[ch](L, x0 + j, top + i, rows, i, j);
            }
        }
        // The ground is two tiles thick; under an acid pool that second tile
        // is the bottom of the pool, under a gap there is nothing at all.
        for (c = 0; c < w; c++) if (L.map[FLOOR][x0 + c] !== ' ') L.map[FLOOR + 1][x0 + c] = '#';
        L.checks.push({ x: (x0 + 1) * T, on: x0 === 0 });
        L.w += w;
    }

    // Chunks that introduce this level's new feature are four times as
    // likely, so "the acid level" really is full of acid.
    function pickChunk(L, last) {
        var pool = [];
        CHUNKS.forEach(function (c, i) {
            if (c.min > L.level || i === last) return;
            var n = c.min === L.level ? 4 : (c.min > 1 && L.level - c.min <= 2 ? 2 : 1);
            while (n--) pool.push(i);
        });
        return pool[Math.floor(L.rnd() * pool.length)];
    }

    function pickKeyChunk(L) {
        var pool = KEYS.filter(function (k) { return k.min <= L.level; });
        return pool[Math.floor(L.rnd() * pool.length)].rows;
    }

    // The chunks that first appear on this level. Every third slot of the
    // stage is filled from this list, so the level's own feature shows up
    // at least three times whatever the dice say.
    function debutChunks(level) {
        var list = [];
        CHUNKS.forEach(function (c, i) { if (c.min === level && level > 1) list.push(i); });
        return list;
    }

    // Tight enough that dawdling loses. A lift has to be waited for and
    // ridden, so each one buys a few seconds; the Overlord buys two minutes.
    function timeLimit(L, chunks) {
        var lifts = L.movers.filter(function (m) { return m.by !== m.ay; }).length;
        return 45 + 8 * chunks + 4 * lifts + (L.level === 10 ? 120 : 0);
    }

    function buildLevel(level) {
        var L = newLevel(level), n = level === 10 ? 7 : 8 + level, keyAt = Math.floor(n * 0.6), last = -1;
        var debut = debutChunks(level), used = 0;
        placeChunk(L, START);
        for (var i = 0; i < n; i++) {
            // On level 10 the Overlord carries the card, so no key chunk.
            if (i === keyAt && level < 10) { placeChunk(L, pickKeyChunk(L)); continue; }
            if (debut.length && i % 3 === 1) {
                // Never the same chunk twice in a row, feature slot or not.
                if (debut[used % debut.length] === last) used++;
                last = debut[used++ % debut.length];
            } else last = pickChunk(L, last);
            placeChunk(L, CHUNKS[last].rows);
        }
        if (level === 10) placeChunk(L, ARENA);
        placeChunk(L, END);
        L.time = timeLimit(L, n + 2);
        return L;
    }

    function makeSolid(map, cols) {
        // Row 0 sits under the HUD, so it acts as a ceiling; the level's two
        // ends are walls; below the last row is open (a pit).
        return function (tx, ty) {
            if (tx < 0 || tx >= cols || ty < 1) return true;
            var ch = map[ty] ? map[ty][tx] : ' ';
            return ch === '#' || ch === 'c';
        };
    }

    function newPlayer() {
        var y = FLOOR * T - 26;
        return {
            x: 60, y: y, w: 18, h: 26, vx: 0, vy: 0, ground: true, face: 1, hp: 100, inv: 0, cool: 0, muzzle: 0,
            weapon: 'gun', ammo: 0, nades: 3, coyote: 0, jbuf: 0, ride: null, crouch: false, inAcid: false,
            anim: 0, zap: 0, prevFeet: y + 26, cx: 60, cy: y
        };
    }

    // A phone has no keyboard, only the pad (see `steer` for what changes).
    function coarse() {
        return G.isTouch();
    }

    function init(level) {
        var L = buildLevel(level);
        return {
            level: level, theme: THEMES[level - 1], map: L.map, cols: L.w, solid: makeSolid(L.map, L.w),
            enemies: L.enemies, barrels: L.barrels, pickups: L.pickups, movers: L.movers, lasers: L.lasers,
            checks: L.checks, card: L.card, door: L.door, arena: L.arena, haveCard: false,
            boss: L.enemies.filter(function (e) { return e.kind === 'boss'; })[0] || null,
            p: newPlayer(), shots: [], nades: [], blasts: [], t: 0, clock: L.time, cam: 0,
            msg: '', msgT: 0, gate: {}, finale: 0, dark: level === 9, anchor: 60, camp: 0, touch: coarse()
        };
    }

    // ------------------------------------------------------------------
    // Small shared helpers
    // ------------------------------------------------------------------

    function tileAt(s, tx, ty) {
        var row = s.map[ty];
        return (row && row[tx]) || ' ';
    }

    // Cull decoration only; simulation still runs across the whole stage.
    function visible(x, w) { return x + w >= G.cam.x - 40 && x <= G.cam.x + G.W + 40; }

    function say(s, text) { s.msg = text; s.msgT = 2.2; }

    // True at most once per `every` seconds: keeps continuous sounds (acid
    // sizzle, the locked-door buzz) from being retriggered on every tick.
    function gate(s, name, every) {
        if ((s.gate[name] || 0) > s.t) return false;
        s.gate[name] = s.t + every;
        return true;
    }

    // Ducking halves the target, which is how trooper fire is dodged.
    function hurtBox(p) {
        return p.crouch ? { x: p.x, y: p.y + 12, w: p.w, h: p.h - 12 } : p;
    }

    function foeShot(s, x, y, vx, vy, extra) {
        var b = { x: x, y: y, vx: vx, vy: vy, g: 0, life: 2.4, dmg: 12, r: 4, foe: true };
        for (var k in extra) b[k] = extra[k];
        s.shots.push(b);
    }

    // ------------------------------------------------------------------
    // Damage, explosions and death
    // ------------------------------------------------------------------

    function killPlayer(s) {
        var p = s.p;
        G.burst(p.x + p.w / 2, Math.min(p.y, G.H - 20), { n: 26, color: BLOOD, speed: 260, gravity: 700, life: 0.8 });
        if (G.loseLife() <= 0) return;
        // A life buys a full health bar at the last checkpoint; the level,
        // the keycard and the clock all carry on.
        p.x = p.cx; p.y = p.cy; p.vx = 0; p.vy = 0; p.hp = 100; p.inv = 2; p.ride = null;
        say(s, 'BACK IN ACTION');
    }

    function hurt(s, dmg, kx) {
        var p = s.p;
        if (p.inv > 0) return;
        p.hp -= dmg; p.inv = 0.9; p.vx = kx * 230; p.vy = -230;
        G.sfx('hit');
        G.flash(BLOOD, 0.1);
        if (p.hp <= 0) killPlayer(s);
    }

    // Blast doors at both ends of the arena. Shut while the Overlord is up,
    // so it cannot be shot from a spot it cannot reach, and nobody slips
    // past it to the exit.
    function sealArena(s, shut) {
        [s.arena.x0 / T - 1, s.arena.x1 / T].forEach(function (c) {
            for (var r = 1; r < FLOOR; r++) s.map[r][c] = shut ? '#' : ' ';
        });
        G.noise(0.4, { freq: 400, slide: 60, vol: 0.35 });
        G.shake(6, 0.3);
    }

    // The fight ends with the Overlord: what it had in the air goes out with
    // it and its own drones (the ones without a post) drop, so nobody is
    // killed by a dead boss on the way to the keycard. The shots are only
    // marked as spent: this may run in the middle of updateShots' own pass.
    function bossDown(s, e) {
        s.shots.forEach(function (b) { if (b.foe) b.life = 0; });
        s.enemies.forEach(function (d) { if (d.kind === 'drone' && d.home === undefined) d.dead = true; });
        sealArena(s, false);
        s.card = { x: e.x + e.w / 2 - 15, y: FLOOR * T - 40 };
        s.finale = 1.6;
        G.flash('#ffffff', 0.4);
        say(s, 'OVERLORD DOWN - GRAB THE KEYCARD');
    }

    function killEnemy(s, e) {
        e.dead = true;
        G.addScore(KINDS[e.kind].score);
        G.popup(e.x + e.w / 2, e.y, KINDS[e.kind].score, GOLD);
        G.burst(e.x + e.w / 2, e.y + e.h / 2, { n: 14, color: e.kind === 'hopper' ? ACID : BLOOD, speed: 220, gravity: 600 });
        G.noise(0.18, { freq: 700, slide: 120, vol: 0.22 });
        G.tone(180, 0.2, { type: 'sawtooth', slide: 50, vol: 0.14 });
        if (e.kind === 'boss') bossDown(s, e);
    }

    function damageEnemy(s, e, dmg) {
        // The Overlord is armoured until the fight has actually started.
        if (e.dead || (e.kind === 'boss' && !e.awake)) return;
        e.hp -= dmg; e.flash = 0.1;
        G.tone(240, 0.05, { slide: 120, vol: 0.12 });
        if (e.hp <= 0) killEnemy(s, e);
    }

    function breakCrate(s, tx, ty) {
        s.map[ty][tx] = ' ';
        G.addScore(10);
        G.burst(tx * T + 15, ty * T + 15, { n: 8, color: '#9a6a2a', speed: 170, gravity: 700 });
        G.noise(0.1, { freq: 500, vol: 0.18 });
        // Loot is a bonus, not part of the layout, so it may be random.
        if (Math.random() < 0.3) s.pickups.push({ kind: G.pick(['h', 's', 'r', 'n']), x: tx * T, y: ty * T });
        // A crate that was resting on this one goes with it; tiles cannot
        // fall, and a crate left hanging in the air would look wrong.
        if (tileAt(s, tx, ty - 1) === 'c') breakCrate(s, tx, ty - 1);
    }

    function blastCrates(s, x, y, r) {
        var x0 = Math.floor((x - r) / T), x1 = Math.floor((x + r) / T);
        var y0 = Math.max(1, Math.floor((y - r) / T)), y1 = Math.min(ROWS - 1, Math.floor((y + r) / T));
        for (var ty = y0; ty <= y1; ty++) {
            for (var tx = x0; tx <= x1; tx++) {
                if (tileAt(s, tx, ty) === 'c' && G.dist(x, y, tx * T + 15, ty * T + 15) < r) breakCrate(s, tx, ty);
            }
        }
    }

    // One blast hurts everything in reach: enemies, crates, the player, and
    // any barrel, which goes off a moment later (the chain). Bombs dropped
    // by the enemy (`hostile`) spare their own side, or a drone would blow
    // itself up with its first bomb.
    function explode(s, x, y, r, dmg, hostile) {
        var p = s.p;
        G.sfx(r > 60 ? 'bigboom' : 'boom');
        G.shake(r / 9, 0.3);
        G.burst(x, y, { n: Math.round(r / 3), color: YEL, speed: r * 3.2, life: 0.5, size: 4 });
        G.burst(x, y, { n: Math.round(r / 5), color: RED, speed: r * 2, life: 0.7, size: 5 });
        s.blasts.push({ x: x, y: y, r: r, t: 0.35 });
        s.enemies.forEach(function (e) {
            if (!hostile && G.circRect(x, y, r, e.x, e.y, e.w, e.h)) damageEnemy(s, e, dmg);
        });
        s.barrels.forEach(function (b) {
            if (b.fuse < 0 && G.circRect(x, y, r, b.x, b.y, b.w, b.h)) b.fuse = 0.14;
        });
        blastCrates(s, x, y, r);
        if (G.circRect(x, y, r, p.x, p.y, p.w, p.h)) hurt(s, Math.round(r / 3), p.x + p.w / 2 < x ? -1 : 1);
    }

    // ------------------------------------------------------------------
    // Player
    // ------------------------------------------------------------------

    // Running has inertia (less grip in the air); the jump has coyote time,
    // a short input buffer and a height that depends on how long UP is held.
    // On the touch pad DOWN shares a stick with LEFT and RIGHT, and a thumb
    // that runs a little low holds both: there a run in progress wins, or
    // the hero would stop dead and duck in front of every enemy. Ducking
    // first and then turning still works, as it does on the keyboard.
    function steer(s, p, dt) {
        var dir = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        p.crouch = G.key.down && p.ground && !(s.touch && dir && !p.crouch);
        if (dir) p.face = dir;
        var target = p.crouch ? 0 : dir * RUN * (p.inAcid ? 0.5 : 1);
        var rate = (p.ground ? 1900 : 1100) * dt;
        p.vx += G.clamp(target - p.vx, -rate, rate);
        p.coyote = p.ground ? 0.1 : p.coyote - dt;
        p.jbuf = G.hit.up ? 0.12 : p.jbuf - dt;
        if (p.jbuf > 0 && p.coyote > 0) {
            p.vy = -JUMP; p.jbuf = 0; p.coyote = 0;
            G.sfx('jump');
        }
        if (!G.key.up && p.vy < -230) p.vy = -230;
    }

    // Platforms are one-way: a body lands on one only when its feet come
    // down through the top edge, so it can be jumped onto from below.
    function landOnMovers(s, p) {
        p.ride = null;
        if (p.vy < 0) return;
        for (var i = 0; i < s.movers.length; i++) {
            var m = s.movers[i], feet = p.y + p.h;
            if (p.x + p.w <= m.x || p.x >= m.x + m.w || feet < m.y - 2 || p.prevFeet > m.y - m.dy + 6) continue;
            p.y = m.y - p.h; p.vy = 0; p.ground = true; p.ride = m;
            return;
        }
    }

    function movePlayer(s, p, dt) {
        var wasAir = !p.ground, fall = p.vy;
        p.vy = Math.min(900, p.vy + GRAV * dt);
        p.prevFeet = p.y + p.h;
        G.tileMove(p, dt, T, s.solid);
        landOnMovers(s, p);
        if (p.ground && wasAir && fall > 320) {
            G.noise(0.06, { freq: 320, vol: 0.12 });
            G.burst(p.x + p.w / 2, p.y + p.h, { n: 5, color: LIGHT, speed: 70, life: 0.25, size: 2, angle: -Math.PI / 2, spread: 2.4 });
        }
        p.anim += Math.abs(p.vx) * dt;
    }

    var WEAPONS = {
        gun: { rate: 0.24, angles: [0], sound: function () { G.sfx('shoot'); } },
        spread: { rate: 0.3, angles: [-0.24, 0, 0.24], sound: function () { G.noise(0.1, { freq: 2200, slide: 400, vol: 0.2 }); G.tone(500, 0.1, { slide: 150, vol: 0.1 }); } },
        rapid: { rate: 0.085, angles: [0], sound: function () { G.tone(1100, 0.05, { slide: 400, vol: 0.09 }); } }
    };

    function fireGun(s, p) {
        var w = WEAPONS[p.weapon], x = p.x + p.w / 2 + p.face * 12, y = p.y + (p.crouch ? 17 : 10);
        p.cool = w.rate; p.muzzle = 0.06;
        w.angles.forEach(function (a) {
            s.shots.push({ x: x, y: y, vx: Math.cos(a) * 640 * p.face, vy: Math.sin(a) * 640, g: 0, life: 0.7, dmg: 1, r: 3, foe: false });
        });
        w.sound();
        if (p.weapon !== 'gun' && --p.ammo <= 0) { p.weapon = 'gun'; say(s, 'SPECIAL AMMO OUT'); }
    }

    function throwNade(s, p) {
        if (p.nades <= 0) { G.sfx('click'); return; }
        p.nades--;
        s.nades.push({ x: p.x + p.w / 2 - 4, y: p.y + 2, w: 8, h: 8, vx: p.face * 320 + p.vx * 0.4, vy: -400, fuse: 1.3 });
        G.tone(300, 0.15, { type: 'triangle', slide: 700, vol: 0.14 });
    }

    function useWeapons(s, p) {
        if (G.key.a && p.cool <= 0) fireGun(s, p);
        if (G.hit.b) throwNade(s, p);
    }

    function laserOn(s, l) { return (s.t + l.ph) % 2.6 < 1.2; }

    // Acid ignores the hit-invulnerability on purpose: wading must always
    // cost health, otherwise one hit would buy a free crossing.
    function hazards(s, p, dt) {
        var tx = Math.floor((p.x + p.w / 2) / T), ty = Math.floor((p.y + p.h - 4) / T);
        p.inAcid = tileAt(s, tx, ty) === '~';
        if (p.inAcid) {
            p.hp -= 75 * dt;
            if (gate(s, 'acid', 0.18)) {
                G.noise(0.12, { filter: 'highpass', freq: 3500, vol: 0.12 });
                G.burst(p.x + p.w / 2, p.y + p.h - 10, { n: 4, color: ACID, speed: 90, life: 0.4, gravity: -200 });
            }
        }
        if (p.hp <= 0 || p.y > G.H + 30) { killPlayer(s); return; }
        // A lit gate is a wall: it throws the player back out on the side
        // they came from and burns, invulnerable or not, so a hit taken
        // elsewhere never buys a way through.
        s.lasers.forEach(function (l) {
            if (!laserOn(s, l) || !G.aabb(p, l)) return;
            var side = p.x + p.w / 2 < l.x + l.w / 2 ? -1 : 1;
            p.x = side < 0 ? l.x - p.w - 1 : l.x + l.w + 1;
            p.vx = side * 230;
            if (p.zap > 0) return;
            p.zap = 0.5; p.inv = 0;
            G.sfx('laser');
            hurt(s, 22, side);
        });
    }

    var PICKUPS = {
        h: function (p) { p.hp = Math.min(100, p.hp + 40); return '+40 HEALTH'; },
        s: function (p) { p.weapon = 'spread'; p.ammo = 36; return 'SPREAD GUN'; },
        r: function (p) { p.weapon = 'rapid'; p.ammo = 90; return 'RAPID FIRE'; },
        n: function (p) { p.nades = Math.min(9, p.nades + 3); return '+3 GRENADES'; }
    };

    function collectPickups(s, p) {
        s.pickups = s.pickups.filter(function (pk) {
            if (!G.circRect(pk.x + 15, pk.y + 15, 14, p.x, p.y, p.w, p.h)) return true;
            G.popup(pk.x + 15, pk.y, PICKUPS[pk.kind](p), GOLD);
            G.sfx('power');
            G.addScore(50);
            return false;
        });
    }

    function touchCheckpoints(s, p) {
        if (!p.ground || p.ride) return;
        s.checks.forEach(function (c) {
            if (c.on || p.x < c.x) return;
            c.on = true; p.cx = c.x; p.cy = FLOOR * T - p.h;
            G.sfx('blip');
        });
    }

    function touchGoal(s, p) {
        var c = s.card;
        if (c && !s.haveCard && G.circRect(c.x + 15, c.y + 15, 20, p.x, p.y, p.w, p.h)) {
            s.haveCard = true;
            G.sfx('coin'); G.sfx('power');
            G.addScore(500);
            say(s, 'KEYCARD! GET TO THE EXIT');
        }
        if (!G.aabb(p, s.door)) return;
        if (s.haveCard) { G.win(Math.round(s.clock) * 10 + Math.round(p.hp) * 5); return; }
        if (gate(s, 'door', 1.2)) {
            G.tone(110, 0.25, { type: 'sawtooth', vol: 0.2 });
            say(s, !s.boss ? 'LOCKED - FIND THE KEYCARD' : (s.boss.dead ? 'LOCKED - PICK UP THE KEYCARD' : 'LOCKED - THE OVERLORD HAS THE KEYCARD'));
        }
    }

    // ------------------------------------------------------------------
    // Enemies
    // ------------------------------------------------------------------

    // Patrols its own ledge: turns at walls, at drops and at acid.
    function walk(s, e, speed, dt) {
        e.vx = e.dir * speed;
        e.vy = Math.min(900, e.vy + GRAV * dt);
        G.tileMove(e, dt, T, s.solid);
        var ahead = Math.floor((e.x + (e.dir > 0 ? e.w + 2 : -2)) / T), below = Math.floor((e.y + e.h + 2) / T);
        if (e.wall || (e.ground && !s.solid(ahead, below))) e.dir = -e.dir;
    }

    function aiGrunt(s, e, dt) { walk(s, e, 55 + s.level * 4, dt); }

    // Stops and fires level shots at chest height once the player is on its
    // floor; the lit muzzle is the tell to duck or jump.
    function aiTrooper(s, e, dt) {
        var p = s.p, dx = p.x - e.x;
        if (Math.abs(dx) > 380 || Math.abs(p.y - e.y) > 50) { walk(s, e, 45, dt); e.cool = Math.max(e.cool, 0.5); return; }
        e.dir = dx < 0 ? -1 : 1;
        e.vx = 0; e.vy = Math.min(900, e.vy + GRAV * dt);
        G.tileMove(e, dt, T, s.solid);
        e.cool -= dt;
        if (e.cool > 0) return;
        e.cool = 1.6;
        foeShot(s, e.x + e.w / 2 + e.dir * 12, e.y + 6, e.dir * 300, 0, { dmg: 14 });
        G.tone(700, 0.12, { type: 'sawtooth', slide: 200, vol: 0.12 });
    }

    // Hops at the player with a pause of 0.8-1.5 s on the ground in between:
    // long enough to shoot it or step aside before the next hop.
    function aiHopper(s, e, dt) {
        var dx = s.p.x - e.x;
        e.vy = Math.min(900, e.vy + GRAV * dt);
        G.tileMove(e, dt, T, s.solid);
        if (!e.ground) return;
        e.vx = 0; e.t -= dt;
        if (e.t > 0 || Math.abs(dx) > 420) return;
        e.dir = dx < 0 ? -1 : 1;
        e.vx = e.dir * 170; e.vy = -440; e.t = 0.8 + Math.random() * 0.7;
        G.tone(200, 0.12, { type: 'triangle', slide: 420, vol: 0.1 });
    }

    function aiTurret(s, e, dt) {
        var p = s.p, cx = e.x + e.w / 2, cy = e.y + 6, px = p.x + p.w / 2, py = p.y + p.h / 2;
        e.aim = Math.atan2(py - cy, px - cx);
        if (G.dist(cx, cy, px, py) > 440) { e.cool = Math.max(e.cool, 0.6); return; }
        e.cool -= dt;
        if (e.cool > 0) return;
        e.cool = Math.max(1.1, 2.1 - s.level * 0.07);
        foeShot(s, cx + Math.cos(e.aim) * 14, cy + Math.sin(e.aim) * 14, Math.cos(e.aim) * 250, Math.sin(e.aim) * 250, {});
        G.tone(520, 0.12, { type: 'sawtooth', slide: 160, vol: 0.12 });
    }

    // Swings from side to side on a spring: high while it crosses over the
    // player (where it lets a bomb go), down at gun height at each end of
    // the swing, which is the moment to shoot it. A posted drone stays
    // within LEASH of its home, so the drones of a whole level cannot pile
    // up into a swarm behind a player who runs on; the Overlord's own
    // drones have no home and hunt across the arena.
    function aiDrone(s, e, dt) {
        var p = s.p, swing = Math.sin(s.t * 0.9 + e.ph);
        var tx = p.x + swing * 130, ty = p.y - 88 + Math.abs(swing) * 88;
        if (e.home !== undefined) tx = G.clamp(tx, e.home - LEASH, e.home + LEASH);
        e.vx += G.clamp((tx - e.x) * 4, -420, 420) * dt - e.vx * 1.6 * dt;
        e.vy += G.clamp((ty - e.y) * 4, -420, 420) * dt - e.vy * 1.6 * dt;
        e.x += e.vx * dt;
        e.y = Math.max(G.HUD + 6, e.y + e.vy * dt);
        e.cool -= dt;
        if (e.cool > 0 || Math.abs(p.x - e.x) > 60) return;
        e.cool = 2.4;
        foeShot(s, e.x + e.w / 2, e.y + e.h, e.vx * 0.5, 40, { g: 600, bomb: true, blast: 46, r: 6, life: 4 });
        G.tone(900, 0.2, { type: 'sine', slide: 300, vol: 0.1 });
    }

    // --- the Overlord --------------------------------------------------

    var BOSS_MOVES = [['burst', 'burst', 'leap'], ['burst', 'leap', 'drone', 'fan'], ['fan', 'leap', 'burst', 'leap', 'drone']];
    var BOSS_ACT = {
        burst: function (s, e, phase) { e.burst = 2 + phase; e.bt = 0.35; },
        // Air time of this jump is 0.85 s, so the speed below lands it
        // where the player stood when it took off.
        leap: function (s, e) {
            e.air = true; e.vy = -640;
            e.vx = G.clamp((s.p.x - e.x - e.w / 2) / 0.85, -330, 330);
            G.tone(120, 0.4, { type: 'sawtooth', slide: 320, vol: 0.2 });
        },
        fan: function (s, e) {
            for (var i = 0; i < 7; i++) {
                var a = -Math.PI * (0.2 + 0.1 * i);
                foeShot(s, e.x + e.w / 2, e.y + 10, Math.cos(a) * 420, Math.sin(a) * 420, { g: 700, life: 3, dmg: 14, r: 5 });
            }
            G.noise(0.3, { freq: 1800, slide: 300, vol: 0.25 });
        },
        drone: function (s, e) {
            var drones = s.enemies.filter(function (d) { return d.kind === 'drone' && !d.dead; }).length;
            if (drones >= 2) { BOSS_ACT.burst(s, e, 2); return; }
            s.enemies.push(makeEnemy('drone', e.x + e.w / 2, e.y - 10, s.level, Math.random()));
            G.sfx('alarm');
        }
    };

    // Landing sends a shockwave along the floor in both directions; it has
    // to be jumped.
    function bossLand(s, e) {
        var y = FLOOR * T - 10;
        G.shake(10, 0.3);
        G.noise(0.4, { freq: 300, slide: 40, vol: 0.4 });
        foeShot(s, e.x - 4, y, -300, 0, { wave: true, r: 10, life: 1.3, dmg: 18 });
        foeShot(s, e.x + e.w + 4, y, 300, 0, { wave: true, r: 10, life: 1.3, dmg: 18 });
    }

    function smashCrates(s, e) {
        var x0 = Math.floor(e.x / T), x1 = Math.floor((e.x + e.w) / T);
        for (var ty = Math.floor(e.y / T); ty < FLOOR; ty++) {
            for (var tx = x0; tx <= x1; tx++) if (tileAt(s, tx, ty) === 'c') breakCrate(s, tx, ty);
        }
    }

    function bossAttack(s, e, phase, dt) {
        var p = s.p, cx = e.x + e.w / 2, cy = e.y + 22;
        if (e.burst > 0 && (e.bt -= dt) <= 0) {
            var a = Math.atan2(p.y + 10 - cy, p.x + p.w / 2 - cx);
            foeShot(s, cx, cy, Math.cos(a) * 330, Math.sin(a) * 330, { dmg: 14, r: 5 });
            e.burst--; e.bt = 0.17;
            G.tone(420, 0.1, { type: 'sawtooth', slide: 140, vol: 0.14 });
        }
        e.cool -= dt;
        if (e.cool > 0 || e.air) return;
        e.cool = 2.5 - phase * 0.4;
        var list = BOSS_MOVES[phase - 1];
        BOSS_ACT[list[e.n++ % list.length]](s, e, phase);
    }

    // The fight starts once the player is well inside: the doors shut, and
    // from here on a lost life comes back inside the arena. The flag at the
    // entrance now stands in the door, so it is retired along with every
    // earlier one; touching it late (after jumping in over it) must not move
    // the respawn point into the steel.
    function wakeBoss(s, e) {
        e.awake = true;
        sealArena(s, true);
        s.checks.forEach(function (c) { if (c.x < s.arena.x1) c.on = true; });
        s.p.cx = s.arena.x0 + T;
        say(s, 'THE OVERLORD');
        G.tone(70, 0.9, { type: 'sawtooth', slide: 160, vol: 0.3 });
    }

    // The mech ignores the tile grid (it smashes crates instead) and is only
    // held by the arena's ends and the floor. Its three phases follow its
    // health: each adds attacks and speed.
    function aiBoss(s, e, dt) {
        var p = s.p, phase = e.hp > e.max * 0.66 ? 1 : (e.hp > e.max * 0.33 ? 2 : 3), floorY = FLOOR * T - e.h;
        if (!e.awake) {
            if (p.x < s.arena.x0 + T || p.x > s.arena.x1) return;
            wakeBoss(s, e);
        }
        e.vy += GRAV * dt; e.y += e.vy * dt;
        if (e.y >= floorY) {
            if (e.vy > 400) bossLand(s, e);
            e.y = floorY; e.vy = 0; e.air = false;
        }
        if (!e.air) {
            var dx = p.x + p.w / 2 - e.x - e.w / 2;
            e.dir = dx < 0 ? -1 : 1;
            e.vx = Math.abs(dx) > 110 ? e.dir * (45 + phase * 22) : 0;
        }
        e.x = G.clamp(e.x + e.vx * dt, s.arena.x0, s.arena.x1 - e.w);
        smashCrates(s, e);
        bossAttack(s, e, phase, dt);
    }

    var AI = { grunt: aiGrunt, trooper: aiTrooper, hopper: aiHopper, turret: aiTurret, drone: aiDrone, boss: aiBoss };

    // Only enemies near the screen think, so nothing far away wanders off
    // its ledge or wastes shots before the player gets there. The Overlord
    // is the exception once the fight is on: the sealed arena is wider than
    // that range, and it must not freeze when the player runs to the far end.
    function updateEnemies(s, dt) {
        var p = s.p;
        s.enemies.forEach(function (e) {
            if (e.flash > 0) e.flash -= dt;
            if (e.dead || (Math.abs(e.x - p.x) > 660 && !e.awake)) return;
            AI[e.kind](s, e, dt);
            if (e.y > G.H + 60) e.dead = true;
            // Bumping into an enemy is the most common hit by far, so it
            // costs less than a laser (22); seven of them still end a life.
            else if (G.aabb(hurtBox(p), e)) hurt(s, e.kind === 'boss' ? 25 : 15, p.x + p.w / 2 < e.x + e.w / 2 ? -1 : 1);
        });
        s.enemies = s.enemies.filter(function (e) { return !e.dead; });
    }

    // ------------------------------------------------------------------
    // Shots, grenades, barrels, platforms
    // ------------------------------------------------------------------

    function shotHitsTile(s, b) {
        var tx = Math.floor(b.x / T), ty = Math.floor(b.y / T);
        if (!s.solid(tx, ty)) return false;
        if (tileAt(s, tx, ty) === 'c') breakCrate(s, tx, ty);
        if (b.bomb) explode(s, b.x, b.y - 6, b.blast, 2, true);
        else G.burst(b.x, b.y, { n: 3, color: YEL, speed: 90, life: 0.2, size: 2 });
        return true;
    }

    function shotHitsPlayer(s, b) {
        var h = hurtBox(s.p);
        if (s.p.inv > 0 || !G.circRect(b.x, b.y, b.r, h.x, h.y, h.w, h.h)) return false;
        if (b.bomb) explode(s, b.x, b.y, b.blast, 2, true);
        else hurt(s, b.dmg, b.vx < 0 ? -1 : 1);
        return true;
    }

    function shotHitsTarget(s, b) {
        for (var i = 0; i < s.enemies.length; i++) {
            var e = s.enemies[i];
            if (e.dead || !G.circRect(b.x, b.y, b.r, e.x, e.y, e.w, e.h)) continue;
            damageEnemy(s, e, b.dmg);
            return true;
        }
        for (var j = 0; j < s.barrels.length; j++) {
            var k = s.barrels[j];
            if (k.fuse >= 0 || !G.circRect(b.x, b.y, b.r, k.x, k.y, k.w, k.h)) continue;
            k.fuse = 0.01;
            return true;
        }
        return false;
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (b) {
            b.life -= dt;
            b.vy += b.g * dt; b.x += b.vx * dt; b.y += b.vy * dt;
            if (b.life <= 0 || b.y > G.H + 20 || shotHitsTile(s, b)) return false;
            return b.foe ? !shotHitsPlayer(s, b) : !shotHitsTarget(s, b);
        });
    }

    // A grenade bounces with some of its speed until the fuse runs out, or
    // goes off at once when it touches an enemy.
    function updateNades(s, dt) {
        s.nades = s.nades.filter(function (n) {
            n.vy += GRAV * dt; n.fuse -= dt;
            var vx = n.vx, vy = n.vy;
            G.tileMove(n, dt, T, s.solid);
            if (n.ground) { n.vy = -vy * 0.45; n.vx = vx * 0.7; if (vy > 150) G.sfx('bounce'); }
            if (n.wall) n.vx = -vx * 0.5;
            if (n.y > G.H + 40) return false;
            var touch = s.enemies.some(function (e) { return !e.dead && G.aabb(n, e); });
            if (n.fuse > 0 && !touch) return true;
            explode(s, n.x + 4, n.y + 4, 95, 4);
            return false;
        });
    }

    function updateBarrels(s, dt) {
        s.barrels = s.barrels.filter(function (b) {
            if (b.fuse < 0) return true;
            b.fuse -= dt;
            if (b.fuse > 0) return true;
            G.addScore(50);
            explode(s, b.x + b.w / 2, b.y + b.h / 2, 90, 4);
            return false;
        });
    }

    // Whoever stands on a platform is carried along with it.
    function updateMovers(s) {
        var p = s.p;
        s.movers.forEach(function (m) {
            var ox = m.x, oy = m.y;
            placeMover(m, s.t);
            m.dx = m.x - ox; m.dy = m.y - oy;
            if (p.ride === m) { p.x += m.dx; p.y = m.y - p.h; }
        });
    }

    function updateEffects(s, dt) {
        s.blasts = s.blasts.filter(function (b) { b.t -= dt; return b.t > 0; });
        if (s.finale <= 0) return;
        // The Overlord goes up in a string of harmless fireworks.
        s.finale -= dt;
        if (!gate(s, 'finale', 0.13)) return;
        var x = s.card.x + G.rnd(-70, 70), y = FLOOR * T - G.rnd(10, 90);
        G.burst(x, y, { n: 16, color: G.pick([YEL, RED, LIGHT]), speed: 260, life: 0.6, size: 4 });
        s.blasts.push({ x: x, y: y, r: 40, t: 0.3 });
        G.sfx('boom');
    }

    function tickTimers(s, p, dt) {
        s.t += dt; s.clock -= dt;
        if (p.inv > 0) p.inv -= dt;
        if (p.cool > 0) p.cool -= dt;
        if (p.muzzle > 0) p.muzzle -= dt;
        if (p.zap > 0) p.zap -= dt;
        if (s.msgT > 0) s.msgT -= dt;
    }

    // True next to (or on) a lift or a moving platform: a ride has to be
    // waited for, a slow one for ten seconds, and a shell would knock the
    // player off the ledge into whatever the platform crosses.
    function atRide(s, p) {
        return s.movers.some(function (m) {
            return p.x + p.w > Math.min(m.ax, m.bx) - 4 * T && p.x < Math.max(m.ax, m.bx) + m.w + 4 * T;
        });
    }

    // Camping is not an option. Whoever stays within a few steps of one spot
    // for too long is warned and then shelled until they move on. It is off
    // during the Overlord fight, where the arena is the whole world, and the
    // count stands still while the player waits for a ride; the warhead's
    // clock still runs there.
    function airstrike(s, p, dt) {
        if (Math.abs(p.x - s.anchor) > 220) { s.anchor = p.x; s.camp = 0; }
        if ((s.boss && s.boss.awake) || atRide(s, p)) return;
        s.camp += dt;
        if (s.camp < 9) return;
        if (s.camp < 14) {
            if (gate(s, 'warn', 1)) { say(s, 'AIRSTRIKE INBOUND - MOVE OUT'); G.sfx('alarm'); }
            return;
        }
        if (!gate(s, 'shell', 1.1)) return;
        foeShot(s, p.x + p.w / 2 + G.rnd(-24, 24), 2 * T, 0, 320, { g: 700, bomb: true, blast: 66, r: 6, life: 4 });
        G.tone(1400, 0.5, { type: 'sine', slide: 300, vol: 0.12 });
    }

    // The warhead: the last twenty seconds are counted out loud, and at zero
    // the run is over whatever lives are left. There is no second try at a
    // nuke. (G.gameOver() does nothing if the exit was reached on this very
    // tick and the level is already won.)
    function countdown(s) {
        if (s.clock < 20 && s.clock > 0 && gate(s, 'tick', 1)) G.sfx(s.clock < 8 ? 'alarm' : 'blip');
        if (s.clock > 0) return;
        G.sfx('bigboom');
        G.flash('#ffffff', 0.8);
        G.shake(16, 0.8);
        G.gameOver();
    }

    function follow(s, p, dt) {
        var want = G.clamp(p.x + p.w / 2 - G.W * 0.42 + p.face * 70, 0, s.cols * T - G.W);
        s.cam += (want - s.cam) * Math.min(1, dt * 5);
        G.cam.x = Math.round(s.cam);
    }

    function update(s, dt) {
        var p = s.p;
        tickTimers(s, p, dt);
        updateMovers(s);
        steer(s, p, dt);
        movePlayer(s, p, dt);
        useWeapons(s, p);
        hazards(s, p, dt);
        updateEnemies(s, dt);
        updateShots(s, dt);
        updateNades(s, dt);
        updateBarrels(s, dt);
        updateEffects(s, dt);
        collectPickups(s, p);
        touchCheckpoints(s, p);
        touchGoal(s, p);
        follow(s, p, dt);
        airstrike(s, p, dt);
        countdown(s);
    }

    // ------------------------------------------------------------------
    // Drawing: backdrop and level
    // ------------------------------------------------------------------

    // Cheap repeatable noise, so the skyline needs no stored state.
    function hash(n) {
        var x = Math.sin(n * 127.1 + 3.7) * 43758.5453;
        return x - Math.floor(x);
    }

    function drawNukeMoon(s, ctx, x, y) {
        ctx.fillStyle = 'rgba(255,204,0,0.16)';
        ctx.beginPath(); ctx.arc(x, y, 58, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        for (var i = 0; i < 3; i++) {
            var a = s.t * 0.25 + i * Math.PI * 2 / 3;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 48, a, a + Math.PI / 3); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    }

    // One parallax layer of tower blocks with a few windows that flicker.
    function drawSkyline(s, ctx, par, step, shade) {
        var off = G.cam.x * par, i0 = Math.floor(off / step), n = Math.ceil(G.W / step) + 1;
        for (var i = i0; i <= i0 + n; i++) {
            var h = 60 + hash(i + par * 900) * 190, x = i * step - off;
            ctx.fillStyle = shade;
            ctx.fillRect(x, FLOOR * T - h, step - 8, h + 60);
            ctx.fillStyle = 'rgba(255,204,0,0.35)';
            for (var k = 0; k < 6; k++) {
                var lit = hash(i * 17 + k * 5 + Math.floor(s.t * 0.7 + hash(i + k) * 9)) > 0.55;
                if (lit && k * 26 + 30 < h) ctx.fillRect(x + 8 + (k % 2) * 18, FLOOR * T - h + 12 + k * 26, 8, 10);
            }
        }
    }

    // Embers drift up through every scene. Their paths are pure functions of
    // time, so the picture keeps moving even when nothing else does.
    function drawEmbers(s, ctx) {
        var span = G.W + 40, tall = G.H - G.HUD;
        for (var i = 0; i < 36; i++) {
            var x = (hash(i) * span + s.t * (20 + hash(i + 50) * 50) - G.cam.x * 0.6) % span;
            var y = (hash(i + 99) * tall - s.t * (25 + hash(i + 7) * 40)) % tall;
            ctx.fillStyle = i % 3 ? 'rgba(255,106,0,0.7)' : 'rgba(255,204,0,0.8)';
            ctx.fillRect(x < 0 ? x + span : x, G.HUD + (y < 0 ? y + tall : y), 2 + (i % 2), 2 + (i % 2));
        }
    }

    function drawBackdrop(s, ctx) {
        var g = ctx.createLinearGradient(0, G.HUD, 0, G.H);
        g.addColorStop(0, s.theme.sky); g.addColorStop(1, s.theme.glow);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, G.W, G.H);
        drawNukeMoon(s, ctx, 760 - G.cam.x * 0.04, 140);
        drawSkyline(s, ctx, 0.15, 64, 'rgba(0,0,0,0.38)');
        drawSkyline(s, ctx, 0.4, 96, 'rgba(0,0,0,0.6)');
        drawEmbers(s, ctx);
    }

    function drawBlock(s, ctx, c, r) {
        var x = c * T, y = r * T;
        ctx.fillStyle = s.theme.wall;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x, y + T - 4, T, 4); ctx.fillRect(x + T - 2, y, 2, T);
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + 4, y + 9, 3, 3); ctx.fillRect(x + T - 9, y + T - 12, 3, 3);
        // Only a walkable surface gets the bright hazard edge.
        if (r > 1 && tileAt(s, c, r - 1) === '#') return;
        ctx.fillStyle = s.theme.top;
        ctx.fillRect(x, y, T, 4);
        ctx.fillStyle = DARK;
        ctx.fillRect(x + ((c % 2) ? 4 : 18), y, 8, 4);
    }

    function drawCrate(ctx, x, y) {
        ctx.fillStyle = '#7a4e1e';
        ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
        ctx.strokeStyle = '#c08a3a'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, y + 3, T - 6, T - 6);
        ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + T - 4, y + T - 4); ctx.stroke();
    }

    function drawAcid(s, ctx, c, r) {
        var x = c * T, y = r * T, wave = Math.sin(s.t * 3 + c * 1.3) * 2 + 5;
        ctx.fillStyle = 'rgba(125,255,58,0.78)';
        ctx.fillRect(x, y + wave, T, T - wave);
        ctx.fillStyle = '#d8ffb0';
        ctx.fillRect(x, y + wave, T, 2);
        var rise = (s.t * 0.6 + hash(c)) % 1;
        ctx.fillRect(x + 6 + hash(c * 3) * 16, y + T - rise * (T - 8), 3, 3);
    }

    function drawTiles(s, ctx) {
        var c0 = Math.max(0, Math.floor(G.cam.x / T)), c1 = Math.min(s.cols - 1, c0 + 33);
        for (var r = 1; r < ROWS; r++) {
            for (var c = c0; c <= c1; c++) {
                var ch = s.map[r][c];
                if (ch === '#') drawBlock(s, ctx, c, r);
                else if (ch === 'c') drawCrate(ctx, c * T, r * T);
                else if (ch === '~') drawAcid(s, ctx, c, r);
            }
        }
    }

    function drawMovers(s, ctx) {
        s.movers.forEach(function (m) {
            if (!visible(Math.min(m.ax, m.bx), Math.abs(m.bx - m.ax) + m.w)) return;
            // Rails show where the platform is going before it gets there.
            ctx.strokeStyle = 'rgba(224,224,224,0.18)'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(m.ax + m.w / 2, m.ay + 6); ctx.lineTo(m.bx + m.w / 2, m.by + 6);
            ctx.stroke();
            ctx.fillStyle = GREY;
            ctx.fillRect(m.x, m.y, m.w, m.h);
            ctx.fillStyle = YEL;
            for (var i = 0; i < 6; i++) ctx.fillRect(m.x + 4 + i * 15, m.y + 2, 8, 3);
            ctx.fillStyle = Math.floor(s.t * 12) % 2 ? '#ff6a00' : YEL;
            ctx.fillRect(m.x + 10, m.y + m.h, 10, 4 + Math.sin(s.t * 20) * 2);
            ctx.fillRect(m.x + m.w - 20, m.y + m.h, 10, 4 + Math.cos(s.t * 20) * 2);
        });
    }

    function drawLasers(s, ctx) {
        s.lasers.forEach(function (l) {
            if (!visible(l.x, l.w)) return;
            var on = laserOn(s, l), warn = (s.t + l.ph) % 2.6 > 2.2;
            if (on) {
                ctx.fillStyle = 'rgba(255,0,0,0.3)';
                ctx.fillRect(l.x - 5, l.y, l.w + 10, l.h);
                ctx.fillStyle = Math.floor(s.t * 30) % 2 ? '#ffffff' : RED;
                ctx.fillRect(l.x + 1, l.y, l.w - 2, l.h);
            } else if (!warn || Math.floor(s.t * 14) % 2) {
                ctx.fillStyle = warn ? 'rgba(255,0,0,0.6)' : 'rgba(255,0,0,0.16)';
                ctx.fillRect(l.x + 3, l.y, 2, l.h);
            }
        });
    }

    function drawCheckpoints(s, ctx) {
        s.checks.forEach(function (c, i) {
            if (!i || !visible(c.x, 9)) return;
            var y = FLOOR * T;
            ctx.fillStyle = GREY;
            ctx.fillRect(c.x + 3, y - 34, 3, 34);
            ctx.fillStyle = c.on ? GOLD : BLOOD;
            ctx.globalAlpha = c.on ? 0.6 + Math.sin(s.t * 5) * 0.4 : 1;
            ctx.fillRect(c.x, y - 40, 9, 8);
            ctx.globalAlpha = 1;
        });
    }

    function drawDoor(s, ctx) {
        var d = s.door;
        if (!visible(d.x - 30, d.w + 60)) return;
        var open = s.haveCard, pulse = 0.5 + Math.sin(s.t * 6) * 0.5;
        ctx.fillStyle = GREY;
        ctx.fillRect(d.x - 6, d.y - 8, d.w + 12, d.h + 8);
        ctx.fillStyle = open ? '#1d6b1d' : '#5a0000';
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = DARK;
        ctx.fillRect(d.x + d.w / 2 - 1, d.y, 2, d.h);
        ctx.fillStyle = open ? ACID : RED;
        ctx.globalAlpha = 0.4 + pulse * 0.6;
        ctx.fillRect(d.x + 9, d.y - 6, 12, 4);
        ctx.globalAlpha = 1;
        G.text('EXIT', d.x + d.w / 2, d.y - 14, { size: 20, bold: true, color: open ? ACID : RED, align: 'center' });
    }

    function drawCard(s, ctx) {
        var c = s.card;
        if (!c || s.haveCard || !visible(c.x - 10, 50)) return;
        var y = c.y + 6 + Math.sin(s.t * 4) * 4;
        ctx.fillStyle = 'rgba(255,215,0,' + (0.18 + Math.sin(s.t * 7) * 0.08) + ')';
        ctx.beginPath(); ctx.arc(c.x + 15, y + 9, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = GOLD;
        ctx.fillRect(c.x + 3, y, 24, 16);
        ctx.fillStyle = DARK;
        ctx.fillRect(c.x + 6, y + 4, 8, 6); ctx.fillRect(c.x + 17, y + 5, 7, 2); ctx.fillRect(c.x + 17, y + 9, 5, 2);
    }

    var PICK_LOOK = { h: ['#e0e0e0', '+', RED], s: ['#ff6a00', 'S', DARK], r: [YEL, 'R', DARK], n: ['#4a6a2a', 'G', LIGHT] };

    function drawPickups(s, ctx) {
        s.pickups.forEach(function (pk) {
            if (!visible(pk.x, T)) return;
            var look = PICK_LOOK[pk.kind], y = pk.y + 6 + Math.sin(s.t * 5 + pk.x) * 3;
            ctx.fillStyle = look[0];
            ctx.fillRect(pk.x + 5, y, 20, 18);
            ctx.strokeStyle = DARK; ctx.lineWidth = 2;
            ctx.strokeRect(pk.x + 5, y, 20, 18);
            G.text(look[1], pk.x + 15, y + 14, { size: s.touch ? 22 : 15, bold: true, color: look[2], align: 'center' });
        });
    }

    function drawBarrels(s, ctx) {
        s.barrels.forEach(function (b) {
            if (!visible(b.x, b.w)) return;
            // A lit barrel flashes white: get away from it.
            ctx.fillStyle = b.fuse >= 0 && Math.floor(s.t * 40) % 2 ? '#ffffff' : BLOOD;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.fillStyle = DARK;
            ctx.fillRect(b.x, b.y + 5, b.w, 2); ctx.fillRect(b.x, b.y + b.h - 7, b.w, 2);
            ctx.fillStyle = YEL;
            ctx.beginPath();
            ctx.moveTo(b.x + b.w / 2, b.y + 9); ctx.lineTo(b.x + b.w - 5, b.y + 18); ctx.lineTo(b.x + 5, b.y + 18);
            ctx.fill();
        });
    }

    // ------------------------------------------------------------------
    // Drawing: characters
    // ------------------------------------------------------------------

    function legs(ctx, e, color, t) {
        var step = Math.sin(t) * 3;
        ctx.fillStyle = color;
        ctx.fillRect(e.x + 3 + step, e.y + e.h - 9, 6, 9);
        ctx.fillRect(e.x + e.w - 9 - step, e.y + e.h - 9, 6, 9);
    }

    function drawSoldier(s, ctx, e, armor, helmet) {
        var eye = e.dir > 0 ? e.x + 11 : e.x + 3;
        legs(ctx, e, GREY, s.t * 9 + e.ph);
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : armor;
        ctx.fillRect(e.x + 1, e.y + 8, e.w - 2, 10);
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : helmet;
        ctx.fillRect(e.x + 3, e.y, 14, 9);
        ctx.fillStyle = YEL;
        ctx.fillRect(eye, e.y + 3, 6, 3);
    }

    var DRAW = {
        grunt: function (s, ctx, e) { drawSoldier(s, ctx, e, BLOOD, '#5a5a5a'); },
        trooper: function (s, ctx, e) {
            drawSoldier(s, ctx, e, '#6a5a1a', GOLD);
            ctx.fillStyle = LIGHT;
            ctx.fillRect(e.dir > 0 ? e.x + 12 : e.x - 8, e.y + 10, 16, 3);
            // The muzzle lights up just before it fires.
            if (e.cool < 0.35) { ctx.fillStyle = RED; ctx.fillRect(e.dir > 0 ? e.x + 26 : e.x - 12, e.y + 8, 6, 7); }
        },
        hopper: function (s, ctx, e) {
            var squash = e.ground ? Math.sin(s.t * 8 + e.ph) * 2 : -3;
            ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#5ad02a';
            ctx.fillRect(e.x - squash / 2, e.y + squash, e.w + squash, e.h - squash - 4);
            ctx.fillStyle = '#2a6a12';
            ctx.fillRect(e.x + 1, e.y + e.h - 5, 6, 5); ctx.fillRect(e.x + e.w - 7, e.y + e.h - 5, 6, 5);
            ctx.fillStyle = RED;
            ctx.fillRect(e.x + 4, e.y + 4 + squash, 4, 4); ctx.fillRect(e.x + e.w - 8, e.y + 4 + squash, 4, 4);
        },
        turret: function (s, ctx, e) {
            var cx = e.x + e.w / 2, cy = e.y + 6, a = e.aim || Math.PI;
            ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#5a5a5a';
            ctx.fillRect(e.x, e.y + 8, e.w, 12);
            ctx.beginPath(); ctx.arc(cx, cy + 2, 8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = LIGHT; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); ctx.stroke();
            ctx.fillStyle = e.cool < 0.35 || Math.floor(s.t * 2 + e.ph) % 2 ? RED : '#5a0000';
            ctx.fillRect(cx - 2, cy, 4, 4);
        },
        drone: function (s, ctx, e) {
            ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#6a6a72';
            ctx.fillRect(e.x, e.y + 4, e.w, e.h - 4);
            ctx.fillStyle = LIGHT;
            ctx.fillRect(e.x - 4 + Math.sin(s.t * 40) * 4, e.y, e.w + 8 - Math.sin(s.t * 40) * 8, 2);
            ctx.fillStyle = RED;
            ctx.fillRect(e.x + e.w / 2 - 3, e.y + 8, 6, 5);
        },
        boss: function (s, ctx, e) { drawBoss(s, ctx, e); }
    };

    function drawBoss(s, ctx, e) {
        var hit = e.flash > 0, stomp = e.air ? 0 : Math.sin(s.t * 7) * 3, eye = e.x + e.w / 2 + e.dir * 12;
        ctx.fillStyle = GREY;
        ctx.fillRect(e.x + 6, e.y + 50 + stomp, 16, 22 - stomp);
        ctx.fillRect(e.x + e.w - 22, e.y + 50 - stomp, 16, 22 + stomp);
        ctx.fillStyle = hit ? '#ffffff' : '#7a0d0d';
        ctx.fillRect(e.x, e.y + 14, e.w, 40);
        ctx.fillStyle = hit ? '#ffffff' : GOLD;
        ctx.fillRect(e.x, e.y + 14, e.w, 4); ctx.fillRect(e.x, e.y + 50, e.w, 4);
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(e.x + 14, e.y, e.w - 28, 16);
        ctx.fillRect(e.dir > 0 ? e.x + e.w - 6 : e.x - 18, e.y + 24, 24, 8);
        // The tell: its cannon glows for the last half second before every
        // attack (and through a burst), like a trooper's muzzle.
        if (e.awake && !e.air && (e.cool < 0.5 || e.burst > 0)) {
            ctx.fillStyle = Math.floor(s.t * 20) % 2 ? '#ffffff' : YEL;
            ctx.fillRect(e.dir > 0 ? e.x + e.w + 16 : e.x - 28, e.y + 20, 12, 16);
        }
        ctx.fillStyle = Math.floor(s.t * 8) % 2 ? RED : YEL;
        ctx.fillRect(eye - 7, e.y + 4, 14, 6);
        G.text('☢', e.x + e.w / 2, e.y + 42, { size: 22, color: DARK, align: 'center' });
    }

    function drawEnemies(s, ctx) {
        s.enemies.forEach(function (e) {
            if (e.x + e.w > G.cam.x - 40 && e.x < G.cam.x + G.W + 40) DRAW[e.kind](s, ctx, e);
        });
    }

    // The hero: blond flat-top, shades, red top. Blinks while invulnerable.
    function drawPlayer(s, ctx) {
        var p = s.p;
        if (p.inv > 0 && Math.floor(s.t * 20) % 2) return;
        var duck = p.crouch ? 8 : 0, x = Math.round(p.x), y = Math.round(p.y) + duck, f = p.face;
        var stride = p.ground ? Math.sin(p.anim * 0.09) * 4 : 3, gx = f > 0 ? x + 12 : x - 8;
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(x + 3 + stride, y + 17, 6, 9 - duck);
        ctx.fillRect(x + 10 - stride, y + 17, 6, 9 - duck);
        ctx.fillStyle = RED;
        ctx.fillRect(x + 2, y + 8, 14, 10);
        ctx.fillStyle = SKIN;
        ctx.fillRect(x + 4, y + 1, 10, 8);
        ctx.fillStyle = GOLD;
        ctx.fillRect(x + 3, y - 2, 12, 4);
        ctx.fillStyle = DARK;
        ctx.fillRect(f > 0 ? x + 8 : x + 3, y + 3, 7, 2);
        ctx.fillStyle = LIGHT;
        ctx.fillRect(gx, y + 10, 14, 4);
        if (p.muzzle > 0) { ctx.fillStyle = YEL; ctx.fillRect(f > 0 ? gx + 14 : gx - 7, y + 8, 7, 8); }
    }

    function drawShots(s, ctx) {
        s.shots.forEach(function (b) {
            if (!visible(b.x - 16, 32)) return;
            if (!b.foe) { ctx.fillStyle = YEL; ctx.fillRect(b.x - 6, b.y - 1.5, 12, 3); return; }
            if (b.wave) {
                ctx.fillStyle = Math.floor(s.t * 30) % 2 ? YEL : '#ff6a00';
                ctx.fillRect(b.x - 8, b.y - 14 - Math.sin(s.t * 40) * 4, 16, 24 + Math.sin(s.t * 40) * 4);
                return;
            }
            ctx.fillStyle = b.bomb ? '#8a8a8a' : RED;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = b.bomb && Math.floor(s.t * 10) % 2 ? RED : '#ffffff';
            ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
        });
        s.nades.forEach(function (n) {
            if (!visible(n.x, n.w)) return;
            ctx.fillStyle = Math.floor(n.fuse * 10) % 2 ? '#4a6a2a' : YEL;
            ctx.fillRect(n.x, n.y, n.w, n.h);
        });
    }

    function drawBlasts(s, ctx) {
        s.blasts.forEach(function (b) {
            if (!visible(b.x - b.r, b.r * 2)) return;
            var k = 1 - b.t / 0.35;
            ctx.globalAlpha = Math.max(0, 1 - k);
            ctx.fillStyle = k < 0.3 ? '#ffffff' : (k < 0.6 ? YEL : RED);
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.35 + k * 0.65), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------------
    // Drawing: overlays
    // ------------------------------------------------------------------

    // Level 9: only a torch-lit circle is visible, plus a red emergency
    // strobe every four seconds that shows the room for a moment.
    function drawDark(s, ctx) {
        var p = s.p, x = p.x + p.w / 2 - G.cam.x, y = p.y + 10, r = 215 + Math.sin(s.t * 9) * 6;
        var g = ctx.createRadialGradient(x, y, 50, x, y, r);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.globalAlpha = s.t % 4 < 0.3 ? 0.55 : 1;
        ctx.fillStyle = g;
        ctx.fillRect(0, G.HUD, G.W, G.H - G.HUD);
        ctx.globalAlpha = 1;
    }

    // An arrow at the screen edge towards the keycard (or its carrier), then
    // towards the exit, so "find the keycard" never means wandering blind.
    function drawCompass(s, ctx) {
        var tgt = s.haveCard ? s.door : (s.card || s.boss);
        if (!tgt || Math.floor(s.t * 3) % 2) return;
        var sx = tgt.x - G.cam.x, right = sx > G.W - 20;
        if (!right && sx > 0) return;
        var x = right ? G.W - 26 : 26, d = right ? 1 : -1;
        ctx.fillStyle = GOLD;
        ctx.beginPath(); ctx.moveTo(x + d * 14, 78); ctx.lineTo(x - d * 6, 66); ctx.lineTo(x - d * 6, 90); ctx.fill();
        G.text(s.haveCard ? 'EXIT' : 'KEY', x - d * 12, 85, { size: 20, bold: true, color: GOLD, align: right ? 'right' : 'left' });
    }

    function drawBossBar(s, ctx) {
        var e = s.boss;
        if (!e || !e.awake || e.dead) return;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(278, 508, 404, 16);
        ctx.fillStyle = e.flash > 0 ? '#ffffff' : RED;
        ctx.fillRect(280, 510, 400 * Math.max(0, e.hp) / e.max, 12);
        G.text('OVERLORD', G.W / 2, 503, { size: 20, bold: true, color: GOLD, align: 'center' });
    }

    // The health bar belongs to the current life; the hearts in the engine's
    // HUD are the lives.
    function drawStatus(s, ctx) {
        var p = s.p, low = p.hp <= 35, secs = Math.ceil(s.clock);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        var width = s.touch ? 180 : 150, height = s.touch ? 18 : 10;
        ctx.fillRect(10, 36, width + 4, height + 4);
        ctx.fillStyle = low ? (Math.floor(s.t * 6) % 2 ? RED : BLOOD) : GOLD;
        ctx.fillRect(12, 38, width * G.clamp(p.hp, 0, 100) / 100, height);
        G.text(s.touch ? 'HP ' + Math.ceil(Math.max(0, p.hp)) : 'HEALTH', width + 22, s.touch ? 54 : 48,
            { size: s.touch ? 22 : 13, color: LIGHT });
        // Keep equipment out of the engine's phone HUD: with four hearts,
        // a special gun and the key it otherwise squeezes every word down.
        if (s.touch) G.text(equipment(s), G.W - 12, 54, { size: 22, color: LIGHT, align: 'right', max: 540 });
        if (s.msgT > 0) G.text(s.msg, G.W / 2, 96, { size: s.touch ? 22 : 20, bold: true, color: YEL, align: 'center', glow: RED, max: 640 });
        if (secs <= 20 && secs > 0) {
            G.text(String(secs), G.W / 2, 150, { size: 44, bold: true, color: Math.floor(s.t * 4) % 2 ? RED : YEL, align: 'center', glow: RED });
        }
        drawBossBar(s, ctx);
        drawCompass(s, ctx);
    }

    function draw(s, ctx) {
        drawBackdrop(s, ctx);
        ctx.save();
        ctx.translate(-G.cam.x, 0);
        drawCheckpoints(s, ctx);
        drawDoor(s, ctx);
        drawTiles(s, ctx);
        drawMovers(s, ctx);
        drawBarrels(s, ctx);
        drawPickups(s, ctx);
        drawCard(s, ctx);
        drawEnemies(s, ctx);
        drawPlayer(s, ctx);
        drawBlasts(s, ctx);
        ctx.restore();
        if (s.dark) drawDark(s, ctx);
        // Shots and laser gates glow through the darkness: being hit by
        // something that could not be seen would not be fair.
        ctx.save();
        ctx.translate(-G.cam.x, 0);
        drawLasers(s, ctx);
        drawShots(s, ctx);
        ctx.restore();
        drawStatus(s, ctx);
    }

    function equipment(s) {
        var p = s.p, gun = p.weapon === 'gun' ? 'GUN' : p.weapon.toUpperCase() + ' ' + p.ammo;
        return gun + '  GRN ' + p.nades + (s.haveCard ? '  KEY' : '');
    }

    function hud(s) {
        return 'T-' + Math.max(0, Math.ceil(s.clock)) + (s.touch ? '' : '  ' + equipment(s));
    }

    G.register('nukem', {
        title: 'NUKEM TIME',
        blurb: 'The nuke is ticking. Find the keycard, reach the exit, blow up the rest.',
        controls: [
            '← → run · ↑ jump (hold for height) · ↓ duck',
            'SPACE / FIRE shoot · X / NADE throw a grenade',
            'Run + ↑ + FIRE together to jump and shoot',
            'Barrels explode · crates hide supplies'
        ],
        levelNames: ['Rooftops', 'Loading Dock', 'Sky Patrol', 'Acid Sewers', 'Factory Floor', 'Lift Shaft', 'Mutant Lab', 'Laser Grid', 'Blackout', 'The Overlord'],
        colors: { bg: '#0a0a0a', fg: '#e0e0e0', accent: '#ffd700', dim: '#8a8a8a' },
        lives: 4,
        // A loud E-minor pentatonic rock riff: square lead, driving
        // eighth-note bass, kick and snare on a straight backbeat.
        music: {
            bpm: 148, root: 40, scale: 'pentatonic', prog: [0, 0, 2, 0, 3, 2, 0, 0],
            bass: 'x.x.x.o.x.x.5.x.',
            lead: [
                '0.0.3.0.4.0.3.2.', '0.0.3.0.5---4.3.', '0.0.3.0.4.0.3.2.', '5.4.3.2.0---....',
                '7-7.5.4.5---4.3.', '2.3.4.5.7---5.4.', '0.0.3.0.4.0.3.2.', '5.7.5.4.0-------'
            ],
            arp: '0.2.0.3.', drums: { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
            leadWave: 'square', bassWave: 'square', arpWave: 'sawtooth', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // The full pad: run, jump and duck on the stick (its corners give a
        // running jump), the two actions under the right thumb. Jump stays
        // on the stick so that FIRE can be held through every jump.
        touch: { a: 'FIRE', b: 'NADE' }
    });
})();
