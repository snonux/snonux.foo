// Gravity Well campaign bot: aims at the nearest rock with a lead, thrusts
// away from any well that gets too close, and jumps through hyperspace when
// a rock, a core or the pulsar beam is about to hit. Input only.
({
    play: function (s, G, mem) {
        var p = s.ship, tick = mem.tick = (mem.tick || 0) + 1;
        var dx = function (v) { return ((v + 1440) % 960) - 480; };
        var dy = function (v) { return ((v + 765) % 510) - 255; };
        var wrapAngle = function (v) { return Math.atan2(Math.sin(v), Math.cos(v)); };
        if (p.dead) return {};
        // Target: the nearest rock (or saucer) that has finished warping in.
        var target = null, best = Infinity, i;
        for (i = 0; i < s.rocks.length; i++) {
            var k = s.rocks[i], d = Math.hypot(dx(k.x - p.x), dy(k.y - p.y));
            if (k.warp <= 0 && d < best) { target = k; best = d; }
        }
        for (i = 0; i < s.foes.length; i++) {
            var f = s.foes[i], fd = Math.hypot(f.x - p.x, f.y - p.y);
            if (f.x > 0 && f.x < 960 && fd < best) { target = { x: f.x, y: f.y, vx: f.vx, vy: 0 }; best = fd; }
        }
        var a = p.a;
        if (target) {
            var t = best / 430;
            a = Math.atan2(dy(target.y - p.y) + (target.vy - p.vy) * t, dx(target.x - p.x) + (target.vx - p.vx) * t);
        }
        // Escape: point away from a well we are about to fall into.
        var urgent = false;
        for (i = 0; i < s.wells.length; i++) {
            var w = s.wells[i], x = dx(p.x + p.vx * 0.7 - w.x), y = dy(p.y + p.vy * 0.7 - w.y);
            // A pulsar's sweeping beam is kept at arm's length the same way.
            var keep = Math.max(w.r + Math.sqrt(w.gm / 270) * 1.5 + 30, w.beam ? w.beam + 45 : 0);
            if (Math.hypot(x, y) < keep) { a = Math.atan2(y, x); urgent = true; }
        }
        var danger = s.wells.some(function (w) { return Math.hypot(dx(p.x - w.x), dy(p.y - w.y)) < w.r + 35; });
        danger = danger || s.rocks.some(function (k) {
            return k.warp <= 0 && Math.hypot(dx(k.x + k.vx * 0.3 - p.x - p.vx * 0.3), dy(k.y + k.vy * 0.3 - p.y - p.vy * 0.3)) < k.r + 25;
        });
        danger = danger || s.foeShots.some(function (b) {
            return Math.hypot(dx(b.x + b.vx * 0.25 - p.x - p.vx * 0.25), dy(b.y + b.vy * 0.25 - p.y - p.vy * 0.25)) < 22;
        });
        s.wells.forEach(function (w) {
            if (!w.beam) return;
            var x = dx(p.x - w.x), y = dy(p.y - w.y), c = Math.cos(w.ba + w.bw * 0.3), n = Math.sin(w.ba + w.bw * 0.3);
            var along = x * c + y * n;
            if (along > 0 && along < w.beam + 20 && Math.abs(x * n - y * c) < 45) danger = true;
        });
        var err = wrapAngle(a - p.a);
        return {
            left: err < -0.045,
            right: err > 0.045,
            up: Math.abs(err) < 0.5 && (urgent || tick % 120 < 55),
            a: true,
            b: danger && p.inv <= 0 && s.hyper <= 0
        };
    },
    budget: 420
})
