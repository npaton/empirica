#! bin/bash

# Catch termination or interrupt signal and stop child processes
_term() {
  echo "Caught SIGTERM signal!"
  kill -TERM "$child" 2>/dev/null
}

trap _term SIGTERM
trap _term SIGINT

# Delete an old version if it exists
rm -rf templateExperiment/

# verify that the rm succeeded (manually)
ls -lah

# Create a new experiment
empirica create templateExperiment

# Run the experiment
cd templateExperiment
empirica

# keep this script alive while empirica runs in the background
child=$!
wait "$child"