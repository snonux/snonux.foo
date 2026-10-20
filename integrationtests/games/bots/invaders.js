// Formation campaign bot: for every firing lane it weighs how close a shot
// from there would pass the nearest target (leading the march, divers and
// the mothership) against the danger of bombs, beams and divers arriving
// there, plus a pull toward falling capsules; then it drives to the best
// lane and holds FIRE. Input only.
(function () {
    var PY = 496, SHOT_V = 720, SPEED = 340, CHARGE = 1.2;

    function marchSpeed(s) {
        var left = s.inv.filter(function (v) { return v.kind !== 'm'; }).length;
        var thin = 1 - Math.min(1, left / s.total);
        return s.cfg.lo + (s.cfg.hi - s.cfg.lo) * thin * thin;
    }

    // How far a shot fired from x now would miss the nearest target.
    function aimMiss(s, x, v) {
        var miss = 150;
        s.inv.forEach(function (e) {
            if (e.state === 'form') miss = Math.min(miss, Math.abs(x - (e.x + s.groups[e.g].dir * v * (PY - e.y) / SHOT_V)));
            else miss = Math.min(miss, Math.abs(x - (e.x + e.vx * 0.2)));
        });
        if (s.boss) miss = Math.min(miss, Math.max(0, Math.abs(x - (s.boss.x + s.boss.vx * 0.45)) - 45));
        return miss;
    }

    // Bombs that will be where the cannon can be when they arrive, beams
    // that are charging or burning, and fliers coming down on the lane.
    function danger(s, x) {
        var p = s.player, d = 0;
        s.bombs.forEach(function (b) {
            var eta = (PY - b.y) / b.vy;
            if (eta < 0 || eta > 1.3) return;
            var reach = p.x + Math.max(-SPEED * eta, Math.min(SPEED * eta, x - p.x));
            if (Math.abs(reach - (b.x + b.vx * eta)) < (b.kind === 'zig' ? 85 : 60)) d += 2500 * (1.4 - eta);
        });
        // A beam's lane is out, and so is crossing it once it is about to fire.
        s.beams.forEach(function (b) {
            var bx = b.src.x;
            if (Math.abs(x - bx) < 50) d += 3000;
            else if (b.t > CHARGE - 0.5 && (p.x - bx) * (x - bx) < 0) d += 3000;
        });
        // A diving flier homes in until it is low and committed; from then
        // on it is judged where it will cross the cannon's row.
        s.inv.forEach(function (e) {
            if (e.state === 'form' || e.state === 'return' || e.y < 330 || e.y > PY + 20) return;
            var eta = Math.max(0, (PY - e.y) / Math.max(60, e.vy)), fx = e.x + e.vx * Math.min(eta, 0.5);
            var lo = Math.min(x, p.x) - 45, hi = Math.max(x, p.x) + 45;
            // Driving through its path counts too, not only stopping in it.
            if (Math.abs(x - fx) < 70 || (eta < 0.7 && fx > lo && fx < hi)) d += 1800 * (1.6 - Math.min(1.5, eta));
        });
        return d;
    }

    function capsulePull(s, x) {
        var pull = 0, px = s.player.x;
        s.caps.forEach(function (c) {
            if (c.y > 270 && Math.abs(c.x - px) < (PY - c.y) * 2) pull = Math.max(pull, 100 - Math.abs(x - c.x));
        });
        return pull;
    }

    function play(s) {
        var p = s.player, v = marchSpeed(s), best = p.x, cost = Infinity;
        for (var x = 30; x <= 930; x += 15) {
            var c = aimMiss(s, x, v) + Math.abs(x - p.x) * 0.14 + danger(s, x) - capsulePull(s, x);
            if (c < cost) { cost = c; best = x; }
        }
        return { left: p.x > best + 5, right: p.x < best - 5, a: true };
    }

    // The negative control: firing from the middle without ever moving.
    function fail() { return { a: true }; }

    return { play: play, fail: fail, budget: 300 };
})()
