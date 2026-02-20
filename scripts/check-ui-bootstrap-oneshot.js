#!/usr/bin/env node
const { chromium } = require('@playwright/test');

const DEFAULT_STAGED_URL = 'http://127.0.0.1:4173';
const DEFAULT_DEPLOYED_URL = 'https://osangen.github.io/ai-power-users-codex53-demo';

const STAGED_URL = process.env.QA_TARGET_URL || process.env.QA_STAGED_URL || DEFAULT_STAGED_URL;
const DEPLOYED_URL = process.env.QA_DEPLOYED_URL || DEFAULT_DEPLOYED_URL;

const targets = [
  { label: 'staged', url: STAGED_URL },
  { label: 'deployed', url: DEPLOYED_URL },
];

async function assertBootstrapUrl(page, target) {
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const payload = await page.evaluate(() => {
    const payload = window.__AIPU_UI_BOOTSTRAP || {};
    const missingTokens = Array.isArray(payload.missingTokens) ? payload.missingTokens : [];
    const missingClasses = Array.isArray(payload.missingClasses) ? payload.missingClasses : [];
    return {
      ok: !!payload.ok,
      missingTokens,
      missingClasses,
      keys: Object.keys(payload),
    };
  });

  if (!payload.ok) {
    throw new Error(`${target.label} bootstrap failed: payload.ok is false`);
  }

  if (payload.missingTokens.length || payload.missingClasses.length) {
    throw new Error(
      `${target.label} bootstrap failed: missing tokens/classes ` +
      `${JSON.stringify(payload.missingTokens)} / ${JSON.stringify(payload.missingClasses)}`
    );
  }

  return payload;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    for (const target of targets) {
      const result = await assertBootstrapUrl(page, target);
      console.log(`PASS: ${target.label} bootstrap ok`, {
        url: target.url,
        missingTokens: result.missingTokens.length,
        missingClasses: result.missingClasses.length,
        payloadKeys: result.keys,
      });
    }
    console.log('PASS: bootstrap contract is green for staged and deployed targets.');
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`FAIL: bootstrap one-shot check failed: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
});
