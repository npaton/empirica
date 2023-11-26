package empctl

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"

	"github.com/empiricaly/empirica/internal/experiment"
	"github.com/empiricaly/empirica/internal/net"
	"github.com/empiricaly/empirica/internal/proc"
	"github.com/empiricaly/empirica/internal/settings"
	"github.com/masterminds/semver"
	"github.com/pkg/errors"
	"github.com/rs/zerolog/log"
)

type Config struct {
	UseDevBuild bool
	UseVersion  string

	Dir            string
	Name           string
	ClientTemplate string
	ServerTemplate string

	// If the experiment folder already exists, clear it before setup
	Clear bool

	// If the experiment folder already exists, reset it before setup (clear
	// data).
	Reset bool

	// Cleanup the experiment folder after the experiment is done.
	Cleanup bool
}

func (c *Config) Validate() error {
	if c.UseDevBuild && c.UseVersion != "" {
		return errors.New("cannot use dev build and version at the same time")
	}

	if !c.UseDevBuild && c.UseVersion == "" {
		return errors.New("must use dev build or version")
	}

	if c.UseVersion != "" {
		_, err := semver.NewVersion(c.UseVersion)
		if err != nil {
			return errors.Wrap(err, "invalid version")
		}
	}

	if c.Dir == "" {
		var err error

		c.Dir, err = os.MkdirTemp("", "empirica-*")
		if err != nil {
			return errors.Wrap(err, "create temp dir")
		}
	}

	if c.Name == "" {
		c.Name = "experiment"
	}

	if c.ClientTemplate == "" {
		c.ClientTemplate = "react"
	}

	if c.ServerTemplate == "" {
		c.ServerTemplate = "callbacks"
	}

	if c.Clear && c.Reset {
		return errors.New("cannot clear and reset at the same time")
	}

	return nil
}

type Instance struct {
	config *Config
	port   int
	cmd    *exec.Cmd
}

func New(config *Config) (*Instance, error) {
	if err := config.Validate(); err != nil {
		return nil, errors.Wrap(err, "validate config")
	}

	return &Instance{config: config}, nil
}

func (i *Instance) Addr() (string, error) {
	if i.port == 0 {
		return "", errors.New("instance not running")
	}

	return fmt.Sprintf("http://localhost:%d", i.port), nil
}

func (i *Instance) empiricaCommand() string {
	if i.config.UseDevBuild {
		return "emp"
	}

	return "empirirca"
}

func (i *Instance) dir() string {
	return path.Join(i.config.Dir, i.config.Name)
}

func (i *Instance) Setup(ctx context.Context) error {
	if !i.config.UseDevBuild {
		os.Setenv("EMPIRICA_BUILD", fmt.Sprintf("version: %s", i.config.UseVersion))
	}

	if err := settings.InstallVoltaIfNeeded(ctx); err != nil {
		return errors.Wrap(err, "check node")
	}

	var found bool
	if _, err := os.Stat(i.dir()); err == nil {
		found = true

		if i.config.Clear {
			if err := os.RemoveAll(i.dir()); err != nil {
				return errors.Wrap(err, "clear experiment folder")
			}
		} else if i.config.Reset {
			if err := experiment.Reset(ctx, i.dir()); err != nil {
				return errors.Wrap(err, "reset experiment")
			}
		}
	}

	if err := experiment.Create(
		ctx,
		i.config.Name,
		i.dir(),
		i.config.ClientTemplate,
		i.config.ServerTemplate,
		!found || i.config.Clear,
	); err != nil {
		return errors.Wrap(err, "create experiment")
	}

	if i.config.UseDevBuild {
		symlink := func(folder string) error {
			dir := path.Join(i.dir(), folder)

			p := path.Join(dir, "node_modules", "@empirica", "core")

			sp, err := filepath.EvalSymlinks(p)
			if err != nil {
				return errors.Wrap(err, "eval symlink")
			}

			isSymlink := sp != p

			if err != nil || !isSymlink {
				log.Info().Msgf("Symlinking @empirica/core in %s", dir)

				cmd := proc.New("emp", "npm", "link", "@empirica/core")
				cmd.Dir = dir

				if err := cmd.Run(); err != nil {
					return errors.Wrap(err, "link empirica")
				}
			}

			return nil
		}

		if err := symlink("client"); err != nil {
			return errors.Wrap(err, "check client")
		}

		if err := symlink("server"); err != nil {
			return errors.Wrap(err, "check server")
		}
	}

	return nil
}

func (i *Instance) Run(ctx context.Context) error {
	if i.cmd != nil {
		return nil
	}

	port, err := net.GetFreePort()
	if err != nil {
		return errors.Wrap(err, "get free port")
	}

	i.port = port

	i.cmd = proc.New(i.empiricaCommand(), "-s", fmt.Sprintf(":%d", port))
	i.cmd.Dir = i.dir()
	i.cmd.Stderr = os.Stderr
	i.cmd.Stdout = os.Stdout

	if err := i.cmd.Start(); err != nil {
		return errors.Wrap(err, "start empirica")
	}

	return nil
}

func (i *Instance) Stop() error {
	if i.cmd == nil {
		return nil
	}

	fmt.Println("Stopping empirica")
	if err := i.cmd.Process.Kill(); err != nil {
		return errors.Wrap(err, "kill empirica")
	}
	fmt.Println("Should have stopped empirica")

	i.cmd = nil
	i.port = 0

	return nil
}
