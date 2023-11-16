import test from "ava";
import { connect, getToken } from "./api";
import { withTajriba } from "./connection_test_helper";

const t = test;
// const t = test.serial;
// const to = test.only;

t("query with api", async (t) => {
  await withTajriba(
    async ({ url, srtoken }) => {
      const token = await getToken(url, srtoken, "testing");
      const taj = await connect(url, token);

      console.log("taj", taj);

      t.truthy(taj);
      for (const player of await taj.players().getSorted()) {
        console.log("player", player.id);
        for (const attr of player.attributes()) {
          console.log(`  ${attr.key} ${attr.value}`);
        }
      }
      console.log("1");
      for (const batch of await taj.batches().getSorted()) {
        console.log("batch", batch.id);
        for (const attr of batch.attributes()) {
          console.log(`  ${attr.key} ${attr.value}`);
        }
      }
      console.log("2");
      for (const game of await taj.games().getSorted()) {
        console.log("game", game.id);
        for (const attr of game.attributes()) {
          console.log(`  ${attr.key} ${attr.value}`);
        }
      }
      console.log("3");
    },
    { tajFile: "src/admin/classic/api/tajriba.json", printLogs: false }
  );
});
