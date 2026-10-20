// Orbital Dock campaign bot: a PD autopilot on the stick. It picks a point
// to fly to (cruise altitude while the next pad is far, the deck once over
// it; on the starbase a point on the arm's circle that trails the target
// arm, or a canister on the way), works out the acceleration that gets there without overshooting,
// adds back gravity, turns the nose along that vector and burns only when
// pointed within 0.3 rad of it. Landing slowly and upright, cargo pick-up
// and the docking spin all fall out of that one controller; lifting off a
// pad is a burn while seated.
({
    play: function (s, G, mem) {
        function angle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
        var q = s.ship, pad = s.pads[Math.min(s.step, s.pads.length - 1)], st = s.cfg.station;
        var tx = pad.cx, ty = pad.cy - 12, radial = 0, delta = 0, theta = 0;
        if (q.landed >= 0) return { a: true };
        if (!st && Math.abs(tx - q.x) > 150) ty = 180;
        // A canister on the way to the pad is worth the small detour.
        var can = s.cans.filter(function (c) { return !c.taken && (c.x - q.x) * (pad.cx - q.x) > 0 && Math.abs(c.x - q.x) < 450; })[0];
        if (can && Math.abs(pad.cx - q.x) > 300) { tx = can.x; ty = can.y; }
        if (st) {
            theta = Math.atan2(q.y - st.y, q.x - st.x);
            delta = angle(s.t * st.spin + pad.phase - theta);
            radial = Math.abs(delta) < 0.16 ? st.d + 12 : 164;
            var dir = theta + Math.max(-0.28, Math.min(0.28, delta));
            tx = st.x + Math.cos(dir) * radial;
            ty = st.y + Math.sin(dir) * radial;
        }
        var ax = Math.max(-70, Math.min(70, (tx - q.x) * 0.65 - (q.vx - (st ? pad.vx : 0)) * (st ? 2.3 : 1.4)));
        var ay = Math.max(-90, Math.min(100, (ty - q.y) * 0.8 - (q.vy - (st ? pad.vy : 0)) * 2.3));
        var gx = 0, gy = s.cfg.g;
        if (st) {
            var d = Math.hypot(q.x - st.x, q.y - st.y);
            gx = (st.x - q.x) / d * st.g; gy = (st.y - q.y) / d * st.g;
        }
        // Carrying the crate round the station: match the arm's own motion.
        if (st && s.step > 0) {
            var inward = (radial - Math.hypot(q.x - st.x, q.y - st.y)) * 0.7;
            var along = st.spin * radial + Math.max(-12, Math.min(12, delta * 20));
            ax = (Math.cos(theta) * inward - Math.sin(theta) * along - q.vx) * 2.5;
            ay = (Math.sin(theta) * inward + Math.cos(theta) * along - q.vy) * 2.5;
        }
        var ux = ax - gx, uy = ay - gy, diff = angle(Math.atan2(ux, -uy) - q.ang);
        return { left: diff < -0.025, right: diff > 0.025, a: Math.abs(diff) < 0.3 && Math.hypot(ux, uy) > 65 };
    },
    budget: 360
})
