/*
 * Block Blaster — the tetris theme's game, a Quarth-style block shooter.
 *
 * A wall of block rows with gaps descends from the top. The launcher slides
 * along the bottom one column at a time and fires blocks straight up; a block
 * sticks under the lowest block of its column. A row without gaps clears, the
 * rows above drop into its place and the blast knocks the whole wall back up.
 * A block fired at a column that has no gap to fill hangs below the wall as a
 * "stub" and brings the wall one cell closer. There is only ever one row of
 * stubs (a miss with no room in it just shatters), stubs never count as a
 * line, and they fall off when the row they hang from clears. The wall
 * reaching the launcher line costs a life.
 *
 * The second wall adds wide gaps, two-row wells, steel plates that need two
 * hits before they count as filled and bombs that take the neighbouring rows
 * with them; the last wall adds rows that shift sideways and surges that
 * slam it down a cell. Clearing it ends in a screen-clearing combo.
 *
 * On a phone (coarse pointer) a tap on the board moves the launcher to the
 * tapped column and fires at once; the pad (← → FIRE ↓) works as the keys do.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var COLS = 12, CELL = 36, BW = COLS * CELL, OX = (G.W - BW) / 2, TOP = 40, LINE = TOP + 12 * CELL;
    var START_Y = TOP + 5 * CELL;      // where the wall's bottom edge starts (and returns to after a breach)
    var MIN_Y = TOP + 4 * CELL;        // the wall is never knocked back further than this: four rows stay in view
    // KICK: pixels the wall is knocked back per cleared line. It is less than a
    // cell, so a player has to out-clear the descent to gain ground at all.
    // FIRE_GAP: the launcher's reload. Nobody who aims fires eight blocks a
    // second, but someone who sweeps the launcher to and fro while hammering
    // FIRE would: at 0.08s that sprayed enough blocks to clear levels unaimed.
    var SHOT_SPEED = 1500, KICK = 28, FIRE_GAP = 0.12;
    // Phones (see tapColumn): how far a tap may be from a column that needs a
    // block and still be given to it, and how long the launcher jams after a
    // tapped block missed. With keys a careless shot costs the travel to the
    // column; a tap travels for free, and without the jam blind tapping all
    // over the board would win levels.
    var TAP_REACH = CELL, TAP_JAM = 0.45;
    var COLORS = ['#36c5f0', '#4361ee', '#ff922b', '#ffd43b', '#51cf66', '#b197fc', '#ff5c5c'];
    var INK = '#f4f7fb', MUTED = '#929cad', PANEL = '#101520', GRID = '#252b38', RED = '#ff5c5c', YELLOW = '#ffd43b';

    // speed: descent in px/s · quota: lines to clear · gmin/gmax: gap groups per row
    // wide: chance a group is 2-3 cells · well: chance a gap continues into the row above
    // armour: chance per plate slot · plates: slots per row · bomb: chance per row
    // shift: chance a row slides sideways every `every` seconds · surge: seconds between slams
    // The descent gets faster on every level; what a row asks of the player is
    // tuned so the shots per second needed to hold the wall rise steadily too.
    // Speeds and quotas were settled with a bot that walks the launcher and
    // then thinks before every shot: at 0.7 s a shot (a casual player) it
    // clears the first two walls in about one minute each without losing a
    // life and wins the finale in a minute and a half with two lives lost.
    var LEVELS = [
        // Introduction: plain rows with one or two single gaps.
        { speed: 13, quota: 36, gmin: 1, gmax: 2, wide: 0, well: 0, armour: 0, plates: 0, bomb: 0, shift: 0, every: 0, surge: 0 },
        // Development: wide gaps and wells, steel plates and bombs.
        { speed: 15.5, quota: 40, gmin: 1, gmax: 1, wide: 0.35, well: 0.25, armour: 0.35, plates: 1, bomb: 0.18, shift: 0, every: 0, surge: 0 },
        // Finale, the last wall: everything, plus rows that slide on a beat
        // and surges that slam the wall down a cell.
        { speed: 17.5, quota: 44, gmin: 1, gmax: 2, wide: 0.3, well: 0.2, armour: 0.15, plates: 2, bomb: 0.2, shift: 0.3, every: 1.5, surge: 16 }
    ];
    // Tetromino outlines for the silhouettes that drift down the side panels.
    var SHAPES = [
        [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [1, 1]],
        [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]
    ];

    function block(color) { return { color: color, kind: 'n', hp: 0, glow: 0 }; }
    // gone: set when the row leaves the wall, so a shot in flight can tell that
    // the row it was aimed at no longer exists.
    function newRow(cells, stub) { return { cells: cells, stub: stub, shift: 0, dy: 0, vy: 0, sx: 0, gone: false }; }
    function rowTop(s, i) { return s.y - (i + 1) * CELL; }
    function colX(c) { return OX + c * CELL + CELL / 2; }
    // Widen only the phone picture: twelve columns still have identical rules
    // and vertical timing, but their touch targets are half as wide again.
    function boardScale(s) { return s.touch ? 1.5 : 1; }
    function screenX(s, x) { return G.W / 2 + (x - G.W / 2) * boardScale(s); }

    // A full row painted in runs of one colour, so the wall reads as packed pieces.
    function paintRow(rnd) {
        var cells = [], c = 0;
        while (c < COLS) {
            var color = COLORS[Math.floor(rnd() * COLORS.length)], run = 1 + Math.floor(rnd() * 4);
            for (; run > 0 && c < COLS; run--, c++) cells.push(block(color));
        }
        return cells;
    }

    // True when column c is already open in the two newest rows. A third open
    // cell would start a shaft in which a shot finds no block to stick under.
    function shaft(s, c) {
        var n = s.rows.length;
        return n >= 2 && !s.rows[n - 1].cells[c] && !s.rows[n - 2].cells[c];
    }

    // Cuts the gaps the player has to fill. Gaps the previous row asked to
    // continue (wells) come first; at most six cells of a row are ever open, so
    // a row never needs more shots than a player can deliver before it lands.
    function carveGaps(s, cells) {
        var cfg = s.cfg, rnd = s.rnd, next = [], left = 6 - s.carry.length;
        s.carry.forEach(function (c) { if (!shaft(s, c)) cells[c] = null; });
        var groups = cfg.gmin + Math.floor(rnd() * (cfg.gmax - cfg.gmin + 1));
        for (var g = 0; g < groups; g++) {
            var w = rnd() < cfg.wide ? 2 + (rnd() < 0.35 ? 1 : 0) : 1;
            var start = Math.floor(rnd() * (COLS - w + 1));
            for (var c = start; c < start + w; c++) {
                var deep = rnd() < cfg.well;
                if (!cells[c] || shaft(s, c) || left-- <= 0) continue;
                cells[c] = null;
                if (deep) next.push(c);
            }
        }
        // The shaft rule may have refused every gap, and a row without one
        // would clear for free: open the first column that is allowed.
        for (var k = Math.floor(rnd() * COLS), tries = 0; cells.every(Boolean) && tries < COLS; k = (k + 1) % COLS, tries++) {
            if (!shaft(s, k)) cells[k] = null;
        }
        s.carry = next;
    }

    // Turns one random plain block into a special one; landing on a gap or on
    // another special simply means this row gets none.
    function setKind(row, rnd, kind) {
        var cell = row.cells[Math.floor(rnd() * COLS)];
        if (!cell || cell.kind !== 'n') return;
        cell.kind = kind;
        cell.hp = kind === 'armour' ? 2 : 0;
    }

    function genRow(s) {
        var cfg = s.cfg, rnd = s.rnd, row = newRow(paintRow(rnd), false);
        carveGaps(s, row.cells);
        for (var a = 0; a < cfg.plates; a++) if (rnd() < cfg.armour) setKind(row, rnd, 'armour');
        if (rnd() < cfg.bomb) setKind(row, rnd, 'bomb');
        if (rnd() < cfg.shift) row.shift = rnd() < 0.5 ? -1 : 1;
        return row;
    }

    // Keeps one row hidden above the board so the wall looks endless. A new
    // row inherits the drop animation of the row below it, otherwise it would
    // be drawn inside rows that are still falling into a cleared line.
    function fillTop(s) {
        while (s.y - s.rows.length * CELL > TOP - CELL) {
            var row = genRow(s), below = s.rows[s.rows.length - 1];
            if (below) { row.dy = below.dy; row.vy = below.vy; }
            s.rows.push(row);
        }
    }

    function init(level) {
        var cfg = LEVELS[level - 1], rnd = G.rng(level * 7919 + 3);
        var s = {
            cfg: cfg, rnd: rnd, rows: [], carry: [], y: START_Y, col: 5, lx: colX(5), rep: 0, touch: G.isTouch(),
            shots: [], cool: 0, recoil: 0, nextColor: COLORS[Math.floor(rnd() * COLORS.length)],
            lines: 0, combo: 0, comboT: 0, kick: 0, slam: 0, shiftT: cfg.every, slides: 0, surgeT: cfg.surge, warned: false,
            time: 0, flashes: [], rushPay: 0, rushT: 0, beat: 0
        };
        fillTop(s);
        return s;
    }

    // ---- launcher ----------------------------------------------------------

    function stepCol(s, dir, loud) {
        var to = G.clamp(s.col + dir, 0, COLS - 1);
        if (to === s.col) return;
        s.col = to;
        // Only the key press clicks; the auto-repeat would turn it into a buzz.
        if (loud) G.tone(880, 0.02, { type: 'square', vol: 0.04 });
    }

    // One column per press, then auto-repeat while held (like a keyboard), so
    // both single precise steps and fast sweeps across the board are possible.
    function moveLauncher(s, dt) {
        var dir = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0);
        if (dir && (G.hit.left || G.hit.right)) {
            stepCol(s, dir, true);
            s.rep = 0.19;
        } else if (dir) {
            s.rep -= dt;
            if (s.rep <= 0) { stepCol(s, dir, false); s.rep = 0.06; }
        }
        s.lx += (colX(s.col) - s.lx) * Math.min(1, dt * 28);
    }

    // True when a block fired up column c would do some good: fill a gap of
    // the wall or hit a steel plate. False for a miss (a stub, a shattered
    // block, or a column that is open all the way up).
    function useful(s, c) {
        var low = lowestIn(s, c);
        if (low < 0) return false;
        return s.rows[low].cells[c].kind === 'armour' || (low > 0 && !s.rows[low - 1].stub);
    }

    // Phones only: a tap on the board sends the launcher straight to that
    // column, and the caller fires. A column is narrower than a fingertip on
    // a phone, so a tap that would be a miss is given to the nearest column
    // within TAP_REACH where a block does some good. Desktop keeps its keys:
    // a mouse click does nothing.
    function tapColumn(s) {
        var m = G.mouse;
        if (!s.touch || !m.hit || !Number.isFinite(m.x) || !Number.isFinite(m.y) || m.y < TOP || m.y > G.H) return false;
        var x = G.W / 2 + (m.x - G.W / 2) / boardScale(s);
        if (x < OX || x >= OX + BW) return false;
        var best = Math.floor((x - OX) / CELL), reach = TAP_REACH;
        if (!useful(s, best)) {
            for (var c = 0; c < COLS; c++) {
                var d = Math.abs(colX(c) - x);
                if (d < reach && useful(s, c)) { best = c; reach = d; }
            }
        }
        s.col = best;
        s.lx = colX(best);
        return true;
    }

    // What a block is aimed at as it leaves the launcher: the row it will stick
    // into, or the row of the steel plate it will hit; null when it is a miss.
    // (A shot also remembers s.slides, the count of slide beats, to tell later
    // whether the marked rows moved while it was in the air.)
    function aimRow(s, c) {
        var low = lowestIn(s, c);
        if (low < 0) return null;
        if (s.rows[low].cells[c].kind === 'armour') return s.rows[low];
        return low > 0 ? s.rows[low - 1] : null;
    }

    // `tapped`: a tap on the board asked for a shot (see tapColumn).
    function fire(s, dt, tapped) {
        s.cool -= dt;
        s.recoil = Math.max(0, s.recoil - dt * 7);
        if (!(G.hit.a || tapped) || s.cool > 0) return;
        s.cool = FIRE_GAP;
        s.recoil = 1;
        s.shots.push({ c: s.col, y: LINE, color: s.nextColor, target: aimRow(s, s.col), slides: s.slides, tap: tapped });
        s.nextColor = G.pick(COLORS);
        G.tone(520, 0.07, { type: 'square', vol: 0.09, slide: 1040 });
    }

    // ---- the wall ----------------------------------------------------------

    function lowestIn(s, c) {
        for (var i = 0; i < s.rows.length; i++) if (s.rows[i].cells[c]) return i;
        return -1;
    }

    // A steel plate does not count as filled until both hits have landed.
    function isFull(row) {
        return row.cells.every(function (cell) { return cell && cell.kind !== 'armour'; });
    }

    function hasBomb(row) {
        return row.cells.some(function (cell) { return cell && cell.kind === 'bomb'; });
    }

    // `↓` pulls the wall down five times faster and pays for the risk: two
    // points for every six pixels the wall really came closer.
    function payRush(s, px, dt) {
        s.rushPay += px;
        while (s.rushPay >= 6) { s.rushPay -= 6; G.addScore(2); }
        s.rushT -= dt;
        if (s.rushT <= 0) { s.rushT = 0.22; G.noise(0.12, { vol: 0.05, freq: 700 }); }
    }

    // The steady descent (a little faster as the quota fills), plus the two
    // impulses: the knock-back of a line clear and the slam of a surge.
    function descend(s, dt) {
        var v = s.cfg.speed * (1 + 0.15 * Math.min(1, s.lines / s.cfg.quota)), before = s.y;
        if (G.key.down) v *= 5;
        var up = Math.min(s.kick, 420 * dt), down = Math.min(s.slam, 300 * dt);
        s.kick -= up;
        s.slam -= down;
        s.y += v * dt - up + down;
        if (s.y < MIN_Y) { s.y = MIN_Y; s.kick = 0; }
        // No bonus while a knock-back or the top stop cancels the rush.
        if (G.key.down && s.y > before) payRush(s, s.y - before, dt);
    }

    function slideRow(row, dir) {
        if (dir > 0) row.cells.unshift(row.cells.pop()); else row.cells.push(row.cells.shift());
        row.sx = -dir * CELL;
    }

    // Marked rows rotate one column at a time, all on the same beat, so the
    // player can learn the rhythm (the arrows blink just before the move).
    // Stubs hang from the row above them and slide with it: left behind, they
    // would end up under that row's gap and block the only shot that fills it.
    function shiftRows(s, dt) {
        if (!s.cfg.shift) return;
        s.shiftT -= dt;
        if (s.shiftT > 0) return;
        s.shiftT = s.cfg.every;
        s.slides++;
        var seen = false;
        s.rows.forEach(function (row, i) {
            if (!row.shift) return;
            slideRow(row, row.shift);
            if (i === 1 && s.rows[0].stub) slideRow(s.rows[0], row.shift);
            seen = seen || rowTop(s, i) + CELL > TOP;
        });
        if (seen) G.tone(240, 0.04, { type: 'square', vol: 0.06 });
    }

    function surge(s, dt) {
        if (!s.cfg.surge) return;
        s.surgeT -= dt;
        if (s.surgeT < 1.2 && !s.warned) { s.warned = true; G.sfx('alarm'); }
        if (s.surgeT > 0) return;
        s.surgeT = s.cfg.surge;
        s.warned = false;
        s.slam += CELL;
        G.noise(0.3, { vol: 0.3, freq: 180 });
        G.shake(5, 0.2);
    }

    // ---- shots landing -----------------------------------------------------

    function crack(s, cell, sh, low) {
        var x = screenX(s, colX(sh.c)), y = s.y - low * CELL;
        cell.hp--;
        cell.glow = 1;
        G.noise(0.08, { vol: 0.2, freq: 3000 });
        G.burst(x, y, { n: 6, color: MUTED, speed: 160, gravity: 500, angle: Math.PI / 2, spread: 2 });
        if (cell.hp > 0) { G.tone(1300, 0.05, { type: 'triangle', vol: 0.1 }); return; }
        // The plate is gone: what is left is an ordinary block in the shot's colour.
        cell.kind = 'n';
        cell.color = sh.color;
        G.tone(700, 0.1, { type: 'triangle', vol: 0.14, slide: 1400 });
        G.addScore(20);
    }

    function hangStub(s, sh) {
        var cells = [];
        for (var c = 0; c < COLS; c++) cells.push(c === sh.c ? block(sh.color) : null);
        s.rows.unshift(newRow(cells, true));
        s.y += CELL;
    }

    // A block that found no gap of the wall to fill. `stubRow` is the stub row
    // it flew into, if any. Three outcomes:
    // - it was aimed at a gap or a plate, but while it was in flight that row
    //   was cleared (a bomb, or an earlier shot) or the marked rows slid: the
    //   aim was right, so it fizzles without a penalty;
    // - there is room in the single stub row (or no stub row yet): it hangs
    //   there, and a new stub row brings the wall a whole cell closer;
    // - its place in the stub row is taken: it shatters. One row of stubs is
    //   the whole penalty, however often the player misses.
    // A tapped block that misses also jams the launcher (see TAP_JAM).
    function miss(s, sh, stubRow) {
        var x = screenX(s, colX(sh.c));
        if (sh.target && (sh.target.gone || sh.slides !== s.slides)) {
            G.burst(x, s.y, { n: 6, color: sh.color, speed: 120, life: 0.3 });
            return;
        }
        s.combo = 0;
        if (sh.tap) s.cool = TAP_JAM;
        G.tone(140, 0.16, { type: 'sawtooth', vol: 0.13, slide: 90 });
        if (!stubRow && s.rows[0].stub) {
            G.burst(x, s.y, { n: 8, color: sh.color, speed: 150, gravity: 800, size: 4 });
            return;
        }
        if (stubRow) stubRow.cells[sh.c] = block(sh.color); else hangStub(s, sh);
        G.popup(x, s.y - CELL, 'MISS', RED);
    }

    function land(s, sh, low) {
        var cell = s.rows[low].cells[sh.c], into = low > 0 ? s.rows[low - 1] : null;
        if (cell.kind === 'armour') { crack(s, cell, sh, low); checkLines(s); return; }
        if (!into || into.stub) { miss(s, sh, into); return; }
        var b = block(sh.color);
        b.glow = 1;
        into.cells[sh.c] = b;
        G.addScore(5);
        G.tone(330 + sh.c * 18, 0.06, { type: 'triangle', vol: 0.16 });
        checkLines(s);
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (sh) {
            sh.y -= SHOT_SPEED * dt;
            var low = lowestIn(s, sh.c);
            // A column that is open all the way up (the ghost marks it with a
            // cross): the block flies off the top, with a buzz so it is noticed.
            if (low < 0) {
                if (sh.y > TOP - CELL) return true;
                if (sh.tap) s.cool = TAP_JAM;
                G.tone(140, 0.1, { type: 'sawtooth', vol: 0.08, slide: 90 });
                return false;
            }
            if (sh.y > s.y - low * CELL) return true;
            land(s, sh, low);
            return false;
        });
    }

    // ---- line clears -------------------------------------------------------

    // Full rows clear; a bomb in a clearing row takes the rows directly above
    // and below with it, and bombs in those rows chain on. Stub rows are never
    // lines: they neither clear when full nor count when a bomb reaches them
    // (they simply fall off with the row above, see dropStubs).
    function checkLines(s) {
        var hit = {}, queue = [], n = 0;
        s.rows.forEach(function (row, i) { if (!row.stub && isFull(row)) queue.push(i); });
        while (queue.length) {
            var i = queue.pop();
            if (hit[i] || i < 0 || i >= s.rows.length || s.rows[i].stub) continue;
            hit[i] = true;
            n++;
            if (hasBomb(s.rows[i])) queue.push(i - 1, i + 1);
        }
        if (n) clearRows(s, hit, n);
    }

    function popRow(s, row, top) {
        s.flashes.push({ y: top, t: 0.3 });
        row.cells.forEach(function (cell, c) {
            if (cell) G.burst(screenX(s, colX(c)), top + CELL / 2, { n: 4, color: cell.color, speed: 260, gravity: 700, size: 5, life: 0.7 });
        });
    }

    // Stubs hang from the row above them, so they fall away with it. Removing
    // a bottom row moves the wall's bottom edge up by one cell.
    function dropStubs(s, at) {
        while (at > 0 && s.rows[at - 1].stub) {
            var top = rowTop(s, at - 1);
            s.rows[at - 1].cells.forEach(function (cell, c) {
                if (cell) G.burst(screenX(s, colX(c)), top + CELL / 2, { n: 5, color: cell.color, speed: 90, gravity: 900, size: 6, life: 0.8 });
            });
            s.rows[at - 1].gone = true;
            s.rows.splice(at - 1, 1);
            s.y -= CELL;
            at--;
        }
    }

    function clearRows(s, hit, n) {
        var lowest = s.rows.length, bombed = false;
        for (var i = s.rows.length - 1; i >= 0; i--) {
            if (!hit[i]) continue;
            popRow(s, s.rows[i], rowTop(s, i));
            bombed = bombed || hasBomb(s.rows[i]);
            s.rows[i].gone = true;
            s.rows.splice(i, 1);
            // Everything above falls into the hole: dy is the height still to fall.
            for (var j = i; j < s.rows.length; j++) s.rows[j].dy += CELL;
            lowest = i;
        }
        dropStubs(s, lowest);
        s.kick += KICK * n;
        reward(s, n, bombed);
    }

    function reward(s, n, bombed) {
        s.combo = s.comboT > 0 ? s.combo + 1 : 1;
        s.comboT = 3;
        s.lines += n;
        var mult = Math.min(s.combo, 5), pts = 100 * G.level * n * mult;
        G.addScore(pts);
        G.popup(G.W / 2, Math.max(TOP + 30, s.y - CELL), '+' + pts + (mult > 1 ? '  x' + mult : ''), YELLOW);
        G.shake(3 + 2 * n, 0.18);
        // A rising minor arpeggio, a step higher with every combo link.
        var base = 330 * Math.pow(1.122, mult - 1);
        [1, 1.2, 1.5, 2].forEach(function (f, k) {
            G.tone(base * f, 0.09, { type: 'square', vol: 0.12, delay: k * 0.045 });
        });
        G.noise(0.18, { vol: 0.16, freq: 1800, slide: 400 });
        if (bombed) { G.sfx('bigboom'); G.flash(YELLOW, 0.14); }
    }

    // ---- losing ------------------------------------------------------------

    // The wall reached the launcher: a life is gone and the rows that got too
    // close are blown away, which hands the player the starting distance back.
    function breach(s) {
        if (G.loseLife() <= 0) return;
        while (s.y > START_Y && s.rows.length) {
            var row = s.rows.shift(), top = s.y - CELL;
            row.gone = true;
            row.cells.forEach(function (cell, c) {
                if (cell) G.burst(screenX(s, colX(c)), top + CELL / 2, { n: 3, color: cell.color, speed: 300, gravity: 600, size: 5 });
            });
            s.y -= CELL;
        }
        s.shots = [];
        s.kick = 0;
        s.slam = 0;
        s.combo = 0;
        G.sfx('boom');
        G.flash(RED, 0.25);
    }

    // A heartbeat that speeds up as the wall closes in on the line.
    function danger(s, dt) {
        var gap = LINE - s.y;
        if (gap > 2.5 * CELL) { s.beat = 0; return; }
        s.beat -= dt;
        if (s.beat > 0) return;
        s.beat = 0.25 + 0.3 * G.clamp(gap / (2.5 * CELL), 0, 1);
        G.tone(90, 0.1, { type: 'sine', vol: 0.25 });
    }

    // Animation state only: rows falling into a cleared line, rows sliding
    // sideways, fresh blocks glowing, clear flashes fading.
    function settle(s, dt) {
        s.rows.forEach(function (row) {
            if (row.dy > 0) {
                row.vy += 2600 * dt;
                row.dy = Math.max(0, row.dy - row.vy * dt);
                if (row.dy === 0) row.vy = 0;
            }
            if (row.sx) row.sx = row.sx > 0 ? Math.max(0, row.sx - 320 * dt) : Math.min(0, row.sx + 320 * dt);
            row.cells.forEach(function (cell) { if (cell && cell.glow > 0) cell.glow -= dt * 4; });
        });
        s.flashes = s.flashes.filter(function (f) { f.t -= dt; return f.t > 0; });
        if (s.comboT > 0) s.comboT -= dt;
    }

    function update(s, dt) {
        s.time += dt;
        moveLauncher(s, dt);
        fire(s, dt, tapColumn(s));
        descend(s, dt);
        shiftRows(s, dt);
        surge(s, dt);
        updateShots(s, dt);
        settle(s, dt);
        fillTop(s);
        if (s.lines >= s.cfg.quota) { G.win(500 + G.lives * 250); return; }
        if (s.y >= LINE) breach(s); else danger(s, dt);
    }

    // ---- drawing -----------------------------------------------------------

    // The chunky bevelled block of the theme's logo.
    function drawBlock(ctx, x, y, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.40)';
        ctx.fillRect(x + 1, y + 1, CELL - 2, 4);
        ctx.fillRect(x + 1, y + 1, 4, CELL - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(x + 1, y + CELL - 5, CELL - 2, 4);
        ctx.fillRect(x + CELL - 5, y + 1, 4, CELL - 2);
    }

    // Steel plate: riveted while whole, split by a crack after the first hit.
    function drawArmour(ctx, cell, x, y) {
        drawBlock(ctx, x, y, cell.hp > 1 ? '#7d8798' : '#596273');
        ctx.fillStyle = '#252b38';
        [[7, 7], [CELL - 10, 7], [7, CELL - 10], [CELL - 10, CELL - 10]].forEach(function (p) {
            ctx.fillRect(x + p[0], y + p[1], 3, 3);
        });
        if (cell.hp > 1) return;
        ctx.strokeStyle = '#ff922b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 5); ctx.lineTo(x + 19, y + 15); ctx.lineTo(x + 13, y + 21); ctx.lineTo(x + 27, y + 31);
        ctx.stroke();
    }

    function drawBomb(s, ctx, x, y) {
        var pulse = 0.5 + 0.5 * Math.sin(s.time * 9);
        drawBlock(ctx, x, y, '#2b3140');
        ctx.fillStyle = RED;
        ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2 + 2, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,212,59,' + (0.4 + 0.6 * pulse) + ')';
        ctx.beginPath(); ctx.arc(x + CELL / 2 + 6, y + 8, 2.5 + 2 * pulse, 0, Math.PI * 2); ctx.fill();
    }

    function drawCell(s, ctx, cell, x, y) {
        if (cell.kind === 'armour') drawArmour(ctx, cell, x, y);
        else if (cell.kind === 'bomb') drawBomb(s, ctx, x, y);
        else drawBlock(ctx, x, y, cell.color);
        if (cell.glow > 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + 0.7 * cell.glow + ')';
            ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        }
    }

    function drawRows(s, ctx) {
        for (var i = 0; i < s.rows.length; i++) {
            var row = s.rows[i], top = rowTop(s, i) - row.dy;
            if (top + CELL < TOP || top > G.H) continue;
            // Stubs are drawn dimmed: they are loose blocks, not part of the wall.
            ctx.globalAlpha = row.stub ? 0.6 : 1;
            for (var c = 0; c < COLS; c++) {
                if (row.cells[c]) drawCell(s, ctx, row.cells[c], OX + c * CELL + row.sx, top);
            }
        }
        ctx.globalAlpha = 1;
    }

    // Faint tetromino silhouettes drifting down both side panels: the screen
    // keeps moving even when the player and the wall are waiting.
    function drawDrift(s, ctx) {
        ctx.globalAlpha = 0.13;
        for (var i = 0; i < 8; i++) {
            var shape = SHAPES[i % SHAPES.length], side = i % 2 ? OX + BW + 30 : 24;
            var x = side + (i * 67) % 150, y = TOP + (s.time * (16 + i * 5) + i * 131) % (G.H + 60) - 60;
            ctx.fillStyle = COLORS[i % COLORS.length];
            for (var k = 0; k < shape.length; k++) ctx.fillRect(x + shape[k][0] * 18, y + shape[k][1] * 18, 17, 17);
        }
        ctx.globalAlpha = 1;
    }

    function drawBoard(s, ctx) {
        ctx.fillStyle = PANEL;
        ctx.fillRect(OX, TOP, BW, G.H - TOP);
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var c = 0; c <= COLS; c++) { ctx.moveTo(OX + c * CELL + 0.5, TOP); ctx.lineTo(OX + c * CELL + 0.5, LINE); }
        ctx.stroke();
        // The frame turns red while a surge is about to slam the wall down.
        var alert = s.cfg.surge && s.surgeT < 1.2 && Math.sin(s.time * 30) > 0;
        ctx.fillStyle = alert ? RED : INK;
        ctx.fillRect(OX - 6, TOP, 4, G.H - TOP);
        ctx.fillRect(OX + BW + 2, TOP, 4, G.H - TOP);
        ctx.fillStyle = '#4361ee';
        ctx.fillRect(OX - 10, TOP, 4, G.H - TOP);
        ctx.fillRect(OX + BW + 6, TOP, 4, G.H - TOP);
    }

    // The launcher line: a dashed red bar that throbs once the wall is close.
    function drawLine(s, ctx) {
        var near = G.clamp(1 - (LINE - s.y) / (3 * CELL), 0, 1);
        ctx.globalAlpha = 0.35 + 0.65 * near * (0.5 + 0.5 * Math.sin(s.time * 12));
        ctx.fillStyle = RED;
        for (var x = OX; x < OX + BW; x += 18) ctx.fillRect(x, LINE - 1, 10, 3);
        ctx.globalAlpha = 1;
    }

    // The column is open all the way up, so a block fired here is lost: a red
    // beam and a cross at the top say so.
    function drawNoTarget(s, ctx, x) {
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = RED;
        ctx.fillRect(x, TOP, CELL, LINE - TOP);
        ctx.globalAlpha = 0.55 + 0.3 * Math.sin(s.time * 8);
        ctx.strokeStyle = RED;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 8, TOP + 8); ctx.lineTo(x + CELL - 8, TOP + CELL - 8);
        ctx.moveTo(x + CELL - 8, TOP + 8); ctx.lineTo(x + 8, TOP + CELL - 8);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Where the next block will go: a beam up the column and an outline on the
    // target cell — red when the shot would be a miss (a stub, or shattered).
    function drawGhost(s, ctx) {
        var low = lowestIn(s, s.col), x = OX + s.col * CELL;
        if (low < 0) { drawNoTarget(s, ctx, x); return; }
        var cell = s.rows[low].cells[s.col], bottom = s.y - low * CELL, plate = cell.kind === 'armour';
        // A miss: nothing to stick under but the wall's own bottom, or only the stub row.
        var color = plate ? YELLOW : (useful(s, s.col) ? INK : RED);
        ctx.globalAlpha = 0.09;
        ctx.fillStyle = color;
        ctx.fillRect(x, bottom, CELL, Math.max(0, LINE - bottom));
        ctx.globalAlpha = 0.55 + 0.3 * Math.sin(s.time * 8);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 3, (plate ? bottom - CELL : bottom) + 3, CELL - 6, CELL - 6);
        ctx.globalAlpha = 1;
    }

    function drawShots(s, ctx) {
        s.shots.forEach(function (sh) {
            ctx.fillStyle = 'rgba(244,247,251,0.25)';
            ctx.fillRect(OX + sh.c * CELL + 8, sh.y + CELL, CELL - 16, 26);
            drawBlock(ctx, OX + sh.c * CELL, sh.y, sh.color);
        });
        s.flashes.forEach(function (f) {
            ctx.fillStyle = 'rgba(255,255,255,' + (f.t / 0.3) * 0.85 + ')';
            ctx.fillRect(OX, f.y - 4, BW, CELL + 8);
        });
    }

    // A carriage on a rail with the next block loaded; it kicks down on firing.
    function drawLauncher(s, ctx) {
        var x = s.lx - CELL / 2, y = LINE + 8 + s.recoil * 6;
        ctx.fillStyle = GRID;
        ctx.fillRect(OX, LINE + 50, BW, 4);
        ctx.fillStyle = INK;
        ctx.fillRect(x - 8, y + 26, CELL + 16, 14);
        ctx.fillStyle = '#4361ee';
        ctx.fillRect(x - 8, y + 36, CELL + 16, 6);
        ctx.fillStyle = MUTED;
        ctx.fillRect(x - 5, y + 4, 5, 24);
        ctx.fillRect(x + CELL, y + 4, 5, 24);
        if (s.cool <= 0) drawBlock(ctx, x, y - 6 + 2 * Math.sin(s.time * 6), s.nextColor);
    }

    // Arrows beside every shifting row; they blink just before the row moves.
    function drawShiftMarks(s) {
        var soon = s.shiftT < 0.4 && Math.sin(s.time * 40) > 0;
        s.rows.forEach(function (row, i) {
            var mid = rowTop(s, i) - row.dy + CELL / 2;
            if (!row.shift || mid < TOP + 12 || mid > G.H) return;
            var mark = row.shift > 0 ? '»' : '«', o = { size: s.touch ? 28 : 20, bold: true, color: soon ? INK : YELLOW, align: 'center', baseline: 'middle' };
            G.text(mark, screenX(s, OX - (s.touch ? 15 : 21)), mid, o);
            G.text(mark, screenX(s, OX + BW + (s.touch ? 15 : 21)), mid, o);
        });
    }

    // Left panel: what this level's special blocks do, drawn with real blocks.
    // It keeps to the far left so the shift arrows beside the board frame are
    // not read as part of it. Two short lines of 20px each: on a phone the
    // canvas is drawn at about half size, and smaller type is unreadable.
    function drawLegend(s, ctx) {
        if (s.touch) { drawPhoneLegend(s, ctx); return; }
        var cfg = s.cfg, y = 66;
        function entry(name, what, paint) {
            paint(16, y + 4);
            G.text(name, 62, y + 18, { size: 20, bold: true, color: INK, max: 170 });
            G.text(what, 62, y + 40, { size: 20, color: MUTED, max: 170 });
            y += 58;
        }
        if (cfg.armour) entry('STEEL', 'HIT TWICE', function (x, yy) { drawArmour(ctx, { hp: 2 }, x, yy); });
        if (cfg.bomb) entry('BOMB', 'BLASTS ROWS', function (x, yy) { drawBomb(s, ctx, x, yy); });
        if (cfg.shift) entry('MARKED', 'ROW SLIDES', function (x, yy) { G.text('«»', x + 18, yy + 25, { size: 24, bold: true, color: YELLOW, align: 'center' }); });
        if (cfg.surge) {
            var warn = s.surgeT < 1.2;
            G.text(warn ? 'SURGE!' : 'SURGE IN ' + Math.ceil(s.surgeT), 16, y + 24, { size: warn ? 26 : 20, bold: true, color: warn ? RED : MUTED });
        }
    }

    // Keep every late-level cue in the side gutter rather than over the wall.
    function drawPhoneLegend(s, ctx) {
        var y = 72;
        function entry(name, what, paint) {
            paint(45, y);
            G.text(name, 63, y + 65, { size: 26, bold: true, color: INK, align: 'center' });
            G.text(what, 63, y + 94, { size: 24, color: MUTED, align: 'center' });
            y += 126;
        }
        if (s.cfg.armour) entry('STEEL', 'HIT x2', function (x, yy) { drawArmour(ctx, { hp: 2 }, x, yy); });
        if (s.cfg.bomb) entry('BOMB', '3 ROWS', function (x, yy) { drawBomb(s, ctx, x, yy); });
        if (s.cfg.shift) entry('SLIDE', '«  »', function (x, yy) { G.text('«»', x + 18, yy + 26, { size: 32, bold: true, color: YELLOW, align: 'center' }); });
        if (s.cfg.surge) {
            var warn = s.surgeT < 1.2;
            G.text(warn ? 'SURGE!' : 'SURGE', 890, 390, { size: 26, max: 100, bold: true, color: warn ? RED : MUTED, align: 'center' });
            G.text(warn ? 'NOW' : Math.ceil(s.surgeT) + 's', 890, 424, { size: 30, bold: true, color: warn ? RED : INK, align: 'center' });
        }
    }

    // Right panel: the line quota as a rising meter, and the running combo.
    function drawMeter(s, ctx) {
        if (s.touch) { drawPhoneMeter(s, ctx); return; }
        var x = OX + BW + 60, top = 96, h = 330, done = G.clamp(s.lines / s.cfg.quota, 0, 1);
        G.text('LINES', x, 62, { size: 14, color: MUTED });
        G.text(s.lines + ' / ' + s.cfg.quota, x, 84, { size: 20, bold: true, color: INK });
        ctx.fillStyle = PANEL;
        ctx.fillRect(x, top, 26, h);
        ctx.fillStyle = '#51cf66';
        ctx.fillRect(x, top + h * (1 - done), 26, h * done);
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, top, 26, h);
        if (s.combo > 1 && s.comboT > 0) {
            G.text('COMBO', x + 44, 250, { size: 14, color: MUTED });
            G.text('x' + Math.min(s.combo, 5), x + 44, 284, { size: 30, bold: true, color: YELLOW, glow: YELLOW });
        }
        if (G.key.down) G.text('RUSH +', x + 44, 330, { size: 20, bold: true, color: '#ff922b' });
    }

    function drawPhoneMeter(s, ctx) {
        var done = G.clamp(s.lines / s.cfg.quota, 0, 1);
        G.text('LINES', 885, 74, { size: 26, color: MUTED, align: 'center' });
        G.text(s.lines + '/' + s.cfg.quota, 885, 108, { size: 32, bold: true, color: INK, align: 'center' });
        ctx.fillStyle = GRID;
        ctx.fillRect(850, 125, 80, 12);
        ctx.fillStyle = '#51cf66';
        ctx.fillRect(850, 125, 80 * done, 12);
        if (s.combo > 1 && s.comboT > 0) {
            G.text('COMBO', 885, 208, { size: 24, color: MUTED, align: 'center' });
            G.text('x' + Math.min(s.combo, 5), 885, 248, { size: 36, bold: true, color: YELLOW, align: 'center' });
        }
        if (G.key.down) G.text('RUSH +', 890, 318, { size: 26, max: 100, bold: true, color: '#ff922b', align: 'center' });
    }

    function draw(s, ctx) {
        ctx.fillStyle = '#080b12';
        ctx.fillRect(0, 0, G.W, G.H);
        // Nothing of the playfield may reach into the HUD strip, so everything
        // that moves is clipped to the area below it.
        ctx.save();
        ctx.beginPath(); ctx.rect(0, TOP, G.W, G.H - TOP); ctx.clip();
        if (!s.touch) drawDrift(s, ctx);
        ctx.translate(G.W / 2, 0);
        ctx.scale(boardScale(s), 1);
        ctx.translate(-G.W / 2, 0);
        drawBoard(s, ctx);
        ctx.beginPath(); ctx.rect(OX, TOP, BW, G.H - TOP); ctx.clip();
        drawGhost(s, ctx);
        drawRows(s, ctx);
        drawShots(s, ctx);
        drawLine(s, ctx);
        drawLauncher(s, ctx);
        ctx.restore();
        drawShiftMarks(s);
        drawLegend(s, ctx);
        drawMeter(s, ctx);
    }

    // ---- the ending ----------------------------------------------------------

    // A four-row wall drops into the middle of the screen and clears from the
    // bottom up as one long combo; every cleared row bursts into its blocks,
    // which fly out like fireworks. It repeats every ENDING_CYCLE seconds.
    // Everything follows from the scene's clock: the scene keeps no state.
    var ENDING_CYCLE = 3.2, ENDING_ROWS = 4, ENDING_BASE = 370;

    function hash(a, b, c) {
        var h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
        return h - Math.floor(h);
    }

    function drawEndingRow(ctx, k, r, t) {
        var clearAt = 0.7 + r * 0.35, y = ENDING_BASE - (r + 1) * CELL - Math.max(0, 1 - t / 0.5) * 220, c, dt, x;
        // The standing wall is faint: the score and the buttons are on top.
        ctx.globalAlpha = 0.35;
        if (t < clearAt) {
            for (c = 0; c < COLS; c++) drawBlock(ctx, OX + c * CELL, y, COLORS[Math.floor(hash(k, r, c) * COLORS.length)]);
            ctx.globalAlpha = 1;
            return;
        }
        dt = t - clearAt;
        if (dt < 0.12) { ctx.fillStyle = INK; ctx.fillRect(OX, y, BW, CELL); ctx.globalAlpha = 1; return; }
        if (dt > 1.6) return;
        ctx.globalAlpha = 1 - dt / 1.6;
        for (c = 0; c < COLS; c++) {
            x = colX(c) + ((c - 5.5) * 45 + (hash(c, r, k) - 0.5) * 120) * dt;
            ctx.fillStyle = COLORS[Math.floor(hash(k, r, c) * COLORS.length)];
            ctx.fillRect(x - 8, y + CELL / 2 - (260 + hash(r, c, k) * 220) * dt + 420 * dt * dt - 8, 16, 16);
        }
        ctx.globalAlpha = 1;
    }

    function drawEnding(e, ctx) {
        var k = Math.floor(e.t / ENDING_CYCLE), t = e.t - k * ENDING_CYCLE, r, cleared = 0;
        for (r = 0; r < ENDING_ROWS; r++) {
            drawEndingRow(ctx, k, r, t);
            if (t >= 0.7 + r * 0.35) cleared++;
        }
        if (cleared > 1) G.text('COMBO x' + cleared, OX + BW + 24, ENDING_BASE - 2 * CELL, { size: 28, bold: true, color: YELLOW });
    }

    function hud(s) {
        return 'LINES ' + s.lines + '/' + s.cfg.quota + (s.combo > 1 && s.comboT > 0 ? '  x' + Math.min(s.combo, 5) : '');
    }

    G.register('tetris', {
        title: 'BLOCK BLASTER',
        blurb: 'Fire blocks into the gaps of the falling wall. Full rows clear and knock it back.',
        controls: [
            '← → move one column · SPACE / FIRE shoot a block up it',
            'Touch: tap a column to move there and fire',
            '↓ pull the wall down faster for bonus points',
            'A block sticks under the lowest one; with no gap to fill it hangs there'
        ],
        levelNames: ['First Wall', 'Steel and Bombs', 'Block Blaster'],
        colors: { bg: '#080b12', fg: '#f4f7fb', accent: '#36c5f0', dim: '#929cad' },
        lives: 4,
        // ↑ and B do nothing here. dirs: 4 keeps a thumb that is a little off
        // ← or → from also holding ↓, which would rush the wall down.
        touch: { a: 'FIRE', hide: ['up', 'b'], dirs: 4 },
        // A brisk A-minor round dance: oom-pah bass, off-beat hats, and an
        // eight-bar tune that climbs through iv, VI, III and v back home.
        music: {
            bpm: 152, root: 45, scale: 'minor', prog: [0, 0, 3, 0, 5, 2, 4, 0],
            bass: 'x.o.x.o.x.o.5.o.',
            lead: [
                '0.2.4.2.7...4...', '5.4.2.4.0...0...', '3.5.7.5.a...7...', '9.7.5.4.2...4...',
                '5.7.9.7.c...9...', 'b.9.8.6.4...6...', '4.6.8.6.b...8...', '9.8.7.4.7---....'
            ],
            arp: '..0...2...1...2.',
            drums: { k: 'x...x...x...x...', s: '....x.......x..x', h: '..x...x...x...x.' },
            leadWave: 'square', bassWave: 'triangle', arpWave: 'triangle', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        ending: {
            title: 'WALL CLEARED',
            text: 'The last wall is rubble. Every line blasted.',
            colors: COLORS,
            draw: drawEnding
        }
    });
})();
