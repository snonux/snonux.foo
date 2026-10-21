    // Pharaoh splash: a gold-edged lapis pyramid turning under the stars
    // while a sun disc climbs behind it and sand streams past.
    (function(){
        if(document.documentElement.classList.contains('sno-splash-skip'))return;
        var cv=document.getElementById('splash-gl-canvas');
        if(!cv||typeof THREE==='undefined')return;
        var raf,ren,sc,ca,t0=performance.now(),i,N=260,arr,geo,pos;
        function cleanup(){window.removeEventListener('resize',sz);if(raf)cancelAnimationFrame(raf);raf=null;if(ren)ren.dispose();ren=null;window._snonuxSplashWebGLCleanup=null;}
        window._snonuxSplashWebGLCleanup=cleanup;
        function sz(){var w=cv.clientWidth||2,h=cv.clientHeight||2;if(ren)ren.setSize(w,h,false);if(ca){ca.aspect=w/h;ca.updateProjectionMatrix();}}
        ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});ren.setClearColor(0,0);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        sc=new THREE.Scene();ca=new THREE.PerspectiveCamera(50,1,0.1,80);ca.position.set(0,0.6,9);
        var pyr=new THREE.Group();pyr.position.y=-2.75;sc.add(pyr);
        var pg=new THREE.ConeGeometry(1.5,1.7,4,1);
        pyr.add(new THREE.Mesh(pg,new THREE.MeshBasicMaterial({color:0x1f3f8f,transparent:true,opacity:0.85})));
        pyr.add(new THREE.LineSegments(new THREE.EdgesGeometry(pg),new THREE.LineBasicMaterial({color:0xf2c14e})));
        var cap=new THREE.Mesh(new THREE.ConeGeometry(0.24,0.28,4,1),new THREE.MeshBasicMaterial({color:0xfff1b8}));cap.position.y=0.73;pyr.add(cap);
        var sun=new THREE.Mesh(new THREE.CircleGeometry(1.2,40),new THREE.MeshBasicMaterial({color:0xf2a94e,transparent:true,opacity:0.85}));
        sun.position.set(0,-4.2,-6);sc.add(sun);
        var halo=new THREE.Mesh(new THREE.CircleGeometry(2.4,40),new THREE.MeshBasicMaterial({color:0xf2c14e,transparent:true,opacity:0.16,blending:THREE.AdditiveBlending,depthWrite:false}));
        halo.position.set(0,-4.2,-6.1);sc.add(halo);
        arr=new Float32Array(N*3);for(i=0;i<N;i++){arr[i*3]=(Math.random()-0.5)*14;arr[i*3+1]=-3+Math.random()*1.6;arr[i*3+2]=(Math.random()-0.5)*4;}
        geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(arr,3));pos=geo.attributes.position;
        sc.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xead2a0,size:0.05,transparent:true,opacity:0.8,depthWrite:false})));
        sz();window.addEventListener('resize',sz);
        function loop(now){raf=requestAnimationFrame(loop);var t=(now-t0)*0.001,j;
            for(j=0;j<pos.count;j++){pos.array[j*3]+=0.02+0.01*Math.sin(j);if(pos.array[j*3]>7)pos.array[j*3]=-7;}
            pos.needsUpdate=true;pyr.rotation.y=t*0.3;
            var y=-4.2+Math.min(1,t/6)*2.4;sun.position.y=y;halo.position.y=y;halo.scale.setScalar(1+Math.sin(t*1.5)*0.06);
            cap.material.color.setHSL(0.13,1,0.75+0.2*Math.sin(t*3));ren.render(sc,ca);}
        raf=requestAnimationFrame(loop);
    })();


    // Pharaoh WebGL: a night desert. Three giant pyramids with gold
    // capstones stand on faceted dunes under a turning star dome; a sun disc
    // slowly climbs over the horizon, torches flicker at the pyramids' feet
    // and sand drifts on the wind. Wild mode: a sandstorm, the capstones
    // blaze and beams of light shoot from them into the sky.
    (function() {
        var _wild = false, wildK = 0;
        var scene, camera, renderer, clock;
        var stars, sun, sunHalo, moonLight, fog;
        var sandPts, sandPos, sandVel, SAND = 1400;
        var caps = [], beams = [], torches = [];
        var PYRAMIDS = [[-120, -330, 150], [40, -440, 210], [210, -360, 120]];

        function buildStars() {
            var n = 1600, arr = new Float32Array(n * 3);
            for (var i = 0; i < n; i++) {
                var th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.48;
                arr[i*3] = Math.cos(th) * Math.sin(ph) * 900;
                arr[i*3+1] = Math.cos(ph) * 900 - 60;
                arr[i*3+2] = Math.sin(th) * Math.sin(ph) * 900;
            }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xf6efd8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
            scene.add(stars);
        }

        function buildDunes() {
            var g = new THREE.PlaneGeometry(1600, 1000, 90, 56);
            g.rotateX(-Math.PI / 2);
            var p = g.attributes.position;
            for (var i = 0; i < p.count; i++) {
                var x = p.getX(i), z = p.getZ(i), far = Math.min(1, Math.max(0.15, -z / 500));
                p.setY(i, (Math.sin(x * 0.012 + z * 0.004) * 9 + Math.cos(z * 0.018 - x * 0.006) * 6 + Math.sin(x * 0.05) * 1.5) * far);
            }
            g.computeVertexNormals();
            var m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0xae7e46, flatShading: true, shininess: 2 }));
            m.position.z = -300;
            scene.add(m);
        }

        function buildPyramid(x, z, size) {
            var h = size, r = size * 0.78;
            var body = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4, 1), new THREE.MeshPhongMaterial({ color: 0xdcaa66, flatShading: true, shininess: 6 }));
            body.position.set(x, h / 2 - 4, z); body.rotation.y = Math.PI / 4;
            scene.add(body);
            var cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.09, h * 0.09, 4, 1), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
            cap.position.set(x, h - 4 - h * 0.045 + 0.5, z); cap.rotation.y = Math.PI / 4;
            scene.add(cap); caps.push(cap);
            // The beam waits invisible until wild mode.
            var beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 6, 900, 12, 1, true),
                new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
            beam.position.set(x, h - 4 + 450, z); beam.visible = false;
            scene.add(beam); beams.push(beam);
            var torch = new THREE.PointLight(0xff9a3c, 1.4, 220, 1.6);
            torch.position.set(x + r * 0.55, 10, z + r * 0.75);
            scene.add(torch);
            var flame = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
            flame.position.copy(torch.position);
            scene.add(flame);
            torches.push({ light: torch, flame: flame, seed: Math.random() * 10 });
        }

        function buildSun() {
            sun = new THREE.Mesh(new THREE.CircleGeometry(34, 48), new THREE.MeshBasicMaterial({ color: 0xffc46a, fog: false }));
            sun.position.set(-260, 0, -900);
            scene.add(sun);
            sunHalo = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshBasicMaterial({ color: 0xf2a94e, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
            sunHalo.position.set(-260, 0, -905);
            scene.add(sunHalo);
        }

        function resetGrain(i, anywhere) {
            sandPos[i*3] = anywhere ? (Math.random() - 0.5) * 700 : -350;
            sandPos[i*3+1] = Math.random() * 70;
            sandPos[i*3+2] = -450 + Math.random() * 480;
            sandVel[i] = 0.4 + Math.random() * 0.8;
        }

        function buildSand() {
            sandPos = new Float32Array(SAND * 3); sandVel = new Float32Array(SAND);
            for (var i = 0; i < SAND; i++) resetGrain(i, true);
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(sandPos, 3));
            sandPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe0c48e, size: 0.7, transparent: true, opacity: 0.5, depthWrite: false }));
            scene.add(sandPts);
        }

        function initThree() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x070d24);
            fog = new THREE.FogExp2(0x0b1534, 0.0011);
            scene.fog = fog;
            camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 2000);
            camera.position.set(0, 34, 150);
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
            clock = new THREE.Clock();
            scene.add(new THREE.AmbientLight(0x4a5c96, 1.0));
            scene.add(new THREE.HemisphereLight(0x3a5aa8, 0x6a4a28, 0.5));
            moonLight = new THREE.DirectionalLight(0xc8d4ff, 0.55);
            moonLight.position.set(-200, 160, -300);
            scene.add(moonLight);
            buildStars(); buildDunes(); buildSun(); buildSand();
            PYRAMIDS.forEach(function (p) { buildPyramid(p[0], p[1], p[2]); });
            window.addEventListener('resize', onResize);
            animate();
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // The sun climbs out of the dunes over a few minutes and sinks again.
        function moveSky(t, dt) {
            var y = 60 + 110 * Math.sin(t * 0.01 - Math.PI / 2);
            sun.position.y = y; sunHalo.position.y = y;
            sunHalo.scale.setScalar(1 + Math.sin(t * 0.8) * 0.05 + wildK * 0.4);
            moonLight.intensity = 0.6 + Math.max(0, y) / 300;
            stars.rotation.y += dt * (0.004 + wildK * 0.05);
            stars.material.opacity = 0.85 - wildK * 0.6;
        }

        function moveSand(dt) {
            var speed = (30 + wildK * 260) * dt, lift = wildK * 12 * dt;
            for (var i = 0; i < SAND; i++) {
                sandPos[i*3] += sandVel[i] * speed;
                sandPos[i*3+1] += Math.sin(sandPos[i*3] * 0.05 + i) * 0.05 + lift * (sandVel[i] - 0.8);
                if (sandPos[i*3] > 350 || sandPos[i*3+1] < -5 || sandPos[i*3+1] > 120) resetGrain(i, false);
            }
            sandPts.geometry.attributes.position.needsUpdate = true;
            sandPts.material.size = 0.7 + wildK * 0.9;
            sandPts.material.opacity = 0.5 + wildK * 0.4;
        }

        // Wild: capstones blaze and pulse, beams rise from them, torches roar.
        function moveFire(t) {
            caps.forEach(function (c, i) {
                var k = 1 + wildK * (0.8 + 0.4 * Math.sin(t * 6 + i));
                c.scale.setScalar(k);
                c.material.color.setRGB(0.95 + 0.05 * wildK, 0.76 + 0.2 * wildK * Math.abs(Math.sin(t * 4 + i)), 0.31 + 0.5 * wildK);
            });
            beams.forEach(function (b, i) {
                b.visible = wildK > 0.02;
                b.material.opacity = wildK * (0.35 + 0.2 * Math.sin(t * 9 + i * 2));
                b.scale.x = b.scale.z = 1 + 0.3 * Math.sin(t * 5 + i);
            });
            torches.forEach(function (o) {
                var f = 0.8 + 0.2 * Math.sin(t * 13 + o.seed) + 0.1 * Math.sin(t * 31 + o.seed * 2);
                o.light.intensity = f * (1.4 + wildK * 2.2);
                o.flame.scale.set(f, f * (1.3 + wildK), f);
            });
        }

        function animate() {
            requestAnimationFrame(animate);
            var dt = Math.min(0.05, clock.getDelta()), t = clock.getElapsedTime();
            wildK += ((_wild ? 1 : 0) - wildK) * Math.min(1, dt * 2.5);
            moveSky(t, dt);
            moveSand(dt);
            moveFire(t);
            fog.density = 0.0011 + wildK * 0.0032;
            fog.color.setRGB(0.043 + wildK * 0.36, 0.082 + wildK * 0.22, 0.2 - wildK * 0.08);
            var shake = wildK * 0.8;
            camera.position.x = Math.sin(t * 0.05) * 24 + (Math.random() - 0.5) * shake;
            camera.position.y = 34 + Math.sin(t * 0.07) * 4 + (Math.random() - 0.5) * shake;
            camera.lookAt(20, 50 + wildK * 30, -300);
            renderer.render(scene, camera);
        }

        initThree();

        // --- Tomb sounds: one lazy AudioContext for every effect ---
        var fxCtx = null;
        function audio() {
            try { if (!fxCtx) fxCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
            if (fxCtx.state === 'suspended') fxCtx.resume();
            return fxCtx;
        }

        function noiseBuffer(ctx, dur) {
            var buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = buf.getChannelData(0);
            for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            return buf;
        }

        // Filtered noise: stone grinding (low) or sand hiss (high).
        function grind(dur, f0, f1, vol, type) {
            var ctx = audio();
            if (!ctx) return;
            var src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), now = ctx.currentTime;
            src.buffer = noiseBuffer(ctx, dur);
            flt.type = type || 'lowpass'; flt.Q.value = 2;
            flt.frequency.setValueAtTime(f0, now); flt.frequency.exponentialRampToValueAtTime(f1, now + dur);
            g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(vol, now + 0.05); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
            src.connect(flt); flt.connect(g); g.connect(ctx.destination);
            src.start(now); src.stop(now + dur + 0.02);
        }

        // A ney note: a breathy sine with vibrato.
        function ney(ctx, freq, at, dur, vol) {
            var o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            lfo.frequency.value = 5.2; lg.gain.value = freq * 0.012;
            lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(ctx.destination);
            g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.08); g.gain.setValueAtTime(vol, at + dur - 0.1); g.gain.linearRampToValueAtTime(0, at + dur);
            o.start(at); lfo.start(at); o.stop(at + dur + 0.02); lfo.stop(at + dur + 0.02);
        }

        // Splash: a temple gong under a short Hijaz phrase on the ney.
        window.snonuxSplashSound = function(ctx) {
            var now = ctx.currentTime, g = ctx.createGain(), o = ctx.createOscillator();
            o.type = 'sine'; o.frequency.setValueAtTime(98, now); o.frequency.exponentialRampToValueAtTime(92, now + 2);
            g.gain.setValueAtTime(0.16, now); g.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
            o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 2.3);
            [[329.63, 0.15, 0.2], [349.23, 0.37, 0.2], [415.3, 0.59, 0.3], [440, 0.91, 0.55]].forEach(function (n) { ney(ctx, n[0], now + n[1], n[2], 0.07); });
            return true;
        };

        // --- Page effects ---

        function el(cls, css) {
            var d = document.createElement('div');
            d.className = cls;
            if (css) d.style.cssText = css;
            document.body.appendChild(d);
            return d;
        }

        // Two stone doors; open=true starts them shut and slides them apart.
        function doors(open) {
            var l = el('pharaoh-door left'), r = el('pharaoh-door right');
            if (!open) { l.style.transform = 'translateX(-101%)'; r.style.transform = 'translateX(101%)'; }
            requestAnimationFrame(function () { requestAnimationFrame(function () {
                l.style.transform = open ? 'translateX(-101%)' : 'translateX(0)';
                r.style.transform = open ? 'translateX(101%)' : 'translateX(0)';
            }); });
            setTimeout(function () {
                if (!open) { l.style.transition = r.style.transition = 'opacity 0.25s'; l.style.opacity = r.style.opacity = '0'; }
            }, 430);
            setTimeout(function () { l.remove(); r.remove(); }, open ? 480 : 720);
            grind(0.45, open ? 220 : 380, open ? 90 : 120, 0.16);
        }

        function glint() {
            var g = el('pharaoh-glint');
            requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transform = 'translateX(160vw)'; }); });
            setTimeout(function () { g.remove(); }, 760);
        }

        window.snonuxOpenEffect = function() {
            doors(true);
            glint();
        };
        window.snonuxCloseEffect = function() { doors(false); };

        // Sand pours in from the edge the selection moves toward.
        window.snonuxScrollEffect = function(dir) {
            var n = _wild ? 46 : 22, down = dir === 'down', x0 = window.innerWidth * (0.2 + Math.random() * 0.6);
            for (var i = 0; i < n; i++) {
                var gr = el('pharaoh-grain', 'left:' + (x0 + (Math.random() - 0.5) * 80) + 'px;top:' + (down ? -6 : window.innerHeight + 6) + 'px;' +
                    'transition:transform ' + (0.5 + Math.random() * 0.4) + 's cubic-bezier(0.5,0,1,1),opacity 0.9s;opacity:0.9');
                (function (g, dx, dy) {
                    requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; g.style.opacity = '0'; }); });
                    setTimeout(function () { g.remove(); }, 960);
                })(gr, (Math.random() - 0.5) * 120, (down ? 1 : -1) * window.innerHeight * (0.4 + Math.random() * 0.5));
            }
            grind(0.35, 5200, 2600, 0.04, 'bandpass');
        };

        // A scarab scuttles across the foot of the page.
        window.snonuxNavEffect = function() {
            var s = el('pharaoh-scarab'), right = Math.random() < 0.5, y = window.innerHeight - 40 - Math.random() * 60;
            s.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26"><g stroke="#1a1208" stroke-width="1.6"><path d="M5 9l-4-2M5 13H0M5 17l-4 2M21 9l4-2M21 13h5M21 17l4 2"/></g><ellipse cx="13" cy="15" rx="8" ry="9" fill="#3cc8b4" stroke="#1f3f8f" stroke-width="1.5"/><path d="M13 7v17" stroke="#1f3f8f" stroke-width="1.4"/><circle cx="13" cy="5" r="3.4" fill="#f2c14e"/></svg>';
            s.style.cssText = 'top:' + y + 'px;left:' + (right ? -30 : window.innerWidth + 4) + 'px;transform:rotate(' + (right ? 90 : -90) + 'deg);transition:left 0.9s linear';
            requestAnimationFrame(function () { requestAnimationFrame(function () { s.style.left = (right ? window.innerWidth + 4 : -30) + 'px'; }); });
            setTimeout(function () { s.remove(); }, 960);
            grind(0.12, 3000, 1800, 0.05, 'bandpass');
        };

        window.snonuxPageEffect = function() {
            glint();
            var ov = document.querySelector('.overlay');
            if (ov) { ov.classList.add('sno-fx-zoom'); setTimeout(function () { ov.classList.remove('sno-fx-zoom'); }, 330); }
        };

        window.snonuxWildToggle = function() {
            _wild = !_wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', _wild);
            if (_wild) grind(1.4, 600, 3000, 0.12, 'bandpass');
        };
    })();
