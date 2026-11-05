package processor

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/snonux/snonux.foo/internal/config"
	"github.com/snonux/snonux.foo/internal/post"
)

func TestScheduledWeeklyPosts(t *testing.T) {
	t.Parallel()
	in, out := t.TempDir(), t.TempDir()
	cfg := &config.Config{InputDir: in, OutputDir: out}
	first := time.Date(2026, 11, 12, 8, 0, 0, 0, time.UTC)
	write := func(name, content string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(in, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for i := range 3 {
		at := first.AddDate(0, 0, 7*i)
		name := fmt.Sprintf("week-%d", i)
		// Markdown assets are copied verbatim; these bytes need no decoder.
		write(name+".png", "private future image")
		write(name+".md", fmt.Sprintf("<!-- publish-at: %s -->\r\n\r\nWeek %d\n![shot](%s.png)", at.In(time.FixedZone("EET", 7200)).Format(time.RFC3339), i, name))
	}
	write("now.txt", "Immediate post")
	if n, err := runAt(context.Background(), cfg, first.Add(-time.Second)); err != nil || n != 1 {
		t.Fatalf("before schedule: n=%d err=%v", n, err)
	}
	for i := range 3 {
		at := first.AddDate(0, 0, 7*i)
		if n, err := runAt(context.Background(), cfg, at); err != nil || n != 1 {
			t.Fatalf("week %d: n=%d err=%v", i, n, err)
		}
		pdir := filepath.Join(out, "posts", post.NewID(at, 0))
		p, err := post.Load(pdir)
		if err != nil {
			t.Fatal(err)
		}
		if !p.Timestamp.Equal(at) || strings.Contains(p.Content, "publish-at") {
			t.Fatalf("wrong publication metadata: %+v", p)
		}
		asset := fmt.Sprintf("week-%d.png", i)
		if _, err := os.Stat(filepath.Join(pdir, asset)); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(in, asset)); !os.IsNotExist(err) {
			t.Fatalf("published asset should be consumed: %v", err)
		}
		entries, err := os.ReadDir(in)
		if err != nil || len(entries) != 2*(2-i) {
			t.Fatalf("future sources/assets missing: entries=%v err=%v", entries, err)
		}
		if n, err := runAt(context.Background(), cfg, at); err != nil || n != 0 {
			t.Fatalf("repeat run: n=%d err=%v", n, err)
		}
	}
}

func TestInvalidScheduleLeavesBatchUntouched(t *testing.T) {
	t.Parallel()
	for _, directive := range []string{
		"<!-- publish-at: tomorrow -->",
		"<!-- publish-at: 2026-11-12T10:00:00 -->",
		"<!-- publish-at: 2026-11-12T10:00:00+02:00",
	} {
		t.Run(directive, func(t *testing.T) {
			in, out := t.TempDir(), t.TempDir()
			for name, content := range map[string]string{"a.txt": "ready", "z.md": directive + "\nFuture post"} {
				if err := os.WriteFile(filepath.Join(in, name), []byte(content), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			if n, err := Run(context.Background(), &config.Config{InputDir: in, OutputDir: out}); err == nil || n != 0 {
				t.Fatalf("invalid schedule accepted: n=%d err=%v", n, err)
			}
			entries, err := os.ReadDir(in)
			if err != nil || len(entries) != 2 {
				t.Fatalf("inbox mutated: %v %v", entries, err)
			}
			posts, err := os.ReadDir(filepath.Join(out, "posts"))
			if err != nil || len(posts) != 0 {
				t.Fatalf("batch partially published: %v %v", posts, err)
			}
		})
	}
}
