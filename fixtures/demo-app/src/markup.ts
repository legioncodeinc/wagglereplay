import {
  CTA_START_TEXT,
  DEFAULT_FETCH_DELAY_MS,
  MAX_FETCH_DELAY_MS,
  ROUTE_PATHS,
  TEST_IDS,
} from './routes.js';
import type { FixtureVariant } from './variant.js';

/**
 * Builds the self-contained HTML document this fixture app serves for a
 * given request path and variant.
 *
 * The initial `#app-root` content is rendered server-side for the exact
 * path requested, so a full navigation (typed URL, a link with a real
 * `href`, reload, back/forward across page loads) always paints real,
 * testid-bearing content immediately, detectable via `webNavigation`
 * without waiting on client script execution.
 *
 * The same document also embeds a tiny client-side router (History API
 * `pushState`/`popstate`, no framework) that re-renders `#app-root` on
 * in-app transitions, so those are detectable only via history patching,
 * exercising the other half of prd-003 AC5's route-detection contract.
 *
 * There are no external requests, fonts, or scripts: every asset is inlined
 * in this one document, and the only network call the page makes is same
 * origin, to this app's own `/api/data` endpoint.
 */
export function buildDocument(pathname: string, variant: FixtureVariant): string {
  const initialHtml = renderRouteHtml(pathname, variant);
  return (
    '<!doctype html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Waggle Fixture App</title>\n' +
    `<style>${buildCss()}</style>\n` +
    '</head>\n' +
    '<body>\n' +
    `<div id="app-root">${initialHtml}</div>\n` +
    `<script>${buildClientScript(variant)}</script>\n` +
    '</body>\n' +
    '</html>\n'
  );
}

/** Server-side route renderer, used both for the initial SSR paint above and by tests. */
export function renderRouteHtml(pathname: string, variant: FixtureVariant): string {
  switch (pathname) {
    case ROUTE_PATHS.login:
      return loginHtml();
    case ROUTE_PATHS.items:
      return itemsHtml();
    case ROUTE_PATHS.scroll:
      return scrollHtml();
    case ROUTE_PATHS.fetchDemo:
      return fetchHtml();
    case ROUTE_PATHS.confirm:
      return confirmHtml();
    default:
      return landingHtml(variant);
  }
}

function ctaButtonHtml(variant: FixtureVariant): string {
  if (variant === 'moved-button') {
    return `<button type="button" data-action="go-login">${CTA_START_TEXT}</button>`;
  }
  return (
    `<button type="button" data-testid="${TEST_IDS.ctaStart}" data-action="go-login">` +
    `${CTA_START_TEXT}</button>`
  );
}

function landingHtml(variant: FixtureVariant): string {
  const header =
    `<main data-testid="${TEST_IDS.routeLanding}">` +
    '<h1>Waggle Fixture App</h1>' +
    '<p>A small deterministic app used to record and replay walkthroughs.</p>';
  if (variant === 'moved-button') {
    return (
      `${header}<footer class="fixture-footer">Fixture app, moved-button variant.</footer>` +
      `${ctaButtonHtml(variant)}</main>`
    );
  }
  return `${header}${ctaButtonHtml(variant)}</main>`;
}

function loginHtml(): string {
  return (
    `<main data-testid="${TEST_IDS.routeLogin}">` +
    '<h1>Sign in (fixture)</h1>' +
    `<form data-testid="${TEST_IDS.loginForm}">` +
    '<label>Username' +
    `<input data-testid="${TEST_IDS.inputUsername}" type="text" ` +
    'placeholder="demo-user (not a real credential)" autocomplete="off"></label>' +
    '<label>Password' +
    `<input data-testid="${TEST_IDS.inputPassword}" type="password" ` +
    'placeholder="demo-pass-0000 (not a real credential)" autocomplete="off"></label>' +
    `<button type="submit" data-testid="${TEST_IDS.btnLogin}">Continue</button>` +
    '</form></main>'
  );
}

function itemsHtml(): string {
  const items = [
    { id: '1', testid: TEST_IDS.item1, name: 'Alpha widget' },
    { id: '2', testid: TEST_IDS.item2, name: 'Beta widget' },
    { id: '3', testid: TEST_IDS.item3, name: 'Gamma widget' },
  ];
  const listItems = items
    .map(
      (item) =>
        `<li><button type="button" data-testid="${item.testid}" data-action="select-item" ` +
        `data-item-id="${item.id}">${item.name}</button></li>`,
    )
    .join('');
  return (
    `<main data-testid="${TEST_IDS.routeItems}">` +
    '<h1>Pick an item</h1>' +
    `<ul data-testid="${TEST_IDS.itemList}">${listItems}</ul>` +
    `<div id="items-detail-panel" data-testid="${TEST_IDS.itemDetail}" aria-live="polite">` +
    'Select an item to see details.</div>' +
    `<button type="button" data-testid="${TEST_IDS.btnContinueToScroll}" ` +
    'data-action="go-scroll">Continue</button>' +
    '</main>'
  );
}

function scrollHtml(): string {
  const rows: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    rows.push(`<p data-testid="scroll-row-${i}">Row ${i} of 40</p>`);
  }
  return (
    `<main data-testid="${TEST_IDS.routeScroll}">` +
    '<h1>Scroll region</h1>' +
    `<div id="scroll-region" data-testid="${TEST_IDS.scrollRegion}">${rows.join('')}</div>` +
    `<button type="button" data-testid="${TEST_IDS.btnContinueToFetch}" ` +
    'data-action="go-fetch">Continue</button>' +
    '</main>'
  );
}

function fetchHtml(): string {
  return (
    `<main data-testid="${TEST_IDS.routeFetch}">` +
    '<h1>Load data</h1>' +
    '<p>Delay is set via the ?delay= query parameter, in milliseconds.</p>' +
    `<button type="button" data-testid="${TEST_IDS.fetchTrigger}" ` +
    'data-action="do-fetch">Fetch data</button>' +
    `<div data-testid="${TEST_IDS.fetchResult}" aria-live="polite">Idle</div>` +
    `<button type="button" data-testid="${TEST_IDS.btnContinueToConfirm}" ` +
    'data-action="go-confirm" disabled>Continue</button>' +
    '</main>'
  );
}

function confirmHtml(): string {
  return (
    `<main data-testid="${TEST_IDS.routeConfirm}">` +
    '<h1>All done</h1>' +
    `<p data-testid="${TEST_IDS.confirmationMessage}">Walkthrough complete.</p>` +
    '</main>'
  );
}

function buildCss(): string {
  // No animations, no transitions, no external fonts: every render is
  // deterministic and settles instantly once the DOM update completes.
  return [
    '*{box-sizing:border-box;animation:none!important;transition:none!important}',
    'body{margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#ffffff}',
    'main{max-width:640px;margin:0 auto}',
    'h1{font-size:22px;margin:0 0 12px}',
    'label{display:block;margin:12px 0;font-size:14px}',
    'input{display:block;width:100%;margin-top:4px;padding:8px;font-size:14px;border:1px solid #999}',
    'button{padding:8px 16px;font-size:14px;border:1px solid #333;background:#f2f2f2;cursor:pointer}',
    'button:disabled{opacity:0.5;cursor:not-allowed}',
    'ul{list-style:none;padding:0;margin:12px 0}',
    'li{margin:6px 0}',
    '#items-detail-panel{margin:12px 0;padding:12px;border:1px solid #ccc;min-height:20px}',
    '#scroll-region{height:240px;overflow-y:auto;border:1px solid #ccc;padding:8px;margin:12px 0}',
    '#scroll-region p{margin:0 0 8px;padding:4px 0;border-bottom:1px solid #eee}',
    '.fixture-footer{margin-top:32px;padding-top:16px;border-top:1px solid #eee;color:#666;font-size:12px}',
  ].join('');
}

/**
 * The item-selection handler is the one place the "broken" variant's
 * defect lives, and it is generated per variant (rather than branching at
 * runtime on a shared `VARIANT` check) so the served document's bytes
 * actually differ between variants: the defect text appears only in the
 * "broken" variant's response, never in "default" or "moved-button".
 */
function selectItemFunctionLines(variant: FixtureVariant): string[] {
  if (variant === 'broken') {
    return [
      '  function selectItem() {',
      '    console.error("fixture-app broken variant: item selection handler failed");',
      '    var missingRecord = null;',
      '    // Intentional defect: dereferencing null throws, leaving the panel',
      '    // stuck on its initial text instead of showing the selection.',
      '    missingRecord.name = "boom";',
      '  }',
    ];
  }
  return [
    '  function selectItem(target) {',
    '    var panel = el(IDS.itemDetail);',
    '    var names = { "1": "Alpha widget", "2": "Beta widget", "3": "Gamma widget" };',
    '    var id = target.getAttribute("data-item-id") || "";',
    '    if (panel) panel.textContent = "Selected: " + (names[id] || id);',
    '  }',
  ];
}

/**
 * The client-side router. Deliberately re-implements the same route
 * templates as the server-side functions above, as plain ES5-flavored JS
 * text: it runs inside the browser as an inline `<script>`, not compiled
 * TypeScript, and this fixture stays dependency-light by design (Node
 * built-ins only, no bundler). Keep both sides in sync when a route
 * changes.
 */
function buildClientScript(variant: FixtureVariant): string {
  const variantJson = JSON.stringify(variant);
  const routesJson = JSON.stringify(ROUTE_PATHS);
  const testIdsJson = JSON.stringify(TEST_IDS);
  const ctaTextJson = JSON.stringify(CTA_START_TEXT);

  return [
    '(function () {',
    '  var VARIANT = ' + variantJson + ';',
    '  var ROUTES = ' + routesJson + ';',
    '  var IDS = ' + testIdsJson + ';',
    '  var CTA_TEXT = ' + ctaTextJson + ';',
    '  var DEFAULT_DELAY = ' + String(DEFAULT_FETCH_DELAY_MS) + ';',
    '  var MAX_DELAY = ' + String(MAX_FETCH_DELAY_MS) + ';',
    '',
    '  function el(testid) {',
    "    return document.querySelector('[data-testid=\"' + testid + '\"]');",
    '  }',
    '',
    '  function ctaButtonHtml() {',
    '    if (VARIANT === "moved-button") {',
    '      return \'<button type="button" data-action="go-login">\' + CTA_TEXT + "</button>";',
    '    }',
    '    return (',
    '      \'<button type="button" data-testid="\' +',
    '      IDS.ctaStart +',
    '      \'" data-action="go-login">\' +',
    '      CTA_TEXT +',
    '      "</button>"',
    '    );',
    '  }',
    '',
    '  function landingHtml() {',
    '    var header =',
    "      '<main data-testid=\"' + IDS.routeLanding + '\">' +",
    '      "<h1>Waggle Fixture App</h1>" +',
    '      "<p>A small deterministic app used to record and replay walkthroughs.</p>";',
    '    if (VARIANT === "moved-button") {',
    '      return (',
    '        header +',
    '        "<footer class=\\"fixture-footer\\">Fixture app, moved-button variant.</footer>" +',
    '        ctaButtonHtml() +',
    '        "</main>"',
    '      );',
    '    }',
    '    return header + ctaButtonHtml() + "</main>";',
    '  }',
    '',
    '  function loginHtml() {',
    '    return (',
    "      '<main data-testid=\"' + IDS.routeLogin + '\">' +",
    '      "<h1>Sign in (fixture)</h1>" +',
    "      '<form data-testid=\"' + IDS.loginForm + '\">' +",
    '      "<label>Username" +',
    "      '<input data-testid=\"' +",
    '      IDS.inputUsername +',
    '      \'" type="text" placeholder="demo-user (not a real credential)" autocomplete="off">\' +',
    '      "</label>" +',
    '      "<label>Password" +',
    "      '<input data-testid=\"' +",
    '      IDS.inputPassword +',
    '      \'" type="password" placeholder="demo-pass-0000 (not a real credential)" autocomplete="off">\' +',
    '      "</label>" +',
    '      \'<button type="submit" data-testid="\' + IDS.btnLogin + \'">Continue</button>\' +',
    '      "</form>" +',
    '      "</main>"',
    '    );',
    '  }',
    '',
    '  function itemsHtml() {',
    '    var items = [',
    '      { id: "1", testid: IDS.item1, name: "Alpha widget" },',
    '      { id: "2", testid: IDS.item2, name: "Beta widget" },',
    '      { id: "3", testid: IDS.item3, name: "Gamma widget" },',
    '    ];',
    '    var listItems = items',
    '      .map(function (item) {',
    '        return (',
    '          "<li>" +',
    '          \'<button type="button" data-testid="\' +',
    '          item.testid +',
    '          \'" data-action="select-item" data-item-id="\' +',
    '          item.id +',
    "          '\">' +",
    '          item.name +',
    '          "</button>" +',
    '          "</li>"',
    '        );',
    '      })',
    '      .join("");',
    '    return (',
    "      '<main data-testid=\"' + IDS.routeItems + '\">' +",
    '      "<h1>Pick an item</h1>" +',
    "      '<ul data-testid=\"' + IDS.itemList + '\">' +",
    '      listItems +',
    '      "</ul>" +',
    '      \'<div id="items-detail-panel" data-testid="\' +',
    '      IDS.itemDetail +',
    '      \'" aria-live="polite">Select an item to see details.</div>\' +',
    '      \'<button type="button" data-testid="\' +',
    '      IDS.btnContinueToScroll +',
    '      \'" data-action="go-scroll">Continue</button>\' +',
    '      "</main>"',
    '    );',
    '  }',
    '',
    '  function scrollHtml() {',
    '    var rows = [];',
    '    for (var i = 0; i < 40; i += 1) {',
    '      rows.push(\'<p data-testid="scroll-row-\' + i + \'">Row \' + i + " of 40</p>");',
    '    }',
    '    return (',
    "      '<main data-testid=\"' + IDS.routeScroll + '\">' +",
    '      "<h1>Scroll region</h1>" +',
    '      \'<div id="scroll-region" data-testid="\' +',
    '      IDS.scrollRegion +',
    "      '\">' +",
    '      rows.join("") +',
    '      "</div>" +',
    '      \'<button type="button" data-testid="\' +',
    '      IDS.btnContinueToFetch +',
    '      \'" data-action="go-fetch">Continue</button>\' +',
    '      "</main>"',
    '    );',
    '  }',
    '',
    '  function fetchHtml() {',
    '    return (',
    "      '<main data-testid=\"' + IDS.routeFetch + '\">' +",
    '      "<h1>Load data</h1>" +',
    '      "<p>Delay is set via the ?delay= query parameter, in milliseconds.</p>" +',
    '      \'<button type="button" data-testid="\' +',
    '      IDS.fetchTrigger +',
    '      \'" data-action="do-fetch">Fetch data</button>\' +',
    '      \'<div data-testid="\' + IDS.fetchResult + \'" aria-live="polite">Idle</div>\' +',
    '      \'<button type="button" data-testid="\' +',
    '      IDS.btnContinueToConfirm +',
    '      \'" data-action="go-confirm" disabled>Continue</button>\' +',
    '      "</main>"',
    '    );',
    '  }',
    '',
    '  function confirmHtml() {',
    '    return (',
    "      '<main data-testid=\"' + IDS.routeConfirm + '\">' +",
    '      "<h1>All done</h1>" +',
    "      '<p data-testid=\"' + IDS.confirmationMessage + '\">Walkthrough complete.</p>' +",
    '      "</main>"',
    '    );',
    '  }',
    '',
    '  function render(pathname) {',
    '    var root = document.getElementById("app-root");',
    '    if (!root) return;',
    '    var html;',
    '    if (pathname === ROUTES.login) html = loginHtml();',
    '    else if (pathname === ROUTES.items) html = itemsHtml();',
    '    else if (pathname === ROUTES.scroll) html = scrollHtml();',
    '    else if (pathname === ROUTES.fetchDemo) html = fetchHtml();',
    '    else if (pathname === ROUTES.confirm) html = confirmHtml();',
    '    else html = landingHtml();',
    '    root.innerHTML = html;',
    '  }',
    '',
    '  function navigate(path) {',
    '    var target = path + location.search;',
    '    history.pushState({}, "", target);',
    '    render(path);',
    '  }',
    '',
    ...selectItemFunctionLines(variant),
    '',
    '  function doFetch() {',
    '    var params = new URLSearchParams(location.search);',
    '    var rawDelay = params.get("delay");',
    '    var delay = rawDelay === null ? DEFAULT_DELAY : Number(rawDelay);',
    '    if (!Number.isFinite(delay) || delay < 0) delay = DEFAULT_DELAY;',
    '    if (delay > MAX_DELAY) delay = MAX_DELAY;',
    '    var result = el(IDS.fetchResult);',
    '    var continueBtn = el(IDS.btnContinueToConfirm);',
    '    if (result) result.textContent = "Loading...";',
    '    fetch("/api/data?delay=" + encodeURIComponent(String(delay)))',
    '      .then(function (res) {',
    '        return res.json();',
    '      })',
    '      .then(function (data) {',
    '        if (result) result.textContent = "Loaded (delay " + data.delay + "ms)";',
    '        if (continueBtn) continueBtn.removeAttribute("disabled");',
    '      })',
    '      .catch(function () {',
    '        if (result) result.textContent = "Error";',
    '      });',
    '  }',
    '',
    '  document.addEventListener("click", function (evt) {',
    '    var target = evt.target;',
    '    if (!(target instanceof Element)) return;',
    '    var actionEl = target.closest("[data-action]");',
    '    if (!actionEl) return;',
    '    var action = actionEl.getAttribute("data-action");',
    '    if (action === "go-login") navigate(ROUTES.login);',
    '    else if (action === "go-scroll") navigate(ROUTES.scroll);',
    '    else if (action === "go-fetch") navigate(ROUTES.fetchDemo);',
    '    else if (action === "go-confirm") navigate(ROUTES.confirm);',
    '    else if (action === "select-item") selectItem(actionEl);',
    '    else if (action === "do-fetch") doFetch();',
    '  });',
    '',
    '  document.addEventListener("submit", function (evt) {',
    '    var form = evt.target;',
    '    if (form instanceof Element && form.getAttribute("data-testid") === IDS.loginForm) {',
    '      evt.preventDefault();',
    '      navigate(ROUTES.items);',
    '    }',
    '  });',
    '',
    '  window.addEventListener("popstate", function () {',
    '    render(location.pathname);',
    '  });',
    '',
    "  // The initial paint already came from the server (see markup.ts's",
    '  // renderRouteHtml), so the client does not re-render on load; it only',
    '  // takes over for subsequent pushState/popstate transitions.',
    '})();',
  ].join('\n');
}
