/*
 * Bullet Time — the matrix theme's game.
 *
 * Top-down rooms drawn in green code. Time runs at full speed only while the
 * player moves or shoots; standing still slows the world to a crawl, so
 * bullets can be read and stepped around. One hit kills. Agents patrol, take
 * cover and fire; every agent drops its gun, guns hold little ammunition, and
 * an agent can always be taken down by running into its back. Sentinel
 * drones ignore bullet time altogether. Clear the room to win the level.
 *
 * A mouse aims by hovering, which a phone cannot do. On the touch pad the
 * game therefore aims for the player: FIRE shoots the nearest hostile in
 * sight, a tap on the canvas shoots the hostile under the finger, and a
 * reticle shows which one the next round is for. Desktop play is unchanged.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var T = 30, COLS = 32, ROWS = 18;             // row 0 lies under the HUD and is solid
    var FLOOR = 0, WALL = 1, GLASS = 2, FAR = 9999;
    var DIRS = [1, -1, COLS, -COLS];              // tile-index steps to the four neighbours
    var TAU = Math.PI * 2;
    var CRAWL = 0.1;                              // world speed while the player stands still
    var RUN = 220, PLAYER_SHOT = 720;
    var TAP_SNAP = 70;                            // a fingertip covers about this much of the canvas
    var SEALED = 8;                               // world seconds an agent stays shut in behind glass
    var GREEN = '#00ff41', MID = '#008f11', DARK = '#003b00', PALE = '#d8ffe0', RED = '#ff3b4e';
    var GLYPHS = '01<>[]{}=+*#$%&/|:;?ZXKTNHM';

    // range is how far a bullet flies before it fades, rate the world-time
    // seconds between the player's shots, cap the most rounds they can carry,
    // drop the rounds in a gun a deleted agent leaves behind (a gun lying in
    // the room at the start holds two more). Drops are generous so that less
    // of a room is spent running unarmed for the next gun: that run is where
    // most players are shot.
    var GUNS = {
        pistol: { n: 1, spread: 0, range: 2000, rate: 0.4, cap: 12, drop: 5 },
        shotgun: { n: 6, spread: 0.42, range: 330, rate: 0.8, cap: 6, drop: 3 }
    };

    // wind is the aiming time before a shot, cool the reload after it, keep
    // the distance an agent tries to close to before it stops advancing.
    // The shotgun and the dodger aim longer than the plain agent: a fan of
    // pellets and a target that sidesteps both need more time to answer.
    var KINDS = {
        a: { speed: 95, wind: 0.55, cool: 1.3, range: 520, keep: 240, gun: 'pistol', score: 100, color: GREEN },
        s: { speed: 85, wind: 0.95, cool: 2.3, range: 290, keep: 170, gun: 'shotgun', score: 150, color: '#c8ff3a' },
        d: { speed: 110, wind: 0.6, cool: 1.4, range: 520, keep: 240, gun: 'pistol', score: 200, color: '#5dffd0', dodge: true }
    };

    // Rooms, in tile coordinates. walls/glass are [x, y, w, h] rectangles.
    // An enemy is [kind, x, y] plus an optional patrol end point; kind 'z'
    // is a sentinel drone. Each further wave arrives when one enemy is left.
    var LEVELS = [
        { // 1: pistol agents only, plenty of ammunition, slow reactions
            start: [3, 9], ammo: 8, cache: [3, 15],
            walls: [[10, 4, 2, 5], [10, 12, 2, 3], [20, 7, 2, 6]],
            waves: [[['a', 16, 4, 16, 14], ['a', 25, 14, 25, 4], ['a', 28, 15, 23, 15], ['a', 29, 3, 29, 10]],
                [['a', 30, 2], ['a', 30, 16], ['a', 16, 2]],
                [['a', 30, 9], ['a', 1, 2], ['a', 16, 16], ['a', 30, 3]]]
        },
        { // 2: glass offices: glass stops people but not eyes, and bullets shatter it (agents shut in shoot
          // their way out). Shotgun agents and dodgers that sidestep the first bullet they see coming.
          // A full magazine, because the first rounds go into the panes.
            start: [3, 9], ammo: 12, cache: [2, 16], guns: [[3, 15, 'pistol'], [18, 10, 'shotgun']],
            walls: [[10, 2, 1, 5], [10, 12, 1, 5], [21, 2, 1, 5], [21, 12, 1, 5]],
            glass: [[10, 7, 1, 5], [21, 7, 1, 5], [5, 8, 1, 3], [14, 5, 4, 1], [14, 13, 4, 1], [25, 6, 1, 3]],
            waves: [[['a', 12, 3, 19, 3], ['a', 12, 15, 19, 15], ['d', 16, 9, 16, 7], ['a', 27, 3, 27, 8], ['s', 28, 15, 23, 15]],
                [['a', 30, 2], ['d', 16, 2], ['s', 16, 16]],
                [['d', 1, 2], ['a', 30, 9], ['s', 30, 2]]]
        },
        { // 3: the lobby: rows of pillars, every kind of agent, and a sentinel in each wave after the first
            start: [2, 9], ammo: 10, cache: [2, 16], guns: [[3, 3, 'pistol'], [3, 15, 'shotgun']],
            walls: [[5, 5, 2, 2], [10, 5, 2, 2], [15, 5, 2, 2], [20, 5, 2, 2], [25, 5, 2, 2],
                [5, 12, 2, 2], [10, 12, 2, 2], [15, 12, 2, 2], [20, 12, 2, 2], [25, 12, 2, 2], [28, 8, 1, 3]],
            waves: [[['a', 8, 3, 8, 15], ['a', 13, 15, 13, 3], ['s', 18, 3, 18, 15], ['d', 23, 15, 23, 3], ['a', 29, 4, 29, 6]],
                [['a', 30, 2], ['a', 30, 16], ['d', 17, 2], ['s', 30, 9], ['z', 30, 12]],
                [['z', 30, 2], ['a', 1, 2], ['a', 1, 16], ['s', 30, 7], ['d', 16, 9]]]
        }
    ];

    // ------------------------------------------------------------------
    // Grid helpers
    // ------------------------------------------------------------------

    function mid(t) { return t * T + T / 2; }
    function tileAt(x, y) { return Math.floor(y / T) * COLS + Math.floor(x / T); }
    function tileX(i) { return mid(i % COLS); }
    function tileY(i) { return mid(Math.floor(i / COLS)); }

    function angDiff(from, to) {
        var d = (to - from) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        return d;
    }

    function turn(e, target, max) { e.face += G.clamp(angDiff(e.face, target), -max, max); }

    function fillRects(grid, rects, kind) {
        (rects || []).forEach(function (r) {
            for (var y = r[1]; y < r[1] + r[3]; y++) {
                for (var x = r[0]; x < r[0] + r[2]; x++) grid[y * COLS + x] = kind;
            }
        });
    }

    function buildGrid(lv) {
        var grid = [];
        for (var i = 0; i < COLS * ROWS; i++) {
            var tx = i % COLS, ty = Math.floor(i / COLS);
            grid.push(tx === 0 || tx === COLS - 1 || ty <= 1 || ty === ROWS - 1 ? WALL : FLOOR);
        }
        fillRects(grid, lv.walls, WALL);
        fillRects(grid, lv.glass, GLASS);
        return grid;
    }

    // Glass is see-through, so only real walls break a line of sight.
    function los(s, ax, ay, bx, by) {
        var n = Math.ceil(G.dist(ax, ay, bx, by) / 8);
        for (var i = 1; i < n; i++) {
            if (s.grid[tileAt(G.lerp(ax, bx, i / n), G.lerp(ay, by, i / n))] === WALL) return false;
        }
        return true;
    }

    // Walking distance from every floor tile to the player. Agents walk
    // downhill on it, so it is rebuilt whenever the player changes tile or
    // glass breaks. Tiles the player cannot reach stay at FAR.
    function computeFlow(s) {
        var start = tileAt(s.p.x, s.p.y), flow = s.flow, queue = [start], head = 0, i;
        for (i = 0; i < flow.length; i++) flow[i] = FAR;
        flow[start] = 0;
        while (head < queue.length) {
            var c = queue[head++];
            for (i = 0; i < 4; i++) {
                var n = c + DIRS[i];
                if (s.grid[n] === FLOOR && flow[n] === FAR) { flow[n] = flow[c] + 1; queue.push(n); }
            }
        }
        s.flowTile = start; s.flowDirty = false;
    }

    // Moves a round body against the tile grid in its own time step.
    function slide(s, e, dt) {
        var b = { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2, vx: e.vx, vy: e.vy };
        G.tileMove(b, dt, T, s.solid);
        e.x = b.x + e.r; e.y = b.y + e.r;
    }

    // ------------------------------------------------------------------
    // Setting up a room
    // ------------------------------------------------------------------

    // Difficulty that rises with the level besides the room itself: agents
    // aim faster, bullets fly faster, and in the lobby they lead a moving
    // target. From the second room on agents duck into cover to reload. The
    // steps are small (one hit kills): in the lobby the aiming time is four
    // fifths of the first room's and bullets are a fifth faster. trace is the
    // seconds before the alarm, drop how long an empty-handed player waits
    // for the operator's dead drop.
    function tune(level) {
        return {
            wind: 1.5 - (level - 1) * 0.15, shot: 270 + (level - 1) * 30, lead: level === 3 ? 0.3 : 0,
            cover: level >= 2, drone: 95, trace: 8, drop: 3
        };
    }

    function spawn(s, spec, late) {
        var x = mid(spec[1]), y = mid(spec[2]);
        // Reinforcements (late) take a moment to materialise or wake, long
        // enough to finish the last enemy of the wave before and turn round.
        if (spec[0] === 'z') {
            s.drones.push({ x: x, y: y, vx: 0, vy: 0, r: 13, hp: 3, wake: late ? 2.2 : 2.5, ping: 0, swim: s.rnd() * TAU });
            return;
        }
        var px = spec.length > 3 ? mid(spec[3]) : x, py = spec.length > 3 ? mid(spec[4]) : y;
        s.agents.push({
            kind: spec[0], k: KINDS[spec[0]], x: x, y: y, r: 11, vx: 0, vy: 0,
            face: spec.length > 3 ? Math.atan2(py - y, px - x) : Math.atan2(s.p.y - y, s.p.x - x),
            home: { x: x, y: y }, post: { x: px, y: py }, out: true,
            cool: 0.3 + s.rnd() * 0.7, wind: 0, react: late ? 0.4 : 0, spawn: late ? 1.3 : 0,
            dodge: 0, dodgeCool: 0, dvx: 0, dvy: 0, mx: 0, my: 0, sealed: 0, cover: null, flash: 0, dead: false
        });
    }

    // A phone has no hover and no right button, so there the game aims for
    // the player (see touchAim). Asked on every init and kept in s.
    function coarse() {
        return G.isTouch();
    }

    function init(level) {
        var lv = LEVELS[level - 1], grid = buildGrid(lv);
        var s = {
            lv: lv, tune: tune(level), grid: grid, flow: new Array(COLS * ROWS), flowTile: -1, flowDirty: false,
            solid: function (tx, ty) { return tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS || grid[ty * COLS + tx] !== FLOOR; },
            rnd: G.rng(level * 7919),
            p: { x: mid(lv.start[0]), y: mid(lv.start[1]), r: 8, vx: 0, vy: 0, face: 0 },
            aim: 0, mouse: false, mx: G.mouse.x, my: G.mouse.y, touch: coarse(), lock: null,
            gun: 'pistol', ammo: { pistol: lv.ammo, shotgun: 0 }, fireT: 0, shootT: 0,
            agents: [], drones: [], bullets: [], pickups: [], wave: 0,
            ts: CRAWL, clock: 0, anim: 0, alert: false, slow: true, cueT: 0, beatT: 0, tickT: 0, grazeT: 0, lockT: 0, still: 0,
            dropT: 0, doneT: 0, dead: false, msg: '', msgT: 0
        };
        (lv.guns || []).forEach(function (g) { s.pickups.push({ x: mid(g[0]), y: mid(g[1]), kind: g[2], n: GUNS[g[2]].drop + 2 }); });
        lv.waves[0].forEach(function (spec) { spawn(s, spec, false); });
        computeFlow(s);
        return s;
    }

    function say(s, text) {
        var short = {
            'EMPTY — TAKE THEM FROM BEHIND': 'EMPTY: ATTACK FROM BEHIND',
            'TRACE COMPLETE — AGENTS INBOUND': 'ALERT: AGENTS INBOUND',
            'OPERATOR: DEAD DROP AT THE MARKER': 'AMMO AT DROP MARKER'
        };
        s.msg = s.touch && short[text] ? short[text] : text; s.msgT = 2.2;
    }

    // Floating text, kept clear of the canvas edges and of the HUD it rises
    // toward, so a kill next to a wall still shows its whole label.
    function pop(x, y, text, color) {
        var half = text.length * 5 + 8;
        G.popup(G.clamp(x, half, G.W - half), Math.max(y, G.HUD + 46), text, color);
    }

    // ------------------------------------------------------------------
    // Sounds
    // ------------------------------------------------------------------

    function gunSound(kind, mine) {
        var base = mine ? 1 : 0.6;
        if (kind === 'shotgun') {
            G.noise(0.28, { freq: 2200 * base, slide: 120, vol: 0.4 });
            G.tone(110 * base, 0.2, { type: 'sawtooth', slide: 40, vol: 0.2 });
            return;
        }
        G.noise(0.1, { freq: 3200 * base, slide: 400, vol: 0.28 });
        G.tone(520 * base, 0.09, { slide: 90, vol: 0.14 });
    }

    // A deleted program: a burst of random bleeps running down the scale.
    function derezSound() {
        for (var i = 0; i < 6; i++) {
            G.tone(G.rnd(300, 1800) / (1 + i * 0.3), 0.05, { type: 'square', vol: 0.1, delay: i * 0.035 });
        }
        G.noise(0.25, { filter: 'bandpass', freq: 2400, slide: 200, q: 4, vol: 0.18 });
    }

    // Many pellets can strike in one tick; a short gate keeps that one sound.
    function tick(s, freq) {
        if (s.tickT > 0) return;
        s.tickT = 0.05;
        G.tone(freq, 0.03, { type: 'triangle', vol: 0.09 });
    }

    // ------------------------------------------------------------------
    // The player
    // ------------------------------------------------------------------

    function movePlayer(s, dt) {
        var p = s.p, ix = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0), iy = (G.key.down ? 1 : 0) - (G.key.up ? 1 : 0);
        var len = Math.hypot(ix, iy) || 1, k = Math.min(1, dt * 14);
        // A little inertia: the coat takes a moment to get going and to stop.
        p.vx += (ix / len * RUN - p.vx) * k;
        p.vy += (iy / len * RUN - p.vy) * k;
        var ox = p.x, oy = p.y;
        slide(s, p, dt);
        if (ix || iy) p.face = Math.atan2(iy, ix);
        // Moving means a held key and real displacement. Pushing against a
        // wall only turns the player, and the short glide after letting go
        // must not keep time running, or stopping would not stop the clock.
        return !!(ix || iy) && G.dist(ox, oy, p.x, p.y) > RUN * dt * 0.1;
    }

    // Keyboard players can only face eight ways, so the gun snaps to the
    // visible enemy nearest to that direction (within half a step of 45°).
    function keyAim(s) {
        var p = s.p, best = p.face, bestD = 0.42;
        s.agents.concat(s.drones).forEach(function (e) {
            var ang = Math.atan2(e.y - p.y, e.x - p.x), d = Math.abs(angDiff(p.face, ang));
            if (d < bestD && los(s, p.x, p.y, e.x, e.y)) { bestD = d; best = ang; }
        });
        return best;
    }

    // The hostile in the player's sight that is nearest to (x, y) and no
    // further from it than max.
    function nearestFoe(s, x, y, max) {
        var p = s.p, best = null, bestD = max;
        s.agents.concat(s.drones).forEach(function (e) {
            var d = G.dist(x, y, e.x, e.y);
            if (d < bestD && los(s, p.x, p.y, e.x, e.y)) { bestD = d; best = e; }
        });
        return best;
    }

    // Touch aiming. A finger on the canvas picks the hostile under it (a
    // fingertip is blunt, so anything within TAP_SNAP counts) or, with none
    // there, the spot itself; without a finger FIRE goes to the nearest
    // hostile in sight. The pick is kept in s.lock and drawn as a reticle,
    // so the player sees what the next round is for before spending it.
    // A walking agent is led, which a thumb cannot do the way a mouse can.
    function touchAim(s) {
        var p = s.p, m = G.mouse, finger = m.down || m.hit;
        var e = finger ? nearestFoe(s, m.x, m.y, TAP_SNAP) : nearestFoe(s, p.x, p.y, FAR);
        s.lock = e;
        if (!e) return finger ? Math.atan2(m.y - p.y, m.x - p.x) : p.face;
        var t = G.dist(p.x, p.y, e.x, e.y) / PLAYER_SHOT;
        return Math.atan2(e.y + (e.my || 0) * t - p.y, e.x + (e.mx || 0) * t - p.x);
    }

    // The mouse takes over the aim once it moves or clicks; SPACE hands it
    // back to the keyboard. So a mouse that never moved is never read.
    function updateAim(s) {
        var p = s.p, m = G.mouse;
        if (s.touch) { s.aim = touchAim(s); return; }
        if (m.x !== s.mx || m.y !== s.my || m.hit) { s.mouse = true; s.mx = m.x; s.my = m.y; }
        if (G.hit.a) s.mouse = false;
        s.aim = s.mouse ? Math.atan2(m.y - p.y, m.x - p.x) : keyAim(s);
    }

    function shoot(s, who, ang, kind, speed) {
        var gun = GUNS[kind];
        for (var i = 0; i < gun.n; i++) {
            var a = ang + (gun.n > 1 ? (i / (gun.n - 1) - 0.5) * gun.spread + G.rnd(-0.03, 0.03) : 0);
            s.bullets.push({ x: who.x, y: who.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, own: who, life: gun.range / speed, grazed: false });
        }
        gunSound(kind, who === s.p);
        G.burst(who.x + Math.cos(ang) * 14, who.y + Math.sin(ang) * 14, { n: 5, color: PALE, speed: 220, life: 0.15, angle: ang, spread: 0.8 });
    }

    function switchGun(s) {
        var other = s.gun === 'pistol' ? 'shotgun' : 'pistol';
        if (!s.ammo[other]) return false;
        s.gun = other;
        G.sfx('click');
        return true;
    }

    // The gun cycles in world time, not real time: after a shot the player
    // has to move (let time pass) before the next round is ready. Standing
    // still and emptying the magazine into a frozen room is not possible.
    function fire(s, dt) {
        s.fireT -= dt * s.ts; s.shootT -= dt;
        if (G.hit.b || G.mouse.rhit) switchGun(s);
        // mouse.hit as well: a tap that lifts before the next tick still counts.
        if (!(G.key.a || G.mouse.down || G.mouse.hit) || s.fireT > 0) return;
        if (!s.ammo[s.gun] && !switchGun(s)) {
            if (G.hit.a || G.mouse.hit) { G.tone(180, 0.04, { vol: 0.12 }); say(s, 'EMPTY — TAKE THEM FROM BEHIND'); }
            return;
        }
        s.ammo[s.gun]--;
        s.fireT = GUNS[s.gun].rate;
        s.shootT = 0.2;                         // a shot lets time run for a moment
        shoot(s, s.p, s.aim, s.gun, PLAYER_SHOT);
        G.shake(s.gun === 'shotgun' ? 5 : 2, 0.1);
        if (!s.alert) raiseAlert(s);
    }

    function killPlayer(s) {
        if (s.dead) return;
        s.dead = true;
        G.burst(s.p.x, s.p.y, { n: 40, color: PALE, speed: 260, life: 0.9, drag: 2 });
        G.noise(0.5, { filter: 'bandpass', freq: 900, slide: 80, q: 3, vol: 0.4 });
        G.flash(RED, 0.3);
        G.die();
    }

    function grabPickups(s) {
        var p = s.p;
        s.pickups = s.pickups.filter(function (g) {
            if (G.dist(p.x, p.y, g.x, g.y) > 22) return true;
            s.ammo[g.kind] = Math.min(GUNS[g.kind].cap, s.ammo[g.kind] + g.n);
            if (!s.ammo[s.gun]) s.gun = g.kind;
            G.tone(700, 0.05, { type: 'triangle', vol: 0.16 });
            G.tone(1050, 0.08, { type: 'triangle', vol: 0.16, delay: 0.06 });
            pop(g.x, g.y - 14, '+' + g.n + ' ' + g.kind.toUpperCase(), PALE);
            return false;
        });
    }

    // Running into an agent anywhere in its rear half deletes it without a
    // shot. The takedown makes no noise, so it does not raise the alarm.
    // Bodies do not block each other, so a player charging an agent head-on
    // would come out behind it: that does not count. The run has to go the
    // way the agent looks, or across it.
    function takedowns(s) {
        var p = s.p, heading = Math.atan2(p.vy, p.vx);
        s.agents.forEach(function (a) {
            if (a.dead || G.dist(p.x, p.y, a.x, a.y) > p.r + a.r + 3) return;
            var side = Math.cos(angDiff(a.face, Math.atan2(p.y - a.y, p.x - a.x)));
            if (side < 0 && Math.cos(angDiff(a.face, heading)) > -0.5) killAgent(s, a, 'takedown');
        });
    }

    // ------------------------------------------------------------------
    // Agents
    // ------------------------------------------------------------------

    function raiseAlert(s) {
        s.alert = true;
        s.agents.forEach(function (a) { a.react = 0.25 + G.rnd(0, 0.5); pop(a.x, a.y - 18, '!', RED); });
        G.sfx('alarm');
        say(s, 'TRACE COMPLETE — AGENTS INBOUND');
    }

    // Before the alarm an agent only notices what is in front of it (or very
    // close); afterwards any clear line to the player will do.
    function canSee(s, a, dist) {
        var p = s.p;
        if (!los(s, a.x, a.y, p.x, p.y)) return false;
        if (s.alert) return true;
        // Nothing behind the shoulders is noticed at any distance: that blind
        // rear half is what makes a silent takedown possible.
        var off = Math.abs(angDiff(a.face, Math.atan2(p.y - a.y, p.x - a.x)));
        return off < 1.0 ? dist < 420 : (off < Math.PI / 2 && dist < 70);
    }

    // Heads for a point; neighbours push back so a group does not stack up
    // into a single target.
    function steer(s, a, tx, ty, speed, wdt) {
        var dx = tx - a.x, dy = ty - a.y, len = Math.hypot(dx, dy) || 1;
        speed = Math.min(speed, len / wdt);
        a.vx = dx / len * speed; a.vy = dy / len * speed;
        s.agents.forEach(function (o) {
            var d = G.dist(a.x, a.y, o.x, o.y);
            if (o !== a && d > 0 && d < 26) { a.vx += (a.x - o.x) / d * 70; a.vy += (a.y - o.y) / d * 70; }
        });
        slide(s, a, wdt);
    }

    function patrol(s, a, wdt) {
        var to = a.out ? a.post : a.home;
        if (G.dist(a.x, a.y, to.x, to.y) < 4) { a.out = !a.out; return; }
        steer(s, a, to.x, to.y, a.k.speed * 0.55, wdt);
        turn(a, Math.atan2(to.y - a.y, to.x - a.x), 5 * wdt);
    }

    // Sealed in behind glass with the alarm ringing, an agent does not wait
    // for ever: after SEALED seconds it shoots out the nearest pane it can
    // see. Without this a player hiding out of sight of a sealed office
    // could never be found, and standing still would be safe for good.
    function breakOut(s, a, wdt) {
        var best = -1, bestD = FAR;
        a.sealed += wdt;
        if (a.sealed < SEALED || a.cool > 0) return;
        for (var i = 0; i < s.grid.length; i++) {
            var d = G.dist(a.x, a.y, tileX(i), tileY(i));
            if (s.grid[i] === GLASS && d < bestD && los(s, a.x, a.y, tileX(i), tileY(i))) { bestD = d; best = i; }
        }
        if (best < 0) return;
        var ang = Math.atan2(tileY(best) - a.y, tileX(best) - a.x);
        turn(a, ang, 6 * wdt);
        if (Math.abs(angDiff(a.face, ang)) > 0.05) return;
        shoot(s, a, a.face, a.k.gun, s.tune.shot);
        a.cool = a.k.cool; a.flash = 0.1;
    }

    // One tile downhill on the flow field. An agent the player cannot reach
    // (sealed behind glass) finds no lower neighbour; it holds its ground
    // for a while and then breaks out.
    function chase(s, a, wdt, look) {
        var c = tileAt(a.x, a.y), best = c;
        for (var i = 0; i < 4; i++) if (s.flow[c + DIRS[i]] < s.flow[best]) best = c + DIRS[i];
        if (best === c) { if (s.flow[c] === FAR) breakOut(s, a, wdt); return; }
        steer(s, a, tileX(best), tileY(best), a.k.speed, wdt);
        if (look) turn(a, Math.atan2(tileY(best) - a.y, tileX(best) - a.x), 6 * wdt);
    }

    // Shortest walk (at most four tiles) to a tile the player cannot see.
    function findCover(s, a) {
        var start = tileAt(a.x, a.y), prev = {}, depth = {}, queue = [start], head = 0;
        prev[start] = -1; depth[start] = 0;
        while (head < queue.length) {
            var c = queue[head++];
            if (c !== start && !los(s, tileX(c), tileY(c), s.p.x, s.p.y)) {
                var path = [];
                for (; prev[c] !== -1; c = prev[c]) path.unshift(c);
                return path;
            }
            for (var i = 0; i < 4 && depth[c] < 4; i++) {
                var n = c + DIRS[i];
                if (s.grid[n] === FLOOR && prev[n] === undefined) { prev[n] = c; depth[n] = depth[c] + 1; queue.push(n); }
            }
        }
        return null;
    }

    // Walks the cover path and waits there until the gun is ready again.
    function takeCover(s, a, wdt) {
        var next = a.cover[0];
        if (a.cool <= 0) { a.cover = null; return; }
        if (next === undefined) { turn(a, Math.atan2(s.p.y - a.y, s.p.x - a.x), 4 * wdt); return; }
        steer(s, a, tileX(next), tileY(next), a.k.speed * 1.2, wdt);
        turn(a, Math.atan2(tileY(next) - a.y, tileX(next) - a.x), 6 * wdt);
        if (G.dist(a.x, a.y, tileX(next), tileY(next)) < 5) a.cover.shift();
    }

    // Dodgers step sideways out of the path of a player bullet they can see
    // coming. A bullet fired from very close leaves no time to react.
    function incoming(s, a) {
        for (var i = 0; i < s.bullets.length; i++) {
            var b = s.bullets[i], sp = Math.hypot(b.vx, b.vy);
            if (b.own !== s.p || !sp) continue;
            var ux = b.vx / sp, uy = b.vy / sp, rx = a.x - b.x, ry = a.y - b.y;
            var along = rx * ux + ry * uy, side = ux * ry - uy * rx;
            if (along > 60 && along < 280 && Math.abs(side) < 26) return { nx: -uy, ny: ux, side: side < 0 ? -1 : 1 };
        }
        return null;
    }

    function dodge(s, a, wdt) {
        if (a.dodge > 0) {
            a.dodge -= wdt; a.vx = a.dvx; a.vy = a.dvy;
            slide(s, a, wdt);
            return true;
        }
        var hit = a.k.dodge && a.dodgeCool <= 0 && incoming(s, a);
        if (!hit) return false;
        // Jump away from the bullet's line, or the other way if a wall is there.
        if (s.grid[tileAt(a.x + hit.nx * hit.side * 40, a.y + hit.ny * hit.side * 40)] !== FLOOR) hit.side = -hit.side;
        a.dvx = hit.nx * hit.side * 400; a.dvy = hit.ny * hit.side * 400;
        a.dodge = 0.2; a.dodgeCool = 1.0;
        G.noise(0.15, { filter: 'bandpass', freq: 600, slide: 3000, q: 2, vol: 0.15 });
        G.burst(a.x, a.y, { n: 8, color: a.k.color, speed: 60, life: 0.3 });
        return true;
    }

    function aimAngle(s, a, dist) {
        var p = s.p, t = dist / s.tune.shot * s.tune.lead;
        return Math.atan2(p.y + p.vy * t - a.y, p.x + p.vx * t - a.x);
    }

    // Agents hold fire while a colleague stands in the line of fire, which
    // lets the player use one agent as a shield against another.
    function friendInWay(s, a) {
        return s.agents.some(function (o) {
            if (o === a) return false;
            var c = G.closestOnSeg(o.x, o.y, a.x, a.y, s.p.x, s.p.y);
            return c.t > 0 && G.dist(o.x, o.y, c.x, c.y) < 14;
        });
    }

    // The shot goes exactly where the laser sight is drawn: along a.face.
    function agentFire(s, a) {
        shoot(s, a, a.face, a.k.gun, s.tune.shot);
        a.cool = a.k.cool; a.wind = 0; a.flash = 0.1;
        if (!s.tune.cover || G.rnd(0, 1) > 0.7) return;
        a.cover = findCover(s, a);
        if (a.cover) a.cool += 0.6;             // time to get there and back
    }

    // With the player in sight: close in while reloading, then stand, aim
    // (the laser sight is the warning) and fire.
    function engage(s, a, wdt, dist) {
        var aim = aimAngle(s, a, dist);
        turn(a, aim, 4.5 * wdt);
        if (a.cool > 0) { if (dist > a.k.keep) chase(s, a, wdt, false); return; }
        if (friendInWay(s, a)) { a.wind = 0; chase(s, a, wdt, false); return; }
        if (Math.abs(angDiff(a.face, aim)) > 0.25) return;
        // The lock-on chirp is gated: an aim that a passing colleague keeps
        // breaking would otherwise chirp on every other tick.
        if (a.wind === 0 && s.lockT <= 0) { s.lockT = 0.15; G.tone(900, 0.06, { type: 'sine', slide: 1500, vol: 0.07 }); }
        a.wind += wdt;
        if (a.wind >= a.k.wind * s.tune.wind) agentFire(s, a);
    }

    function updateAgent(s, a, wdt) {
        var dist = G.dist(a.x, a.y, s.p.x, s.p.y);
        a.flash -= wdt;
        if (a.spawn > 0) { a.spawn -= wdt; return; }          // still materialising
        a.cool -= wdt; a.dodgeCool -= wdt;
        var sees = canSee(s, a, dist);
        if (!s.alert) {
            if (!sees) { patrol(s, a, wdt); return; }
            raiseAlert(s);
        }
        if (dodge(s, a, wdt)) return;
        // A startled agent is frozen for its reaction time; it does not even
        // turn, so one caught from behind can still be taken down.
        if (a.react > 0) { a.react -= wdt; return; }
        if (a.cover) { takeCover(s, a, wdt); return; }
        if (sees && dist < a.k.range) engage(s, a, wdt, dist);
        else { a.wind = 0; chase(s, a, wdt, true); }
    }

    function killAgent(s, a, how) {
        var bonus = how === 'takedown' ? 250 : 0;
        a.dead = true;
        s.pickups.push({ x: a.x, y: a.y, kind: a.k.gun, n: GUNS[a.k.gun].drop });
        G.addScore((a.k.score + bonus) * G.level);
        G.burst(a.x, a.y, { n: 26, color: a.k.color, speed: 240, life: 0.7, drag: 3, size: 4 });
        pop(a.x, a.y - 16, how === 'takedown' ? 'TAKEDOWN' : (how === 'friendly' ? 'CROSSFIRE' : 'DELETED'), how === 'shot' ? GREEN : PALE);
        derezSound();
        if (how === 'takedown') G.tone(90, 0.18, { type: 'sine', slide: 40, vol: 0.4 });
        G.shake(4, 0.12);
    }

    // ------------------------------------------------------------------
    // Sentinels
    // ------------------------------------------------------------------

    // Sentinels run on real time: dt here is never scaled, so standing still
    // does not stop them. They fly over walls and kill by touch.
    function updateDrone(s, d, dt) {
        var p = s.p, dist = G.dist(d.x, d.y, p.x, p.y) || 1, max = s.tune.drone;
        d.swim += dt * 8;
        if (d.wake > 0) { d.wake -= dt; return; }
        d.vx += (p.x - d.x) / dist * 300 * dt; d.vy += (p.y - d.y) / dist * 300 * dt;
        spreadDrone(s, d, dt);
        var sp = Math.hypot(d.vx, d.vy);
        // Above cruising speed (after a hit knocked it back) it brakes hard.
        if (sp > max) { var k = Math.max(max / sp, 1 - 4 * dt); d.vx *= k; d.vy *= k; }
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.ping -= dt;
        if (d.ping <= 0) {                       // sonar that quickens as it closes in
            d.ping = G.clamp(dist / 380, 0.16, 1.1);
            G.tone(1250, 0.05, { type: 'sine', slide: 900, vol: 0.09 });
        }
        if (dist < d.r + p.r - 2) killPlayer(s);
    }

    // Two sentinels chasing one player would merge into what looks like a
    // single drone, so each is pushed away from any other within 50 px.
    function spreadDrone(s, d, dt) {
        s.drones.forEach(function (o) {
            var gap = G.dist(d.x, d.y, o.x, o.y);
            if (o === d || gap > 50) return;
            // Exactly on top of each other: split along each one's own phase.
            var ux = gap ? (d.x - o.x) / gap : Math.cos(d.swim), uy = gap ? (d.y - o.y) / gap : Math.sin(d.swim);
            d.vx += ux * 700 * dt; d.vy += uy * 700 * dt;
        });
    }

    function hitDrone(s, d, b) {
        var sp = Math.hypot(b.vx, b.vy) || 1;
        d.hp--;
        d.vx += b.vx / sp * 170; d.vy += b.vy / sp * 170;
        G.burst(d.x, d.y, { n: 8, color: RED, speed: 200, life: 0.3 });
        G.tone(240, 0.1, { type: 'sawtooth', slide: 80, vol: 0.2 });
        if (d.hp > 0) return;
        G.addScore(400 * G.level);
        G.burst(d.x, d.y, { n: 40, color: RED, speed: 320, life: 0.8, drag: 2 });
        pop(d.x, d.y - 18, 'SENTINEL DOWN', PALE);
        G.sfx('bigboom');
        G.shake(8, 0.3);
    }

    // ------------------------------------------------------------------
    // Bullets
    // ------------------------------------------------------------------

    function hitsWall(s, b) {
        var i = tileAt(b.x, b.y), kind = s.grid[i];
        if (kind === FLOOR) return false;
        if (kind === GLASS) {
            s.grid[i] = FLOOR; s.flowDirty = true;
            G.burst(tileX(i), tileY(i), { n: 22, color: '#9dffd8', speed: 260, life: 0.6, drag: 2 });
            G.noise(0.3, { filter: 'highpass', freq: 5000, vol: 0.3 });
            G.tone(2600, 0.2, { type: 'triangle', slide: 900, vol: 0.1 });
            return true;
        }
        G.burst(b.x, b.y, { n: 4, color: MID, speed: 120, life: 0.25 });
        tick(s, 1700);
        return true;
    }

    // A bullet that passes close without hitting is a graze: a whoosh and a
    // few points, once per bullet.
    function hitsPlayer(s, b, ox, oy) {
        var p = s.p, c = G.closestOnSeg(p.x, p.y, ox, oy, b.x, b.y), d = G.dist(p.x, p.y, c.x, c.y);
        if (d < p.r + 2) { killPlayer(s); return true; }
        if (d < 28 && !b.grazed) {
            b.grazed = true;
            G.addScore(10 * G.level);
            if (s.grazeT > 0) return false;       // a shotgun blast is one whoosh, not six
            s.grazeT = 0.2;
            pop(p.x, p.y - 16, 'DODGE', MID);
            G.noise(0.18, { filter: 'bandpass', freq: 1800, slide: 500, q: 3, vol: 0.14 });
        }
        return false;
    }

    function hitsEnemy(s, b, ox, oy) {
        var mine = b.own === s.p, i, e, c;
        for (i = 0; i < s.agents.length; i++) {
            e = s.agents[i];
            if (e === b.own || e.dead) continue;
            c = G.closestOnSeg(e.x, e.y, ox, oy, b.x, b.y);
            if (G.dist(e.x, e.y, c.x, c.y) < e.r + 2) { killAgent(s, e, mine ? 'shot' : 'friendly'); return true; }
        }
        for (i = 0; mine && i < s.drones.length; i++) {
            e = s.drones[i];
            c = G.closestOnSeg(e.x, e.y, ox, oy, b.x, b.y);
            if (e.hp > 0 && G.dist(e.x, e.y, c.x, c.y) < e.r + 2) { hitDrone(s, e, b); return true; }
        }
        return false;
    }

    function stepBullet(s, b, wdt) {
        var ox = b.x, oy = b.y;
        b.x += b.vx * wdt; b.y += b.vy * wdt; b.life -= wdt;
        if (b.life <= 0 || hitsWall(s, b)) return false;
        if (b.own !== s.p && hitsPlayer(s, b, ox, oy)) return false;
        return !hitsEnemy(s, b, ox, oy);
    }

    // ------------------------------------------------------------------
    // Time, room flow and the update loop
    // ------------------------------------------------------------------

    // The heart of the game: world time eases toward full speed while the
    // player acts and toward a crawl when they stop. Returns the world's dt.
    function advanceTime(s, dt, acting) {
        // Bullet time cannot be held for ever: after eight idle seconds it
        // starts to leak, so a player who never acts is still hunted down.
        s.still = acting ? 0 : s.still + dt;
        var rest = CRAWL + G.clamp((s.still - 8) / 8, 0, 1) * 0.25;
        s.ts += ((acting ? 1 : rest) - s.ts) * Math.min(1, dt * (acting ? 14 : 7));
        s.anim += dt * (0.45 + 0.55 * s.ts);
        s.cueT -= dt; s.beatT -= dt; s.tickT -= dt; s.grazeT -= dt; s.lockT -= dt; s.msgT -= dt;
        var slow = s.ts < 0.5;
        if (slow !== s.slow && s.cueT <= 0) {     // tape-stop down, spin-up back
            s.slow = slow; s.cueT = 0.35;
            G.tone(slow ? 320 : 110, 0.28, { type: 'sine', slide: slow ? 70 : 340, vol: 0.12 });
        }
        if (slow && s.beatT <= 0) {               // heartbeat while the world hangs
            s.beatT = 0.95;
            G.tone(58, 0.12, { type: 'sine', vol: 0.3 });
            G.tone(50, 0.14, { type: 'sine', vol: 0.22, delay: 0.16 });
        }
        s.clock += dt;                            // the trace counts real seconds
        return dt * s.ts;
    }

    // The next wave walks in when a single enemy is left, so the pressure
    // never drops to nothing between waves.
    function reinforce(s) {
        if (s.wave >= s.lv.waves.length - 1 || s.agents.length + s.drones.length > 1) return;
        s.wave++;
        s.lv.waves[s.wave].forEach(function (spec) {
            spawn(s, spec, true);
            G.burst(mid(spec[1]), mid(spec[2]), { n: 16, color: GREEN, speed: 120, life: 0.6 });
        });
        if (!s.alert) raiseAlert(s); else G.sfx('alarm');
        say(s, 'REINFORCEMENTS');
    }

    // A room must never become unwinnable: with no rounds left and no gun
    // within reach, the operator drops a pistol at the room's cache point.
    function deadDrop(s, dt) {
        var reachable = s.pickups.some(function (g) { return s.flow[tileAt(g.x, g.y)] < FAR; });
        if (s.ammo.pistol + s.ammo.shotgun > 0 || reachable) { s.dropT = 0; return; }
        s.dropT += dt;
        if (s.dropT < s.tune.drop) return;
        s.dropT = 0;
        s.pickups.push({ x: mid(s.lv.cache[0]), y: mid(s.lv.cache[1]), kind: 'pistol', n: 4 });
        G.sfx('power');
        say(s, 'OPERATOR: DEAD DROP AT THE MARKER');
    }

    function hostiles(s) {
        var n = s.agents.length + s.drones.length;
        for (var w = s.wave + 1; w < s.lv.waves.length; w++) n += s.lv.waves[w].length;
        return n;
    }

    function checkClear(s, dt) {
        if (hostiles(s)) return;
        s.bullets.length = 0;                     // the room is safe: stray rounds dissolve
        if (s.doneT === 0) say(s, 'ROOM CLEAR');
        s.doneT += dt;
        if (s.doneT > 0.8) G.win(500 + G.level * 100 + (s.ammo.pistol + s.ammo.shotgun) * 25);
    }

    function updateEnemies(s, dt, wdt) {
        s.agents.forEach(function (a) {
            var ox = a.x, oy = a.y;
            if (!a.dead) updateAgent(s, a, wdt);
            a.mx = (a.x - ox) / wdt; a.my = (a.y - oy) / wdt;     // how it really walked: touchAim leads by this
        });
        s.drones.forEach(function (d) { updateDrone(s, d, dt); });
        s.bullets = s.bullets.filter(function (b) { return stepBullet(s, b, wdt); });
        s.agents = s.agents.filter(function (a) { return !a.dead; });
        s.drones = s.drones.filter(function (d) { return d.hp > 0; });
    }

    function update(s, dt) {
        if (s.dead) return;
        var moving = movePlayer(s, dt);
        updateAim(s);
        fire(s, dt);
        var wdt = advanceTime(s, dt, moving || s.shootT > 0);
        if (tileAt(s.p.x, s.p.y) !== s.flowTile || s.flowDirty) computeFlow(s);
        if (moving) takedowns(s);
        grabPickups(s);
        // Even a perfectly hidden player is found once the trace completes.
        if (!s.alert && s.clock > s.tune.trace) raiseAlert(s);
        updateEnemies(s, dt, wdt);
        reinforce(s);
        deadDrop(s, dt);
        checkClear(s, dt);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    // Falling code behind everything. It runs on the same clock as the
    // world, so the rain itself shows how fast time is passing.
    function drawRain(s, ctx) {
        ctx.font = G.font(18);
        ctx.textAlign = 'center';
        ctx.fillStyle = MID;
        for (var c = 0; c < COLS; c += s.touch ? 2 : 1) {
            var head = (s.anim * (70 + (c * 37) % 60) + c * 131) % (G.H + 140);
            for (var k = 0; k < (s.touch ? 4 : 7); k++) {
                var row = Math.floor((head - k * 18) / 18);
                if (row < 3 || row > 29) continue;
                ctx.globalAlpha = (k === 0 ? 0.55 : 0.3) * (1 - k / 7);
                ctx.fillText(GLYPHS.charAt((c * 7 + row * 13) % GLYPHS.length), c * T + T / 2, row * 18);
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawGlass(ctx, x, y) {
        ctx.fillStyle = 'rgba(140,255,215,0.16)';
        ctx.fillRect(x, y, T, T);
        ctx.strokeStyle = 'rgba(157,255,216,0.75)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 1.5, T - 3, T - 3);
        ctx.beginPath(); ctx.moveTo(x + 6, y + T - 8); ctx.lineTo(x + T - 8, y + 6); ctx.stroke();
    }

    // Walls are dark slabs; only the edges that face open floor are lit, so
    // a room reads as an outline rather than a field of boxes.
    function drawWalls(s, ctx) {
        for (var i = COLS; i < COLS * ROWS; i++) {
            var x = (i % COLS) * T, y = Math.floor(i / COLS) * T;
            if (s.grid[i] === GLASS) { drawGlass(ctx, x, y); continue; }
            if (s.grid[i] !== WALL) continue;
            ctx.fillStyle = '#03200b';
            ctx.fillRect(x, y, T, T);
            ctx.fillStyle = GREEN;
            if (s.grid[i - COLS] !== WALL && i >= COLS * 2) ctx.fillRect(x, y, T, 2);
            if (i + COLS < COLS * ROWS && s.grid[i + COLS] !== WALL) ctx.fillRect(x, y + T - 2, T, 2);
            if (i % COLS > 0 && s.grid[i - 1] !== WALL) ctx.fillRect(x, y, 2, T);
            if (i % COLS < COLS - 1 && s.grid[i + 1] !== WALL) ctx.fillRect(x + T - 2, y, 2, T);
        }
    }

    // The operator's drop point: always marked, and it fills up while a
    // dead drop is on its way so the wait is visible.
    function drawCache(s, ctx) {
        var x = mid(s.lv.cache[0]), y = mid(s.lv.cache[1]), k = G.clamp(s.dropT / s.tune.drop, 0, 1), half = s.touch ? 34 : 20;
        ctx.strokeStyle = k > 0 ? PALE : MID; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x - half, y - 12, half * 2, 24);   // wide enough to hold its label
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(216,255,224,0.3)';
        ctx.fillRect(x - half, y + 12 - 24 * k, half * 2, 24 * k);
        G.text('DROP', x, y + 4, { size: s.touch ? 24 : 12, color: k > 0 ? PALE : MID, align: 'center' });
    }

    function drawPickups(s, ctx) {
        var pulse = 0.5 + 0.5 * Math.sin(s.anim * 6);
        s.pickups.forEach(function (g) {
            ctx.strokeStyle = PALE; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.35 + 0.4 * pulse;
            ctx.beginPath(); ctx.arc(g.x, g.y, 11 + pulse * 3, 0, TAU); ctx.stroke();
            ctx.globalAlpha = 1; ctx.fillStyle = PALE;
            ctx.fillRect(g.x - 7, g.y - 3, g.kind === 'shotgun' ? 15 : 10, 3);     // barrel
            ctx.fillRect(g.x - 7, g.y - 3, 3, 8);                                  // grip
        });
    }

    // A person seen from above: shoulders, head, sunglasses and a gun arm.
    function drawFigure(ctx, e, r, coat, trim) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.face);
        ctx.fillStyle = coat; ctx.strokeStyle = trim; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(-1, 0, r * 0.62, r, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = trim;
        ctx.fillRect(r * 0.3, r * 0.45, r * 0.95, 3);
        ctx.beginPath(); ctx.arc(0, 0, r * 0.48, 0, TAU); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.fillRect(r * 0.12, -r * 0.4, 2.5, r * 0.8);
        ctx.restore();
    }

    // What an agent is about to do must be readable: a faint cone while it
    // is still unaware, a red laser that brightens as it takes aim.
    function drawIntent(s, ctx, a) {
        if (!s.alert) {
            ctx.fillStyle = 'rgba(0,255,65,0.07)';
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.arc(a.x, a.y, 150, a.face - 1, a.face + 1); ctx.fill();
        }
        if (a.wind <= 0) return;
        var k = G.clamp(a.wind / (a.k.wind * s.tune.wind), 0, 1), len = G.dist(a.x, a.y, s.p.x, s.p.y);
        ctx.strokeStyle = RED; ctx.lineWidth = (s.touch ? 3 : 1) + k * 1.5; ctx.globalAlpha = (s.touch ? 0.4 : 0.25) + 0.6 * k;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + Math.cos(a.face) * len, a.y + Math.sin(a.face) * len); ctx.stroke();
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 10 * (1 - k), 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawAgents(s, ctx) {
        s.agents.forEach(function (a) {
            drawIntent(s, ctx, a);
            // Reinforcements flicker in; a dodging agent blurs into a ghost.
            ctx.globalAlpha = a.spawn > 0 ? 0.25 + 0.3 * Math.sin(s.anim * 40) : (a.dodge > 0 ? 0.45 : 1);
            drawFigure(ctx, a, s.touch ? (a.kind === 's' ? 17 : 15) : (a.kind === 's' ? 13 : 11), '#02130a', a.k.color);
            ctx.globalAlpha = 1;
            if (a.flash > 0) {
                ctx.fillStyle = PALE;
                ctx.beginPath(); ctx.arc(a.x + Math.cos(a.face) * 16, a.y + Math.sin(a.face) * 16, 5, 0, TAU); ctx.fill();
            }
        });
    }

    // Tentacles trail behind the body and keep writhing in real time, the
    // visible sign that bullet time does not hold a sentinel.
    function drawDrone(s, ctx, d) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.atan2(s.p.y - d.y, s.p.x - d.x));
        ctx.globalAlpha = d.wake > 0 ? 0.35 + 0.25 * Math.sin(d.swim * 3) : 1;
        ctx.strokeStyle = s.touch ? GREEN : MID; ctx.lineWidth = s.touch ? 3 : 2;
        for (var i = -2; i <= 2; i++) {
            ctx.beginPath(); ctx.moveTo(-8, i * 4);
            ctx.quadraticCurveTo(-22, i * 7 + Math.sin(d.swim + i) * 6, -36, i * 9 + Math.sin(d.swim * 1.3 + i * 2) * 8);
            ctx.stroke();
        }
        ctx.fillStyle = '#0a160d'; ctx.strokeStyle = RED;
        ctx.beginPath(); ctx.arc(0, 0, s.touch ? 17 : d.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = RED;                      // one eye per hit it can still take
        for (i = 0; i < d.hp; i++) {
            ctx.beginPath(); ctx.arc(5, (i - (d.hp - 1) / 2) * 7, 2.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
    }

    // Each bullet drags a streak; in bullet time hostile rounds also leave
    // the rings of disturbed air that make their path easy to read.
    function drawBullets(s, ctx) {
        s.bullets.forEach(function (b) {
            var mine = b.own === s.p, tx = b.x - b.vx * 0.07, ty = b.y - b.vy * 0.07;
            ctx.strokeStyle = mine ? PALE : RED; ctx.lineWidth = s.touch ? 5 : 3; ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
            ctx.lineWidth = 1;
            for (var i = 1; !mine && s.ts < 0.6 && i <= 3; i++) {
                ctx.globalAlpha = 0.4 - i * 0.1;
                ctx.beginPath(); ctx.arc(G.lerp(b.x, tx, i / 3), G.lerp(b.y, ty, i / 3), 2 + i * 2, 0, TAU); ctx.stroke();
            }
            ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(b.x, b.y, s.touch ? (mine ? 4 : 6) : (mine ? 2.5 : 3.5), 0, TAU); ctx.fill();
        });
    }

    function drawPlayer(s, ctx) {
        var p = s.p;
        if (s.dead) return;
        ctx.strokeStyle = PALE; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
        ctx.setLineDash([4, 6]);                  // the aim line, also for keyboard players
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(s.aim) * 90, p.y + Math.sin(s.aim) * 90); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.shadowColor = PALE; ctx.shadowBlur = s.touch ? 0 : 12;
        drawFigure(ctx, { x: p.x, y: p.y, face: s.aim }, s.touch ? 15 : 10, '#0b0f0c', PALE);
        ctx.shadowBlur = 0;
        if (s.fireT <= 0) return;                 // a ring that closes as the gun cycles
        ctx.strokeStyle = GREEN; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - s.fireT / GUNS[s.gun].rate)); ctx.stroke();
    }

    // Touch only (s.lock is never set elsewhere): brackets around the
    // hostile the next round will go to. Hidden while there is no round.
    function drawLock(s, ctx) {
        var e = s.lock, r = 24 + 2 * Math.sin(s.anim * 8);
        if (!e || e.dead || s.dead || !(s.ammo.pistol + s.ammo.shotgun)) return;
        ctx.strokeStyle = PALE; ctx.lineWidth = 2.5;
        for (var i = 0; i < 4; i++) {
            ctx.beginPath(); ctx.arc(e.x, e.y, r, i * Math.PI / 2 + 0.35, (i + 1) * Math.PI / 2 - 0.35); ctx.stroke();
        }
    }

    function drawOverlay(s, ctx) {
        var slow = 1 - s.ts;
        if (slow > 0.05) {                        // the edges glow green while time hangs
            var g = ctx.createRadialGradient(G.W / 2, G.H / 2, 200, G.W / 2, G.H / 2, 580);
            g.addColorStop(0, 'rgba(0,255,65,0)');
            g.addColorStop(1, 'rgba(0,255,65,' + (slow * 0.2).toFixed(3) + ')');
            ctx.fillStyle = g;
            ctx.fillRect(0, G.HUD, G.W, G.H - G.HUD);
        }
        // Larger phone labels survive the full room shrinking to portrait width.
        // These stay in the solid border rows, clear of actors and bullets.
        var size = s.touch ? 30 : 20, gaugeX = s.touch ? 104 : 72;
        G.text('TIME', 12, G.H - 8, { size: size, color: s.touch ? GREEN : MID });
        ctx.fillStyle = DARK; ctx.fillRect(gaugeX, G.H - 23, 150, 15);
        ctx.fillStyle = s.ts > 0.5 ? PALE : GREEN; ctx.fillRect(gaugeX, G.H - 23, 150 * s.ts, 15);
        if (!s.alert) {
            G.text((s.touch ? 'TRACE ' : 'UNDETECTED · TRACE ') + Math.max(0, s.tune.trace - s.clock).toFixed(1), G.W - 12, G.H - 8, { size: size, color: s.touch ? GREEN : MID, align: 'right' });
        }
        if (s.msgT > 0) {
            ctx.globalAlpha = Math.min(1, s.msgT * 2);
            G.text(s.msg, G.W / 2, 54, { size: s.touch ? 30 : 20, color: PALE, align: 'center', glow: s.touch ? null : GREEN, max: s.touch ? G.W - 60 : undefined });
            ctx.globalAlpha = 1;
        }
    }

    function draw(s, ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, G.W, G.H);
        drawRain(s, ctx);
        drawWalls(s, ctx);
        drawCache(s, ctx);
        drawPickups(s, ctx);
        drawAgents(s, ctx);
        drawBullets(s, ctx);
        drawPlayer(s, ctx);
        s.drones.forEach(function (d) { drawDrone(s, ctx, d); });
        drawLock(s, ctx);
        drawOverlay(s, ctx);
    }

    function hud(s) {
        var other = s.gun === 'pistol' ? 'shotgun' : 'pistol';
        if (s.touch) return (s.gun === 'pistol' ? 'P' : 'S') + ':' + s.ammo[s.gun] + (s.ammo[other] ? ' ' + (other === 'pistol' ? 'P' : 'S') + ':' + s.ammo[other] : '') + '  FOES ' + hostiles(s);
        var guns = '[' + s.gun.toUpperCase() + ' ' + s.ammo[s.gun] + ']' + (s.ammo[other] ? ' ' + other.toUpperCase() + ' ' + s.ammo[other] : '');
        return guns + '  HOSTILES ' + hostiles(s);
    }

    // ------------------------------------------------------------------
    // The ending: the code rain slows to a halt and resolves into the
    // bullet-time tableau, the hero facing a frozen volley and the last
    // agent coming apart into glyphs
    // ------------------------------------------------------------------

    var RAIN_FAST = 420, RAIN_SLOW = 25, RAIN_STOP = 2.5;   // px/s, px/s, seconds to slow down

    // How far the rain has fallen after t seconds: it decelerates linearly
    // from RAIN_FAST and then drifts on at RAIN_SLOW.
    function rainFall(t) {
        var t1 = RAIN_STOP * (1 - RAIN_SLOW / RAIN_FAST), k = RAIN_FAST / (2 * RAIN_STOP);
        var u = Math.min(t, t1);
        return RAIN_FAST * u - k * u * u + RAIN_SLOW * Math.max(0, t - t1);
    }

    function drawEndRain(e, ctx) {
        var fall = rainFall(e.t);
        ctx.font = G.font(18);
        ctx.textAlign = 'center';
        ctx.fillStyle = e.t < RAIN_STOP ? GREEN : MID;
        for (var c = 0; c < COLS; c += 2) {
            var head = (fall * (0.7 + (c * 37) % 60 / 100) + c * 131) % (G.H + 140);
            for (var k = 0; k < 6; k++) {
                var row = Math.floor((head - k * 18) / 18);
                ctx.globalAlpha = (k === 0 ? 0.8 : 0.4) * (1 - k / 6);
                ctx.fillText(GLYPHS.charAt((c * 7 + row * 13 + 99) % GLYPHS.length), c * T + T / 2, row * 18);
            }
        }
        ctx.globalAlpha = 1;
    }

    // Left: the hero, a volley hanging in the air in front of him with
    // ripples round each round. Right: the last agent, deleted, its code
    // rising off it.
    function drawTableau(e, ctx) {
        var show = G.clamp((e.t - 1.2) / 1.5, 0, 1), i;
        if (!show) return;
        ctx.globalAlpha = show;
        drawFigure(ctx, { x: 150, y: 320, face: 0 }, 34, '#0b0f0c', PALE);
        ctx.strokeStyle = PALE; ctx.fillStyle = PALE; ctx.lineWidth = 2;
        for (i = 0; i < 5; i++) {
            var bx = 236 + i * 20, by = 320 + (i - 2) * 30, f = (e.t * 0.5 + i * 0.2) % 1;
            ctx.globalAlpha = show * 0.5;
            ctx.fillRect(bx + 8, by - 1, 34, 2);
            ctx.globalAlpha = show;
            ctx.beginPath(); ctx.arc(bx, by, 4, 0, TAU); ctx.fill();
            ctx.globalAlpha = show * (1 - f);
            ctx.beginPath(); ctx.arc(bx, by, 6 + f * 22, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = show * (0.45 + 0.25 * Math.sin(e.t * 9));
        drawFigure(ctx, { x: 810, y: 320, face: Math.PI }, 34, '#001a05', GREEN);
        ctx.font = G.font(20); ctx.textAlign = 'center'; ctx.fillStyle = GREEN;
        for (i = 0; i < 8; i++) {
            var rise = (e.t * 40 + i * 25) % 140;
            ctx.globalAlpha = show * (1 - rise / 140);
            ctx.fillText(GLYPHS.charAt((i * 5 + Math.floor(e.t * 6)) % GLYPHS.length), 786 + (i * 13) % 50, 330 - rise);
        }
        ctx.globalAlpha = 1;
    }

    function drawEnding(e, ctx) {
        drawEndRain(e, ctx);
        drawTableau(e, ctx);
    }

    G.register('matrix', {
        title: 'BULLET TIME',
        blurb: 'Time only moves when you do. Stand still, read the bullets, clear the room.',
        controls: [
            'WASD / arrows / pad: move — time runs only while you move or shoot',
            'Mouse: aim, click to shoot · SPACE: shoot the way you face (auto-aims)',
            'Touch: FIRE shoots the marked agent · tap another agent to shoot that one',
            'X / right click / GUN: switch gun · no ammo? run into an agent from behind'
        ],
        levelNames: ['Wake Up', 'Glass Office', 'The Lobby'],
        colors: { bg: '#000000', fg: GREEN, accent: GREEN, dim: MID },
        lives: 1,
        // A slow, dark pulse in E minor: sparse saw lead over a ticking arp.
        music: {
            bpm: 98, root: 40, scale: 'minor', prog: [0, 0, 5, 6, 0, 0, 3, 4],
            bass: 'x.....x...x..o..',
            lead: ['7.....4.....2...', '4...5...4.2.0...', '5.....7.....9...', '8...7...6.4.6...',
                '7.....4.....2...', '4...2...1.2.4...', '3.....5.....7...', '6---4---2---4...'],
            arp: '0.2.1.3.0.2.3.1.',
            drums: { k: 'x.....x...x.....', s: '....x.......x..x', h: '..x...x...x.x.x.' },
            leadWave: 'sawtooth', bassWave: 'sawtooth', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud, cursor: 'crosshair',
        // The whole pad: eight-way movement, and both buttons carry a gun control.
        touch: { a: 'FIRE', b: 'GUN' },
        ending: {
            title: 'YOU ARE THE ONE',
            text: 'The code stops. The world holds still, and waits for you.',
            colors: [GREEN, PALE, MID],
            draw: drawEnding
        }
    });
})();
