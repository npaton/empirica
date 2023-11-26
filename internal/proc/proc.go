//go:build !linux
// +build !linux

package subprocess

import (
	"context"
	"os/exec"
)

func New(path string, args ...string) *exec.Cmd {
	ctx := context.Background()

	return NewContext(ctx, path, args...)
}

func NewContext(ctx context.Context, path string, args ...string) *exec.Cmd {
	return exec.CommandContext(ctx, path, args...)
}
