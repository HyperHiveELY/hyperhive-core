// A source-faithful text layer inside the existing five-state Framer media frame.
// All copy is static, reviewed against the supplied Overview and Backend briefs.
export const roleDetails = [
  {
    label: 'Scouts Propose', kind: 'AI · IDEA FINDERS', title: 'Start with a trade idea.',
    intro: 'Scouts study trend, crowded positioning and key price levels, then propose ideas for your selected markets. Crew has three Scouts; Crew Pro has five.',
    rows: [
      ['Look at', 'Price action, funding, open interest and market levels.'],
      ['Write down', 'The market, direction, reasoning, time horizon and price that would prove the idea wrong.'],
      ['Stay within', 'A structured trade card. Scouts cannot choose size or leverage, sign an order or reach the trading key.'],
    ],
    handoff: 'The trade card goes to the Skeptic for a separate review.',
  },
  {
    label: 'Skeptic Reviews', kind: 'AI · SEPARATE MODEL FAMILY', title: 'Give the idea a second test.',
    intro: 'A second AI challenges each proposal using the card’s fixed fields and a fact sheet. Its job is to find a reason the trade should not happen.',
    rows: [
      ['Check', 'The proposed direction, market conditions and invalidation price against the supplied facts.'],
      ['Decide', 'Pass or kill. A rejected card stops here.'],
      ['Stay within', 'The original proposal. The Skeptic cannot rewrite the card, change its size or invent a replacement trade.'],
    ],
    handoff: 'Only a passed card reaches the deterministic Sizer.',
  },
  {
    label: 'Sizer Calculates', kind: 'DETERMINISTIC CODE · NO AI', title: 'Turn your budget into a size.',
    intro: 'You set a weekly risk budget. Code uses the remaining allowance, current volatility and stop distance to calculate position size and leverage.',
    rows: [
      ['Risk limit', 'At most 20% of the weekly budget per trade, capped by the remaining allowance.'],
      ['Stop distance', 'The greater of the card’s invalidation distance and 1.2 × one-hour ATR, a measure of market movement.'],
      ['Leverage cap', 'Up to 5× for BTC and ETH, 3× for other markets. Volatility and venue limits can reduce it further.'],
    ],
    handoff: 'A valid size and exit plan go to the Executor. Failed checks stop the entry.',
  },
  {
    label: 'Executor Signs', kind: 'SEALED SIGNER · NO AI', title: 'Place the order with its exits.',
    intro: 'The trading key sits inside a sealed enclave. Deterministic code signs the entry and places its take-profit and stop-loss at the exchange.',
    rows: [
      ['Execute', 'Place the entry and exchange-side exit brackets in the same batch.'],
      ['Manage', 'Run break-even, trailing, time and funding-cost exits. Stand down pauses new entries; existing exits keep working.'],
      ['Record', 'Create a signed slip that binds the trade card, sizing inputs, policy and code measurement to the order.'],
    ],
    handoff: 'The public fill and signed slip become evidence for the Auditor.',
  },
  {
    label: 'Auditor Checks', kind: 'STAKED CHECKER · PUBLIC RECORD', title: 'Match the fill to the evidence.',
    intro: 'The Auditor checks public exchange fills against the Executor’s signed slips. The record shows how the account was traded, without promising a profitable trade.',
    rows: [
      ['Match', 'Resolve each fill to its signed slip and the code measurement that produced it.'],
      ['Publish', 'Commit the hourly record on HyperEVM so the evidence can be checked.'],
      ['Keep visible', 'Unmatched fills, venue events and unaudited hours. A gap is not hidden or counted as a verified result.'],
    ],
    handoff: 'You can inspect the record. At launch, the studio runs the Auditor operators.',
  },
];

const node = (tag, className, copy) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (copy) el.textContent = copy;
  return el;
};

function renderPanel(host, index) {
  let panel = host.querySelector(':scope > .hh-role-detail');
  if (panel?.dataset.roleIndex === String(index)) return;
  if (!panel) {
    panel = node('article', 'hh-role-detail');
    panel.id = 'hh-how-detail';
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-atomic', 'true');
    host.append(panel);
  }
  const role = roleDetails[index];
  panel.dataset.roleIndex = String(index);
  panel.setAttribute('aria-labelledby', 'hh-how-title');
  const meta = node('div', 'hh-role-meta');
  meta.append(node('span', 'hh-role-kind', role.kind), node('span', 'hh-role-number', `0${index + 1} / 05`));
  const title = node('h3', 'hh-role-title', role.title);
  title.id = 'hh-how-title';
  const intro = node('p', 'hh-role-intro', role.intro);
  const rows = node('dl', 'hh-role-rows');
  for (const [label, explanation] of role.rows) {
    const row = node('div', 'hh-role-row');
    row.append(node('dt', '', label), node('dd', '', explanation));
    rows.append(row);
  }
  const handoff = node('div', 'hh-role-handoff');
  handoff.append(node('span', '', index === 4 ? 'YOUR RECORD' : 'WHAT HAPPENS NEXT'), node('p', '', role.handoff));
  panel.replaceChildren(meta, title, intro, rows, handoff);
}

export function refreshHowItWorks() {
  const section = document.querySelector('section[data-framer-name="Capability Section"]');
  if (!section) return;
  const host = section.querySelector('[data-framer-name="Image Wrap"]');
  if (!host) return;
  host.classList.add('hh-role-host');
  host.parentElement.classList.add('hh-role-widget');
  host.parentElement.parentElement.classList.add('hh-role-widget-wrap');
  const selectors = [...section.querySelectorAll('[data-highlight]')].filter(e =>
    roleDetails.some(r => e.textContent.trim().startsWith(r.label))
  );
  const active = selectors.find(e => e.getAttribute('data-framer-name') === 'Active');
  // Mobile uses one collapsed dropdown; its widget variant retains the role index.
  const variant = host.parentElement.getAttribute('data-framer-name') || '';
  const mobileIndex = /Mobile (\d)/.exec(variant)?.[1];
  const index = active
    ? roleDetails.findIndex(r => active.textContent.trim().startsWith(r.label))
    : mobileIndex ? Number(mobileIndex) - 1 : 0;
  for (const el of selectors) {
    const name = el.getAttribute('data-framer-name');
    if (name === 'Mobile Active') {
      el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('aria-pressed');
      continue;
    }
    if (name === 'Field') {
      const expanded = String(variant.endsWith('Open'));
      if (el.getAttribute('aria-expanded') !== expanded) el.setAttribute('aria-expanded', expanded);
      el.removeAttribute('aria-pressed');
      continue;
    }
    const selected = roleDetails.findIndex(r => el.textContent.trim().startsWith(r.label)) === index;
    const state = String(selected);
    if (el.getAttribute('aria-pressed') !== state) el.setAttribute('aria-pressed', state);
    if (!el.hasAttribute('aria-controls')) el.setAttribute('aria-controls', 'hh-how-detail');
  }
  // The old images remain owned by React but are decorative and visually replaced.
  for (const child of host.children) if (!child.classList.contains('hh-role-detail')) {
    if (child.getAttribute('aria-hidden') !== 'true') child.setAttribute('aria-hidden', 'true');
  }
  renderPanel(host, Math.max(0, Math.min(4, index)));
}
