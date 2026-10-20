(function () {
    var G = SnoGame,
        wins = [];
    function angle(a) {
        return Math.atan2(Math.sin(a), Math.cos(a));
    }
    function control(i, s) {
        if (G.debug.state().screen !== 'play') return {};
        var q = s.ship,
            pad = s.pads[Math.min(s.step, s.pads.length - 1)],
            tx = pad.cx,
            ty = pad.cy - 12;
        if (q.landed >= 0) return { a: true };
        if (s.cfg.cave) {
            var ahead = Math.min(s.cfg.w, q.x + 80),
                points = s.cfg.cave;
            for (var k = 1; k < points.length; k++)
                if (ahead <= points[k][0]) {
                    var a = points[k - 1],
                        b = points[k];
                    ty = a[1] + ((b[1] - a[1]) * (ahead - a[0])) / (b[0] - a[0]);
                    break;
                }
            if (pad.cx - q.x > 130) tx = q.x + 180;
            else ty = pad.cy - 12;
            var can = s.cans.find(function (c) {
                return !c.taken;
            });
            if (can && can.x - q.x < 115) {
                tx = can.x;
                ty = can.y;
            }
        } else if (!s.cfg.station && Math.abs(tx - q.x) > 150) ty = 180;
        if (s.cfg.station) {
            var station = s.cfg.station,
                theta = Math.atan2(q.y - station.y, q.x - station.x),
                goal = s.t * station.spin + pad.phase;
            var delta = angle(goal - theta),
                radial = Math.abs(delta) < 0.16 ? station.d + 12 : 164;
            var direction = theta + Math.max(-0.28, Math.min(0.28, delta));
            tx = station.x + Math.cos(direction) * radial;
            ty = station.y + Math.sin(direction) * radial;
        }
        var ax = Math.max(
            -70,
            Math.min(70, (tx - q.x) * 0.65 - (q.vx - (s.cfg.station ? pad.vx : 0)) * (s.cfg.station ? 2.3 : 1.4)),
        );
        var ay = Math.max(-90, Math.min(100, (ty - q.y) * 0.8 - (q.vy - (s.cfg.station ? pad.vy : 0)) * 2.3));
        var gx = 0,
            gy = s.cfg.g;
        if (s.cfg.station) {
            var st = s.cfg.station,
                d = Math.hypot(q.x - st.x, q.y - st.y);
            gx = ((st.x - q.x) / d) * st.g;
            gy = ((st.y - q.y) / d) * st.g;
        }
        if (s.cfg.station && s.step > 0) {
            var radialSpeed = (radial - Math.hypot(q.x - station.x, q.y - station.y)) * 0.7;
            var tangential = station.spin * radial + Math.max(-12, Math.min(12, delta * 20));
            var vx = Math.cos(theta) * radialSpeed - Math.sin(theta) * tangential;
            var vy = Math.sin(theta) * radialSpeed + Math.cos(theta) * tangential;
            ax = (vx - q.vx) * 2.5;
            ay = (vy - q.vy) * 2.5;
        }
        var ux = ax - gx,
            uy = ay - gy,
            aim = Math.atan2(ux, -uy),
            diff = angle(aim - q.ang);
        return {
            left: diff < -0.025,
            right: diff > 0.025,
            a: Math.abs(diff) < 0.3 && Math.hypot(ux, uy) > 65,
        };
    }
    function play(input) {
        for (var i = 0; i < 20000; i++) {
            var screen = G.debug.state().screen;
            if (screen === 'clear' || screen === 'victory' || screen === 'over') break;
            G.debug.step(1, input);
        }
    }
    [1, 2, 3].forEach(function (level) {
        G.debug.start(level);
        play(control);
        var s = G.debug.s();
        wins.push({
            level: level,
            screen: G.debug.state().screen,
            step: s.step,
            fuel: s.ship.fuel,
            time: s.t,
            x: s.ship.x,
            y: s.ship.y,
            cans: s.cans.map(function (c) {
                return c.taken;
            }),
        });
    });
    var idle = [];
    [1, 2, 3].forEach(function (level) {
        G.debug.start(level);
        play({});
        idle.push({ level: level, screen: G.debug.state().screen });
    });
    return { wins: wins, idle: idle, errors: G.debug.errors.slice() };
})();
