#!/usr/bin/env node

const { spawn } = require('child_process');
const { chromium } = require('playwright');

const startServer = String(process.env.A11Y_START_SERVER || 'false').toLowerCase() === 'true';
const port = process.env.A11Y_PORT || (startServer ? '8090' : (process.env.PORT || '8080'));
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;
const timeoutMs = Number(process.env.A11Y_TIMEOUT_MS || 60000);
const pathList = (process.env.A11Y_PATHS || '/rpsim/loginMigration/en,/rpsim/loginMigration/fr')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch (_) {
      // Ignore while booting.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}/health`);
}

function startLocalServer() {
  const child = spawn('npm', ['run', 'start'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

  return child;
}

function compact(str) {
  return String(str || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(str) {
  return compact(str).toLowerCase();
}

function getLabelFromAria(el) {
  const ariaLabel = compact(el.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  const labelledBy = compact(el.getAttribute('aria-labelledby'));
  if (!labelledBy) return '';

  const ids = labelledBy.split(/\s+/).filter(Boolean);
  const text = ids
    .map((id) => {
      const ref = document.getElementById(id);
      return compact(ref ? ref.textContent : '');
    })
    .filter(Boolean)
    .join(' ');

  return compact(text);
}

function summarizeElement(el) {
  const id = el.id ? `#${el.id}` : '';
  const cls = compact(el.className).replace(/\s+/g, '.') || '';
  const classes = cls ? `.${cls}` : '';
  return `<${el.tagName.toLowerCase()}${id}${classes}>`;
}

async function runChecks(pageUrl) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (!response || !response.ok()) {
      throw new Error(`Navigation failed for ${pageUrl} (status: ${response ? response.status() : 'unknown'})`);
    }

    const checks = await page.evaluate(() => {
      function compact(str) {
        return String(str || '').replace(/\s+/g, ' ').trim();
      }

      function normalize(str) {
        return compact(str).toLowerCase();
      }

      function getLabelFromAria(el) {
        const ariaLabel = compact(el.getAttribute('aria-label'));
        if (ariaLabel) return ariaLabel;

        const labelledBy = compact(el.getAttribute('aria-labelledby'));
        if (!labelledBy) return '';

        const ids = labelledBy.split(/\s+/).filter(Boolean);
        const text = ids
          .map((id) => {
            const ref = document.getElementById(id);
            return compact(ref ? ref.textContent : '');
          })
          .filter(Boolean)
          .join(' ');

        return compact(text);
      }

      function summarizeElement(el) {
        const id = el.id ? `#${el.id}` : '';
        const cls = compact(el.className).replace(/\s+/g, '.') || '';
        const classes = cls ? `.${cls}` : '';
        return `<${el.tagName.toLowerCase()}${id}${classes}>`;
      }

      const duplicateLinkAlt = [];
      for (const link of Array.from(document.querySelectorAll('a'))) {
        const linkText = compact(link.textContent);
        if (!linkText) continue;

        for (const img of Array.from(link.querySelectorAll('img[alt]'))) {
          const alt = compact(img.getAttribute('alt'));
          if (!alt) continue;

          if (normalize(linkText).includes(normalize(alt)) || normalize(alt).includes(normalize(linkText))) {
            duplicateLinkAlt.push({
              element: summarizeElement(link),
              text: linkText,
              alt
            });
          }
        }
      }

      const navLandmarks = Array.from(document.querySelectorAll('nav, [role="navigation"]'));
      const navLabels = navLandmarks.map((nav) => {
        const fromAria = getLabelFromAria(nav);
        const heading = compact((nav.querySelector('h1,h2,h3,h4,h5,h6') || {}).textContent || '');
        const name = compact(fromAria || heading);
        return {
          element: summarizeElement(nav),
          name
        };
      });

      const navMissingLabel = navLabels.filter((item) => !item.name);
      const navLabelCounts = new Map();
      for (const nav of navLabels) {
        if (!nav.name) continue;
        const key = normalize(nav.name);
        navLabelCounts.set(key, (navLabelCounts.get(key) || 0) + 1);
      }
      const navDuplicateLabel = navLabels.filter((item) => item.name && navLabelCounts.get(normalize(item.name)) > 1);

      const fieldsetMissingLabel = [];
      for (const fs of Array.from(document.querySelectorAll('fieldset'))) {
        const ariaName = getLabelFromAria(fs);
        const legend = fs.querySelector('legend');
        const legendText = compact(legend ? legend.textContent : '');
        const name = compact(ariaName || legendText);
        if (!name) {
          fieldsetMissingLabel.push({
            element: summarizeElement(fs)
          });
        }
      }

      const unlabeledCheckboxes = [];
      for (const checkbox of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
        const ariaName = getLabelFromAria(checkbox);
        const title = compact(checkbox.getAttribute('title'));
        const labelText = Array.from(checkbox.labels || [])
          .map((label) => compact(label.textContent))
          .filter(Boolean)
          .join(' ');

        const name = compact(ariaName || labelText || title);
        if (!name) {
          unlabeledCheckboxes.push({
            element: summarizeElement(checkbox),
            id: checkbox.id || null,
            name: checkbox.getAttribute('name') || null
          });
        }
      }

      return {
        duplicateLinkAlt,
        navMissingLabel,
        navDuplicateLabel,
        fieldsetMissingLabel,
        unlabeledCheckboxes
      };
    });

    return checks;
  } finally {
    await page.close();
    await browser.close();
  }
}

function printIssues(url, result) {
  const groups = [
    ['Duplicate link image alt text', result.duplicateLinkAlt],
    ['Navigation landmarks missing labels', result.navMissingLabel],
    ['Navigation landmarks with duplicate labels', result.navDuplicateLabel],
    ['Fieldsets missing labels', result.fieldsetMissingLabel],
    ['Unlabeled checkboxes', result.unlabeledCheckboxes]
  ];

  console.log(`\n=== Accessibility retest: ${url} ===`);
  let issueCount = 0;

  for (const [name, items] of groups) {
    if (!items.length) continue;
    issueCount += items.length;
    console.log(`- ${name}: ${items.length}`);
    for (const item of items) {
      console.log(`  • ${JSON.stringify(item)}`);
    }
  }

  if (issueCount === 0) {
    console.log('- No targeted issues found');
  }

  return issueCount;
}

async function main() {
  let serverProcess;
  let totalIssues = 0;

  try {
    if (startServer) {
      serverProcess = startLocalServer();
      await waitForHealth(baseUrl, timeoutMs);
    }

    for (const path of pathList) {
      const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
      const result = await runChecks(url);
      totalIssues += printIssues(url, result);
    }

    if (totalIssues > 0) {
      console.error(`\nAccessibility retest failed with ${totalIssues} issue(s).`);
      process.exitCode = 1;
      return;
    }

    console.log('\nAccessibility retest passed.');
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await sleep(500);
    }
  }
}

main().catch((error) => {
  console.error(`Accessibility retest failed: ${error.message}`);
  process.exitCode = 1;
});
