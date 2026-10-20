/*
 * Brick Breaker — the breakout theme's game, and the reference implementation
 * for docs/games.md.
 *
 * Bounce the ball off the paddle to clear every breakable brick. The ball
 * leaves the paddle at an angle set by where it lands, bricks can take up to
 * three hits, steel bricks never break, and falling capsules change the rules
 * for a while (wide paddle, multiball, laser, slow ball, extra life).
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    var COLS = 14, BW = 60, BH = 22, GAP = 4, OX = 34, OY = 64, PADDLE_Y = 500, BALL_R = 7;
    var HUES = ['#d5aa58', '#d98255', '#c75c5c'];           // brick colour by hits left
    var STEEL = 9;
    var POWERS = ['wide', 'multi', 'laser', 'slow', 'life'];
    var POWER_COLOR = { wide: '#7fc8a9', multi: '#f2eddf', laser: '#c75c5c', slow: '#8fb4d9', life: '#d5aa58' };

    // The three levels: an open warm-up, the invader that needs aim, and a
    // steel fortress whose 3-hit core is reached only through its gates.
    // Each layout returns the hits a brick at column c, row r needs:
    // 0 = no brick, 1..3 = breakable, STEEL = indestructible. The ball
    // quickens and the paddle shrinks only a little per level: the layouts
    // are what make a later level hard.
    var LEVEL_CFG = [
        { speed: 320, paddle: 136, layout: function (c, r) { return r < 4 ? 1 + (r === 0 && c % 2 ? 1 : 0) : 0; } },
        { speed: 340, paddle: 128, layout: function (c, r) { return invaderBit(c, r) ? 1 + (r < 3 ? 1 : 0) : 0; } },
        { speed: 360, paddle: 122, layout: fortress }
    ];
    var INVADER = ['..x......x..', '...x....x...', '..xxxxxxxx..', '.xx.xxxx.xx.', 'xxxxxxxxxxxx', 'x.xxxxxxxx.x', 'x.x......x.x', '...xx..xx...'];

    function invaderBit(c, r) {
        var row = INVADER[r];
        return !!row && row.charAt(c - 1) === 'x';
    }

    // Steel sides and a steel floor with three gates; the gutters beside
    // the walls also lead up over the top, so every core brick is reachable.
    function fortress(c, r) {
        if (r > 6) return 0;
        if (r === 6) return c % 4 === 2 ? 0 : STEEL;
        if (c === 0 || c === COLS - 1) return STEEL;
        return r < 1 ? 3 : (r < 3 ? 2 : 1);
    }

    function buildBricks(layout) {
        var bricks = [];
        for (var r = 0; r < 9; r++) {
            for (var c = 0; c < COLS; c++) {
                var hp = layout(c, r);
                if (hp) bricks.push({ x: OX + c * (BW + GAP), y: OY + r * (BH + GAP), w: BW, h: BH, hp: hp });
            }
        }
        return bricks;
    }

    function newBall(s) {
        return { x: s.paddle.x, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true };
    }

    function init(level) {
        var cfg = LEVEL_CFG[level - 1];
        var s = {
            touch: G.isTouch(),
            paddle: { x: G.W / 2, w: cfg.paddle, base: cfg.paddle },
            speed: cfg.speed, bricks: buildBricks(cfg.layout), balls: [], caps: [], shots: [],
            timers: { wide: 0, laser: 0, slow: 0 }, cooldown: 0, lastMouseX: G.mouse.x
        };
        s.balls.push(newBall(s));
        return s;
    }

    // Keys move the paddle at a fixed speed; the mouse takes over whenever it
    // actually moves, so both work without a mode switch.
    function movePaddle(s, dt) {
        var p = s.paddle, half = p.w / 2;
        if (G.key.left) p.x -= 620 * dt;
        if (G.key.right) p.x += 620 * dt;
        if (G.mouse.x !== s.lastMouseX) { p.x = G.mouse.x; s.lastMouseX = G.mouse.x; }
        p.x = G.clamp(p.x, half, G.W - half);
    }

    function launch(s, b) {
        var a = -Math.PI / 2 + G.rnd(-0.35, 0.35);
        b.stuck = false; b.vx = Math.cos(a) * s.speed; b.vy = Math.sin(a) * s.speed;
        G.sfx('bounce');
    }

    function bounceWalls(b) {
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); G.sfx('click'); }
        if (b.x > G.W - BALL_R) { b.x = G.W - BALL_R; b.vx = -Math.abs(b.vx); G.sfx('click'); }
        if (b.y < G.HUD + BALL_R) { b.y = G.HUD + BALL_R; b.vy = Math.abs(b.vy); G.sfx('click'); }
    }

    // The further from the paddle's centre the ball lands, the flatter it
    // leaves — that is the player's only way to aim.
    function bouncePaddle(s, b) {
        var p = s.paddle;
        if (b.vy <= 0 || b.y + BALL_R < PADDLE_Y || b.y - BALL_R > PADDLE_Y + 14) return;
        if (b.x < p.x - p.w / 2 - BALL_R || b.x > p.x + p.w / 2 + BALL_R) return;
        var off = G.clamp((b.x - p.x) / (p.w / 2), -1, 1), a = -Math.PI / 2 + off * 1.05;
        // Each return speeds the ball up a little, so a level never drags on
        // once only a few bricks are left; the cap keeps it returnable.
        var sp = Math.min(s.speed * 1.4, Math.hypot(b.vx, b.vy) * 1.03);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.y = PADDLE_Y - BALL_R;
        G.tone(300 + off * 80, 0.06, { type: 'triangle', vol: 0.18 });
    }

    // About one brick in four drops a capsule: they are what carries a
    // player through the long late layouts.
    function dropCapsule(s, br) {
        if (Math.random() > 0.24) return;
        s.caps.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, kind: G.pick(POWERS) });
    }

    function damageBrick(s, br) {
        if (br.hp === STEEL) { G.tone(1500, 0.05, { type: 'triangle', vol: 0.1 }); return; }
        br.hp--;
        G.tone(520 + br.y, 0.07, { vol: 0.12 });
        if (br.hp > 0) return;
        G.addScore(10 * G.level);
        G.burst(br.x + br.w / 2, br.y + br.h / 2, { n: 10, color: HUES[0], speed: 180, gravity: 500 });
        dropCapsule(s, br);
    }

    // Reflects on whichever axis the ball penetrated least, which is the side
    // it came in through.
    function hitBricks(s, b) {
        for (var i = 0; i < s.bricks.length; i++) {
            var br = s.bricks[i];
            if (br.hp <= 0 || !G.circRect(b.x, b.y, BALL_R, br.x, br.y, br.w, br.h)) continue;
            var px = Math.min(b.x + BALL_R - br.x, br.x + br.w - (b.x - BALL_R));
            var py = Math.min(b.y + BALL_R - br.y, br.y + br.h - (b.y - BALL_R));
            if (px < py) b.vx = (b.x < br.x + br.w / 2 ? -1 : 1) * Math.abs(b.vx);
            else b.vy = (b.y < br.y + br.h / 2 ? -1 : 1) * Math.abs(b.vy);
            damageBrick(s, br);
            return;
        }
    }

    function moveBall(s, b, dt) {
        if (b.stuck) { b.x = s.paddle.x; if (G.hit.a || G.mouse.hit) launch(s, b); return; }
        var slow = s.timers.slow > 0 ? 0.6 : 1;
        // Two sub-steps keep a fast ball from skipping through a brick.
        for (var i = 0; i < 2; i++) {
            b.x += b.vx * dt * slow / 2; b.y += b.vy * dt * slow / 2;
            bounceWalls(b); bouncePaddle(s, b); hitBricks(s, b);
        }
    }

    function applyPower(s, kind) {
        G.sfx('power');
        G.addScore(50);
        if (kind === 'life') { G.addLife(5); return; }
        if (kind === 'multi') { splitBalls(s); return; }
        s.timers[kind] = 14;
    }

    function splitBalls(s) {
        var live = s.balls.filter(function (b) { return !b.stuck; });
        live.slice(0, 3).forEach(function (b) {
            s.balls.push({ x: b.x, y: b.y, vx: -b.vx, vy: b.vy, stuck: false });
            s.balls.push({ x: b.x, y: b.y, vx: b.vx * 0.5, vy: -Math.abs(b.vy), stuck: false });
        });
    }

    function updateCapsules(s, dt) {
        var p = s.paddle, halfW = s.touch ? 24 : 16, halfH = s.touch ? 13 : 8;
        s.caps = s.caps.filter(function (c) {
            c.y += 170 * dt;
            var caught = c.y > PADDLE_Y - halfH && c.y < PADDLE_Y + (s.touch ? 12 : 10) + halfH && Math.abs(c.x - p.x) < p.w / 2 + (s.touch ? halfW : 12);
            if (caught) applyPower(s, c.kind);
            return !caught && c.y < G.H + 20;
        });
    }

    function fireLaser(s) {
        if (s.timers.laser <= 0 || s.cooldown > 0 || !(G.key.a || G.mouse.down)) return;
        s.cooldown = 0.22;
        s.shots.push({ x: s.paddle.x - s.paddle.w / 2 + 6, y: PADDLE_Y }, { x: s.paddle.x + s.paddle.w / 2 - 6, y: PADDLE_Y });
        G.sfx('laser');
    }

    function updateShots(s, dt) {
        s.shots = s.shots.filter(function (sh) {
            sh.y -= 640 * dt;
            for (var i = 0; i < s.bricks.length; i++) {
                var br = s.bricks[i];
                if (br.hp > 0 && sh.x > br.x && sh.x < br.x + br.w && sh.y > br.y && sh.y < br.y + br.h) {
                    damageBrick(s, br);
                    return false;
                }
            }
            return sh.y > G.HUD;
        });
    }

    function tickTimers(s, dt) {
        for (var k in s.timers) if (s.timers[k] > 0) s.timers[k] -= dt;
        if (s.cooldown > 0) s.cooldown -= dt;
        var target = s.timers.wide > 0 ? s.paddle.base * 1.6 : s.paddle.base;
        s.paddle.w += (target - s.paddle.w) * Math.min(1, dt * 10);
    }

    function bricksLeft(s) {
        return s.bricks.filter(function (b) { return b.hp > 0 && b.hp !== STEEL; }).length;
    }

    function update(s, dt) {
        tickTimers(s, dt);
        movePaddle(s, dt);
        fireLaser(s);
        s.balls.forEach(function (b) { moveBall(s, b, dt); });
        s.balls = s.balls.filter(function (b) { return b.y < G.H + 30; });
        updateCapsules(s, dt);
        updateShots(s, dt);
        if (!bricksLeft(s)) { G.win(500 + G.lives * 250); return; }
        // Every ball lost: one life gone, a fresh ball waits on the paddle.
        if (!s.balls.length && G.loseLife() > 0) { s.caps = []; s.balls.push(newBall(s)); }
    }

    function drawBricks(s, ctx) {
        s.bricks.forEach(function (br) {
            if (br.hp <= 0) return;
            ctx.fillStyle = br.hp === STEEL ? '#656861' : HUES[br.hp - 1];
            ctx.fillRect(br.x, br.y, br.w, br.h);
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(br.x, br.y, br.w, 4);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(br.x, br.y + br.h - 4, br.w, 4);
        });
    }

    function drawPaddle(s, ctx) {
        var p = s.paddle;
        ctx.fillStyle = s.timers.laser > 0 ? '#c75c5c' : '#f2eddf';
        ctx.fillRect(p.x - p.w / 2, PADDLE_Y, p.w, 12);
        ctx.fillStyle = '#d98255';
        ctx.fillRect(p.x - p.w / 2, PADDLE_Y, 10, 12);
        ctx.fillRect(p.x + p.w / 2 - 10, PADDLE_Y, 10, 12);
    }

    function drawMoving(s, ctx) {
        s.balls.forEach(function (b) {
            // A halo makes the small ball trackable on a portrait phone,
            // without changing its collision radius or the brick layouts.
            if (s.touch) {
                ctx.fillStyle = 'rgba(242,237,223,0.3)';
                ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R + 6, 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = '#f2eddf';
            ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
        });
        s.caps.forEach(function (c) {
            var halfW = s.touch ? 24 : 16, halfH = s.touch ? 13 : 8;
            ctx.fillStyle = POWER_COLOR[c.kind];
            ctx.fillRect(c.x - halfW, c.y - halfH, halfW * 2, halfH * 2);
            G.text(c.kind === 'life' ? '+' : c.kind.charAt(0).toUpperCase(), c.x, c.y + (s.touch ? 8 : 5), { size: s.touch ? 22 : 13, bold: true, color: '#1b1c1a', align: 'center' });
        });
        ctx.fillStyle = '#ff8a7a';
        s.shots.forEach(function (sh) { ctx.fillRect(sh.x - 2, sh.y - 12, 4, 12); });
    }

    function draw(s, ctx) {
        ctx.fillStyle = '#1b1c1a';
        ctx.fillRect(0, 0, G.W, G.H);
        drawBricks(s, ctx);
        drawPaddle(s, ctx);
        drawMoving(s, ctx);
        if (s.balls.length && s.balls[0].stuck) {
            // The hint pulses so the screen is never completely still.
            ctx.globalAlpha = 0.55 + 0.45 * Math.sin(G.t * 5);
            G.text(s.touch ? 'SERVE or tap the board' : 'SPACE or click to serve', G.W / 2, 440, { size: s.touch ? 24 : 16, color: '#96958f', align: 'center' });
            ctx.globalAlpha = 1;
        }
    }

    function hud(s) {
        var on = Object.keys(s.timers).filter(function (k) { return s.timers[k] > 0; });
        return 'BRICKS ' + bricksLeft(s) + (on.length ? '  ' + on.join('+').toUpperCase() : '');
    }

    // The ending: a last wall is laid row by row, a ball streaks up into
    // it, and it shatters outwards under gravity; the cycle repeats every
    // ENDING_CYCLE seconds behind the fireworks. Only e.t drives it, so it
    // needs no state at all.
    var ENDING_CYCLE = 6, WALL_COLS = 12, WALL_ROWS = 5, WALL_TOP = 214, WALL_HIT = 2;

    function drawEndingWall(e, ctx) {
        var t = e.t % ENDING_CYCLE, x0 = (G.W - WALL_COLS * (BW + GAP)) / 2;
        for (var r = 0; r < WALL_ROWS; r++) {
            for (var c = 0; c < WALL_COLS; c++) {
                var x = x0 + c * (BW + GAP), y = WALL_TOP + r * (BH + GAP);
                // Rows drop in from the top, the lowest first.
                var drop = G.clamp((t - (WALL_ROWS - 1 - r) * 0.25) / 0.3, 0, 1), fly = t - WALL_HIT;
                y -= (1 - drop) * 260;
                // Kept translucent: the scene's text is drawn over it.
                ctx.globalAlpha = 0.6 * drop * (fly > 0 ? Math.max(0, 1 - fly / 2.6) : 1);
                if (fly > 0) {
                    // Each brick flies away from the point of impact.
                    x += (c - (WALL_COLS - 1) / 2) * 70 * fly;
                    y += (r - WALL_ROWS) * 40 * fly + 260 * fly * fly;
                }
                ctx.fillStyle = HUES[(r + c) % 3];
                ctx.fillRect(x, y, BW, BH);
            }
        }
        if (t > WALL_HIT - 0.4 && t < WALL_HIT) {
            // The winning ball, on its way up into the wall.
            ctx.globalAlpha = 1; ctx.fillStyle = '#f2eddf';
            ctx.beginPath(); ctx.arc(G.W / 2, G.H - (t - WALL_HIT + 0.4) / 0.4 * 200, BALL_R + 2, 0, Math.PI * 2); ctx.fill();
        }
    }

    G.register('breakout', {
        title: 'BRICK BREAKER',
        blurb: 'Clear every brick. Aim with the edge of the paddle.',
        controls: [
            '← → or mouse: move the paddle (touch: ◀ ▶, or drag on the board)',
            'SPACE / SERVE or click: serve, and fire while the laser capsule is active',
            'Capsules: W wide · M multiball · L laser · S slow · + extra life'
        ],
        levelNames: ['Warm-up', 'Invader', 'The Fortress'],
        colors: { bg: '#1b1c1a', fg: '#f2eddf', accent: '#d98255', dim: '#96958f' },
        lives: 4,
        music: {
            bpm: 126, root: 45, scale: 'mixolydian', prog: [0, 3, 4, 0],
            bass: 'x..x..x.x..x.o..', lead: ['4.4.7.4.2...4...', '5.5.7.5.3...2...', '6.6.8.6.4...6...', '4.2.0.2.4---....'],
            arp: '0121', drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
            leadWave: 'square', bassWave: 'triangle'
        },
        // Phone pad: only left, right and one button are used. A finger on the
        // board works like the mouse — the paddle follows it and a tap serves.
        touch: { a: 'SERVE', hide: ['up', 'down', 'b'] },
        ending: {
            title: 'THE WALL IS DOWN',
            text: 'Not one brick left standing.',
            colors: ['#d5aa58', '#d98255', '#c75c5c', '#f2eddf', '#7fc8a9'],
            draw: drawEndingWall
        },
        init: init, update: update, draw: draw, hud: hud
    });
})();
