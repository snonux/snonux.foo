// Outrun the Sun campaign bot: picks the lane with the least traffic and
// fewest obstacles ahead (keeping out of the oncoming lanes), steers against
// the curve's push, the crosswind and oil, holds a speed the sharpest bend in
// sight allows, and fires nitro on straights. It reads the road; it only
// presses the arrows and A.
({
    play: function (s) {
        var MAX = 12000, z = s.pos + 1050, idx = Math.floor(z / 200), seg = s.segs[idx];
        var pct = s.speed / MAX, curve = Math.abs(seg.curve), lanes = [0.75, 0.25, -0.25, -0.75];
        var target = 0.25, best = Infinity, n, i, k, lane, cost, car, dz, meet, spr, sprites;
        for (n = 0; n < 35 && s.segs[idx + n]; n++) curve = Math.max(curve, Math.abs(s.segs[idx + n].curve));
        for (i = 0; i < lanes.length; i++) {
            lane = lanes[i];
            cost = Math.abs(lane - s.x) * 2 + (s.L.oncoming && lane < 0 ? 4 : 0);
            for (k = 0; k < s.cars.length; k++) {
                car = s.cars[k]; dz = car.z - z;
                if (car.gone || dz <= -300 || dz >= 16000 || Math.abs(lane - car.off) >= 0.29) continue;
                meet = car.dir < 0 ? dz / Math.max(1, s.speed + car.speed) : dz / Math.max(1, s.speed - car.v);
                if (dz < 1600 || (meet > 0 && meet < 1.5)) cost += 12 / Math.max(0.2, meet);
            }
            for (k = 0; k < 45 && s.segs[idx + k]; k++) {
                sprites = s.segs[idx + k].sprites;
                for (n = 0; n < sprites.length; n++) {
                    spr = sprites[n];
                    if (!spr.dead && Math.abs(lane - spr.off) < (spr.kind === 'barrier' ? 0.4 : 0.28)) cost += 14 * (1 - k / 45);
                }
            }
            if (cost < best) { best = cost; target = lane; }
        }
        var push = (s.L.storm ? 1.25 : 1) * (s.slip > 0 ? 1.5 : 1);
        var drift = 0.6 * pct * pct * seg.curve * push;
        var desired = drift - s.wind * pct + (target - s.x) * (s.slip > 0 ? 1.4 : 3);
        var wheel = desired + (desired - s.vx) * 0.25;
        var top = Math.min(1.22, Math.sqrt(1.8 / Math.max(0.1, 0.6 * curve * (s.L.storm ? 1.25 : 1))));
        if (s.slip > 0) top = Math.min(top, 0.7);
        return {
            up: pct < top, down: pct > top + 0.04, left: wheel < -0.08, right: wheel > 0.08,
            a: s.nitro > 0.05 && curve < 1.1 && pct < top && Math.abs(target - s.x) < 0.18
        };
    },
    // Idle (the default) parks on the grid until the sun sets.
    budget: 240
})
