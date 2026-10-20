// Nukem Time campaign bot. It reads the tile map, plans a route of walks,
// jumps and platform rides with a small Dijkstra search to the keycard (or
// the Overlord, who carries it on level 3) and then the exit, and follows it
// with ordinary run, jump, fire and grenade input. It stops to shoot what is
// in its way, waits out laser gates, throws grenades at turrets and fights
// the Overlord by keeping its distance and jumping its shockwaves.
({
    play: function (s, G, mem) {
        var T = 30, p = s.p;
        mem.tick = (mem.tick || 0) + 1;

        function tile(c, r) { var row = s.map[r]; return (row && row[c]) || ' '; }
        function solid(c, r) { if (c < 0 || c >= s.cols || r < 1) return true; var t = tile(c, r); return t === '#' || t === 'c'; }
        // The bottom of an acid pool is solid but nowhere to stand.
        function standable(c, r) { return r >= 2 && r < 18 && c >= 0 && c < s.cols && solid(c, r) && !solid(c, r - 1) && !solid(c, r - 2) && tile(c, r - 1) !== '~'; }
        function towards(dx, dead) { return dx > dead ? 1 : (dx < -dead ? -1 : 0); }

        // --- the route graph: standable tiles plus both ends of every mover ---
        function moverEnd(i, end) {
            var m = s.movers[i];
            return { id: 'm' + i + end, mover: i, end: end, x0: end === 'a' ? m.ax : m.bx, y: end === 'a' ? m.ay : m.by, w: m.w };
        }
        function staticNode(c, r) { return { id: c + ',' + r, c: c, r: r, x0: c * T, y: r * T, w: T }; }
        // Whether a jump (or a step off a ledge) gets from a to b.
        function reach(a, b) {
            var gap = Math.max(0, b.x0 - (a.x0 + a.w), a.x0 - (b.x0 + b.w));
            if (gap > 4 * T + 2) return false;
            if (b.y < a.y) return a.y - b.y <= 3 * T && gap <= 3 * T;
            return true;
        }
        // A jump between static tiles must not pass through a wall on the way.
        function clearBetween(a, b) {
            var c0 = Math.min(a.c, b.c) + 1, c1 = Math.max(a.c, b.c) - 1, top = Math.min(a.r, b.r) - 4;
            for (var c = c0; c <= c1; c++) {
                for (var r = Math.max(1, top); r < Math.max(a.r, b.r); r++) if (solid(c, r)) return false;
            }
            return true;
        }
        function graph() {
            var nodes = {}, list = [], c, r;
            for (c = 0; c < s.cols; c++) for (r = 2; r < 18; r++) if (standable(c, r)) { var n = staticNode(c, r); nodes[n.id] = n; list.push(n); }
            var ends = [];
            s.movers.forEach(function (m, i) { ['a', 'b'].forEach(function (e) { var n = moverEnd(i, e); nodes[n.id] = n; ends.push(n); }); });
            var edges = {};
            function add(a, b, cost, kind) { (edges[a.id] = edges[a.id] || []).push({ to: b, cost: cost, kind: kind }); }
            list.forEach(function (a) {
                for (var dc = -5; dc <= 5; dc++) {
                    if (!dc) continue;
                    for (var dr = -3; dr <= 8; dr++) {
                        var b = nodes[(a.c + dc) + ',' + (a.r + dr)];
                        if (!b || !reach(a, b)) continue;
                        if (Math.abs(dc) === 1 && dr === 0) add(a, b, 1, 'walk');
                        // A full three-tile climb is a jump at the limit: only when nothing else will do.
                        else if (clearBetween(a, b)) add(a, b, 2 + Math.abs(dc) * 1.2 + (dr <= -3 ? 8 : Math.max(0, -dr)), 'jump');
                    }
                }
                ends.forEach(function (e) {
                    if (reach(a, e)) add(a, e, 3, 'board');
                    if (reach(e, a)) add(e, a, 3, 'leave');
                });
            });
            ends.forEach(function (e) {
                var other = nodes['m' + e.mover + (e.end === 'a' ? 'b' : 'a')], m = s.movers[e.mover];
                add(e, other, 4 + m.period / 2, 'ride');
                ends.forEach(function (f) { if (f.mover !== e.mover && reach(e, f)) add(e, f, 3, 'board'); });
            });
            return { nodes: nodes, edges: edges };
        }
        function route(g, start, isGoal) {
            var dist = {}, prev = {}, open = [start];
            dist[start.id] = 0;
            while (open.length) {
                var bi = 0;
                for (var i = 1; i < open.length; i++) if (dist[open[i].id] < dist[open[bi].id]) bi = i;
                var a = open.splice(bi, 1)[0];
                if (isGoal(a)) {
                    var path = [];
                    for (var n = a; prev[n.id]; n = prev[n.id].from) path.unshift(prev[n.id]);
                    return path;
                }
                (g.edges[a.id] || []).forEach(function (e) {
                    var d = dist[a.id] + e.cost;
                    if (dist[e.to.id] !== undefined && dist[e.to.id] <= d) return;
                    dist[e.to.id] = d; prev[e.to.id] = { from: a, to: e.to, kind: e.kind };
                    open.push(e.to);
                });
            }
            return null;
        }

        // --- where the bot is and where it wants to be ---
        function here(g) {
            if (p.ride) {
                var i = s.movers.indexOf(p.ride), m = p.ride;
                var end = Math.abs(m.x - m.ax) + Math.abs(m.y - m.ay) <= Math.abs(m.x - m.bx) + Math.abs(m.y - m.by) ? 'a' : 'b';
                return g.nodes['m' + i + end];
            }
            if (!p.ground) return null;
            var r = Math.round((p.y + p.h) / T), mid = p.x + p.w / 2, c = Math.floor(mid / T);
            return g.nodes[c + ',' + r] || g.nodes[Math.floor((p.x + 2) / T) + ',' + r] || g.nodes[Math.floor((p.x + p.w - 2) / T) + ',' + r] || null;
        }
        function goalTest() {
            if (!s.haveCard && s.card) {
                var cx = s.card.x + 15, cy = s.card.y + 15;
                return function (n) {
                    if (n.mover !== undefined) return false;
                    return Math.abs(n.x0 + 15 - cx) < 24 && n.y >= cy - 4 && n.y - 26 <= cy + 18;
                };
            }
            if (!s.haveCard && s.boss) return function (n) { return n.c !== undefined && n.c * T > s.arena.x0 + 6 * T && n.r === 16; };
            var dc = Math.floor(s.door.x / T);
            return function (n) { return n.c === dc && n.r === 16; };
        }
        // A card above a platform's track has no tile to stand on: then the
        // ride itself picks it up, and the goal is the far side.
        function cardFallback() {
            var cc = Math.floor(s.card.x / T);
            return function (n) { return n.c !== undefined && n.c > cc + 4 && n.r === 16; };
        }
        function plan() {
            var g = mem.g && mem.gmap === mem.crates ? mem.g : graph(), start = here(g);
            mem.g = g; mem.gmap = mem.crates;
            if (!start) return;
            var path = route(g, start, goalTest());
            if (!path && !s.haveCard && s.card) path = route(g, start, cardFallback());
            mem.path = path; mem.planned = mem.tick;
        }
        // Crates are part of the map and break: rebuild the graph when the
        // count changes.
        var crates = 0;
        for (var cr = 0; cr < s.map.length; cr++) for (var cc = 0; cc < s.cols; cc++) if (s.map[cr][cc] === 'c') crates++;
        if (crates !== mem.crates) { mem.crates = crates; mem.g = null; mem.path = null; }

        var q = { dir: 0, jump: false, a: true, b: false };
        if (s.boss && s.boss.awake && !s.boss.dead) fight(q);
        else follow(q);
        threats(q);
        // A jump needs a fresh press of UP, held for full height.
        mem.jumpFrames = (mem.jumpFrames || 0) - 1;
        if ((p.ground || p.ride) && mem.jumpFrames > 0 && mem.jumpFrames < 26) mem.jumpFrames = 0;   // landed early
        if (q.jump && (p.ground || p.ride) && !mem.up && mem.jumpFrames <= 0) mem.jumpFrames = 34;
        var up = mem.jumpFrames > 0;
        mem.up = up;
        return { right: q.dir > 0, left: q.dir < 0, up: up, a: q.a, b: q.b };

        // --- following the route ---
        function follow(q) {
            var g = mem.g, at = g ? here(g) : null;
            if (!mem.path || (at && mem.path.length && mem.path[0].from.id !== at.id && !onPath(at)) || (at && mem.tick - (mem.planned || 0) > 90)) plan();
            g = mem.g; at = here(g);
            var path = mem.path;
            if (!path || !path.length) { q.dir = s.haveCard ? towards(s.door.x - p.x, 4) : 1; q.jump = p.ground && mem.tick % 70 === 0; return; }
            if (at && path[0].from.id !== at.id) {
                var k = indexOn(at);
                if (k > 0) path.splice(0, k);
            }
            var step = path[0];
            if (!p.ground && !p.ride) { airSteer(q, step); return; }
            act(q, step, at);
        }
        function onPath(at) { return indexOn(at) >= 0; }
        function indexOn(at) {
            for (var i = 0; i < mem.path.length; i++) if (mem.path[i].from.id === at.id) return i;
            return -1;
        }
        function centre(n) {
            if (n.mover === undefined) return n.x0 + n.w / 2;
            var m = s.movers[n.mover];
            return m.x + m.w / 2;
        }
        function airSteer(q, step) {
            q.dir = towards(centre(step.to) - (p.x + p.w / 2), 6);
            q.jump = true;
        }
        function moverAt(n) {
            var m = s.movers[n.mover];
            return Math.abs(m.x - n.x0) < 5 && Math.abs(m.y - n.y) < 5;
        }
        function act(q, step, at) {
            var to = step.to, mid = p.x + p.w / 2, dx = centre(to) - mid;
            if (step.kind === 'ride') {
                var m = s.movers[to.mover];
                q.dir = towards(m.x + m.w / 2 - mid, 8);
                return;
            }
            if (step.kind === 'walk') { q.dir = towards(dx, 0); return; }
            // A jump, a board or a leave: go to the take-off edge first.
            var from = step.from, dir = dx > 0 ? 1 : -1;
            if (from.mover !== undefined && !moverAt(from)) {
                var rm = s.movers[from.mover];
                q.dir = towards(rm.x + rm.w / 2 - mid, 8);   // ride on to the end the route leaves from
                return;
            }
            if (to.mover !== undefined && !moverAt(to)) {
                // Wait for the platform on the near side of the tile.
                var wait = from.mover === undefined ? (dir > 0 ? from.x0 + from.w - p.w / 2 - 6 : from.x0 + p.w / 2 + 6) : null;
                if (from.mover !== undefined) { var fm = s.movers[from.mover]; wait = fm.x + fm.w / 2; }
                q.dir = towards(wait - mid, 4);
                return;
            }
            var edge = from.mover === undefined ? (dir > 0 ? from.x0 + from.w - p.w / 2 - 3 : from.x0 + p.w / 2 + 3) : null;
            if (from.mover !== undefined) {
                var mv = s.movers[from.mover];
                edge = dir > 0 ? mv.x + mv.w - p.w / 2 - 6 : mv.x + p.w / 2 + 6;
            }
            q.dir = dir;
            if (to.y > from.y && Math.abs(dx) <= 1.5 * T) return;   // a step down: just walk off
            // Climbing: leave the ground a little before the ledge so the jump
            // clears its corner instead of bumping under it, but never step
            // off the tile the jump starts from.
            if (to.y < from.y && to.mover === undefined && from.mover === undefined) {
                var early = dir > 0 ? Math.max(to.x0 - p.w / 2 - 28, from.x0 + p.w / 2) : Math.min(to.x0 + to.w + p.w / 2 + 28, from.x0 + from.w - p.w / 2);
                edge = dir > 0 ? Math.min(edge, early) : Math.max(edge, early);
                if (p.ground && (dir > 0 ? mid > edge + 10 : mid < edge - 10)) { q.dir = -dir; return; }
            }
            if ((dir > 0 ? mid >= edge - 4 : mid <= edge + 4) || (p.wall && to.y < from.y)) q.jump = true;
        }

        // --- the Overlord: keep out of its fan, face it, jump what comes ---
        // Its fan of shells lands within about 250 px, so the bot holds a
        // gap of about 300, backs off when it comes closer, and when backed
        // into a corner runs under the mech while it is in the air. It jumps
        // shockwaves and aimed shots, and lobs a grenade now and then.
        function fight(q) {
            var e = s.boss, mid = p.x + p.w / 2, dx = e.x + e.w / 2 - mid, dist = Math.abs(dx), toward = dx > 0 ? 1 : -1;
            var room = toward > 0 ? mid - s.arena.x0 : s.arena.x1 - mid;   // space behind the bot
            q.dir = dist > 340 ? toward : (dist < 270 ? -toward : 0);
            if (q.dir === -toward && room < 70) q.dir = 0;
            if (room < 110 && dist < 300 && e.air && !mem.cross) mem.cross = toward;
            if (mem.cross && (mem.cross > 0 ? mid > e.x + e.w + 90 : mid < e.x - 90)) mem.cross = 0;
            if (mem.cross && !e.air && dist < 120 && (mem.cross > 0) === (dx > 0)) mem.cross = 0;   // too late: back off
            if (mem.cross) q.dir = mem.cross;
            q.jump = p.ground && s.shots.some(function (b) {
                if (!b.foe || b.bomb) return false;
                // Jump about a fifth of a second before impact: high enough by then.
                var bx = b.x - mid, closing = bx * b.vx < 0, eta = (Math.abs(bx) - 12) / Math.max(1, Math.abs(b.vx));
                return closing && eta < 0.2 && b.y > p.y - 6 && b.y < p.y + p.h + 14;
            });
            if (!q.dir && p.face !== toward) q.dir = toward;
            // A grenade bursts 95 px wide: never at a mech that close.
            q.b = p.nades > 0 && mem.tick % 80 === 0 && dist > 200 && dist < 330 && p.face === toward;
        }

        // --- what is in the way: enemies to shoot, turrets to bomb, lasers to wait out ---
        function threats(q) {
            if (s.boss && s.boss.awake && !s.boss.dead) return;
            var face = q.dir || p.face, gunY = p.y + 10;
            // Something at gun height to stand and shoot: a walker or turret
            // ahead on this floor, or a hopper about to land on the bot. Not
            // drones: under a drone the safe thing is to keep moving.
            var foe = s.enemies.filter(function (e) {
                if (e.dead || e.kind === 'boss' || e.kind === 'drone') return false;
                var dx = e.x + e.w / 2 - p.x - p.w / 2, ahead = dx * face;
                if (e.kind === 'hopper') return Math.abs(dx) < 200 && Math.abs(e.y + e.h / 2 - gunY) < 34;
                return ahead > 0 && ahead < 230 && e.y < p.y + p.h && e.y + e.h > p.y + 2;
            })[0];
            // Standing still too long brings the airstrike: give up on a foe
            // that will not die (out of the line of fire) after a few seconds.
            mem.standing = foe ? (mem.standing || 0) + 1 : 0;
            if (foe && p.ground && !p.ride && !p.inAcid && mem.standing < 240) {
                var side = foe.x + foe.w / 2 > p.x + p.w / 2 ? 1 : -1;
                q.dir = p.face !== side ? side : 0;   // turn round to face it, then stand and shoot
                // Bullets leave the muzzle a step ahead: one that close is backed off from first.
                if (Math.abs(foe.x + foe.w / 2 - p.x - p.w / 2) < 46 && foe.kind !== 'turret') q.dir = -side;
                q.jump = false;
                if (foe.kind === 'turret' && p.nades > 0 && (mem.nade || 0) <= mem.tick) { q.b = true; mem.nade = mem.tick + 100; }
            }
            // A drone dipping to gun height: turn on it and shoot, without
            // stopping under the others.
            var drone = s.enemies.filter(function (e) {
                var dx = e.x + e.w / 2 - p.x - p.w / 2;
                return !e.dead && e.kind === 'drone' && Math.abs(dx) < 200 && Math.abs(e.y + e.h / 2 - gunY) < 16;
            })[0];
            if (drone && !foe && p.ground && !p.ride && !q.jump) q.dir = drone.x + drone.w / 2 > p.x + p.w / 2 ? 1 : -1;
            // A bomb falling close overhead: get out from under it.
            var bomb = s.shots.filter(function (b) { return b.bomb && b.vy > 0 && b.y < p.y && Math.abs(b.x - p.x - p.w / 2) < 70; })[0];
            if (bomb && p.ground && !p.ride && !q.jump) q.dir = q.dir || (bomb.x > p.x + p.w / 2 ? -1 : 1);
            s.lasers.forEach(function (l) {
                var ahead = (l.x - p.x - (face > 0 ? p.w : 0)) * face;
                if (ahead < -2 || ahead > 45 || l.y + l.h < p.y || l.y > p.y + p.h) return;
                var f = (s.t + l.ph) % 2.6;
                if (!(f > 1.25 && f < 2.05)) { q.dir = ahead < 14 ? -face : 0; q.jump = false; }
            });
        }
    },
    budget: 420
})
