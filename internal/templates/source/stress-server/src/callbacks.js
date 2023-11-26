import { ClassicListenersCollector } from "@empirica/core/admin/classic";
export const Empirica = new ClassicListenersCollector();

Empirica.onGameStart(({ game }) => {
  const treatment = game.get("treamtment");

  for (let i = 0; i < treatment["rounds"]; i++) {
    const round = game.addRound({ name: `Round ${i}` });

    for (let j = 0; i < treatment["stages"]; i++) {
      round.addStage({
        name: `stage ${i}`,
        duration: parseInt(treatment["duration"], 10),
      });
    }
  }
});

Empirica.onRoundStart(({ round }) => {});

Empirica.onStageStart(({ stage }) => {});

Empirica.onStageEnded(({ stage }) => {});

Empirica.onRoundEnded(({ round }) => {});

Empirica.onGameEnded(({ game }) => {});
