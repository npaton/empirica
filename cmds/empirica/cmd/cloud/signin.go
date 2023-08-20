package cloudcmd

import (
	"os"

	"github.com/empiricaly/empirica/internal/cloud"
	"github.com/pkg/errors"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

func AddSigninCommand(parent *cobra.Command) error {
	cmd := &cobra.Command{
		Use:           "signin",
		Aliases:       []string{"login"},
		Short:         "Sign into Empirica Cloud",
		SilenceUsage:  true,
		SilenceErrors: true,
		Hidden:        true,
		Args:          cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			ctx := initContext()
			_, err := cloud.SignIn(ctx, os.Stderr)
			return errors.Wrap(err, "sign into empirica cloud")
		},
	}

	err := viper.BindPFlags(cmd.Flags())
	if err != nil {
		return errors.Wrap(err, "bind bundle flags")
	}

	parent.AddCommand(cmd)

	return nil
}
