    var SNONUX_SOUNDS = (typeof window !== "undefined" && window.SNONUX_SOUNDS) || {};
    // Inject wild-mode badge used by all themes
    (function() { var b=document.createElement('div'); b.id='sno-wild-badge'; b.textContent='WILD MODE'; document.body.appendChild(b); })();
    const SNONUX_WILD_PRESETS = {
        aurora: {
            banner: 'SOLAR STORM',
            ticker: ['FIELD INTERFERENCE', 'PLASMA DRIFT', 'PARTICLE BOMBARDMENT', 'CHROMATIC SPIKE'],
            scraps: ['MAGNETIC SHEAR', 'SOLAR WIND', 'AURORA NOISE', 'ION STORM', 'POLAR ARC'],
            flash: 'rgba(220,255,240,0.72)',
            emoji: ['\u2728','\u2604\uFE0F','\u{1F320}','\u{1F30C}','\u2B50']
        },
        brutalist: {
            banner: 'STRUCTURAL COLLAPSE',
            ticker: ['CONDEMNED', 'REBAR EXPOSED', 'FOUNDATION FAILURE', 'CRACK PROPAGATION'],
            scraps: ['CONDEMNED', 'RUST BLEED', 'SHEAR WALL LOST', 'LOAD PATH BROKEN', 'SPALLING'],
            flash: 'rgba(255,210,190,0.58)',
            emoji: ['\u{1F9F1}','\u2692\uFE0F','\u26A0\uFE0F','\u{1F6A7}','\u{1F4A5}']
        },
        cosmos: {
            banner: 'SUPERNOVA',
            ticker: ['SINGULARITY LENSING', 'GAMMA BURST', 'SHOCKWAVE EXPANDING', 'SPACETIME TEAR'],
            scraps: ['WHITEOUT', 'EVENT HORIZON', 'RADIATION FRONT', 'LENS LOCK', 'CORE BREACH'],
            flash: 'rgba(255,255,255,0.8)',
            emoji: ['\u{1F30C}','\u2604\uFE0F','\u{1F4AB}','\u2B50','\u{1FA90}']
        },
        dos: {
            banner: 'KERNEL PANIC',
            ticker: ['ABORT, RETRY, FAIL?', 'MEMORY CORRUPTION', 'STACK DUMP', 'SEGMENT FAULT'],
            scraps: ['DEAD BEEF', 'C0FFEE', 'BAD SECTOR', 'IRQ STORM', 'NULL PTR', 'HEX DUMP'],
            flash: 'rgba(255,255,255,0.88)',
            emoji: ['\u{1F4BE}','\u{1F4BB}','\u26A1','\u2620\uFE0F','\u{1F41B}']
        },
        matrix: {
            banner: 'CASCADE FAILURE',
            ticker: ['SENTINEL TRACE', 'GLYPH SATURATION', 'PHOSPHOR BURN-IN', 'RAIN AT TERMINAL VELOCITY'],
            scraps: ['SENTINEL', '0XDECODE', 'OVERRIDE', 'TRACE LOST', 'MACHINE DREAM'],
            flash: 'rgba(180,255,190,0.68)',
            emoji: ['\u{1F441}\uFE0F','\u{1F4A0}','\u{1F916}','\u{1F50D}','\u26D3\uFE0F']
        },
        neon: {
            banner: 'GAS DISCHARGE',
            ticker: ['TUBE ARC', 'ULTRAVIOLET BLEED', 'STROBE LOCK', 'SHORT CIRCUIT'],
            scraps: ['ARC OVERLOAD', 'PLASMA SIGN', 'NOBLE GAS', 'HARD STROBE', 'OVERDRIVE'],
            flash: 'rgba(255,245,170,0.72)',
            emoji: ['\u26A1','\u{1F4A5}','\u{1F52E}','\u2728','\u{1F388}']
        },
        ocean: {
            banner: 'HADAL DESCENT',
            ticker: ['PRESSURE SPIKE', 'BIOLUMINESCENT SWARM', 'ABYSSAL DRAG', 'TSUNAMI FRONT'],
            scraps: ['NO SURFACE', 'CRUSH DEPTH', 'TENTACLE DRIFT', 'SONAR LOST', 'DEEP CURRENT'],
            flash: 'rgba(200,255,255,0.54)',
            emoji: ['\u{1F419}','\u{1F420}','\u{1F30A}','\u{1F41A}','\u{1F9DC}']
        },
        plasma: {
            banner: 'FUSION BREACH',
            ticker: ['CONTAINMENT FAILURE', 'TOKAMAK DISTORTION', 'THERMAL RUNAWAY', 'WHITE-BLUE CORE'],
            scraps: ['ION SPRAY', 'FIELD LOSS', 'HEAT HAZE', 'QUENCH', 'ARC SHELL'],
            flash: 'rgba(230,250,255,0.78)',
            emoji: ['\u{1F300}','\u26A1','\u{1F4A0}','\u2728','\u{1F52C}']
        },
        retro: {
            banner: 'TAPE EAT',
            ticker: ['TRACKING LOSS', 'CHROMA SPLIT', 'MAGNETIC SNOW', 'CLICK-EJECT'],
            scraps: ['NO SIGNAL', 'HEAD DRAG', 'ROLL HOLD', 'SNOW PACK', 'EJECT CYCLE'],
            flash: 'rgba(255,226,178,0.6)',
            emoji: ['\u{1F4FC}','\u{1F4FA}','\u{1F3AE}','\u{1F579}\uFE0F','\u{1F4FB}']
        },
        retrofuture: {
            banner: 'ATOMIC TWILIGHT',
            ticker: ['GEIGER STATIC', 'FALLOUT DUST', 'RADIATION BURN', 'IRRADIATED SEPIA'],
            scraps: ['FALLOUT', 'BETA LEAK', 'ASH DRIFT', 'HALF-LIFE', 'GLOW CLOUD'],
            flash: 'rgba(255,240,180,0.62)',
            emoji: ['\u2622\uFE0F','\u{1F4A3}','\u{1F3ED}','\u2623\uFE0F','\u{1F9EA}']
        },
        spaceage: {
            banner: 'RE-ENTRY BURN',
            ticker: ['HEAT SHIELD LOSS', 'PLASMA BLACKOUT', 'COMMS STATIC', 'G-FORCE COMPRESSION'],
            scraps: ['BLACKOUT', 'SPARK SHOWER', 'PLASMA SHEATH', 'HULL GLOW', 'COMMS LOST'],
            flash: 'rgba(255,220,190,0.68)',
            emoji: ['\u{1F680}','\u{1F6F8}','\u{1FA90}','\u{1F30D}','\u2B50']
        },
        synthwave: {
            banner: 'GRID COLLAPSE',
            ticker: ['VOID PERSPECTIVE', 'MOLTEN SUN', 'CHROMA TEAR', 'OUT OF MEMORY'],
            scraps: ['VOID GRID', 'SUN DRIP', 'NEON PANIC', 'FRAME DROP', 'MEMORY STARVE'],
            flash: 'rgba(255,210,255,0.68)',
            emoji: ['\u{1F305}','\u{1F3B6}','\u{1F3B9}','\u{1F338}','\u{1F52E}']
        },
        terminal: {
            banner: 'FORK BOMB',
            ticker: ['PROCESS STORM', 'STACK TRACE WATERFALL', 'MEMORY GARBAGE', 'BSOD CREEP'],
            scraps: ['PID 65535', 'STACK OVERFLOW', 'OOM KILL', 'PANIC', '(:'],
            flash: 'rgba(180,255,180,0.7)',
            emoji: ['\u{1F4BB}','\u{1F41B}','\u2620\uFE0F','\u{1F5A5}\uFE0F','\u26A1']
        },
        tropicale: {
            banner: 'CATEGORY 5',
            ticker: ['HORIZONTAL RAIN', 'STORM SURGE', 'DEBRIS FIELD', 'WIND SHEAR'],
            scraps: ['PALM SNAP', 'SURGE LINE', 'SPRAY WALL', 'FLYING ROOF', 'LANDFALL'],
            flash: 'rgba(240,255,255,0.74)',
            emoji: ['\u{1F334}','\u{1F3D6}\uFE0F','\u{1F940}','\u{1F965}','\u{1F30A}']
        },
        noir: {
            banner: 'BLACKOUT DISTRICT',
            ticker: ['BLINDS SLAMMED SHUT', 'SIREN SWEEP', 'PROJECTOR BURN', 'MIDNIGHT DOWNPOUR'],
            scraps: ['NO WITNESSES', 'WET ASPHALT', 'RED CHANNEL', 'BLUE CHANNEL', 'SMOKE CURTAIN'],
            flash: 'rgba(255,245,225,0.66)',
            emoji: ['\u{1F576}\uFE0F','\u{1F52B}','\u{1F3A9}','\u{1F6AC}','\u{1F5DD}\uFE0F']
        },
        cathedral: {
            banner: 'LAST JUDGMENT',
            ticker: ['BELL SHOCKWAVE', 'INCENSE FIRESTORM', 'ROSE WINDOW FRACTURE', 'APSE IN FLAME'],
            scraps: ['REQUIEM', 'SHARD RAIN', 'VESPER BURN', 'GLORIA STATIC', 'NAVE COLLAPSE'],
            flash: 'rgba(255,239,202,0.72)',
            emoji: ['\u{1F54E}','\u{1F56F}\uFE0F','\u271D\uFE0F','\u{1F54A}\uFE0F','\u{1F3F0}']
        },
        surveillance: {
            banner: 'TOTAL COMPROMISE',
            ticker: ['CAMERA MESH BREACH', 'TRACKING LOSS', 'MULTIPLEX PANIC', 'ALERT CASCADE'],
            scraps: ['FLAGGED', 'OVERRIDDEN', 'TRACE LOOP', 'BOX LOST', 'ALERT 99'],
            flash: 'rgba(210,255,225,0.72)',
            emoji: ['\u{1F4F9}','\u{1F441}\uFE0F','\u{1F6A8}','\u{1F50D}','\u{1F4E1}']
        },
        biomech: {
            banner: 'CONTAINMENT RUPTURE',
            ticker: ['SYNAPSE STORM', 'TISSUE ARC', 'MEMBRANE TEAR', 'HYBRID OVERDRIVE'],
            scraps: ['VENTRICLE', 'MYCELIUM', 'RUPTURE', 'BIOFILM', 'NERVE GRID'],
            flash: 'rgba(255,205,220,0.7)',
            emoji: ['\u{1F9EC}','\u{1F9E0}','\u{1F9A0}','\u{1F52C}','\u{1FAC0}']
        },
        paper: {
            banner: 'PRESS JAM',
            ticker: ['TONER BLIZZARD', 'INK BLEED', 'COPY LAMP WHITEOUT', 'PAGE STORM'],
            scraps: ['MISPRINT', 'SKEWED FEED', 'RAG EDGE', 'CARBON DUST', 'REDACTION'],
            flash: 'rgba(255,250,236,0.82)',
            emoji: ['\u{1F4C4}','\u270F\uFE0F','\u{1F4CE}','\u2702\uFE0F','\u{1F5DE}\uFE0F']
        },
        volcano: {
            banner: 'PYROCLASTIC SURGE',
            ticker: ['ASH CASCADE', 'LAVA BOMB IMPACT', 'EARTHQUAKE SHAKE', 'SULFUR CLOUD'],
            scraps: ['ASHFALL', 'VENT BLAST', 'PYROCLAST', 'SEISMIC HIT', 'MAGMA SPRAY'],
            flash: 'rgba(255,220,150,0.72)',
            emoji: ['\u{1F30B}','\u{1F525}','\u{1F4A5}','\u2668\uFE0F','\u{1FAA8}']
        },
        bauhaus: {
            banner: 'TRIADIC BALLET',
            ticker: ['FORM FOLLOWS FUNCTION', 'PRIMARY COLOUR OVERLOAD', 'GEOMETRY UNBOUND', 'COMPOSITION IN MOTION'],
            scraps: ['RED CIRCLE', 'YELLOW TRIANGLE', 'BLUE SQUARE', 'POINT AND LINE', 'BLACK RULE'],
            flash: 'rgba(248,243,232,0.8)',
            emoji: ['\u{1F534}','\u{1F7E1}','\u{1F7E6}','▲','⬛']
        },
        blueprint: {
            banner: 'EXPLODED VIEW',
            ticker: ['PLOTTER OVERDRIVE', 'REVISION CLOUD STORM', 'DIMENSIONS UNLOCKED', 'SECTION A-A FAILURE'],
            scraps: ['REV △', 'NOT TO SCALE', 'SEE DETAIL 4', 'VOID', 'RECHECK', 'APPROVED?'],
            flash: 'rgba(200,240,255,0.72)',
            emoji: ['\u{1F4D0}','\u{1F4CF}','✏️','\u{1F3D7}️','\u{1F5FA}️']
        },
        deco: {
            banner: 'ROARING GALA',
            ticker: ['CHAMPAGNE FOUNTAIN', 'SPOTLIGHT STROBE', 'CONFETTI CLOUDBURST', 'CHARLESTON STAMPEDE'],
            scraps: ['BATHTUB GIN', 'HOT JAZZ', 'GOLD LEAF', 'LAST CALL', 'THE CAT\'S PAJAMAS'],
            flash: 'rgba(255,236,170,0.74)',
            emoji: ['\u{1F942}','\u{1F378}','\u{1F3B7}','\u{1F3BA}','✨']
        },
        dmg: {
            banner: 'LINK CABLE GLITCH',
            ticker: ['LOW BATTERY', 'PALETTE INVERTED', 'SCREEN TEARING', 'GHOSTING OVERLOAD'],
            scraps: ['0x0F380F', 'BGP FLIP', 'VBLANK MISSED', 'SERIAL NOISE', 'CART UNSEATED'],
            flash: 'rgba(155,188,15,0.78)',
            emoji: ['\u{1F3AE}','\u{1F50B}','\u{1F34E}','\u{1F40D}','\u{1F47E}']
        },
        greenhouse: {
            banner: 'JUNGLE OVERGROWTH',
            ticker: ['VINES OVER THE IRONWORK', 'BUTTERFLY SWARM', 'THUNDER ON THE GLASS', 'GIANT BLOSSOMS OPENING'],
            scraps: ['HORTUS SYLVESTRIS', 'POLLEN STORM', 'FERNUS MAXIMUS', 'MONSTERA RAMPANS', 'CONDENSATION'],
            flash: 'rgba(240,255,225,0.74)',
            emoji: ['\u{1F33F}','\u{1F338}','\u{1F98B}','\u{1F41D}','\u{1F327}️']
        },
        pharaoh: {
            banner: 'THE TOMB AWAKENS',
            ticker: ['SANDSTORM RISING', 'CAPSTONES ABLAZE', 'BEAMS TO THE STARS', 'CURSE OF THE PHARAOH'],
            scraps: ['ANKH', 'SCARAB SWARM', 'LAPIS FLARE', 'SEALED NO MORE', 'EYE OF HORUS'],
            flash: 'rgba(255,236,180,0.74)',
            emoji: ['\u{1F3DC}️','\u{1FAB2}','☥️','\u{1F441}️','\u{1F3FA}']
        },
        ukiyoe: {
            banner: 'THE GREAT WAVE',
            ticker: ['KANAGAWA SURGE', 'FOAM CLAWS RISING', 'BOATS UNDER THE CREST', 'FUJI IN THE TROUGH'],
            scraps: ['TSUNAMI', 'SEIGAIHA', 'SUMI SPLASH', 'HANKO', 'OKI NAMI'],
            flash: 'rgba(247,241,225,0.78)',
            emoji: ['\u{1F30A}','\u{1F5FB}','\u{1F338}','\u{1F3EE}','⛩️']
        },
        western: {
            banner: 'STAMPEDE',
            ticker: ['DUST STORM', 'BLOOD-RED SKY', 'RUNAWAY EXPRESS', 'TUMBLEWEEDS EVERYWHERE'],
            scraps: ['WANTED', 'DEAD OR ALIVE', 'HIGH NOON', 'GOLD RUSH', 'BRIDGE OUT', 'YEEHAW'],
            flash: 'rgba(255,214,150,0.72)',
            emoji: ['\u{1F920}','\u{1F335}','\u{1F40E}','\u{1F682}','⭐']
        }
    };
    function snonuxDetectThemeName() {
        // The shell sets window.SNONUX_CURRENT_THEME synchronously in <head>.
        // Falls back to the splash class for resilience if something raced.
        if (typeof window !== 'undefined' && window.SNONUX_CURRENT_THEME) {
            return window.SNONUX_CURRENT_THEME;
        }
        var splash = document.getElementById('splash-overlay');
        if (splash) {
            for (var i = 0; i < splash.classList.length; i++) {
                var cls = splash.classList[i];
                if (cls.indexOf('splash-') === 0 && cls !== 'splash-overlay' && cls.indexOf('splash--') !== 0) {
                    return cls.slice(7);
                }
            }
        }
        return 'neon';
    }

    // snonuxSwitchTheme swaps every per-theme asset in place — stylesheet,
    // meta markup, sounds.json, splash WebGL — without a page reload. We used
    // to call location.reload() here, but that destroys the AudioContext and
    // browsers can't auto-resume Web Audio without a fresh user gesture, so
    // toggling themes with 't' silently killed the music until the next page.
    function snonuxSwitchTheme(theme) {
        var all = (typeof window !== 'undefined' && window.SNONUX_ALL_THEMES) || [];
        if (all.indexOf(theme) < 0) return;
        if (theme === window.SNONUX_CURRENT_THEME) return;

        // Tear down the previous theme's splash WebGL animation so we don't
        // leak its requestAnimationFrame loop and renderer when theme.js
        // re-runs against a fresh canvas.
        if (typeof window._snonuxSplashWebGLCleanup === 'function') {
            try { window._snonuxSplashWebGLCleanup(); } catch (_) {}
        }

        var prev = window.SNONUX_CURRENT_THEME;
        window.SNONUX_CURRENT_THEME = theme;
        document.documentElement.setAttribute('data-sno-theme', theme);

        var splashOverlay = document.getElementById('splash-overlay');
        if (splashOverlay) {
            if (prev) splashOverlay.classList.remove('splash-' + prev);
            splashOverlay.classList.add('splash-' + theme);
        }

        // Swap the theme stylesheet by injecting the new <link> next to the
        // old one and removing the old once the new one has loaded — that
        // avoids a flash-of-default-theme between unstyled and restyled.
        var bust = (window.SNONUX_BUILD || '') + '-' + Date.now();
        var oldLink = document.getElementById('sno-theme-css') ||
            document.querySelector('link[rel="stylesheet"][href*="/theme.css"]');
        var newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.id = 'sno-theme-css';
        newLink.href = 'themes/' + theme + '/theme.css?b=' + encodeURIComponent(bust);
        if (oldLink && oldLink.parentNode) {
            oldLink.parentNode.insertBefore(newLink, oldLink.nextSibling);
            var dropOld = function() { if (oldLink && oldLink !== newLink) oldLink.remove(); };
            newLink.addEventListener('load', dropOld);
            newLink.addEventListener('error', dropOld);
        } else {
            document.head.appendChild(newLink);
        }

        // Fetch meta + sounds with cache-bust so the browser cannot serve a
        // stale per-theme JSON across an in-page swap.
        fetch('themes/' + theme + '/meta.json?b=' + encodeURIComponent(bust))
            .then(function (r) { return r.json(); })
            .then(function (m) {
                if (m.title) document.title = m.title;
                var headerEl = document.querySelector('header');
                if (headerEl && m.header_html) headerEl.innerHTML = m.header_html;
                // Replacing splash_inner_html wipes out the music-choice buttons
                // injected earlier (snonuxRenderSplashMusicChoice runs once on
                // load), so re-inject them against the freshly-swapped markup.
                if (splashOverlay && m.splash_inner_html) {
                    splashOverlay.innerHTML = m.splash_inner_html;
                    if (typeof snonuxRenderSplashMusicChoice === 'function') snonuxRenderSplashMusicChoice();
                }
                var prevA = document.getElementById('sno-prev-page');
                if (prevA && m.prev_page_text) prevA.innerHTML = m.prev_page_text;
                var nextA = document.getElementById('sno-next-page');
                if (nextA && m.next_page_text) nextA.innerHTML = m.next_page_text;
                if (typeof window._snonuxRebindHeader === 'function') window._snonuxRebindHeader();
            })
            .catch(function () {});

        fetch('themes/' + theme + '/sounds.json?b=' + encodeURIComponent(bust))
            .then(function (r) { return r.json(); })
            .then(function (s) {
                window.SNONUX_SOUNDS = s;
                SNONUX_SOUNDS = s;
                if (window.snonuxAmbientSyncPreset) window.snonuxAmbientSyncPreset();
            })
            .catch(function () {});

        // Refresh wild mode preset so banner/ticker/colour-wash come from the
        // new theme if wild is currently active.
        if (window._snoWildActive && typeof snonuxApplyWildPreset === 'function') {
            snonuxApplyWildPreset(theme);
        }

        // Replace theme.js so the splash WebGL is rebuilt against the new
        // theme's settings. Removing the old <script> tag is cosmetic — its
        // side effects already ran — but it keeps the DOM tidy across many
        // 't' presses in a session.
        var oldScript = document.getElementById('sno-theme-js');
        if (oldScript) oldScript.remove();
        var newScript = document.createElement('script');
        newScript.id = 'sno-theme-js';
        newScript.src = 'themes/' + theme + '/theme.js?b=' + encodeURIComponent(bust);
        document.head.appendChild(newScript);
    }

    function snonuxRandomTheme() {
        var all = (typeof window !== 'undefined' && window.SNONUX_ALL_THEMES) || [];
        if (all.length <= 1) return null;
        var current = snonuxDetectThemeName();
        var pool = all.filter(function (t) { return t !== current; });
        return pool[Math.floor(Math.random() * pool.length)];
    }
    function snonuxEnsureWildRoot() {
        var root = document.getElementById('sno-wild-root');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'sno-wild-root';
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML =
            '<div id="sno-wild-colorwash" class="sno-wild-layer"></div>' +
            '<div id="sno-wild-rain" class="sno-wild-layer"></div>' +
            '<div id="sno-wild-wave" class="sno-wild-layer"></div>' +
            '<div id="sno-wild-beacon" class="sno-wild-layer"></div>' +
            '<div id="sno-wild-noise" class="sno-wild-layer"></div>' +
            '<div id="sno-wild-banner"></div>' +
            '<div id="sno-wild-ticker"><span></span></div>' +
            '<div id="sno-wild-scraps"></div>';
        document.body.appendChild(root);
        return root;
    }
    function snonuxApplyWildPreset(theme) {
        var preset = SNONUX_WILD_PRESETS[theme] || SNONUX_WILD_PRESETS.neon;
        var html = document.documentElement;
        var body = document.body;
        html.setAttribute('data-sno-theme', theme);
        body.setAttribute('data-sno-theme', theme);
        var root = snonuxEnsureWildRoot();
        var banner = root.querySelector('#sno-wild-banner');
        var ticker = root.querySelector('#sno-wild-ticker span');
        var scraps = root.querySelector('#sno-wild-scraps');
        banner.textContent = preset.banner;
        ticker.textContent = ' ' + preset.ticker.join('   //   ') + '   //   ' + preset.ticker.join('   //   ') + ' ';
        scraps.innerHTML = '';
        var phrases = preset.scraps || [];
        var count = theme === 'dos' || theme === 'terminal' || theme === 'matrix' ? 22 : 16;
        for (var i = 0; i < count; i++) {
            var span = document.createElement('span');
            span.textContent = phrases[i % phrases.length];
            span.style.setProperty('--x', (8 + Math.random() * 84).toFixed(2) + '%');
            span.style.setProperty('--y', (12 + Math.random() * 72).toFixed(2) + '%');
            span.style.setProperty('--rot', ((Math.random() * 36) - 18).toFixed(1) + 'deg');
            span.style.setProperty('--dx', ((Math.random() * 120) - 60).toFixed(1) + 'px');
            span.style.setProperty('--dy', ((Math.random() * 100) - 50).toFixed(1) + 'px');
            span.style.setProperty('--dur', (4.5 + Math.random() * 5.5).toFixed(2) + 's');
            span.style.setProperty('--delay', (-Math.random() * 6).toFixed(2) + 's');
            scraps.appendChild(span);
        }
        window._snonuxWildTheme = theme;
        window._snonuxWildFlashColor = preset.flash || 'rgba(255,255,255,0.7)';
    }
    function snonuxPulseFlash(color, duration) {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;opacity:0;';
        document.body.appendChild(ov);
        var tone = color || window._snonuxWildFlashColor || 'rgba(255,255,255,0.7)';
        [0, 70, 150, 250].forEach(function(d, i) {
            setTimeout(function() {
                ov.style.transition = 'opacity 0.08s linear';
                ov.style.background = tone;
                ov.style.opacity = (i % 2 === 0) ? '0.82' : '0';
            }, d);
        });
        setTimeout(function() {
            ov.style.transition = 'opacity 0.25s linear';
            ov.style.opacity = '0';
        }, Math.max(180, duration || 320));
        setTimeout(function() { ov.remove(); }, Math.max(520, duration || 320) + 260);
    }
    function snonuxScheduleWildBursts() {
        clearTimeout(window._snonuxWildBurstTimer);
        if (!window._snoWildActive) return;
        var delay = 1400 + Math.random() * 3600;
        window._snonuxWildBurstTimer = setTimeout(function() {
            if (!window._snoWildActive) return;
            snonuxPulseFlash(window._snonuxWildFlashColor, 260);
            snonuxScheduleWildBursts();
        }, delay);
    }
    function snonuxSetWildState(on) {
        var body = document.body;
        var badge = document.getElementById('sno-wild-badge');
        body.classList.toggle('sno-wild-active', !!on);
        if (badge) badge.classList.toggle('sno-wild-on', !!on);
        if (on) {
            snonuxApplyWildPreset(window._snonuxWildTheme || snonuxDetectThemeName());
            snonuxScheduleWildBursts();
            body.classList.add('sno-wild-hue');
            snonuxStartFlyingEmoji();
            snonuxStartRandomFlips();
        } else {
            clearTimeout(window._snonuxWildBurstTimer);
            body.classList.remove('sno-wild-hue');
            snonuxStopFlyingEmoji();
            snonuxStopRandomFlips();
        }
    }
    // === WILD FLYING EMOJI ===
    function snonuxStartFlyingEmoji() {
        snonuxStopFlyingEmoji();
        var zone = document.getElementById('sno-flyzone');
        if (!zone) {
            zone = document.createElement('div');
            zone.id = 'sno-flyzone';
            zone.setAttribute('aria-hidden', 'true');
            document.body.appendChild(zone);
        }
        function spawn() {
            if (!window._snoWildActive) return;
            var preset = SNONUX_WILD_PRESETS[window._snonuxWildTheme] || SNONUX_WILD_PRESETS.neon;
            var emojis = preset.emoji || ['\u2B50'];
            var s = document.createElement('span');
            s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            var top = (5 + Math.random() * 80).toFixed(1);
            var dur = (3 + Math.random() * 4).toFixed(2);
            var dir = Math.random() > 0.5 ? 'sno-fly-lr' : 'sno-fly-rl';
            var wobble = ((Math.random() - 0.5) * 60).toFixed(0);
            var rot = (180 + Math.random() * 540).toFixed(0);
            s.style.setProperty('--ftop', top + '%');
            s.style.setProperty('--fy', wobble + 'px');
            s.style.setProperty('--frot', rot + 'deg');
            s.style.animationName = dir;
            s.style.animationDuration = dur + 's';
            zone.appendChild(s);
            setTimeout(function() { s.remove(); }, parseFloat(dur) * 1000 + 200);
            window._snoFlyTimer = setTimeout(spawn, 800 + Math.random() * 2200);
        }
        spawn();
    }
    function snonuxStopFlyingEmoji() {
        clearTimeout(window._snoFlyTimer);
        var zone = document.getElementById('sno-flyzone');
        if (zone) zone.innerHTML = '';
    }
    // === WILD RANDOM FLIPS ===
    function snonuxStartRandomFlips() {
        snonuxStopRandomFlips();
        function flip() {
            if (!window._snoWildActive) return;
            var allPosts = document.querySelectorAll('.post:not(.post-active)');
            if (allPosts.length > 0) {
                var p = allPosts[Math.floor(Math.random() * allPosts.length)];
                p.classList.add('sno-fx-flip');
                setTimeout(function() { p.classList.remove('sno-fx-flip'); }, 1500);
            }
            window._snoFlipTimer = setTimeout(flip, 2500 + Math.random() * 4000);
        }
        window._snoFlipTimer = setTimeout(flip, 1500 + Math.random() * 2000);
    }
    function snonuxStopRandomFlips() {
        clearTimeout(window._snoFlipTimer);
        var flipped = document.querySelectorAll('.sno-fx-flip');
        flipped.forEach(function(el) { el.classList.remove('sno-fx-flip'); });
    }
    (function snonuxWildSetup() {
        window._snoWildActive = !!window._snoWildActive;
        snonuxApplyWildPreset(snonuxDetectThemeName());
        snonuxSetWildState(window._snoWildActive);
    })();
    // Dramatic lightning flash on wild mode activation/deactivation
    function snonuxWildFlash(on) {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;';
        document.body.appendChild(ov);
        if (on) {
            // Three rapid lightning flashes on activation
            [0, 80, 180, 300, 440].forEach(function(d, i) {
                setTimeout(function() {
                    ov.style.background = (i % 2 === 0) ? 'rgba(255,255,200,0.72)' : 'transparent';
                }, d);
            });
            setTimeout(function() { ov.remove(); }, 550);
            // Persistent storm overlay with intermittent flicker
            var storm = document.createElement('div');
            storm.id = 'sno-wild-storm';
            storm.style.cssText = 'position:fixed;inset:0;z-index:4998;pointer-events:none;' +
                'background:radial-gradient(ellipse at 50% 0%,rgba(255,255,200,0.88) 0%,transparent 55%);' +
                'animation:sno-wild-flicker 3.7s ease-in-out infinite;';
            document.body.appendChild(storm);
        } else {
            // Brief dark veil on deactivation
            ov.style.background = 'rgba(0,0,0,0.45)';
            ov.style.transition = 'opacity 0.45s';
            setTimeout(function() { ov.style.opacity = '0'; }, 60);
            setTimeout(function() { ov.remove(); }, 550);
            var storm = document.getElementById('sno-wild-storm');
            if (storm) { storm.style.transition = 'opacity 0.5s'; storm.style.opacity = '0'; setTimeout(function() { storm.remove(); }, 600); }
        }
    }
    function snonuxWaveType(w) {
        if (w === 'square') return 'square';
        if (w === 'triangle') return 'triangle';
        if (w === 'sawtooth') return 'sawtooth';
        return 'sine';
    }

    // === SHARED AMBIENT ENGINE ===
    // One AudioContext + one master gain node. Drones are long-running
    // oscillators; pulses are short scheduled oscillators. Noise is a looped
    // buffer source (no AudioWorklet). Fade in/out respects preset attack/release.
    // Ambient never routes through the one-shot UI sound paths.
    (function ambientEngine() {
        var ctx = null;
        var masterGain = null;
        var droneNodes = [];
        var pulseTimer = null;
        var noiseSrc = null;
        var noiseGainNode = null;
        var isPlaying = false;
        var isWild = false;
        var currentPreset = null;
        var melodyTimer = null;
        var melodyIndex = 0;
        var drumTimer = null;
        var drumIndex = 0;
        var ambientAudio = null;
        var ambientAudioSrc = '';
        var ambientAudioFadeTimer = null;

        function wildifyPreset(base) {
            if (!base) return base;
            var w = {};
            for (var k in base) w[k] = base[k];
            // Denser pulses for wild mode
            if (w.bpm) w.bpm = w.bpm * 1.5;
            if (w.pulseInterval) w.pulseInterval = w.pulseInterval / 1.5;
            // More noise texture
            if (w.noiseGain != null) w.noiseGain = Math.min(w.noiseGain * 1.6, 0.08);
            // Slightly higher gain, capped for safety
            if (w.gain != null) w.gain = Math.min(w.gain * 1.3, 0.15);
            // Deeper filter sweep for pulses
            w.filterFreq = (w.filterFreq || 700) * 1.6;
            w.filterQ = (w.filterQ || 0.8) * 2.0;
            return w;
        }

        function getPreset() {
            var ambient = SNONUX_SOUNDS.ambient;
            if (!ambient) return null;
            var base = isWild ? (ambient.wild || ambient.normal) : ambient.normal;
            if (base && !base.file && ambient.normal && ambient.normal.file) {
                var inherited = {};
                for (var k in base) inherited[k] = base[k];
                inherited.file = ambient.normal.file;
                if (inherited.volume == null && ambient.normal.volume != null) inherited.volume = ambient.normal.volume;
                base = inherited;
            }
            return isWild ? wildifyPreset(base) : base;
        }

        function resolveAmbientFile(file) {
            if (!file) return '';
            if (/^(https?:)?\/\//.test(file) || file.charAt(0) === '/') return file;
            if (file.indexOf('themes/') === 0) return file;
            return 'themes/' + snonuxDetectThemeName() + '/' + file;
        }

        function ambientFileVolume(preset) {
            var v = preset && preset.volume != null ? preset.volume : 0.46;
            if (isWild) v = Math.min(v * 1.08, 0.8);
            return Math.max(0, Math.min(v, 0.8));
        }

        function clearAmbientAudioFade() {
            if (ambientAudioFadeTimer) {
                clearInterval(ambientAudioFadeTimer);
                ambientAudioFadeTimer = null;
            }
        }

        function fadeAmbientAudioTo(target, duration, done) {
            if (!ambientAudio) {
                if (done) done();
                return;
            }
            clearAmbientAudioFade();
            var start = ambientAudio.volume || 0;
            var dur = Math.max(duration || 0.35, 0.01);
            var started = Date.now();
            ambientAudioFadeTimer = setInterval(function() {
                if (!ambientAudio) {
                    clearAmbientAudioFade();
                    if (done) done();
                    return;
                }
                var t = Math.min((Date.now() - started) / (dur * 1000), 1);
                ambientAudio.volume = start + (target - start) * t;
                if (t >= 1) {
                    clearAmbientAudioFade();
                    if (done) done();
                }
            }, 30);
        }

        function stopFileAudio(resetPosition) {
            clearAmbientAudioFade();
            if (!ambientAudio) return;
            try {
                ambientAudio.pause();
                ambientAudio.volume = 0;
                if (resetPosition) ambientAudio.currentTime = 0;
            } catch (_) {}
        }

        function startFileAudio(preset) {
            var src = resolveAmbientFile(preset.file);
            if (!src) return;
            currentPreset = preset;

            if (!ambientAudio || ambientAudioSrc !== src) {
                if (ambientAudio) {
                    try { ambientAudio.pause(); } catch (_) {}
                }
                ambientAudio = new Audio(src);
                ambientAudio.loop = true;
                ambientAudio.preload = 'auto';
                ambientAudio.volume = 0.22;
                ambientAudioSrc = src;
            }

            isPlaying = true;
            var target = ambientFileVolume(preset);
            if (ambientAudio.volume < 0.18) ambientAudio.volume = Math.min(target, 0.22);
            var playResult;
            try {
                playResult = ambientAudio.play();
            } catch (_) {
                isPlaying = false;
                return;
            }
            if (playResult && playResult.then) {
                playResult.then(function() {
                    if (!isPlaying) return;
                    fadeAmbientAudioTo(target, 0.16);
                }).catch(function() {
                    isPlaying = false;
                });
            } else {
                fadeAmbientAudioTo(target, 0.16);
            }
        }

        function ensureCtx() {
            if (!ctx) {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
                masterGain = ctx.createGain();
                masterGain.gain.value = 0;
                masterGain.connect(ctx.destination);
            }
            if (ctx.state === 'suspended') {
                ctx.resume().catch(function() {});
            }
            return ctx;
        }

        function stopDrones() {
            droneNodes.forEach(function(node) {
                try { node.stop(); node.disconnect(); } catch (_) {}
            });
            droneNodes = [];
        }

        function startDrones(preset) {
            var c = ensureCtx();
            var freqs = preset.droneFreqs || [];
            if (freqs.length === 0) return;
            var wt = snonuxWaveType(preset.wave);
            var detune = preset.detuneCents || 0;
            // Drones must respect the theme's ambient gain so they don't
            // drown the melody.  Four drones at 0.25 each = 1.0 total,
            // which clips and buries everything else.
            var gBase = preset.gain != null ? preset.gain : 0.08;
            var perOscGain = gBase / Math.max(1, freqs.length);
            freqs.forEach(function(freq) {
                var osc = c.createOscillator();
                var g = c.createGain();
                g.gain.value = perOscGain;
                osc.type = wt;
                osc.frequency.value = freq;
                if (detune) osc.detune.value = detune;
                osc.connect(g);
                g.connect(masterGain);
                osc.start();
                droneNodes.push(osc);
            });
        }

        function stopNoise() {
            if (noiseSrc) { try { noiseSrc.stop(); noiseSrc.disconnect(); } catch (_) {} noiseSrc = null; }
            if (noiseGainNode) { try { noiseGainNode.disconnect(); } catch (_) {} noiseGainNode = null; }
        }

        function startNoise(preset) {
            if (!preset.noiseGain) return;
            var c = ensureCtx();
            var bufferSize = 2 * c.sampleRate;
            var buffer = c.createBuffer(1, bufferSize, c.sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            var src = c.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            noiseGainNode = c.createGain();
            // Keep noise subtle so it doesn't bury the melody.
            noiseGainNode.gain.value = preset.noiseGain;
            src.connect(noiseGainNode);
            noiseGainNode.connect(masterGain);
            src.start();
            noiseSrc = src;
        }

        function stopMelody() {
            if (melodyTimer) { clearTimeout(melodyTimer); melodyTimer = null; }
            melodyIndex = 0;
        }

        function playMelodyNote(note, preset) {
            var c = ensureCtx();
            var freq = note.freq || 440;
            var dur = note.dur || 0.3;
            if (freq <= 0 || dur <= 0) return;
            var wt = snonuxWaveType(preset.wave);
            // masterGain is now a binary "gate" (fades to 1 when on), so per-note
            // volume carries the real preset.gain. Without the old masterGain
            // squaring, this makes music audible at normal levels.
            var g = note.gain != null ? note.gain : (preset.gain != null ? preset.gain : 0.08);
            var pulseGain = Math.min(g, 0.08);

            // Build a richer timbre with two slightly detuned oscillators so
            // melody lines sound like actual notes instead of sterile blips.
            var osc1 = c.createOscillator();
            var osc2 = c.createOscillator();
            var mix = c.createGain();
            var gain = c.createGain();

            osc1.type = wt;
            osc1.frequency.value = freq;
            osc2.type = wt;
            osc2.frequency.value = freq;
            osc2.detune.value = 5 + Math.random() * 3; // subtle chorus

            mix.gain.value = 0.5;
            osc1.connect(mix);
            osc2.connect(mix);

            var lastNode = mix;
            if (preset.filterFreq) {
                var filter = c.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = preset.filterFreq;
                filter.Q.value = preset.filterQ || 1;
                var now = c.currentTime;
                filter.frequency.setValueAtTime(preset.filterFreq, now);
                filter.frequency.exponentialRampToValueAtTime(Math.max(preset.filterFreq * 0.2, 100), now + dur);
                lastNode.connect(filter);
                lastNode = filter;
            }

            lastNode.connect(gain);
            gain.connect(masterGain);
            var now = c.currentTime;

            // Proper ADSR-ish envelope: attack up, sustain, then release.
            var attack = Math.min(0.04, dur * 0.15);
            var release = Math.min(0.12, dur * 0.35);
            var sustainTime = Math.max(0, dur - attack - release);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(pulseGain, now + attack);
            if (sustainTime > 0) {
                gain.gain.setValueAtTime(pulseGain, now + attack + sustainTime);
            }
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            osc1.start(now);
            osc1.stop(now + dur + 0.02);
            osc2.start(now);
            osc2.stop(now + dur + 0.02);
        }

        function scheduleMelodyNote(preset) {
            if (!isPlaying || !preset || !preset.melody || preset.melody.length === 0) return;
            var note = preset.melody[melodyIndex];
            playMelodyNote(note, preset);
            melodyIndex = (melodyIndex + 1) % preset.melody.length;
            // Timing to the next note: explicit 'step' on the current note
            // controls exactly when the sequencer advances.  If step is
            // omitted the scheduler falls back to dur + a tiny BPM-scaled
            // gap so the line stays intelligible.
            var step;
            if (note.step != null && note.step > 0) {
                step = note.step;
            } else {
                var beat = preset.bpm ? 60.0 / preset.bpm : 0.5;
                step = note.dur + beat * 0.15;
            }
            melodyTimer = setTimeout(function() {
                if (!isPlaying) return;
                scheduleMelodyNote(currentPreset);
            }, step * 1000);
        }

        function schedulePulse() {
            if (!isPlaying || !currentPreset) return;
            var preset = currentPreset;
            if (preset.melody && preset.melody.length > 0) {
                scheduleMelodyNote(preset);
                return;
            }
            var interval = preset.pulseInterval;
            if (!interval && preset.bpm) {
                interval = 60.0 / preset.bpm;
            }
            if (!interval) interval = 1.0;
            var jitter = interval * (0.8 + Math.random() * 0.4);
            pulseTimer = setTimeout(function() {
                if (!isPlaying) return;
                playPulse(preset);
                schedulePulse();
            }, jitter * 1000);
        }

        function playPulse(preset) {
            var c = ensureCtx();
            var freqs = preset.pulseFreqs || [];
            if (freqs.length === 0) return;
            var freq = freqs[Math.floor(Math.random() * freqs.length)];
            var wt = snonuxWaveType(preset.wave);
            var attack = preset.attack != null ? preset.attack : 0.05;
            var release = preset.release != null ? preset.release : 0.3;
            var g = preset.gain != null ? preset.gain : 0.08;
            var pulseGain = g * 0.6;

            var osc = c.createOscillator();
            var gain = c.createGain();
            osc.type = wt;
            osc.frequency.value = freq;

            var lastNode = osc;
            if (preset.filterFreq) {
                var filter = c.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = preset.filterFreq;
                filter.Q.value = preset.filterQ || 1;
                var now = c.currentTime;
                filter.frequency.setValueAtTime(preset.filterFreq, now);
                filter.frequency.exponentialRampToValueAtTime(Math.max(preset.filterFreq * 0.2, 100), now + attack + release);
                lastNode.connect(filter);
                lastNode = filter;
            }

            lastNode.connect(gain);
            gain.connect(masterGain);
            var now = c.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(pulseGain, now + attack);
            gain.gain.exponentialRampToValueAtTime(0.001, now + attack + release);
            osc.start(now);
            osc.stop(now + attack + release + 0.02);
        }

        function fadeMasterTo(target, duration) {
            if (!masterGain || !ctx) return;
            var dur = duration != null ? duration : 0.5;
            var now = ctx.currentTime;
            masterGain.gain.cancelScheduledValues(now);
            masterGain.gain.setValueAtTime(masterGain.gain.value, now);
            masterGain.gain.linearRampToValueAtTime(target, now + dur);
        }

        function stopAll() {
            clearTimeout(pulseTimer);
            pulseTimer = null;
            stopMelody();
            stopDrums();
            stopDrones();
            stopNoise();
            stopFileAudio(true);
        }

        // ── drum synthesizer ──────────────────────────────────────────────

        function stopDrums() {
            if (drumTimer) { clearTimeout(drumTimer); drumTimer = null; }
            drumIndex = 0;
        }

        function playDrum(type, preset) {
            try {
                var c = ctx;
                if (!c) return;
                var now = c.currentTime;
                if (type === 'kick') {
                    var gBase = preset.gain != null ? preset.gain : 0.08;
                    var osc = c.createOscillator();
                    var g = c.createGain();
                    osc.connect(g);
                    g.connect(masterGain);
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
                    g.gain.setValueAtTime(Math.min(gBase * 5, 0.6), now);
                    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    osc.start(now);
                    osc.stop(now + 0.13);
                } else if (type === 'snare') {
                    var gBase = preset.gain != null ? preset.gain : 0.08;
                    var osc = c.createOscillator();
                    var g1 = c.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(250, now);
                    osc.connect(g1);
                    g1.connect(masterGain);
                    g1.gain.setValueAtTime(Math.min(gBase * 3, 0.4), now);
                    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.11);
                    // snap noise burst
                    var ns = c.createBufferSource();
                    var bs = 2 * c.sampleRate;
                    var buf = c.createBuffer(1, bs, c.sampleRate);
                    var d = buf.getChannelData(0);
                    for (var i = 0; i < bs; i++) { d[i] = Math.random() * 2 - 1; }
                    ns.buffer = buf;
                    var g2 = c.createGain();
                    var bp = c.createBiquadFilter();
                    bp.type = 'bandpass';
                    bp.frequency.value = 2000;
                    bp.Q.value = 1;
                    ns.connect(bp);
                    bp.connect(g2);
                    g2.connect(masterGain);
                    g2.gain.setValueAtTime(Math.min(gBase * 5, 0.6), now);
                    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                    ns.start(now);
                    ns.stop(now + 0.09);
                } else if (type === 'hat') {
                    var gBase = preset.gain != null ? preset.gain : 0.08;
                    var ns = c.createBufferSource();
                    var bs = 2 * c.sampleRate;
                    var buf = c.createBuffer(1, bs, c.sampleRate);
                    var d = buf.getChannelData(0);
                    for (var i = 0; i < bs; i++) { d[i] = Math.random() * 2 - 1; }
                    ns.buffer = buf;
                    var g2 = c.createGain();
                    var hp = c.createBiquadFilter();
                    hp.type = 'highpass';
                    hp.frequency.value = 7000;
                    ns.connect(hp);
                    hp.connect(g2);
                    g2.connect(masterGain);
                    g2.gain.setValueAtTime(Math.min(gBase * 2, 0.25), now);
                    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                    ns.start(now);
                    ns.stop(now + 0.05);
                } else if (type === 'clap') {
                    var gBase = preset.gain != null ? preset.gain : 0.08;
                    // Reverb-y broadband snap
                    var ns = c.createBufferSource();
                    var bs = c.sampleRate * 0.15;
                    var buf = c.createBuffer(1, bs, c.sampleRate);
                    var d = buf.getChannelData(0);
                    for (var i = 0; i < bs; i++) { d[i] = Math.random() * 2 - 1; }
                    ns.buffer = buf;
                    var g2 = c.createGain();
                    g2.gain.setValueAtTime(Math.min(gBase * 3, 0.35), now);
                    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    ns.connect(g2);
                    g2.connect(masterGain);
                    ns.start(now);
                    ns.stop(now + 0.16);
                }
            } catch (_) {}
        }

        function scheduleDrums(preset, firstDelayMs) {
            if (!isPlaying || !preset || !preset.drums || preset.drums.length === 0) return;
            var delay = firstDelayMs != null ? firstDelayMs : 0;
            drumTimer = setTimeout(function() {
                if (!isPlaying) return;
                var beat = preset.drums[drumIndex];
                if (beat !== '_') {
                    playDrum(beat, preset);
                }
                drumIndex = (drumIndex + 1) % preset.drums.length;
                var beatDur = preset.bpm ? (60000.0 / preset.bpm / 4.0) : 250.0; // 1 beat = 1/16th note at BPM
                scheduleDrums(preset, beatDur);
            }, delay);
        }

        // ── drum synthesizer end ────────────────────────────────────────

        function startEngine() {
            var preset = getPreset();
            if (!preset) return;
            currentPreset = preset;
            if (preset.file) {
                startFileAudio(preset);
                return;
            }
            ensureCtx();

            // Begin scheduling only once the AudioContext is running.
            // Modern browsers start AudioContext in 'suspended' state; firing
            // note events before it is running schedules them into the void.
            function begin() {
                if (!isPlaying) return; // user toggled off while awaiting resume
                // Audio must actually be running or all scheduled notes are lost
                if (ctx.state !== 'running') {
                    isPlaying = false;
                    return;
                }
                melodyIndex = 0;
                startDrones(preset);
                startNoise(preset);
                schedulePulse();
                scheduleDrums(preset, 0);
                // masterGain is a binary gate: open it quickly (50 ms) so the
                // first scheduled notes are not swallowed by a long ramp.
                // preset.attack controls per-note envelopes, not the gate.
                fadeMasterTo(1.0, 0.05);
            }

            if (ctx.state === 'suspended') {
                isPlaying = true; // flag the intent so begin() can run later
                ctx.resume().then(begin).catch(function() {
                    // Resume failed (no autoplay permission).  Reset state so
                    // the next keypress triggers a fresh start attempt.
                    isPlaying = false;
                });
            } else {
                isPlaying = true;
                begin();
            }
        }

        function pauseEngine() {
            isPlaying = false;
            var fadeOut = ambientAudio ? 0.5 : (currentPreset && currentPreset.release != null ? currentPreset.release : 0.5);
            if (ambientAudio) {
                fadeAmbientAudioTo(0, fadeOut, function() {
                    if (!isPlaying) stopFileAudio(false);
                });
            }
            fadeMasterTo(0, fadeOut);
            setTimeout(function() {
                if (!isPlaying) stopAll();
            }, 1000);
        }

        window.snonuxAmbientStart = function(reason) {
            if (isPlaying) return;
            startEngine();
        };

        window.snonuxAmbientPause = function(reason) {
            if (!isPlaying) return;
            pauseEngine();
        };

        window.snonuxAmbientToggle = function() {
            if (isPlaying) snonuxAmbientPause('toggle');
            else snonuxAmbientStart('toggle');
        };

        window.snonuxAmbientSetWild = function(on) {
            var wasWild = isWild;
            isWild = !!on;
            if (isPlaying && wasWild !== isWild) {
                var newPreset = getPreset();
                if (!newPreset) {
                    snonuxAmbientPause();
                    return;
                }
                fadeMasterTo(0, 0.3);
                if (ambientAudio) fadeAmbientAudioTo(0, 0.3);
                setTimeout(function() {
                    if (!isPlaying) return;
                    stopAll();
                    currentPreset = newPreset;
                    if (newPreset.file) {
                        startFileAudio(newPreset);
                        return;
                    }
                    melodyIndex = 0;
                    startDrones(newPreset);
                    startNoise(newPreset);
                    schedulePulse();
                    scheduleDrums(newPreset, 0);
                    var targetGain = 1.0;
                    fadeMasterTo(targetGain, 0.5);
                }, 350);
            }
        };

        window.snonuxAmbientSyncPreset = function() {
            if (!isPlaying) return;
            var preset = getPreset();
            if (!preset) {
                snonuxAmbientPause();
                return;
            }
            // stopAll resets every voice (including drums) — we then have to
            // re-schedule each one or the new theme plays only the melody and
            // we keep hearing whatever was cached as silence on top of it.
            stopAll();
            currentPreset = preset;
            if (preset.file) {
                startFileAudio(preset);
                return;
            }
            melodyIndex = 0;
            startDrones(preset);
            startNoise(preset);
            schedulePulse();
            scheduleDrums(preset, 0);
            // masterGain is the binary on/off gate (per-note volumes carry
            // preset.gain). Targeting preset.gain here would scale the gate
            // by ~0.03 and silence the new theme until the user toggles 'p'.
            fadeMasterTo(1.0, 0.3);
        };

        window.snonuxAmbientIsPlaying = function() {
            return isPlaying;
        };
    })();

    (function splashSetup() {
        var el = document.getElementById('splash-overlay');
        if (!el) return;
        var splashAudioCtx = null;
        var splashChimePlayed = false;
        function playSplashChime() {
            if (splashChimePlayed) return;
            try {
                if (!splashAudioCtx) {
                    splashAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                var ctx = splashAudioCtx;
                function ring() {
                    splashChimePlayed = true;
                    // Theme override: if defined, plays its own sound and returns true to skip the default chime.
                    if (window.snonuxSplashSound && window.snonuxSplashSound(ctx)) return;
                    var now = ctx.currentTime;
                    var sp = SNONUX_SOUNDS.splash;
                    var freqs = sp.freqs;
                    var spacing = sp.spacing != null ? sp.spacing : 0.075;
                    var gainAm = sp.gain != null ? sp.gain : 0.1;
                    var wave = snonuxWaveType(sp.wave);
                    var i, osc, g, t0;
                    for (i = 0; i < freqs.length; i++) {
                        osc = ctx.createOscillator();
                        g = ctx.createGain();
                        osc.connect(g);
                        g.connect(ctx.destination);
                        osc.type = wave;
                        osc.frequency.value = freqs[i];
                        t0 = now + i * spacing;
                        g.gain.setValueAtTime(0, t0);
                        g.gain.linearRampToValueAtTime(gainAm, t0 + 0.028);
                        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.52);
                        osc.start(t0);
                        osc.stop(t0 + 0.55);
                    }
                }
                ctx.resume().then(ring).catch(function() {});
            } catch (_) {}
        }
        function dismiss() {
            if (typeof splashDrift !== 'undefined') splashDrift.stop();
            if (el.classList.contains('splash--dismissed')) return;
            el.classList.add('splash--dismissed');
            el.setAttribute('aria-hidden', 'true');
        }
        function show() {
            if (typeof splashDrift !== 'undefined') splashDrift.reset();
            document.documentElement.classList.remove('sno-splash-skip');
            el.classList.remove('splash--dismissed');
            el.removeAttribute('aria-hidden');
            el.focus({ preventScroll: true });
        }
        function openSplashFromHeader(e) {
            if (e.target.closest('a')) return;
            e.preventDefault();
            if (typeof modalDrift !== 'undefined') modalDrift.stop();
            var modal = document.getElementById('post-modal');
            if (modal) modal.classList.remove('active');
            show();
        }
        function bindHeaderTriggers() {
            // The header markup may just have been swapped by a theme switch,
            // so let games.js (re)insert its launch button first.
            if (window.snonuxGameDecorate) window.snonuxGameDecorate();
            var triggers = document.querySelectorAll('.logo-mark, .logo-title h1, #sn-logo');
            triggers.forEach(function(trigger) {
                trigger.addEventListener('click', openSplashFromHeader);
            });
        }
        bindHeaderTriggers();
        // Exposed so the runtime theme-meta apply can re-bind after replacing
        // <header> innerHTML — the freshly-injected nodes have no listeners.
        window._snonuxRebindHeader = bindHeaderTriggers;
        window._snonuxDismissSplash = dismiss;
        window._snonuxShowSplash = show;
        window._snonuxPlaySplashChime = playSplashChime;
        if (document.documentElement.classList.contains('sno-splash-skip')) {
            dismiss();
            return;
        }
        playSplashChime();
        el.addEventListener('pointerdown', function() { playSplashChime(); }, { passive: true });
        el.addEventListener('click', function(e) { e.preventDefault(); dismiss(); });
        el.focus({ preventScroll: true });
    })();

    // === SPECIAL EFFECTS HELPERS ===
    function playBassDrop() {
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(130, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.55);
            gain.gain.setValueAtTime(0.22, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
            osc.start(); osc.stop(ctx.currentTime + 0.95);
        } catch(_) {}
    }
    function snonuxParticleBurst(count, color) {
        var burst = document.createElement('div');
        burst.id = 'sno-burst';
        burst.setAttribute('aria-hidden', 'true');
        document.body.appendChild(burst);
        var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
        for (var i = 0; i < count; i++) {
            var s = document.createElement('span');
            var angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
            var dist = 60 + Math.random() * 280;
            s.style.left = cx + 'px';
            s.style.top = cy + 'px';
            s.style.setProperty('--px', (Math.cos(angle) * dist).toFixed(1) + 'px');
            s.style.setProperty('--py', (Math.sin(angle) * dist).toFixed(1) + 'px');
            s.style.setProperty('--pdur', (0.25 + Math.random() * 0.35).toFixed(2) + 's');
            s.style.setProperty('--pdel', (Math.random() * 0.08).toFixed(2) + 's');
            s.style.width = (3 + Math.random() * 6) + 'px';
            s.style.height = s.style.width;
            s.style.background = color || 'currentColor';
            burst.appendChild(s);
        }
        setTimeout(function() { burst.remove(); }, 900);
    }
    function snonuxKonamiExplosion() {
        document.querySelectorAll('.post').forEach(function(p) {
            p.classList.add('sno-fx-flip');
            setTimeout(function() { p.classList.remove('sno-fx-flip'); }, 1500);
        });
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9997;pointer-events:none;background:rgba(255,255,255,0.92);mix-blend-mode:difference;transition:opacity 0.25s';
        document.body.appendChild(ov);
        setTimeout(function() { ov.style.opacity='0'; setTimeout(function(){ov.remove();}, 300); }, 220);
        snonuxParticleBurst(72, '#fff');
        playBassDrop();
        var banner = document.createElement('div');
        banner.id = 'sno-konami-banner';
        banner.textContent = 'UNLOCKED';
        document.body.appendChild(banner);
        requestAnimationFrame(function() { banner.style.opacity='1'; });
        setTimeout(function() { banner.style.opacity='0'; setTimeout(function(){banner.remove();}, 350); }, 2200);
    }
    function snonuxCriticalOverload() {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:9997;pointer-events:none;background:#fff;mix-blend-mode:difference;';
        document.body.appendChild(ov);
        [0, 70, 140, 210].forEach(function(d,i){
            setTimeout(function(){ ov.style.opacity = (i%2===0)?'1':'0.25'; }, d);
        });
        setTimeout(function(){ ov.style.transition='opacity 0.3s'; ov.style.opacity='0'; setTimeout(function(){ov.remove();}, 350); }, 320);
        document.querySelectorAll('.post').forEach(function(p){
            p.classList.add('sno-fx-flip');
            setTimeout(function(){ p.classList.remove('sno-fx-flip'); }, 1500);
        });
        playBassDrop();
        snonuxParticleBurst(96, window._snonuxWildFlashColor || '#fff');
    }
    // Konami code tracker
    (function konamiSetup(){
        var seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
        var idx = 0;
        document.addEventListener('keydown', function(e){
            if (e.key === seq[idx]) { idx++; if (idx >= seq.length) { idx = 0; snonuxKonamiExplosion(); } }
            else { idx = (e.key === seq[0]) ? 1 : 0; }
        });
    })();
    // CRT overlay injection
    (function crtSetup(){
        if (document.getElementById('sno-crt-overlay')) return;
        var crt = document.createElement('div');
        crt.id = 'sno-crt-overlay';
        crt.innerHTML = '<div class="crt-scanlines"></div><div class="crt-flicker"></div>';
        crt.setAttribute('aria-hidden','true');
        document.body.appendChild(crt);
        var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.id = 'sno-crt-svg';
        svg.setAttribute('style','position:absolute;width:0;height:0;');
        svg.innerHTML = '<defs><filter id="sno-crt-distort"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.006" numOctaves="2" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
        document.body.appendChild(svg);
    })();
    // Seasonal effects
    (function seasonalEffects(){
        var month = new Date().getMonth();
        var season = (month >= 11 || month <= 1) ? 'winter' : (month <= 4) ? 'spring' : (month <= 7) ? 'summer' : 'autumn';
        document.body.classList.add('sno-season-' + season);
    })();
    // === VAPORWAVE SUNSET (synthwave / retro only) ===
    (function vaporwaveSetup(){
        var theme = snonuxDetectThemeName();
        if (theme !== 'synthwave' && theme !== 'retro') return;
        var sunset = document.createElement('div');
        sunset.id = 'sno-vaporwave-sunset';
        sunset.setAttribute('aria-hidden','true');
        sunset.innerHTML = '<svg style="width:100%;height:100%;" preserveAspectRatio="none" viewBox="0 0 100 100"><defs><linearGradient id="vwg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ff00cc" stop-opacity="0.35"/><stop offset="40%" stop-color="#ff00cc" stop-opacity="0.1"/><stop offset="100%" stop-color="#0a0a1a" stop-opacity="0"/></linearGradient></defs><ellipse cx="50" cy="95" rx="55" ry="18" fill="url(#vwg)"/><rect x="0" y="0" width="100" height="100" fill="none"/><g opacity="0.35">' + Array.from({length:12},function(_,i){return '<rect x="0" y="' + (75 + i*2.1) + '" width="100" height="' + (1.2 + i*0.2) + '" fill="#ff00cc" opacity="' + (0.5 - i*0.04).toFixed(2) + '"/>';}).join('') + '</g></svg>';
        document.body.appendChild(sunset);
        document.body.classList.add('sno-vaporwave-on');
    })();
    // === PARALLAX TILT ===
    (function parallaxSetup(){
        var enabled = true; // on by default
        document.body.classList.add('sno-parallax-on');
        window.snonuxToggleParallax = function(on){ enabled = on; document.body.classList.toggle('sno-parallax-on', on); };
        document.addEventListener('mousemove', function(e){
            if (!enabled) return;
            var x = (e.clientX / window.innerWidth - 0.5) * 2;
            var y = (e.clientY / window.innerHeight - 0.5) * 2;
            var ov = document.querySelector('.overlay');
            if (ov) {
                var rotY = (x * 4.5).toFixed(2);
                var rotX = (-y * 4.0).toFixed(2);
                ov.style.transform = 'rotateY(' + rotY + 'deg) rotateX(' + rotX + 'deg) scale(1.04)';
            }
            // Subtle depth per post
            document.querySelectorAll('.post').forEach(function(p, i){
                var depth = ((i % 3) - 1) * 12;
                p.style.transform = 'translateZ(' + depth + 'px)';
            });
        }, { passive: true });
    })();
    // === HACKER HOVER SCRAMBLE ===
    (function scrambleSetup(){
        var glyphs = '!<>-_\\/[]{}—=+*^?#________';
        function scramble(el){
            var original = el.getAttribute('data-scramble') || el.textContent;
            if (!el.getAttribute('data-scramble')) el.setAttribute('data-scramble', original);
            var len = original.length;
            var iter = 0;
            var interval = setInterval(function(){
                el.textContent = original.split('').map(function(ch, i){
                    if (i < iter) return original[i];
                    return glyphs[Math.floor(Math.random() * glyphs.length)];
                }).join('');
                iter += 1/3;
                if (iter >= len) { clearInterval(interval); el.textContent = original; }
            }, 30);
        }
        function attach(){
            document.querySelectorAll('.post-header strong, .logo-title h1, .splash-title').forEach(function(el){
                if (el._scrambleAttached) return;
                el._scrambleAttached = true;
                el.addEventListener('mouseenter', function(){ scramble(el); });
            });
        }
        attach();
        // re-attach after any dynamic content changes (not common here but safe)
        window.snonuxAttachScramble = attach;
    })();
    // === SCREENSHOT FLASH ===
    function snonuxScreenshotFlash(){
        var flash = document.createElement('div');
        flash.id = 'sno-shutter-flash';
        document.body.appendChild(flash);
        flash.style.transition = 'none';
        flash.style.opacity = '1';
        // Shutter sound
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            var noise = ctx.createScriptProcessor(4096, 1, 1);
            noise.onaudioprocess = function(e){
                var out = e.outputBuffer.getChannelData(0);
                for (var i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * 0.15;
            };
            noise.connect(gain); gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            noise.connect(gain);
            osc.connect(gain);
            osc.type = 'square';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
            osc.start(); osc.stop(ctx.currentTime + 0.12);
            setTimeout(function(){ noise.disconnect(); }, 200);
        } catch(_) {}
        setTimeout(function(){
            flash.style.transition = 'opacity 0.35s ease';
            flash.style.opacity = '0';
            setTimeout(function(){ flash.remove(); }, 400);
        }, 80);
    }
    // === POST SCATTER ===
    function snonuxPostScatter(){
        var all = document.querySelectorAll('.post');
        all.forEach(function(p){
            var sx = ((Math.random() - 0.5) * window.innerWidth * 0.6).toFixed(1) + 'px';
            var sy = ((Math.random() - 0.5) * window.innerHeight * 0.6).toFixed(1) + 'px';
            var sr = ((Math.random() - 0.5) * 25).toFixed(1) + 'deg';
            p.style.setProperty('--sx', sx);
            p.style.setProperty('--sy', sy);
            p.style.setProperty('--sr', sr);
            p.classList.add('sno-scatter');
            setTimeout(function(){ p.classList.remove('sno-scatter'); }, 950);
        });
        playBassDrop();
    }
    // === RAINBOW SPARKLE TRAIL ===
    (function rainbowSparkle(){
        var throttle = 0;
        var hue = 0;
        document.addEventListener('pointermove', function(e){
            var now = Date.now();
            if (now - throttle < 45) return;
            throttle = now;
            var d = document.createElement('div');
            d.className = 'sno-sparkle';
            var size = 3 + Math.random() * 5;
            d.style.width = size + 'px';
            d.style.height = size + 'px';
            d.style.left = (e.clientX - size / 2 + (Math.random() - 0.5) * 10) + 'px';
            d.style.top = (e.clientY - size / 2 + (Math.random() - 0.5) * 10) + 'px';
            d.style.background = 'hsl(' + hue + ',90%,65%)';
            d.style.opacity = '0.85';
            d.style.animation = 'sno-sparkle ' + (0.35 + Math.random() * 0.25).toFixed(2) + 's ease-out forwards';
            document.body.appendChild(d);
            setTimeout(function() { d.remove(); }, 650);
            hue = (hue + 22) % 360;
        }, { passive: true });
    })();
    // === KEYBOARD NAVIGATION ===
    // j / ArrowDown  → next post       k / ArrowUp    → previous post
    // h / ArrowLeft  → previous page   l / ArrowRight → next page
    // PageUp/PageDown → scroll the post list; re-highlight post nearest visible center
    // Enter / click post → expand modal    Esc → close modal
    const posts = document.querySelectorAll('.post');
    let currentIndex = posts.length > 0 ? 0 : -1;
    var scrollSelectionFrame = null;
    var scrollSelectionSoundAt = 0;
    var ignoreScrollSelectionUntil = 0;
    var SCROLL_SELECTION_SOUND_GAP = 180;
    var PROGRAMMATIC_SCROLL_SUPPRESS_MS = 650;
    var prevPageURL = (typeof window !== "undefined") ? (window.snonuxPrevPageURL || null) : null;
    var nextPageURL = (typeof window !== "undefined") ? (window.snonuxNextPageURL || null) : null;

    if (currentIndex >= 0) selectPost(0);

    function postListScroller() {
        return document.getElementById('post-content');
    }

    function markProgrammaticPostScroll() {
        ignoreScrollSelectionUntil = Date.now() + PROGRAMMATIC_SCROLL_SUPPRESS_MS;
    }

    function setActiveHighlight(index, playSound, scrollIntoView) {
        if (posts.length === 0) return;
        var prevIdx = currentIndex;
        if (currentIndex >= 0) posts[currentIndex].classList.remove('post-active');
        currentIndex = Math.max(0, Math.min(index, posts.length - 1));
        posts[currentIndex].classList.add('post-active');
        if (prevIdx >= 0 && prevIdx !== currentIndex && posts[prevIdx]) {
            var ghost = posts[prevIdx].querySelector('.sno-afterimage');
            if (!ghost) {
                ghost = document.createElement('div');
                ghost.className = 'sno-afterimage';
                posts[prevIdx].appendChild(ghost);
            }
            ghost.classList.remove('sno-afterimage-active');
            void ghost.offsetWidth;
            ghost.classList.add('sno-afterimage-active');
        }
        if (scrollIntoView) {
            markProgrammaticPostScroll();
            posts[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (playSound) playNavSound();
    }

    function selectPost(index, direction) {
        setActiveHighlight(index, true, true);
        if (direction && posts[currentIndex]) {
            var post = posts[currentIndex];
            post.classList.remove('sno-enter-down', 'sno-enter-up');
            void post.offsetWidth;
            post.classList.add(direction === 'down' ? 'sno-enter-down' : 'sno-enter-up');
            setTimeout(function() { post.classList.remove('sno-enter-down', 'sno-enter-up'); }, 320);
        }
        if (window.snonuxNavEffect) window.snonuxNavEffect();
    }

    /** Pick the post that should be active for the current viewport (nearest the visible center). */
    function activeIndexForVisibleRegion(sc) {
        if (posts.length === 0) return -1;
        var scrTop, scrBot, centerY;
        if (sc) {
            var scr = sc.getBoundingClientRect();
            scrTop = scr.top;
            scrBot = scr.bottom;
            centerY = scr.top + (scr.height / 2);
        } else {
            scrTop = 0;
            scrBot = window.innerHeight;
            centerY = window.innerHeight / 2;
        }
        var i, pr, visTop, visBot, distance;
        var bestIndex = -1;
        var bestDistance = Infinity;
        for (i = 0; i < posts.length; i++) {
            pr = posts[i].getBoundingClientRect();
            if (pr.top <= centerY && centerY < pr.bottom) return i;
        }
        for (i = 0; i < posts.length; i++) {
            pr = posts[i].getBoundingClientRect();
            if (pr.bottom <= scrTop || pr.top >= scrBot) continue;
            visTop = Math.max(pr.top, scrTop);
            visBot = Math.min(pr.bottom, scrBot);
            distance = Math.abs(((visTop + visBot) / 2) - centerY);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        if (bestIndex >= 0) return bestIndex;
        for (i = 0; i < posts.length; i++) {
            pr = posts[i].getBoundingClientRect();
            distance = Math.abs(((pr.top + pr.bottom) / 2) - centerY);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    function updateActiveFromUserScroll(sc) {
        if (Date.now() < ignoreScrollSelectionUntil) return;
        var nextIndex = activeIndexForVisibleRegion(sc);
        if (nextIndex < 0 || nextIndex === currentIndex) return;

        var prevIndex = currentIndex;
        var now = Date.now();
        var playSound = (now - scrollSelectionSoundAt) >= SCROLL_SELECTION_SOUND_GAP;
        setActiveHighlight(nextIndex, playSound, false);
        if (playSound) {
            scrollSelectionSoundAt = now;
            if (window.snonuxScrollEffect) {
                var direction = nextIndex > prevIndex ? 'down' : 'up';
                window.snonuxScrollEffect(direction);
            }
        }
    }

    function scheduleScrollDrivenSelection(sc) {
        if (Date.now() < ignoreScrollSelectionUntil || scrollSelectionFrame !== null) return;
        scrollSelectionFrame = requestAnimationFrame(function() {
            scrollSelectionFrame = null;
            updateActiveFromUserScroll(sc);
        });
    }

    (function setupScrollDrivenSelection() {
        var sc = postListScroller();
        if (sc) {
            sc.addEventListener('scroll', function() {
                scheduleScrollDrivenSelection(sc);
            }, { passive: true });
        } else {
            window.addEventListener('scroll', function() {
                scheduleScrollDrivenSelection(null);
            }, { passive: true });
        }
    })();

    function playNavSound() {
        try {
            var n = SNONUX_SOUNDS.nav;
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = n.freq;
            osc.type = snonuxWaveType(n.wave);
            var dur = n.dur != null ? n.dur : 0.08;
            var g = n.gain != null ? n.gain : 0.12;
            gain.gain.setValueAtTime(g, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur + 0.02);
        } catch (_) {}
    }

    function playOpenSound() {
        try {
            var o = SNONUX_SOUNDS.open;
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = snonuxWaveType(o.wave);
            var dur = o.dur != null ? o.dur : 0.14;
            var g = o.gain != null ? o.gain : 0.1;
            osc.frequency.setValueAtTime(o.start, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(o.end, ctx.currentTime + dur);
            gain.gain.setValueAtTime(g, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur + 0.06);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur + 0.07);
        } catch (_) {}
    }

    function playCloseSound() {
        try {
            var c = SNONUX_SOUNDS.close;
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = snonuxWaveType(c.wave);
            var dur = c.dur != null ? c.dur : 0.15;
            var g = c.gain != null ? c.gain : 0.1;
            osc.frequency.setValueAtTime(c.start, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(c.end, ctx.currentTime + dur);
            gain.gain.setValueAtTime(g, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur + 0.05);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur + 0.06);
        } catch (_) {}
    }

    function playBounceSound() {
        try {
            var b = SNONUX_SOUNDS.bounce;
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = snonuxWaveType(b.wave);
            var dur = b.dur != null ? b.dur : 0.12;
            var g = b.gain != null ? b.gain : 0.1;
            osc.frequency.setValueAtTime(b.start, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(b.end, ctx.currentTime + dur);
            gain.gain.setValueAtTime(g, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur + 0.05);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur + 0.06);
        } catch (_) {}
    }

    var _snoBounceCls = ['sno-fx-bounce-left','sno-fx-bounce-right','sno-fx-bounce-left-wild','sno-fx-bounce-right-wild',
        'sno-fx-bounce-up','sno-fx-bounce-down','sno-fx-bounce-up-wild','sno-fx-bounce-down-wild'];

    function bounceEffect(dir) {
        var ov = document.querySelector('.overlay');
        if (!ov) return;
        var wild = !!window._snoWildActive;
        var map = { left: wild ? 'sno-fx-bounce-left-wild' : 'sno-fx-bounce-left',
                    right: wild ? 'sno-fx-bounce-right-wild' : 'sno-fx-bounce-right',
                    up: wild ? 'sno-fx-bounce-up-wild' : 'sno-fx-bounce-up',
                    down: wild ? 'sno-fx-bounce-down-wild' : 'sno-fx-bounce-down' };
        var cls = map[dir] || map.down;
        _snoBounceCls.forEach(function(c) { ov.classList.remove(c); });
        void ov.offsetWidth;
        ov.classList.add(cls);
        var dur = wild ? 540 : 380;
        setTimeout(function() { ov.classList.remove(cls); }, dur);
        playBounceSound();
        if (wild) snonuxPulseFlash(window._snonuxWildFlashColor, 200);
    }

    // === DRIFT PHYSICS — reusable controller for floating panels ===
    function makeDriftController(getEl, opts) {
        var x = 0, y = 0, vx = 0, vy = 0, raf = null;
        var PUSH = opts.push || 12;
        var FRICTION = opts.friction || 0.92;
        var BOUNCE_DAMP = opts.bounceDamp || 0.5;
        var STOP_THRESHOLD = opts.stopThreshold || 0.3;

        function clampAndBounce() {
            var el = getEl();
            if (!el) return;
            var w = el.offsetWidth, h = el.offsetHeight;
            var maxX = (window.innerWidth - w) / 2;
            var maxY = (window.innerHeight - h) / 2;
            if (maxX < 0) maxX = window.innerWidth * 0.3;
            if (maxY < 0) maxY = window.innerHeight * 0.3;
            var hit = false;
            if (x > maxX) { x = maxX; vx = -vx * BOUNCE_DAMP; hit = true; }
            if (x < -maxX) { x = -maxX; vx = -vx * BOUNCE_DAMP; hit = true; }
            if (y > maxY) { y = maxY; vy = -vy * BOUNCE_DAMP; hit = true; }
            if (y < -maxY) { y = -maxY; vy = -vy * BOUNCE_DAMP; hit = true; }
            if (hit && opts.onBounce) opts.onBounce(el, x, y, vx, vy);
        }

        function tick() {
            vx *= FRICTION;
            vy *= FRICTION;
            x += vx;
            y += vy;
            clampAndBounce();
            var el = getEl();
            if (el) {
                if (opts.applyTransform) opts.applyTransform(el, x, y, vx, vy);
                else el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
            }
            if (Math.abs(vx) > STOP_THRESHOLD || Math.abs(vy) > STOP_THRESHOLD) {
                raf = requestAnimationFrame(tick);
            } else {
                raf = null;
            }
        }

        function ensureLoop() {
            if (!raf) raf = requestAnimationFrame(tick);
        }

        return {
            keyPush: function(e) {
                var dx = 0, dy = 0;
                switch (e.key) {
                    case 'h': case 'ArrowLeft':  dx = -PUSH; break;
                    case 'l': case 'ArrowRight': dx = PUSH;  break;
                    case 'k': case 'ArrowUp':    dy = -PUSH; break;
                    case 'j': case 'ArrowDown':  dy = PUSH;  break;
                    default: return false;
                }
                e.preventDefault();
                vx += dx;
                vy += dy;
                ensureLoop();
                return true;
            },
            kick: function(dx, dy) { vx += (dx || 0); vy += (dy || 0); ensureLoop(); },
            reset: function() {
                x = 0; y = 0; vx = 0; vy = 0;
                var el = getEl();
                if (el) el.style.transform = '';
                if (raf) { cancelAnimationFrame(raf); raf = null; }
            },
            stop: function() {
                if (raf) { cancelAnimationFrame(raf); raf = null; }
                var el = getEl();
                if (el) el.style.transform = '';
                x = 0; y = 0; vx = 0; vy = 0;
            }
        };
    }

    // === MODAL DRIFT — arrow/hjkl push the modal around with momentum ===
    var modalDrift = makeDriftController(
        function() { return document.querySelector('#post-modal .modal-inner'); },
        { push: 12, friction: 0.92, bounceDamp: 0.5, stopThreshold: 0.3 }
    );

    // === SPLASH DRIFT — same physics on the splash panel with velocity tilt ===
    var splashDrift = makeDriftController(
        function() { return document.querySelector('#splash-overlay .splash-inner'); },
        {
            push: 14,
            friction: 0.93,
            bounceDamp: 0.45,
            stopThreshold: 0.25,
            applyTransform: function(el, x, y, vx) {
                var rot = Math.max(-5, Math.min(5, vx * 0.15));
                el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + rot.toFixed(2) + 'deg)';
            },
            onBounce: function() {
                playBounceSound();
                if (window._snoWildActive) snonuxPulseFlash(window._snonuxWildFlashColor, 180);
            }
        }
    );

    function getFxButton(name) {
        return document.querySelector('.nav-fx-button[data-sno-fx="' + name + '"]');
    }

    function pulseFxButton(name) {
        var button = getFxButton(name);
        if (!button) return;
        button.classList.remove('sno-fx-triggered');
        void button.offsetWidth;
        button.classList.add('sno-fx-triggered');
        setTimeout(function() { button.classList.remove('sno-fx-triggered'); }, 180);
    }

    function syncFxButtonStates() {
        var wildButton = getFxButton('wild');
        if (wildButton) wildButton.setAttribute('aria-pressed', window._snoWildActive ? 'true' : 'false');
        var crtButton = getFxButton('crt');
        if (crtButton) crtButton.setAttribute('aria-pressed', document.body.classList.contains('sno-crt-on') ? 'true' : 'false');
        var ghostButton = getFxButton('ghost');
        if (ghostButton) ghostButton.setAttribute('aria-pressed', document.body.classList.contains('sno-ghost-mode') ? 'true' : 'false');
        var blankButton = getFxButton('blank');
        if (blankButton) blankButton.setAttribute('aria-pressed', document.body.classList.contains('sno-blank-mode') ? 'true' : 'false');
        var ambientButton = getFxButton('ambient');
        if (ambientButton) ambientButton.setAttribute('aria-pressed', (window.snonuxAmbientIsPlaying && window.snonuxAmbientIsPlaying()) ? 'true' : 'false');
    }

    function setWildMode(on, opts) {
        var wasPlaying = window.snonuxAmbientIsPlaying && window.snonuxAmbientIsPlaying();
        window._snoWildActive = !!on;
        if (window.snonuxWildToggle) window.snonuxWildToggle();
        snonuxSetWildState(window._snoWildActive);
        if (opts && opts.splashMode) snonuxWildFlash(window._snoWildActive);
        else if (window._snoWildActive) snonuxCriticalOverload();
        else snonuxWildFlash(false);
        if (opts && opts.kickSplash && splashDrift) {
            splashDrift.kick((Math.random() - 0.5) * 24, -10 - Math.random() * 10);
        }
        pulseFxButton('wild');
        syncFxButtonStates();
        // Ambient follows wild state: switch preset and start wild ambient on activation.
        // If ambient was not playing before wild mode, mark it as wild-forced so we can
        // stop it on deactivation unless the user opted in during the session.
        if (window._snoWildActive) {
            if (window.snonuxAmbientSetWild) window.snonuxAmbientSetWild(window._snoWildActive);
            if (!wasPlaying && window.snonuxAmbientStart) {
                window._snonuxAmbientWildForced = true;
                window.snonuxAmbientStart('wild');
            }
        } else {
            // If ambient was wild-forced and the user never opted in, fade to silence.
            if (window._snonuxAmbientWildForced && !snonuxAmbientLoadPreference()) {
                if (window.snonuxAmbientPause) window.snonuxAmbientPause('wild-off');
            }
            window._snonuxAmbientWildForced = false;
            if (window.snonuxAmbientSetWild) window.snonuxAmbientSetWild(window._snoWildActive);
        }
        // Re-sync button states after ambient may have started or stopped.
        syncFxButtonStates();
    }

    function toggleWildMode(opts) {
        setWildMode(!window._snoWildActive, opts);
    }

    function toggleCrtMode() {
        document.body.classList.toggle('sno-crt-on');
        pulseFxButton('crt');
        syncFxButtonStates();
    }

    function toggleGhostMode() {
        document.body.classList.toggle('sno-ghost-mode');
        pulseFxButton('ghost');
        syncFxButtonStates();
    }

    function snonuxLightningFlash() {
        var d = document.createElement('div');
        d.className = 'sno-lightning';
        document.body.appendChild(d);
        setTimeout(function() { d.remove(); }, 520);
    }

    function toggleBlankMode() {
        snonuxLightningFlash();
        document.body.classList.toggle('sno-blank-mode');
        pulseFxButton('blank');
        syncFxButtonStates();
    }

    function snonuxAmbientSavePreference(enabled) {
        try { localStorage.setItem('snonuxAmbientEnabled', enabled ? '1' : '0'); } catch (_) {}
    }
    function snonuxAmbientLoadPreference() {
        try { return localStorage.getItem('snonuxAmbientEnabled') === '1'; } catch (_) { return false; }
    }

    function toggleAmbientMode() {
        if (window.snonuxAmbientToggle) window.snonuxAmbientToggle();
        pulseFxButton('ambient');
        syncFxButtonStates();
        snonuxAmbientSavePreference(window.snonuxAmbientIsPlaying && window.snonuxAmbientIsPlaying());
    }

    function triggerFlashEffect() {
        snonuxScreenshotFlash();
        pulseFxButton('flash');
    }

    function triggerScatterEffect() {
        snonuxPostScatter();
        pulseFxButton('scatter');
    }

    (function setupNavFxButtons() {
        var fxHandlers = {
            wild: function() { toggleWildMode(); },
            crt: toggleCrtMode,
            ghost: toggleGhostMode,
            blank: toggleBlankMode,
            ambient: toggleAmbientMode,
            flash: triggerFlashEffect,
            scatter: triggerScatterEffect,
            game: launchThemeGame,
            theme: function() {
                var pick = snonuxRandomTheme();
                if (pick) snonuxSwitchTheme(pick);
            }
        };
        var navHandlers = {
            'prev-post': function() {
                if (currentIndex <= 0) { bounceEffect('up'); }
                else { selectPost(currentIndex - 1, 'up'); }
            },
            'next-post': function() {
                if (currentIndex >= posts.length - 1) { bounceEffect('down'); }
                else { selectPost(currentIndex + 1, 'down'); }
            },
            'prev-page': function() {
                if (prevPageURL) { window.location.href = prevPageURL; }
                else { bounceEffect('left'); }
            },
            'next-page': function() {
                if (nextPageURL) { window.location.href = nextPageURL; }
                else { bounceEffect('right'); }
            },
            'open': function() { openPostAt(currentIndex, true); },
            'close': function() {
                if (document.getElementById('post-modal').classList.contains('active')) closeModal();
            }
        };
        document.querySelectorAll('.nav-fx-button').forEach(function(button) {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                var fx = button.getAttribute('data-sno-fx');
                if (fxHandlers[fx]) fxHandlers[fx]();
                var nav = button.getAttribute('data-sno-nav');
                if (navHandlers[nav]) navHandlers[nav]();
            });
        });
        syncFxButtonStates();
    })();

    // Bind clickables on splash overlay so it is easy to tap-open.
    (function touchSplashDismiss() {
        var splash = document.getElementById('splash-overlay');
        if (!splash || splash.classList.contains('splash--dismissed')) return;
        splash.addEventListener('click', function() {
            if (window._snonuxDismissSplash) window._snonuxDismissSplash();
        });
    })();

    // Mobile floating action button (FAB): appears only on narrow viewports when nav-hints
    // are visible but too cramped. Provides one-tap access to wild, music, and flash.
    (function mobileFAB() {
        if (document.getElementById('sno-fab')) return;
        var btn = document.createElement('button');
        btn.id = 'sno-fab';
        btn.setAttribute('aria-label', 'Open controls menu');
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<span id="sno-fab-icon"><i class="fas fa-bars" aria-hidden="true"></i></span>' +
                        '<span class="sno-fab-menu" role="menu" aria-hidden="true">' +
                        '<button type="button" role="menuitem" data-sno-fx="wild" aria-label="Toggle wild mode"><i class="fas fa-bolt" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="ambient" aria-label="Toggle ambient music"><i class="fas fa-music" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="flash" aria-label="Trigger flash effect"><i class="fas fa-camera" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="scatter" aria-label="Trigger scatter"><i class="fas fa-wind" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="crt" aria-label="Toggle CRT effect"><i class="fas fa-tv" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="ghost" aria-label="Toggle ghost mode"><i class="fas fa-ghost" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="blank" aria-label="Toggle blank mode"><i class="fas fa-eye-slash" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="theme" aria-label="Random theme"><i class="fas fa-palette" aria-hidden="true"></i></button>' +
                        '<button type="button" role="menuitem" data-sno-fx="game" aria-label="Play the game"><i class="fas fa-gamepad" aria-hidden="true"></i></button>' +
                        '</span>';
        document.body.appendChild(btn);

        var fxHandlers = {
            wild: function() { toggleWildMode(); },
            crt: toggleCrtMode,
            ghost: toggleGhostMode,
            blank: toggleBlankMode,
            ambient: toggleAmbientMode,
            flash: triggerFlashEffect,
            scatter: triggerScatterEffect,
            game: launchThemeGame,
            theme: function() {
                var pick = snonuxRandomTheme();
                if (pick) snonuxSwitchTheme(pick);
            }
        };

        var menu = btn.querySelector('.sno-fab-menu');
        var open = false;
        function setOpen(o) {
            open = o;
            btn.classList.toggle('open', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            menu.setAttribute('aria-hidden', open ? 'false' : 'true');
        }
        btn.addEventListener('click', function(e) {
            if (e.target.closest('[role="menuitem"]')) return;
            e.preventDefault();
            setOpen(!open);
        });
        btn.querySelectorAll('[role="menuitem"]').forEach(function(item) {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                var fx = item.getAttribute('data-sno-fx');
                if (fxHandlers[fx]) fxHandlers[fx]();
                setOpen(false);
            });
        });
        document.addEventListener('click', function(e) {
            if (open && !btn.contains(e.target)) setOpen(false);
        });
    })();

    // Restore ambient preference on load (opt-in; default off).
    (function initAmbientPreference() {
        if (snonuxAmbientLoadPreference() && window.snonuxAmbientStart) {
            window.snonuxAmbientStart('restore');
        }
        syncFxButtonStates();
    })();

    // Inject keyboard controls hint into splash overlay (all themes)
    (function enhanceSplashHint() {
        var hint = document.querySelector('#splash-overlay .splash-hint');
        if (!hint || document.querySelector('#splash-overlay .splash-controls')) return;
        var extra = document.createElement('div');
        extra.className = 'splash-controls';
        extra.innerHTML = '<kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> drift \u2022 <kbd>w</kbd> wild \u2022 <kbd>p</kbd> music \u2022 <kbd>a</kbd> game \u2022 <kbd>Enter</kbd> open';
        hint.appendChild(extra);
    })();

    // Splash music choice (task js0): give visitors an explicit "with music" /
    // "without music" choice on the splash screen itself, instead of only
    // discovering the 'p' ambient shortcut after they are already inside.
    // Purely additive -- clicking elsewhere on the splash, or Enter/Space/Escape,
    // still dismisses it without changing whichever ambient preference (if any)
    // was already restored from localStorage on this load.
    //
    // A named function declaration (not an IIFE) so it is hoisted and can be
    // re-invoked wherever #splash-overlay's innerHTML gets replaced wholesale
    // -- snonuxSwitchTheme() and snonuxApplyThemeMeta() both do this when the
    // visitor's saved theme differs from the one baked into this page, which
    // would otherwise silently wipe the choice buttons out again.
    function snonuxRenderSplashMusicChoice() {
        var overlay = document.getElementById('splash-overlay');
        var inner = overlay && overlay.querySelector('.splash-inner');
        // Nothing to attach to (unexpected theme markup), or already injected.
        if (!inner || inner.querySelector('.splash-music-choice')) {
            snonuxDecorateGameButtons();
            return;
        }
        var choice = document.createElement('div');
        choice.className = 'splash-music-choice';
        choice.innerHTML =
            '<button type="button" class="splash-music-btn" data-sno-music="on" aria-label="Enter with background music">' +
                '<i class="fas fa-music" aria-hidden="true"></i> With music</button>' +
            '<button type="button" class="splash-music-btn" data-sno-music="off" aria-label="Enter without background music">' +
                '<i class="fas fa-volume-mute" aria-hidden="true"></i> Without music</button>';
        inner.appendChild(choice);
        choice.addEventListener('click', function(e) {
            var btn = e.target.closest('.splash-music-btn');
            if (!btn) return;
            // Stop the click from also bubbling to the overlay's own
            // click-to-dismiss handler: we want our preference set first,
            // then dismiss explicitly ourselves, as a single clear path.
            e.stopPropagation();
            var withMusic = btn.getAttribute('data-sno-music') === 'on';
            snonuxAmbientSavePreference(withMusic);
            if (withMusic) {
                if (window.snonuxAmbientStart) window.snonuxAmbientStart('splash-choice');
            } else if (window.snonuxAmbientPause) {
                window.snonuxAmbientPause('splash-choice');
            }
            if (window._snonuxPlaySplashChime) window._snonuxPlaySplashChime();
            if (window._snonuxDismissSplash) window._snonuxDismissSplash();
            syncFxButtonStates();
        });
        snonuxDecorateGameButtons();
    }
    // The splash markup is replaced wholesale on a theme switch, which also
    // removes the "Play <game>" button games.js added. Re-adding it from here
    // keeps it below the music choice in every code path.
    function snonuxDecorateGameButtons() {
        if (window.snonuxGameDecorate) window.snonuxGameDecorate();
    }
    // Opens the active theme's arcade game (games.js). Shared by the fx-row
    // button, the mobile menu and the 'a' shortcut.
    function launchThemeGame() {
        pulseFxButton('game');
        if (window.snonuxGameLaunch) window.snonuxGameLaunch();
    }
    snonuxRenderSplashMusicChoice();

    function openPostAt(index, scrollIntoView) {
        if (posts.length === 0) return;
        setActiveHighlight(index, false, !!scrollIntoView);
        var post = posts[currentIndex];
        var postText = post ? post.querySelector('.post-text') : null;
        if (!postText) return;
        var modal = document.getElementById('post-modal');
        var modalInner = modal ? modal.querySelector('.modal-inner') : null;
        document.getElementById('modal-content').innerHTML = postText.innerHTML;
        modal.classList.add('active');
        modalDrift.reset();
        if (window.snonuxOpenEffect) window.snonuxOpenEffect(post);
        modal.scrollTop = 0;
        if (modalInner) {
            modalInner.scrollTop = 0;
            requestAnimationFrame(function() {
                modalInner.scrollIntoView({ block: 'center', inline: 'nearest' });
            });
        }
        playOpenSound();
    }

    function closeModal() {
        modalDrift.stop();
        document.getElementById('post-modal').classList.remove('active');
        playCloseSound();
        if (window.snonuxCloseEffect) window.snonuxCloseEffect();
    }

    (function postClickOpen() {
        posts.forEach(function(post, idx) {
            post.addEventListener('click', function(e) {
            if (e.target.closest('a, button, audio, video, input, textarea, select, label')) return;
                openPostAt(idx, true);
            });
        });
    })();

    // Per-post share button (visible only on mobile via CSS). Uses the Web Share
    // API where available, otherwise copies the permalink to the clipboard and
    // shows a brief toast. Falls back to window.prompt on very old browsers.
    (function postShareButtons() {
        var btns = document.querySelectorAll('.post-share-btn');
        if (btns.length === 0) return;
        function permalinkFor(id) {
            return location.origin + location.pathname + '#post-' + encodeURIComponent(id);
        }
        function showToast(msg) {
            var t = document.createElement('div');
            t.className = 'sno-share-toast';
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(function() { t.classList.add('sno-share-toast-out'); }, 1400);
            setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 1800);
        }
        btns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                var id = btn.getAttribute('data-share-id');
                if (!id) return;
                var url = permalinkFor(id);
                var shareData = { title: document.title, text: '@snonux post', url: url };
                if (navigator.share) {
                    navigator.share(shareData).catch(function() {});
                    return;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(function() {
                        showToast('Link copied');
                    }).catch(function() {
                        window.prompt('Copy link', url);
                    });
                    return;
                }
                window.prompt('Copy link', url);
            });
        });
    })();

    (function deepLinkFromHash() {
        var h = location.hash;
        if (!h || h.indexOf('#post-') !== 0) return;
        var id = decodeURIComponent(h.slice(6));
        var el = document.getElementById('post-' + id);
        if (!el) return;
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (isNaN(idx)) return;
        openPostAt(idx, true);
    })();

    document.addEventListener('keydown', function(e) {
        var tag = e.target.tagName;
        // Skip when typing into a form control. SELECT counts: native typeahead
        // (e.g. matching options by first letter) would otherwise be hijacked
        // by 'w', 'c', 't', etc. shortcuts.
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        var splash = document.getElementById('splash-overlay');
        if (splash && !splash.classList.contains('splash--dismissed')) {
            // A Tab-focused .splash-music-btn must keep native Enter/Space
            // button activation (which fires the click handler that sets the
            // chosen preference) instead of falling into the generic
            // dismiss-without-choice branch below, which would silently
            // strand keyboard-only visitors: they'd never be able to
            // actually pick "with" or "without" music via the keyboard.
            if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.splash-music-btn, .sno-game-launch')) {
                return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (window._snonuxPlaySplashChime) window._snonuxPlaySplashChime();
                if (window._snonuxDismissSplash) window._snonuxDismissSplash();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (window._snonuxDismissSplash) window._snonuxDismissSplash();
            } else if (e.key === 'w' && !e.repeat) {
                e.preventDefault();
                toggleWildMode({ splashMode: true, kickSplash: true });
            } else if (e.key === 'p' && !e.repeat) {
                e.preventDefault();
                toggleAmbientMode();
            } else if (e.key === 'f' && !e.repeat) {
                e.preventDefault();
                triggerFlashEffect();
            } else if (e.key === 'c' && !e.repeat) {
                e.preventDefault();
                toggleCrtMode();
            } else if (e.key === 'g' && !e.repeat) {
                e.preventDefault();
                toggleGhostMode();
            } else if (e.key === 'b' && !e.repeat) {
                e.preventDefault();
                toggleBlankMode();
            } else if (e.key === 't' && !e.repeat) {
                e.preventDefault();
                var pick = snonuxRandomTheme();
                if (pick) snonuxSwitchTheme(pick);
            } else if (e.key === 'a' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Ctrl+A (select all) and friends stay with the browser.
                e.preventDefault();
                launchThemeGame();
            } else if (splashDrift.keyPush(e)) {
                playNavSound();
            }
            return;
        }
        if (document.getElementById('post-modal').classList.contains('active')) {
            if (e.key === 'Escape') { closeModal(); e.preventDefault(); }
            else if (e.key === 'p' && !e.repeat) {
                e.preventDefault();
                toggleAmbientMode();
            }
            else if (e.key === 'f' && !e.repeat) {
                e.preventDefault();
                triggerFlashEffect();
            }
            else if (e.key === 't' && !e.repeat) {
                e.preventDefault();
                var pick = snonuxRandomTheme();
                if (pick) snonuxSwitchTheme(pick);
            }
            else if (modalDrift.keyPush(e)) { playNavSound(); }
            return;
        }
        switch (e.key) {
            case 'PageUp':
            case 'PageDown': {
                var sc = postListScroller();
                var step = (sc && sc.clientHeight) ? sc.clientHeight : window.innerHeight;
                var dy = (e.key === 'PageUp') ? -step : step;
                markProgrammaticPostScroll();
                if (sc) {
                    sc.scrollTop += dy;
                } else {
                    window.scrollBy(0, dy);
                }
                var idx = activeIndexForVisibleRegion(sc);
                if (idx >= 0) setActiveHighlight(idx, true, false);
                if (window.snonuxScrollEffect) window.snonuxScrollEffect(e.key === 'PageUp' ? 'up' : 'down');
                e.preventDefault();
                break;
            }
            case 'j': case 'ArrowDown':
                if (currentIndex >= posts.length - 1) { bounceEffect('down'); }
                else { selectPost(currentIndex + 1, 'down'); }
                e.preventDefault(); break;
            case 'k': case 'ArrowUp':
                if (currentIndex <= 0) { bounceEffect('up'); }
                else { selectPost(currentIndex - 1, 'up'); }
                e.preventDefault(); break;
            case 'h': case 'ArrowLeft':
                if (prevPageURL) { playNavSound(); if (window.snonuxPageEffect) window.snonuxPageEffect(); window.location.href = prevPageURL; }
                else { bounceEffect('left'); }
                e.preventDefault(); break;
            case 'l': case 'ArrowRight':
                if (nextPageURL) { playNavSound(); if (window.snonuxPageEffect) window.snonuxPageEffect(); window.location.href = nextPageURL; }
                else { bounceEffect('right'); }
                e.preventDefault(); break;
            case 'Enter':
                // On a focused game button Enter presses that button, as
                // Space does; everywhere else it opens the selected post.
                if (e.target.closest && e.target.closest('.sno-game-launch, .sno-arcade-open')) break;
                openPostAt(currentIndex, true); e.preventDefault(); break;
            case 'w': {
                toggleWildMode();
                e.preventDefault(); break;
            }
            case 'p': {
                toggleAmbientMode();
                e.preventDefault(); break;
            }
            case 'c':
                toggleCrtMode();
                e.preventDefault(); break;
            case 'g':
                toggleGhostMode();
                e.preventDefault(); break;
            case 'b':
                toggleBlankMode();
                e.preventDefault(); break;
            case 'f':
                triggerFlashEffect();
                e.preventDefault(); break;
            case 'x':
                triggerScatterEffect();
                e.preventDefault(); break;
            case 't': {
                var pick = snonuxRandomTheme();
                if (pick) snonuxSwitchTheme(pick);
                e.preventDefault(); break;
            }
            case 'a':
                // Ctrl+A (select all) and friends stay with the browser.
                if (e.ctrlKey || e.metaKey || e.altKey) break;
                if (!e.repeat) launchThemeGame();
                e.preventDefault(); break;
        }
    });

    // === MODAL SCROLL-END INDICATOR ===
    (function modalScrollEnd() {
        var mi = document.querySelector('#post-modal .modal-inner');
        if (!mi) return;
        mi.addEventListener('scroll', function() {
            var atEnd = mi.scrollHeight - mi.scrollTop - mi.clientHeight < 4;
            var el = document.getElementById('sno-scroll-end');
            if (!el) return;
            if (atEnd) {
                el.classList.remove('sno-scroll-end-active');
                void el.offsetWidth;
                el.classList.add('sno-scroll-end-active');
            }
        }, { passive: true });
    })();

    // === IDLE BREATHING ===
    (function idleBreathe() {
        var timer = null;
        var IDLE_DELAY = 10000;
        function startBreathe() {
            stopBreathe();
            timer = setTimeout(function() {
                if (currentIndex >= 0 && posts[currentIndex]) {
                    posts[currentIndex].classList.add('sno-idle-breathe');
                }
            }, IDLE_DELAY);
        }
        function stopBreathe() {
            clearTimeout(timer);
            for (var i = 0; i < posts.length; i++) {
                posts[i].classList.remove('sno-idle-breathe');
            }
        }
        function resetIdle() { stopBreathe(); startBreathe(); }
        document.addEventListener('keydown', resetIdle);
        document.addEventListener('pointermove', resetIdle, { passive: true });
        document.addEventListener('pointerdown', resetIdle, { passive: true });
        startBreathe();
    })();

    // === FIRST-VISIT PARTICLE BURST ===
    (function firstVisitBurst() {
        var key = 'sno-visited';
        try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (_) { return; }
        if (document.documentElement.classList.contains('sno-splash-skip')) return;
        var origDismiss = window._snonuxDismissSplash;
        if (!origDismiss) return;
        window._snonuxDismissSplash = function() {
            origDismiss();
            var burst = document.createElement('div');
            burst.id = 'sno-burst';
            burst.setAttribute('aria-hidden', 'true');
            document.body.appendChild(burst);
            var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
            for (var i = 0; i < 36; i++) {
                var s = document.createElement('span');
                var angle = (i / 36) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                var dist = 80 + Math.random() * 180;
                s.style.left = cx + 'px';
                s.style.top = cy + 'px';
                s.style.setProperty('--px', (Math.cos(angle) * dist).toFixed(1) + 'px');
                s.style.setProperty('--py', (Math.sin(angle) * dist).toFixed(1) + 'px');
                s.style.setProperty('--pdur', (0.4 + Math.random() * 0.5).toFixed(2) + 's');
                s.style.setProperty('--pdel', (Math.random() * 0.12).toFixed(2) + 's');
                s.style.width = (4 + Math.random() * 5) + 'px';
                s.style.height = s.style.width;
                burst.appendChild(s);
            }
            setTimeout(function() { burst.remove(); }, 1200);
        };
    })();

    // === THEME APPLICATION (runtime) ===
    // The shell renders header/splash/title for SNONUX_DEFAULT_THEME. If the
    // user has saved a different theme, fetch its meta.json and swap the
    // theme-specific markup. Once the splash overlay is final we load theme.js
    // — its splash WebGL initialiser must bind to the canvas it will animate.
    (function snonuxApplyThemeMeta() {
        if (typeof window === 'undefined') return;
        var current = window.SNONUX_CURRENT_THEME;
        var def = window.SNONUX_DEFAULT_THEME;
        if (!current) return;

        var splashOverlay = document.getElementById('splash-overlay');
        if (splashOverlay) {
            // theme.css selectors target via [data-sno-theme] (set by the
            // boot script on <html>); the legacy splash-<theme> class on the
            // overlay is added defensively for any rule still keyed off it.
            splashOverlay.classList.add('splash-' + current);
        }

        function applyMeta(m) {
            if (m.title) document.title = m.title;
            var headerEl = document.querySelector('header');
            if (headerEl && m.header_html) headerEl.innerHTML = m.header_html;
            // Same re-injection concern as snonuxSwitchTheme(): this runs on
            // initial load when the visitor's saved theme differs from the
            // one baked into the page, so the choice buttons must be rebuilt
            // against the swapped-in splash markup.
            if (splashOverlay && m.splash_inner_html) {
                splashOverlay.innerHTML = m.splash_inner_html;
                if (typeof snonuxRenderSplashMusicChoice === 'function') snonuxRenderSplashMusicChoice();
            }
            var prevA = document.getElementById('sno-prev-page');
            if (prevA && m.prev_page_text) prevA.innerHTML = m.prev_page_text;
            var nextA = document.getElementById('sno-next-page');
            if (nextA && m.next_page_text) nextA.innerHTML = m.next_page_text;
            if (typeof window._snonuxRebindHeader === 'function') window._snonuxRebindHeader();
        }

        function loadThemeJS() {
            var s = document.createElement('script');
            s.id = 'sno-theme-js';
            s.src = 'themes/' + current + '/theme.js';
            document.head.appendChild(s);
        }

        if (current === def) {
            // Baked markup is already correct. Load theme.js straight away.
            loadThemeJS();
            return;
        }

        // Switched theme: swap markup + sounds first, *then* load theme.js so
        // its splash WebGL attaches to the final canvas.
        var pending = 2;
        function done() { if (--pending === 0) loadThemeJS(); }
        // Cache-bust both fetches: per-page templated SNONUX_BUILD or fallback
        // to a per-load timestamp. Otherwise theme-switch can serve a stale
        // sounds.json and the user keeps hearing the previous theme's music.
        var bust = (window.SNONUX_BUILD || '') + '-' + Date.now();
        fetch('themes/' + current + '/meta.json?b=' + encodeURIComponent(bust))
            .then(function (r) { return r.json(); })
            .then(applyMeta)
            .catch(function () {})
            .finally(done);
        fetch('themes/' + current + '/sounds.json?b=' + encodeURIComponent(bust))
            .then(function (r) { return r.json(); })
            .then(function (s) { window.SNONUX_SOUNDS = s; SNONUX_SOUNDS = s; if (window.snonuxAmbientSyncPreset) window.snonuxAmbientSyncPreset(); })
            .catch(function () {})
            .finally(done);
    })();

    // === THEME DROPDOWN (populates select#sno-theme-select) ===
    (function snonuxThemeDropdown() {
        var sel = document.getElementById('sno-theme-select');
        if (!sel) return;
        var all = (typeof window !== 'undefined' && window.SNONUX_ALL_THEMES) || [];
        var current = snonuxDetectThemeName();
        sel.innerHTML = '';
        for (var i = 0; i < all.length; i++) {
            var name = all[i];
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === current) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', function () {
            snonuxSwitchTheme(sel.value);
        });
    })();
