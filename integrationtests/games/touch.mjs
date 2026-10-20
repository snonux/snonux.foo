// Phone checks for the theme games: the touch half of e2e.mjs (--touch).
//
// Chrome is turned into a phone (mobile viewport, touch screen, coarse
// pointer) and every interaction is a real touch event. Per theme and per
// orientation it checks that the game launches from a tap on the splash
// button; that the touch pad is there, big enough, inside the viewport and
// nowhere on the canvas; that every pad button holds its key while touched
// and only then; that two fingers hold two buttons; that a full direction
// pad gives diagonals and follows a sliding thumb; that a tap on the canvas
// starts the level and, in play, moves SnoGame.mouse to the tap; that near
// misses on the level boxes start nothing; and that the ✕ button quits.
//
// Engine-level cases (no particular game) cover the def.touch options, a
// launch that does not get fullscreen on a blog page wider than the phone,
// and turning the phone while a game is open.

import { join } from 'node:path';
import { sleep } from './lib.mjs';

// The two ways a phone is held (CSS pixels of a current mid-size phone).
export const PHONES = [
    { name: 'landscape', width: 844, height: 390 },
    { name: 'portrait', width: 390, height: 844 },
];

const STATE = 'SnoGame.debug.state()';
const MIN_BUTTON = 48;  // CSS px: the smallest target a thumb hits reliably
const MIN_CANVAS = 280; // CSS px wide: below this the playfield is unreadable

// The logical button each key code of the pad must also raise.
const LOGICAL = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', Space: 'a', KeyX: 'b',
};
const ARROWS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
const WASD = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' };

// Rectangles of everything the layout places, read from the live page, plus
// the overlay itself and the part of the page the phone actually shows (the
// visual viewport). window.innerWidth is deliberately not used: on a page
// wider than the phone it is not the size of anything on screen.
// A button's `part` names the thing that follows one finger: a direction pad
// as a whole, or a single action button.
const LAYOUT = `(function(){
  function r(e){var b=e.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};}
  var root=document.getElementById('sno-game'),pad=root&&root.querySelector('.sno-game-pad'),v=visualViewport;
  if(!pad)return null;
  return {root:r(root),seen:{x:v.offsetLeft,y:v.offsetTop,w:v.width,h:v.height},
    canvas:r(root.querySelector('canvas')),close:r(root.querySelector('.sno-game-close')),closeText:root.querySelector('.sno-game-close').textContent,
    shown:getComputedStyle(pad).display!=='none'&&getComputedStyle(pad).visibility!=='hidden',
    buttons:[].map.call(pad.querySelectorAll('[data-code]'),function(e){var b=r(e),c=e.parentNode.className;b.code=e.getAttribute('data-code');b.label=e.textContent;
      b.part=/dpad/.test(c)?'sno-game-dpad'+(/fire/.test(c)?'-fire':''):'act-'+b.code;return b;})};})()`;

function check(cond, message) { if (!cond) throw new Error(message); }

const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const within = (r, o, slack = 0) => r.x >= o.x - slack && r.y >= o.y - slack && r.x + r.w <= o.x + o.w + slack && r.y + r.h <= o.y + o.h + slack;
// Inside the overlay, which checkLayout has shown to be on screen itself.
const inside = (r, l) => within(r, l.root);

// How many separate fingers a def.touch pad can take: one per direction pad
// and one per action button.
function padParts(touch) {
    const t = touch || {}, hide = new Set(t.hide || []);
    const dpads = ['left', 'right', 'up', 'down'].some((d) => !hide.has(d)) ? (t.twin ? 2 : 1) : 0;
    return dpads + ['a', 'b'].filter((b) => !hide.has(b)).length;
}

// Whether a direction pad of this def.touch has all four directions.
const fullStick = (touch) => !((touch && touch.hide) || []).some((h) => ARROWS[h]);

// The key codes a game's def.touch asks the pad for.
function expectedCodes(touch) {
    const t = touch || {}, hide = new Set(t.hide || []), codes = [];
    for (const dir of ['left', 'right', 'up', 'down']) {
        if (hide.has(dir)) continue;
        codes.push(t.twin ? WASD[dir] : ARROWS[dir]);
        if (t.twin) codes.push(ARROWS[dir]);
    }
    if (!hide.has('a')) codes.push('Space');
    if (!hide.has('b')) codes.push('KeyX');
    return codes.sort();
}

async function launchByTap(page, base, theme) {
    await page.goto(`${base}/index.html`);
    check(await page.eval(`matchMedia('(pointer: coarse)').matches`), 'phone emulation did not produce a coarse pointer');
    await page.eval(`snonuxSwitchTheme(${JSON.stringify(theme)})`);
    const title = await page.eval(`SnoGame.titles[${JSON.stringify(theme)}]`);
    const btn = '#splash-overlay .splash-game-btn';
    await page.waitFor(`(document.querySelector('${btn}')||{textContent:''}).textContent.indexOf(${JSON.stringify(title)})>=0`, 'splash "Play" button for this theme');
    const measure = () => page.eval(`(function(){var e=document.querySelector('${btn}');e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()`);
    // The button can still move after the theme switch: when the theme's
    // font arrives the row of splash buttons may wrap differently. Tap only
    // once it has stayed put.
    let r = await measure();
    for (let i = 0; i < 20; i++) {
        await sleep(100);
        const again = await measure();
        const still = again.x === r.x && again.y === r.y && again.w === r.w;
        r = again;
        if (still) break;
    }
    await page.tap(centre(r).x, centre(r).y);
    await page.waitFor(`SnoGame.active && ${STATE} && ${STATE}.screen==='title'`, 'title screen after tapping the splash button');
    check((await page.eval(STATE)).theme === theme, `tap launched the wrong game`);
    // The tap is a user gesture, so the overlay must have taken the screen.
    await page.waitFor(`document.fullscreenElement && document.fullscreenElement.id==='sno-game'`, 'the overlay to go fullscreen after a tap launch');
}

// Geometry: the pad exists, can be hit, and stays off the playfield.
function checkLayout(l, phone, touch) {
    check(l && l.shown, 'no visible touch pad');
    const want = expectedCodes(touch), got = l.buttons.map((b) => b.code).sort();
    check(JSON.stringify(got) === JSON.stringify(want), `pad buttons ${got} do not match def.touch (want ${want})`);
    const box = (r) => [r.x, r.y, r.w, r.h].map(Math.round).join(',');
    check(within(l.root, l.seen, 1), `overlay ${box(l.root)} is not inside what the phone shows (${box(l.seen)})`);
    check(Math.abs(l.root.w - phone.width) <= 1 && Math.abs(l.root.h - phone.height) <= 1, `overlay is ${box(l.root)}, the phone ${phone.width}x${phone.height}`);
    check(l.canvas.w >= MIN_CANVAS && inside(l.canvas, l), `canvas ${box(l.canvas)} is too small or outside the overlay ${box(l.root)}`);
    check(Math.abs(l.canvas.w / l.canvas.h - 16 / 9) < 0.02, 'canvas is not 16:9');
    check(inside(l.close, l) && l.close.w >= 40 && l.close.h >= 40, `close button ${box(l.close)} is off screen or too small to tap`);
    check(l.closeText === '✕', `close button reads "${l.closeText}" on a phone, which has no Esc key`);
    check(!overlaps(l.close, l.canvas), 'close button covers the canvas');
    for (const b of l.buttons) {
        check(b.w >= MIN_BUTTON && b.h >= MIN_BUTTON, `pad button ${b.code} is ${Math.round(b.w)}x${Math.round(b.h)}px, below ${MIN_BUTTON}`);
        check(inside(b, l), `pad button ${b.code} is outside the overlay`);
        check(!overlaps(b, l.canvas), `pad button ${b.code} covers the canvas`);
        check(!overlaps(b, l.close), `pad button ${b.code} overlaps the close button`);
    }
    checkPlacement(l, phone);
}

// Landscape puts the pad in gutters beside the canvas, portrait below it.
function checkPlacement(l, phone) {
    const c = l.canvas;
    if (phone.width < phone.height) {
        check(l.buttons.every((b) => b.y >= c.y + c.h), 'portrait: the pad must be below the canvas');
        check(c.y === l.root.y, 'portrait: the canvas must be at the top');
        return;
    }
    const left = l.buttons.filter((b) => b.x + b.w <= c.x), right = l.buttons.filter((b) => b.x >= c.x + c.w);
    check(left.length + right.length === l.buttons.length, 'landscape: every pad button must be beside the canvas');
    // The left gutter holds the direction pad, so a game without one has none.
    const dirs = l.buttons.filter((b) => b.part.startsWith('sno-game-dpad')).length;
    check(!dirs || left.length > 0, 'landscape: no direction pad in the left gutter');
    check(l.close.x >= c.x + c.w, 'landscape: the close button must be in the right gutter');
}

const keyState = (codes) => `(function(){var o={};${JSON.stringify(codes)}.forEach(function(c){o[c]=SnoGame.down(c);});
  o.key=JSON.parse(JSON.stringify(SnoGame.key));return o;})()`;

// Every button on its own: down while touched, up again after.
async function checkEachButton(page, l) {
    const codes = l.buttons.map((b) => b.code);
    for (const b of l.buttons) {
        const p = centre(b);
        await page.touch('touchStart', [p]);
        let st = await page.eval(keyState(codes));
        check(st[b.code], `touching ${b.code} did not set SnoGame.down('${b.code}')`);
        check(st.key[LOGICAL[b.code]], `touching ${b.code} did not set SnoGame.key.${LOGICAL[b.code]}`);
        check(codes.every((c) => c === b.code || !st[c]), `touching ${b.code} also pressed ${codes.filter((c) => c !== b.code && st[c])}`);
        await page.touch('touchEnd', []);
        st = await page.eval(keyState(codes));
        check(codes.every((c) => !st[c]), `releasing ${b.code} left ${codes.filter((c) => st[c])} down`);
        check(Object.values(st.key).every((v) => !v), `releasing ${b.code} left a logical button down`);
    }
}

// Two fingers on two different parts of the pad: both hold, and lifting one
// leaves the other held.
async function checkTwoFingers(page, l) {
    const first = l.buttons[0], second = first && l.buttons.find((b) => b.part !== first.part);
    if (!second) return false; // fewer than two parts: nothing to combine
    const p1 = { ...centre(first), id: 1 }, p2 = { ...centre(second), id: 2 };
    await page.touch('touchStart', [p1]);
    await page.touch('touchStart', [p1, p2]);
    let st = await page.eval(keyState([first.code, second.code]));
    check(st[first.code] && st[second.code], `two fingers: ${first.code}=${st[first.code]} ${second.code}=${st[second.code]}, want both`);
    await page.touch('touchEnd', [p2]);
    st = await page.eval(keyState([first.code, second.code]));
    check(st[first.code] && !st[second.code], `lifting the second finger: ${first.code}=${st[first.code]} ${second.code}=${st[second.code]}`);
    await page.touch('touchEnd', []);
    st = await page.eval(keyState([first.code, second.code]));
    check(!st[first.code] && !st[second.code], 'two fingers: a button stayed down after both lifted');
    return true;
}

// A full direction pad is an 8-way stick: its corner is a diagonal, and a
// thumb sliding across it changes direction without lifting. With dirs: 4
// it gives one direction at a time, also for a thumb well off the axis.
async function checkStick(page, l, part, fourWay) {
    const btn = (code) => l.buttons.find((b) => b.part === part && LOGICAL[b.code] === code);
    const up = btn('up'), left = btn('left'), right = btn('right');
    const codes = [up.code, left.code, right.code], held = (st) => codes.filter((c) => st[c]).join('+');
    // 31° above the left axis: a diagonal for eight sectors, "left" for four.
    await page.touch('touchStart', [{ x: centre(left).x, y: centre(up).y + up.h * 0.4 }]);
    let st = await page.eval(keyState(codes));
    const want = fourWay ? left.code : `${up.code}+${left.code}`;
    check(held(st) === want, `${part}: a thumb up-left of centre gave "${held(st)}", want "${want}"`);
    await page.touch('touchMove', [centre(right)]);
    // Chrome delivers a touch move with its next frame, which on a busy
    // machine can be after the command has returned: give it a moment.
    for (let i = 0; i < 20; i++) {
        st = await page.eval(keyState(codes));
        if (held(st) === right.code) break;
        await sleep(50);
    }
    check(held(st) === right.code, `${part}: sliding to the right gave "${held(st)}"`);
    await page.touch('touchEnd', []);
    st = await page.eval(keyState(codes));
    check(held(st) === '', `${part}: "${held(st)}" stayed down after the slide`);
}

// Client coordinates of a logical canvas point (960x540 space).
const onCanvas = (l, x, y) => ({ x: l.canvas.x + x / 960 * l.canvas.w, y: l.canvas.y + y / 540 * l.canvas.h });

// The level boxes as the engine draws them on a phone (TOUCH_BOX in
// games.js): three 80 px squares, 32 px apart, centred, from y 322.
const boxCentre = (level) => ({ x: 328 + (level - 1) * 112 + 40, y: 362 });

// On a fresh save only level 1 is open. A tap on a locked box, or beside the
// row at the height of the boxes, is a miss and must not start anything.
async function checkTitleMisses(page, l) {
    for (const [what, at] of [['a locked level box', boxCentre(3)], ['beside the row of level boxes', { x: 12, y: 362 }]]) {
        const p = onCanvas(l, at.x, at.y);
        await page.tap(p.x, p.y);
        await sleep(120);
        const st = await page.eval(STATE);
        check(st.screen === 'title' && st.sel === 1, `a tap on ${what} led to screen ${st.screen}, level ${st.sel}`);
    }
}

// A tap above the level boxes starts the selected level from the title.
async function checkTapStarts(page, l) {
    check((await page.eval(STATE)).screen === 'title', 'expected the title screen');
    await checkTitleMisses(page, l);
    const p = onCanvas(l, 480, 60);
    await page.tap(p.x, p.y);
    await page.waitFor(`${STATE}.screen==='intro' || ${STATE}.screen==='play'`, 'the level to start after a tap on the canvas');
}

// In play a finger on the canvas is the mouse: position and held button.
async function checkTapAims(page, l) {
    for (const [x, y] of [[300, 200], [820, 430]]) {
        await page.eval('SnoGame.debug.start(1)');
        const p = onCanvas(l, x, y);
        await page.touch('touchStart', [p]);
        const m = await page.eval(`({x:SnoGame.mouse.x,y:SnoGame.mouse.y,down:SnoGame.mouse.down,screen:${STATE}.screen})`);
        await page.touch('touchEnd', []);
        check(Math.abs(m.x - x) <= 3 && Math.abs(m.y - y) <= 3, `tap at ${x},${y} put SnoGame.mouse at ${m.x.toFixed(1)},${m.y.toFixed(1)}`);
        check(m.down, 'a finger on the canvas did not set SnoGame.mouse.down');
        check(!(await page.eval('SnoGame.mouse.down')), 'lifting the finger left SnoGame.mouse.down set');
    }
}

async function checkCloseQuits(page, l) {
    await page.tap(centre(l.close).x, centre(l.close).y);
    await page.waitFor(`!SnoGame.active && !document.getElementById('sno-game')`, 'the ✕ button to quit');
    check(!(await page.eval('document.fullscreenElement')), 'quitting left the page in fullscreen');
}

// Everything about the pad itself, for the def.touch the game declared:
// where it is, and that its buttons, two fingers and sticks work.
async function checkPad(page, phone, touch) {
    const l = await page.eval(LAYOUT);
    checkLayout(l, phone, touch);
    await checkEachButton(page, l);
    const parts = padParts(touch);
    check(new Set(l.buttons.map((b) => b.part)).size === parts, `pad has ${new Set(l.buttons.map((b) => b.part)).size} parts, def.touch asks for ${parts}`);
    // Two parts or more must take two fingers; fewer cannot, by declaration.
    check((await checkTwoFingers(page, l)) === (parts >= 2), 'two pad parts could not be held together');
    if (fullStick(touch)) {
        const sticks = [...new Set(l.buttons.filter((b) => b.part.startsWith('sno-game-dpad')).map((b) => b.part))];
        check(sticks.length === (touch && touch.twin ? 2 : 1), `${sticks.length} direction pad(s)`);
        for (const part of sticks) await checkStick(page, l, part, !!touch && touch.dirs === 4);
    }
    return l;
}

async function finish(page, l, shots, name) {
    await checkTapAims(page, l);
    if (shots) { await sleep(120); await page.screenshot(join(shots, `${name}.jpg`)); }
    const errs = await page.eval('SnoGame.debug.errors.slice()');
    check(!errs.length, `engine error: ${errs[0]}`);
    await checkCloseQuits(page, l);
}

async function testOrientation(page, base, theme, phone, shots) {
    await page.emulatePhone(phone.width, phone.height);
    await launchByTap(page, base, theme);
    const touch = (await page.eval('SnoGame.debug.def()')).touch;
    if (shots) { await sleep(120); await page.screenshot(join(shots, `${theme}-touch-${phone.name}-title.jpg`)); }
    await checkTapStarts(page, await page.eval(LAYOUT));
    await page.eval('SnoGame.debug.start(1)');
    const l = await checkPad(page, phone, touch);
    await finish(page, l, shots, `${theme}-touch-${phone.name}-play`);
}

// def.touch variants no shipped game may happen to use; each is tried on a
// stand-in game so the pad options stay covered whatever the games declare.
const PAD_CONFIGS = [
    { twin: true },
    { twin: true, hide: ['a', 'b'], dirs: 4 },
    { a: 'JUMP', b: 'BOMB', hide: ['up', 'down'] },
    { a: 'FIRE', hide: ['b', 'down'] },
    { hide: ['a', 'b'], dirs: 4 },
    { hide: ['left', 'right', 'up', 'down'] },
    { hide: ['left', 'right', 'up', 'down', 'b'] },
    { hide: ['left', 'right', 'up', 'down', 'a', 'b'] },
];

const standIn = (touch) => `SnoGame.register('breakout', { touch: ${JSON.stringify(touch)},
  init: function () { return {}; }, update: function () {}, draw: function () {} })`;

// Engine-level check of def.touch: buttons, labels and layout per variant.
export async function testPadConfigs(page, base, shots) {
    for (const phone of PHONES) {
        await page.emulatePhone(phone.width, phone.height);
        for (const [i, touch] of PAD_CONFIGS.entries()) {
            const what = `def.touch ${JSON.stringify(touch)} in ${phone.name}`;
            await page.goto(`${base}/index.html`);
            await page.eval(`${standIn(touch)}; SnoGame.launch('breakout'); SnoGame.debug.start(1)`);
            let l;
            try { l = await checkPad(page, phone, touch); } catch (err) { err.message = `${what}: ${err.message}`; throw err; }
            const label = (code) => (l.buttons.find((b) => b.code === code) || {}).label;
            check(label('Space') === ((touch.hide || []).includes('a') ? undefined : touch.a || 'A'), `${what}: A is labelled ${label('Space')}`);
            check(label('KeyX') === ((touch.hide || []).includes('b') ? undefined : touch.b || 'B'), `${what}: B is labelled ${label('KeyX')}`);
            if (shots) await page.screenshot(join(shots, `pad-config-${i}-${phone.name}.jpg`));
            await checkCloseQuits(page, l);
        }
    }
}

// A small phone, both ways up: the sizes where a wide blog page hurts most.
const SMALL = [{ name: 'portrait', width: 360, height: 800 }, { name: 'landscape', width: 800, height: 360 }];

// A point of the bare overlay: no canvas, pad part or close button there.
async function barePoint(page, l) {
    const p = { x: l.root.x + l.root.w - 4, y: l.root.y + l.root.h - 4 };
    check(await page.eval(`document.elementFromPoint(${p.x},${p.y}).id==='sno-game'`), 'no bare overlay in the bottom right corner');
    return p;
}

// The title screen by touch alone, with three levels unlocked: a box picks
// its level, and a tap on the bare overlay (a gutter) starts it.
async function checkTitleByTouch(page, l) {
    const box = onCanvas(l, boxCentre(3).x, boxCentre(3).y);
    await page.tap(box.x, box.y);
    await sleep(120);
    let st = await page.eval(STATE);
    check(st.screen === 'title' && st.sel === 3, `tapping level box 3 gave screen ${st.screen}, level ${st.sel}`);
    const bare = await barePoint(page, l);
    await page.tap(bare.x, bare.y);
    await page.waitFor(`${STATE}.screen==='intro' || ${STATE}.screen==='play'`, 'a tap beside the canvas to start the level');
    st = await page.eval(STATE);
    check(st.level === 3, `the tap started level ${st.level}, want 3`);
}

// A launch that gets no fullscreen (a refused request, a browser without it)
// on the terminal theme, whose blog page is wider than a small phone: the
// overlay must still be laid out for the screen, not for the zoomed-out page.
export async function testNoFullscreen(page, base, shots) {
    for (const phone of SMALL) {
        await page.emulatePhone(phone.width, phone.height);
        await page.goto(`${base}/index.html`);
        await page.eval(`snonuxSwitchTheme('terminal'); document.cookie='snog_terminal=3.0.1.0; path=/'`);
        await page.waitFor(`/kill/.test((document.querySelector('#splash-overlay .splash-game-btn')||{textContent:''}).textContent)`, 'the terminal theme');
        // No tap, so no user gesture: the fullscreen request is refused.
        await page.eval(`SnoGame.launch('terminal')`);
        await page.waitFor(`${STATE} && ${STATE}.screen==='title'`, 'the title screen');
        check(!(await page.eval('document.fullscreenElement')), 'expected a launch without fullscreen');
        try {
            await checkTitleByTouch(page, await page.eval(LAYOUT));
            await page.eval('SnoGame.debug.start(1)');
            const l = await checkPad(page, phone, (await page.eval('SnoGame.debug.def()')).touch);
            await finish(page, l, shots, `terminal-nofullscreen-${phone.width}x${phone.height}`);
        } catch (err) { err.message = `no fullscreen, ${phone.width}x${phone.height}: ${err.message}`; throw err; }
    }
}

// Some phone browsers report a fine main pointer (Chrome in the stock
// Android emulator does). A game launched by a finger must get the pad and
// the phone wording there too, and a launch by key afterwards must not.
export async function testFinePointerPhone(page, base, shots) {
    const phone = PHONES[0];
    await page.send('Emulation.setDeviceMetricsOverride', { width: phone.width, height: phone.height, deviceScaleFactor: 2, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await page.goto(`${base}/index.html`);
    check(!(await page.eval(`matchMedia('(pointer: coarse)').matches`)), 'expected a fine pointer for this test');
    const btn = '#splash-overlay .splash-game-btn';
    await page.waitFor(`document.querySelector('${btn}')`, 'the splash "Play" button');
    const r = await page.eval(`(function(){var b=document.querySelector('${btn}').getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height};})()`);
    await page.tap(centre(r).x, centre(r).y);
    await page.waitFor(`SnoGame.active && ${STATE} && ${STATE}.screen==='title'`, 'the title screen after a tap on a fine-pointer phone');
    check(await page.eval('SnoGame.isTouch()'), 'SnoGame.isTouch() is false after a launch by finger');
    await page.eval('SnoGame.debug.start(1)');
    const l = await checkPad(page, phone, (await page.eval('SnoGame.debug.def()')).touch);
    if (shots) await page.screenshot(join(shots, 'fine-pointer-phone.jpg'));
    await checkCloseQuits(page, l);
    // The same visitor now presses a key: that is a keyboard, not a phone.
    await page.press('KeyA');
    await page.waitFor(`SnoGame.active && ${STATE} && ${STATE}.screen==='title'`, 'the game after the A key');
    check(!(await page.eval(`!!document.querySelector('.sno-game-pad')`)), 'a launch by key still built the touch pad');
    await page.eval('SnoGame.quit()');
}

// Turning the phone while a game is open, without fullscreen: every turn
// must end in the layout a fresh launch at that size would get.
export async function testRotation(page, base, shots) {
    const [land, port] = PHONES;
    await page.emulatePhone(land.width, land.height);
    await page.goto(`${base}/index.html`);
    await page.eval(`SnoGame.launch('breakout')`);
    await page.waitFor(`${STATE} && ${STATE}.registered`, 'the game script to register');
    await page.eval('SnoGame.debug.start(1)');
    // The pad must match whatever this game declares, not the default set.
    const touch = await page.eval('SnoGame.debug.def().touch');
    let l;
    for (const [i, phone] of [land, port, land, port].entries()) {
        await page.emulatePhone(phone.width, phone.height);
        await page.waitFor(`Math.abs(document.getElementById('sno-game').clientWidth-${phone.width})<=1`, `the overlay to follow turn ${i} to ${phone.name}`);
        await sleep(150);
        try { l = await checkPad(page, phone, touch); } catch (err) { err.message = `turn ${i} to ${phone.name}: ${err.message}`; throw err; }
        if (shots) await page.screenshot(join(shots, `rotation-${i}-${phone.name}.jpg`));
    }
    await checkCloseQuits(page, l);
}

// Runs every phone orientation for one theme.
export async function testThemeTouch(page, base, theme, shots) {
    page.problems.length = 0;
    await page.send('Network.clearBrowserCookies');
    for (const phone of PHONES) {
        try {
            await testOrientation(page, base, theme, phone, shots);
        } catch (err) {
            err.message = `${phone.name} ${phone.width}x${phone.height}: ${err.message}`;
            throw err;
        }
    }
    check(!page.problems.length, `page errors: ${page.problems.slice(0, 3).join(' | ')}`);
}
