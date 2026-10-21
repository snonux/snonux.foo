    // Bauhaus splash: a red sphere, a yellow pyramid and a blue cube circle a
    // thin black ring on the paper, each turning on its own axis.
    (function(){
        if(document.documentElement.classList.contains('sno-splash-skip'))return;
        var cv=document.getElementById('splash-gl-canvas');
        if(!cv||typeof THREE==='undefined')return;
        var raf,ren,sc,ca,t0=performance.now(),solids=[];
        function cleanup(){window.removeEventListener('resize',sz);if(raf)cancelAnimationFrame(raf);raf=null;if(ren)ren.dispose();ren=null;window._snonuxSplashWebGLCleanup=null;}
        window._snonuxSplashWebGLCleanup=cleanup;
        function sz(){var w=cv.clientWidth||2,h=cv.clientHeight||2;if(ren)ren.setSize(w,h,false);if(ca){ca.aspect=w/h;ca.updateProjectionMatrix();}}
        ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});ren.setClearColor(0,0);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        sc=new THREE.Scene();ca=new THREE.PerspectiveCamera(45,1,0.1,80);ca.position.set(0,0,14);
        sc.add(new THREE.AmbientLight(0xffffff,0.75));var dl=new THREE.DirectionalLight(0xffffff,0.55);dl.position.set(3,5,6);sc.add(dl);
        var ring=new THREE.Mesh(new THREE.RingGeometry(4.6,4.72,96),new THREE.MeshBasicMaterial({color:0x141210,side:THREE.DoubleSide}));sc.add(ring);
        var arc=new THREE.Mesh(new THREE.RingGeometry(5.4,5.75,64,1,0,Math.PI*0.7),new THREE.MeshBasicMaterial({color:0xd62d20,side:THREE.DoubleSide}));sc.add(arc);
        [[new THREE.SphereGeometry(0.9,32,20),0xd62d20],[new THREE.ConeGeometry(1,1.7,3),0xf2b705],[new THREE.BoxGeometry(1.4,1.4,1.4),0x1f4e9c]].forEach(function(d){
            var m=new THREE.Mesh(d[0],new THREE.MeshLambertMaterial({color:d[1]}));sc.add(m);solids.push(m);});
        sz();window.addEventListener('resize',sz);
        function loop(now){raf=requestAnimationFrame(loop);var t=(now-t0)*0.001;
            solids.forEach(function(m,i){var a=t*0.5+i*Math.PI*2/3;m.position.set(Math.cos(a)*4.66,Math.sin(a)*4.66,0);m.rotation.x=t*(0.6+i*0.2);m.rotation.y=t*(0.8-i*0.15);});
            arc.rotation.z=-t*0.3;ring.scale.setScalar(1+Math.sin(t*1.3)*0.02);ren.render(sc,ca);}
        raf=requestAnimationFrame(loop);
    })();


    // Bauhaus backdrop: a Kandinsky composition of flat primary shapes and a
    // few solids on off-white paper, joined by thin black lines. Every
    // element drifts on its own small orbit, and every few seconds the whole
    // set re-arranges into the next composition. Wild mode turns the paper
    // into a black stage: the composition shatters into a three-way
    // kaleidoscope and the shapes spin through a fast Triadic Ballet.
    (function() {
        var RED = 0xd62d20, YELLOW = 0xf2b705, BLUE = 0x1f4e9c, BLACK = 0x141210, CREAM = 0xefe7d6;
        var N_COMP = 4, HOLD = 9, MOVE = 3.2;
        var _wild = false, wildAmt = 0, kick = 0;
        var scene, camera, renderer, clock, stage, mirrors = [], lines, lineMat, linePos;
        var items = [], comps = [], links = [], comp = 0, compT = 0;

        // Seeded so the composition is the same on every visit.
        function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

        // [kind, size, colour] — sizes are in units of half the screen height.
        var SPEC = [
            ['ring', 0.42, BLACK], ['disc', 0.3, BLUE], ['disc', 0.16, RED], ['disc', 0.07, YELLOW],
            ['tri', 0.22, YELLOW], ['tri', 0.12, RED], ['square', 0.14, BLUE], ['square', 0.08, RED],
            ['bar', 0.6, BLACK], ['bar', 0.4, RED], ['bar', 0.3, BLUE], ['arc', 0.32, RED], ['arc', 0.2, BLACK],
            ['sphere', 0.1, RED], ['cone', 0.12, YELLOW], ['cube', 0.09, BLUE], ['disc', 0.05, BLACK],
            ['ring', 0.12, RED], ['tri', 0.07, BLUE], ['square', 0.05, YELLOW], ['bar', 0.22, YELLOW],
            ['disc', 0.035, RED], ['disc', 0.03, BLUE], ['cube', 0.05, BLACK]
        ];
        // Where the big ring sits in each composition, the anchor the rest
        // is weighed against.
        var HERO = [[-0.55, 0.45], [0.55, 0.35], [-0.45, -0.4], [0.5, -0.45]];

        function geometry(kind, r) {
            if (kind === 'ring') return new THREE.RingGeometry(r * 0.9, r, 72);
            if (kind === 'disc') return new THREE.CircleGeometry(r, 56);
            if (kind === 'tri') return new THREE.CircleGeometry(r, 3);
            if (kind === 'square') return new THREE.PlaneGeometry(r * 2, r * 2);
            if (kind === 'bar') return new THREE.PlaneGeometry(r * 2, Math.max(0.12, r * 0.06));
            if (kind === 'arc') return new THREE.RingGeometry(r * 0.86, r, 48, 1, 0, Math.PI * 0.8);
            if (kind === 'sphere') return new THREE.SphereGeometry(r, 28, 18);
            if (kind === 'cone') return new THREE.ConeGeometry(r, r * 1.8, 3);
            return new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6);
        }

        function buildItems(halfH) {
            SPEC.forEach(function (sp, i) {
                var solid = sp[0] === 'sphere' || sp[0] === 'cone' || sp[0] === 'cube';
                var mat = solid ? new THREE.MeshLambertMaterial({ color: sp[2] }) : new THREE.MeshBasicMaterial({ color: sp[2], side: THREE.DoubleSide });
                var mesh = new THREE.Mesh(geometry(sp[0], sp[1] * halfH), mat);
                mesh.position.z = solid ? 1 : -i * 0.02;
                stage.add(mesh);
                items.push({ mesh: mesh, kind: sp[0], solid: solid, phase: i * 1.7, orbit: 0.012 + (i % 5) * 0.006, spin: (i % 2 ? 1 : -1) * (0.05 + (i % 4) * 0.04) });
            });
        }

        // Each composition: a position (normalised -1..1), a turn and a scale
        // per element; the big ring anchors it, the bars cut diagonals.
        function buildComps() {
            for (var c = 0; c < N_COMP; c++) {
                var r = rng(1919 + c * 97), lay = [], diag = (r() - 0.5) * 1.6;
                SPEC.forEach(function (sp, i) {
                    var x = (r() * 2 - 1) * 0.92, y = (r() * 2 - 1) * 0.85;
                    if (i === 0) { x = HERO[c][0]; y = HERO[c][1]; }
                    else if (i < 4) { x = HERO[c][0] + (r() - 0.5) * 0.25; y = HERO[c][1] + (r() - 0.5) * 0.25; }
                    var rot = sp[0] === 'bar' ? diag + (r() - 0.5) * 0.5 : r() * Math.PI * 2;
                    lay.push({ x: x, y: y, rot: rot, s: 0.8 + r() * 0.5 });
                });
                comps.push(lay);
            }
        }

        // Thin black lines tie neighbours together, as in the paintings.
        function buildLines() {
            for (var i = 0; i < SPEC.length; i += 2) links.push([i, (i + 5) % SPEC.length]);
            for (var j = 1; j < 9; j += 3) links.push([j, (j + 11) % SPEC.length]);
            linePos = new Float32Array(links.length * 6);
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
            lineMat = new THREE.LineBasicMaterial({ color: BLACK, transparent: true, opacity: 0.55 });
            lines = new THREE.LineSegments(g, lineMat);
            lines.position.z = -1;
            stage.add(lines);
        }

        // Wild mode's kaleidoscope: two more copies of the stage, turned a
        // third of a circle and mirrored, sharing geometry and materials.
        function buildMirrors() {
            for (var k = 1; k < 3; k++) {
                var m = stage.clone();
                m.rotation.z = k * Math.PI * 2 / 3;
                m.scale.x = -1;
                m.visible = false;
                scene.add(m);
                mirrors.push(m);
            }
        }

        function halfSize() {
            var h = Math.tan(camera.fov * Math.PI / 360) * camera.position.z;
            return { h: h, w: h * camera.aspect };
        }

        function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

        function place(t, dt) {
            var hs = halfSize(), A = comps[comp], B = comps[(comp + 1) % N_COMP];
            var f = compT > HOLD ? ease(Math.min(1, (compT - HOLD) / MOVE)) : 0, w = wildAmt;
            items.forEach(function (it, i) {
                var a = A[i], b = B[i], x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
                x += Math.cos(t * 0.3 + it.phase) * it.orbit * 4; y += Math.sin(t * 0.37 + it.phase) * it.orbit * 4;
                if (w > 0) {
                    // The ballet: everything wheels round the centre, in and out.
                    var ang = Math.atan2(y, x) + t * (1.2 + (i % 3) * 0.5) * w, rad = Math.hypot(x, y) * (1 + 0.35 * Math.sin(t * 3 + i) * w);
                    x = Math.cos(ang) * rad; y = Math.sin(ang) * rad;
                }
                var m = it.mesh;
                m.position.x = x * hs.w; m.position.y = y * hs.h;
                m.rotation.z = a.rot + (b.rot - a.rot) * f + t * it.spin * (1 + w * 14);
                if (it.solid) { m.rotation.x = t * (0.4 + w * 4); m.rotation.y = t * (0.3 + w * 5); }
                else m.rotation.y = w * t * (i % 2 ? 3 : -3);
                m.scale.setScalar((a.s + (b.s - a.s) * f) * (1 + 0.2 * w * Math.sin(t * 6 + i)));
            });
            compT += dt * (1 + kick * 6);
            if (compT > HOLD + MOVE) { compT = 0; comp = (comp + 1) % N_COMP; }
        }

        function updateLines() {
            links.forEach(function (l, k) {
                var a = items[l[0]].mesh.position, b = items[l[1]].mesh.position, o = k * 6;
                linePos[o] = a.x; linePos[o + 1] = a.y; linePos[o + 2] = 0;
                linePos[o + 3] = b.x; linePos[o + 4] = b.y; linePos[o + 5] = 0;
            });
            lines.geometry.attributes.position.needsUpdate = true;
        }

        // The clones copy the stage's transforms; they only show in wild mode.
        function syncMirrors(t) {
            mirrors.forEach(function (m, k) {
                m.visible = wildAmt > 0.02;
                if (!m.visible) return;
                m.rotation.z = (k + 1) * Math.PI * 2 / 3 + t * 0.4 * wildAmt;
                for (var i = 0; i < stage.children.length; i++) {
                    var src = stage.children[i], dst = m.children[i];
                    dst.position.copy(src.position); dst.rotation.copy(src.rotation); dst.scale.copy(src.scale);
                }
            });
            stage.rotation.z = -t * 0.25 * wildAmt;
        }

        var bgCream = new THREE.Color(CREAM), bgBlack = new THREE.Color(BLACK);

        function animate() {
            requestAnimationFrame(animate);
            var dt = Math.min(clock.getDelta(), 0.1), t = clock.getElapsedTime();
            wildAmt += ((_wild ? 1 : 0) - wildAmt) * Math.min(1, dt * 2.5);
            kick = Math.max(0, kick - dt * 1.5);
            place(t, dt);
            updateLines();
            syncMirrors(t);
            scene.background.copy(bgCream).lerp(bgBlack, wildAmt * 0.92);
            lineMat.color.setHex(wildAmt > 0.5 ? CREAM : BLACK);
            camera.rotation.z = Math.sin(t * 0.7) * 0.15 * wildAmt;
            renderer.render(scene, camera);
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        function initThree() {
            var canvas = document.getElementById('three-canvas');
            if (!canvas || typeof THREE === 'undefined') return false;
            scene = new THREE.Scene();
            scene.background = new THREE.Color(CREAM);
            camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
            camera.position.set(0, 0, 40);
            renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            clock = new THREE.Clock();
            scene.add(new THREE.AmbientLight(0xffffff, 0.7));
            var sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(-10, 14, 20); scene.add(sun);
            stage = new THREE.Group(); scene.add(stage);
            buildItems(halfSize().h);
            buildComps();
            buildLines();
            buildMirrors();
            window.addEventListener('resize', onResize);
            animate();
            return true;
        }

        initThree();

        // ---------------------------------------------------------------
        // Page effects
        // ---------------------------------------------------------------

        var COLORS = ['#d62d20', '#f2b705', '#1f4e9c'];

        function el(css, cls) {
            var d = document.createElement('div');
            if (cls) d.className = cls;
            d.style.cssText = css;
            document.body.appendChild(d);
            return d;
        }

        // Colour blocks wipe across the page, one primary after another.
        function wipe(n, dur) {
            for (var i = 0; i < n; i++) {
                (function (i) {
                    var d = el('background:' + COLORS[i % 3] + ';left:' + (i * 33) + 'vw;transition:transform ' + dur + 's cubic-bezier(0.7,0,0.3,1) ' + (i * 0.06) + 's', 'bh-wipe');
                    d.style.transform = 'translateY(-101%)';
                    requestAnimationFrame(function () { d.style.transform = 'translateY(101%)'; });
                    setTimeout(function () { d.remove(); }, (dur + i * 0.06) * 1000 + 80);
                })(i);
            }
        }

        // Four shapes slide in from off-screen to pin the opened sheet's
        // corners. They live in a fixed layer above the modal (the sheet
        // itself scrolls and would clip them), placed from its layout box,
        // which ignores the sheet's own fly-in transform.
        var FRAME = [
            { w: 64, h: 64, css: 'border-radius:50%;background:#d62d20;border:4px solid #141210;', at: function (b) { return [b.r - 34, b.t - 30]; }, from: 'translate(60vw,-40vh) rotate(180deg)' },
            { w: 70, h: 62, css: 'background:#f2b705;clip-path:polygon(50% 0,100% 100%,0 100%);', at: function (b) { return [b.l - 34, b.b - 40]; }, from: 'translate(-60vw,40vh) rotate(-240deg)' },
            { w: 46, h: 46, css: 'background:#1f4e9c;border:4px solid #141210;', at: function (b) { return [b.r - 22, b.t + (b.b - b.t) * 0.55]; }, from: 'translate(70vw,0) rotate(135deg)' },
            { w: 0, h: 10, css: 'background:#141210;', at: function (b) { return [b.l + (b.r - b.l) * 0.1, b.t - 16]; }, from: 'translate(0,-60vh)' }
        ];
        var framed = null;

        function box(inner) {
            var m = inner.offsetParent, sx = m ? m.scrollLeft : 0, sy = m ? m.scrollTop : 0;
            var l = inner.offsetLeft - sx, t = inner.offsetTop - sy;
            return { l: l, t: t, r: l + inner.offsetWidth, b: t + inner.offsetHeight };
        }

        function placeFrame() {
            if (!framed) return;
            var b = box(framed.inner);
            framed.shapes.forEach(function (d, i) {
                var f = FRAME[i], p = f.at(b);
                d.style.left = p[0] + 'px'; d.style.top = p[1] + 'px';
                if (!f.w) d.style.width = ((b.r - b.l) * 0.42) + 'px';
            });
        }

        function frameShapes(inner) {
            clearFrame(true);
            framed = { inner: inner, shapes: [] };
            FRAME.forEach(function (f, i) {
                var d = el('position:fixed;width:' + f.w + 'px;height:' + f.h + 'px;' + f.css + 'transform:' + f.from + ';opacity:0;transition-delay:' + (0.1 + i * 0.07) + 's;', 'bh-frame-shape');
                d.setAttribute('data-from', f.from);
                framed.shapes.push(d);
            });
            placeFrame();
            requestAnimationFrame(function () { requestAnimationFrame(function () {
                if (framed) framed.shapes.forEach(function (d) { d.style.transform = 'none'; d.style.opacity = '1'; });
            }); });
        }

        function clearFrame(now) {
            if (!framed) return;
            framed.shapes.forEach(function (d) {
                if (now) { d.remove(); return; }
                d.style.transitionDelay = '0s';
                d.style.transform = d.getAttribute('data-from');
                d.style.opacity = '0';
                setTimeout(function () { d.remove(); }, 520);
            });
            framed = null;
        }

        window.addEventListener('resize', placeFrame);

        // A black ring with primary quarters spins open where the eye goes.
        function spinCircle(x, y, size) {
            var d = el('left:' + (x - size / 2) + 'px;top:' + (y - size / 2) + 'px;width:' + size + 'px;height:' + size + 'px;' +
                'transform:rotate(0) scale(0.3);opacity:0.95;transition:transform 0.55s cubic-bezier(0.22,1,0.36,1),opacity 0.55s ease', 'bh-spin');
            requestAnimationFrame(function () { requestAnimationFrame(function () { d.style.transform = 'rotate(' + (_wild ? 540 : 270) + 'deg) scale(1.15)'; d.style.opacity = '0'; }); });
            setTimeout(function () { d.remove(); }, 640);
        }

        window.snonuxOpenEffect = function (post) {
            var modal = document.getElementById('post-modal'), inner = modal && modal.querySelector('.modal-inner');
            if (modal) { modal.classList.add('sno-modal-fly'); setTimeout(function () { modal.classList.remove('sno-modal-fly'); }, 400); }
            if (inner) frameShapes(inner);
            kick = 1;
        };
        window.snonuxCloseEffect = function () {
            clearFrame(false);
            wipe(1, 0.35);
        };
        window.snonuxScrollEffect = function (dir) {
            var down = dir === 'down', h = _wild ? 26 : 12;
            var d = el('position:fixed;left:0;right:0;height:' + h + 'px;z-index:9000;pointer-events:none;' + (down ? 'top:0;' : 'bottom:0;') +
                'background:linear-gradient(90deg,#141210 0 50%,#d62d20 50% 70%,#f2b705 70% 85%,#1f4e9c 85%);transition:transform 0.32s cubic-bezier(0.7,0,0.3,1),opacity 0.32s');
            requestAnimationFrame(function () { d.style.transform = down ? 'translateY(100vh)' : 'translateY(-100vh)'; d.style.opacity = '0.2'; });
            setTimeout(function () { d.remove(); }, 400);
        };
        window.snonuxNavEffect = function () {
            var p = document.querySelector('.post-active'), r = p ? p.getBoundingClientRect() : null;
            var x = r ? r.right - 30 : window.innerWidth / 2, y = r ? r.top + 30 : window.innerHeight / 2;
            spinCircle(x, y, _wild ? 220 : 120);
            kick = Math.max(kick, 0.4);
        };
        window.snonuxPageEffect = function () {
            wipe(3, 0.5);
            spinCircle(window.innerWidth / 2, window.innerHeight / 2, Math.min(window.innerWidth, window.innerHeight) * 0.6);
        };
        window.snonuxWildToggle = function () {
            _wild = !_wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', _wild);
            kick = 1;
            wipe(3, 0.6);
        };
    })();
