//go:build mage
// +build mage

// Magefile provides build automation for the snonux microblog generator.
package main

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/magefile/mage/mg"
)

// Default runs when `mage` is invoked with no arguments (same as `mage build`).
var Default = Build

// Build compiles the snonux binary for the current platform.
func Build() error {
	fmt.Println("Building snonux...")
	cmd := exec.Command("go", "build", "-o", "snonux", "./cmd/snonux")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Install compiles and installs snonux to $GOBIN, $GOPATH/bin, or the default Go bin path.
func Install() error {
	fmt.Println("Installing snonux...")
	cmd := exec.Command("go", "install", "./cmd/snonux")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Dev builds snonux with race detection enabled. Runs Vet and Lint first.
func Dev() error {
	mg.Deps(Vet, Lint)
	fmt.Println("Building with race detector...")
	cmd := exec.Command("go", "build", "-race", "-o", "snonux", "./cmd/snonux")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Test runs the unit tests in all internal packages.
func Test() error {
	fmt.Println("Running unit tests...")
	cmd := exec.Command("go", "test", "./internal/...")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// IntegrationTest runs the end-to-end integration tests.
func IntegrationTest() error {
	fmt.Println("Running integration tests...")
	cmd := exec.Command("go", "test", "-v", "./integrationtests/...")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// GamesE2E smoke-tests every theme's arcade game in headless Chrome:
// launchers, input, audio, the three levels, the ending and the save cookie
// (wins are forced where the random bot fails; see GamesCampaign for real
// play). Needs node 22+ and Chrome or Chromium; see docs/games.md.
func GamesE2E() error {
	fmt.Println("Running theme game browser tests...")
	cmd := exec.Command("node", "integrationtests/games/e2e.mjs")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// GamesTouchE2E runs the phone checks for every theme's arcade game: an
// emulated phone in both orientations, driven by real touch events (pad
// layout, pad buttons, canvas taps). Same requirements as GamesE2E.
func GamesTouchE2E() error {
	fmt.Println("Running theme game touch tests...")
	cmd := exec.Command("node", "integrationtests/games/e2e.mjs", "--touch")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// GamesCampaign is the playability test: each theme's own bot plays the
// whole three-level campaign by input only, through to the ending, on a
// desktop and on a phone in both orientations. Same requirements as GamesE2E.
func GamesCampaign() error {
	fmt.Println("Running theme game campaigns...")
	for _, profile := range [][]string{nil, {"--touch=landscape"}, {"--touch=portrait"}} {
		args := append([]string{"integrationtests/games/campaign.mjs"}, profile...)
		cmd := exec.Command("node", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return err
		}
	}
	return nil
}

// Vet runs go vet on all packages to catch common mistakes.
func Vet() error {
	fmt.Println("Vetting...")
	cmd := exec.Command("go", "vet", "./...")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Lint runs golangci-lint on the codebase.
func Lint() error {
	fmt.Println("Linting...")
	cmd := exec.Command("golangci-lint", "run")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Generate builds snonux (if needed) and runs it to process any new inbox files
// and regenerate the full static site in ~/git/snonux.foo/dist.
func Generate() error {
	mg.Deps(Build)
	fmt.Println("Generating site...")
	cmd := exec.Command("./snonux")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// Clean removes the compiled binary.
func Clean() error {
	fmt.Println("Cleaning...")
	return os.Remove("snonux")
}
