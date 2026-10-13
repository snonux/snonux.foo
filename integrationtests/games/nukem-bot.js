// Ordinary-input route for the seeded staircase, platforms, lift and boss.
// Run with play.mjs --eval=integrationtests/games/nukem-bot.js.
// It reads the world to steer; it never writes world state or invokes a win.
(function () {
    const G = SnoGame, results = [], originalRandom = Math.random;
    const towards = dx => dx > 10 ? 1 : dx < -10 ? -1 : 0;
    const atCard = s => s.card && !s.haveCard && s.p.x > s.card.x - 400 && s.card.y === 330;

    function staircase(s, b, q) {
        const p = s.p, points = [
            { x: s.card.x - 195, y: 420 }, { x: s.card.x - 105, y: 390 }, { x: s.card.x + 2, y: 360 }
        ];
        let w = points[Math.min(b.wp, 2)];
        if (p.ground && p.y + p.h <= w.y + 1 && Math.abs(p.x - w.x) < 35 && b.wp < 2) w = points[++b.wp];
        const dx = w.x - p.x;
        q.dir = towards(dx);
        q.jump = p.ground && p.y + p.h > w.y + 1 && Math.abs(dx) < 110;
    }

    function platforms(s, b, q) {
        const p = s.p;
        if (p.ride) {
            const m = p.ride, next = s.movers.find(n => n.ax > m.bx + m.w && n.ax < m.bx + m.w + 160);
            q.dir = 0; q.jump = false;
            if (m.x > m.bx - 10) {
                if (!next || next.x - m.x - m.w < 130) { q.dir = 1; q.jump = true; b.riding = next || null; }
                else q.dir = towards(m.x + 45 - p.x);
            }
        } else {
            const m = b.riding || s.movers.find(m => m.ay === m.by && p.x > m.ax - 130 && p.x < m.bx + m.w - 15 && p.y + p.h > m.y - 120);
            if (m) {
                const dx = m.x + 35 - p.x;
                if (p.ground) {
                    const bad = s.map[16][Math.floor((p.x + p.w + 25) / 30)] !== '#';
                    if (bad) {
                        q.dir = 0; q.jump = false;
                        if (dx < 135 && dx > 0) { q.dir = 1; q.jump = true; b.riding = m; }
                    }
                } else if (b.riding) { q.dir = towards(dx); q.jump = false; }
            }
            if (b.riding && p.x > b.riding.bx + b.riding.w) b.riding = null;
        }
    }

    function lift(s, b, q) {
        const p = s.p, m = s.movers[0];
        if (p.ride === m) {
            q.dir = 0; q.jump = false;
            if (m.y < 335) { q.dir = 1; q.jump = p.x > 2435; if (q.jump) b.lifted = true; }
        } else if (p.x < 2480) { q.dir = towards(m.x + 40 - p.x); q.jump = p.ground && m.y > 410; }
    }

    function fight(s, b, q) {
        const p = s.p, e = s.boss, dx = e.x - p.x;
        q.dir = Math.abs(dx) > 145 ? (dx > 0 ? 1 : -1) : 0;
        if (Math.abs(dx) < 75 && p.ground) q.dir = dx > 0 ? -1 : 1;
        if (p.x < s.arena.x0 + 100 && dx < 210) b.cross = 1;
        if (p.x > s.arena.x1 - 100 && dx > -210) b.cross = -1;
        if (b.cross && ((b.cross > 0 && p.x > e.x + e.w + 60) || (b.cross < 0 && p.x + p.w < e.x - 60))) b.cross = 0;
        q.jump = p.ground && s.shots.some(shot => shot.foe && Math.abs(shot.x - p.x) < 90 && shot.y > p.y && shot.y < p.y + p.h + 20);
        if (b.cross) { q.dir = b.cross; q.jump = p.ground; }
        else if (!q.dir && p.face !== (dx > 0 ? 1 : -1)) q.dir = dx > 0 ? 1 : -1;
    }

    function route(level) {
        const b = { last: {}, jumpFrames: 0, wp: 0, riding: null, lifted: false, cross: 0 };
        return function (i, s) {
            const p = s.p, tgt = s.haveCard ? s.door : (s.card || s.boss), q = { dir: 1, jump: false };
            if (tgt && p.x > tgt.x + 5 && (!s.boss || s.boss.dead)) q.dir = -1;
            const c = Math.floor((p.x + (q.dir > 0 ? p.w + 30 : -30)) / 30), r = Math.floor((p.y + p.h - 1) / 30);
            if (p.ground) {
                const wall = s.map[r]?.[c], below = s.map[r + 1]?.[c];
                q.jump = wall === '#' || wall === 'c' || below === '~' || (!below || below === ' ');
                if (tgt && Math.abs(p.x - tgt.x) < 160 && p.y > tgt.y - 10) q.jump = true;
                if ((level !== 10 || p.x > 3000) && i % 80 === 0) q.jump = true;
            }
            if (atCard(s)) staircase(s, b, q);
            if (level === 5 && !atCard(s)) platforms(s, b, q);
            if (level === 10 && !b.lifted && p.x > 2220 && p.x < 2610) lift(s, b, q);
            if (level === 10 && (!s.boss || !s.boss.awake)) {
                const target = s.enemies.find(e => !e.dead && e.kind !== 'boss' && e.x > p.x + 40 && e.x < p.x + 210 && p.y + 10 > e.y && p.y + 10 < e.y + e.h);
                if (target && !p.inAcid) { q.dir = p.face < 0 ? 1 : 0; q.jump = false; }
            }
            if (s.boss && s.boss.awake && !s.boss.dead) fight(s, b, q);
            if (q.jump && !b.last.up) b.jumpFrames = 32;
            const key = { right: q.dir > 0, left: q.dir < 0, a: true,
                b: s.boss && s.boss.awake && i % 120 === 0, up: b.jumpFrames-- > 0 };
            b.last = key;
            return key;
        };
    }

    try {
        for (const level of [1, 5, 10]) {
            Math.random = G.rng(12345);
            G.debug.start(level);
            const steer = route(level);
            let ticks = 0;
            for (; ticks < 40000 && G.debug.state().screen === 'play'; ticks++)
                G.debug.step(1, (i, s) => steer(ticks, s));
            const s = G.debug.s();
            results.push({ level, screen: G.debug.state().screen, ticks,
                hp: s.p.hp, lives: G.lives, clock: s.clock, haveCard: s.haveCard,
                bossDown: !s.boss || s.boss.dead });
            G.debug.start(level);
            G.debug.step(20000, {});
            results[results.length - 1].idleScreen = G.debug.state().screen;
        }
        return results;
    } finally {
        Math.random = originalRandom;
    }
})()
