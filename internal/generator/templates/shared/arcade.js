/*
 * arcade.js — the game overview menu.
 *
 * Every theme ships its own game (games.js runs them), but a visitor only
 * ever sees the launch button of the theme they happen to be on. This menu
 * lists all of them: a picture, the title, the theme it belongs to and one
 * line on what to do. Picking a card starts that game whatever the active
 * theme is; quitting it comes back here.
 *
 * It is opened from an "All games" button that sits next to each launch
 * button (splash and header; on a screen narrower than 600px the header one
 * is hidden, see shared.css), and closed with Esc, the close button or a
 * click beside the panel.
 *
 * The pictures are themes/<theme>/game-thumb.jpg, written by
 * integrationtests/games/thumbs.mjs. The blurbs repeat the `blurb` of each
 * game.js (which is only fetched on first play, so it cannot be read from
 * there); a Go test keeps the two in step.
 */
(function () {
    'use strict';
    var G = window.SnoGame;
    if (!G || window.SnoArcade) return;

    // Theme name → what the game is about.
    var BLURBS = {
        aurora: 'Ski the gates down to the finish before the clock runs out.',
        biomech: 'Shoot every segment of the worm before it reaches you.',
        breakout: 'Clear every brick. Aim with the edge of the paddle.',
        brutalist: 'Swing the ball, knock out the support, bring the concrete down before time runs out.',
        cathedral: 'Dive on the demons from above, then catch their souls before they hatch again.',
        cosmos: 'Destroy every rock. Everything falls, including your shots.',
        dos: 'Dig out every emerald. Drop gold bags on whatever crawls out of the nest.',
        invaders: 'Destroy the formation before it lands. It marches faster as it thins.',
        matrix: 'Time only moves when you do. Stand still, read the bullets, clear the room.',
        neon: 'Every cycle leaves a wall of light. Box the riders in and outlast them all.',
        noir: 'Shoot the gangsters before the red ring closes. Never shoot the pale ones.',
        nukem: 'The nuke is ticking. Find the keycard, reach the exit, blow up the rest.',
        ocean: 'Fly the sub through the trench. Breathe in the bubble columns, mind the hull.',
        pacmaze: 'Eat every dot. Stay away from the ghosts, unless they are blue.',
        pinball: 'Keep the ball alive, finish the mission and make the points.',
        plasma: 'Thread the bullet storm, merge plasma orbs into weapons, break the boss.',
        retro: 'Ride the phone line to the far end. Flip between the wires to stay alive.',
        retrofuture: 'Burst your missiles where the warheads will be. Keep one dome standing.',
        spaceage: 'Fly the capsule from pad to pad and touch down slowly and upright.',
        surveillance: 'Steal every data drive and reach the exit without being seen.',
        synthwave: 'Reach every checkpoint before the sun sets. Lift off for the hard bends.',
        terminal: 'Rogue processes are eating the box. Kill every one of them.',
        tetris: 'Fire blocks into the gaps of the falling wall. Full rows clear and knock it back.',
        tropicale: 'Hop the islands and reach the tiki totem before the tide comes in.',
        volcano: 'The lava never stops. Climb to the crater rim.',
        ukiyoe: 'Hop the traveller over the Tokaido road and across the river on drifting boats.',
        deco: 'Slide the cocktails down the bars, catch the empties, never keep a guest waiting.',
        dmg: 'Eat the apples, grow longer, never bite yourself. The snake keeps sliding.',
        blueprint: 'Draw lines to claim the sheet. Keep the ink blot off your pen.',
        pharaoh: 'Hop every stone of the pyramid to gold. Do not let the mummies catch you.',
        western: 'Run the roofs of the express, leap the gaps, take the gold before the bridge.',
        bauhaus: 'Ride the rim of the shape and shoot what climbs out of it.',
        greenhouse: 'Fly the bee from bloom to bloom, pollinate them all, keep the wasps off the hive.'
    };

    var ICON = '<i class="fas fa-table-cells-large" aria-hidden="true"></i> ';
    var root = null;        // the open menu, or null
    var opener = null;      // what had focus when the menu was opened
    var played = '';        // theme of the game started from the menu

    function currentTheme() {
        return window.SNONUX_CURRENT_THEME || document.documentElement.getAttribute('data-sno-theme') || '';
    }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    // Games in title order, the active theme's own game first.
    function gameList() {
        var here = currentTheme();
        return Object.keys(G.titles).sort(function (a, b) {
            if ((a === here) !== (b === here)) return a === here ? -1 : 1;
            return G.titles[a].toLowerCase() < G.titles[b].toLowerCase() ? -1 : 1;
        });
    }

    function card(theme) {
        var btn = el('button', 'sno-arcade-card');
        btn.type = 'button';
        btn.setAttribute('data-theme', theme);
        var img = el('img', 'sno-arcade-shot');
        img.alt = '';
        img.loading = 'lazy';
        img.width = 320; img.height = 180;
        img.src = 'themes/' + theme + '/game-thumb.jpg?b=' + encodeURIComponent(window.SNONUX_BUILD || '');
        btn.appendChild(img);
        btn.appendChild(el('span', 'sno-arcade-title', G.titles[theme]));
        btn.appendChild(el('span', 'sno-arcade-theme', theme + (theme === currentTheme() ? ' · this theme' : '')));
        btn.appendChild(el('span', 'sno-arcade-blurb', BLURBS[theme] || ''));
        return btn;
    }

    function build() {
        var themes = gameList();
        var box = el('div');
        box.id = 'sno-arcade';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-label', 'All games');
        box.tabIndex = -1;
        var panel = el('div', 'sno-arcade-panel');
        var head = el('div', 'sno-arcade-head');
        head.appendChild(el('h2', 'sno-arcade-heading', 'Arcade · ' + themes.length + ' games'));
        var close = el('button', 'sno-arcade-close', '✕ ESC');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close the game menu');
        head.appendChild(close);
        var grid = el('div', 'sno-arcade-grid');
        themes.forEach(function (t) { grid.appendChild(card(t)); });
        panel.appendChild(head); panel.appendChild(grid);
        box.appendChild(panel);
        box.addEventListener('click', onMenuClick);
        return box;
    }

    function onMenuClick(e) {
        // The menu handles its own clicks; the page's document-level click
        // listeners must not act on them as well.
        e.stopPropagation();
        var c = e.target.closest('.sno-arcade-card');
        if (c) { play(c.getAttribute('data-theme')); return; }
        if (e.target.closest('.sno-arcade-close') || !e.target.closest('.sno-arcade-panel')) closeMenu();
    }

    // The rest of the page is made inert while the menu is up: Tab stays
    // inside the menu, and nothing behind it (the splash buttons, the theme
    // picker, the fx row) can be operated under it.
    function setPageInert(on) {
        Array.prototype.forEach.call(document.body.children, function (n) {
            if (n === root) return;
            if (on && !n.inert) { n.inert = true; n.setAttribute('data-sno-arcade-inert', ''); }
            else if (!on && n.hasAttribute('data-sno-arcade-inert')) { n.inert = false; n.removeAttribute('data-sno-arcade-inert'); }
        });
    }

    // `focusTheme` is given when the menu comes back after a game; the
    // element to hand focus to on closing is then still the original one.
    function openMenu(focusTheme) {
        if (root || G.active) return false;
        if (!focusTheme || !opener) opener = document.activeElement;
        root = build();
        document.body.appendChild(root);
        document.body.classList.add('sno-arcade-on');
        setPageInert(true);
        var first = (focusTheme && root.querySelector('[data-theme="' + focusTheme + '"]')) || root.querySelector('.sno-arcade-card');
        (first || root).focus();
        return true;
    }

    function removeMenu() {
        if (!root) return;
        setPageInert(false);
        root.remove();
        root = null;
        document.body.classList.remove('sno-arcade-on');
    }

    // Focus goes back to the splash while it is still up (so Enter opens the
    // blog, as it did before), otherwise to the button that opened the menu.
    function closeMenu() {
        if (!root) return;
        removeMenu();
        var splash = document.getElementById('splash-overlay');
        if (splash && !splash.classList.contains('splash--dismissed')) splash.focus({ preventScroll: true });
        else if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        opener = null;
    }

    // Starts a game from its card. Called from the click itself, which the
    // engine needs for sound and (on a phone) fullscreen.
    function play(theme) {
        removeMenu();
        if (G.launch(theme)) played = theme;
        else openMenu(theme);
    }

    // The engine says when a game closes; one started here returns here.
    document.addEventListener('sno-game-quit', function () {
        var theme = played;
        played = '';
        if (theme) openMenu(theme);
    });

    // Cards per row, read from where the browser actually put them.
    function columns(cards) {
        var n = 1;
        while (n < cards.length && cards[n].offsetTop === cards[0].offsetTop) n++;
        return n;
    }

    function moveFocus(code) {
        var cards = Array.prototype.slice.call(root.querySelectorAll('.sno-arcade-card'));
        var i = cards.indexOf(document.activeElement);
        if (i < 0) { if (cards[0]) cards[0].focus(); return; }
        var step = {
            ArrowLeft: -1, KeyH: -1,
            ArrowRight: 1, KeyL: 1,
            ArrowUp: -columns(cards), KeyK: -columns(cards),
            ArrowDown: columns(cards), KeyJ: columns(cards)
        }[code];
        var next = cards[i + step];
        if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }); }
    }

    // Tab past the last control (or Shift+Tab before the first) would leave
    // the page for the browser's own toolbar; it goes round instead.
    function wrapTab(e) {
        var stops = root.querySelectorAll('button');
        var first = stops[0], last = stops[stops.length - 1];
        var edge = e.shiftKey ? first : last, at = document.activeElement;
        // The dialog itself holds focus after a click on its padding; from
        // there the browser would step out as well.
        if (at !== edge && at !== root && root.contains(at)) return;
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
    }

    // While the menu is open no key may reach the blog's shortcuts or the
    // splash. Tab, Enter and Space keep their normal meaning on the cards;
    // the page behind is inert, so Tab finds nothing to stop at out there.
    function onKeyDown(e) {
        if (!root) return;
        e.stopImmediatePropagation();
        if (e.code === 'Escape') { e.preventDefault(); closeMenu(); return; }
        if (e.code === 'Tab') { wrapTab(e); return; }
        // Enter held on the button that opened the menu keeps repeating, and
        // a repeat would press the card that now has focus.
        if (e.repeat && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); return; }
        if (/^Arrow/.test(e.code)) { e.preventDefault(); moveFocus(e.code); return; }
        // vi's h/j/k/l, by key code so Caps Lock and Shift do not matter; on
        // another layout it is the physical QWERTY position that moves.
        // Browser shortcuts (Ctrl+L, Cmd+J…) keep their meaning.
        if (!e.ctrlKey && !e.metaKey && !e.altKey && /^Key[HJKL]$/.test(e.code)) { e.preventDefault(); moveFocus(e.code); }
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', function (e) { if (root) e.stopImmediatePropagation(); }, true);

    // ------------------------------------------------------------------
    // "All games" buttons, one beside each launch button
    // ------------------------------------------------------------------

    function ensureOpenButton(launchBtn, cls, extraCls, label) {
        if (!launchBtn || launchBtn.parentNode.querySelector('.' + cls)) return;
        var btn = el('button', cls + ' sno-arcade-open' + extraCls);
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Show all games');
        btn.innerHTML = ICON + '<span class="sno-game-launch-text">' + label + '</span>';
        launchBtn.parentNode.insertBefore(btn, launchBtn.nextSibling);
    }

    // games.js (re)creates its launch buttons in snonuxGameDecorate, which
    // shared.js calls again after every theme switch; ours follow it.
    function decorate() {
        ensureOpenButton(document.querySelector('.splash-game-btn'), 'splash-arcade-btn', ' splash-music-btn', 'All games');
        ensureOpenButton(document.querySelector('.header-game-btn'), 'header-arcade-btn', '', 'All games');
    }

    var gameDecorate = window.snonuxGameDecorate;
    window.snonuxGameDecorate = function () {
        if (gameDecorate) gameDecorate();
        decorate();
    };

    // Capture phase, like the launch buttons: the splash must stay open.
    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.sno-arcade-open');
        if (!btn) return;
        e.preventDefault(); e.stopPropagation();
        openMenu();
    }, true);

    window.SnoArcade = {
        open: function () { return openMenu(); },
        close: closeMenu,
        isOpen: function () { return !!root; },
        blurbs: BLURBS
    };
    decorate();
})();
