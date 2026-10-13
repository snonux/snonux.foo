// Checks of the game overview menu (shared/arcade.js), run by e2e.mjs in both
// modes: with mouse and keyboard on the desktop, and with taps on a phone.
import { join } from 'node:path';
import { sleep, themesWithGames } from './lib.mjs';

const STATE = 'SnoGame.debug.state()';
const SPLASH_UP = `!document.getElementById('splash-overlay').classList.contains('splash--dismissed')`;
// The game picked from the menu: deliberately not the test site's own theme
// (neon), since starting another theme's game is the point of the menu.
const PICK = 'dos';

function check(cond, message) { if (!cond) throw new Error(message); }

// Centre of an element in client pixels, scrolled into view first.
function centre(page, selector) {
    return page.eval(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;
      e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
}

async function activate(page, selector, touch) {
    const p = await centre(page, selector);
    check(p, `no ${selector} on the page`);
    if (touch) await page.tap(p.x, p.y); else await page.click(selector);
}

// Every game is listed once, with its title, its theme, a description and a
// picture the server really has.
async function checkCards(page, base) {
    const cards = await page.eval(`Array.prototype.map.call(document.querySelectorAll('.sno-arcade-card'),function(c){
      return {theme:c.getAttribute('data-theme'),title:c.querySelector('.sno-arcade-title').textContent,
        label:c.querySelector('.sno-arcade-theme').textContent,blurb:c.querySelector('.sno-arcade-blurb').textContent,
        img:c.querySelector('img').getAttribute('src')};})`);
    const themes = themesWithGames();
    check(cards.length === themes.length, `the menu lists ${cards.length} games, want ${themes.length}`);
    check(cards[0].theme === 'neon' && /this theme/.test(cards[0].label), `the active theme's game must come first, got ${cards[0].theme}`);
    for (const theme of themes) {
        const c = cards.find((x) => x.theme === theme);
        check(c, `${theme} is missing from the menu`);
        check(c.title === await page.eval(`SnoGame.titles['${theme}']`), `${theme}: wrong title "${c.title}"`);
        check(c.blurb.length > 20, `${theme}: no description`);
        check(c.label.toLowerCase().includes(theme), `${theme}: the card does not name its theme`);
        const res = await fetch(`${base}/${c.img}`);
        check(res.ok && res.headers.get('content-type') === 'image/jpeg', `${theme}: picture ${c.img} not served (${res.status})`);
    }
}

// Arrow keys and vi's h/j/k/l walk the cards, one key per assertion so a
// single broken one cannot hide behind the moves of another, and no key
// gets through to the splash behind (Enter there would open the blog, "a"
// would start the theme's game).
async function checkKeys(page) {
    const focused = `document.activeElement.getAttribute('data-theme')`;
    // The card directly below the focused one, as the browser laid the grid
    // out: an oracle for "a row down" that does not recompute the menu's
    // own column count.
    const below = `(function(){var me=document.activeElement,
      cards=document.querySelectorAll('.sno-arcade-grid .sno-arcade-card');
      for(var i=0;i<cards.length;i++){var c=cards[i];
      if(c.offsetTop>me.offsetTop&&c.offsetLeft===me.offsetLeft)return c.getAttribute('data-theme');}return null;})()`;
    const first = await page.eval(focused);
    await page.press('KeyL');
    const second = await page.eval(focused);
    check(second && second !== first, 'l did not move to the next card');
    const rowTop = await page.eval('document.activeElement.offsetTop');
    const down = await page.eval(below);
    await page.press('KeyJ');
    check(await page.eval(focused) === down, 'j did not move to the card below');
    check(await page.eval('document.activeElement.offsetTop') > rowTop, 'j stayed in its row');
    await page.press('KeyK');
    check(await page.eval(focused) === second, 'k did not move a row up');
    await page.press('KeyH');
    check(await page.eval(focused) === first, 'h did not move back to the first card');
    // Shift does not change the key code, so vi keys work with Caps Lock on
    // too; Meta+j, like any browser shortcut, must not move the focus. The
    // shifted events carry uppercase key/text and the same physical code,
    // so they also catch a handler that only accepts lowercase e.key.
    await page.press('KeyL', 8);
    check(await page.eval(focused) === second, 'Shift+l did not move to the next card');
    await page.press('KeyJ', 4);
    check(await page.eval(focused) === second, 'Meta+j moved the focus');
    await page.press('KeyH', 8);
    check(await page.eval(focused) === first, 'Shift+h did not move back to the first card');
    await page.press('ArrowRight');
    check(await page.eval(focused) === second, 'ArrowRight did not move to the next card');
    const rowTop2 = await page.eval('document.activeElement.offsetTop');
    await page.press('ArrowDown');
    check(await page.eval(focused) === down, 'ArrowDown did not move to the card below, as j did');
    check(await page.eval('document.activeElement.offsetTop') > rowTop2, 'ArrowDown stayed in its row');
    await page.press('ArrowUp');
    check(await page.eval(focused) === second, 'ArrowUp did not move a row up');
    await page.press('ArrowLeft');
    check(await page.eval(focused) === first, 'ArrowLeft did not move back to the first card');
    await page.press('KeyA'); await page.press('KeyW');
    await sleep(150);
    check(await page.eval(focused) === first, 'a or w moved the focus in the menu');
    check(await page.eval(SPLASH_UP), 'a key pressed in the menu dismissed the splash');
    check(!(await page.eval('SnoGame.active')), 'a key pressed in the menu started a game');
    check(await page.eval('SnoArcade.isOpen()'), 'a letter key closed the menu');
    // Tab goes round the menu (25 cards and the close button) and never out
    // to the page behind, where Enter would press a splash button.
    for (let i = 0; i < 30; i++) {
        await page.press('Tab');
        check(await page.eval(`!!document.activeElement.closest('#sno-arcade')`), `Tab left the menu after ${i + 1} presses`);
    }
}

// The "All games" buttons: one each beside the splash and header launch
// buttons, however often shared.js asks for them (it does after every theme
// switch).
async function checkButtonsOnce(page) {
    await page.eval('snonuxGameDecorate(); snonuxGameDecorate()');
    for (const cls of ['.splash-arcade-btn', '.header-arcade-btn', '.splash-game-btn', '.header-game-btn']) {
        const n = await page.eval(`document.querySelectorAll('${cls}').length`);
        check(n === 1, `${n} ${cls} buttons on the page, want 1`);
    }
}

// From the header, by keyboard: Enter on the focused button opens the menu
// (not the selected post), and after a game and Esc focus is back on it.
async function checkHeaderByKeyboard(page) {
    await page.eval(`var d=document.createElement('div');d.id='arcade-test-inert';d.inert=true;document.body.appendChild(d);
      document.querySelector('.header-arcade-btn').focus()`);
    await page.press('Enter');
    await page.waitFor('SnoArcade.isOpen()', 'the menu to open with Enter on the header button');
    await checkPlayAndReturn(page, false);
    await page.press('Escape');
    await page.waitFor('!SnoArcade.isOpen()', 'the menu to close');
    check(await page.eval(`document.activeElement.classList.contains('header-arcade-btn')`), 'focus did not return to the button that opened the menu');
    check(!(await page.eval(`!!document.querySelector('[data-sno-arcade-inert]')`)), 'the page stayed inert after the menu closed');
    check(await page.eval(`document.getElementById('arcade-test-inert').inert`), 'closing the menu woke up an element that was inert before it opened');
    // The Play button next to it answers to Enter the same way.
    await page.eval(`document.querySelector('.header-game-btn').focus()`);
    await page.press('Enter');
    await page.waitFor(`SnoGame.active && ${STATE} && ${STATE}.screen==='title'`, 'the game to start with Enter on the header Play button');
    await page.eval('SnoGame.quit()');
}

// A card starts its game; quitting the game leads back to the menu, on the
// same card.
async function checkPlayAndReturn(page, touch) {
    await activate(page, `.sno-arcade-card[data-theme="${PICK}"]`, touch);
    await page.waitFor(`${STATE} && ${STATE}.registered && ${STATE}.screen==='title'`, `the title screen of ${PICK}`);
    check((await page.eval(STATE)).theme === PICK, 'the wrong game started');
    check(!(await page.eval('SnoArcade.isOpen()')), 'the menu stayed open under the game');
    if (touch) check(await page.eval(`!!document.querySelector('.sno-game-pad')`), 'a game started by a tap in the menu has no touch pad');
    if (touch) await page.eval('SnoGame.quit()'); else await page.press('Escape');
    await page.waitFor('!SnoGame.active && SnoArcade.isOpen()', 'the menu to come back after the game');
    check(await page.eval(`document.activeElement.getAttribute('data-theme')`) === PICK, 'the menu did not return to the card that was played');
}

export async function testArcadeMenu(page, base, shots, touch) {
    if (touch) await page.emulatePhone(390, 844);
    await page.goto(`${base}/index.html`);
    await page.waitFor(`!!document.querySelector('.splash-arcade-btn')`, 'the "All games" button on the splash');
    await activate(page, '.splash-arcade-btn', touch);
    await page.waitFor('SnoArcade.isOpen()', 'the menu to open');
    check(await page.eval(SPLASH_UP), 'opening the menu dismissed the splash');
    check(await page.eval(`document.getElementById('splash-overlay').inert`), 'the page behind the open menu can still be operated');
    await checkCards(page, base);
    check(await page.eval(`(function(){var r=document.getElementById('sno-arcade');return r.scrollWidth<=r.clientWidth;})()`), 'the menu is wider than the screen');
    if (shots) await page.screenshot(join(shots, `arcade-menu${touch ? '-touch' : ''}.jpg`));
    if (!touch) await checkKeys(page);
    await checkPlayAndReturn(page, touch);

    // Closing: Esc on the desktop, the close button by touch. A game started
    // the ordinary way afterwards must not bring the menu back when it ends.
    if (touch) await activate(page, '.sno-arcade-close', true); else await page.press('Escape');
    await page.waitFor('!SnoArcade.isOpen()', 'the menu to close');
    check(await page.eval(SPLASH_UP), 'closing the menu dismissed the splash');
    await page.eval(`SnoGame.launch()`);
    await page.waitFor(`${STATE} && ${STATE}.screen==='title'`, 'the title screen');
    await page.eval('SnoGame.quit()');
    await sleep(150);
    check(!(await page.eval('SnoArcade.isOpen()')), 'the menu opened after a game that was not started from it');

    await checkButtonsOnce(page);

    // The header has the button too, once the splash is gone, except on a
    // phone held upright, where the header has no room for it.
    await page.eval('window._snonuxDismissSplash && window._snonuxDismissSplash()');
    await page.waitFor(`!${SPLASH_UP}`, 'the splash to go');
    await sleep(touch ? 900 : 300);
    const shown = await page.eval(`getComputedStyle(document.querySelector('.header-arcade-btn')).display!=='none'`);
    check(shown === !touch, touch ? 'the header shows a second game button on a narrow phone' : 'the header has no "All games" button');
    if (!touch) await checkHeaderByKeyboard(page);
}
