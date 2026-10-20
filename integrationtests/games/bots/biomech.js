// Spine Crawler campaign bot: the arrow keys and a held FIRE only.
// Every tick it picks a target (a parasite loose in the zone first, then the
// lowest worm segment it can see, then the Queen's head once no worm is
// out), leads it by the shot's flight time, and moves to the spot in the
// turret's zone nearest that firing line which stays clear of worms,
// parasites and falling sacs for the next half second.
(function () {
    var CELL = 24, OY = 36, ZONE = 16, COLS = 40, ROWS = 21, SHOT = 820, SAFE = 38;

    function cellX(c) { return c * CELL + CELL / 2; }
    function cellY(r) { return OY + r * CELL + CELL / 2; }

    // The game's own boldness rule (unhurt worms speed up), read from state.
    function pace(w) {
        return w.speed * Math.min(1 + 0.08 * w.age, 1.5);
    }

    // Every segment out of the Queen as a point with its velocity in px/s.
    // Those still beyond a side wall are counted too: a head comes in from
    // there. A head may drop or climb a row on any step, so it is marked.
    function segments(s) {
        var out = [];
        s.worms.forEach(function (w) {
            var v = pace(w) * CELL;
            w.segs.forEach(function (g, k) {
                if (g.cy < w.gate) return;
                var x = cellX(g.px + (g.cx - g.px) * w.t), y = cellY(g.py + (g.cy - g.py) * w.t);
                out.push({ x: x, y: y, vx: (g.cx - g.px) * v, vy: (g.cy - g.py) * v, head: k === 0 });
            });
        });
        return out;
    }

    function queenX(t) {
        return 480 + Math.sin(t * 0.4) * 250 + Math.sin(t * 0.93 + 1) * 110;
    }

    function lead(t, p) {
        return Math.max(12, Math.min(948, t.x + t.vx * Math.max(0, p.y - t.y) / SHOT));
    }

    // The x to fire from.
    function aimX(s, segs, p) {
        var para = null, low = null;
        s.bugs.forEach(function (b) { if (b.kind === 'para' && b.x > 10 && b.x < 950 && b.y < p.y - 60) para = b; });
        if (para) return lead(para, p);
        segs.forEach(function (g) { if (g.x > 0 && g.x < 960 && g.y < p.y - 20 && (!low || g.y > low.y)) low = g; });
        // The Queen's head comes first while her brood is still high up:
        // every hit on her brings the end of the breeding closer.
        if (s.queen && (!low || low.y < cellY(ZONE - 5))) return queenX(s.time + (p.y - (s.queen.y + 46)) / SHOT + 0.05);
        return low ? lead(low, p) : p.x;
    }

    // How close the nearest threat comes within the next half second to a
    // turret heading from p to (tx, ty) at about full speed: the way there
    // counts as much as the spot. A parasite may flip its vertical direction
    // at any moment, so both are tried.
    function danger(s, segs, p, tx, ty) {
        var worst = 1e9, far = Math.hypot(tx - p.x, ty - p.y) || 1;
        for (var t = 0; t <= 0.5; t += 0.05) {
            var k = Math.min(1, t * 300 / far), x = p.x + (tx - p.x) * k, y = p.y + (ty - p.y) * k;
            segs.forEach(function (g) {
                // A worm meeting a side wall comes back along the next row.
                var gx = g.x + g.vx * t, gy = g.y + g.vy * t;
                if (gx < 12 || gx > 948) { gx = gx < 12 ? 24 - gx : 1896 - gx; gy += CELL; }
                var dy = Math.abs(gy - y);
                worst = Math.min(worst, Math.hypot(gx - x, g.head ? Math.max(0, dy - CELL) : dy));
            });
            s.bugs.forEach(function (b) {
                var bx = b.x + b.vx * t, margin = b.kind === 'para' ? b.r + 24 : b.r;
                worst = Math.min(worst, Math.hypot(bx - x, b.y + b.vy * t - y) - margin);
                if (b.kind === 'para') worst = Math.min(worst, Math.hypot(bx - x, b.y - b.vy * t - y) - margin);
            });
        }
        return worst;
    }

    // Whether bone stands in the turret's way (a 16 px box) on the straight
    // line to (tx, ty): nodes stop it dead.
    function walledOff(s, p, tx, ty) {
        var steps = Math.ceil(Math.hypot(tx - p.x, ty - p.y) / 8);
        for (var i = 1; i <= steps; i++) {
            var x = p.x + (tx - p.x) * i / steps, y = p.y + (ty - p.y) * i / steps;
            for (var j = 0; j < 4; j++) {
                var c = Math.floor((x + (j % 2 ? 8 : -8)) / CELL), r = Math.floor((y + (j < 2 ? -8 : 8) - OY) / CELL);
                if (c >= 0 && c < COLS && r >= 0 && r < ROWS && s.hp[r * COLS + c]) return true;
            }
        }
        return false;
    }

    // The safe spot nearest the firing line, or the least dangerous one.
    function choose(s, segs, p, want) {
        var best = null, refuge = null;
        for (var r = ZONE + 1; r < ROWS; r++) {
            for (var c = 0; c < COLS; c++) {
                var x = cellX(c), y = cellY(r);
                if (Math.abs(x - p.x) > 260 || s.hp[r * COLS + c]) continue;
                var d = danger(s, segs, p, x, y);
                // The lower rows give the shots the longest look and the
                // worms the furthest to come.
                // The side walls are where a turret gets cornered.
                var cost = Math.abs(x - want) + (ROWS - 1 - r) * 30 + Math.abs(x - p.x) * 0.3 + Math.abs(y - p.y) * 0.3 + (x < 70 || x > 890 ? 150 : 0);
                if (d >= SAFE && (!best || cost < best.cost)) best = { x: x, y: y, cost: cost };
                if (!refuge || d > refuge.d) refuge = { x: x, y: y, d: d };
            }
        }
        return best || refuge || { x: p.x, y: p.y };
    }

    function play(s, G, mem) {
        var p = s.player, segs = segments(s), spot = choose(s, segs, p, aimX(s, segs, p));
        var dx = spot.x - p.x, dy = spot.y - p.y, input = { a: true };
        if (dx < -4) input.left = true; else if (dx > 4) input.right = true;
        if (dy < -6) input.up = true; else if (dy > 6) input.down = true;
        return input;
    }

    return { play: play, budget: 400 };
})()
