/*
 * Blind Spot — the surveillance theme's game.
 *
 * A top-down facility seen through a CRT security console. Sneak through the
 * blind spots of sweeping cameras and patrolling guards, pocket every data
 * drive and reach the exit before the trace completes. Vision cones are cut
 * off by walls, so cover is real. Being watched fills the detection meter;
 * a full meter means caught, and so does touching a live beam or stepping on
 * a pressure plate. A catch costs a life, hands back every drive and starts
 * the trace over; when the trace completes the run is over. Sprinting is
 * fast but loud: noise pulls guards and drones towards it. An EMP pulse
 * switches nearby electronics off for a while, and an empty EMP slowly
 * builds one charge back up. Later levels add blinking
 * tripwires, pressure plates, drones, travelling beams and, on level 10, a
 * grid of roaming searchlights that see over the walls.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var T = 30, COLS = 32, ROWS = 17, BODY = 14;      // the HUD is exactly tile row 0
    var GREEN = '#63f3a8', PHOS = '#bcffd4', GREY = '#88a197', RED = '#ff4d5c', BG = '#09100d', PANEL = '#101916';
    var WALK = 118, SPRINT = 205, EMP_R = 150, EMP_TIME = 5;
    // feel: a guard notices anyone this close whichever way it faces (drawn
    // as a ring around it); a camera sees nothing outside its cone.
    // rate: how fast being seen fills the meter (per second, times nearness).
    // A guard at the far end of its cone needs a second and a half, a drone
    // one second: long enough to notice the alarm and step back into cover.
    var CAM = { range: 185, fov: 0.9, rate: 1.0, feel: 0 };
    var GUARD = { range: 150, fov: 1.2, rate: 1.3, feel: 16 };
    var DRONE_R = 58, DRONE_RATE = 1.0, LIGHT_R = 44, BEAM_R = 7;
    var RAY_STEP = 0.015;       // radians between the rays of a drawn cone
    var EMP_RECHARGE = 20;      // seconds an empty EMP takes to build one charge
    var BEAM_ON = 1.5;          // seconds a tripwire stays live per blink
    var BEAM_WARN = 0.4;        // seconds a dark tripwire flickers before it goes live
    var TIP_TIME = 8;           // seconds a level's hint stays on screen
    var PHONE_TIPS = [
        'WALLS BLOCK CONES', 'LET GUARDS PASS', 'CROSS BEAMS WHILE DARK',
        'PLATES: DETOUR OR EMP', 'RUNNING ATTRACTS DRONES', 'ROUND CAMERAS KEEP TURNING',
        'VAULT: EMP IN AND OUT', 'MOVING BEAMS: USE ALCOVES', 'SAVE AN EMP FOR THE EXIT',
        'LIGHTS SEE OVER WALLS'
    ];
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var FACING = { '>': 0, 'v': Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 };

    /*
     * Map legend (32 x 17 tiles, the border is always wall):
     *   #  wall            S  start           X  exit            o  data drive
     *   e  EMP cell        _  pressure plate  D  drone home      1-9 guard waypoints
     *   < > ^ v  sweeping camera facing that way      r  camera turning full circle
     *            (a camera's tile cannot be walked on)
     *   | -  blinking tripwire (a run of them is one beam)
     *   ! ~  beam that travels along its corridor (! moves sideways, ~ up and down)
     * time: seconds until the trace completes; every attempt (life) gets the
     *       whole of it. They are about twice what a clean run takes for a
     *       player who has to watch before moving, so standing still loses
     *       in one to three minutes.
     * guards: one string of waypoint digits per guard, walked in a loop
     *         ('1232' walks 1-2-3 and back). No route may overlook the start.
     * hop: seconds a drone spends at one D before flying to the next (0 = stays home).
     *      Every changeover sweeps the drones' rings across the rooms between,
     *      so the hops are long (10s and more) to leave quiet spells for looting.
     * lights: searchlights as [axis they travel on, lane in px, speed, optional
     *         nearest point they travel to — keeps the start corner dark].
     * tip: the hint shown while the level starts.
     *
     * How the levels keep a blind dash from working (it must be stealth, not
     * speed, that wins): on levels 2 and 3 the only way on is a corridor one
     * tile wide that a guard walks from end to end, so whoever does not step
     * aside into a side passage meets it; from level 4 on the short way
     * always crosses a pressure plate. On levels 7, 9 and 10 a plate seals
     * the only way in or out: that is what the EMP is for (and why an empty
     * EMP recharges - wasting the charges must not strand anyone).
     *
     * Room for error on the two hardest maps: the vault's drone (level 7)
     * hovers between the upper pillars, so its ring just misses the drive
     * below it; on level 9 the long corridor has a wall stub near each end
     * that stops the travelling beam short of the two drive nooks, and there
     * are three EMP charges for two plate doors and a drone-watched room.
     */
    var LEVELS = [
        { time: 70, emp: 2, guards: [], tip: 'STAY OUT OF THE CONES - WALLS BLOCK THEM', map: [
            '################################',
            '#......#.....v.....#...........#',
            '#.S....#...........#.....o.....#',
            '#......#...........#...........#',
            '#......#.....o.....#...........#',
            '#..................#####..######',
            '#......#.....................o.#',
            '#......#.......................#',
            '####.###########........########',
            '#..............#...............#',
            '#..............#...............#',
            '#......o.......#...............#',
            '#..............#..............<#',
            '#..............................#',
            '#.o............................#',
            '#.........^....#.............X.#',
            '################################'] },
        { time: 90, emp: 2, guards: ['21', '34'], tip: 'A GUARD GRABS WHOEVER IT MEETS - LET IT PASS FROM A SIDE PASSAGE', map: [
            '################################',
            '#.......#.......v..............#',
            '#.S.....#......................#',
            '#..........###########.........#',
            '#.......#.....o................#',
            '##.#############################',
            '##.######o#############o########',
            '##.######.#############.########',
            '##1..........................2##',
            '################.############.##',
            '################o############.##',
            '#############################.##',
            '#..............................#',
            '#..3...##....##.4..##..........#',
            '#......##....##..o.##........X.#',
            '#........^.....................#',
            '################################'] },
        { time: 100, emp: 2, guards: ['12'], tip: 'A LIVE RED BEAM CATCHES AT ONCE - CROSS WHILE IT IS DARK', map: [
            '################################',
            '#.......|.......|.............<#',
            '#.S.....|.......|..............#',
            '#.......|.......|............o.#',
            '#############################.##',
            '#############################.##',
            '##1........|.........|.......2##',
            '##.#####.#########.#############',
            '##.#####o#########o#############',
            '##.#############################',
            '#.........#..........#.........#',
            '#.........#..........#........<#',
            '#.........|....o.....|.........#',
            '#.........|..........|.......X.#',
            '#>........#..........#.........#',
            '#.........#..........#.........#',
            '################################'] },
        { time: 90, emp: 2, guards: ['12', '34'], tip: 'PRESSURE PLATES CATCH AT ONCE - GO ROUND, OR SWITCH THEM OFF WITH AN EMP', map: [
            '################################',
            '#.........#.....v..............#',
            '#.S.......#....3.....#...4...o.#',
            '#.........#..........#....o....#',
            '#....##...#...##.....#.........#',
            '#....##...#.o.##.....#..##.....#',
            '#.........#........o.#..##.....#',
            '#.........#..........#.........#',
            '#...o....._....o....._........<#',
            '#.........#..........#.........#',
            '#.........#..........#..##...o.#',
            '#....##...#...##.....#..##.....#',
            '#....##...#...##.....#.........#',
            '#.........#.......o..#.....o...#',
            '#....1....#....2.....#.......X.#',
            '#...........o........#o......o.#',
            '################################'] },
        { time: 95, emp: 3, guards: ['12'], tip: 'DRONES FLY TO THE NOISE OF A SPRINT - THEIR RING STOPS AT WALLS', map: [
            '################################',
            '#......#...............#.......#',
            '#.S....#.......o.......#...o...#',
            '#......#.o.............#.......#',
            '#......#.......D.......#.......#',
            '#......|...............|...D...#',
            '#......#...............#.......#',
            '###_####......###......####.####',
            '#o.............................#',
            '#...1......................2...#',
            '#.............................o#',
            '####.######..######..######.####',
            '#.......#.........#............#',
            '#...o...#....D....#......o.....#',
            '#.......#.........#..........X.#',
            '#......<#....o....#>...........#',
            '################################'] },
        { time: 100, emp: 3, guards: ['12', '43'], tip: 'THESE CAMERAS TURN FULL CIRCLE - THE PLATE LINES NEED AN EMP OR A DETOUR', map: [
            '################################',
            '#.......3..................4...#',
            '#.S..#..#..#.o#..#..#..#..#..o.#',
            '#....#..#--#..#..#--#..#..#....#',
            '#....#..#.o#..#..#o.#o.#..#....#',
            '#....#.o#..#..#..#..#..#..#....#',
            '#.........._........_..........#',
            '#.......r.._...r...._..r....o..#',
            '#.........._........_..........#',
            '#....#..#..#..#..#..#..#..#....#',
            '#....#..#..#..#o.#..#..#..#....#',
            '#....#--#..#..#..#..#..#--#....#',
            '#..o.#o.#..#..#..#..#o.#.o#....#',
            '#..............................#',
            '#.1...........r............2...#',
            '#............................X.#',
            '################################'] },
        { time: 120, emp: 2, hop: 11, guards: ['1232', '56'], tip: 'THE VAULT DOORS ARE PLATES - ONE EMP TO GET IN, ONE TO GET OUT', map: [
            '################################',
            '#............................1.#',
            '#.S...................D......o.#',
            '#..............................#',
            '#...###########__###########...#',
            '#...#.....5................#...#',
            '#...#.o.....##....##....o..#...#',
            '#...#.......##.D..##.......#...#',
            '#...#......................#..<#',
            '#.o.#.......##....##.......#...#',
            '#...#.e.....##.o..##....o..#...#',
            '#...#.....6................#...#',
            '#...###########__###########...#',
            '#..............................#',
            '#.3.....D....................2.#',
            '#............................X.#',
            '################################'] },
        { time: 110, emp: 2, beam: 55, guards: ['12'], tip: 'TRAVELLING BEAMS NEVER GO DARK - DUCK INTO AN ALCOVE', map: [
            '################################',
            '#S..#..##.o##..##..##..##.o##..#',
            '#......!.......................#',
            '#..............................#',
            '###########################..###',
            '#..o...........................#',
            '#...............!............o.#',
            '#....1...................2.....#',
            '#..###..####..####..####..######',
            '#.........#.........#..........#',
            '#....~..o.#....o....#.....~....#',
            '#.........#.........#..........#',
            '#......o.......r.........o.....#',
            '#.........#.........#..........#',
            '#.........#....o....#.o......X.#',
            '#....^....#.........#..........#',
            '################################'] },
        { time: 160, emp: 3, hop: 10, beam: 52, guards: ['12', '34'], tip: 'THE EXIT ROOM IS SEALED BY A PLATE - KEEP AN EMP FOR IT', map: [
            '################################',
            '#......#...............#.......#',
            '#.S....#.......o.......#...o...#',
            '#......#...............#...D...#',
            '#......|.......r.......|...e...#',
            '#......#...............#.......#',
            '####_#####...#####...#####_#####',
            '#..............................#',
            '#.o.#...1....!.........2..#..o.#',
            '#..............................#',
            '######.#####_#####.#####_#######',
            '#.........#3.......4#..........#',
            '#.......o.#....D....#.........<#',
            '#.........|.........#..........#',
            '#.........#....o....#........X.#',
            '#....^....#.........#..........#',
            '################################'] },
        { time: 150, emp: 3, guards: ['12', '34'], tip: 'SEARCHLIGHTS SEE OVER WALLS - AN EMP PUTS THEM AND THE EXIT PLATE OUT',
            lights: [['x', 75, 70, 240], ['x', 210, 80], ['x', 330, -65], ['x', 450, 95],
                ['y', 90, 50, 200], ['y', 315, 60], ['y', 555, -75], ['y', 810, 55]], map: [
            '################################',
            '#......_.......v..............o#',
            '#.S......................o.....#',
            '#....###-----###.....###.......#',
            '#....###.....###..o..###.......#',
            '#.........|................1...#',
            '#.o....2..|....D.............o.#',
            '#....###.....###-----###.......#',
            '#....###..o..###.....###...e...#',
            '#.................|............#',
            '#.................|....o.......#',
            '#.o..###-----###.....###.......#',
            '#....###.....###.....###....o..#',
            '#...._..............._....######',
            '#.....o.......3.........4._..X.#',
            '#.o............^..........#....#',
            '################################'] }
    ];

    // ------------------------------------------------------------------
    // Grid helpers
    // ------------------------------------------------------------------

    function cx(tx) { return tx * T + T / 2; }
    function cy(ty) { return ty * T + T / 2; }

    // Screen tile row ty is map row ty - 1, because row 0 lies under the HUD.
    function tileAt(s, tx, ty) {
        var row = s.map[ty - 1];
        return row ? row.charAt(tx) : '';
    }

    // Walls: nothing sees or walks through them.
    function solid(s, tx, ty) {
        var ch = tileAt(s, tx, ty);
        return ch === '#' || ch === '';
    }

    // A camera stands on a post: it can be seen past but not walked through,
    // so nobody can slip by underneath its lens.
    function blocked(s, tx, ty) {
        var ch = tileAt(s, tx, ty);
        return solid(s, tx, ty) || ch === 'r' || FACING[ch] !== undefined;
    }

    // Number of open tiles beyond (tx, ty) in one direction.
    function reach(s, tx, ty, dx, dy) {
        var n = 0;
        while (!solid(s, tx + dx * (n + 1), ty + dy * (n + 1))) n++;
        return n;
    }

    function angDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }

    function turn(a, target, max) { return a + G.clamp(angDiff(target, a), -max, max); }

    // Distance from (x, y) along the unit vector (dx, dy) to the first wall,
    // at most max. It steps from tile border to tile border, so no wall
    // corner can be skipped however thin the slice of it that is crossed.
    function castRay(s, x, y, dx, dy, max) {
        var tx = Math.floor(x / T), ty = Math.floor(y / T), sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
        var nextX = dx ? ((tx + (dx > 0 ? 1 : 0)) * T - x) / dx : Infinity, perX = dx ? T / Math.abs(dx) : Infinity;
        var nextY = dy ? ((ty + (dy > 0 ? 1 : 0)) * T - y) / dy : Infinity, perY = dy ? T / Math.abs(dy) : Infinity;
        for (;;) {
            var d = Math.min(nextX, nextY);
            if (d >= max) return max;
            if (nextX < nextY) { tx += sx; nextX += perX; } else { ty += sy; nextY += perY; }
            if (solid(s, tx, ty)) return d;
        }
    }

    // Line of sight between two points.
    function clear(s, ax, ay, bx, by) {
        var d = G.dist(ax, ay, bx, by);
        return d < 0.001 || castRay(s, ax, ay, (bx - ax) / d, (by - ay) / d, d) >= d;
    }

    // kind is CAM or GUARD. This one test decides both what detects and
    // (through castRay) what drawCone paints.
    function canSee(s, o, kind, x, y) {
        var d = G.dist(o.x, o.y, x, y);
        if (d > kind.range) return false;
        if (d > kind.feel && Math.abs(angDiff(Math.atan2(y - o.y, x - o.x), o.ang)) > kind.fov / 2) return false;
        return clear(s, o.x, o.y, x, y);
    }

    // Breadth-first search, run backwards from the goal so that following
    // the links from the start yields the path in walking order.
    function findPath(s, fx, fy, tx, ty) {
        var prev = {}, queue = [ty * COLS + tx], head = 0, start = fy * COLS + fx;
        prev[queue[0]] = -1;
        while (head < queue.length && prev[start] === undefined) {
            var k = queue[head++], kx = k % COLS, ky = Math.floor(k / COLS);
            for (var i = 0; i < 4; i++) {
                var nx = kx + DIRS[i][0], ny = ky + DIRS[i][1], nk = ny * COLS + nx;
                if (prev[nk] !== undefined || blocked(s, nx, ny)) continue;
                prev[nk] = k;
                queue.push(nk);
            }
        }
        var path = [], at = prev[start];
        while (at !== undefined && at !== -1) {
            path.push({ x: cx(at % COLS), y: cy(Math.floor(at / COLS)) });
            at = prev[at];
        }
        return path;
    }

    // ------------------------------------------------------------------
    // Building a level from its map
    // ------------------------------------------------------------------

    function camAngle(s, c) {
        var speed = 0.8 + s.level * 0.04;
        return c.full ? c.t * speed * 0.75 : c.base + 0.95 * Math.sin(c.t * speed);
    }

    function newCam(s, at, ch, rnd) {
        // A random phase per camera keeps neighbouring sweeps out of step.
        var c = { x: at.x, y: at.y, base: FACING[ch] || 0, full: ch === 'r', t: rnd() * 6, ang: 0, off: 0, sees: false };
        c.ang = camAngle(s, c);
        return c;
    }

    function newDrone(at, index) {
        return { x: at.x, y: at.y, hx: at.x, hy: at.y, i: index, tx: at.x, ty: at.y, mode: 'idle', timer: 0, spin: index * 2, off: 0, sees: false };
    }

    function beam(x1, y1, x2, y2) {
        return { x1: x1, y1: y1, x2: x2, y2: y2, move: null, off: 0, phase: 0 };
    }

    // A travelling beam spans its corridor from wall to wall and runs along
    // it until the corridor ends; its length is fixed where the map puts it,
    // so side alcoves stay safe.
    function sweeper(s, sideways, tx, ty) {
        var v = s.def.beam || 60, l;
        if (sideways) {
            l = beam(cx(tx), (ty - reach(s, tx, ty, 0, -1)) * T, cx(tx), (ty + reach(s, tx, ty, 0, 1) + 1) * T);
            l.move = { key: 'x', min: cx(tx - reach(s, tx, ty, -1, 0)), max: cx(tx + reach(s, tx, ty, 1, 0)), v: v };
        } else {
            l = beam((tx - reach(s, tx, ty, -1, 0)) * T, cy(ty), (tx + reach(s, tx, ty, 1, 0) + 1) * T, cy(ty));
            l.move = { key: 'y', min: cy(ty - reach(s, tx, ty, 0, -1)), max: cy(ty + reach(s, tx, ty, 0, 1)), v: v };
        }
        return l;
    }

    function placeLaser(s, ch, tx, ty) {
        var n = 1, l = null;
        if (ch === '|' && tileAt(s, tx, ty - 1) !== '|') {
            while (tileAt(s, tx, ty + n) === '|') n++;
            l = beam(cx(tx), ty * T, cx(tx), (ty + n) * T);
        } else if (ch === '-' && tileAt(s, tx - 1, ty) !== '-') {
            while (tileAt(s, tx + n, ty) === '-') n++;
            l = beam(tx * T, cy(ty), (tx + n) * T, cy(ty));
        } else if (ch === '!' || ch === '~') {
            l = sweeper(s, ch === '!', tx, ty);
        }
        if (!l) return;
        l.phase = s.lasers.length * 0.9;      // tripwires blink out of step
        s.lasers.push(l);
    }

    function placeTile(s, ch, tx, ty, rnd) {
        var at = { x: cx(tx), y: cy(ty) };
        if (ch === 'S') s.start = at;
        else if (ch === 'X') s.exit = at;
        else if (ch === 'o') s.drives.push({ x: at.x, y: at.y, got: false });
        else if (ch === 'e') s.cells.push({ x: at.x, y: at.y, got: false });
        else if (ch === '_') s.plates.push({ tx: tx, ty: ty, x: at.x, y: at.y, off: 0 });
        else if (ch === 'D') s.drones.push(newDrone(at, s.drones.length));
        else if (ch === 'r' || FACING[ch] !== undefined) s.cams.push(newCam(s, at, ch, rnd));
        else if (ch >= '1' && ch <= '9') s.marks[ch] = { tx: tx, ty: ty };
        else placeLaser(s, ch, tx, ty);
    }

    function pathTo(s, g, mark) {
        return findPath(s, Math.floor(g.x / T), Math.floor(g.y / T), mark.tx, mark.ty);
    }

    function resetGuard(s, g) {
        g.x = cx(g.pts[0].tx); g.y = cy(g.pts[0].ty);
        g.wp = 1; g.mode = 'patrol'; g.timer = 0; g.sees = false;
        g.path = pathTo(s, g, g.pts[1]);
        if (g.path.length) g.ang = Math.atan2(g.path[0].y - g.y, g.path[0].x - g.x);
    }

    function buildGuards(s) {
        s.def.guards.forEach(function (route) {
            var pts = route.split('').map(function (ch) { return s.marks[ch]; });
            var g = { pts: pts, x: 0, y: 0, ang: 0, wp: 1, path: [], mode: 'patrol', timer: 0, repath: 0, sees: false };
            resetGuard(s, g);
            s.guards.push(g);
        });
    }

    function buildLights(s, rnd) {
        (s.def.lights || []).forEach(function (spec) {
            var alongX = spec[0] === 'x';
            var l = { x: spec[1], y: spec[1], key: spec[0], v: spec[2], off: 0, sees: false,
                min: spec[3] || (alongX ? T * 1.5 : T * 2.5), max: (alongX ? G.W : G.H) - T * 1.5 };
            l[l.key] = G.lerp(l.min, l.max, 0.35 + rnd() * 0.6);   // never starts on the entry corner
            s.lights.push(l);
        });
    }

    function init(level) {
        var def = LEVELS[level - 1], rnd = G.rng(level * 7919);
        var s = {
            def: def, map: def.map, level: level, start: null, exit: null,      // every map has an S and an X
            drives: [], cells: [], plates: [], cams: [], lasers: [], drones: [], guards: [], lights: [], marks: {}, rings: [],
            det: 0, rate: 0, seen: false, time: def.time, clock: 0, emp: def.emp, empT: 0, empFx: 0, safe: 0, got: 0, open: false,
            alarmT: 0, stepT: 0, player: null, touch: G.isTouch(), plan: null
        };
        for (var ty = 1; ty <= ROWS; ty++) {
            for (var tx = 0; tx < COLS; tx++) placeTile(s, tileAt(s, tx, ty), tx, ty, rnd);
        }
        buildGuards(s);
        buildLights(s, rnd);
        s.player = { x: 0, y: 0, w: BODY, h: BODY, vx: 0, vy: 0, cx: 0, cy: 0, face: 0, run: false };
        placePlayer(s);
        return s;
    }

    function placePlayer(s) {
        var p = s.player;
        p.x = s.start.x - BODY / 2; p.y = s.start.y - BODY / 2; p.vx = 0; p.vy = 0;
        p.cx = s.start.x; p.cy = s.start.y;
    }

    // ------------------------------------------------------------------
    // Player
    // ------------------------------------------------------------------

    // A noise is a ring on screen and a place to check out for every guard
    // in earshot; drones pick it up from further away.
    function emitNoise(s, x, y, r) {
        s.rings.push({ x: x, y: y, r: r, life: 0.5 });
        s.guards.forEach(function (g) {
            if (!g.sees && G.dist(g.x, g.y, x, y) < r) investigate(s, g, x, y);
        });
        s.drones.forEach(function (d) {
            if (d.off > 0 || G.dist(d.x, d.y, x, y) > r * 1.8) return;
            if (d.mode === 'idle') G.tone(1250, 0.12, { type: 'triangle', slide: 1900, vol: 0.08 });
            d.mode = 'seek'; d.tx = x; d.ty = y;
        });
    }

    function footsteps(s, dt, moving) {
        var p = s.player;
        s.stepT -= dt;
        if (!moving || s.stepT > 0) return;
        if (p.run) {
            G.noise(0.06, { freq: 320, vol: 0.16 });
            emitNoise(s, p.cx, p.cy, 170);
            s.stepT = 0.26;
        } else {
            G.noise(0.03, { freq: 170, vol: 0.05 });
            s.stepT = 0.36;
        }
    }

    // Velocity eases towards the wanted speed, so starts and stops have a
    // little weight and a sprint cannot be reversed on the spot.
    function movePlayer(s, dt) {
        var p = s.player;
        var ix = (G.key.right ? 1 : 0) - (G.key.left ? 1 : 0), iy = (G.key.down ? 1 : 0) - (G.key.up ? 1 : 0);
        var moving = ix !== 0 || iy !== 0;
        p.run = moving && G.key.b;
        var sp = (p.run ? SPRINT : WALK) / (ix && iy ? Math.SQRT2 : 1), k = Math.min(1, (p.run ? 7 : 14) * dt);
        p.vx += (ix * sp - p.vx) * k;
        p.vy += (iy * sp - p.vy) * k;
        G.tileMove(p, dt, T, function (tx, ty) { return blocked(s, tx, ty); });
        p.cx = p.x + BODY / 2; p.cy = p.y + BODY / 2;
        if (moving) p.face = Math.atan2(iy, ix);
        footsteps(s, dt, moving);
    }

    function empReaches(p, o) {
        var at = o.x1 === undefined ? o : G.closestOnSeg(p.cx, p.cy, o.x1, o.y1, o.x2, o.y2);
        return G.dist(p.cx, p.cy, at.x, at.y) < EMP_R;
    }

    function fireEmp(s) {
        if (!G.hit.a) return;
        if (s.emp <= 0) { G.tone(140, 0.09, { vol: 0.1, slide: 100 }); return; }
        var p = s.player, hit = 0;
        s.emp--; s.empFx = 0.6;
        [s.cams, s.lasers, s.drones, s.lights, s.plates].forEach(function (list) {
            list.forEach(function (o) { if (empReaches(p, o)) { o.off = EMP_TIME; hit++; } });
        });
        G.noise(0.5, { freq: 3000, slide: 120, vol: 0.3 });
        G.tone(900, 0.45, { type: 'sine', slide: 60, vol: 0.25 });
        G.burst(p.cx, p.cy, { n: 24, color: PHOS, speed: 260, life: 0.5, size: 2 });
        G.popup(p.cx, p.cy - 16, hit ? 'EMP x' + hit : 'EMP', PHOS);
    }

    // Out of charges must never be a dead end (three levels cannot be left
    // without a pulse), so an empty EMP builds one charge back up. It is
    // slow on purpose: the trace pays for every pulse that was wasted.
    function rechargeEmp(s, dt) {
        if (s.emp > 0) { s.empT = 0; return; }
        s.empT += dt;
        if (s.empT < EMP_RECHARGE) return;
        s.emp = 1; s.empT = 0;
        G.popup(s.player.cx, s.player.cy - 16, 'EMP READY', PHOS);
        G.tone(330, 0.2, { type: 'sawtooth', slide: 1320, vol: 0.12 });
    }

    function takeDrive(s, d) {
        d.got = true; s.got++;
        G.addScore(100);
        G.popup(d.x, d.y - 12, '+100', GREEN);
        G.burst(d.x, d.y, { n: 12, color: GREEN, speed: 140, life: 0.4, size: 2 });
        [1320, 1760, 2640].forEach(function (f, i) { G.tone(f, 0.05, { vol: 0.1, delay: i * 0.05 }); });
        if (s.got < s.drives.length) return;
        s.open = true;
        G.popup(s.exit.x, s.exit.y - 18, 'EXIT OPEN', PHOS);
        [392, 523, 659, 784].forEach(function (f, i) { G.tone(f, 0.14, { type: 'triangle', vol: 0.16, delay: 0.15 + i * 0.08 }); });
    }

    function pickUp(s) {
        var p = s.player;
        s.drives.forEach(function (d) {
            if (!d.got && G.circ(p.cx, p.cy, 8, d.x, d.y, 9)) takeDrive(s, d);
        });
        s.cells.forEach(function (c) {
            if (c.got || !G.circ(p.cx, p.cy, 8, c.x, c.y, 9)) return;
            c.got = true; s.emp++;
            G.popup(c.x, c.y - 12, '+EMP', PHOS);
            G.tone(330, 0.2, { type: 'sawtooth', slide: 1320, vol: 0.12 });
        });
    }

    // ------------------------------------------------------------------
    // Devices and guards
    // ------------------------------------------------------------------

    // Being watched from close up fills the meter up to three times faster
    // than at the edge of a cone.
    function nearness(o, p, range) { return 1.5 - G.dist(o.x, o.y, p.cx, p.cy) / range; }

    // The *Sees / *Hits tests below say whether a device would notice someone
    // standing at (x, y) right now. They are the only detection rules: the
    // update functions ask them about the player and nothing else.
    function camSees(s, c, x, y) { return c.off <= 0 && canSee(s, c, CAM, x, y); }

    function guardSees(s, g, x, y) { return canSee(s, g, GUARD, x, y); }

    // Walls hide the player from a drone just as they do from a camera.
    function droneSees(s, d, x, y) {
        return d.off <= 0 && G.dist(d.x, d.y, x, y) < DRONE_R && clear(s, d.x, d.y, x, y);
    }

    // Searchlights shine down from the ceiling: walls give no cover.
    function lightSees(l, x, y) { return l.off <= 0 && G.dist(l.x, l.y, x, y) < LIGHT_R; }

    function beamHits(s, l, x, y) {
        if (!laserLive(s, l)) return false;
        var at = G.closestOnSeg(x, y, l.x1, l.y1, l.x2, l.y2);
        return G.dist(x, y, at.x, at.y) <= BEAM_R;
    }

    // The live plate under (x, y), if any.
    function plateAt(s, x, y) {
        var tx = Math.floor(x / T), ty = Math.floor(y / T);
        return s.plates.filter(function (pl) { return pl.off <= 0 && pl.tx === tx && pl.ty === ty; })[0] || null;
    }

    function updateCams(s, dt) {
        var p = s.player;
        s.cams.forEach(function (c) {
            c.sees = false;
            if (c.off > 0) return;
            c.t += dt;
            c.ang = camAngle(s, c);
            c.sees = s.safe <= 0 && camSees(s, c, p.cx, p.cy);
            if (c.sees) s.rate += CAM.rate * nearness(c, p, CAM.range);
        });
    }

    function investigate(s, g, x, y) {
        // Only a guard pulled off its patrol grunts; one already searching
        // would otherwise repeat the sound every time it re-acquires.
        if (g.mode === 'patrol') G.tone(170, 0.2, { type: 'sawtooth', slide: 340, vol: 0.1 });
        g.mode = 'seek';
        // Re-planning every tick would be wasteful and makes the guard jitter.
        if (g.repath > 0) return;
        g.repath = 0.4;
        g.path = findPath(s, Math.floor(g.x / T), Math.floor(g.y / T), Math.floor(x / T), Math.floor(y / T));
    }

    function walkGuard(s, g, dt) {
        var n = g.path[0], d = G.dist(g.x, g.y, n.x, n.y);
        var step = (56 + s.level * 2) * (g.mode === 'seek' ? 1.45 : 1) * dt;
        if (d <= step) { g.x = n.x; g.y = n.y; g.path.shift(); return; }
        g.x += (n.x - g.x) / d * step; g.y += (n.y - g.y) / d * step;
        if (!g.sees) g.ang = turn(g.ang, Math.atan2(n.y - g.y, n.x - g.x), 5 * dt);
    }

    // At the end of a path a patrolling guard heads for the next waypoint;
    // one that came to check a noise stops and looks around first.
    function guardArrived(s, g) {
        if (g.mode === 'seek') { g.mode = 'look'; g.timer = 2.4; return; }
        g.wp = (g.wp + 1) % g.pts.length;
        g.path = pathTo(s, g, g.pts[g.wp]);
    }

    function lookAround(s, g, dt) {
        g.timer -= dt;
        if (!g.sees) g.ang += Math.cos(g.timer * 2.6) * 2.4 * dt;
        if (g.timer > 0) return;
        g.mode = 'patrol';
        g.path = pathTo(s, g, g.pts[g.wp]);
    }

    // The guard moves first and looks second, so it sees from where it is
    // drawn this frame.
    function updateGuard(s, g, dt) {
        var p = s.player;
        g.repath -= dt;
        if (g.mode === 'look') lookAround(s, g, dt);
        else if (!g.path.length) guardArrived(s, g);
        else walkGuard(s, g, dt);
        g.sees = s.safe <= 0 && guardSees(s, g, p.cx, p.cy);
        if (!g.sees) return;
        s.rate += GUARD.rate * nearness(g, p, GUARD.range);
        investigate(s, g, p.cx, p.cy);
        g.ang = turn(g.ang, Math.atan2(p.cy - g.y, p.cx - g.x), 6 * dt);
        if (G.dist(g.x, g.y, p.cx, p.cy) < 18) s.det = 1;      // grabbed
    }

    // Moves o straight towards a point; true once it is there.
    function glide(o, x, y, step) {
        var d = G.dist(o.x, o.y, x, y);
        if (d <= step) { o.x = x; o.y = y; return true; }
        o.x += (x - o.x) / d * step; o.y += (y - o.y) / d * step;
        return false;
    }

    // Drones fly over walls but cannot see through them. At rest they
    // circle their home; on patrol levels the home hops along the list of
    // drone points.
    function updateDrone(s, d, dt) {
        var p = s.player, x = d.tx, y = d.ty;
        d.sees = false;
        if (d.off > 0) return;
        d.spin += dt;
        if (d.mode === 'idle') {
            var hop = s.def.hop ? Math.floor(s.clock / s.def.hop) : 0, home = s.drones[(d.i + hop) % s.drones.length];
            x = home.hx + Math.cos(d.spin * 0.8) * 26; y = home.hy + Math.sin(d.spin * 0.8) * 26;
        }
        var there = glide(d, x, y, 95 * dt);
        if (d.mode === 'seek' && there) { d.mode = 'scan'; d.timer = 3; }
        else if (d.mode === 'scan' && (d.timer -= dt) <= 0) d.mode = 'idle';
        d.sees = s.safe <= 0 && droneSees(s, d, p.cx, p.cy);
        if (d.sees) s.rate += DRONE_RATE;
    }

    // Tripwires blink; the dark gap shrinks a little on later levels (1.74s
    // on level 3, 1.6s on level 10).
    function blinkCycle(s) { return BEAM_ON + 1.8 - s.level * 0.02; }

    // Travelling beams never go dark.
    function laserLive(s, l) {
        if (l.off > 0) return false;
        return !!l.move || (s.clock + l.phase) % blinkCycle(s) < BEAM_ON;
    }

    // A beam that is about to go live says so: it catches at once, so the
    // end of a dark gap - or of an EMP - must be visible before it comes.
    function laserWarming(s, l) {
        if (l.off > 0) return l.off < BEAM_WARN;
        return !l.move && (s.clock + l.phase) % blinkCycle(s) > blinkCycle(s) - BEAM_WARN;
    }

    // Beams and plates are hard alarms: touching one is a catch at once.
    function trip(s, x, y) {
        s.det = 1;
        G.tone(1900, 0.12, { type: 'sawtooth', slide: 700, vol: 0.14 });
        G.tone(95, 0.2, { type: 'square', vol: 0.2 });
        G.burst(x, y, { n: 8, color: RED, speed: 140, life: 0.3, size: 2 });
    }

    function moveBeam(l, dt) {
        var m = l.move, pos = l[m.key + '1'] + m.v * dt;
        if (pos > m.max) { pos = m.max; m.v = -Math.abs(m.v); }
        if (pos < m.min) { pos = m.min; m.v = Math.abs(m.v); }
        l[m.key + '1'] = l[m.key + '2'] = pos;
    }

    function updateLasers(s, dt) {
        var p = s.player;
        s.lasers.forEach(function (l) {
            if (l.move && l.off <= 0) moveBeam(l, dt);
            if (s.safe <= 0 && beamHits(s, l, p.cx, p.cy)) trip(s, p.cx, p.cy);
        });
    }

    function updateLights(s, dt) {
        var p = s.player;
        s.lights.forEach(function (l) {
            l.sees = false;
            if (l.off > 0) return;
            l[l.key] += l.v * dt;
            if (l[l.key] > l.max) { l[l.key] = l.max; l.v = -Math.abs(l.v); }
            if (l[l.key] < l.min) { l[l.key] = l.min; l.v = Math.abs(l.v); }
            l.sees = s.safe <= 0 && lightSees(l, p.cx, p.cy);
            if (l.sees) s.rate += 1.1;
        });
    }

    function updatePlates(s) {
        var p = s.player;
        if (s.safe > 0 || !plateAt(s, p.cx, p.cy)) return;
        trip(s, p.cx, p.cy);
        G.shake(3, 0.15);
    }

    // ------------------------------------------------------------------
    // Detection, timers and the main update
    // ------------------------------------------------------------------

    // A catch throws the player back to the entrance empty-handed: drives
    // and EMP cells return to their places, the charges are what the level
    // started with, and the trace starts over. Stealth is the only way to
    // make progress: a life buys one more whole attempt, nothing else. (The
    // trace used to run on and lose 20s per catch; a clean run takes over
    // half of it, so a single catch late on already decided the level.)
    function returnLoot(s) {
        s.drives.concat(s.cells).forEach(function (o) { o.got = false; });
        s.got = 0; s.open = false; s.emp = s.def.emp; s.empT = 0;
        s.time = s.def.time;
    }

    function caught(s) {
        var p = s.player;
        G.flash(RED, 0.3);
        G.burst(p.cx, p.cy, { n: 26, color: RED, speed: 220, life: 0.6 });
        G.tone(880, 0.5, { type: 'sawtooth', slide: 220, vol: 0.2 });
        G.noise(0.4, { freq: 1500, slide: 200, vol: 0.2 });
        if (G.loseLife() <= 0) return;
        placePlayer(s);
        returnLoot(s);
        G.popup(p.cx, p.cy - 16, 'CAUGHT - START OVER', RED);
        s.det = 0; s.safe = 2.5; s.rings = [];
        // Guards go back to their posts so the entrance is not camped.
        s.guards.forEach(function (g) { resetGuard(s, g); });
        s.drones.forEach(function (d) { d.mode = 'idle'; });
    }

    function updateMeter(s, dt) {
        s.seen = s.rate > 0;
        // A tripped beam or plate has already filled the meter: it must not
        // drain again before update() acts on it.
        if (s.det >= 1) return;
        if (!s.seen) { s.det = Math.max(0, s.det - 0.3 * dt); return; }
        s.det += s.rate * dt;
        // The alarm beeps faster and higher as the meter fills.
        if (s.alarmT <= 0) {
            G.tone(500 + s.det * 520, 0.08, { type: 'square', vol: 0.12 });
            s.alarmT = 0.34 - 0.2 * Math.min(1, s.det);
        }
    }

    function tickTimers(s, dt) {
        var before = Math.ceil(s.time);
        s.clock += dt; s.time -= dt;
        ['alarmT', 'empFx', 'safe'].forEach(function (k) { if (s[k] > 0) s[k] -= dt; });
        [s.cams, s.lasers, s.drones, s.lights, s.plates].forEach(function (list) {
            list.forEach(function (o) { if (o.off > 0) o.off -= dt; });
        });
        s.rings = s.rings.filter(function (r) { return (r.life -= dt) > 0; });
        // The last seconds of the trace tick audibly.
        if (s.time < 15 && Math.ceil(s.time) !== before) G.tone(1000, 0.05, { type: 'sine', vol: 0.14 });
    }

    // A finished trace ends the run whatever lives are left: lives pay for
    // catches, nothing pays for time.
    function traceComplete() {
        G.flash(RED, 0.4);
        G.tone(300, 0.7, { type: 'sawtooth', slide: 80, vol: 0.22 });
        G.gameOver();
    }

    function update(s, dt) {
        var p = s.player;
        tickTimers(s, dt);
        if (s.time <= 0) { traceComplete(); return; }
        s.rate = 0;
        movePlayer(s, dt);
        fireEmp(s);
        rechargeEmp(s, dt);
        pickUp(s);
        updateCams(s, dt);
        s.guards.forEach(function (g) { updateGuard(s, g, dt); });
        s.drones.forEach(function (d) { updateDrone(s, d, dt); });
        updateLasers(s, dt);
        updateLights(s, dt);
        updatePlates(s);
        updateMeter(s, dt);
        if (s.det >= 1) { caught(s); return; }
        if (s.open && G.dist(p.cx, p.cy, s.exit.x, s.exit.y) < 15) G.win(200 + Math.ceil(s.time) * 5 + G.lives * 150);
    }

    // ------------------------------------------------------------------
    // Drawing
    // ------------------------------------------------------------------

    // Walls are dark slabs; only the edges that face a floor tile are lit,
    // which reads as a blueprint on a monitor.
    function paintWalls(s, ctx) {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.strokeStyle = 'rgba(99,243,168,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var ty = 1; ty <= ROWS; ty++) {
            for (var tx = 0; tx < COLS; tx++) {
                var x = tx * T, y = ty * T;
                if (!solid(s, tx, ty)) { ctx.fillStyle = 'rgba(99,243,168,0.10)'; ctx.fillRect(x + 14, y + 14, 2, 2); continue; }
                ctx.fillStyle = PANEL;
                ctx.fillRect(x, y, T, T);
                if (!solid(s, tx, ty - 1) && ty > 1) { ctx.moveTo(x, y); ctx.lineTo(x + T, y); }
                if (!solid(s, tx, ty + 1) && ty < ROWS) { ctx.moveTo(x, y + T); ctx.lineTo(x + T, y + T); }
                if (!solid(s, tx - 1, ty) && tx > 0) { ctx.moveTo(x, y); ctx.lineTo(x, y + T); }
                if (!solid(s, tx + 1, ty) && tx < COLS - 1) { ctx.moveTo(x + T, y); ctx.lineTo(x + T, y + T); }
            }
        }
        ctx.stroke();
    }

    // A map never changes while its level is played, and painting its 544
    // tiles anew every frame kept the browser's rasteriser busier than the
    // rest of the game together. So the floor plan is painted once, into a
    // picture as large as the game canvas, and copied from there. It is
    // painted again when another level's map is shown or when the canvas
    // changes size (a resized window, a turned phone).
    function drawWalls(s, ctx) {
        var w = ctx.canvas.width, h = ctx.canvas.height, g, plan = s.plan;
        if (!plan || plan.w !== w || plan.h !== h) {
            plan = s.plan = { w: w, h: h, pic: plan ? plan.pic : document.createElement('canvas') };
            plan.pic.width = w; plan.pic.height = h;    // also wipes the old picture
            g = plan.pic.getContext('2d');
            g.setTransform(w / G.W, 0, 0, h / G.H, 0, 0);
            paintWalls(s, g);
        }
        ctx.drawImage(plan.pic, 0, 0, G.W, G.H);
    }

    // Traces the outline of what can be seen from o between two angles: a
    // fan of rays, each ending exactly where castRay (the detection test)
    // meets a wall. Between two neighbouring rays the outline is a straight
    // line, so at a wall's shadow edge it can be off by the gap between
    // them: about 3 px at the far end of a camera cone, less nearer in.
    function sightPath(s, ctx, o, from, to, range, step) {
        var n = Math.ceil((to - from) / (step || RAY_STEP));
        for (var i = 0; i <= n; i++) {
            var a = from + (to - from) * i / n, dx = Math.cos(a), dy = Math.sin(a), d = castRay(s, o.x, o.y, dx, dy, range);
            ctx.lineTo(o.x + dx * d, o.y + dy * d);
        }
    }

    function drawCone(s, ctx, o, kind, hot) {
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        sightPath(s, ctx, o, o.ang - kind.fov / 2, o.ang + kind.fov / 2, kind.range);
        ctx.closePath();
        ctx.fillStyle = hot ? 'rgba(255,77,92,0.30)' : 'rgba(99,243,168,0.14)';
        ctx.fill();
        ctx.strokeStyle = hot ? RED : 'rgba(99,243,168,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // A live plate is a red-rimmed pad; a dead one is grey, counts down and
    // flashes red through its last second, because it catches the moment
    // it comes back.
    function drawPlates(s, ctx) {
        s.plates.forEach(function (pl) {
            var x = pl.tx * T, y = pl.ty * T, c = pl.off > 0 && !(pl.off < 1 && Math.floor(G.t * 10) % 2) ? GREY : RED;
            ctx.strokeStyle = c;
            ctx.lineWidth = s.touch ? 2 : 1;
            ctx.strokeRect(x + 4.5, y + 4.5, T - 9, T - 9);
            ctx.globalAlpha = pl.off > 0 ? 0.12 : 0.3 + 0.15 * Math.sin(G.t * 3 + pl.tx);
            ctx.fillStyle = c;
            ctx.fillRect(x + 8, y + 8, T - 16, T - 16);
            ctx.globalAlpha = 1;
            if (pl.off > 0) G.text(Math.ceil(pl.off) + 's', pl.x, pl.y + 4, { size: s.touch ? 16 : 10, color: GREY, align: 'center' });
        });
    }

    function drawExit(s, ctx) {
        var e = s.exit, pulse = 0.5 + 0.5 * Math.sin(G.t * 5), c = s.open ? GREEN : GREY;
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x - 12, e.y - 12, 24, 24);
        if (s.open) {
            ctx.globalAlpha = 0.2 + 0.3 * pulse;
            ctx.fillStyle = GREEN;
            ctx.fillRect(e.x - 12, e.y - 12, 24, 24);
            ctx.globalAlpha = 1;
        }
        G.text(s.touch ? (s.open ? 'GO' : '×') : (s.open ? 'EXIT' : 'LOCK'), e.x, e.y + (s.touch ? 6 : 4), { size: s.touch ? 18 : 10, color: s.open ? PHOS : GREY, align: 'center', bold: true });
    }

    function drawLasers(s, ctx) {
        s.lasers.forEach(function (l) {
            var live = laserLive(s, l), warm = laserWarming(s, l);
            ctx.strokeStyle = l.off > 0 && !warm ? GREY : RED;
            // dark: faint dashes; about to go live: the dashes flash
            ctx.globalAlpha = live ? 0.75 + 0.25 * Math.sin(G.t * 40) : (warm ? 0.5 + 0.5 * Math.sin(G.t * 50) : 0.25);
            ctx.lineWidth = s.touch ? (live || warm ? 3 : 2) : (live || warm ? 2 : 1);
            ctx.setLineDash(live ? [] : [3, 5]);
            ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.fillStyle = l.off > 0 ? GREY : RED;
            ctx.fillRect(l.x1 - 3, l.y1 - 3, 6, 6);
            ctx.fillRect(l.x2 - 3, l.y2 - 3, 6, 6);
        });
    }

    function drawLights(s, ctx) {
        s.lights.forEach(function (l) {
            var c = l.off > 0 ? '136,161,151' : (l.sees ? '255,77,92' : '188,255,212');
            ctx.fillStyle = 'rgba(' + c + ',' + (l.off > 0 ? 0.06 : 0.16) + ')';
            ctx.beginPath(); ctx.arc(l.x, l.y, LIGHT_R, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(' + c + ',0.6)';
            ctx.lineWidth = 1;
            ctx.setLineDash(l.off > 0 ? [2, 6] : []);
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    function drawLoot(s, ctx) {
        var bob = Math.sin(G.t * 4) * 2;
        s.drives.forEach(function (d) {
            if (d.got) return;
            ctx.fillStyle = GREEN;
            ctx.fillRect(d.x - (s.touch ? 8 : 6), d.y - (s.touch ? 9 : 7) + bob, s.touch ? 16 : 12, s.touch ? 18 : 14);
            ctx.fillStyle = BG;
            ctx.fillRect(d.x - 3, d.y - 7 + bob, 6, 4);
            ctx.fillRect(d.x - 4, d.y + 1 + bob, 8, 4);
        });
        s.cells.forEach(function (c) {
            if (c.got) return;
            ctx.strokeStyle = PHOS;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(c.x, c.y, 8 + bob * 0.5, 0, Math.PI * 2); ctx.stroke();
            G.text('E', c.x, c.y + 4, { size: s.touch ? 16 : 11, color: PHOS, align: 'center', bold: true });
        });
    }

    function drawCams(s, ctx) {
        s.cams.forEach(function (c) {
            if (c.off <= 0) drawCone(s, ctx, c, CAM, c.sees);
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.rotate(c.ang);
            ctx.fillStyle = c.off > 0 ? GREY : (c.sees ? RED : GREEN);
            ctx.fillRect(-7, -5, 11, 10);
            ctx.fillRect(4, -3, 5, 6);
            ctx.restore();
            // A countdown over a dead camera shows how long the blind spot lasts.
            if (c.off > 0) G.text(Math.ceil(c.off) + 's', c.x, c.y - 10, { size: s.touch ? 16 : 10, color: GREY, align: 'center' });
        });
    }

    function drawGuards(s, ctx) {
        s.guards.forEach(function (g) {
            drawCone(s, ctx, g, GUARD, g.sees);
            // The ring is the distance at which a guard notices someone behind it.
            ctx.strokeStyle = g.sees ? RED : 'rgba(99,243,168,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(g.x, g.y, GUARD.feel, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = g.sees ? RED : PHOS;
            ctx.beginPath(); ctx.arc(g.x, g.y, 9, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = BG;
            ctx.beginPath(); ctx.arc(g.x + Math.cos(g.ang) * 4, g.y + Math.sin(g.ang) * 4, 3.5, 0, Math.PI * 2); ctx.fill();
            if (g.mode === 'patrol') return;
            G.text(g.mode === 'seek' ? '!' : '?', g.x, g.y - 13, { size: 15, bold: true, align: 'center', color: g.mode === 'seek' ? RED : PHOS });
        });
    }

    function drawDrones(s, ctx) {
        s.drones.forEach(function (d) {
            var c = d.off > 0 ? GREY : (d.sees || d.mode !== 'idle' ? RED : GREEN);
            ctx.strokeStyle = c;
            ctx.lineWidth = 1;
            ctx.globalAlpha = d.off > 0 ? 0.3 : 0.7;
            ctx.setLineDash([4, 4]);
            ctx.lineDashOffset = -d.spin * 20;
            // The ring is cut off by walls exactly as the drone's sight is.
            // At this short radius, phone ring segments stay under 2px apart.
            ctx.beginPath(); sightPath(s, ctx, d, 0, Math.PI * 2, DRONE_R, s.touch ? 0.03 : RAY_STEP); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.rotate(d.spin * 6);
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke();
            ctx.restore();
            ctx.fillStyle = c;
            ctx.fillRect(d.x - 4, d.y - 4, 8, 8);
        });
    }

    function drawPlayer(s, ctx) {
        var p = s.player;
        // Blinking marks the moment of grace after a respawn.
        if (s.safe > 0 && Math.floor(G.t * 12) % 2) return;
        ctx.fillStyle = PHOS;
        ctx.shadowColor = GREEN; ctx.shadowBlur = s.touch ? 0 : 10;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (s.touch) {
            // A bright locator survives phone scaling without enlarging the hitbox.
            ctx.strokeStyle = PHOS; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(p.cx, p.cy, 10, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = BG;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.cx, p.cy);
        ctx.lineTo(p.cx + Math.cos(p.face) * 7, p.cy + Math.sin(p.face) * 7); ctx.stroke();
        if (s.det <= 0) return;
        ctx.strokeStyle = RED;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.det)); ctx.stroke();
    }

    function drawRings(s, ctx) {
        ctx.lineWidth = 1;
        s.rings.forEach(function (r) {
            ctx.globalAlpha = r.life;
            ctx.strokeStyle = GREY;
            ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 - r.life * 2 * 0.8), 0, Math.PI * 2); ctx.stroke();
        });
        if (s.empFx > 0) {
            ctx.globalAlpha = s.empFx / 0.6;
            ctx.strokeStyle = PHOS;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(s.player.cx, s.player.cy, EMP_R * (1 - s.empFx / 0.6), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    // The console overlay: the detection bar in the bottom wall, a rolling
    // scanline, and a red frame while anything is watching.
    function drawConsole(s, ctx) {
        var w = 300, x = (G.W - w) / 2, y = G.H - 21, fill = Math.min(1, s.det);
        G.text('DETECTION', x - 10, y + 10, { size: s.touch ? 20 : 12, color: s.seen ? RED : GREY, align: 'right' });
        ctx.strokeStyle = s.seen ? RED : GREY;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w, 12);
        ctx.fillStyle = fill > 0.6 || s.seen ? RED : GREEN;
        ctx.fillRect(x + 2, y + 2, (w - 3) * fill, 9);
        ctx.fillStyle = 'rgba(99,243,168,0.05)';
        ctx.fillRect(0, G.HUD + (G.t * 70) % (G.H - G.HUD), G.W, 26);
        if (!s.seen) return;
        ctx.strokeStyle = RED;
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(G.t * 18);
        ctx.lineWidth = 4;
        ctx.strokeRect(2, G.HUD + 2, G.W - 4, G.H - G.HUD - 4);
        ctx.globalAlpha = 1;
    }

    // Each level that brings a new rule says so in the top wall for its
    // first seconds (and on the level-select preview, where the clock is 0).
    // 20px, because on a phone the canvas is drawn at about half size.
    function drawTip(s) {
        if (!s.def.tip || s.clock >= TIP_TIME) return;
        G.text(s.touch ? PHONE_TIPS[s.level - 1] : s.def.tip, G.W / 2, G.HUD + 22, { size: s.touch ? 24 : 20, color: s.clock > TIP_TIME - 1 ? GREY : PHOS, align: 'center', bold: true, max: G.W - 40 });
    }

    function draw(s, ctx) {
        // Drone rings and searchlights near the top wall must not spill
        // into the engine's HUD strip.
        ctx.beginPath();
        ctx.rect(0, G.HUD, G.W, G.H - G.HUD);
        ctx.clip();
        drawWalls(s, ctx);
        drawPlates(s, ctx);
        drawExit(s, ctx);
        drawLights(s, ctx);
        drawCams(s, ctx);
        drawGuards(s, ctx);
        drawLasers(s, ctx);
        drawLoot(s, ctx);
        drawDrones(s, ctx);
        drawPlayer(s, ctx);
        drawRings(s, ctx);
        drawConsole(s, ctx);
        drawTip(s);
    }

    // An empty EMP shows the seconds until its next charge instead.
    function hud(s) {
        var emp = s.emp > 0 ? s.emp : '0 +' + Math.ceil(EMP_RECHARGE - s.empT) + 's';
        if (s.touch) return 'DATA ' + s.got + '/' + s.drives.length + '  EMP ' + emp + '  ' + Math.max(0, Math.ceil(s.time)) + 's';
        return 'DRIVES ' + s.got + '/' + s.drives.length + '  EMP ' + emp + '  TRACE ' + Math.max(0, Math.ceil(s.time));
    }

    G.register('surveillance', {
        title: 'BLIND SPOT',
        blurb: 'Steal every data drive and reach the exit without being seen.',
        controls: [
            'Arrows / pad: sneak · X / RUN: loud sprint',
            'SPACE / EMP: devices dark for 5s · empty recharges in 20s',
            'Walls block cones / drones · live beams / plates catch instantly',
            'Caught: restart, lose a life · trace runs out: game over'
        ],
        levelNames: ['Orientation', 'Night Shift', 'Tripwire', 'Pressure', 'Hive', 'Server Farm', 'The Vault', 'Sweep', 'Panopticon', 'Searchlight Grid'],
        colors: { bg: BG, fg: PHOS, accent: GREEN, dim: GREY },
        // Four lives: a catch sends the player back to the entrance, so each
        // life is one more whole attempt at the level.
        lives: 4,
        // Sparse and uneasy: a heartbeat kick, a few held notes, lots of air.
        music: {
            bpm: 92, root: 40, scale: 'phrygian', prog: [0, 0, 1, 0, 0, 5, 1, 0],
            bass: 'x.......x.....o.',
            lead: ['4.....5.....4...', '....7-----......', '4.....5.....8...', '..7---..5---4...',
                '......b---..9...', '8-----......7...', '5.....4.....1...', '0-------........'],
            arp: '0.....2...3.....',
            drums: { k: 'x.....x.........', h: '....x.......x.x.' },
            leadWave: 'triangle', bassWave: 'sine', arpWave: 'square', leadOct: 2
        },
        init: init, update: update, draw: draw, hud: hud,
        // Movement is free in eight directions, so the pad keeps its diagonals.
        touch: { a: 'EMP', b: 'RUN' }
    });
})();
