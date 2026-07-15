import assert from "node:assert/strict";
import test from "node:test";

import { isNewerCloudUpdate } from "../lib/supabase-rest.ts";

test("accepts the first valid realtime database timestamp", () => {
  assert.equal(
    isNewerCloudUpdate("", "2026-07-15T01:00:00.000Z"),
    true,
  );
});

test("only accepts realtime rows newer than the currently applied row", () => {
  const current = "2026-07-15T01:00:00.000Z";

  assert.equal(
    isNewerCloudUpdate(current, "2026-07-15T01:00:00.001Z"),
    true,
  );
  assert.equal(
    isNewerCloudUpdate(current, "2026-07-15T00:59:59.999Z"),
    false,
  );
  assert.equal(isNewerCloudUpdate(current, current), false);
});

test("rejects invalid realtime timestamps", () => {
  assert.equal(isNewerCloudUpdate("", ""), false);
  assert.equal(isNewerCloudUpdate("", "not-a-date"), false);
});
