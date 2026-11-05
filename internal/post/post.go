// Package post defines the Post data model and its JSON serialisation format.
// Each post is stored as post.json inside its own directory under outdir/posts/.
// This allows pages to be re-generated without re-processing the original inputs.
package post

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Type enumerates the supported input content types.
type Type string

const (
	TypeText     Type = "text"
	TypeMarkdown Type = "markdown"
	TypeImage    Type = "image"
	TypeAudio    Type = "audio"
)

// Post represents a single microblog entry.
// It is persisted as post.json in outdir/posts/<ID>/.
type Post struct {
	// ID is the unique directory-name-safe timestamp, e.g. "2026-04-09-143022".
	ID string `json:"id"`

	// Timestamp is the publication time (UTC): the scheduled time, if provided,
	// otherwise the moment the post was processed.
	Timestamp time.Time `json:"timestamp"`

	// PostType determines how the content was generated and how it should be rendered.
	PostType Type `json:"type"`

	// Content is the pre-rendered HTML snippet for this post (without outer post-card wrapper).
	Content string `json:"content"`

	// Assets lists filenames (not paths) of any asset files stored alongside post.json.
	Assets []string `json:"assets,omitempty"`
}

// Load reads and parses post.json from dir.
func Load(dir string) (*Post, error) {
	path := filepath.Join(dir, "post.json")

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read post.json in %s: %w", dir, err)
	}

	var p Post
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("unmarshal post.json in %s: %w", dir, err)
	}

	return &p, nil
}

// NewID generates a unique post ID from the given time.
// Format: YYYY-MM-DD-HHmmss, optionally suffixed with -N for collisions.
func NewID(t time.Time, suffix int) string {
	base := t.UTC().Format("2006-01-02-150405")
	if suffix == 0 {
		return base
	}

	return fmt.Sprintf("%s-%d", base, suffix)
}

// Save writes the post as post.json into dir.
func (p *Post) Save(dir string) error {
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal post %s: %w", p.ID, err)
	}

	path := filepath.Join(dir, "post.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write post.json for %s: %w", p.ID, err)
	}

	return nil
}
