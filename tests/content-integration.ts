import assert from "node:assert/strict";
import { getPayload } from "payload";
import config from "../src/payload.config";
import defaults from "../src/content/defaults.json";
const p = await getPayload({ config });
let outcome = 0;
try {
  const result = await p.find({
    collection: "pages",
    overrideAccess: false,
    limit: 20,
    depth: 0,
  });
  assert.equal(result.totalDocs, 9);
  for (const page of defaults) {
    const record = result.docs.find((p) => p.slug === page.slug);
    assert.ok(record);
    assert.equal(record.copy?.length, page.texts.length);
    assert.deepEqual(
      record.copy?.map(({ key, value }) => ({ key, value })),
      page.texts,
    );
  }
  console.log(
    "PASS nine editable CMS pages and all structured copy values under production runtime",
  );
} catch (e) {
  console.error(e);
  outcome = 1;
} finally {
  await p.destroy();
  process.exit(outcome);
}
