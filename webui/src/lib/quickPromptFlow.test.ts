import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasSubstantiveCaptionJson, magicPromptBlockingReason, quickPromptGenerateMode } from "./quickPromptFlow.ts";

describe("hasSubstantiveCaptionJson", () => {
  it("rejects empty and non-objects", () => {
    assert.equal(hasSubstantiveCaptionJson(""), false);
    assert.equal(hasSubstantiveCaptionJson("[]"), false);
    assert.equal(hasSubstantiveCaptionJson('"text"'), false);
  });

  it("rejects object without high_level_description", () => {
    assert.equal(hasSubstantiveCaptionJson("{}"), false);
    assert.equal(hasSubstantiveCaptionJson('{"style_description":{}}'), false);
  });

  it("accepts object with non-empty high_level_description", () => {
    assert.equal(hasSubstantiveCaptionJson('{"high_level_description":"A cat"}'), true);
  });
});

describe("magicPromptBlockingReason", () => {
  it("returns null when configured", () => {
    assert.equal(
      magicPromptBlockingReason({
        enabled: true,
        configured: true,
        missing_env: [],
        llm_error: null,
      }),
      null,
    );
  });

  it("blocks when disabled", () => {
    assert.ok(
      magicPromptBlockingReason({
        enabled: false,
        configured: false,
        missing_env: [],
        llm_error: null,
      })?.includes("disabled"),
    );
  });
});

describe("quickPromptGenerateMode", () => {
  it("prefers fresh Quick Prompt input over existing raw JSON", () => {
    assert.equal(
      quickPromptGenerateMode({ hasQuickInput: true, hasReadyJson: true }),
      "magic-prompt",
    );
  });

  it("uses raw JSON only when there is no fresh Quick Prompt input", () => {
    assert.equal(
      quickPromptGenerateMode({ hasQuickInput: false, hasReadyJson: true }),
      "raw-json",
    );
  });

  it("requires input when neither Quick Prompt nor JSON is ready", () => {
    assert.equal(
      quickPromptGenerateMode({ hasQuickInput: false, hasReadyJson: false }),
      "missing-input",
    );
  });
});
