package generator

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/snonux/snonux.foo/internal/config"
	"github.com/snonux/snonux.foo/internal/generator/templates"
	"github.com/snonux/snonux.foo/internal/post"
)

// gameScriptName is the per-theme file that holds a theme's arcade game.
const gameScriptName = "game.js"

// registerCall matches SnoGame.register('<theme>', …) however the engine
// object is named inside the script (G.register, SnoGame.register, …).
var registerCall = regexp.MustCompile(`\.register\(\s*['"]([^'"]*)['"]`)

// checkGameScript verifies that a theme's game.js registers exactly one game,
// under the theme's own name, and that the engine manifest lists that theme.
// shared/games.js launches a game by theme name, so a mismatch in either
// place would leave the launch button dead.
func checkGameScript(theme string, script []byte, engine string) error {
	calls := registerCall.FindAllSubmatch(script, -1)
	if len(calls) != 1 {
		return fmt.Errorf("theme %q: want exactly 1 register call in %s, found %d", theme, gameScriptName, len(calls))
	}
	if got := string(calls[0][1]); got != theme {
		return fmt.Errorf("theme %q: %s registers as %q", theme, gameScriptName, got)
	}
	if !regexp.MustCompile(`\b` + regexp.QuoteMeta(theme) + `: '`).MatchString(engine) {
		return fmt.Errorf("theme %q: missing from the TITLES manifest in games.js", theme)
	}
	return nil
}

// titlesBlock captures the body of the TITLES object literal in games.js, and
// titleKey each `name: '` entry inside it.
var (
	titlesBlock = regexp.MustCompile(`(?s)var TITLES = \{(.*?)\};`)
	titleKey    = regexp.MustCompile(`([a-z0-9]+): '`)
)

// manifestThemes returns the theme names listed in the engine's TITLES
// manifest, in file order; nil when the block is missing.
func manifestThemes(engine string) []string {
	block := titlesBlock.FindStringSubmatch(engine)
	if block == nil {
		return nil
	}
	var names []string
	for _, m := range titleKey.FindAllStringSubmatch(block[1], -1) {
		names = append(names, m[1])
	}
	return names
}

// themeGameScript returns the theme's game.js, or nil when it has none.
func themeGameScript(t *testing.T, theme string) []byte {
	t.Helper()

	extras, err := templates.ThemeExtraFiles(theme)
	if err != nil {
		t.Fatalf("list %s extras: %v", theme, err)
	}
	for _, f := range extras {
		if f.Name == gameScriptName {
			return f.Data
		}
	}
	return nil
}

func TestThemeGames_registerUnderOwnName(t *testing.T) {
	t.Parallel()

	engine, err := templates.SharedGamesJS()
	if err != nil {
		t.Fatalf("read games.js: %v", err)
	}

	themes := ListThemes()
	if len(themes) == 0 {
		t.Fatal("no themes found")
	}
	for _, theme := range themes {
		script := themeGameScript(t, theme)
		if script == nil {
			// Every theme must come with its own game: the launch buttons
			// are shown for every theme listed in the engine manifest.
			t.Errorf("theme %q ships no %s", theme, gameScriptName)
			continue
		}
		if err := checkGameScript(theme, script, string(engine)); err != nil {
			t.Error(err)
		}
	}
}

// TestGamesManifest_listsOnlyRealThemes guards the other direction: a title in
// the engine manifest for a theme that does not exist would never be shown,
// and usually means a theme was renamed without its game.
func TestGamesManifest_listsOnlyRealThemes(t *testing.T) {
	t.Parallel()

	engine, err := templates.SharedGamesJS()
	if err != nil {
		t.Fatalf("read games.js: %v", err)
	}
	listed := manifestThemes(string(engine))
	if len(listed) == 0 {
		t.Fatal("no themes found in the TITLES manifest")
	}

	known := make(map[string]bool)
	for _, theme := range ListThemes() {
		known[theme] = true
	}
	for _, theme := range listed {
		if !known[theme] {
			t.Errorf("TITLES manifest lists %q, which is not a theme", theme)
		}
	}
	if len(listed) != len(known) {
		t.Errorf("TITLES manifest lists %d themes, want %d", len(listed), len(known))
	}
}

func TestManifestThemes_parsesTitlesBlock(t *testing.T) {
	t.Parallel()

	engine := "var TITLES = {\n  neon: 'Light Cycles', dos: 'DIGGER.EXE',\n  ocean: 'Deep Channel'\n};\nvar other = { nope: 'x' };"
	got := strings.Join(manifestThemes(engine), ",")
	if got != "neon,dos,ocean" {
		t.Errorf("manifestThemes = %q, want neon,dos,ocean", got)
	}
	if n := len(manifestThemes("var nothing = 1;")); n != 0 {
		t.Errorf("manifestThemes without a TITLES block returned %d names, want 0", n)
	}
}

func TestCheckGameScript_rejectsBrokenScripts(t *testing.T) {
	t.Parallel()

	engine := "var TITLES = { neon: 'Light Cycles' };"
	cases := []struct {
		name   string
		theme  string
		script string
		want   string
	}{
		{"valid", "neon", "G.register('neon', {});", ""},
		{"empty script", "neon", "", "found 0"},
		{"wrong name", "neon", "G.register('ocean', {});", `registers as "ocean"`},
		{"two games", "neon", "G.register('neon', {}); G.register('neon', {});", "found 2"},
		{"not in manifest", "ocean", `SnoGame.register("ocean", {});`, "missing from the TITLES manifest"},
	}

	for _, tc := range cases {
		err := checkGameScript(tc.theme, []byte(tc.script), engine)
		switch {
		case tc.want == "" && err != nil:
			t.Errorf("%s: unexpected error %v", tc.name, err)
		case tc.want != "" && (err == nil || !strings.Contains(err.Error(), tc.want)):
			t.Errorf("%s: got error %v, want one containing %q", tc.name, err, tc.want)
		}
	}
}

func TestRun_writesGameAssets(t *testing.T) {
	t.Parallel()

	out := t.TempDir()
	postDir := filepath.Join(out, "posts", "g1")
	if err := os.MkdirAll(postDir, 0o755); err != nil {
		t.Fatal(err)
	}
	p := &post.Post{ID: "g1", Timestamp: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC), PostType: post.TypeText, Content: "<p>hi</p>"}
	if err := p.Save(postDir); err != nil {
		t.Fatal(err)
	}
	if err := Run(ctx, &config.Config{OutputDir: out, BaseURL: "https://example.test", Theme: "neon"}); err != nil {
		t.Fatalf("Run: %v", err)
	}

	wantIn := map[string][]string{
		"games.js": {"window.SnoGame"},
		// The menu of all games needs the engine, so it is loaded after it.
		"index.html":                     {`<script src="games.js" defer></script>`, `<script src="arcade.js" defer></script>`},
		"arcade.js":                      {"window.SnoArcade"},
		"shared.css":                     {"#sno-arcade", "#sno-game {"},
		"shared.js":                      {"snonuxGameLaunch"},
		"themes/breakout/game.js":        {"G.register('breakout'"},
		"themes/breakout/game-thumb.jpg": {"JFIF"},
		"themes/breakout/theme.css":      {""},
	}
	checkOutputContains(t, out, wantIn)

	// The engine is a shared asset: it must not be duplicated into themes.
	if _, err := os.Stat(filepath.Join(out, "themes", "neon", "games.js")); !os.IsNotExist(err) {
		t.Errorf("themes/neon/games.js should not exist (err=%v)", err)
	}
}

// checkOutputContains reads each named file below dir and requires its
// needles to appear in it, in the order given.
func checkOutputContains(t *testing.T, dir string, wantIn map[string][]string) {
	t.Helper()

	for name, needles := range wantIn {
		data, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(name)))
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		// Needles of one file must appear in the order given.
		rest := string(data)
		for _, needle := range needles {
			at := strings.Index(rest, needle)
			if at < 0 {
				t.Errorf("%s does not contain %q (after the needles before it)", name, needle)
				break
			}
			rest = rest[at+len(needle):]
		}
	}
}

// levelNamesList captures the body of a game's levelNames array literal, and
// quotedName each single- or double-quoted entry inside it.
var (
	levelNamesList = regexp.MustCompile(`(?s)levelNames:\s*\[(.*?)\]`)
	quotedName     = regexp.MustCompile(`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"`)
	engineLevels   = regexp.MustCompile(`\bLEVELS = (\d+)\b`)
)

// countLevelNames returns how many names a game's levelNames lists, or -1
// when the script declares no levelNames array.
func countLevelNames(script string) int {
	m := levelNamesList.FindStringSubmatch(script)
	if m == nil {
		return -1
	}
	return len(quotedName.FindAllString(m[1], -1))
}

// TestThemeGames_haveThreeLevels pins the three-level campaign: the engine
// plays exactly three levels, so every game must name exactly three. A game
// with more names would show levels nobody can reach, one with fewer would
// leave a level nameless on the HUD.
func TestThemeGames_haveThreeLevels(t *testing.T) {
	t.Parallel()

	engine, err := templates.SharedGamesJS()
	if err != nil {
		t.Fatalf("read games.js: %v", err)
	}
	if m := engineLevels.FindStringSubmatch(string(engine)); m == nil || m[1] != "3" {
		t.Fatalf("games.js must declare LEVELS = 3, found %v", m)
	}
	for _, theme := range ListThemes() {
		script := themeGameScript(t, theme)
		if script == nil {
			continue // reported by TestThemeGames_registerUnderOwnName
		}
		if n := countLevelNames(string(script)); n != 3 {
			t.Errorf("theme %q: want 3 levelNames, found %d", theme, n)
		}
	}
}

func TestCountLevelNames(t *testing.T) {
	t.Parallel()

	cases := []struct {
		script string
		want   int
	}{
		{`levelNames: ['A', 'B', 'C'],`, 3},
		{"levelNames: [\n 'It\\'s', \"Two\",\n 'Three' ]", 3},
		{`levelNames: [],`, 0},
		{`title: 'x'`, -1},
	}
	for _, tc := range cases {
		if got := countLevelNames(tc.script); got != tc.want {
			t.Errorf("countLevelNames(%q) = %d, want %d", tc.script, got, tc.want)
		}
	}
}
