package cmd

import (
	"fmt"
	"strings"

	"github.com/empiricaly/empirica/internal/experiment"
	"github.com/empiricaly/empirica/internal/settings"
	"github.com/pkg/errors"
	"github.com/spf13/cobra"
)

func addNPMCommand(parent *cobra.Command) error {
	cmd := &cobra.Command{
		Use:   "npm",
		Short: "Run npm commands",
		// 	Long: ``,
		SilenceUsage:  true,
		SilenceErrors: true,
		// Args:               cobra.An,
		Hidden:             false,
		DisableFlagParsing: true,
		TraverseChildren:   true,
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := initContext()

			if err := settings.InstallVoltaIfNeeded(ctx); err != nil {
				return errors.Wrap(err, "check node")
			}

			fmt.Println("RUNNING", "npm", args)
			err := experiment.RunCmd(ctx, "", "npm", args...)
			if err != nil && !strings.Contains(err.Error(), "signal: killed") {
				fmt.Println("ENDED WITH ERROR", err)
				return err
			}
			fmt.Println("ENDED WITHOUT ERROR")

			return nil
		},
	}

	parent.AddCommand(cmd)

	return nil
}
