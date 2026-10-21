    // DMG theme: everything is drawn as an original Game Boy LCD would show
    // it. Both WebGL scenes render into a tiny render target, which a
    // shader turns into the four pea-green shades with ordered (Bayer)
    // dithering, a visible pixel grid and the LCD's slow-pixel ghosting.
    (function() {
        if (typeof THREE === 'undefined') return;
        var SHADES = [0x0f380f, 0x306230, 0x8bac0f, 0x9bbc0f];

        var QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
        // Pass 1: luminance of the new frame, blended with the last one —
        // the ghost trails of a real DMG screen.
        var GHOST_FS = [
            'uniform sampler2D tScene; uniform sampler2D tPrev; uniform float ghost; varying vec2 vUv;',
            'void main(){',
            '  float l = dot(texture2D(tScene, vUv).rgb, vec3(0.299, 0.587, 0.114));',
            '  float p = texture2D(tPrev, vUv).r;',
            '  gl_FragColor = vec4(vec3(mix(l, p, ghost)), 1.0);',
            '}'].join('\n');
        // Pass 2: dither to four shades, palette, pixel grid, and in wild
        // mode tearing, link-cable glitch blocks and palette inversion.
        var LCD_FS = [
            'uniform sampler2D tLum; uniform vec2 lowRes; uniform float pix; uniform float time;',
            'uniform float tear; uniform float glitch; uniform float invert;',
            'uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;',
            'float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }',
            'float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }',
            'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
            'void main(){',
            '  vec2 cell = floor(gl_FragCoord.xy / pix);',
            '  float shift = 0.0;',
            '  if (tear > 0.0) {',
            '    float band = floor(cell.y / 7.0);',
            '    float n = hash(vec2(band, floor(time * 9.0)));',
            '    shift = step(1.0 - 0.3 * tear, n) * (n - 0.5) * 60.0;',
            '  }',
            '  vec2 uv = (cell + 0.5 + vec2(shift, 0.0)) / lowRes;',
            '  float l = texture2D(tLum, fract(uv)).r;',
            '  if (glitch > 0.0 && hash(floor(cell / vec2(18.0, 2.0)) + floor(time * 14.0)) > 1.0 - 0.06 * glitch) l = 1.0 - l;',
            '  float idx = clamp(floor(l * 3.0 + bayer4(cell)), 0.0, 3.0);',
            '  if (invert > 0.5) idx = 3.0 - idx;',
            '  vec3 col = idx < 0.5 ? c0 : (idx < 1.5 ? c1 : (idx < 2.5 ? c2 : c3));',
            '  vec2 f = fract(gl_FragCoord.xy / pix);',
            '  float grid = (f.x < 1.0 / pix || f.y < 1.0 / pix) ? 1.0 : 0.0;',
            '  col = mix(col, c0, grid * 0.22);',
            '  gl_FragColor = vec4(col, 1.0);',
            '}'].join('\n');

        function target(w, h, depth) {
            return new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
                depthBuffer: depth, stencilBuffer: false });
        }

        // makeLCD wraps a renderer: render(scene, camera) draws the scene at
        // 1/pix resolution and shows it as the green LCD on the canvas.
        function makeLCD(renderer, pixCss) {
            var quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
            quadScene.add(quad);
            var cols = SHADES.map(function(c) { return new THREE.Color(c); });
            var ghostMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: GHOST_FS,
                uniforms: { tScene: { value: null }, tPrev: { value: null }, ghost: { value: 0.5 } } });
            var lcdMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: LCD_FS, uniforms: {
                tLum: { value: null }, lowRes: { value: new THREE.Vector2(1, 1) }, pix: { value: 4 }, time: { value: 0 },
                tear: { value: 0 }, glitch: { value: 0 }, invert: { value: 0 },
                c0: { value: cols[0] }, c1: { value: cols[1] }, c2: { value: cols[2] }, c3: { value: cols[3] } } });
            var lcd = { ghost: ghostMat.uniforms.ghost, u: lcdMat.uniforms, rtScene: null, rtA: null, rtB: null };
            lcd.resize = function(w, h) {
                var dpr = renderer.getPixelRatio(), pix = Math.max(2, Math.round(pixCss(w, h) * dpr));
                var lw = Math.ceil(w * dpr / pix), lh = Math.ceil(h * dpr / pix);
                renderer.setSize(w, h, false);
                [lcd.rtScene, lcd.rtA, lcd.rtB].forEach(function(rt) { if (rt) rt.dispose(); });
                lcd.rtScene = target(lw, lh, true); lcd.rtA = target(lw, lh, false); lcd.rtB = target(lw, lh, false);
                lcd.u.lowRes.value.set(lw, lh); lcd.u.pix.value = pix;
            };
            lcd.render = function(scene, camera, t) {
                renderer.setRenderTarget(lcd.rtScene); renderer.render(scene, camera);
                quad.material = ghostMat; ghostMat.uniforms.tScene.value = lcd.rtScene.texture; ghostMat.uniforms.tPrev.value = lcd.rtA.texture;
                renderer.setRenderTarget(lcd.rtB); renderer.render(quadScene, quadCam);
                quad.material = lcdMat; lcd.u.tLum.value = lcd.rtB.texture; lcd.u.time.value = t;
                renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
                var swap = lcd.rtA; lcd.rtA = lcd.rtB; lcd.rtB = swap;
            };
            lcd.dispose = function() { [lcd.rtScene, lcd.rtA, lcd.rtB].forEach(function(rt) { if (rt) rt.dispose(); }); };
            return lcd;
        }

        function lambert(grey, flat) { return new THREE.MeshLambertMaterial({ color: new THREE.Color(grey, grey, grey), flatShading: !!flat }); }

        // A DMG-01 handheld: case, screen bezel and LCD, d-pad, A/B, start/select and the grille.
        function buildHandheld() {
            var g = new THREE.Group(), body = lambert(0.82), dark = lambert(0.28), mid = lambert(0.55);
            g.add(new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.7), body));
            var bez = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 0.1), dark); bez.position.set(0, 1.15, 0.38); g.add(bez);
            var lcdM = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.1), lambert(0.68)); lcdM.position.set(0.1, 1.1, 0.42); g.add(lcdM);
            var dh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.16), dark); dh.position.set(-0.75, -0.75, 0.4); g.add(dh);
            var dv = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.16), dark); dv.position.set(-0.75, -0.75, 0.4); g.add(dv);
            [[0.95, -0.55], [0.45, -0.85]].forEach(function(p) {
                var b = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 10), mid);
                b.rotation.x = Math.PI / 2; b.position.set(p[0], p[1], 0.4); g.add(b);
            });
            [-0.3, 0.3].forEach(function(x) { var s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.1), dark); s.position.set(x, -1.65, 0.38); s.rotation.z = 0.45; g.add(s); });
            for (var i = 0; i < 5; i++) { var gr = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.05), dark); gr.position.set(0.7 + i * 0.16, -2.0, 0.37); gr.rotation.z = 0.5; g.add(gr); }
            return g;
        }

        function buildCartridge() {
            var g = new THREE.Group();
            g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.32), lambert(0.6)));
            var label = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.05), lambert(0.92)); label.position.set(0, 0.25, 0.17); g.add(label);
            var art = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.06), lambert(0.3)); art.position.set(0, 0.35, 0.19); g.add(art);
            var notch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 0.34), lambert(0.45)); notch.position.set(0, 1.2, 0); g.add(notch);
            return g;
        }

        // ------------------------------------------------------------ splash
        // The whole splash is one big LCD: a handheld sways on the left while
        // cartridges tumble down on the right, behind the bezelled panel.
        (function splash() {
            if (document.documentElement.classList.contains('sno-splash-skip')) return;
            var cv = document.getElementById('splash-gl-canvas');
            if (!cv) return;
            var raf, ren, lcd, sc, ca, hand, cart, t0 = performance.now();
            function sz() { var w = cv.clientWidth || 2, h = cv.clientHeight || 2; if (lcd) lcd.resize(w, h); if (ca) { ca.aspect = w / h; ca.updateProjectionMatrix(); } }
            function cleanup() { window.removeEventListener('resize', sz); if (raf) cancelAnimationFrame(raf); raf = null; if (lcd) lcd.dispose(); if (ren) ren.dispose(); ren = null; window._snonuxSplashWebGLCleanup = null; }
            window._snonuxSplashWebGLCleanup = cleanup;
            try { ren = new THREE.WebGLRenderer({ canvas: cv, antialias: false }); } catch (e) { window._snonuxSplashWebGLCleanup = null; return; }
            ren.setPixelRatio(1);
            lcd = makeLCD(ren, function(w, h) { return Math.max(3, Math.round(h / 160)); });
            lcd.ghost.value = 0.6;
            sc = new THREE.Scene(); sc.background = new THREE.Color(0.8, 0.8, 0.8);
            ca = new THREE.PerspectiveCamera(45, 1, 0.1, 60); ca.position.set(0, 0, 14);
            sc.add(new THREE.AmbientLight(0xffffff, 0.45));
            var sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(-4, 6, 8); sc.add(sun);
            hand = buildHandheld(); hand.position.set(-5.2, 0, 0); sc.add(hand);
            cart = buildCartridge(); cart.position.set(5.2, 0, 0); sc.add(cart);
            sz(); window.addEventListener('resize', sz);
            function loop(now) {
                raf = requestAnimationFrame(loop);
                var t = (now - t0) * 0.001;
                hand.rotation.y = Math.sin(t * 0.7) * 0.6; hand.position.y = Math.sin(t * 1.3) * 0.4;
                cart.rotation.y = t * 0.9; cart.rotation.z = Math.sin(t) * 0.2; cart.position.y = 1.4 - ((t * 1.8) % 6) + 2;
                lcd.render(sc, ca, t);
            }
            raf = requestAnimationFrame(loop);
        })();

        // ---------------------------------------------------------- backdrop
        // A pixel landscape scrolling past (hills, trees, a far mountain
        // range), dithered sky with a sun and drifting clouds, and a DMG and a
        // cartridge floating over it.
        var wild = false, wildT = 0;
        var scene, camera, renderer, lcd, clock, ground, groundGeo, trees = [], clouds = [], hand, cart, sky;
        var travel = 0;

        function heightAt(x, z) {
            return Math.sin(x * 0.11) * 2.2 + Math.cos(z * 0.09 + x * 0.04) * 2.6 + Math.sin(z * 0.23) * 0.8;
        }

        function buildGround() {
            groundGeo = new THREE.PlaneGeometry(160, 120, 40, 30);
            groundGeo.rotateX(-Math.PI / 2);
            ground = new THREE.Mesh(groundGeo, lambert(0.62, true));
            ground.position.set(0, -6, -40);
            scene.add(ground);
        }

        function buildTrees() {
            var trunk = lambert(0.3), crown = lambert(0.42, true);
            for (var i = 0; i < 26; i++) {
                var g = new THREE.Group();
                var tr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), trunk); tr.position.y = 0.7; g.add(tr);
                var cr = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 6), crown); cr.position.y = 2.8; g.add(cr);
                g.userData = { x: (Math.random() - 0.5) * 120, z: -Math.random() * 110 };
                trees.push(g); scene.add(g);
            }
        }

        function buildSky() {
            // A dome shaded light at the horizon and a little darker overhead,
            // which the dither turns into the classic banded GB sky.
            var geo = new THREE.SphereGeometry(140, 24, 12), col = [], p = geo.attributes.position;
            for (var i = 0; i < p.count; i++) { var k = 0.98 - Math.max(0, p.getY(i) / 140) * 0.3; col.push(k, k, k); }
            geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
            scene.add(sky);
            var sunDisc = new THREE.Mesh(new THREE.CircleGeometry(7, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
            sunDisc.position.set(30, 34, -120); scene.add(sunDisc);
            var ring = new THREE.Mesh(new THREE.RingGeometry(8.5, 9.6, 16), new THREE.MeshBasicMaterial({ color: 0x9a9a9a, fog: false }));
            ring.position.set(30, 34, -119.5); scene.add(ring);
            var mount = lambert(0.5, true);
            for (var m = 0; m < 9; m++) {
                var c = new THREE.Mesh(new THREE.ConeGeometry(10 + (m % 3) * 4, 18 + (m % 4) * 5, 5), mount);
                c.position.set(-90 + m * 22, 0, -105 - (m % 2) * 8); scene.add(c);
            }
        }

        function buildClouds() {
            var white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), shade = new THREE.MeshBasicMaterial({ color: 0xc8c8c8, fog: false });
            for (var i = 0; i < 7; i++) {
                var g = new THREE.Group();
                [[0, 0, 6, 1.6], [-1.6, 1.1, 3.2, 1.4], [1.4, 0.9, 3.6, 1.6]].forEach(function(b) {
                    var m = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], 1), white); m.position.set(b[0], b[1], 0); g.add(m);
                });
                var under = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 1.02), shade); under.position.y = -0.8; g.add(under);
                g.position.set(-80 + i * 26, 14 + (i % 3) * 5, -60 - (i % 4) * 10);
                clouds.push(g); scene.add(g);
            }
        }

        function initThree() {
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: false });
            renderer.setPixelRatio(1);
            lcd = makeLCD(renderer, function(w, h) { return Math.max(3, Math.round(h / 190)); });
            scene = new THREE.Scene();
            scene.fog = new THREE.Fog(new THREE.Color(0.96, 0.96, 0.96), 40, 120);
            camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
            camera.position.set(0, 6, 14); camera.lookAt(0, 2, -20);
            scene.add(new THREE.AmbientLight(0xffffff, 0.42));
            var sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(30, 40, -60); scene.add(sun);
            var fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(-10, 8, 20); scene.add(fill);
            buildSky(); buildGround(); buildTrees(); buildClouds();
            hand = buildHandheld(); hand.position.set(9, 7, -6); hand.scale.setScalar(1.3); scene.add(hand);
            cart = buildCartridge(); cart.position.set(-10, 9, -12); cart.scale.setScalar(1.4); scene.add(cart);
            clock = new THREE.Clock();
            lcd.resize(window.innerWidth, window.innerHeight);
            window.addEventListener('resize', onResize);
            animate();
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            lcd.resize(window.innerWidth, window.innerHeight);
        }

        // The ground is a treadmill: its vertices take their height from the
        // distance travelled, so the hills roll towards the viewer.
        function rollGround() {
            var p = groundGeo.attributes.position, oz = ground.position.z;
            for (var i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i) + oz - travel));
            p.needsUpdate = true;
            trees.forEach(function(g) {
                var z = ((g.userData.z + travel) % 110 + 110) % 110 - 100;
                g.position.set(g.userData.x, -6 + heightAt(g.userData.x, z - travel), z);
            });
        }

        function animate() {
            requestAnimationFrame(animate);
            var dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime, speed = wild ? 26 : 5;
            travel += dt * speed;
            rollGround();
            clouds.forEach(function(c, i) {
                c.position.x += dt * (wild ? 14 : 2.2) * (1 + (i % 3) * 0.3);
                if (c.position.x > 90) c.position.x = -90;
            });
            hand.rotation.y = Math.sin(t * 0.4) * 0.7 + (wild ? t * 3 : 0); hand.rotation.x = Math.sin(t * 0.3) * 0.15;
            hand.position.y = 7 + Math.sin(t * 0.9) * 0.6;
            cart.rotation.y = t * (wild ? 4 : 0.5); cart.rotation.z = Math.sin(t * 0.7) * 0.3;
            cart.position.y = 9 + Math.cos(t * 0.8) * 0.8;
            camera.position.x = Math.sin(t * 0.15) * 2 + (wild ? (Math.random() - 0.5) * 0.6 : 0);
            wildFrame(dt);
            lcd.render(scene, camera, t);
        }

        // Wild mode: heavy ghosting, screen tearing, link-cable glitch
        // blocks and the palette flipping now and then.
        function wildFrame(dt) {
            lcd.ghost.value = wild ? 0.82 : 0.5;
            lcd.u.tear.value = wild ? 1 : 0;
            lcd.u.glitch.value = wild ? 1 : 0;
            if (!wild) { lcd.u.invert.value = 0; return; }
            wildT -= dt;
            if (wildT <= 0) { lcd.u.invert.value = 1 - lcd.u.invert.value; wildT = 0.25 + Math.random() * 0.9; }
        }

        // ----------------------------------------------------------- effects

        // A pixel dissolve: a grid of ink blocks that switch on (or off) one
        // by one in a random order, like a GB screen transition.
        function dissolve(fill, ms, rect) {
            var cols = 16, rows = 9, d = document.createElement('div'), cells = [];
            d.className = 'dmg-wipe';
            d.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
            if (rect) { d.style.inset = 'auto'; d.style.left = rect.left + 'px'; d.style.top = rect.top + 'px'; d.style.width = rect.width + 'px'; d.style.height = rect.height + 'px'; }
            for (var i = 0; i < cols * rows; i++) { var c = document.createElement('i'); c.style.opacity = fill ? '0' : '1'; cells.push(c); d.appendChild(c); }
            document.body.appendChild(d);
            cells.forEach(function(c) {
                setTimeout(function() { c.style.opacity = fill ? '1' : '0'; }, 20 + Math.random() * ms);
            });
            setTimeout(function() { d.remove(); }, ms + (fill ? 260 : 80));
        }

        function ghostTrail(dir) {
            var c = document.querySelector('.content');
            if (!c) return;
            var cls = dir === 'up' ? 'dmg-ghost-up' : 'dmg-ghost-down';
            c.classList.add(cls);
            setTimeout(function() { c.classList.remove(cls); }, wild ? 420 : 220);
        }

        function fade() {
            var d = document.createElement('div');
            d.className = 'dmg-fade';
            document.body.appendChild(d);
            setTimeout(function() { d.remove(); }, 400);
        }

        window.snonuxOpenEffect = function(post) {
            var inner = document.querySelector('#post-modal .modal-inner');
            var r = inner ? inner.getBoundingClientRect() : null;
            dissolve(false, 320, r && r.width ? r : null);
        };
        window.snonuxCloseEffect = function() { fade(); };
        window.snonuxScrollEffect = function(dir) { ghostTrail(dir); };
        window.snonuxNavEffect = function() {
            var a = document.querySelector('.post-active');
            if (a) { a.classList.add('dmg-jolt'); setTimeout(function() { a.classList.remove('dmg-jolt'); }, 260); }
            ghostTrail('down');
        };
        window.snonuxPageEffect = function() { dissolve(true, 260); };
        window.snonuxWildToggle = function() {
            wild = !wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', wild);
            document.body.classList.toggle('dmg-wild', wild);
            if (wild) dissolve(false, 400);
        };

        // Without WebGL the page keeps its plain ink background; the effects
        // above still work.
        try { initThree(); } catch (e) { renderer = null; }
    })();
