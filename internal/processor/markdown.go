package processor

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/snonux/snonux.foo/internal/post"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
)

type mdBuilder struct{}

func (mdBuilder) Plan(srcPath string, ext string) (postPlan, error) {
	plan := postPlan{srcPath: srcPath, ext: ext}
	html, locals, err := processMd(srcPath)
	if err != nil {
		return postPlan{}, err
	}
	plan.mdHTML = html
	plan.localImages = locals
	return plan, nil
}

func (mdBuilder) Commit(plan postPlan, postDir string, id string, now time.Time) (*post.Post, []string, error) {
	html := plan.mdHTML
	for _, name := range plan.localImages {
		html = strings.ReplaceAll(html,
			fmt.Sprintf(`src="%s"`, name),
			fmt.Sprintf(`src="posts/%s/%s"`, id, name))
	}

	var inboxExtras []string
	sourceDir := filepath.Dir(plan.srcPath)
	for _, name := range plan.localImages {
		src := filepath.Join(sourceDir, name)
		dst := filepath.Join(postDir, name)
		if err := copyFile(src, dst); err != nil {
			return nil, nil, fmt.Errorf("copy markdown asset %s: %w", name, err)
		}
		inboxExtras = append(inboxExtras, src)
	}

	p := &post.Post{
		ID:        id,
		Timestamp: now,
		PostType:  post.TypeMarkdown,
		Content:   html,
		Assets:    plan.localImages,
	}
	return p, inboxExtras, nil
}

func init() {
	register(".md", mdBuilder{})
}

// isSimpleImageRef returns true for a filename-only reference (e.g.
// "img.png") that is safe to treat as a flat local file in the same
// directory as the markdown source. It rejects subdirectories, absolute
// paths, dot-slash prefixes, and parent-directory traversal so stat and
// copy targets stay within the source directory.
func isSimpleImageRef(ref string) bool {
	if strings.Contains(ref, "..") {
		return false
	}
	return filepath.Base(ref) == ref
}

// imageRefPattern matches Markdown image syntax: ![alt](filename)
// We use it to discover local asset references that must be copied.
var imageRefPattern = regexp.MustCompile(`!\[[^\]]*\]\(([^)]+)\)`)

// processMd converts a Markdown file to an HTML snippet for a trusted inbox source.
// The markdown (including any raw HTML blocks) is treated as author-controlled
// content, not user-generated input from strangers; see the package comment.
//
// Returns the HTML and a list of local image filenames referenced in the document.
// Referenced images that exist alongside the source file are returned so the
// caller can copy them into the post asset directory.
func processMd(path string) (htmlContent string, localImages []string, err error) {
	data, _, err := readMarkdown(path)
	if err != nil {
		return "", nil, fmt.Errorf("read markdown %s: %w", path, err)
	}

	// Collect local image references so the caller can copy them as assets.
	localImages = findLocalImages(string(data), filepath.Dir(path))

	md := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithRendererOptions(
			// Trusted inbox: preserve raw HTML in markdown (see package comment).
			html.WithUnsafe(),
		),
	)

	var buf bytes.Buffer
	if err := md.Convert(data, &buf); err != nil {
		return "", nil, fmt.Errorf("convert markdown %s: %w", path, err)
	}

	return buf.String(), localImages, nil
}

// findLocalImages returns image filenames referenced in markdown that actually
// exist in sourceDir. Remote URLs (http/https) are ignored.
func findLocalImages(mdContent, sourceDir string) []string {
	matches := imageRefPattern.FindAllStringSubmatch(mdContent, -1)
	var locals []string

	for _, m := range matches {
		ref := m[1]
		// Skip remote URLs.
		if strings.HasPrefix(ref, "http://") || strings.HasPrefix(ref, "https://") {
			continue
		}

		// Reject references that traverse directories or contain path
		// separators; only flat filenames next to the markdown are
		// supported. This prevents scans from succeeding on a file
		// deep in a subdirectory and then failing copy because the
		// basename is looked up in the wrong directory.
		if !isSimpleImageRef(ref) {
			continue
		}

		candidate := filepath.Join(sourceDir, ref)
		if _, err := os.Stat(candidate); err == nil {
			locals = append(locals, ref)
		}
	}

	return locals
}
