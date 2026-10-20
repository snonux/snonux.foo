// Electro Ball campaign bot: plunger, flippers and nudge, nothing else.
// It charges the plunger in pulses so the serve strength varies, flips the
// flipper on the ball's side when a falling ball reaches the flipper band,
// holds it for a fifth of a second (a held flip, not a flap, so the coils
// stay cool), and nudges a ball heading down the middle or into an outlane
// only while the tilt meter is low, so it never tilts. On a phone PLUNGE
// doubles as the right flipper and NUDGE is B, just as for a player.
({
    play: function (s, G, mem) {
        var input = {}, lane = s.balls.some(function (b) { return b.inLane && b.y > 510 && Math.abs(b.vy) < 40; });
        mem.charge = lane ? (mem.charge || 0) + 1 : 0;
        if (lane) input.a = mem.charge % 75 < 55;
        mem.left = Math.max(0, (mem.left || 0) - 1);
        mem.right = Math.max(0, (mem.right || 0) - 1);
        s.balls.forEach(function (b) {
            if (b.inLane || b.held) return;
            if (b.y > 460 && b.y < 507 && b.vy > 20) {
                if (b.x < 480 && mem.left === 0) mem.left = 12;
                if (b.x >= 452 && mem.right === 0) mem.right = 12;
            }
            var middle = b.y > 485 && Math.abs(b.x - 466) < 25;
            var outlane = b.y > 330 && b.y < 420 && b.vy > 0 && (b.x < 334 || b.x > 598);
            if ((middle || outlane) && s.tilt < 0.55 && s.nudgeT <= 0) input[s.touch ? 'b' : 'down'] = true;
        });
        input.left = mem.left > 1;
        if (s.touch) input.a = input.a || mem.right > 1;
        else input.right = mem.right > 1;
        return input;
    },
    budget: 300
})
