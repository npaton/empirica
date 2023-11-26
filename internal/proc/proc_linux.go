//go:build linux
// +build linux

package proc

import (
	"context"
	"os/exec"
	"syscall"
)

func New(path string, args ...string) *exec.Cmd {
	ctx := context.Background()

	return NewContext(ctx, path, args...)
}

func NewContext(ctx context.Context, path string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, path, args...)

	cmd.SysProcAttr = &syscall.SysProcAttr{
		Pdeathsig: syscall.SIGTERM,
	}

	return cmd
}
