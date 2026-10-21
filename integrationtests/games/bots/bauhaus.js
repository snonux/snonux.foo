// Composition campaign bot: input only. It holds FIRE all the time and
// picks one lane to ride to: a crawler on the rim first (met head-on, in its
// own lane, before it can leap onto the claw), otherwise the enemy that has
// climbed highest, weighed by how far round the rim it is. Near the end of a
// level it parks on the lane with the shortest spike so the dive is clean,
// and against the core it chases the gaps in the turning ring. ZAP goes off
// when the rim gets crowded.
(function () {
    function wrap(s, k) { return ((k % s.n) + s.n) % s.n; }
    function shortest(s, a, b) { var d = wrap(s, b - a); return d > s.n / 2 ? d - s.n : d; }
    function laneOf(s) { return wrap(s, Math.floor(s.p.pos)); }

    // The nearest crawler on the rim that is not in mid-leap.
    function crawlerLane(s, pl) {
        var best = null, bestD = 99;
        s.enemies.forEach(function (e) {
            if (!e.rim) return;
            var l = e.flip >= 0 ? e.lane : e.lane, d = Math.abs(shortest(s, pl, l));
            if (d < bestD) { bestD = d; best = l; }
        });
        return best;
    }

    // The climber worth riding to: high in the tube and not far away.
    function climberLane(s, pl) {
        var best = null, bestV = -1e9;
        s.enemies.forEach(function (e) {
            if (e.rim) return;
            var l = e.flip >= 0 && e.flip < 0.5 ? e.from : e.lane;
            var v = e.z * 10 - Math.abs(shortest(s, pl, l)) * 1.2 + (e.kind === 'spiker' ? 2 : 0);
            if (v > bestV) { bestV = v; best = l; }
        });
        return best;
    }

    // The lane with the lowest spike, nearest first.
    function safeLane(s, pl) {
        var best = pl, bestV = 1e9;
        for (var k = 0; k < s.n; k++) {
            var v = s.spikes[k] * 40 + Math.abs(shortest(s, pl, k));
            if (v < bestV) { bestV = v; best = k; }
        }
        return best;
    }

    // Against the core: a lane whose ring segment is already broken, else
    // the nearest one still standing.
    function bossLane(s, pl) {
        var b = s.boss, best = pl, bestV = 1e9;
        for (var k = 0; k < s.n; k++) {
            var hp = b.seg[(k + b.rot) % s.n], v = Math.abs(shortest(s, pl, k)) + hp * 3;
            if (v < bestV) { bestV = v; best = k; }
        }
        return best;
    }

    function choose(s, pl) {
        var c = crawlerLane(s, pl);
        if (c !== null) return c;
        if (s.phase === 'dive') return safeLane(s, pl);
        if (s.phase === 'boss') return bossLane(s, pl);
        var t = climberLane(s, pl);
        if (s.kills >= s.cfg.quota - 2 && s.spikes[pl] > 0.02) return safeLane(s, pl);
        return t === null ? pl : t;
    }

    // The core's discs cannot be shot: a lane one is about to reach is
    // closed, and the claw steps to the nearest open lane beside its goal.
    function target(s, pl) {
        var closed = {}, want = choose(s, pl);
        s.bullets.forEach(function (b) { if (b.hard && b.z > 0.4) closed[b.lane] = true; });
        if (!closed[want]) return want;
        for (var r = 1; r < s.n; r++) {
            var a = wrap(s, want + r), b = wrap(s, want - r), da = Math.abs(shortest(s, pl, a)), db = Math.abs(shortest(s, pl, b));
            if (!closed[a] && !closed[b]) return da <= db ? a : b;
            if (!closed[a]) return a;
            if (!closed[b]) return b;
        }
        return want;
    }

    // Holds the key that turns the claw towards the target lane, and lets
    // go once the slide is carrying it into that lane.
    function drive(s, want, input) {
        var p = s.p, pl = laneOf(s), d = shortest(s, pl, want);
        var landing = wrap(s, Math.floor(p.pos + p.v * 0.06));
        if (d === 0 || (landing === want && Math.abs(d) <= 1)) return;
        var sign = d > 0 ? 1 : -1;
        if (p.held && p.sign === sign) { input[p.held] = true; return; }
        var key = p.rsign === sign ? 'right' : 'left';
        if (key === p.held) return;
        input[key] = true;
    }

    function play(s, G, mem) {
        var input = { a: true }, pl = laneOf(s);
        var rim = s.enemies.filter(function (e) { return e.rim; }).length;
        var high = s.enemies.filter(function (e) { return e.z > 0.8; }).length;
        mem.t = (mem.t || 0) + 1;
        if (s.zaps > 0 && (rim >= 2 || high >= 4) && mem.t % 4 === 0) input.b = true;
        drive(s, target(s, pl), input);
        return input;
    }

    // Never fires: the rim fills up and the crawlers catch the claw.
    function fail() { return {}; }

    return { play: play, fail: fail, budget: 300 };
})()
