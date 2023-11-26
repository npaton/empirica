package experiment

import (
	"context"
	"os"
	"path"

	"github.com/empiricaly/empirica"
	"github.com/pkg/errors"
)

func Reset(ctx context.Context, basePath string) error {
	file := path.Join(basePath, empirica.DefaultStoreFile)

	if err := os.Remove(file); err != nil && !os.IsNotExist(err) {
		return errors.Wrap(err, "remove store file")
	}

	return nil
}
