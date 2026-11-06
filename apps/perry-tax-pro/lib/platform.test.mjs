import { test } from "node:test";
import assert from "node:assert/strict";
import { contactTopicFor, taxUrl, platformHome, isTaxHost } from "./platform.js";
import { CONTACT_TOPICS } from "./cms.js";

test("contact links from the platform pages pick a known topic", () => {
  const cases = { "Agentic automation": "Software project", "Software project": "Software project", "InnovaCare Training": "InnovaCare Training",
    "Healthcare compliance training": "Compliance training", "CameroHealth": "Health records (EHR)", "InnovaSoftware Clinic": "Health records (EHR)" };
  for (const [about, topic] of Object.entries(cases)) {
    assert.equal(contactTopicFor(about), topic, about);
    assert.ok(CONTACT_TOPICS.includes(topic), topic);
  }
  assert.equal(contactTopicFor(""), null);
});

test("tax links stay on this site until a tax subdomain is set", () => {
  delete process.env.TAX_SITE_URL;
  assert.equal(taxUrl(), "/tax");
  assert.equal(taxUrl("/login"), "/login");
  process.env.TAX_SITE_URL = "https://tax.example.com/";
  assert.equal(taxUrl("/login"), "https://tax.example.com/login");
  delete process.env.TAX_SITE_URL;
  assert.ok(isTaxHost("tax.example.com"));
  assert.equal(platformHome("tax.example.com"), "https://example.com");
  assert.equal(platformHome("example.com"), "/");
});
