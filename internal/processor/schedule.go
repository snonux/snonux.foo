package processor

import (
	"bytes"
	"fmt"
	"os"
	"strings"
	"time"
)

// readMarkdown recognizes an optional first-line scheduling directive. Requiring
// a timezone keeps publication independent of the machine running the generator.
// A malformed directive is an error, never a request to publish immediately.
func readMarkdown(path string) ([]byte, time.Time, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("read markdown %s: %w", path, err)
	}
	line, body, _ := bytes.Cut(data, []byte("\n"))
	header := strings.TrimSpace(string(line))
	const prefix = "<!-- publish-at:"
	if !strings.HasPrefix(header, prefix) {
		return data, time.Time{}, nil
	}
	if !strings.HasSuffix(header, "-->") {
		return nil, time.Time{}, fmt.Errorf("%s: publish-at directive must end with -->", path)
	}
	value := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(header, prefix), "-->"))
	at, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("%s: publish-at must be an RFC3339 timestamp with timezone: %w", path, err)
	}
	return body, at.UTC(), nil
}
