// Package processor scans the input directory for new source files and converts
// each one into a self-contained post directory under outdir/posts/.
// Supported formats: .txt, .md, .png, .jpg, .jpeg, .gif, .mp3.
// Each processed source file is deleted from the input directory afterward.
//
// Processing uses a two-phase commit pattern:
//  1. Scan and validate every inbox item without mutating anything.
//  2. Only after all items pass validation, execute mutations
//     (create directories, write assets, persist posts, remove sources).
//
// If validation fails for any item, the entire batch is aborted and the inbox
// is left untouched. If a mutation fails mid-batch, earlier items have already
// been committed; the failing item is rolled back and the error is returned
// together with the count of successfully committed posts.
//
// Markdown trust boundary: .md files are expected only from a trusted personal
// inbox (the operator’s own email or equivalent). Goldmark is configured with
// html.WithUnsafe so raw HTML and GFM features in those files pass through to
// post HTML intentionally. This is not a multi-tenant or public-submission
// pipeline; do not point an untrusted drop folder at the same input directory
// without replacing that rendering path with sanitization or a stricter parser.
package processor

import (
	"context"
	"fmt"
	"image"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/snonux/snonux.foo/internal/config"
	"github.com/snonux/snonux.foo/internal/post"
)

// PostBuilder is the abstraction used to validate and commit a single post type.
// Each concrete builder handles one file extension (e.g. .txt, .png, .mp3).
// Registering a new builder is enough to add support for a new type — no changes
// to the core planning or commit loops are required.
type PostBuilder interface {
	// Plan validates the source file and returns everything needed to commit it later.
	Plan(srcPath string, ext string) (postPlan, error)
	// Commit performs the mutations for this post type and returns the populated Post,
	// plus any extra inbox files that should be cleaned up after a successful save.
	Commit(plan postPlan, postDir string, id string, now time.Time) (*post.Post, []string, error)
}

// builders maps a lower-case file extension to its PostBuilder.
var builders = make(map[string]PostBuilder)

// register adds a PostBuilder for the given extension. Panics on duplicates so
// misconfiguration is caught at start-up.
func register(ext string, b PostBuilder) {
	ext = strings.ToLower(ext)
	if _, exists := builders[ext]; exists {
		panic(fmt.Sprintf("duplicate PostBuilder for extension %q", ext))
	}
	builders[ext] = b
}

// Run scans cfg.InputDir and processes every eligible file into a post directory
// under cfg.OutputDir/posts/. It uses a two-phase commit pattern:
//
//	Phase 1 — scan and validate all inbox items without mutating anything.
//	Phase 2 — only after all items pass validation, execute mutations
//	          (create directories, write assets, persist posts, remove sources).
//
// If Phase 1 fails for any item, no mutations occur and the inbox is left untouched.
// Returns the number of posts successfully created in this invocation.
// The ctx parameter is accepted for cancellation propagation; it is currently
// wired through for API consistency.
func Run(ctx context.Context, cfg *config.Config) (int, error) {
	return runAt(ctx, cfg, time.Now().UTC())
}

// runAt takes one clock reading for the entire batch, including due-date checks.
func runAt(ctx context.Context, cfg *config.Config, now time.Time) (int, error) {
	entries, err := os.ReadDir(cfg.InputDir)
	if err != nil {
		return 0, fmt.Errorf("read input dir %s: %w", cfg.InputDir, err)
	}

	postsDir := filepath.Join(cfg.OutputDir, "posts")
	if err := os.MkdirAll(postsDir, 0o755); err != nil {
		return 0, fmt.Errorf("create posts dir: %w", err)
	}

	claimed, err := claimedByMarkdown(entries, cfg.InputDir)
	if err != nil {
		return 0, err
	}

	// Phase 1 — validate everything, collect work, mutate nothing.
	var plans []postPlan
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if claimed[entry.Name()] {
			continue
		}

		srcPath := filepath.Join(cfg.InputDir, entry.Name())
		var publishAt time.Time
		if strings.EqualFold(filepath.Ext(srcPath), ".md") {
			_, publishAt, err = readMarkdown(srcPath)
			if err != nil {
				return 0, err
			}
			if publishAt.After(now) {
				log.Printf("scheduled %s for %s; leaving in inbox", entry.Name(), publishAt.Format(time.RFC3339))
				continue
			}
		}
		plan, err := planPost(srcPath)
		if err != nil {
			return 0, fmt.Errorf("plan %s: %w", entry.Name(), err)
		}
		plan.publishAt = publishAt
		plans = append(plans, plan)
	}

	// Phase 2 — commit all mutations.
	count := 0
	for _, plan := range plans {
		published := now
		if !plan.publishAt.IsZero() {
			published = plan.publishAt
		}
		if err := commitPlan(plan, postsDir, published); err != nil {
			return count, fmt.Errorf("commit %s: %w", filepath.Base(plan.srcPath), err)
		}
		count++
	}

	return count, nil
}

// postPlan captures everything validated in Phase 1 for a single source file.
// No file-system mutations are recorded here; only validated content.
type postPlan struct {
	publishAt      time.Time
	srcPath        string
	ext            string
	textHTML       string
	mdHTML         string
	localImages    []string
	validatedImage image.Image
	builder        PostBuilder
}

// planPost validates a single source file and returns a plan containing
// everything needed to commit it later. It performs no mutations.
func planPost(srcPath string) (postPlan, error) {
	ext := strings.ToLower(filepath.Ext(srcPath))
	b, ok := builders[ext]
	if !ok {
		return postPlan{}, fmt.Errorf("unsupported file type: %s", ext)
	}
	plan, err := b.Plan(srcPath, ext)
	if err != nil {
		return postPlan{}, err
	}
	plan.builder = b
	return plan, nil
}

// commitPlan generates a unique ID, creates the post directory, writes assets,
// persists the post metadata, and removes the source file.
func commitPlan(plan postPlan, postsDir string, now time.Time) error {
	id, err := uniqueID(postsDir, now)
	if err != nil {
		return fmt.Errorf("generate unique ID: %w", err)
	}

	postDir := filepath.Join(postsDir, id)
	if err := os.MkdirAll(postDir, 0o755); err != nil {
		return fmt.Errorf("create post dir %s: %w", id, err)
	}

	p, inboxExtras, err := plan.builder.Commit(plan, postDir, id, now)
	if err != nil {
		_ = os.RemoveAll(postDir)
		return err
	}

	if err := p.Save(postDir); err != nil {
		_ = os.RemoveAll(postDir)
		return err
	}

	// Deduplicate extras in case the same file is referenced multiple times.
	seen := make(map[string]bool, len(inboxExtras))
	for _, path := range inboxExtras {
		if seen[path] {
			continue
		}
		seen[path] = true
		if err := os.Remove(path); err != nil {
			_ = os.RemoveAll(postDir)
			return fmt.Errorf("remove inbox extra %s: %w", path, err)
		}
	}

	return os.Remove(plan.srcPath)
}

// claimedByMarkdown scans all .md entries in inputDir and returns a set of
// image filenames that are referenced within those markdown files.
// Those images should be embedded in the markdown post, not processed alone.
// If two different markdown files claim the same image, an error is returned.
func claimedByMarkdown(entries []os.DirEntry, inputDir string) (map[string]bool, error) {
	claimed := make(map[string]bool)
	// owners tracks which markdown file first claimed each image so we can
	// detect conflicts before processing begins.
	owners := make(map[string]string)

	for _, entry := range entries {
		if entry.IsDir() || strings.ToLower(filepath.Ext(entry.Name())) != ".md" {
			continue
		}

		mdPath := filepath.Join(inputDir, entry.Name())
		data, err := os.ReadFile(mdPath)
		if err != nil {
			return nil, fmt.Errorf("read markdown for image claims %s: %w", entry.Name(), err)
		}

		for _, imgName := range findLocalImages(string(data), inputDir) {
			if owner, exists := owners[imgName]; exists && owner != entry.Name() {
				return nil, fmt.Errorf("image %q claimed by both %q and %q", imgName, owner, entry.Name())
			}
			owners[imgName] = entry.Name()
			claimed[imgName] = true
		}
	}

	return claimed, nil
}

// uniqueID generates a post ID for the given time that does not already exist
// as a directory under postsDir. Appends a numeric suffix if needed.
func uniqueID(postsDir string, t time.Time) (string, error) {
	for i := 0; ; i++ {
		id := post.NewID(t, i)
		_, err := os.Stat(filepath.Join(postsDir, id))
		if err != nil {
			if os.IsNotExist(err) {
				return id, nil
			}
			return "", fmt.Errorf("stat post dir %s: %w", id, err)
		}
	}
}
