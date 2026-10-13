// Shared plumbing for the theme-game browser tools (e2e.mjs and play.mjs):
// building and serving the site, starting headless Chrome, and a minimal
// DevTools-protocol client. Node 22's built-in WebSocket is enough, so there
// is nothing to npm-install.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const THEMES_DIR = join(ROOT, 'internal', 'generator', 'templates', 'themes');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const KEYS = {
    Enter: { key: 'Enter', vk: 13, text: '\r' }, Escape: { key: 'Escape', vk: 27 },
    Space: { key: ' ', vk: 32, text: ' ' }, ArrowLeft: { key: 'ArrowLeft', vk: 37 },
    ArrowUp: { key: 'ArrowUp', vk: 38 }, ArrowRight: { key: 'ArrowRight', vk: 39 },
    ArrowDown: { key: 'ArrowDown', vk: 40 }, KeyA: { key: 'a', vk: 65, text: 'a' },
    KeyH: { key: 'h', vk: 72, text: 'h' }, KeyJ: { key: 'j', vk: 74, text: 'j' },
    KeyK: { key: 'k', vk: 75, text: 'k' }, KeyL: { key: 'l', vk: 76, text: 'l' },
    KeyW: { key: 'w', vk: 87, text: 'w' },
    KeyP: { key: 'p', vk: 80, text: 'p' },
    Tab: { key: 'Tab', vk: 9 },
};

// Builds the site with one post so index.html exists.
export function buildSite(work) {
    const input = join(work, 'inbox'), output = join(work, 'dist');
    mkdirSync(input); mkdirSync(output);
    writeFileSync(join(input, 'hello.txt'), 'games e2e test post');
    const res = spawnSync('go', ['run', './cmd/snonux', '--input', input, '--output', output, '--theme', 'neon'],
        { cwd: ROOT, encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`site build failed:\n${res.stdout}${res.stderr}`);
    return output;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' };

export function serve(dir) {
    const server = createServer((req, res) => {
        const rel = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
        const file = join(dir, rel === '/' || rel === '\\' ? 'index.html' : rel);
        if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(readFileSync(file));
    });
    return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function findChrome() {
    const cands = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
    const found = cands.find((c) => c && existsSync(c));
    if (!found) throw new Error('no Chrome/Chromium found; set CHROME=/path/to/chrome');
    return found;
}

// Starts headless Chrome and resolves with the DevTools HTTP endpoint.
export function launchChrome(work) {
    // Tests render in software so they behave the same on any machine.
    // GAMES_GPU=1 uses the real GPU instead: the only way to get CPU and
    // frame-rate figures that mean something for this machine.
    const gpu = process.env.GAMES_GPU ? ['--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--disable-gpu'];
    const proc = spawn(findChrome(), [
        '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'chrome')}`,
        '--no-first-run', '--no-default-browser-check', ...gpu, '--no-sandbox',
        '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', 'about:blank',
    // detached puts Chrome and all its helper processes in one process group,
    // so the whole group can be killed at the end (see stopChrome).
    ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    return new Promise((ok, fail) => {
        let buf = '';
        const timer = setTimeout(() => fail(new Error('Chrome did not start')), 20000);
        proc.stderr.on('data', (d) => {
            buf += d;
            const m = buf.match(/DevTools listening on ws:\/\/([^/]+)\//);
            if (m) { clearTimeout(timer); ok({ proc, http: `http://${m[1]}` }); }
        });
        proc.on('exit', () => fail(new Error(`Chrome exited early:\n${buf}`)));
    });
}

// Kills Chrome's whole process group and waits for it to go. Killing only the
// main process leaves renderer and utility helpers alive for a moment; they
// keep writing to the profile directory, which then cannot be removed and is
// left behind in /tmp (about 40 MB per run).
async function stopChrome(proc) {
    const gone = new Promise((ok) => proc.once('exit', ok));
    try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill('SIGKILL'); }
    await Promise.race([gone, sleep(5000)]);
    await sleep(300);
}

// Minimal DevTools-protocol client for one page.
export class Page {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.pending = new Map(); this.problems = [];
        ws.addEventListener('message', (ev) => this.onMessage(JSON.parse(ev.data)));
    }

    static async open(httpBase) {
        const targets = await (await fetch(`${httpBase}/json/list`)).json();
        const target = targets.find((t) => t.type === 'page');
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((ok, fail) => { ws.addEventListener('open', ok); ws.addEventListener('error', fail); });
        const page = new Page(ws);
        await page.send('Page.enable');
        await page.send('Runtime.enable');
        await page.send('Network.enable');
        // A fixed 16:9 viewport: the game canvas then fills it exactly, and
        // screenshots are not clipped by the headless window's own chrome.
        await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
        // The CDN assets (three.js, Font Awesome) are irrelevant here; blocking
        // them keeps the test hermetic and fast.
        await page.send('Network.setBlockedURLs', { urls: ['*cdnjs.cloudflare.com*'] });
        return page;
    }

    onMessage(msg) {
        if (msg.id && this.pending.has(msg.id)) {
            const { ok, fail } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) fail(new Error(msg.error.message)); else ok(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            const text = d.exception?.description || d.text;
            // theme.js needs three.js, which this test blocks along with the
            // rest of the CDN; that one error is expected and not about games.
            if (!/THREE is not defined/.test(text)) this.problems.push(`uncaught: ${text}`);
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            this.problems.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
        }
    }

    send(method, params = {}) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((ok, fail) => this.pending.set(id, { ok, fail }));
    }

    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}\n  in: ${expression.slice(0, 200)}`);
        return r.result.value;
    }

    async waitFor(expression, what, timeout = 8000) {
        const end = Date.now() + timeout;
        while (Date.now() < end) {
            if (await this.eval(`!!(${expression})`)) return;
            await sleep(40);
        }
        throw new Error(`timed out waiting for ${what}`);
    }

    async goto(url) {
        await this.send('Page.navigate', { url });
        await this.waitFor('document.readyState === "complete" && window.SnoGame', 'page load');
    }

    async key(type, code, modifiers = 0) {
        const k = KEYS[code];
        const key = (modifiers & 8) && /^[a-z]$/.test(k.key) ? k.key.toUpperCase() : k.key;
        const params = { type, code, key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers };
        if (type === 'keyDown' && k.text) params.text = /^[a-z]$/.test(k.key) ? key : k.text;
        await this.send('Input.dispatchKeyEvent', params);
    }

    async press(code, modifiers = 0) { await this.key('keyDown', code, modifiers); await this.key('keyUp', code, modifiers); }

    async click(selector) {
        const r = await this.eval(`(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'center'});var b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width};})()`);
        if (!r || !r.w) throw new Error(`cannot click ${selector}: not found or not visible`);
        for (const type of ['mousePressed', 'mouseReleased']) {
            await this.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
        }
    }

    // Turns the page into a phone: a mobile viewport of the given size and a
    // touch screen, so `(pointer: coarse)` matches and the engine builds its
    // touch pad. Call it before loading the page.
    async emulatePhone(width, height) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: 2, mobile: true,
            screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 },
        });
        await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }

    // One real touch event with `points` as [{x, y, id}]. For touchStart and
    // touchMove they are all fingers now on the glass (two fingers are a
    // touchStart with one point, then a touchStart with both). For touchEnd
    // they are the fingers being lifted; an empty list lifts every finger.
    //
    // Coordinates are client (layout) pixels, as getBoundingClientRect gives
    // them. A page wider than the phone is shown zoomed out, and Chrome wants
    // touch positions in screen pixels, so they are converted here.
    async touch(type, points) {
        const v = points.length ? await this.eval('({s:visualViewport.scale,x:visualViewport.offsetLeft,y:visualViewport.offsetTop})') : null;
        const touchPoints = points.map((p) => ({ x: (p.x - v.x) * v.s, y: (p.y - v.y) * v.s, id: p.id || 0 }));
        await this.send('Input.dispatchTouchEvent', { type, touchPoints });
    }

    async tap(x, y) {
        await this.touch('touchStart', [{ x, y }]);
        await this.touch('touchEnd', []);
    }

    async screenshot(file) {
        const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
        writeFileSync(file, Buffer.from(r.data, 'base64'));
    }
}

// Builds and serves the site and opens one Chrome page on it. Returns the
// page, the base URL and a close() that tears everything down again.
export async function startSession() {
    const work = mkdtempSync(join(tmpdir(), 'snonux-games-'));
    let server, chrome;
    const close = async () => {
        if (server) server.close();
        if (chrome) await stopChrome(chrome.proc);
        // A leftover temp dir is not a test failure, so cleanup never throws.
        try {
            rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        } catch (err) {
            console.error(`warning: could not remove ${work}: ${err.message}`);
        }
    };
    try {
        server = await serve(buildSite(work));
        const base = `http://127.0.0.1:${server.address().port}`;
        chrome = await launchChrome(work);
        return { page: await Page.open(chrome.http), base, close };
    } catch (err) {
        await close();
        throw err;
    }
}

// Themes that ship a game, sorted.
export function themesWithGames() {
    return readdirSync(THEMES_DIR).filter((t) => existsSync(join(THEMES_DIR, t, 'game.js'))).sort();
}
