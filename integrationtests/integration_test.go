// Package integrationtests runs end-to-end tests of the snonux generator pipeline.
// Each test creates temporary input/output directories, places fixture files, runs
// the full processor+generator pipeline, and asserts the expected outputs.
package integrationtests

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	"image/color"
	"image/color/palette"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/snonux/snonux.foo/internal/config"
	"github.com/snonux/snonux.foo/internal/generator"
	"github.com/snonux/snonux.foo/internal/processor"
	"github.com/snonux/snonux.foo/internal/version"
)

var ctx = context.Background() //nolint:gochecknoglobals // test-only top-level helper used by every test in the file

// runPipeline executes both pipeline stages and returns the config used.
func runPipeline(t *testing.T, inputDir, outputDir string) *config.Config {
	t.Helper()

	cfg := &config.Config{
		InputDir:  inputDir,
		OutputDir: outputDir,
		BaseURL:   "https://snonux.foo",
		Theme:     "neon",
	}

	_, err := processor.Run(ctx, cfg)
	if err != nil {
		t.Fatalf("processor.Run: %v", err)
	}

	if err := generator.Run(ctx, cfg); err != nil {
		t.Fatalf("generator.Run: %v", err)
	}

	return cfg
}

// makeDirs creates temporary input and output directories for a test.
func makeDirs(t *testing.T) (inputDir, outputDir string) {
	t.Helper()

	base := t.TempDir()
	inputDir = filepath.Join(base, "inbox")
	outputDir = filepath.Join(base, "outdir")

	if err := os.MkdirAll(inputDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		t.Fatal(err)
	}

	return inputDir, outputDir
}

// readFile is a helper that reads a file and fails the test on error.
func readFile(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}

	return string(data)
}

// assertContains fails the test if content does not contain substr.
func assertContains(t *testing.T, content, substr, label string) {
	t.Helper()

	if !strings.Contains(content, substr) {
		t.Errorf("%s: expected to contain %q\ngot:\n%s", label, substr, content[:min(len(content), 500)])
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// TestTxtInput verifies plain text files are converted to posts.
func TestTxtInput(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	if err := os.WriteFile(filepath.Join(inputDir, "hello.txt"), []byte("Hello, Nexus!"), 0o644); err != nil {
		t.Fatal(err)
	}

	runPipeline(t, inputDir, outputDir)

	// Source file should have been removed after processing.
	if _, err := os.Stat(filepath.Join(inputDir, "hello.txt")); !os.IsNotExist(err) {
		t.Error("source file should have been deleted from input dir")
	}

	// A post directory should exist under outdir/posts/.
	entries, err := os.ReadDir(filepath.Join(outputDir, "posts"))
	if err != nil {
		t.Fatalf("read posts dir: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 post dir, got %d", len(entries))
	}

	// index.html must contain the post text.
	index := readFile(t, filepath.Join(outputDir, "index.html"))
	assertContains(t, index, "Hello, Nexus!", "index.html")
	// splash WebGL canvas is part of the per-theme splash markup baked in.
	assertContains(t, index, "splash-gl-canvas", "index.html splash WebGL canvas")
	assertContains(t, index, `href="atom.xml"`, "index.html atom feed link")
	// shared bundles must also be written.
	if _, err := os.Stat(filepath.Join(outputDir, "shared.css")); err != nil {
		t.Fatalf("shared.css missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(outputDir, "shared.js")); err != nil {
		t.Fatalf("shared.js missing: %v", err)
	}
}

// TestMarkdownInput verifies Markdown files are converted to HTML.
func TestMarkdownInput(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	md := "# Hello Nexus\n\nThis is **bold** text."
	if err := os.WriteFile(filepath.Join(inputDir, "post.md"), []byte(md), 0o644); err != nil {
		t.Fatal(err)
	}

	runPipeline(t, inputDir, outputDir)

	index := readFile(t, filepath.Join(outputDir, "index.html"))
	assertContains(t, index, "<strong>bold</strong>", "index.html markdown bold")
	assertContains(t, index, "<h1>", "index.html markdown h1")
}

func TestScheduledPostsStayPrivateUntilDue(t *testing.T) {
	inputDir, outputDir := makeDirs(t)
	for name, content := range map[string]string{
		"due.md":     "<!-- publish-at: 2020-01-01T10:00:00+02:00 -->\n\nA due scheduled update",
		"future.md":  "<!-- publish-at: 2100-01-01T10:00:00+02:00 -->\n\nA private future update\n![private](future.png)",
		"future.png": "private image bytes",
	} {
		if err := os.WriteFile(filepath.Join(inputDir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	runPipeline(t, inputDir, outputDir)
	for _, name := range []string{"index.html", "atom.xml"} {
		content := readFile(t, filepath.Join(outputDir, name))
		assertContains(t, content, "A due scheduled update", name)
		if strings.Contains(content, "private") || strings.Contains(content, "publish-at") {
			t.Errorf("%s leaked a future post or scheduling directive", name)
		}
	}
	feed := readFile(t, filepath.Join(outputDir, "atom.xml"))
	assertContains(t, feed, "2020-01-01T08:00:00Z", "scheduled feed timestamp")
	for _, name := range []string{"future.md", "future.png"} {
		if _, err := os.Stat(filepath.Join(inputDir, name)); err != nil {
			t.Fatalf("future source %s lost: %v", name, err)
		}
	}
	if err := filepath.WalkDir(filepath.Join(outputDir, "posts"), func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Name() == "future.png" {
			t.Error("future image copied to public output")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

// assertStandaloneImagePost checks index.html and posts/<id>/image.jpg after a lone image input.
func assertStandaloneImagePost(t *testing.T, outputDir string) {
	t.Helper()

	index := readFile(t, filepath.Join(outputDir, "index.html"))
	assertContains(t, index, `<img`, "index.html image tag")
	assertContains(t, index, `image.jpg`, "index.html image filename")

	postDirs, err := os.ReadDir(filepath.Join(outputDir, "posts"))
	if err != nil {
		t.Fatalf("read posts dir: %v", err)
	}
	if len(postDirs) != 1 {
		t.Fatalf("expected 1 post, got %d", len(postDirs))
	}
	imgPath := filepath.Join(outputDir, "posts", postDirs[0].Name(), "image.jpg")
	if _, err := os.Stat(imgPath); err != nil {
		t.Errorf("expected image.jpg in post dir: %v", err)
	}
}

// TestPNGInput verifies .png files are converted to JPEG posts and embedded in pages.
func TestPNGInput(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	writeSamplePNG(t, filepath.Join(inputDir, "photo.png"))
	runPipeline(t, inputDir, outputDir)
	assertStandaloneImagePost(t, outputDir)
}

// TestJPGInput verifies .jpg files are processed the same way as PNG.
func TestJPGInput(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	writeSampleJPEG(t, filepath.Join(inputDir, "photo.jpg"))
	runPipeline(t, inputDir, outputDir)
	assertStandaloneImagePost(t, outputDir)
}

// TestJPEGInput verifies the .jpeg extension is accepted.
func TestJPEGInput(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	writeSampleJPEG(t, filepath.Join(inputDir, "snapshot.jpeg"))
	runPipeline(t, inputDir, outputDir)
	assertStandaloneImagePost(t, outputDir)
}

// TestGIFInput verifies .gif files are decoded (first frame) and output as JPEG.
func TestGIFInput(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	writeSampleGIF(t, filepath.Join(inputDir, "anim.gif"))
	runPipeline(t, inputDir, outputDir)
	assertStandaloneImagePost(t, outputDir)
}

// TestAudioInput verifies .mp3 files are copied and an audio element is generated.
func TestAudioInput(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	// Write a minimal non-empty file as a stand-in for MP3 content.
	if err := os.WriteFile(filepath.Join(inputDir, "track.mp3"), []byte("ID3fake"), 0o644); err != nil {
		t.Fatal(err)
	}

	runPipeline(t, inputDir, outputDir)

	index := readFile(t, filepath.Join(outputDir, "index.html"))
	assertContains(t, index, `<audio`, "index.html audio tag")
	assertContains(t, index, `track.mp3`, "index.html audio filename")
}

// TestMarkdownWithImage verifies that a Markdown post referencing a local image
// copies the image into the post dir and updates the src path.
func TestMarkdownWithImage(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	md := "Look at this:\n\n![cool pic](photo.png)\n"
	if err := os.WriteFile(filepath.Join(inputDir, "post.md"), []byte(md), 0o644); err != nil {
		t.Fatal(err)
	}

	writeSamplePNG(t, filepath.Join(inputDir, "photo.png"))

	runPipeline(t, inputDir, outputDir)

	postDirs, _ := os.ReadDir(filepath.Join(outputDir, "posts"))
	if len(postDirs) != 1 {
		t.Fatalf("expected 1 post, got %d", len(postDirs))
	}

	// The referenced image should be copied into the post dir.
	imgPath := filepath.Join(outputDir, "posts", postDirs[0].Name(), "photo.png")
	if _, err := os.Stat(imgPath); err != nil {
		t.Errorf("expected photo.png in post dir: %v", err)
	}
}

// TestPagination verifies that 45 posts are split across two pages (42 + 3).
func TestPagination(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	for i := 0; i < 45; i++ {
		name := fmt.Sprintf("post%02d.txt", i)
		content := fmt.Sprintf("Post number %d", i)
		if err := os.WriteFile(filepath.Join(inputDir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	runPipeline(t, inputDir, outputDir)

	// index.html should exist and contain 42 posts.
	index := readFile(t, filepath.Join(outputDir, "index.html"))
	if count := strings.Count(index, `class="post"`); count != 42 {
		t.Errorf("index.html: expected 42 posts, got %d", count)
	}

	// page2.html should exist and contain 3 posts.
	page2 := readFile(t, filepath.Join(outputDir, "page2.html"))
	if count := strings.Count(page2, `class="post"`); count != 3 {
		t.Errorf("page2.html: expected 3 posts, got %d", count)
	}
}

// TestPaginationNavLinks verifies prev/next navigation links are positioned correctly.
func TestPaginationNavLinks(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	for i := 0; i < 45; i++ {
		if err := os.WriteFile(filepath.Join(inputDir, fmt.Sprintf("p%02d.txt", i)), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	runPipeline(t, inputDir, outputDir)

	index := readFile(t, filepath.Join(outputDir, "index.html"))
	// index.html (page 1) has no prev, should have next link (page2.html).
	assertContains(t, index, "page2.html", "index.html next link")
	if strings.Contains(index, "NEWER TRANSMISSIONS") {
		t.Error("index.html should not have a prev-page link")
	}

	page2 := readFile(t, filepath.Join(outputDir, "page2.html"))
	// page2.html should have a prev link to index with splash=0 (keyboard nav has no reliable Referer).
	assertContains(t, page2, `href="index.html?splash=0"`, "page2.html prev href skips splash")
	assertContains(t, page2, "NEWER TRANSMISSIONS", "page2.html prev link")
	if strings.Contains(page2, "OLDER TRANSMISSIONS") {
		t.Error("page2.html should not have a next-page link")
	}
}

// TestAtomFeed verifies that atom.xml is well-formed and contains ≤42 entries.
func TestAtomFeed(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	for i := 0; i < 5; i++ {
		if err := os.WriteFile(filepath.Join(inputDir, fmt.Sprintf("p%d.txt", i)), []byte("feed post"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	runPipeline(t, inputDir, outputDir)

	atomPath := filepath.Join(outputDir, "atom.xml")
	data, err := os.ReadFile(atomPath)
	if err != nil {
		t.Fatalf("read atom.xml: %v", err)
	}

	// Validate well-formed XML.
	var feed struct {
		XMLName xml.Name `xml:"feed"`
		Entries []struct {
			Title string `xml:"title"`
		} `xml:"entry"`
	}
	if err := xml.Unmarshal(data, &feed); err != nil {
		t.Fatalf("atom.xml not valid XML: %v", err)
	}

	if len(feed.Entries) != 5 {
		t.Errorf("expected 5 entries in atom.xml, got %d", len(feed.Entries))
	}
}

// TestInputCleanup verifies all source files are removed from the input dir.
func TestInputCleanup(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	for _, name := range []string{"a.txt", "b.txt", "c.txt"} {
		if err := os.WriteFile(filepath.Join(inputDir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	runPipeline(t, inputDir, outputDir)

	entries, _ := os.ReadDir(inputDir)
	if len(entries) != 0 {
		t.Errorf("input dir should be empty after processing, got %d files", len(entries))
	}
}

// TestKeyboardNavJS verifies that the generated HTML includes navigation attributes
// and that the shared JS binds the correct hotkeys.
func TestKeyboardNavJS(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	if err := os.WriteFile(filepath.Join(inputDir, "nav.txt"), []byte("nav test"), 0o644); err != nil {
		t.Fatal(err)
	}

	runPipeline(t, inputDir, outputDir)

	index := readFile(t, filepath.Join(outputDir, "index.html"))
	assertContains(t, index, `data-index="0"`, "index.html data-index attribute")
	// Shared CSS and JS now live as separate files referenced from the shell.
	sharedCSS := readFile(t, filepath.Join(outputDir, "shared.css"))
	assertContains(t, sharedCSS, `.post-active`, "shared.css .post-active rule")
	sharedJS := readFile(t, filepath.Join(outputDir, "shared.js"))
	assertContains(t, sharedJS, `playNavSound`, "shared.js playNavSound function")

	// Final shortcut mapping: p = ambient playback start/pause, f = flash.
	assertContains(t, sharedJS, "case 'p':", "shared.js p key handler")
	assertContains(t, sharedJS, "toggleAmbientMode();", "shared.js p toggles ambient")
	assertContains(t, sharedJS, "case 'f':", "shared.js f key handler")
	assertContains(t, sharedJS, "triggerFlashEffect();", "shared.js f triggers flash")

	// Nav hints and splash hints should display the updated keys.
	assertContains(t, index, "<kbd>p</kbd><span class=\"sno-btn-text\">music</span>", "index.html nav hint p=ambient")
	assertContains(t, index, "<kbd>f</kbd><span class=\"sno-btn-text\">flash</span>", "index.html nav hint f=flash")
}

// TestSplashMusicChoiceMarkup verifies (task js0) that the generated shared.js
// injects an explicit "with music" / "without music" choice into the splash
// overlay, and that shared.css styles it. The buttons are added at runtime
// (identically for every theme) rather than baked into each theme's
// splash_inner_html, so this asserts on the generated JS/CSS rather than on
// index.html markup.
func TestSplashMusicChoiceMarkup(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	if err := os.WriteFile(filepath.Join(inputDir, "splash-music.txt"), []byte("splash music choice test"), 0o644); err != nil {
		t.Fatal(err)
	}

	runPipeline(t, inputDir, outputDir)

	sharedJS := readFile(t, filepath.Join(outputDir, "shared.js"))
	assertContains(t, sharedJS, "function snonuxRenderSplashMusicChoice()", "shared.js defines the splash music choice injector")
	assertContains(t, sharedJS, "splash-music-choice", "shared.js references the splash-music-choice container class")
	assertContains(t, sharedJS, `data-sno-music="on"`, "shared.js with-music button markup")
	assertContains(t, sharedJS, `data-sno-music="off"`, "shared.js without-music button markup")
	assertContains(t, sharedJS, "snonuxAmbientSavePreference(withMusic)", "shared.js saves the chosen preference")
	// Re-injected after both places that replace #splash-overlay's innerHTML
	// wholesale (theme switch at runtime, and theme-meta application on load
	// when a visitor's saved theme differs from the page's baked-in default),
	// otherwise those choice buttons would silently disappear again. Assert
	// the exact count (not just presence) so a regression that drops one of
	// the two call sites doesn't hide behind the other still matching.
	reinjectLine := "if (typeof snonuxRenderSplashMusicChoice === 'function') snonuxRenderSplashMusicChoice();"
	if got := strings.Count(sharedJS, reinjectLine); got != 2 {
		t.Errorf("shared.js re-injects splash music choice at %d call sites; want 2 (snonuxSwitchTheme + snonuxApplyThemeMeta)", got)
	}

	sharedCSS := readFile(t, filepath.Join(outputDir, "shared.css"))
	assertContains(t, sharedCSS, ".splash-music-choice", "shared.css styles the splash music choice container")
	assertContains(t, sharedCSS, ".splash-music-btn", "shared.css styles the splash music choice buttons")
}

// TestSplashMusicChoiceBrowser drives a real headless browser to verify (task
// js0) that clicking the splash's "without music" button dismisses the splash,
// persists the decline, and actually leaves the ambient engine stopped; that
// "with music" persists acceptance and actually starts the ambient engine;
// and that the choice buttons survive (and keep working after) something
// wiping #splash-overlay's innerHTML wholesale — the exact hazard
// snonuxSwitchTheme() and snonuxApplyThemeMeta() pose, since both replace it
// on the fly when a visitor's saved theme differs from the page default.
func TestSplashMusicChoiceBrowser(t *testing.T) {
	chromium, ok := findChromium()
	if !ok {
		t.Skip("Chromium executable not found; skipping browser splash-music-choice test")
	}

	inputDir, outputDir := makeDirs(t)
	if err := os.WriteFile(filepath.Join(inputDir, "splash-music-browser.txt"), []byte("splash music choice browser test"), 0o644); err != nil {
		t.Fatal(err)
	}

	runPipeline(t, inputDir, outputDir)
	writeSplashMusicChoiceBrowserHarness(t, outputDir)

	testHTML := filepath.Join(outputDir, "splash-music-choice-test.html")
	pageURL := url.URL{Scheme: "file", Path: testHTML}
	out, err := exec.Command(
		chromium,
		"--headless",
		"--disable-gpu",
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-background-networking",
		"--allow-file-access-from-files",
		"--window-size=900,700",
		"--virtual-time-budget=4000",
		"--dump-dom",
		pageURL.String(),
	).CombinedOutput()
	if err != nil {
		t.Fatalf("run headless Chromium: %v\n%s", err, string(out))
	}

	dom := string(out)
	if !strings.Contains(dom, `data-splash-music-test="pass"`) {
		t.Fatalf("splash music choice behavior failed; DOM dump tail:\n%s", dom[max(0, len(dom)-3000):])
	}
}

// writeSplashMusicChoiceBrowserHarness clones index.html (stripping CDN
// assets unreachable from a file:// context, same as the scroll-selection
// harness) and appends a script that exercises both splash music choice
// buttons in sequence, recording pass/fail on document.body.
func writeSplashMusicChoiceBrowserHarness(t *testing.T, outputDir string) {
	t.Helper()

	indexPath := filepath.Join(outputDir, "index.html")
	html := readFile(t, indexPath)
	html = strings.ReplaceAll(html, `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>`, "")
	html = strings.ReplaceAll(html, `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">`, "")
	html = strings.Replace(html,
		`<script src="shared.js" defer></script>`,
		`<script src="shared.js" defer></script>`+"\n"+
			`    <script src="splash-music-choice-test.js" defer></script>`,
		1,
	)
	if err := os.WriteFile(filepath.Join(outputDir, "splash-music-choice-test.html"), []byte(html), 0o644); err != nil {
		t.Fatalf("write splash-music-choice-test.html: %v", err)
	}

	harness := `
(function () {
    function finish(status, detail) {
        document.body.setAttribute('data-splash-music-test', status);
        var pre = document.createElement('pre');
        pre.id = 'splash-music-test-result';
        pre.textContent = detail;
        document.body.appendChild(pre);
    }

    function ambientPref() {
        try { return localStorage.getItem('snonuxAmbientEnabled'); } catch (_) { return null; }
    }

    function ambientPlaying() {
        return !!(window.snonuxAmbientIsPlaying && window.snonuxAmbientIsPlaying());
    }

    function findButtons(overlay) {
        return {
            on: overlay.querySelector('.splash-music-btn[data-sno-music="on"]'),
            off: overlay.querySelector('.splash-music-btn[data-sno-music="off"]')
        };
    }

    function run() {
        var overlay = document.getElementById('splash-overlay');
        var btns = overlay && findButtons(overlay);
        if (!overlay || !btns.on || !btns.off) {
            finish('fail', 'missing splash overlay or music-choice buttons');
            return;
        }

        // Negative path: decline music. Should dismiss the splash, persist
        // '0', and actually leave the ambient engine stopped (not just the
        // localStorage side effect).
        try { localStorage.removeItem('snonuxAmbientEnabled'); } catch (_) {}
        btns.off.click();
        var declinedDismissed = overlay.classList.contains('splash--dismissed');
        var declinedPref = ambientPref();
        var declinedPlaying = ambientPlaying();

        // Re-open the splash (buttons must still be attached and working)
        // so the positive path starts from a clean slate.
        if (window._snonuxShowSplash) window._snonuxShowSplash();
        var reopened = !overlay.classList.contains('splash--dismissed');

        // Positive path: accept music. Should dismiss the splash, persist
        // '1', and actually start the ambient engine.
        btns.on.click();
        var acceptedDismissed = overlay.classList.contains('splash--dismissed');
        var acceptedPref = ambientPref();
        var acceptedPlaying = ambientPlaying();

        // Simulate the hazard the re-injection fix guards against:
        // snonuxSwitchTheme()/snonuxApplyThemeMeta() replace #splash-overlay's
        // entire innerHTML with a fresh theme's markup on the fly, which wipes
        // out anything appended to it — including these choice buttons. Drop
        // just the choice element (same end state as that wholesale replace)
        // and confirm the exported re-injector rebuilds a single, live copy.
        var inner = overlay.querySelector('.splash-inner');
        var choiceBeforeWipe = inner && inner.querySelector('.splash-music-choice');
        if (choiceBeforeWipe) choiceBeforeWipe.remove();
        var wiped = !overlay.querySelector('.splash-music-choice');
        if (window.snonuxRenderSplashMusicChoice) window.snonuxRenderSplashMusicChoice();
        var rebuilt = overlay.querySelectorAll('.splash-music-choice').length === 1;

        // The rebuilt buttons must be freshly wired, not stale references —
        // re-fetch them and exercise the decline path once more.
        try { localStorage.removeItem('snonuxAmbientEnabled'); } catch (_) {}
        if (window._snonuxShowSplash) window._snonuxShowSplash();
        var rebuiltBtns = findButtons(overlay);
        var rebuiltBtnsFound = !!(rebuiltBtns.on && rebuiltBtns.off);
        if (rebuiltBtnsFound) rebuiltBtns.off.click();
        var rebuiltDismissed = overlay.classList.contains('splash--dismissed');
        var rebuiltPref = ambientPref();
        // The prior scenario left the engine playing (acceptedPlaying), so this
        // decline must flip it back off too — not just the localStorage side effect.
        var rebuiltPlaying = ambientPlaying();

        // Regression check for the keyboard-focus fix: the document-level
        // splash keydown handler used to unconditionally preventDefault()
        // and dismiss on Enter/Space whenever the splash was open, which
        // swallows the native "activate the focused button" default action
        // a keyboard-only visitor relies on to actually press one of these
        // buttons. A trusted, browser-synthesized key press can't be faked
        // from page script, but we can verify the property our fix controls
        // directly: with a music button focused, our handler must leave the
        // event un-prevented and must not itself dismiss the splash, so the
        // browser is free to run its native button-activation default action.
        if (window._snonuxShowSplash) window._snonuxShowSplash();
        rebuiltBtns.off.focus();
        var focusedButtonIsActive = document.activeElement === rebuiltBtns.off;
        var enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        rebuiltBtns.off.dispatchEvent(enterEvent);
        var keydownPreventedByUs = enterEvent.defaultPrevented;
        var dismissedByGenericKeydown = overlay.classList.contains('splash--dismissed');

        var detail = 'declinedDismissed=' + declinedDismissed + ' declinedPref=' + declinedPref +
            ' declinedPlaying=' + declinedPlaying +
            ' reopened=' + reopened +
            ' acceptedDismissed=' + acceptedDismissed + ' acceptedPref=' + acceptedPref +
            ' acceptedPlaying=' + acceptedPlaying +
            ' wiped=' + wiped + ' rebuilt=' + rebuilt +
            ' rebuiltBtnsFound=' + rebuiltBtnsFound +
            ' rebuiltDismissed=' + rebuiltDismissed + ' rebuiltPref=' + rebuiltPref +
            ' rebuiltPlaying=' + rebuiltPlaying +
            ' focusedButtonIsActive=' + focusedButtonIsActive +
            ' keydownPreventedByUs=' + keydownPreventedByUs +
            ' dismissedByGenericKeydown=' + dismissedByGenericKeydown;

        var pass = declinedDismissed && declinedPref === '0' && !declinedPlaying &&
            reopened &&
            acceptedDismissed && acceptedPref === '1' && acceptedPlaying &&
            wiped && rebuilt &&
            rebuiltBtnsFound && rebuiltDismissed && rebuiltPref === '0' && !rebuiltPlaying &&
            focusedButtonIsActive && !keydownPreventedByUs && !dismissedByGenericKeydown;
        finish(pass ? 'pass' : 'fail', detail);
    }

    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run);
})();
`
	if err := os.WriteFile(filepath.Join(outputDir, "splash-music-choice-test.js"), []byte(harness), 0o644); err != nil {
		t.Fatalf("write splash-music-choice-test.js: %v", err)
	}
}

// TestScrollDrivenPostSelection verifies the generated page behavior in a real
// browser: scrolling the post container moves .post-active to the article
// nearest the container center.
func TestScrollDrivenPostSelection(t *testing.T) {
	chromium, ok := findChromium()
	if !ok {
		t.Skip("Chromium executable not found; skipping browser scroll-selection test")
	}

	inputDir, outputDir := makeDirs(t)
	for i := 0; i < 24; i++ {
		name := fmt.Sprintf("scroll-post-%02d.txt", i)
		content := fmt.Sprintf("Scroll selection fixture post %02d\n\n%s", i, strings.Repeat("body line\n", 6))
		if err := os.WriteFile(filepath.Join(inputDir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	runPipeline(t, inputDir, outputDir)
	writeScrollSelectionBrowserHarness(t, outputDir)

	testHTML := filepath.Join(outputDir, "scroll-selection-test.html")
	pageURL := url.URL{Scheme: "file", Path: testHTML}
	out, err := exec.Command(
		chromium,
		"--headless",
		"--disable-gpu",
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-background-networking",
		"--allow-file-access-from-files",
		"--window-size=900,700",
		"--virtual-time-budget=4000",
		"--dump-dom",
		pageURL.String(),
	).CombinedOutput()
	if err != nil {
		t.Fatalf("run headless Chromium: %v\n%s", err, string(out))
	}

	dom := string(out)
	if !strings.Contains(dom, `data-scroll-selection-test="pass"`) {
		t.Fatalf("scroll-driven post selection failed; result=%q DOM dump tail:\n%s",
			scrollSelectionBrowserResult(dom), dom[max(0, len(dom)-3000):])
	}
}

func findChromium() (string, bool) {
	for _, name := range []string{"chromium", "chromium-browser", "google-chrome", "google-chrome-stable"} {
		path, err := exec.LookPath(name)
		if err == nil {
			return path, true
		}
	}
	return "", false
}

func writeScrollSelectionBrowserHarness(t *testing.T, outputDir string) {
	t.Helper()

	indexPath := filepath.Join(outputDir, "index.html")
	html := readFile(t, indexPath)
	html = strings.ReplaceAll(html, `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>`, "")
	html = strings.ReplaceAll(html, `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">`, "")
	html = strings.Replace(html,
		`<script src="shared.js" defer></script>`,
		`<script>window.__snoTestNow = 1000; Date.now = function () { return window.__snoTestNow; };</script>`+"\n"+
			`    <script src="shared.js" defer></script>`+"\n"+
			`    <script src="scroll-selection-test.js" defer></script>`,
		1,
	)
	if err := os.WriteFile(filepath.Join(outputDir, "scroll-selection-test.html"), []byte(html), 0o644); err != nil {
		t.Fatalf("write scroll-selection-test.html: %v", err)
	}

	harness := `
(function () {
    function finish(status, detail) {
        document.body.setAttribute('data-scroll-selection-test', status);
        var pre = document.createElement('pre');
        pre.id = 'scroll-selection-test-result';
        pre.textContent = detail;
        document.body.appendChild(pre);
    }

    function postIndex(post) {
        return Array.prototype.indexOf.call(document.querySelectorAll('.post'), post);
    }

    function expectedCenterIndex(sc, posts) {
        var sr = sc.getBoundingClientRect();
        var centerY = sr.top + sr.height / 2;
        var bestIndex = -1;
        var bestDistance = Infinity;
        posts.forEach(function (post, index) {
            var r = post.getBoundingClientRect();
            if (r.top <= centerY && centerY < r.bottom) {
                bestIndex = index;
                bestDistance = -1;
                return;
            }
            if (bestDistance < 0 || r.bottom <= sr.top || r.top >= sr.bottom) return;
            var visibleTop = Math.max(r.top, sr.top);
            var visibleBottom = Math.min(r.bottom, sr.bottom);
            var distance = Math.abs(((visibleTop + visibleBottom) / 2) - centerY);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        });
        return bestIndex;
    }

    function run() {
        var sc = document.getElementById('post-content');
        var posts = Array.prototype.slice.call(document.querySelectorAll('.post'));
        if (!sc || posts.length < 8) {
            finish('fail', 'missing scroll container or posts');
            return;
        }
        if (sc.scrollHeight <= sc.clientHeight) {
            finish('fail', 'post container is not scrollable: scrollHeight=' + sc.scrollHeight + ' clientHeight=' + sc.clientHeight);
            return;
        }

        var target = posts[Math.min(10, posts.length - 2)];
        var targetTop = target.offsetTop - (sc.clientHeight / 2) + (target.offsetHeight / 2);
        sc.style.scrollBehavior = 'auto';
        var realRequestAnimationFrame = window.requestAnimationFrame;
        window.__snoTestNow += 1000;
        window.requestAnimationFrame = function (callback) {
            callback(performance.now());
            return 1;
        };
        sc.scrollTop = Math.max(0, Math.min(targetTop, sc.scrollHeight - sc.clientHeight));
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.requestAnimationFrame = realRequestAnimationFrame;

        var active = document.querySelector('.post.post-active');
        var activeIndex = postIndex(active);
        var expectedIndex = expectedCenterIndex(sc, posts);
        var detail = 'active=' + activeIndex + ' expected=' + expectedIndex + ' scrollTop=' + sc.scrollTop;
        if (expectedIndex <= 0) {
            finish('fail', 'scroll did not move center past the first post: ' + detail);
            return;
        }
        finish(activeIndex === expectedIndex ? 'pass' : 'fail', detail);
    }

    run();
})();
`
	if err := os.WriteFile(filepath.Join(outputDir, "scroll-selection-test.js"), []byte(harness), 0o644); err != nil {
		t.Fatalf("write scroll-selection-test.js: %v", err)
	}
}

func scrollSelectionBrowserResult(dom string) string {
	marker := `id="scroll-selection-test-result"`
	idx := strings.Index(dom, marker)
	if idx < 0 {
		return "missing result marker"
	}
	start := max(0, idx-200)
	end := min(len(dom), idx+500)
	return dom[start:end]
}

// TestIndexHTMLBakesSounds verifies that the generated index.html bakes the
// default theme's sounds into window.SNONUX_SOUNDS so the ambient engine can
// start before any async theme fetches complete.
func TestIndexHTMLBakesSounds(t *testing.T) {
	inputDir, outputDir := makeDirs(t)

	if err := os.WriteFile(filepath.Join(inputDir, "hello.txt"), []byte("sounds test"), 0o644); err != nil {
		t.Fatal(err)
	}

	runPipeline(t, inputDir, outputDir)

	index := readFile(t, filepath.Join(outputDir, "index.html"))
	assertContains(t, index, "window.SNONUX_SOUNDS", "index.html bakes SNONUX_SOUNDS")
	assertContains(t, index, `"ambient"`, "index.html sounds include ambient key")
	assertContains(t, index, `"normal"`, "index.html sounds include ambient.normal")
	assertContains(t, index, `"wild"`, "index.html sounds include ambient.wild")
}

// TestThemeSelection verifies that every registered theme renders a valid
// index.html containing core structural elements (post text, nav script).
func TestThemeSelection(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping long-running theme selection integration test in short mode")
	}

	themes := generator.ListThemes()
	if len(themes) == 0 {
		t.Fatal("no themes returned by ListThemes()")
	}

	for _, theme := range themes {
		theme := theme // capture for parallel sub-test

		t.Run(theme, func(t *testing.T) {
			inputDir, outputDir := makeDirs(t)

			if err := os.WriteFile(filepath.Join(inputDir, "hello.txt"), []byte("theme test post"), 0o644); err != nil {
				t.Fatal(err)
			}

			cfg := &config.Config{
				InputDir:  inputDir,
				OutputDir: outputDir,
				BaseURL:   "https://snonux.foo",
				Theme:     theme,
			}

			if _, err := processor.Run(ctx, cfg); err != nil {
				t.Fatalf("processor.Run: %v", err)
			}
			if err := generator.Run(ctx, cfg); err != nil {
				t.Fatalf("generator.Run for theme %q: %v", theme, err)
			}

			index := readFile(t, filepath.Join(outputDir, "index.html"))
			assertContains(t, index, "theme test post", "post text")
			assertContains(t, index, `data-index="0"`, "data-index attribute")
			assertContains(t, index, `SNONUX_DEFAULT_THEME = "`+theme+`"`, "default theme baked in")
			assertContains(t, index, "snonux v"+version.Version, "index.html header version")

			// Per-theme assets are written under themes/<theme>/.
			themeDir := filepath.Join(outputDir, "themes", theme)
			for _, fname := range []string{"theme.css", "theme.js", "meta.json", "sounds.json"} {
				path := filepath.Join(themeDir, fname)
				info, err := os.Stat(path)
				if err != nil {
					t.Fatalf("theme asset missing %s: %v", path, err)
				}
				if info.Size() == 0 {
					t.Fatalf("theme asset %s is empty", path)
				}
			}
			fontAssets := map[string][]string{
				"matrix": {"VT323-Regular.woff2", "FONT_LICENSE.txt"},
				"retro":  {"VT323-Regular.woff2", "FONT_LICENSE.txt"},
				"nukem":  {"Web437_IBM_VGA_8x16.woff", "FONT_LICENSE.txt"},
				"retrofuture": {
					"FONT_LICENSE.txt",
					"orbitron-v35-latin_latin-ext-700.woff2",
					"orbitron-v35-latin_latin-ext-regular.woff2",
					"share-tech-mono-v16-latin_latin-ext-regular.woff2",
				},
				"tropicale": {
					"FONT_LICENSE.txt",
					"quicksand-v37-latin_latin-ext-500.woff2",
					"quicksand-v37-latin_latin-ext-regular.woff2",
				},
			}
			fontURLs := map[string][]string{
				"matrix": {"url('VT323-Regular.woff2')"},
				"retro":  {"url('VT323-Regular.woff2')"},
				"nukem":  {"url('Web437_IBM_VGA_8x16.woff')"},
				"retrofuture": {
					"url('orbitron-v35-latin_latin-ext-700.woff2')",
					"url('orbitron-v35-latin_latin-ext-regular.woff2')",
					"url('share-tech-mono-v16-latin_latin-ext-regular.woff2')",
				},
				"tropicale": {
					"url('quicksand-v37-latin_latin-ext-500.woff2')",
					"url('quicksand-v37-latin_latin-ext-regular.woff2')",
				},
			}
			if assets, ok := fontAssets[theme]; ok {
				for _, fname := range assets {
					path := filepath.Join(themeDir, fname)
					info, err := os.Stat(path)
					if err != nil {
						t.Fatalf("%s extra asset missing %s: %v", theme, path, err)
					}
					if info.Size() == 0 {
						t.Fatalf("%s extra asset %s is empty", theme, path)
					}
				}

				themeCSS := readFile(t, filepath.Join(themeDir, "theme.css"))
				for _, fontURL := range fontURLs[theme] {
					assertContains(t, themeCSS, fontURL, theme+" local font URL")
				}
				for _, forbidden := range []string{"googleapis", "gstatic", "fonts.cdn", "@import url(http"} {
					if strings.Contains(themeCSS, forbidden) {
						t.Fatalf("%s theme.css contains runtime third-party font reference %q", theme, forbidden)
					}
				}
			}

			// sounds.json must include ambient data.
			soundsPath := filepath.Join(outputDir, "themes", theme, "sounds.json")
			soundsData, err := os.ReadFile(soundsPath)
			if err != nil {
				t.Fatalf("read sounds.json: %v", err)
			}
			var sounds map[string]interface{}
			if err := json.Unmarshal(soundsData, &sounds); err != nil {
				t.Fatalf("sounds.json invalid JSON: %v", err)
			}
			ambient, ok := sounds["ambient"].(map[string]interface{})
			if !ok {
				t.Fatalf("sounds.json missing ambient object for theme %q", theme)
			}
			for _, key := range []string{"normal", "wild"} {
				if _, ok := ambient[key]; !ok {
					t.Errorf("sounds.json ambient missing %q variant for theme %q", key, theme)
				}
			}
			for _, key := range []string{"normal", "wild"} {
				preset, ok := ambient[key].(map[string]interface{})
				if !ok {
					continue
				}
				if preset["file"] != "ambient.ogg" {
					t.Errorf("sounds.json ambient.%s file=%v for theme %q; want ambient.ogg", key, preset["file"], theme)
				}
			}
			for _, asset := range []string{"ambient.ogg", "MUSIC_LICENSE.txt"} {
				if _, err := os.Stat(filepath.Join(themeDir, asset)); err != nil {
					t.Errorf("%s missing generated %s: %v", theme, asset, err)
				}
			}

			metaData, err := os.ReadFile(filepath.Join(themeDir, "meta.json"))
			if err != nil {
				t.Fatalf("read generated meta.json: %v", err)
			}
			var meta struct {
				HeaderHTML string `json:"header_html"`
			}
			if err := json.Unmarshal(metaData, &meta); err != nil {
				t.Fatalf("generated meta.json invalid JSON: %v", err)
			}
			if !strings.Contains(meta.HeaderHTML, "snonux v"+version.Version) {
				t.Errorf("%s generated meta.json header missing version", theme)
			}

			// shared.js holds the nav logic.
			sharedJS := readFile(t, filepath.Join(outputDir, "shared.js"))
			assertContains(t, sharedJS, "playNavSound", "shared.js playNavSound")
		})
	}
}

func sampleRGBAImage() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			img.Set(x, y, color.RGBA{R: 0, G: 245, B: 255, A: 255})
		}
	}
	return img
}

// writeSamplePNG writes a small 10×10 solid-colour PNG to path.
func writeSamplePNG(t *testing.T, path string) {
	t.Helper()

	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if err := png.Encode(f, sampleRGBAImage()); err != nil {
		t.Fatal(err)
	}
}

// writeSampleJPEG writes a small valid JPEG to path.
func writeSampleJPEG(t *testing.T, path string) {
	t.Helper()

	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if err := jpeg.Encode(f, sampleRGBAImage(), &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
}

// writeSampleGIF writes a small single-frame GIF to path.
func writeSampleGIF(t *testing.T, path string) {
	t.Helper()

	bounds := image.Rect(0, 0, 10, 10)
	paletted := image.NewPaletted(bounds, palette.Plan9)
	for y := 0; y < 10; y++ {
		for x := 0; x < 10; x++ {
			paletted.SetColorIndex(x, y, 1)
		}
	}

	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	if err := gif.Encode(f, paletted, &gif.Options{}); err != nil {
		t.Fatal(err)
	}
}
