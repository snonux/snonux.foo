    // Western splash: a turning brass sheriff's star in warm low light with
    // dust drifting through the beam.
    (function(){
        if(document.documentElement.classList.contains('sno-splash-skip'))return;
        var cv=document.getElementById('splash-gl-canvas');
        if(!cv||typeof THREE==='undefined')return;
        var raf,ren,sc,ca,star=new THREE.Group(),t0=performance.now(),N=220,i,arr,geo,pos;
        function cleanup(){window.removeEventListener('resize',sz);if(raf)cancelAnimationFrame(raf);raf=null;if(ren)ren.dispose();ren=null;window._snonuxSplashWebGLCleanup=null;}
        window._snonuxSplashWebGLCleanup=cleanup;
        function sz(){var w=cv.clientWidth||2,h=cv.clientHeight||2;if(ren)ren.setSize(w,h,false);if(ca){ca.aspect=w/h;ca.updateProjectionMatrix();if(star.parent)place();}}
        ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});ren.setClearColor(0,0);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        sc=new THREE.Scene();ca=new THREE.PerspectiveCamera(45,1,0.1,60);ca.position.set(0,0,9);
        // Six points with a ball on each tip, extruded with a bevel.
        var sh=new THREE.Shape(),k,a,r;
        for(k=0;k<12;k++){a=Math.PI/2+k*Math.PI/6;r=k%2?0.95:2;if(k)sh.lineTo(Math.cos(a)*r,Math.sin(a)*r);else sh.moveTo(Math.cos(a)*r,Math.sin(a)*r);}
        var brass=new THREE.MeshStandardMaterial({color:0xd9a441,metalness:0.85,roughness:0.32,emissive:0x3a2208});
        star.add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:0.25,bevelEnabled:true,bevelSize:0.08,bevelThickness:0.08,bevelSegments:2}),brass));
        for(k=0;k<6;k++){a=Math.PI/2+k*Math.PI/3;var ball=new THREE.Mesh(new THREE.SphereGeometry(0.2,14,10),brass);ball.position.set(Math.cos(a)*2.05,Math.sin(a)*2.05,0.12);star.add(ball);}
        var boss=new THREE.Mesh(new THREE.CylinderGeometry(0.62,0.62,0.18,28),new THREE.MeshStandardMaterial({color:0xb8862f,metalness:0.9,roughness:0.45}));
        boss.rotation.x=Math.PI/2;boss.position.z=0.3;star.add(boss);
        // Two stars flank the notice on a wide screen; one hangs above it on a tall one.
        var star2=star.clone();sc.add(star);sc.add(star2);
        function place(){var wide=ca.aspect>1.15,hh=Math.tan(Math.PI/8)*9;
            star.position.set(wide?-hh*ca.aspect*0.66:0,wide?0.2:hh-1.15,0);star.scale.setScalar(wide?0.75:0.45);
            star2.visible=wide;star2.position.set(hh*ca.aspect*0.66,0.2,0);star2.scale.setScalar(0.75);}
        sc.add(new THREE.AmbientLight(0x5a3a20,0.9));
        var key=new THREE.PointLight(0xffd090,2.2,30);key.position.set(3,3,6);sc.add(key);
        var rim=new THREE.PointLight(0xff7a30,1.4,30);rim.position.set(-4,-2,3);sc.add(rim);
        arr=new Float32Array(N*3);for(i=0;i<N;i++){arr[i*3]=(Math.random()-0.5)*14;arr[i*3+1]=(Math.random()-0.5)*8;arr[i*3+2]=(Math.random()-0.5)*4;}
        geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(arr,3));
        sc.add(new THREE.Points(geo,new THREE.PointsMaterial({color:0xe8c890,size:0.05,transparent:true,opacity:0.7,depthWrite:false})));
        pos=geo.attributes.position;sz();window.addEventListener('resize',sz);
        function loop(now){raf=requestAnimationFrame(loop);var t=(now-t0)*0.001,j;
            for(j=0;j<pos.count;j++){pos.array[j*3]+=0.006+Math.sin(t+j)*0.002;pos.array[j*3+1]+=Math.sin(t*0.7+j*1.3)*0.002;if(pos.array[j*3]>7)pos.array[j*3]=-7;}
            pos.needsUpdate=true;star.rotation.y=Math.sin(t*0.6)*0.9;star.rotation.z=Math.sin(t*0.4)*0.08;star2.rotation.y=-star.rotation.y;star2.rotation.z=-star.rotation.z;key.position.x=3+Math.sin(t*0.8)*2;ren.render(sc,ca);}
        raf=requestAnimationFrame(loop);
    })();


    // Western backdrop: a desert at dusk under a huge low sun. Mesas and
    // saguaros stand in sepia haze, a steam train crosses a trestle far off
    // trailing smoke, tumbleweeds roll by and dust hangs in the air. Wild
    // mode is a stampede in a dust storm under a blood-red sky.
    (function() {
        var canvas = document.getElementById('three-canvas');
        if (!canvas || typeof THREE === 'undefined') return;
        var _wild = false, wildK = 0;
        var N_DUST = 1400, N_PUFF = 36, N_WEED = 24, N_HERD = 22;
        var scene, camera, renderer, clock, skyMat, sun, sunGlow, dust, dustPos, dustVel, train, puffs = [], weeds = [], herd = [];
        var COL = {
            top: new THREE.Color(0x2b1a10), mid: new THREE.Color(0x9a5426), low: new THREE.Color(0xf0b060),
            wTop: new THREE.Color(0x1a0503), wMid: new THREE.Color(0x7a1208), wLow: new THREE.Color(0xd8401c),
            fog: new THREE.Color(0xb27a46), wFog: new THREE.Color(0x8a2a12)
        };

        // A soft round sprite texture for smoke, dust and the sun's glow.
        function softTexture(inner, outer) {
            var c = document.createElement('canvas'); c.width = c.height = 64;
            var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            gr.addColorStop(0, inner); gr.addColorStop(1, outer);
            g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(c);
        }

        function buildSky() {
            skyMat = new THREE.ShaderMaterial({
                uniforms: { top: { value: COL.top.clone() }, mid: { value: COL.mid.clone() }, low: { value: COL.low.clone() } },
                vertexShader: 'varying float vy; void main(){ vy = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
                fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying float vy;' +
                    'void main(){ vec3 c = vy > 0.45 ? mix(mid, top, smoothstep(0.45, 1.0, vy)) : mix(low, mid, smoothstep(0.0, 0.45, vy)); gl_FragColor = vec4(c, 1.0); }',
                depthWrite: false, fog: false
            });
            var sky = new THREE.Mesh(new THREE.PlaneGeometry(1400, 420), skyMat);
            sky.position.set(0, 150, -260);
            scene.add(sky);
            sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture('rgba(255,210,120,0.75)', 'rgba(255,140,40,0)'), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
            sunGlow.scale.set(170, 170, 1); sunGlow.position.set(38, 16, -256);
            scene.add(sunGlow);
            sun = new THREE.Mesh(new THREE.CircleGeometry(34, 48), new THREE.MeshBasicMaterial({ color: 0xf6cf73, fog: false }));
            sun.position.set(38, 16, -249);
            scene.add(sun);
        }

        function buildLand() {
            var ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 420), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
            ground.rotation.x = -Math.PI / 2; ground.position.z = -150;
            scene.add(ground);
            var rock = new THREE.MeshLambertMaterial({ color: 0x4a2a16 });
            // Flat-topped mesas and buttes along the horizon.
            [[-165, -200, 46, 30], [-95, -215, 30, 22], [-42, -190, 18, 34], [118, -205, 40, 26], [185, -195, 54, 20], [250, -220, 30, 38], [-245, -210, 40, 26]].forEach(function (m) {
                var mesa = new THREE.Mesh(new THREE.CylinderGeometry(m[2] * 0.8, m[2], m[3], 7), rock);
                mesa.position.set(m[0], m[3] / 2, m[1]); mesa.scale.z = 0.4;
                scene.add(mesa);
            });
            var green = new THREE.MeshLambertMaterial({ color: 0x2a1a0e });
            for (var i = 0; i < 16; i++) scene.add(saguaro(green, (i - 8) * 22 + Math.sin(i * 7.3) * 8, -26 - (i * 37 % 70), 2.4 + (i * 13 % 5) * 0.5));
            // Big saguaros close by frame the view.
            [[-30, -16, 9], [-19, -34, 5.5], [27, -26, 7], [34, -10, 10.5]].forEach(function (c) { scene.add(saguaro(green, c[0], c[1], c[2])); });
            var stone = new THREE.DodecahedronGeometry(1, 0);
            for (i = 0; i < 22; i++) {
                var r = new THREE.Mesh(stone, rock), k = 0.4 + (i * 17 % 7) * 0.2;
                r.position.set(Math.sin(i * 12.9) * 55, k * 0.3, -6 - (i * 29 % 80));
                r.scale.set(k * 1.4, k * 0.7, k); r.rotation.y = i;
                scene.add(r);
            }
        }

        function saguaro(mat, x, z, h) {
            var g = new THREE.Group(), w = h * 0.09;
            var trunk = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 1.1, h, 7), mat);
            trunk.position.y = h / 2; g.add(trunk);
            [-1, 1].forEach(function (side, k) {
                var y = h * (0.35 + k * 0.15), arm = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.75, w * 0.75, h * 0.32, 6), mat);
                var elbow = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.75, w * 0.75, h * 0.24, 6), mat);
                elbow.rotation.z = Math.PI / 2; elbow.position.set(side * h * 0.12, y, 0);
                arm.position.set(side * h * 0.23, y + h * 0.15, 0);
                g.add(elbow); g.add(arm);
            });
            g.position.set(x, 0, z);
            return g;
        }

        // The trestle over a dry wash and the train that crosses it.
        function buildTrestle() {
            var wood = new THREE.MeshLambertMaterial({ color: 0x3b2312 });
            var deck = new THREE.Mesh(new THREE.BoxGeometry(260, 0.8, 2), wood);
            deck.position.set(0, 9, -120); scene.add(deck);
            var pts = [];
            for (var x = -130; x <= 130; x += 10) {
                pts.push(x, 9, -120, x, 0, -120, x, 9, -120, x + 10, 0, -120, x + 10, 9, -120, x, 0, -120);
            }
            var lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3b2312 })));
            train = new THREE.Group();
            var iron = new THREE.MeshLambertMaterial({ color: 0x1c120c });
            var boiler = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 7, 12), iron);
            boiler.rotation.z = Math.PI / 2; boiler.position.set(0, 11.3, 0); train.add(boiler);
            addBox(train, iron, [3, 3.6, 2.6], [-4.5, 12.1, 0]);
            addBox(train, iron, [0.9, 2.4, 0.9], [2.6, 13.6, 0]).name = 'stack';
            for (var c = 1; c <= 5; c++) addBox(train, iron, [7, 3, 2.4], [-4.5 - c * 8, 11.8, 0]);
            train.position.set(-160, 0, -120);
            scene.add(train);
        }

        function addBox(group, mat, size, at) {
            var m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
            m.position.set(at[0], at[1], at[2]); group.add(m);
            return m;
        }

        function buildPuffs() {
            var tex = softTexture('rgba(235,222,195,0.9)', 'rgba(235,222,195,0)');
            for (var i = 0; i < N_PUFF; i++) {
                var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
                sp.userData = { life: i / N_PUFF * 3, max: 3 };
                scene.add(sp); puffs.push(sp);
            }
        }

        // Tumbleweeds are scraggly wire balls; only a few roll until wild.
        function buildWeeds() {
            var geo = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1));
            var mat = new THREE.LineBasicMaterial({ color: 0x9a7444 });
            for (var i = 0; i < N_WEED; i++) {
                var w = new THREE.LineSegments(geo, mat), r = 0.7 + Math.random() * 0.8;
                w.scale.setScalar(r);
                w.userData = { r: r, sp: 6 + Math.random() * 6, ph: Math.random() * 6, on: i < 5 };
                resetWeed(w, true);
                scene.add(w); weeds.push(w);
            }
        }

        function resetWeed(w, anywhere) {
            w.position.set(anywhere ? -60 + Math.random() * 120 : -70 - Math.random() * 30, w.userData.r, -8 - Math.random() * 40);
            w.visible = w.userData.on || _wild;
        }

        function buildHerd() {
            var hide = new THREE.MeshLambertMaterial({ color: 0x1e120a });
            for (var i = 0; i < N_HERD; i++) {
                var b = new THREE.Group();
                addBox(b, hide, [2.6, 1.3, 1], [0, 1.6, 0]);
                addBox(b, hide, [0.9, 0.8, 0.7], [1.6, 1.8, 0]);
                addBox(b, hide, [0.15, 0.15, 1.3], [1.7, 2.25, 0]);
                addBox(b, hide, [0.3, 1.1, 0.3], [-0.9, 0.55, 0]).name = 'legA';
                addBox(b, hide, [0.3, 1.1, 0.3], [0.9, 0.55, 0]).name = 'legB';
                b.userData = { sp: 18 + Math.random() * 8, ph: Math.random() * 6 };
                b.position.set(-80 + Math.random() * 160, 0, -18 - Math.random() * 30);
                b.scale.setScalar(1.5);
                b.visible = false;
                scene.add(b); herd.push(b);
            }
        }

        function buildDust() {
            dustPos = new Float32Array(N_DUST * 3); dustVel = new Float32Array(N_DUST);
            for (var i = 0; i < N_DUST; i++) {
                dustPos[i * 3] = (Math.random() - 0.5) * 120; dustPos[i * 3 + 1] = Math.random() * 30; dustPos[i * 3 + 2] = -Math.random() * 70 + 10;
                dustVel[i] = 0.5 + Math.random();
            }
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
            dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe0c08a, size: 0.22, transparent: true, opacity: 0.5, depthWrite: false }));
            scene.add(dust);
        }

        function initThree() {
            scene = new THREE.Scene();
            scene.fog = new THREE.Fog(COL.fog.clone(), 60, 260);
            camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 400);
            camera.position.set(0, 5, 30); camera.lookAt(0, 9, -100);
            renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
            clock = new THREE.Clock();
            scene.add(new THREE.HemisphereLight(0xffc888, 0x3a2010, 0.85));
            var low = new THREE.DirectionalLight(0xffa050, 0.8); low.position.set(20, 8, -100); scene.add(low);
            buildSky(); buildLand(); buildTrestle(); buildPuffs(); buildWeeds(); buildHerd(); buildDust();
            window.addEventListener('resize', onResize);
            requestAnimationFrame(animate);
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // Sky, fog and sun ease between dusk and the blood-red storm.
        function updateMood(dt) {
            wildK += ((_wild ? 1 : 0) - wildK) * Math.min(1, dt * 1.5);
            skyMat.uniforms.top.value.copy(COL.top).lerp(COL.wTop, wildK);
            skyMat.uniforms.mid.value.copy(COL.mid).lerp(COL.wMid, wildK);
            skyMat.uniforms.low.value.copy(COL.low).lerp(COL.wLow, wildK);
            scene.fog.color.copy(COL.fog).lerp(COL.wFog, wildK);
            scene.fog.near = 60 - wildK * 50; scene.fog.far = 260 - wildK * 150;
            sun.material.color.setRGB(0.96, 0.81 - wildK * 0.55, 0.45 - wildK * 0.35);
            sun.scale.setScalar(1 + wildK * 0.35);
            dust.material.opacity = 0.5 + wildK * 0.4;
            dust.material.size = 0.22 + wildK * 0.25;
        }

        function updateTrain(dt, t) {
            train.position.x += dt * (8 + wildK * 10);
            if (train.position.x > 190) train.position.x = -190;
            var stack = train.getObjectByName('stack');
            puffs.forEach(function (p) {
                var u = p.userData;
                u.life += dt;
                if (u.life >= u.max) { u.life = 0; p.position.set(train.position.x + stack.position.x, 15, -120); }
                var k = u.life / u.max;
                p.position.x -= dt * (3 + wildK * 6); p.position.y += dt * 2.2;
                p.scale.setScalar(2 + k * 9);
                p.material.opacity = 0.55 * (1 - k);
            });
        }

        function updateWeeds(dt, t) {
            weeds.forEach(function (w) {
                var u = w.userData;
                if (!u.on && !_wild) { w.visible = false; return; }
                w.visible = true;
                w.position.x += dt * u.sp * (1 + wildK * 2.5);
                w.position.y = u.r + Math.abs(Math.sin(t * 3 + u.ph)) * (1.2 + wildK * 2);
                w.rotation.z -= dt * u.sp / u.r;
                if (w.position.x > 75) resetWeed(w, false);
            });
            herd.forEach(function (b) {
                b.visible = wildK > 0.2;
                if (!b.visible) return;
                var u = b.userData;
                b.position.x += dt * u.sp;
                b.position.y = Math.abs(Math.sin(t * 9 + u.ph)) * 0.5;
                b.getObjectByName('legA').rotation.z = Math.sin(t * 14 + u.ph) * 0.6;
                b.getObjectByName('legB').rotation.z = -Math.sin(t * 14 + u.ph) * 0.6;
                if (b.position.x > 90) b.position.x = -90 - Math.random() * 40;
            });
        }

        function updateDust(dt, t) {
            var wind = 1.2 + wildK * 22;
            for (var i = 0; i < N_DUST; i++) {
                var j = i * 3;
                dustPos[j] += dt * wind * dustVel[i];
                dustPos[j + 1] += Math.sin(t * 0.8 + i) * dt * 0.3 - wildK * dt * 0.5;
                if (dustPos[j] > 60) dustPos[j] = -60;
                if (dustPos[j + 1] < 0) dustPos[j + 1] = 30;
            }
            dust.geometry.attributes.position.needsUpdate = true;
        }

        function animate() {
            requestAnimationFrame(animate);
            var dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
            updateMood(dt);
            updateTrain(dt, t);
            updateWeeds(dt, t);
            updateDust(dt, t);
            // A slow breathing drift of the view; a shaking one in the stampede.
            camera.position.x = Math.sin(t * 0.07) * 3 + (Math.random() - 0.5) * wildK * 0.5;
            camera.position.y = 5 + (Math.random() - 0.5) * wildK * 0.35;
            camera.lookAt(0, 9, -100);
            renderer.render(scene, camera);
        }

        initThree();

        // ------------------------------------------------------------
        // Page effects
        // ------------------------------------------------------------

        function el(cls, css) {
            var d = document.createElement('div');
            d.className = cls;
            if (css) d.style.cssText = css;
            document.body.appendChild(d);
            return d;
        }
        function later(fn, ms) { return setTimeout(fn, ms); }

        // Saloon doors: two slatted wings swing apart (open) or flap shut.
        function doors(open) {
            var l = el('ww-door ww-door-l'), r = el('ww-door ww-door-r');
            var wide = 'perspective(1200px) rotateY(', shut = 'perspective(1200px) rotateY(0deg)';
            l.style.transform = open ? shut : wide + '-96deg)';
            r.style.transform = open ? shut : wide + '96deg)';
            later(function () {
                l.style.transform = open ? wide + '-100deg)' : wide + '-14deg)';
                r.style.transform = open ? wide + '100deg)' : wide + '14deg)';
            }, 30);
            later(function () { l.style.opacity = r.style.opacity = '0'; l.style.transition = r.style.transition = 'opacity 0.25s'; }, open ? 480 : 520);
            later(function () { l.remove(); r.remove(); }, 800);
        }

        function dustPuff(x, y, n, up) {
            for (var i = 0; i < n; i++) {
                var s = 18 + Math.random() * 30;
                var d = el('ww-dust', 'left:' + (x + (Math.random() - 0.5) * 80) + 'px;top:' + y + 'px;width:' + s + 'px;height:' + s + 'px;opacity:0.85');
                (function (d) {
                    later(function () {
                        d.style.transform = 'translate(' + ((Math.random() - 0.5) * 140) + 'px,' + ((up ? -1 : 1) * (20 + Math.random() * 50)) + 'px) scale(' + (2 + Math.random() * 2) + ')';
                        d.style.opacity = '0';
                    }, 20);
                    later(function () { d.remove(); }, 1000);
                })(d);
            }
        }

        function flash(bg, ms) {
            var d = el('ww-flash', 'background:' + bg);
            later(function () { d.style.opacity = '0'; }, ms || 40);
            later(function () { d.remove(); }, (ms || 40) + 400);
        }

        window.snonuxOpenEffect = function (post) {
            doors(true);
            var modal = document.getElementById('post-modal');
            if (modal) { modal.classList.add('ww-pinned'); later(function () { modal.classList.remove('ww-pinned'); }, 600); }
            var r = post ? post.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
            dustPuff(r.left + r.width / 2, r.top + r.height, 6, true);
        };
        window.snonuxCloseEffect = function () { doors(false); };

        // Each navigation is a shot: a bullet hole punched near the post,
        // a muzzle flash and the page kicking back with the recoil.
        window.snonuxNavEffect = function () {
            var holes = document.querySelectorAll('.ww-hole');
            if (holes.length > 4) holes[0].remove();
            var post = document.querySelector('.post-active'), r = post ? post.getBoundingClientRect() : null;
            var x = r ? r.left + r.width * (0.15 + Math.random() * 0.7) : window.innerWidth * Math.random();
            var y = r ? Math.min(window.innerHeight - 30, Math.max(30, r.top + 20 + Math.random() * Math.max(20, r.height - 40))) : window.innerHeight * Math.random();
            var h = el('ww-hole', 'left:' + x + 'px;top:' + y + 'px');
            later(function () { h.remove(); }, 1900);
            flash('radial-gradient(circle at ' + x + 'px ' + y + 'px, rgba(255,226,150,0.45), transparent 30%)', 30);
            var ov = document.querySelector('.overlay');
            if (ov) { ov.classList.remove('ww-recoil'); void ov.offsetWidth; ov.classList.add('ww-recoil'); later(function () { ov.classList.remove('ww-recoil'); }, 340); }
        };

        window.snonuxScrollEffect = function (dir) {
            var down = dir === 'down';
            dustPuff(window.innerWidth / 2, down ? window.innerHeight - 40 : 70, _wild ? 14 : 7, down);
        };

        // A new page: the reel jumps, the frame flares warm, and dust blows in.
        window.snonuxPageEffect = function () {
            flash('linear-gradient(90deg, rgba(255,236,190,0.35), rgba(201,164,106,0.45), rgba(255,236,190,0.35))', 60);
            doors(false);
            dustPuff(window.innerWidth / 2, window.innerHeight / 2, 10, true);
        };

        window.snonuxWildToggle = function () {
            _wild = !_wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', _wild);
            weeds.forEach(function (w) { w.visible = w.userData.on || _wild; });
            flash(_wild ? 'rgba(168,40,31,0.4)' : 'rgba(236,217,176,0.3)', 80);
        };
    })();
