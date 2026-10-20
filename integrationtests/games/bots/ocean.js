// Deep Channel campaign bot. It flies the boat like a pilot with ballast
// and trim: it picks a depth a little ahead that keeps clear of the rock and
// of whatever lives there, steers towards it with a damped controller
// (the boat sinks and drifts with the currents on its own), fires torpedoes
// ahead and drops depth charges on what lurks below, and trims back to
// linger in a bubble column when the air runs low. At the kraken it keeps
// level with the eye, shoots its way through the arms and dashes for air.
({
    play: function (s, G, mem) {
        var b = s.sub, k = s.boss, CS = 16;
        function sample(arr, x) {
            var f = G.clamp(x / CS, 0, arr.length - 1.001), i = Math.floor(f);
            return G.lerp(arr[i], arr[i + 1], f - i);
        }
        function top(x) { return sample(s.top, x); }
        function bot(x) { return sample(s.bot, x); }
        var RADIUS = { jelly: 30, mine: 36, angler: 40, esub: 34, stal: 30, crate: 0, vent: 0 };

        // How bad a depth y is at x: rock nearby, and every hazard close by.
        function danger(x, y) {
            var d = 0, room = Math.min(y - top(x), bot(x) - y);
            if (room < 22) d += (22 - room) * 40;
            s.ents.forEach(function (e) {
                var r = RADIUS[e.kind], dx = e.x - x;
                if (e.kind === 'vent' && (e.on || e.warn) && Math.abs(e.x - x) < 70 && y > e.y - e.h - 24) d += 900;
                if (!r || dx < -60 || dx > 260) return;
                var ey = e.y;
                if (e.kind === 'stal' && e.state !== 'hang') ey = Math.max(e.y, y);   // falling: its whole column
                var near = Math.abs(ey - y);
                if (near < r) d += (r - near) * 30 * (1 - Math.max(0, dx) / 300);
            });
            s.shots.forEach(function (h) {
                if (h.x < x - 40 || h.x > x + 320) return;
                var ty = h.y + h.vy * Math.max(0, (h.x - x) / Math.max(60, -h.vx + s.scroll));
                if (Math.abs(ty - y) < 34) d += (34 - Math.abs(ty - y)) * 25;
            });
            return d;
        }
        function bestDepth(x, prefer) {
            var t = top(x) + 24, bt = bot(x) - 24, best = prefer, score = 1e9;
            for (var y = t; y <= bt; y += 8) {
                var v = danger(x, y) + Math.abs(y - prefer) * 0.6;
                if (v < score) { score = v; best = y; }
            }
            return best;
        }

        var look = b.x + 70, mid = (top(look) + bot(look)) / 2, tx = 220, ty;
        var col = s.cols.filter(function (c) { return c.x > b.x - 45; })[0];
        mem.breathing = s.o2 < 55 ? true : (s.o2 > 96 ? false : mem.breathing);
        if (mem.breathing && col && col.x - s.cam < 640) tx = G.clamp(col.x - s.cam, 70, 560);
        ty = bestDepth(look, mem.ty === undefined ? mid : G.lerp(mem.ty, mid, 0.05));
        if (k && k.awake) {
            // Level with the eye, back from the arms, and into the air when short of it.
            tx = mem.breathing ? 505 : 300;
            ty = bestDepth(b.x + 40, mem.breathing ? G.clamp(k.y, top(b.x) + 30, bot(b.x) - 30) : k.y - 3);
        }
        mem.ty = ty;
        var dx = tx - (b.x - s.cam), dy = ty - b.y;
        var below = s.ents.some(function (e) {
            return (e.kind === 'mine' || e.kind === 'angler' || e.kind === 'crate') && e.y > b.y + 30 && e.x - b.x > 20 && e.x - b.x < 160;
        });
        return {
            left: dx - b.vx * 0.35 < -8, right: dx - b.vx * 0.35 > 8,
            up: dy - b.vy * 0.35 < -6, down: dy - b.vy * 0.35 > 10,
            a: true, b: below
        };
    },
    budget: 300
})
