// Polar Rush campaign bot: ← → carve, TUCK (B) and JUMP (A) only.
// It follows the racing line through the gate centres a little ahead of the
// skier, tucks for speed while it is on the line and stands up to carve
// (which bleeds speed, the game's brake) when it has drifted off it, and hops
// rocks and crevasses that lie in its path.
({
    play: function (s, G, mem) {
        var sk = s.sk, gates = s.gates, gap = s.cfg.gap;
        // Look further ahead the faster the skier goes.
        var y = sk.y + 60 + sk.vy * 0.12, n = Math.floor((y - 700) / gap), target;
        if (n < 0) target = G.lerp(480, gates[0].x, G.clamp(y / 700, 0, 1));
        else if (n >= gates.length - 1) target = gates[gates.length - 1].x;
        else target = G.lerp(gates[n].x, gates[n + 1].x, (y - gates[n].y) / gap);
        var err = target - sk.x - sk.vx * 0.14;
        var hazard = s.obs.some(function (o) {
            var d = o.y - sk.y;
            return (o.k === 'crev' || o.k === 'rock') && d > 30 && d < 105 && Math.abs(o.x - sk.x) < (o.w ? o.w / 2 + 15 : 24);
        });
        // One press per hazard: A goes down for one tick, then up again.
        var jump = hazard && !mem.jumped && sk.z === 0;
        mem.jumped = jump;
        return { left: err < -8, right: err > 8, a: jump, b: !jump && Math.abs(err) < 70 };
    },
    budget: 240
})
