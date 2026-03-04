#!/usr/bin/env node

require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { locales_en } = require('../src/locales/translations');

const projectRoot = path.resolve(__dirname, '..');
const viewsRoot = path.join(projectRoot, 'src', 'views');
const outputRoot = path.join(projectRoot, 'ux-ui-guidance', 'html');

function readTemplate(name) {
  return fs.readFileSync(path.join(viewsRoot, name), 'utf8');
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Start marker not found: ${startMarker}`);
  }

  const end = source.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`End marker not found: ${endMarker}`);
  }

  return source.slice(start, end).trim();
}

function writeOutput(filename, html) {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, filename), `${html.trim()}\n`, 'utf8');
}

function replaceHrefs(html, rules) {
  return html.replace(/href="([^"]*)"/g, (_full, url) => {
    const matchedRule = rules.find((rule) => rule.test(url));
    const placeholder = matchedRule
      ? matchedRule.placeholder
      : '[This should be your RP URL]';
    return `href="${placeholder}"`;
  });
}

function simplifyHtml(html) {
  return html
    .replace(/\s+onclick="[^"]*"/g, '')
    .replace(/(<a\b[^>]*?)\s+id="[^"]*"/gi, '$1')
    .replace(/\s+aria-controls="[^"]*"/g, '')
    .replace(/\s+aria-expanded="[^"]*"/g, '')
    .replace(/\s+aria-hidden="[^"]*"/g, '')
    .replace(/\bsignin-panel hidden\b/g, 'signin-panel')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractStyleCss(source) {
  const match = source.match(/<style>\s*([\s\S]*?)<\/style>/i);
  if (!match) {
    throw new Error('Style block not found in signInPage.ejs');
  }
  return match[1].trim();
}

function simplifyStepperCss(css) {
  return css
    .replace(/\.hidden\s*\{[\s\S]*?\}\s*/g, '')
    .trim();
}

const flowTemplate = readTemplate('flowSignRegister.ejs');
const flowSnippetTemplate = extractBetween(
  flowTemplate,
  '<div class="well well-sm brdr-rds-0 mrgn-tp-lg">',
  "<%- include('preFooter')-%>"
);

const flowSnippetHtml = ejs.render(flowSnippetTemplate, {
  ...locales_en,
  signInPageLink: '/rpsim/signinpage/en?flow=all',
  registerLink: '/auth/client3/en?flow=all'
});

const flowGuidanceHtml = simplifyHtml(
  replaceHrefs(flowSnippetHtml, [
    {
      test: (url) => /\/rpsim\/signinpage\//.test(url),
      placeholder: '[This should be your RP sign-in page URL]'
    },
    {
      test: (url) => /\/auth\//.test(url),
      placeholder: '[This should be your RP registration URL]'
    }
  ])
);

writeOutput('flow-all-signin-register.guidance.html', flowGuidanceHtml);

const signInTemplate = readTemplate('signInPage.ejs');
const stepperCss = simplifyStepperCss(extractStyleCss(signInTemplate));
writeOutput('signinpage-stepper.guidance.css', stepperCss);

const mainOpen = '<main property="mainContentOfPage" class="container">';
const mainContentStart = signInTemplate.indexOf(mainOpen);
if (mainContentStart === -1) {
  throw new Error('Main content wrapper not found in signInPage.ejs');
}
const signInMainContentEnd = signInTemplate.indexOf("<%- include('preFooter')-%>", mainContentStart);
if (signInMainContentEnd === -1) {
  throw new Error('preFooter include marker not found in signInPage.ejs');
}

const rpPlaceholderClients = [
  { name: 'rp-client-1' },
  { name: 'rp-client-2' },
  { name: 'rp-client-3' }
];
const gcSigninClient = { name: 'rp-signin-action' };
const gcKeyClient = { name: 'rp-migration-action-a' };
const interacClient = { name: 'rp-migration-action-b' };

const signInMainHtml = ejs.render(
  signInTemplate.slice(mainContentStart + mainOpen.length, signInMainContentEnd).trim(),
  {
    ...locales_en,
    lang: 'en',
    signInFlow: 'all',
    showInteracOption: true,
    oidc_clients: rpPlaceholderClients,
    gcSigninClient,
    gcKeyClient,
    interacClient,
    helpContentLink: '/rpsim/help-content/en'
  }
);

const signInMainGuidanceHtml = simplifyHtml(
  replaceHrefs(signInMainHtml, [
    {
      test: (url) => /\/auth\//.test(url),
      placeholder: '[This should be your RP action URL]'
    },
    {
      test: (url) => /\/rpsim\/help-content\//.test(url),
      placeholder: '[This should be your RP help content URL]'
    }
  ])
);

const signInMainGuidanceWithCss = [
  '<link rel="stylesheet" href="./signinpage-stepper.guidance.css">',
  '',
  signInMainGuidanceHtml
].join('\n');

writeOutput('signinpage-main-body-flow-all.guidance.html', signInMainGuidanceWithCss);

console.log('Generated HTML snippets:');
console.log(`- ${path.join(outputRoot, 'flow-all-signin-register.guidance.html')}`);
console.log(`- ${path.join(outputRoot, 'signinpage-main-body-flow-all.guidance.html')}`);
console.log(`- ${path.join(outputRoot, 'signinpage-stepper.guidance.css')}`);
