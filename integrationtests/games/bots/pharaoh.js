// Pyramid Hop campaign bot: diagonal hops only (the four arrows).
// Each time the hero stands ready on a stone it marks the stones that are
// unsafe for the next moment (enemies and where they can hop next, the
// cobra's row ahead of it, the sand path, crumbling stones), then hops one
// step along the shortest safe way to the nearest stone that is not gold
// yet (or to the turquoise scarab, which is caught by touching it). While
// Anubis stalks the pyramid it waits on a sun-disc's boarding stone until
// he is a few hops away and then rides the disc, so he follows it over the
// edge. A mummy that gets close to a boarding stone is lured the same way.
// Ordinary input only.
(function () {
    var ROWS = 7, CW = 76, AX = 480;
    var DIRS = { ur: [-1, 0], ul: [-1, -1], dr: [1, 1], dl: [1, 0] };
    var KEY = { ur: 'up', dr: 'right', dl: 'down', ul: 'left' };
    var ORDER = ['dl', 'dr', 'ul', 'ur'];

    function cx(r, c) { return AX + (c - r / 2) * CW; }
    function onPyr(r, c) { return r >= 0 && r < ROWS && c >= 0 && c <= r; }
    function id(r, c) { return r * 16 + c + 1; }
    function stoneOf(s, r, c) { return onPyr(r, c) ? s.stones[r][c] : null; }
    function usable(s, r, c) { var st = stoneOf(s, r, c); return !!st && st.st === 'ok'; }

    // Hops between two stones: each hop moves one step in (c, r - c).
    function hops(r1, c1, r2, c2) { return Math.abs(c2 - c1) + Math.abs((r2 - c2) - (r1 - c1)); }

    function chasers(s) {
        return s.foes.filter(function (f) { return (f.kind === 'mummy' || f.kind === 'anubis') && f.state !== 'fall'; });
    }

    function markFoe(s, f, mark) {
        if (f.state === 'fall' || f.kind === 'cursed') return;
        var r = f.state === 'hop' ? f.tr : f.r, c = f.state === 'hop' ? f.tc : f.c;
        mark(f.r, f.c); mark(r, c);
        if (f.kind === 'mummy' || f.kind === 'anubis') {
            for (var k in DIRS) mark(r + DIRS[k][0], c + DIRS[k][1]);
            if (f.state === 'wake' && f.kind === 'egg') return;
        } else {
            mark(r + 1, c); mark(r + 1, c + 1);
        }
    }

    // The cobra: its row from just behind its tail to where its head will
    // be a second from now.
    function markCobra(s, mark) {
        var k = s.cobra;
        if (!k) return;
        var reach = 118 * Math.max(0, 1.0 - (k.state === 'warn' ? k.t : 0)) + 50;
        for (var c = 0; c <= k.row; c++) {
            var ahead = (cx(k.row, c) - k.x) * k.dir;
            if (ahead > -80 && ahead < reach) mark(k.row, c);
        }
    }

    function dangerMap(s) {
        var bad = {};
        function mark(r, c) { bad[id(r, c)] = true; }
        s.foes.forEach(function (f) { markFoe(s, f, mark); });
        markCobra(s, mark);
        if (s.sand) s.sand.path.forEach(function (q) { mark(q.r, q.c); });
        s.list.forEach(function (st) { if (st.st !== 'ok' || (st.crack && st.v >= st.need)) mark(st.r, st.c); });
        return bad;
    }

    // Breadth-first search from the hero's stone; returns the first hop of
    // the shortest way to a stone where goal() holds. strict keeps the
    // whole way off unsafe stones, otherwise only the first hop.
    function route(s, bad, goal, strict) {
        var p = s.p, seen = {}, queue = [];
        seen[id(p.r, p.c)] = true;
        ORDER.forEach(function (d) {
            var r = p.r + DIRS[d][0], c = p.c + DIRS[d][1];
            if (!usable(s, r, c) || bad[id(r, c)]) return;
            seen[id(r, c)] = true; queue.push({ r: r, c: c, first: d });
        });
        while (queue.length) {
            var q = queue.shift();
            if (goal(q.r, q.c)) return q.first;
            ORDER.forEach(function (d) {
                var r = q.r + DIRS[d][0], c = q.c + DIRS[d][1];
                if (!usable(s, r, c) || seen[id(r, c)] || (strict && bad[id(r, c)])) return;
                seen[id(r, c)] = true; queue.push({ r: r, c: c, first: q.first });
            });
        }
        return null;
    }

    function freeDiscNextTo(s, r, c) {
        for (var i = 0; i < s.discs.length; i++) {
            var d = s.discs[i], foot = { r: d.k + 1, c: d.side < 0 ? 0 : d.k + 1 };
            if (!d.used && foot.r === r && foot.c === c) return d.side < 0 ? 'ul' : 'ur';
        }
        return null;
    }

    // A safe neighbour as far from the chasers as possible, for when
    // nothing worth doing is reachable but staying put is not safe.
    function escape(s, bad) {
        var p = s.p, best = null, bd = -1, ch = chasers(s);
        ORDER.forEach(function (d) {
            var r = p.r + DIRS[d][0], c = p.c + DIRS[d][1];
            if (!usable(s, r, c) || bad[id(r, c)]) return;
            var far = ch.reduce(function (m, f) { return Math.min(m, hops(r, c, f.r, f.c)); }, 99);
            if (far > bd) { bd = far; best = d; }
        });
        return best;
    }

    function paintGoal(s) {
        var cursed = s.foes.filter(function (f) { return f.kind === 'cursed' && f.state === 'idle'; });
        return function (r, c) {
            var st = s.stones[r][c];
            return st.v < st.need || cursed.some(function (f) { return f.r === r && f.c === c; });
        };
    }

    // Anubis is lured from the boarding stone of the nearest free disc.
    function lure(s, bad, anubis) {
        var p = s.p, here = freeDiscNextTo(s, p.r, p.c);
        if (here) {
            var near = hops(p.r, p.c, anubis.r, anubis.c) <= 3 && anubis.state !== 'wake';
            return near || bad[id(p.r, p.c)] ? here : null;
        }
        var feet = s.discs.filter(function (d) { return !d.used; });
        var goal = function (r, c) { return feet.some(function (d) { return d.k + 1 === r && (d.side < 0 ? 0 : d.k + 1) === c; }); };
        return route(s, bad, goal, true) || route(s, bad, goal, false) || (bad[id(p.r, p.c)] ? escape(s, bad) : null);
    }

    function decide(s) {
        var p = s.p, bad = dangerMap(s), unsafe = bad[id(p.r, p.c)];
        var anubis = chasers(s).filter(function (f) { return f.kind === 'anubis'; })[0];
        if (anubis) return lure(s, bad, anubis);
        var disc = freeDiscNextTo(s, p.r, p.c);
        if (disc && chasers(s).some(function (f) { return hops(p.r, p.c, f.r, f.c) <= 2 && f.state !== 'wake'; })) return disc;
        var goal = paintGoal(s);
        var mv = route(s, bad, goal, true) || route(s, bad, goal, false);
        if (mv) return mv;
        if (!unsafe) return null;
        return escape(s, bad) || disc;
    }

    function play(s) {
        var p = s.p;
        if (s.dead || s.winT > 0 || p.state !== 'idle' || p.t > 0) return {};
        var mv = decide(s), input = {};
        if (mv) input[KEY[mv]] = true;
        return input;
    }

    return {
        play: play,
        // Negative control: keep hopping up-left off the capstone.
        fail: function () { return { left: true }; },
        budget: 400
    };
})()
