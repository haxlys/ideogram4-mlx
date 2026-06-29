import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { queuedJobCount } from "./genQueueDedupe.ts";
import type { GenJob } from "../state/types.ts";

const caption = { high_level_description: "mug" };

function job(status: GenJob["status"], id: string): GenJob {
  return {
    id,
    label: "mug",
    status,
    msg: "",
    progress: 0,
    totalSteps: 12,
    createdAt: 1,
    historyLinkMode: "new",
    formSnapshot: {} as GenJob["formSnapshot"],
    request: {
      caption,
      width: 1024,
      height: 1024,
      preset: "V4_TURBO_12",
      seed: 1,
      format: "webp",
    },
  };
}

describe("genQueueDedupe", () => {
  it("counts only queued and waiting jobs toward queue capacity", () => {
    assert.equal(
      queuedJobCount([
        job("done", "a"),
        job("error", "b"),
        job("running", "c"),
        job("submitting", "d"),
        job("queued", "e"),
        job("waiting", "f"),
      ]),
      2,
    );
  });
});
