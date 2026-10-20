// DIGGER.EXE campaign bot: a weighted search to the nearest emerald
// (digging costs a little more, a monster's surroundings a lot, a cell a bag
// would land on is out), the laser for a monster in an open straight tunnel,
// and a sidestep away from one that gets too close. Input only.
(function () {
    var COLS = 20, ROWS = 10;
    var DIRS = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]];

    function dirName(dc, dr) {
        var d = DIRS.filter(function (x) { return x[1] === dc && x[2] === dr; })[0];
        return d ? d[0] : null;
    }
    function inside(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
    function restingBag(s, c, r) { return s.bags.some(function (b) { return b.c === c && b.r === r && b.state !== 'fall'; }); }

    // The bag that would land on this cell (only open cells between), if any.
    function bagOver(s, c, r) {
        for (var k = r - 1; k >= 0; k--) {
            var b = s.bags.filter(function (x) { return x.c === c && Math.floor(x.y) === k; })[0];
            if (b) return b;
            if (s.dirt[k * COLS + c] || s.rock[k * COLS + c]) return null;
        }
        return null;
    }

    // An emerald right under a resting bag is taken from the side: the bag
    // only wobbles for a moment before it drops, time to dig on.
    function enterable(s, c, r, horizontal) {
        if (!inside(c, r) || s.rock[r * COLS + c] || restingBag(s, c, r)) return false;
        var b = bagOver(s, c, r);
        return !b || (horizontal && b.state === 'rest' && b.r === r - 1);
    }

    function foeGap(s, c, r) {
        var gap = 99;
        s.enemies.forEach(function (e) {
            if (!e.gone) gap = Math.min(gap, Math.abs(e.c + e.dc * e.p - c) + Math.abs(e.r + e.dr * e.p - r));
        });
        return s.power > 0 ? 99 : gap;
    }

    // A monster in an open straight line within reach: the way to face it.
    function laserLine(s) {
        var p = s.pl;
        if (s.charge < 1 || s.shot || s.power > 0) return null;
        for (var i = 0; i < s.enemies.length; i++) {
            var e = s.enemies[i], dx = e.c + e.dc * e.p - p.c, dy = e.r + e.dr * e.p - p.r, n = Math.abs(dx) + Math.abs(dy);
            var name = Math.abs(dx) < 0.5 ? (dy < 0 ? 'up' : 'down') : (Math.abs(dy) < 0.5 ? (dx < 0 ? 'left' : 'right') : null);
            if (!name || n > 6 || e.born > 0 || e.gone) continue;
            var d = DIRS.filter(function (x) { return x[0] === name; })[0], clear = true;
            for (var k = 1; k < n; k++) {
                var at = (p.r + d[2] * k) * COLS + p.c + d[1] * k;
                if (s.dirt[at] || s.rock[at]) clear = false;
            }
            if (clear) return name;
        }
        return null;
    }

    // The free neighbouring cell furthest from every monster.
    function fleeFrom(s, x, y) {
        var best = null, far = -1;
        DIRS.forEach(function (d) {
            var c = x + d[1], r = y + d[2];
            if (!enterable(s, c, r, d[2] === 0)) return;
            var gap = foeGap(s, c, r) + (s.dirt[r * COLS + c] ? 0 : 0.5);
            if (gap > far) { far = gap; best = d[0]; }
        });
        return best;
    }

    // Dijkstra from (c, r) to the nearest emerald; returns the first move.
    function planToGem(s, c0, r0) {
        var cost = [], open = [{ c: c0, r: r0, d: 0, f: null }];
        cost[r0 * COLS + c0] = 0;
        while (open.length) {
            var bi = 0;
            for (var i = 1; i < open.length; i++) if (open[i].d < open[bi].d) bi = i;
            var cur = open.splice(bi, 1)[0];
            if (cur.d > cost[cur.r * COLS + cur.c]) continue;
            if (cur.f && s.gem[cur.r * COLS + cur.c]) return cur.f;
            DIRS.forEach(function (d) {
                var c = cur.c + d[1], r = cur.r + d[2], at = r * COLS + c;
                if (!enterable(s, c, r, d[2] === 0)) return;
                var dd = cur.d + (s.dirt[at] ? 1.6 : 1) + (foeGap(s, c, r) < 3 ? 25 : 0);
                if (cost[at] !== undefined && cost[at] <= dd) return;
                cost[at] = dd;
                open.push({ c: c, r: r, d: dd, f: cur.f || d[0] });
            });
        }
        return null;
    }

    // Turning back mid-hop is free, so a plan that flips as a monster moves
    // could rock the digger on the spot: one U-turn a second at most unless
    // a monster is right there.
    function steady(s, mem, tick, move) {
        var p = s.pl;
        if (!move || move !== dirName(-p.dc, -p.dr) || foeGap(s, p.c, p.r) < 2.5) return move;
        if (tick - (mem.turned || -99) < 60) return dirName(p.dc, p.dr);
        mem.turned = tick;
        return move;
    }

    function play(s, G, mem) {
        var p = s.pl, tick = mem.tick = (mem.tick || 0) + 1, input = {};
        if (s.dead > 0) return input;
        var aim = laserLine(s);
        if (aim) { input[aim] = true; input.a = tick % 2 === 0; return input; }
        // Plan from the cell the digger is heading for: its next hop starts
        // there on the tick it arrives, with whatever is held then.
        var oc = p.c + p.dc, or = p.r + p.dr, x = p.c + p.dc * p.p, y = p.r + p.dr * p.p;
        var move = (p.dc || p.dr) && s.gem[or * COLS + oc] ? dirName(p.dc, p.dr) : null;
        if (!move && foeGap(s, x, y) < 2.2) move = fleeFrom(s, Math.round(x), Math.round(y));
        if (!move) move = steady(s, mem, tick, planToGem(s, oc, or));
        if (move) input[move] = true;
        input.a = tick % 2 === 0 && foeGap(s, p.c, p.r) <= 3;
        return input;
    }

    return { play: play, budget: 300 };
})()
