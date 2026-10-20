/*
 * Wrecking Ball — the brutalist theme's game.
 *
 * A crane drives along the ground with a ball on a chain. The ball is a real
 * pendulum: it only moves because the crane's pivot drags it, so the player
 * builds momentum by driving, braking hard (the ball whips forward) and
 * reeling the chain. Concrete structures stand on a grid with gravity: a
 * block stays up while something holds it from below, or while its row is
 * anchored on both sides (a lintel). Knock out the support and everything
 * above comes down and breaks. The crane cannot drive through a standing
 * wall, and a ball that is merely dragged along does no damage: only a real
 * swing counts. Demolish the target share before time is up (every missed
 * deadline costs a life and buys a short overtime), and keep the cab out
 * from under what falls.
 *
 * Three sites: two plain concrete stacks to learn the swing, an arcade of
 * lintels with rebar and glass, and the megastructure finale with charges,
 * wind and tremors.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var GROUND = 470, CW = 40, CH = 30, COLS = 24, ROWS = 13, PIVOT_Y = 62, BALL_R = 15;
    var GRAV = 900, L_MIN = 70, L_MAX = GROUND - BALL_R - PIVOT_Y - 2, REEL = 170, SUB = 4;
    var CAB_ACC = 620, CAB_MAX = 250, CAB_HALF = 30, CAB_H = 36, BLAST = 78, MARK = 68;
    // Debris is lethal while the cab's centre is within MARK / 2 + CAB_HALF of
    // its landing spot. Random debris keeps CLEAR (three such reaches) away
    // from the cab, which leaves a cab-wide gap beside a piece that lands on
    // the cab itself.
    var CLEAR = 3 * (MARK / 2 + CAB_HALF + 16), OVERTIME = 20;
    var CONC = 0, REBAR = 1, GLASS = 2, CHARGE = 3;
    var RED = '#ff2200';

    // Per block kind: hit points, the slowest ball impact that does anything
    // (minV), the damage every such impact adds on top (base), how much a
    // fall hurts (fall) and the score.
    var KINDS = [
        { hp: 1, minV: 80, base: 0, fall: 1, score: 10 },
        { hp: 1, minV: 280, base: 0.5, fall: 0, score: 40 },
        { hp: 0.2, minV: 20, base: 1, fall: 10, score: 60 },
        { hp: 1, minV: 60, base: 0, fall: 1, score: 25 }
    ];
    // Ball damage is (impact speed - minV) / HIT_SCALE + base; a landing does
    // (landing speed / FALL_SCALE) * fall.
    var HIT_SCALE = 200, FALL_SCALE = 600;
    // Timers are roughly twice what a practised player needs, and more
    // generous where rebar and fuses make a sloppy swing cost real time:
    // they should bind for a newcomer, not for someone who needs three tries
    // at a rebar stub. Running out costs a life and buys OVERTIME seconds, so
    // a slow first attempt is not thrown away at once, and doing nothing
    // still loses: the last life goes two overtimes after the deadline.
    // tremor is the pause between two tremors in seconds, [min, max].
    var LEVELS = [
        { time: 100, target: 0.6 }, { time: 150, target: 0.65 },
        { time: 180, target: 0.65, wind: true, tremor: [10, 13] }
    ];
    // A tremor announces itself TREMOR_WARN seconds ahead; the piece it
    // aims at the cab is lobbed higher (AIMED_VY) than the stray ones
    // (STRAY_VY), so there is well over a second to drive off its
    // mark even for a cab that was standing still.
    var TREMOR_WARN = 1.6, AIMED_VY = -380, STRAY_VY = -300;

    // ------------------------------------------------------------------
    // Structures: each builder writes block kinds into a ROWS x COLS grid
    // (row 0 stands on the ground). Everything must be held up at the start.
    // The crane starts on the left and cannot pass a standing wall, so every
    // structure is worked from its left face inward; rebar is placed where
    // it can be broken, cleared around or swung over.
    // ------------------------------------------------------------------

    function fill(g, c0, r0, w, h, kind) {
        for (var r = r0; r < r0 + h; r++) for (var c = c0; c < c0 + w; c++) g[r][c] = kind;
    }

    function buildStacks(g) { fill(g, 7, 0, 2, 7, CONC); fill(g, 11, 0, 1, 3, CONC); fill(g, 14, 0, 3, 8, CONC); }

    // Pillars with doorways between them: the slab above only holds while
    // both of its ends are still standing.
    function buildArcade(g) {
        for (var c = 5; c <= 19; c += 2) fill(g, c, 0, 1, 2, c === 19 ? REBAR : CONC);
        fill(g, 5, 2, 15, 1, CONC);
        for (c = 5; c <= 19; c++) fill(g, c, 3, 1, 2, (c - 5) % 2 === 1 ? GLASS : CONC);
        fill(g, 5, 5, 15, 1, CONC); fill(g, 9, 6, 7, 2, CONC); fill(g, 15, 6, 1, 2, REBAR);
    }

    // Podium on pillars, two towers with rebar in their cores and a glazed
    // skybridge that hangs between them.
    function buildMega(g) {
        for (var c = 6; c <= 19; c++) {
            if ((c - 6) % 2 === 0 || c === 19) fill(g, c, 0, 1, 2, (c === 12 || c === 19) ? REBAR : CONC);
        }
        fill(g, 6, 2, 14, 1, CONC);
        fill(g, 6, 3, 4, 9, CONC); fill(g, 8, 3, 1, 2, REBAR);
        fill(g, 16, 3, 4, 8, CONC); fill(g, 17, 3, 1, 2, REBAR);
        fill(g, 11, 3, 4, 2, CONC); fill(g, 10, 7, 6, 1, CONC); fill(g, 10, 8, 6, 1, GLASS);
        for (var r = 4; r < 11; r += 2) { g[r][7] = GLASS; g[r][18] = GLASS; }
        g[5][6] = CHARGE; g[6][19] = CHARGE; g[3][12] = CHARGE; g[11][9] = CHARGE;
    }

    var BUILD = [buildStacks, buildArcade, buildMega];

    function cellY(r) { return GROUND - (r + 1) * CH; }

    function buildGrid(level, rnd) {
        var kinds = [], grid = [], total = 0;
        for (var r = 0; r < ROWS; r++) { kinds.push(new Array(COLS).fill(null)); grid.push(new Array(COLS).fill(null)); }
        BUILD[level - 1](kinds);
        for (r = 0; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var k = kinds[r][c];
                if (k === null) continue;
                grid[r][c] = { c: c, r: r, kind: k, hp: KINDS[k].hp, y: cellY(r), vy: 0, loose: 0, fuse: 0, falling: false, dead: false, shade: rnd() };
                total++;
            }
        }
        return { grid: grid, total: total };
    }

    function buildSky(rnd) {
        var sky = [];
        for (var x = -20; x < G.W; x += 50 + rnd() * 70) {
            sky.push({ x: x, w: 50 + rnd() * 80, h: 60 + rnd() * 230, tone: rnd() < 0.5 ? '#151515' : '#1c1c1c' });
        }
        return sky;
    }

    function buildMotes(rnd, touch) {
        var motes = [];
        for (var i = 0; i < (touch ? 14 : 28); i++) motes.push({ x: rnd() * G.W, y: 40 + rnd() * 420, v: 8 + rnd() * 26, size: 2 + rnd() * 3 });
        return motes;
    }

    function init(level) {
        var rnd = G.rng(level * 7919 + 13), built = buildGrid(level, rnd), cfg = LEVELS[level - 1], touch = G.isTouch();
        return {
            touch: touch, cfg: cfg, grid: built.grid, total: built.total, gone: 0, need: Math.ceil(built.total * cfg.target),
            time: cfg.time, done: 0, dirty: false, combo: 0, comboT: 0,
            cab: { x: 70, vx: 0, inv: 0 }, L: 300, Ldot: 0, ball: { x: 70, y: PIVOT_Y + 300, vx: 0, vy: 0 },
            falling: [], loose: [], lit: [], chunks: [],
            wind: { f: 0, t: 0, next: 4 }, tremor: { next: 10, warn: false },
            cool: { tink: 0, thud: 0, engine: 0, reel: 0 },
            sky: buildSky(rnd), motes: buildMotes(rnd, touch)
        };
    }

    // ------------------------------------------------------------------
    // Sounds
    // ------------------------------------------------------------------

    // Landings and impacts come in bursts; the gate keeps a collapse from
    // turning into one long wall of noise.
    function thud(s, power) {
        if (s.cool.thud > 0) return;
        s.cool.thud = 0.05;
        G.noise(0.16 + power * 0.2, { freq: 520, slide: 60, vol: Math.min(0.5, 0.14 + power * 0.3) });
        G.tone(96, 0.2, { type: 'sine', slide: 38, vol: Math.min(0.45, 0.15 + power * 0.3) });
    }

    function clang(vol) {
        G.tone(1240, 0.22, { type: 'square', vol: vol * 0.6 });
        G.tone(1873, 0.3, { type: 'triangle', vol: vol });
    }

    function shatter() {
        G.noise(0.25, { filter: 'highpass', freq: 5200, vol: 0.2 });
        G.tone(2600, 0.14, { type: 'triangle', slide: 3900, vol: 0.08 });
    }

    // ------------------------------------------------------------------
    // Blocks: damage, destruction, explosions
    // ------------------------------------------------------------------

    function blockX(b) { return b.c * CW + CW / 2; }

    function eachBlock(s, fn) {
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if (s.grid[r][c]) fn(s.grid[r][c]);
        s.falling.forEach(fn);
    }

    // Lists (falling, loose, lit) drop dead blocks on their next pass, so a
    // block can be destroyed from anywhere without touching those arrays.
    function removeBlock(s, b) {
        b.dead = true;
        if (b.falling) return;
        s.grid[b.r][b.c] = null;
        s.dirty = true;
    }

    function rubble(b) {
        var x = blockX(b), y = b.y + CH / 2;
        if (b.kind === GLASS) {
            shatter();
            G.burst(x, y, { n: 12, color: '#ffffff', speed: 240, gravity: 700, size: 3, life: 0.6 });
            return;
        }
        G.burst(x, y, { n: 9, color: b.kind === REBAR ? '#5a5a5a' : '#a0a0a0', speed: 190, gravity: 600, size: 5, life: 0.7 });
        G.burst(x, y, { n: 5, color: b.kind === REBAR ? RED : '#606060', speed: 80, life: 0.9, size: 7, drag: 2 });
        if (b.kind === REBAR) clang(0.1);
    }

    // Blocks that go down in quick succession multiply their score, which is
    // what makes a clean collapse worth more than chipping away.
    function destroy(s, b) {
        if (b.dead) return;
        removeBlock(s, b);
        s.gone++;
        s.combo = s.comboT > 0 ? s.combo + 1 : 1;
        s.comboT = 1.2;
        G.addScore(KINDS[b.kind].score * Math.min(s.combo, 8));
        if (s.combo % 5 === 0) G.popup(blockX(b), b.y, 'x' + s.combo, RED);
        else if (b.kind === GLASS) G.popup(blockX(b), b.y, '+' + KINDS[GLASS].score, '#ffffff');
        if (b.kind === CHARGE) explode(s, b); else rubble(b);
    }

    // A block lost to something other than the player's demolition (it broke
    // on the cab, or a tremor threw it) leaves the job instead of counting
    // as progress; the target shrinks with it so the level stays winnable.
    function discard(s, b) {
        removeBlock(s, b);
        s.total--;
        s.need = Math.ceil(s.total * s.cfg.target);
        rubble(b);
    }

    function lightFuse(s, b, t) {
        if (b.fuse > 0) { b.fuse = Math.min(b.fuse, t); return; }
        b.fuse = t;
        s.lit.push(b);
        G.sfx('alarm');
        G.popup(blockX(b), b.y - 6, 'FUSE LIT', RED);
    }

    // Returns true when the block was destroyed. A charge never breaks: any
    // damage lights its fuse instead.
    function damage(s, b, amount) {
        if (b.dead || amount <= 0) return false;
        if (b.kind === CHARGE) { lightFuse(s, b, 1.6); return false; }
        b.hp -= amount;
        if (b.hp > 0) return false;
        destroy(s, b);
        return true;
    }

    function flightTime(y, vy) {
        return (-vy + Math.sqrt(vy * vy + 2 * GRAV * Math.max(0, GROUND - y))) / GRAV;
    }

    // Debris that can hit the cab, thrown from (x, y) at vy so that it lands
    // at tx; the ground shows a warning mark there while it is in the air.
    function addChunk(s, x, y, tx, vy) {
        s.chunks.push({ x: x, y: y, vx: (tx - x) / flightTime(y, vy), vy: vy, tx: tx, rot: 0, spin: G.rnd(-9, 9), size: 22 });
    }

    // Moves a landing spot out to at least CLEAR from the cab, on the side
    // it was already on unless that would put its mark off the site. All
    // random debris goes through this: it never comes down where the cab
    // stands, only where it might drive, and several pieces cannot close
    // every way out at once (with a wall on one side and the fence on the
    // other there would be nowhere left to dodge to).
    function awayFromCab(s, tx) {
        var d = tx - s.cab.x;
        if (Math.abs(d) >= CLEAR) return tx;
        var side = d < 0 ? -1 : 1, out = s.cab.x + side * CLEAR;
        return out < MARK / 2 || out > G.W - MARK / 2 ? s.cab.x - side * CLEAR : out;
    }

    function blastBall(s, x, y) {
        var b = s.ball, d = G.dist(x, y, b.x, b.y);
        if (d > 170 || d < 1) return;
        var kick = 460 * (1 - d / 170);
        b.vx += (b.x - x) / d * kick; b.vy += (b.y - y) / d * kick;
    }

    function explode(s, b) {
        var x = blockX(b), y = b.y + CH / 2;
        G.sfx('bigboom'); G.shake(14, 0.5); G.flash('#ffffff', 0.12);
        G.burst(x, y, { n: 26, color: RED, speed: 420, life: 0.7, size: 5, gravity: 300 });
        G.burst(x, y, { n: 14, color: '#ffffff', speed: 260, life: 0.5, size: 4 });
        eachBlock(s, function (o) {
            if (o.dead || G.dist(x, y, blockX(o), o.y + CH / 2) > BLAST) return;
            // A neighbouring charge goes off a moment later: a chain reaction.
            if (o.kind === CHARGE) lightFuse(s, o, 0.2); else damage(s, o, 2);
        });
        blastBall(s, x, y);
        if (Math.abs(s.cab.x - x) < 85 && y > GROUND - 150) hurtCab(s);
        // The blast itself is the danger of a charge; its debris is what
        // must not be driven into afterwards.
        for (var i = 0; i < 3; i++) addChunk(s, x, y, awayFromCab(s, x + G.rnd(-280, 280)), G.rnd(-520, -260));
    }

    // ------------------------------------------------------------------
    // Structural gravity
    // ------------------------------------------------------------------

    function firm(b) { return !!b && b.loose <= 0; }

    // Higher blocks let go a little later, so a column comes down as a
    // ripple and every block lands (and breaks) on its own.
    function loosen(s, b) {
        b.loose = 0.1 + 0.03 * b.r;
        s.loose.push(b);
    }

    // Within a run of touching blocks, everything between the first and the
    // last block that stands on something is held (a beam on two supports).
    // Whatever sticks out past them is a cantilever and lets go.
    function settleRow(s, r, below) {
        var row = s.grid[r], held = [], c = 0;
        while (c < COLS) {
            if (!firm(row[c])) { c++; continue; }
            var start = c, first = -1, last = -1;
            for (; c < COLS && firm(row[c]); c++) {
                if (below && !below[c]) continue;
                if (first < 0) first = c;
                last = c;
            }
            for (var i = start; i < c; i++) {
                if (first >= 0 && i >= first && i <= last) held[i] = true; else loosen(s, row[i]);
            }
        }
        return held;
    }

    function settle(s) {
        var below = null;
        s.dirty = false;
        for (var r = 0; r < ROWS; r++) below = settleRow(s, r, below);
    }

    function updateLoose(s, dt) {
        s.loose = s.loose.filter(function (b) {
            if (b.dead) return false;
            b.loose -= dt;
            if (b.loose > 0) return true;
            s.grid[b.r][b.c] = null;
            b.loose = 0; b.falling = true; b.vy = 0;
            s.falling.push(b);
            return false;
        });
    }

    // The row a falling block will come to rest in: one above the highest
    // block that is still below its feet.
    function landingRow(s, b) {
        var feet = b.y + CH;
        for (var r = ROWS - 1; r >= 0; r--) {
            if (s.grid[r][b.c] && cellY(r) >= feet - CH / 2) return r + 1;
        }
        return 0;
    }

    function land(s, b, row) {
        var v = b.vy, dmg = v / FALL_SCALE, under = row > 0 ? s.grid[row - 1][b.c] : null;
        b.falling = false; b.r = row; b.y = cellY(row); b.vy = 0;
        s.grid[row][b.c] = b;
        s.dirty = true;
        if (v < 60) return;
        thud(s, v / 600);
        G.burst(blockX(b), b.y + CH, { n: 5, color: '#707070', speed: 110, angle: -Math.PI / 2, spread: Math.PI, life: 0.5, size: 4 });
        // The block that is landed on takes part of the blow as well.
        if (under) damage(s, under, dmg * 0.4 * KINDS[under.kind].fall);
        damage(s, b, dmg * KINDS[b.kind].fall);
    }

    function hitsCab(s, x, y, w, h) {
        return x < s.cab.x + CAB_HALF && x + w > s.cab.x - CAB_HALF && y + h > GROUND - CAB_H && y < GROUND;
    }

    // After a hit the cab is safe for two seconds, and it cannot be hurt
    // once the target is reached, so the final collapse can be enjoyed.
    function hurtCab(s) {
        if (s.cab.inv > 0 || s.done > 0) return;
        s.cab.inv = 2;
        G.flash(RED, 0.2);
        G.burst(s.cab.x, GROUND - 24, { n: 18, color: '#ffffff', speed: 240, gravity: 500 });
        G.loseLife();
    }

    // A slab only hurts once it has really dropped (about 20 px): a block
    // that lets go right beside the cab must not hit before it has moved.
    function crushes(s, b) {
        return b.vy > 190 && hitsCab(s, b.c * CW, b.y, CW, CH);
    }

    function updateFalling(s, dt) {
        s.falling = s.falling.filter(function (b) {
            if (b.dead) return false;
            b.vy += GRAV * dt; b.y += b.vy * dt;
            if (crushes(s, b)) {
                if (b.kind === CHARGE) destroy(s, b); else discard(s, b);
                hurtCab(s);
                return false;
            }
            var row = landingRow(s, b);
            if (b.y < cellY(row)) return true;
            land(s, b, row);
            return false;
        });
    }

    // An explosion can light further fuses, so the list is swapped out
    // before it is walked and survivors are pushed onto the new one.
    function updateFuses(s, dt) {
        var lit = s.lit;
        s.lit = [];
        lit.forEach(function (b) {
            if (b.dead) return;
            var before = b.fuse;
            b.fuse -= dt;
            if (Math.floor(before * 6) !== Math.floor(b.fuse * 6)) G.tone(1500, 0.03, { vol: 0.08 });
            if (b.fuse > 0) s.lit.push(b); else destroy(s, b);
        });
    }

    // Debris only hurts on its way down and only while all of it is over
    // its landing mark (MARK wide), so the red mark on the ground is exactly
    // the place to keep the cab off.
    function updateChunks(s, dt) {
        s.chunks = s.chunks.filter(function (k) {
            k.vy += GRAV * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.spin * dt;
            var over = k.vy > 0 && Math.abs(k.x - k.tx) <= (MARK - k.size) / 2;
            var hit = over && hitsCab(s, k.x - k.size / 2, k.y - k.size / 2, k.size, k.size);
            if (!hit && k.y < GROUND - k.size / 2) return true;
            if (hit) hurtCab(s);
            thud(s, 0.3);
            G.burst(k.x, GROUND - 6, { n: 8, color: '#8a8a8a', speed: 160, angle: -Math.PI / 2, spread: Math.PI, gravity: 500, size: 4 });
            return false;
        });
    }

    // ------------------------------------------------------------------
    // Crane and ball
    // ------------------------------------------------------------------

    function approach(v, target, step) {
        return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
    }

    // SPACE is a hard brake: the cab stops dead and the ball keeps going,
    // which is the quickest way to throw it at a wall.
    function driveCab(s, dt) {
        var cab = s.cab, dir = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        if (G.key.a) {
            if (G.hit.a && Math.abs(cab.vx) > 90) G.noise(0.22, { filter: 'bandpass', freq: 2400, slide: 900, q: 6, vol: 0.12 });
            cab.vx = approach(cab.vx, 0, 1800 * dt);
        } else if (dir) {
            cab.vx = G.clamp(cab.vx + dir * CAB_ACC * dt, -CAB_MAX, CAB_MAX);
        } else {
            cab.vx = approach(cab.vx, 0, 420 * dt);
        }
        if (Math.abs(cab.vx) > 20 && s.cool.engine <= 0) {
            s.cool.engine = 0.13;
            G.noise(0.14, { freq: 140 + Math.abs(cab.vx) * 0.8, vol: 0.07 });
        }
    }

    function reelChain(s, dt) {
        var dir = (G.key.down ? 1 : 0) - (G.key.up ? 1 : 0), old = s.L;
        s.L = G.clamp(old + dir * REEL * dt, L_MIN, L_MAX);
        s.Ldot = (s.L - old) / dt;
        if (s.Ldot && s.cool.reel <= 0) {
            s.cool.reel = 0.07;
            G.tone(dir > 0 ? 420 : 560, 0.02, { vol: 0.05 });
        }
    }

    function collapsing(s, c) {
        function inColumn(b) { return b.c === c && !b.dead; }
        return s.loose.some(inColumn) || s.falling.some(inColumn);
    }

    // A column with blocks in both of its two lowest rows is a wall the
    // tracks cannot climb; a single block of rubble is driven past. A column
    // that is coming down is barred as well: when the ball knocks out the
    // wall the cab is pushing against, the cab must not lurch under the
    // collapse before the player can let go of the key.
    function walled(s, c) {
        if (c < 0 || c >= COLS) return false;
        return (!!s.grid[0][c] && !!s.grid[1][c]) || collapsing(s, c);
    }

    // Moves the cab by dx, stopping at the site edge or at the first wall
    // its leading edge would enter. Returns true when it was stopped. A cab
    // that already stands inside a walled column (rubble settled around it)
    // can still drive out.
    function shiftCab(s, dx) {
        var cab = s.cab, dir = dx > 0 ? 1 : -1, edge = cab.x + dir * CAB_HALF;
        var want = cab.x + dx, to = G.clamp(want, 40, G.W - 40) + dir * CAB_HALF;
        var stopped = to !== want + dir * CAB_HALF;
        for (var c = Math.floor(edge / CW) + dir; dir > 0 ? c * CW < to : (c + 1) * CW > to; c += dir) {
            if (!walled(s, c)) continue;
            to = dir > 0 ? c * CW - 0.01 : (c + 1) * CW + 0.01;
            stopped = true;
            break;
        }
        cab.x = to - dir * CAB_HALF;
        return stopped;
    }

    function moveCab(s, h) {
        if (s.cab.vx && shiftCab(s, s.cab.vx * h)) s.cab.vx = 0;
    }

    // The chain is a rope, not a rod: it only acts when taut. It then takes
    // away the ball's velocity away from the pivot (relative to the moving
    // crane), which is what drags the ball along and makes it swing.
    function rope(s, h) {
        var b = s.ball, cab = s.cab, dx = b.x - cab.x, dy = b.y - PIVOT_Y, d = Math.hypot(dx, dy);
        if (d <= s.L || d < 1) return;
        var nx = dx / d, ny = dy / d, rvx = b.vx - cab.vx, rvy = b.vy;
        // Pull back at a limited rate so a snagged ball is not teleported
        // through the wall that holds it.
        var pull = Math.min(d - s.L, 5);
        b.x -= nx * pull; b.y -= ny * pull;
        var vn = rvx * nx + rvy * ny;
        if (vn > s.Ldot) { rvx -= nx * (vn - s.Ldot); rvy -= ny * (vn - s.Ldot); vn = s.Ldot; }
        // Reeling in a swinging ball speeds it up (angular momentum).
        var k = 1 - s.Ldot * h / s.L;
        b.vx = cab.vx + nx * vn + (rvx - nx * vn) * k;
        b.vy = ny * vn + (rvy - ny * vn) * k;
    }

    // A ball caught on a structure holds the crane back: the chain can
    // stretch 30 px and no further. If the crane cannot give way either (a
    // wall, or the ball hangs too low), the winch slips and pays out chain.
    function snag(s) {
        var b = s.ball, cab = s.cab, dx = b.x - cab.x, dy = b.y - PIVOT_Y, max = s.L + 30;
        if (dx * dx + dy * dy <= max * max) return;
        if (Math.abs(dy) < max) {
            var reach = Math.sqrt(max * max - dy * dy);
            if (cab.vx * dx < 0) cab.vx = 0;
            shiftCab(s, b.x - (dx > 0 ? reach : -reach) - cab.x);
        }
        var d = Math.hypot(b.x - cab.x, dy);
        if (d > s.L + 30.5) s.L = G.clamp(d - 30, L_MIN, L_MAX);
    }

    // What the ball does to a block it hits at speed v. Returns true when
    // the block broke.
    function strike(s, blk, v) {
        var K = KINDS[blk.kind];
        if (v < K.minV) {
            if (v > 40 && s.cool.tink <= 0) {
                s.cool.tink = 0.25;
                if (blk.kind === REBAR && v > 150) { clang(0.07); G.popup(blockX(blk), blk.y, 'HIT HARDER', '#c8c8c8'); }
                else G.tone(620, 0.04, { type: 'triangle', vol: 0.07 });
            }
            return false;
        }
        thud(s, v / 500);
        G.shake(Math.min(7, v / 90), 0.12);
        if (blk.kind === REBAR) {
            clang(0.12);
            G.burst(s.ball.x, s.ball.y, { n: 8, color: RED, speed: 260, life: 0.3, size: 3 });
        }
        return damage(s, blk, (v - K.minV) / HIT_SCALE + K.base);
    }

    // Unit vector from the block's surface to the ball's centre, and how far
    // apart they are. A ball whose centre is inside the block is pushed out
    // through the nearer pair of faces.
    function contact(b, rx, ry) {
        var dx = b.x - G.clamp(b.x, rx, rx + CW), dy = b.y - G.clamp(b.y, ry, ry + CH), d = Math.hypot(dx, dy);
        if (d > 0.001) return { x: dx / d, y: dy / d, d: d };
        var ox = b.x - (rx + CW / 2), oy = b.y - (ry + CH / 2);
        if (Math.abs(ox) / CW > Math.abs(oy) / CH) return { x: ox < 0 ? -1 : 1, y: 0, d: 0 };
        return { x: 0, y: oy < 0 ? -1 : 1, d: 0 };
    }

    function hitBlock(s, blk, rx, ry) {
        var b = s.ball;
        if (blk.dead || !G.circRect(b.x, b.y, BALL_R, rx, ry, CW, CH)) return;
        var n = contact(b, rx, ry), vn = b.vx * n.x + b.vy * n.y;
        b.x += n.x * (BALL_R - n.d); b.y += n.y * (BALL_R - n.d);
        if (vn >= 0) return;
        // Only swing counts: the impact is the slower of the ball's speed
        // over the ground and its speed relative to the crane, so a ball
        // that is just dragged into a wall by driving does nothing.
        var swing = -(vn - s.cab.vx * n.x), impact = Math.min(-vn, swing);
        // A block that breaks costs the ball nearly half its speed, so one
        // swing ploughs through two blocks at most; one that holds bounces
        // it back.
        if (impact > 0 && strike(s, blk, impact)) { b.vx *= 0.55; b.vy *= 0.55; return; }
        b.vx -= 1.35 * vn * n.x; b.vy -= 1.35 * vn * n.y;
    }

    function collideBlocks(s) {
        var b = s.ball;
        var c0 = Math.max(0, Math.floor((b.x - BALL_R) / CW)), c1 = Math.min(COLS - 1, Math.floor((b.x + BALL_R) / CW));
        var r0 = Math.max(0, Math.floor((GROUND - b.y - BALL_R) / CH)), r1 = Math.min(ROWS - 1, Math.floor((GROUND - b.y + BALL_R) / CH));
        for (var r = r0; r <= r1; r++) {
            for (var c = c0; c <= c1; c++) if (s.grid[r][c]) hitBlock(s, s.grid[r][c], c * CW, cellY(r));
        }
        for (var i = 0; i < s.falling.length; i++) hitBlock(s, s.falling[i], s.falling[i].c * CW, s.falling[i].y);
    }

    function stepBall(s, h) {
        var b = s.ball;
        moveCab(s, h);
        b.vy += GRAV * h; b.vx += s.wind.f * h;
        b.vx -= b.vx * 0.12 * h; b.vy -= b.vy * 0.12 * h;
        b.x += b.vx * h; b.y += b.vy * h;
        rope(s, h);
        collideBlocks(s);
        snag(s);
        if (b.y < G.HUD + BALL_R) { b.y = G.HUD + BALL_R; b.vy = Math.abs(b.vy) * 0.4; }
        if (b.y > GROUND - BALL_R) { b.y = GROUND - BALL_R; b.vy = -Math.abs(b.vy) * 0.3; }
        // The site fence keeps the ball on screen.
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x > G.W - BALL_R) { b.x = G.W - BALL_R; b.vx = -Math.abs(b.vx) * 0.5; }
    }

    // ------------------------------------------------------------------
    // Hazards of the finale
    // ------------------------------------------------------------------

    // Gusts push the ball sideways for a few seconds; a gust can ruin a
    // swing or, timed well, feed it.
    function updateWind(s, dt) {
        var w = s.wind;
        if (w.t > 0) {
            w.t -= dt;
            if (w.t <= 0) w.f = 0;
            return;
        }
        w.next -= dt;
        if (w.next > 0) return;
        w.f = G.pick([-1, 1]) * 230; w.t = 2.6; w.next = G.rnd(4, 7);
        G.noise(2.4, { filter: 'bandpass', freq: 500, slide: 1400, q: 2, vol: 0.14, attack: 0.6 });
    }

    // Roof blocks a tremor may throw. Only blocks from the fourth floor up
    // qualify: thrown from there, debris clears the cab by a wide margin on
    // the way out and can be seen coming.
    function topBlocks(s) {
        var tops = [];
        for (var c = 0; c < COLS; c++) {
            for (var r = ROWS - 1; r >= 3; r--) {
                var b = s.grid[r][c];
                if (!b) continue;
                if (firm(b) && b.kind !== CHARGE) tops.push(b);
                break;
            }
        }
        return tops;
    }

    // A tremor shakes roof blocks loose. The first is thrown at where the
    // cab stands right now, so standing still after the warning is what
    // gets punished; the others land at random, but far enough from the cab
    // that there is room to drive out from under the first one.
    function quake(s) {
        var tops = topBlocks(s), n = Math.min(tops.length, 2);
        G.shake(12, 0.5); G.sfx('boom');
        for (var i = 0; i < n; i++) {
            var b = tops.splice(Math.floor(G.rnd(0, tops.length)), 1)[0];
            var x = blockX(b), y = b.y + CH / 2;
            var tx = i === 0 ? s.cab.x : awayFromCab(s, G.rnd(60, G.W - 60));
            discard(s, b);
            addChunk(s, x, y, tx, i === 0 ? AIMED_VY : STRAY_VY);
        }
    }

    function updateTremor(s, dt) {
        var t = s.tremor;
        t.next -= dt;
        if (t.next < TREMOR_WARN && !t.warn) {
            t.warn = true;
            G.noise(TREMOR_WARN, { freq: 90, slide: 240, vol: 0.3, attack: 0.5 });
        }
        if (t.warn) G.shake(2.5, 0.1);
        if (t.next > 0) return;
        quake(s);
        t.next = G.rnd(s.cfg.tremor[0], s.cfg.tremor[1]); t.warn = false;
    }

    function updateMotes(s, dt) {
        s.motes.forEach(function (m) {
            m.x += (m.v + s.wind.f * 0.6) * dt;
            if (m.x > G.W + 5) m.x = -5;
            if (m.x < -5) m.x = G.W + 5;
        });
    }

    // ------------------------------------------------------------------
    // Update
    // ------------------------------------------------------------------

    function checkEnd(s, dt) {
        if (s.done > 0) {
            s.done -= dt;
            if (s.done <= 0) G.win(Math.ceil(s.time) * 10 + G.lives * 200);
            return;
        }
        if (s.gone >= s.need) {
            // A short pause lets the last collapse play out before the banner.
            s.done = 1.2;
            G.flash('#ffffff', 0.15);
            G.popup(G.W / 2, 200, 'TARGET DEMOLISHED', '#ffffff');
            return;
        }
        var before = s.time;
        s.time -= dt;
        if (s.time <= 10 && Math.ceil(before) !== Math.ceil(s.time)) G.sfx('alarm');
        if (s.time <= 0) overtime(s);
    }

    // A missed deadline costs a life like a hit on the cab does, and the
    // job goes on for OVERTIME seconds. With the last life the engine ends
    // the run, so an idle player is out two overtimes after the deadline.
    function overtime(s) {
        if (G.loseLife() <= 0) return;
        s.time = OVERTIME;
        G.flash(RED, 0.2);
        G.popup(G.W / 2, 200, 'DEADLINE MISSED — OVERTIME', RED);
    }

    function tickTimers(s, dt) {
        for (var k in s.cool) if (s.cool[k] > 0) s.cool[k] -= dt;
        if (s.comboT > 0) s.comboT -= dt;
        if (s.cab.inv > 0) s.cab.inv -= dt;
    }

    function update(s, dt) {
        tickTimers(s, dt);
        driveCab(s, dt);
        reelChain(s, dt);
        // Sub-steps keep a fast ball from skipping through a 30 px block.
        for (var i = 0; i < SUB; i++) stepBall(s, dt / SUB);
        if (s.dirty) settle(s);
        updateLoose(s, dt);
        updateFalling(s, dt);
        updateFuses(s, dt);
        updateChunks(s, dt);
        if (s.cfg.wind) updateWind(s, dt);
        if (s.cfg.tremor) updateTremor(s, dt);
        updateMotes(s, dt);
        checkEnd(s, dt);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    function drawSky(s, ctx) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, G.W, G.H);
        s.sky.forEach(function (b) {
            ctx.fillStyle = b.tone;
            ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
        });
        // Smog that slowly breathes: also keeps the picture alive while the
        // ball hangs still.
        ctx.fillStyle = 'rgba(255,255,255,' + (0.045 + 0.03 * Math.sin(G.t * 2.2)) + ')';
        ctx.fillRect(0, 230, G.W, GROUND - 230);
        ctx.fillStyle = '#5a5a5a';
        s.motes.forEach(function (m) { ctx.fillRect(m.x, m.y + Math.sin(G.t + m.x * 0.02) * 6, m.size, m.size); });
    }

    function drawBar(ctx, x, w, part, color, label, touch) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, 508, w, 16);
        ctx.fillStyle = color;
        ctx.fillRect(x, 508, w * G.clamp(part, 0, 1), 16);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.strokeRect(x, 508, w, 16);
        // Short phone labels stay readable without squeezing the text to fit.
        G.text(label, x, 502, { size: touch ? 28 : 20, color: '#c8c8c8', max: w });
    }

    function drawGround(s, ctx) {
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, GROUND, G.W, G.H - GROUND);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, GROUND, G.W, 4);
        var low = s.time <= 10 && Math.floor(G.t * 4) % 2 === 0;
        var progress = Math.floor(s.gone / s.total * 100) + '% / ' + Math.round(s.cfg.target * 100) + '%';
        drawBar(ctx, 20, 600, s.gone / s.total, RED, s.touch ? 'DEMOLISH ' + progress : 'DEMOLISHED ' + progress.replace(' / ', '  —  TARGET '), s.touch);
        drawBar(ctx, 660, 280, s.time / s.cfg.time, low ? RED : '#ffffff', 'TIME ' + Math.max(0, Math.ceil(s.time)), s.touch);
        // The mark the red bar has to reach.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(20 + 600 * s.need / s.total - 2, 503, 4, 26);
    }

    function drawCracks(ctx, b, x, y, touch) {
        var part = b.hp / KINDS[b.kind].hp, n = touch ? 1 : (part < 0.4 ? 3 : (part < 0.75 ? 2 : 1)), sx = x + 7 + b.shade * 14;
        ctx.strokeStyle = '#000000'; ctx.lineWidth = touch ? 3 : 1.5;
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
            ctx.moveTo(sx + i * 9, y + 2); ctx.lineTo(sx + i * 9 - 5, y + CH * 0.45); ctx.lineTo(sx + i * 9 + 4, y + CH - 2);
        }
        ctx.stroke();
    }

    function drawConcrete(ctx, b, x, y, touch) {
        var rebar = b.kind === REBAR, g = rebar ? 70 + Math.floor(b.shade * 20) : 128 + Math.floor(b.shade * 56);
        ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
        ctx.fillRect(x, y, CW, CH);
        // Board-marked concrete: a light top edge and a shadowed bottom.
        // At phone scale board texture disappears; keep the block silhouette.
        if (!touch) {
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(x, y, CW, 3);
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(x, y + CH - 5, CW, 5);
        }
        if (rebar) {
            ctx.fillStyle = RED;
            for (var i = 0; i < 3; i++) ctx.fillRect(x + 8 + i * 11, y + 3, 3, CH - 6);
        }
        // One thick phone crack preserves damage feedback without fine detail.
        if (b.hp < KINDS[b.kind].hp) drawCracks(ctx, b, x, y, touch);
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CW - 2, CH - 2);
    }

    function drawGlass(ctx, x, y) {
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(x + 2, y + 2, CW - 4, CH - 4);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, CW - 4, CH - 4);
        ctx.beginPath();
        ctx.moveTo(x + 8, y + CH - 8); ctx.lineTo(x + 20, y + 7);
        ctx.moveTo(x + 17, y + CH - 8); ctx.lineTo(x + 25, y + 12);
        ctx.stroke();
    }

    function drawCharge(ctx, b, x, y, touch) {
        var lit = b.fuse > 0, blink = lit && Math.floor(b.fuse * 10) % 2 === 0;
        ctx.fillStyle = blink ? '#ffffff' : RED;
        ctx.fillRect(x, y, CW, CH);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y + 4, CW, 3); ctx.fillRect(x, y + CH - 7, CW, 3);
        // A large warning glyph survives phone scaling; the flashing fuse still
        // signals the short delay before detonation.
        G.text(touch ? '!' : (lit ? b.fuse.toFixed(1) : 'TNT'), x + CW / 2, y + (touch ? 24 : 20), { size: touch ? 26 : 13, bold: true, color: '#000000', align: 'center' });
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CW - 2, CH - 2);
    }

    function drawBlock(ctx, b, touch) {
        // A block about to fall shivers first: the warning to get clear.
        var x = b.c * CW + (b.loose > 0 ? G.rnd(-1.5, 1.5) : 0), y = b.y;
        if (b.dead) return;
        if (b.kind === GLASS) drawGlass(ctx, x, y);
        else if (b.kind === CHARGE) drawCharge(ctx, b, x, y, touch);
        else drawConcrete(ctx, b, x, y, touch);
    }

    function drawChunks(s, ctx) {
        s.chunks.forEach(function (k) {
            // Landing mark on the ground.
            ctx.fillStyle = RED;
            ctx.fillRect(k.tx - MARK / 2, GROUND + 6, MARK, s.touch ? 9 : 5);
            ctx.save();
            ctx.translate(k.x, k.y); ctx.rotate(k.rot);
            ctx.fillStyle = '#9a9a9a';
            ctx.fillRect(-k.size / 2, -k.size / 2, k.size, k.size);
            ctx.strokeStyle = '#000000'; ctx.lineWidth = 2;
            ctx.strokeRect(-k.size / 2, -k.size / 2, k.size, k.size);
            ctx.restore();
        });
    }

    function drawMast(s, ctx) {
        var x = s.cab.x, top = PIVOT_Y - 8, foot = GROUND - CAB_H;
        ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 7, foot); ctx.lineTo(x - 7, top);
        ctx.moveTo(x + 7, foot); ctx.lineTo(x + 7, top);
        for (var y = foot, side = 1; y > top + 26; y -= 26, side = -side) {
            ctx.moveTo(x - 7 * side, y); ctx.lineTo(x + 7 * side, y - 26);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 16, top - 4, 32, 8);
        // Warning beacon on the mast head.
        ctx.fillStyle = Math.floor(G.t * 3) % 2 === 0 ? RED : '#551100';
        ctx.fillRect(x - 4, top - 12, 8, 8);
    }

    function drawCab(s, ctx) {
        var x = s.cab.x;
        // Blinks while it is invulnerable after a hit.
        if (s.cab.inv > 0 && Math.floor(s.cab.inv * 12) % 2 === 0) return;
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(x - 34, GROUND - 13, 68, 15);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.strokeRect(x - 34, GROUND - 13, 68, 15);
        ctx.fillStyle = '#ffffff';
        for (var i = 0; i < 6; i++) {
            // Track links crawl with the cab so driving reads at a glance.
            var lx = ((i * 12 + x * 0.6) % 66 + 66) % 66;
            ctx.fillRect(x - 33 + lx, GROUND - 2, 4, 3);
        }
        ctx.fillRect(x - 26, GROUND - CAB_H, 52, 22);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 4, GROUND - CAB_H + 4, 18, 11);
        ctx.fillStyle = RED;
        ctx.fillRect(x - 26, GROUND - 19, 52, 5);
    }

    function drawBall(s, ctx) {
        var b = s.ball, speed = Math.hypot(b.vx, b.vy);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.setLineDash([7, 4]);
        ctx.beginPath(); ctx.moveTo(s.cab.x, PIVOT_Y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#2c2c2c';
        ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
        // The rim turns red once the ball is fast enough to crack rebar.
        ctx.strokeStyle = speed >= KINDS[REBAR].minV ? RED : '#ffffff';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R - 6, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    }

    function drawWind(s, ctx) {
        var f = s.wind.f;
        if (!f) return;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (var i = 0; i < 12; i++) {
            var x = ((i * 137 + G.t * f * 2.4) % G.W + G.W) % G.W, y = 70 + i * 31;
            ctx.moveTo(x, y); ctx.lineTo(x - (f > 0 ? 46 : -46), y);
        }
        ctx.stroke();
        G.text(f > 0 ? 'WIND >>>' : '<<< WIND', G.W / 2, s.touch ? 64 : 54, { size: s.touch ? 28 : 20, bold: true, color: '#ffffff', align: 'center' });
    }

    function drawNotes(s, ctx) {
        if (s.tremor.warn && Math.floor(G.t * 8) % 2 === 0) {
            G.text('TREMOR — KEEP MOVING', G.W / 2, s.touch ? 98 : 78, { size: s.touch ? 28 : 20, bold: true, color: RED, align: 'center' });
        }
        if (G.level === 1 && G.t < 9) {
            var hint = s.touch ? 'DRIVE → BRAKE → HIT THE BASE' : 'DRIVE TO SWING THE BALL · BRAKE TO WHIP IT · HIT THE BOTTOM ROW';
            G.text(hint, G.W / 2, s.touch ? 64 : 54, { size: s.touch ? 28 : 20, color: '#c8c8c8', align: 'center', max: G.W - 40 });
            if (s.touch) G.text('↑ SHORTEN · ↓ LENGTHEN CHAIN', G.W / 2, 98, { size: 28, color: '#c8c8c8', align: 'center' });
        }
    }

    function draw(s, ctx) {
        drawSky(s, ctx);
        drawGround(s, ctx);
        eachBlock(s, function (b) { drawBlock(ctx, b, s.touch); });
        drawChunks(s, ctx);
        drawMast(s, ctx);
        drawCab(s, ctx);
        drawBall(s, ctx);
        drawWind(s, ctx);
        drawNotes(s, ctx);
    }

    function hud(s) {
        return 'DEMO ' + Math.floor(s.gone / s.total * 100) + '/' + Math.round(s.cfg.target * 100) + '%  T ' + Math.max(0, Math.ceil(s.time));
    }

    // ------------------------------------------------------------------
    // The ending: a controlled demolition, over and over
    // ------------------------------------------------------------------

    // Two towers flank the buttons. Each cycle they rise, their charges
    // blink, the base blows and the floors drop into the ground one after
    // another while dust and coloured smoke billow up. Everything follows
    // from e.t, so the scene keeps no state.
    var END_CYCLE = 7, END_RISE = 0.8, END_BLAST = 1.8, END_FLOORS = 10, END_BW = 24, END_BH = 20;
    var END_TOWERS = [120, 840], END_PUFFS = ['#9a9a9a', RED, '#ffffff', '#ffd166', '#c8c8c8', RED];

    function drawEndTower(ctx, x0, t) {
        var built = Math.min(END_FLOORS, Math.floor(t / END_RISE * END_FLOORS)), fall = t - END_BLAST;
        for (var r = 0; r < built; r++) {
            // Floors let go from the bottom up, each a moment after the one below.
            var ft = fall - r * 0.06, drop = ft > 0 ? 450 * ft * ft : 0, top = GROUND - (r + 1) * END_BH + drop;
            if (top >= GROUND - 2) continue;
            for (var c = 0; c < 4; c++) {
                var g = 120 + ((r * 7 + c * 3) % 5) * 14;
                ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
                ctx.fillRect(x0 - 2 * END_BW + c * END_BW, top, END_BW - 2, Math.min(END_BH - 2, GROUND - top));
            }
        }
        // The charges on the ground floor blink before the blast.
        if (t > END_RISE && t < END_BLAST && Math.floor(t * 8) % 2 === 0) {
            ctx.fillStyle = RED;
            ctx.fillRect(x0 - 2 * END_BW + 4, GROUND - END_BH + 4, 10, 10);
            ctx.fillRect(x0 + END_BW + 6, GROUND - END_BH + 4, 10, 10);
        }
    }

    function drawEndDust(ctx, x0, t, side) {
        var age = t - END_BLAST;
        if (age <= 0) return;
        for (var i = 0; i < END_PUFFS.length; i++) {
            var a = age - i * 0.12;
            if (a <= 0) continue;
            ctx.globalAlpha = Math.max(0, 0.4 * (1 - a / 3.6));
            ctx.fillStyle = END_PUFFS[i];
            ctx.beginPath();
            ctx.arc(x0 + side * (i - 2.5) * 22 * (1 + a), GROUND - 20 - a * (30 + i * 12), 14 + a * 34, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawEnding(e, ctx) {
        var t = e.t % END_CYCLE;
        END_TOWERS.forEach(function (x0, i) {
            drawEndTower(ctx, x0, t);
            drawEndDust(ctx, x0, t, i ? -1 : 1);
        });
    }

    G.register('brutalist', {
        title: 'WRECKING BALL',
        blurb: 'Swing the ball, knock out the support, bring the concrete down before time runs out.',
        controls: [
            '← → drive the crane: the ball swings by its own momentum',
            '↑ ↓ reel the chain in / out · SPACE / BRAKE hard brake, whips the ball forward',
            'Red-barred rebar needs a fast hit · TNT blows 1.6 s after it is struck',
            'Walls stop the crane; time up costs a life · keep clear of slabs and debris'
        ],
        // B does nothing in this game; the brake is the one action button.
        touch: { a: 'BRAKE', hide: ['b'] },
        ending: {
            title: 'SITE CLEARED',
            text: 'Every tower down, right on schedule.',
            colors: [RED, '#ffffff', '#ffd166', '#c8c8c8'],
            draw: drawEnding
        },
        levelNames: ['Twin Stacks', 'Arcade', 'Megastructure'],
        colors: { bg: '#0a0a0a', fg: '#ffffff', accent: RED, dim: '#9a9a9a' },
        lives: 3,
        // A slow, heavy dorian stomp: sawtooth bass, a clanking off-beat
        // snare and an eight-bar lead that climbs and falls back to the root.
        music: {
            bpm: 104, root: 38, scale: 'dorian', prog: [0, 0, 3, 0, 6, 3, 4, 0],
            bass: 'x..x..x...x.x.o.',
            lead: ['0...2.3...2.0...', '4---....3.2.0...', '5...4.3...2.3.4.', '7---....4-..2-..',
                '6...5.4...2.4...', '5---3---2---0...', '4.4.3.2.4.3.2.0.', '0-------........'],
            arp: '0..2..1.',
            drums: { k: 'x.....x.x.....x.', s: '....x.......x..x', h: 'x.xxx.x.x.xxx.x.' },
            leadWave: 'sawtooth', bassWave: 'sawtooth', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
