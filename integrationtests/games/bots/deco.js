// Last Call campaign bot: ↑ ↓ to change taps, POUR / FIZZ, and → at the tap
// to hide the gin. It stays at the taps (where an empty is always caught)
// and every tick picks the most urgent job among the four bars: an empty
// sliding home, or the next thirsty guest on a bar that has fewer drinks
// coming down it than guests waiting. Agents and the sergeant get seltzer,
// everyone else gin (never while the gin is hidden). On the gala it tops up
// the champagne tower on the beat; on a raid warning it hides the gin.
(function () {
    var BAR_END = 836, TAP_X = 868, CATCH = 40, FRIC = 110, GLASS_V = 560, BEAT = 0.9;

    // Seconds a glass moving at speed v takes to cover d pixels under friction.
    function travel(v, d) {
        if (d <= 0) return 0;
        var r = v * v - 2 * FRIC * d;
        return r <= 0 ? 99 : (v - Math.sqrt(r)) / FRIC;
    }

    function walkSpeed(s, g) {
        if (g.kind === 'sarge') return 62;
        var v = s.cfg.walk * (g.kind === 'agent' ? 1.1 : 1);
        if (s.tower && s.tower.dry) v *= 1.5;
        return g.rush > 0 ? v * 1.8 : v;
    }

    // The guests on a bar that a new drink could still reach, rightmost
    // first: walkers, and drinkers about to put their glass down.
    function thirsty(s, bar) {
        return s.guests.filter(function (g) {
            return g.bar === bar && (g.st === 'walk' || (g.st === 'drink' && g.drink < 0.3 && !g.vx));
        }).sort(function (a, b) { return b.x - a.x; });
    }

    // Jobs: {bar, at (seconds until it must be done), kind}.
    function jobs(s) {
        var list = [], hidden = s.raid && s.raid.hidden;
        for (var bar = 0; bar < 4; bar++) {
            var coming = s.glasses.filter(function (gl) { return gl.bar === bar && gl.kind !== 'empty'; }).length;
            var queue = thirsty(s, bar), g = queue[coming];
            if (g) {
                var want = g.kind === 'guest' ? 'gin' : 'water';
                var left = (BAR_END - 26 - g.x) / walkSpeed(s, g) - travel(GLASS_V, BAR_END - 8 - g.x);
                if (!(want === 'gin' && hidden)) list.push({ bar: bar, at: left, kind: want });
            }
        }
        s.glasses.forEach(function (gl) {
            if (gl.kind !== 'empty') return;
            list.push({ bar: gl.bar, at: travel(Math.max(gl.vx, 1), TAP_X - CATCH - gl.x), kind: 'empty' });
        });
        return list.sort(function (a, b) { return a.at - b.at; });
    }

    // Presses a button only every other tick, so each press is a new hit.
    function press(input, mem, key) {
        if (mem.last && mem.last[key]) return;
        input[key] = true;
    }

    function steer(s, input, mem, bar) {
        var d = (bar - s.bt.bar + 4) % 4;
        if (d) press(input, mem, d <= 2 ? 'down' : 'up');
    }

    function extras(s, input, mem) {
        if (s.raid && s.raid.warn > 0 && !s.raid.hidden) {
            if (s.bt.x >= TAP_X - 2) press(input, mem, 'right'); else input.right = true;
        }
        if (s.tower && s.tower.fill < 0.8) {
            var p = ((s.t + 1 / 60) % BEAT) / BEAT;
            if (p < 0.1 || p > 0.93) press(input, mem, 'b');
        }
    }

    function play(s, G, mem) {
        var input = {}, list = jobs(s), here = s.bt.bar;
        extras(s, input, mem);
        // An empty about to arrive here keeps the bartender home.
        var stay = list.some(function (j) { return j.kind === 'empty' && j.bar === here && j.at < 0.3; });
        var job = stay ? null : list[0];
        if (job && job.bar !== here) steer(s, input, mem, job.bar);
        else {
            var mine = list.filter(function (j) { return j.bar === here && j.kind !== 'empty'; })[0];
            if (mine && s.bt.cool <= 0 && s.bt.x >= TAP_X - 2 && !input.up && !input.down) press(input, mem, mine.kind === 'gin' ? 'a' : 'b');
        }
        mem.last = input;
        return input;
    }

    // Stands at one tap and does nothing: guests reach the end.
    function fail() { return {}; }

    return { play: play, fail: fail, budget: 300 };
})()
