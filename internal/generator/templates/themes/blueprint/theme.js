    // Blueprint splash: a drafting compass swings its pencil leg round and
    // draws circle after circle on the sheet while a small wireframe block
    // turns behind it.
    (function(){
        if(document.documentElement.classList.contains('sno-splash-skip'))return;
        var cv=document.getElementById('splash-gl-canvas');
        if(!cv||typeof THREE==='undefined')return;
        var raf,ren,sc,ca,t0=performance.now(),SEG=160,i;
        function cleanup(){window.removeEventListener('resize',sz);if(raf)cancelAnimationFrame(raf);raf=null;if(ren)ren.dispose();ren=null;window._snonuxSplashWebGLCleanup=null;}
        window._snonuxSplashWebGLCleanup=cleanup;
        function sz(){var w=cv.clientWidth||2,h=cv.clientHeight||2;if(ren)ren.setSize(w,h,false);if(ca){ca.aspect=w/h;ca.updateProjectionMatrix();}if(rig){var wide=w>h;rig.position.set(wide?-4.6*w/h+3.2:0,wide?0.4:3.2,0);rig.scale.setScalar(wide?1:0.6);}}
        ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});ren.setClearColor(0,0);ren.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
        sc=new THREE.Scene();ca=new THREE.PerspectiveCamera(50,1,0.1,80);ca.position.set(0,0,10);
        // The compass works off to one side so the title panel never hides it.
        var rig=new THREE.Group();sc.add(rig);
        // The circle being drawn: a unit ring revealed segment by segment.
        var ring=new Float32Array((SEG+1)*3);
        for(i=0;i<=SEG;i++){ring[i*3]=Math.cos(i/SEG*Math.PI*2);ring[i*3+1]=Math.sin(i/SEG*Math.PI*2);}
        var rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(ring,3));
        var circle=new THREE.Line(rg,new THREE.LineBasicMaterial({color:0xeaf6ff,transparent:true,opacity:0.85}));rig.add(circle);
        var old=new THREE.Line(rg,new THREE.LineBasicMaterial({color:0x7fd6ff,transparent:true,opacity:0.25}));rig.add(old);
        // Compass: hinge, needle leg and pencil leg (red lead).
        var legs=new THREE.BufferGeometry();legs.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3));
        var legLines=new THREE.LineSegments(legs,new THREE.LineBasicMaterial({color:0xeaf6ff}));rig.add(legLines);
        var lead=new THREE.Mesh(new THREE.CircleGeometry(0.09,12),new THREE.MeshBasicMaterial({color:0xff5a4e}));rig.add(lead);
        var block=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2,3.4,2.2)),new THREE.LineBasicMaterial({color:0x7fd6ff,transparent:true,opacity:0.5}));
        block.position.set(7.5,-2.2,-3);sc.add(block);
        var r=2.2,oldR=2.6;
        sz();window.addEventListener('resize',sz);
        function loop(now){raf=requestAnimationFrame(loop);var t=(now-t0)*0.001,cyc=t%4.2,f=Math.min(1,cyc/3.2),a=f*Math.PI*2,p=legs.attributes.position.array;
            if(cyc<0.02&&t>1){oldR=r;r=1.4+Math.random()*1.2;}
            circle.scale.set(r,r,1);old.scale.set(oldR,oldR,1);rg.setDrawRange(0,Math.max(2,Math.floor(f*SEG)+1));
            // The hinge stands off the radius; the legs splay to the needle and the pencil.
            var hx=Math.cos(a)*r*0.5-Math.sin(a)*1.5,hy=Math.sin(a)*r*0.5+Math.cos(a)*1.5,px=Math.cos(a)*r,py=Math.sin(a)*r;
            p[0]=hx;p[1]=hy;p[3]=0;p[4]=0;p[6]=hx;p[7]=hy;p[9]=px;p[10]=py;legs.attributes.position.needsUpdate=true;
            lead.position.set(px,py,0.01);
            block.rotation.y=t*0.4;block.rotation.x=0.35;
            ren.render(sc,ca);}
        raf=requestAnimationFrame(loop);
    })();


    // Blueprint WebGL backdrop: a setback tower drafted line by line over a
    // fine and coarse grid floor, with dimension callouts, slowly turning.
    // Wild mode: the drawing becomes an exploded-view diagram, the parts fly
    // apart on leader lines and spin while the plotter runs in overdrive.
    (function() {
        var _wild = false, explode = 0, ink = 0, hold = 0, fade = 1;
        var scene, camera, renderer, clock, pivot, gridFine, gridCoarse, dust, penHead;
        var parts = [], leaders, callouts = [];
        var PARTS = [
            // [half width, half depth, base y, height, explode offset x, y, z]
            [12, 9, 0, 6, 0, -6, 0], [8, 7, 6, 18, -10, 2, 6], [6, 5, 24, 14, 10, 10, -6], [4, 3.5, 38, 10, -6, 18, -8], [2, 2, 48, 4, 6, 26, 4]
        ];
        var INK = 0x7fd6ff, WHITE = 0xeaf6ff, RED = 0xff5a4e;

        // Box edges plus floor lines and mullions, as one segment list.
        function partSegments(p) {
            var w = p[0], d = p[1], h = p[3], v = [], y, k;
            function seg(a, b) { v.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
            function ring(yy) { seg([-w, yy, -d], [w, yy, -d]); seg([w, yy, -d], [w, yy, d]); seg([w, yy, d], [-w, yy, d]); seg([-w, yy, d], [-w, yy, -d]); }
            ring(0); ring(h);
            [[-w, -d], [w, -d], [w, d], [-w, d]].forEach(function (c) { seg([c[0], 0, c[1]], [c[0], h, c[1]]); });
            for (y = 2; y < h; y += 2) ring(y);
            for (k = -w + 2; k < w; k += 2) { seg([k, 0, d], [k, h, d]); seg([k, 0, -d], [k, h, -d]); }
            for (k = -d + 2; k < d; k += 2) { seg([w, 0, k], [w, h, k]); seg([-w, 0, k], [-w, h, k]); }
            return new Float32Array(v);
        }

        function buildTower() {
            PARTS.forEach(function (p, idx) {
                var g = new THREE.BufferGeometry(), arr = partSegments(p);
                g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
                var mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: idx === 0 ? WHITE : INK, transparent: true, opacity: 0.8 }));
                var grp = new THREE.Group(); grp.add(mesh); grp.position.y = p[2]; pivot.add(grp);
                parts.push({ grp: grp, geo: g, count: arr.length / 3, base: p[2], off: [p[4], p[5], p[6]], spin: (idx % 2 ? -1 : 1) * (0.6 + idx * 0.25) });
            });
            // The spire: a mast with stays.
            var sg = new THREE.BufferGeometry();
            sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 12, 0, -2, 0, -2, 0, 8, 0, 2, 0, 2, 0, 8, 0, -2, 0, 2, 0, 8, 0, 2, 0, -2, 0, 8, 0]), 3));
            var spire = new THREE.Group(); spire.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: WHITE, transparent: true, opacity: 0.85 })));
            spire.position.y = 52; pivot.add(spire);
            parts.push({ grp: spire, geo: sg, count: 10, base: 52, off: [0, 34, 0], spin: 2 });
            var lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(parts.length * 6), 3));
            leaders = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0 }));
            pivot.add(leaders);
        }

        function label(text, color) {
            var c = document.createElement('canvas'); c.width = 256; c.height = 64;
            var g = c.getContext('2d');
            g.font = '600 30px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillStyle = color; g.fillText(text, 128, 32);
            var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.9 }));
            sp.scale.set(10, 2.5, 1);
            return sp;
        }

        // Dimension lines with arrowheads and extension ticks, plus their
        // measurements and two section-mark bubbles.
        function buildCallouts() {
            var v = [], a = 1.2;
            function seg(p, q) { v.push(p[0], p[1], p[2], q[0], q[1], q[2]); }
            seg([-12, 0.2, 14], [12, 0.2, 14]); seg([-12, 0.2, 12], [-12, 0.2, 16]); seg([12, 0.2, 12], [12, 0.2, 16]);
            seg([-12, 0.2, 14], [-12 + a, 0.2, 14 - a * 0.5]); seg([-12, 0.2, 14], [-12 + a, 0.2, 14 + a * 0.5]);
            seg([12, 0.2, 14], [12 - a, 0.2, 14 - a * 0.5]); seg([12, 0.2, 14], [12 - a, 0.2, 14 + a * 0.5]);
            seg([17, 0, 9], [17, 64, 9]); seg([15, 0, 9], [19, 0, 9]); seg([15, 64, 9], [19, 64, 9]);
            seg([17, 0, 9], [17 - a * 0.5, a, 9]); seg([17, 0, 9], [17 + a * 0.5, a, 9]);
            seg([17, 64, 9], [17 - a * 0.5, 64 - a, 9]); seg([17, 64, 9], [17 + a * 0.5, 64 - a, 9]);
            var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
            var dims = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: WHITE, transparent: true, opacity: 0.55 }));
            pivot.add(dims); callouts.push(dims);
            var w = label('24 000', '#eaf6ff'); w.position.set(0, 2.2, 14); pivot.add(w); callouts.push(w);
            var h = label('64 000', '#eaf6ff'); h.position.set(22, 32, 9); pivot.add(h); callouts.push(h);
            ['A', 'A'].forEach(function (t, k) {
                var b = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 28), new THREE.MeshBasicMaterial({ color: RED, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
                b.rotation.x = -Math.PI / 2; b.position.set(k ? 22 : -22, 0.1, 0); pivot.add(b);
                var s = label(t, '#ff5a4e'); s.scale.set(6, 1.5, 1); s.position.set(k ? 22 : -22, 1.4, 0); pivot.add(s);
                callouts.push(b, s);
            });
        }

        function buildFloor() {
            gridFine = new THREE.GridHelper(240, 120, 0x2f6aa0, 0x1b4a78);
            gridFine.material.transparent = true; gridFine.material.opacity = 0.35; scene.add(gridFine);
            gridCoarse = new THREE.GridHelper(240, 12, INK, INK);
            gridCoarse.material.transparent = true; gridCoarse.material.opacity = 0.35; gridCoarse.position.y = 0.05; scene.add(gridCoarse);
        }

        // Graphite dust drifting in the light, and the plotter's pen head.
        function buildDust() {
            var n = 360, arr = new Float32Array(n * 3);
            for (var i = 0; i < n; i++) { arr[i * 3] = (Math.random() - 0.5) * 160; arr[i * 3 + 1] = Math.random() * 80; arr[i * 3 + 2] = (Math.random() - 0.5) * 120; }
            var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xa9c8e4, size: 0.35, transparent: true, opacity: 0.45, depthWrite: false }));
            scene.add(dust);
            penHead = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: RED }));
            pivot.add(penHead);
        }

        function initThree() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x071d38);
            scene.fog = new THREE.Fog(0x071d38, 70, 190);
            camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
            camera.position.set(0, 30, 78); camera.lookAt(0, 22, 0);
            renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('three-canvas'), antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            clock = new THREE.Clock();
            pivot = new THREE.Group(); pivot.position.x = window.innerWidth > 900 ? 18 : 0; scene.add(pivot);
            buildFloor(); buildTower(); buildCallouts(); buildDust();
            window.addEventListener('resize', onResize);
            animate();
        }

        function onResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            pivot.position.x = window.innerWidth > 900 ? 18 : 0;
        }

        // Reveals `ink` segments across the parts in order and parks the
        // pen head on the end of the segment being drawn.
        function draft() {
            var left = Math.floor(ink), total = 0;
            parts.forEach(function (p) {
                var segs = p.count / 2, show = Math.max(0, Math.min(segs, left));
                p.geo.setDrawRange(0, show * 2); left -= segs; total += segs;
                if (show > 0 && show < segs) {
                    var a = p.geo.attributes.position.array, j = (show - 1) * 6 + 3;
                    penHead.position.set(a[j] + p.grp.position.x, a[j + 1] + p.grp.position.y, a[j + 2] + p.grp.position.z);
                }
            });
            penHead.visible = ink < total;
            return total;
        }

        function layoutParts(t, dt) {
            var lp = leaders.geometry.attributes.position.array;
            parts.forEach(function (p, k) {
                p.grp.position.set(p.off[0] * explode, p.base + p.off[1] * explode, p.off[2] * explode);
                p.grp.rotation.y = _wild ? p.grp.rotation.y + dt * p.spin * explode : p.grp.rotation.y * (1 - Math.min(1, dt * 3));
                lp[k * 6] = 0; lp[k * 6 + 1] = p.base; lp[k * 6 + 2] = 0;
                lp[k * 6 + 3] = p.grp.position.x; lp[k * 6 + 4] = p.grp.position.y; lp[k * 6 + 5] = p.grp.position.z;
            });
            leaders.geometry.attributes.position.needsUpdate = true;
            leaders.material.opacity = explode * 0.8;
        }

        function animate() {
            requestAnimationFrame(animate);
            var dt = Math.min(0.05, clock.getDelta()), t = clock.getElapsedTime();
            explode += ((_wild ? 1 : 0) - explode) * Math.min(1, dt * 2.5);
            ink += dt * (_wild ? 900 : 70);
            var total = draft();
            // A finished drawing holds, fades and is drafted again.
            if (ink >= total) { hold += dt; if (hold > (_wild ? 0.6 : 7)) { fade -= dt * 1.5; if (fade <= 0) { ink = 0; hold = 0; fade = 1; } } }
            parts.forEach(function (p, k) {
                var m = p.grp.children[0].material;
                m.opacity = 0.8 * fade;
                m.color.setHex(_wild && Math.sin(t * 9 + k) > 0.6 ? RED : (k === 0 || k === parts.length - 1 ? WHITE : INK));
            });
            layoutParts(t, dt);
            pivot.rotation.y += dt * (_wild ? 0.6 : 0.08);
            callouts.forEach(function (c) { c.visible = ink > 200 || _wild; });
            gridCoarse.material.opacity = 0.3 + (_wild ? 0.25 * Math.abs(Math.sin(t * 6)) : 0.05 * Math.sin(t * 0.8));
            dust.rotation.y += dt * (_wild ? 0.25 : 0.02);
            dust.position.y = Math.sin(t * 0.3) * 1.5;
            camera.position.y = 30 + explode * 10 + Math.sin(t * 0.2) * 2;
            camera.lookAt(0, 22 + explode * 8, 0);
            renderer.render(scene, camera);
        }

        initThree();

        // ------------------------------------------------------------------
        // Page effects
        // ------------------------------------------------------------------

        function fx(cls, css) {
            var d = document.createElement('div');
            d.className = 'bp-fx ' + cls;
            if (css) d.style.cssText += css;
            document.body.appendChild(d);
            return d;
        }

        // An SVG overlay in page coordinates for drawn outlines and arcs.
        function svgLayer() {
            var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('class', 'bp-fx');
            svg.style.cssText = 'left:0;top:0;width:100vw;height:100vh;overflow:visible;';
            document.body.appendChild(svg);
            return { svg: svg, add: function (tag, attrs) { var e = document.createElementNS(ns, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; } };
        }

        // Animates a stroke from nothing to fully drawn, like a pen plotter.
        function plot(el, len, ms) {
            el.style.strokeDasharray = len; el.style.strokeDashoffset = len;
            el.style.transition = 'stroke-dashoffset ' + ms + 'ms linear';
            requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.strokeDashoffset = 0; }); });
        }

        function stamp(text) {
            var s = fx('bp-stamp');
            s.textContent = text;
            requestAnimationFrame(function () { requestAnimationFrame(function () { s.classList.add('bp-in'); }); });
            setTimeout(function () {
                var ov = document.querySelector('.overlay');
                if (ov) { ov.classList.add('bp-wobble'); setTimeout(function () { ov.classList.remove('bp-wobble'); }, 360); }
            }, 150);
            setTimeout(function () { s.classList.add('bp-out'); }, 750);
            setTimeout(function () { s.remove(); }, 1300);
        }

        // Pink eraser crumbs that tumble away from a point.
        function crumbs(x, y, n) {
            for (var i = 0; i < n; i++) {
                (function (i) {
                    var c = fx('bp-crumb', 'left:' + x + 'px;top:' + y + 'px;');
                    var a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 90;
                    setTimeout(function () {
                        c.style.transform = 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d + 60) + 'px) rotate(' + (Math.random() * 540 - 270) + 'deg)';
                        c.style.opacity = '0';
                    }, 20 + i * 8);
                    setTimeout(function () { c.remove(); }, 820 + i * 8);
                })(i);
            }
        }

        window.snonuxOpenEffect = function (post) {
            var r = post ? post.getBoundingClientRect() : { left: innerWidth * 0.2, top: innerHeight * 0.3, width: innerWidth * 0.6, height: innerHeight * 0.3 };
            var L = svgLayer(), per = 2 * (r.width + r.height);
            var box = L.add('rect', { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8, fill: 'none', stroke: '#eaf6ff', 'stroke-width': 2 });
            plot(box, per + 32, 420);
            var y = r.top - 14, dim = L.add('path', { d: 'M' + (r.left - 4) + ' ' + y + 'H' + (r.right + 4) + 'M' + (r.left - 4) + ' ' + (y - 6) + 'v12M' + (r.right + 4) + ' ' + (y - 6) + 'v12', fill: 'none', stroke: '#7fd6ff', 'stroke-width': 1 });
            plot(dim, r.width + 40, 300);
            var tx = L.add('text', { x: r.left + r.width / 2, y: y - 4, fill: '#7fd6ff', 'font-size': 11, 'text-anchor': 'middle', 'font-family': 'IBM Plex Mono, monospace' });
            tx.textContent = Math.round(r.width * 10) + '';
            setTimeout(function () { L.svg.style.transition = 'opacity 0.35s'; L.svg.style.opacity = '0'; }, 520);
            setTimeout(function () { L.svg.remove(); }, 900);
        };

        window.snonuxCloseEffect = function () {
            crumbs(innerWidth / 2, innerHeight / 2, _wild ? 28 : 16);
        };

        window.snonuxScrollEffect = function (dir) {
            var down = dir === 'down', d = fx('bp-sweep', (down ? 'top:0;' : 'bottom:0;') + '--head:' + Math.round(20 + Math.random() * 60) + '%;' + (_wild ? 'height:4px;background:#ff5a4e;' : ''));
            requestAnimationFrame(function () { requestAnimationFrame(function () { d.style.transform = 'translateY(' + (down ? '' : '-') + '100vh)'; d.style.opacity = '0.2'; }); });
            setTimeout(function () { d.remove(); }, 480);
        };

        // A compass arc swung in red pencil round the active post's corner.
        window.snonuxNavEffect = function () {
            var p = document.querySelector('.post-active'), r = p ? p.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2 };
            var L = svgLayer(), cx = r.left, cy = r.top, rad = 34;
            var arc = L.add('path', { d: 'M' + (cx + rad) + ' ' + cy + 'A' + rad + ' ' + rad + ' 0 1 1 ' + cx + ' ' + (cy - rad), fill: 'none', stroke: '#ff5a4e', 'stroke-width': 2, 'stroke-linecap': 'round' });
            plot(arc, 170, 260);
            L.add('circle', { cx: cx, cy: cy, r: 2.5, fill: '#eaf6ff' });
            setTimeout(function () { L.svg.style.transition = 'opacity 0.3s'; L.svg.style.opacity = '0'; }, 320);
            setTimeout(function () { L.svg.remove(); }, 650);
        };

        window.snonuxPageEffect = function () {
            stamp(Math.random() < 0.5 ? 'APPROVED' : 'REVISED');
        };

        window.snonuxWildToggle = function () {
            _wild = !_wild;
            var b = document.getElementById('sno-wild-badge');
            if (b) b.classList.toggle('sno-wild-on', _wild);
            stamp(_wild ? 'EXPLODED VIEW' : 'APPROVED');
            if (_wild) ink = 0;
        };
    })();
