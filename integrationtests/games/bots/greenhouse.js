// Pollinator campaign bot: flies with the direction pad and stings with A.
// It plans pollen runs the way a player would: carrying a colour it flies to
// the nearest closed bud of that colour; otherwise it picks the cheapest
// pair (a flower to take pollen from, then the bud to open). It cruises at
// a height above the flower heads, ducks under or over spider webs, and
// only drops to a flower when it is right above it. Any pest that comes
// close, a raider at the hive, a wasp sipping a flower and the queen are
// fought first: the bot lines up level with them at a stand-off distance,
// turns to face them and stings. It sidesteps the queen's stingers.
(function () {
    var TOP = 88, FLOOR = 486, HIVE_X = 320, HIVE_Y = 404, CRUISE = 262;

    function dxw(s, a, b) { return ((b - a) % s.ww + s.ww * 1.5) % s.ww - s.ww / 2; }
    function dist(s, a, b) { return Math.hypot(dxw(s, a.x, b.x), b.y - a.y); }

    function nearest(s, list) {
        var best = null, bd = 1e9;
        list.forEach(function (f) { var d = dist(s, s.bee, f); if (d < bd) { bd = d; best = f; } });
        return best;
    }

    // What to fight, in order: a pest about to reach the bee, the queen, a
    // raider at the hive, a thief that can still be stopped before it has
    // sipped its flower dry. A bud the carried pollen opens close by is
    // finished first unless something is on the bee.
    function pickFoe(s) {
        var b = s.bee, close = nearest(s, s.foes.filter(function (f) { return dist(s, b, f) < 260; }));
        if (close) return close;
        if (s.queen) return s.queen;
        var bud = pickFlower(s);
        if (bud && bud.kind === b.pollen && Math.abs(dxw(s, b.x, bud.x)) < 320) return null;
        var raid = nearest(s, s.foes.filter(function (f) {
            return f.kind === 'raider' && Math.abs(dxw(s, f.x, HIVE_X)) < 260;
        }));
        if (raid) return raid;
        return nearest(s, s.foes.filter(function (f) {
            return f.kind === 'thief' && f.target && f.target.sip > 0 && dist(s, b, f) / 300 < 6.6 - f.target.sip;
        }));
    }

    // The next flower to fly to.
    function pickFlower(s) {
        var b = s.bee, best = null, bc = 1e9;
        s.flowers.forEach(function (u) {
            if (u.bloom) return;
            if (u.kind === b.pollen && u !== b.src) {
                var c = Math.abs(dxw(s, b.x, u.x)) - 5000;
                if (c < bc) { bc = c; best = u; }
                return;
            }
            s.flowers.forEach(function (f) {
                if (f === u || f.kind !== u.kind) return;
                var cost = Math.abs(dxw(s, b.x, f.x)) + Math.abs(dxw(s, f.x, u.x));
                if (cost < bc) { bc = cost; best = f; }
            });
        });
        return best;
    }

    // Cruise height: above the flower heads, under or over any web ahead.
    function cruiseY(s, tx) {
        var b = s.bee, y = CRUISE, dir = dxw(s, b.x, tx) < 0 ? -1 : 1;
        s.webs.forEach(function (w) {
            var ahead = dxw(s, b.x, w.x) * dir;
            if (ahead < -w.r - 30 || ahead > Math.abs(dxw(s, b.x, tx)) + w.r) return;
            if (Math.abs(y - w.y) > w.r + 22) return;
            y = w.y + w.r + 24 < 336 ? w.y + w.r + 24 : w.y - w.r - 24;
        });
        return Math.max(TOP + 20, y);
    }

    // A stand-off spot inside a web would hold the bee fast: take the
    // nearer edge of the web instead.
    function clearOfWebs(s, x, y) {
        s.webs.forEach(function (w) {
            if (Math.abs(dxw(s, x, w.x)) > w.r + 20 || Math.abs(y - w.y) > w.r + 20) return;
            y = y < w.y && w.y - w.r - 24 > TOP + 16 ? w.y - w.r - 24 : w.y + w.r + 24;
        });
        return Math.min(y, FLOOR - 30);
    }

    function flyTo(s, tx, ty) {
        var b = s.bee, dx = dxw(s, b.x, tx), dy = ty - b.y, out = {};
        var wantVx = Math.max(-340, Math.min(340, dx * 2.6)), wantVy = Math.max(-230, Math.min(300, dy * 3));
        if (wantVx > b.vx + 25) out.right = true; else if (wantVx < b.vx - 25) out.left = true;
        if (wantVy < b.vy - 12) out.up = true; else if (wantVy > b.vy + 60) out.down = true;
        return out;
    }

    function goFlower(s, f) {
        var b = s.bee, dx = Math.abs(dxw(s, b.x, f.x));
        if (dx > 70) {
            // Do not brush another flower's head on the way down.
            var y = cruiseY(s, f.x);
            return flyTo(s, f.x, dx < 160 ? Math.max(y, f.y - 60) : y);
        }
        return flyTo(s, f.x, f.y);
    }

    // Stand off level with the pest on the side the bee is on, face it and
    // sting when lined up.
    function fight(s, f, tick) {
        var b = s.bee, big = f === s.queen, dx = dxw(s, b.x, f.x), side = dx < 0 ? 1 : -1;
        var gap = big ? 220 : 125, ty = Math.max(TOP + 20, Math.min(FLOOR - 40, f.y + (big ? 6 : 0)));
        var out = flyTo(s, f.x + side * gap, clearOfWebs(s, f.x + side * gap, ty));
        var lined = Math.abs(f.y - b.y) < (big ? 26 : 15) && Math.abs(dx) < (big ? 260 : 230);
        if (lined) {
            // The game turns the bee before it stings, so a press towards
            // the pest (or none) keeps every dart going its way; backing
            // off waits until the shot is out.
            var face = dx < 0 ? -1 : 1, toward = face < 0 ? 'left' : 'right';
            var keep = out[toward] || b.face !== face;
            out.left = false; out.right = false;
            out[toward] = keep;
            out.a = true;
        }
        return out;
    }

    // The queen's stingers: step up or down out of any that will pass close.
    function dodge(s, out) {
        var b = s.bee;
        s.shots.forEach(function (sh) {
            for (var t = 0; t < 0.7; t += 0.05) {
                var x = dxw(s, b.x + b.vx * t, sh.x + sh.vx * t), y = sh.y + sh.vy * t - (b.y + b.vy * t);
                if (Math.hypot(x, y) < 30) {
                    var up = y > 0 || b.y > FLOOR - 70;
                    if (b.y < TOP + 50) up = false;
                    out.up = up; out.down = !up;
                    return;
                }
            }
        });
        return out;
    }

    function play(s, G, mem) {
        var tick = mem.t = (mem.t || 0) + 1, foe = pickFoe(s), out;
        if (foe) out = fight(s, foe, tick);
        else {
            var f = pickFlower(s);
            out = f ? goFlower(s, f) : flyTo(s, HIVE_X + 200, CRUISE);
        }
        return dodge(s, out);
    }

    // Negative control: fly straight into the nearest pest without stinging.
    function fail(s, G, mem) {
        var best = null, bd = 1e9;
        s.foes.forEach(function (f) { var d = dist(s, s.bee, f); if (d < bd) { bd = d; best = f; } });
        return best ? flyTo(s, best.x, best.y) : {};
    }

    return { play: play, fail: fail, budget: 300 };
})()
