// Copy for the public landing page. Product facts follow the current code:
// pay-as-you-go AI Tokens (1 USDC buys 1,000 Tokens), no monthly plans.

export const media = '/art/landing';

export const featureItems = [
  {
    title: 'AI Proposes The Trade',
    text: 'Scouts write a structured trade card. A separate Skeptic can pass or kill it, but cannot rewrite it.',
    art: 'proposal',
    icon: 'move',
  },
  {
    title: 'Code Sets The Size',
    text: 'Your weekly risk budget is the sizing input. The Sizer applies the policy, volatility and remaining allowance.',
    art: 'sizing',
    icon: 'shapes',
  },
  {
    title: 'Every Order Leaves A Slip',
    text: 'The sealed Executor signs a slip. The Auditor matches public fills against that evidence.',
    art: 'record',
    icon: 'gear',
  },
];

export const architecture = [
  {title: 'Your Own Crew Account', text: 'A fresh Hyperliquid account. Owner authority stays separate from the trading key.', art: 'owner'},
  {title: 'A Record You Can Inspect', text: 'Signed slips explain the fills. Unmatched activity stays visible in the record.', art: 'review'},
  {title: 'A Narrow Execution Key', text: 'The enclave signer permits orders and exits. It refuses transfers and withdrawals.', art: 'key'},
];

export const roles = [
  {
    label: 'Scouts Propose', icon: 'scouts', kind: 'AI · IDEA FINDERS', title: 'Start with a trade idea.',
    intro: 'Scouts study trend, crowded positioning and key price levels, then propose ideas for your selected markets. Crew has three Scouts; Crew Pro has five.',
    rows: [
      ['Look at', 'Price action, funding, open interest and market levels.'],
      ['Write down', 'The market, direction, reasoning, time horizon and price that would prove the idea wrong.'],
      ['Stay within', 'A structured trade card. Scouts cannot choose size or leverage, sign an order or reach the trading key.'],
    ],
    next: 'The trade card goes to the Skeptic for a separate review.',
  },
  {
    label: 'Skeptic Reviews', icon: 'skeptic', kind: 'AI · SEPARATE MODEL FAMILY', title: 'Give the idea a second test.',
    intro: 'A second AI challenges each proposal using the card’s fixed fields and a fact sheet. Its job is to find a reason the trade should not happen.',
    rows: [
      ['Check', 'The proposed direction, market conditions and invalidation price against the supplied facts.'],
      ['Decide', 'Pass or kill. A rejected card stops here.'],
      ['Stay within', 'The original proposal. The Skeptic cannot rewrite the card, change its size or invent a replacement trade.'],
    ],
    next: 'Only a passed card reaches the deterministic Sizer.',
  },
  {
    label: 'Sizer Calculates', icon: 'sizer', kind: 'DETERMINISTIC CODE · NO AI', title: 'Turn your budget into a size.',
    intro: 'You set a weekly risk budget. Code uses the remaining allowance, current volatility and stop distance to calculate position size and leverage.',
    rows: [
      ['Risk limit', 'At most 20% of the weekly budget per trade, capped by the remaining allowance.'],
      ['Stop distance', 'The greater of the card’s invalidation distance and 1.2 × one-hour ATR, a measure of market movement.'],
      ['Leverage cap', 'Up to 5× for BTC and ETH, 3× for other markets. Volatility and venue limits can reduce it further.'],
    ],
    next: 'A valid size and exit plan go to the Executor. Failed checks stop the entry.',
  },
  {
    label: 'Executor Signs', icon: 'executor', kind: 'SEALED SIGNER · NO AI', title: 'Place the order with its exits.',
    intro: 'The trading key sits inside a sealed enclave. Deterministic code signs the entry and places its take-profit and stop-loss at the exchange.',
    rows: [
      ['Execute', 'Place the entry and exchange-side exit brackets in the same batch.'],
      ['Manage', 'Run break-even, trailing, time and funding-cost exits. Stand down pauses new entries; existing exits keep working.'],
      ['Record', 'Create a signed slip that binds the trade card, sizing inputs, policy and code measurement to the order.'],
    ],
    next: 'The public fill and signed slip become evidence for the Auditor.',
  },
  {
    label: 'Auditor Checks', icon: 'auditor', kind: 'STAKED CHECKER · PUBLIC RECORD', title: 'Match the fill to the evidence.',
    intro: 'The Auditor checks public exchange fills against the Executor’s signed slips. The record shows how the account was traded, without promising a profitable trade.',
    rows: [
      ['Match', 'Resolve each fill to its signed slip and the code measurement that produced it.'],
      ['Publish', 'Commit the hourly record on HyperEVM so the evidence can be checked.'],
      ['Keep visible', 'Unmatched fills, venue events and unaudited hours. A gap is not hidden or counted as a verified result.'],
    ],
    next: 'You can inspect the record. At launch, the studio runs the Auditor operators.',
    nextLabel: 'YOUR RECORD',
  },
];

export const principles = [
  '“A slip proves how an order was placed. It does not prove that the trade was a good idea.”',
  '“When new entries stop, existing stops and exits must keep working.”',
  '“A record is useful only when the gaps stay visible. Unmatched fills and unaudited hours belong on the page.”',
];

export const cases = [
  {
    role: 'The Scouts', title: 'A proposal with fixed fields and a defined purpose.',
    text: 'The Scouts supply a market, direction and invalidation price. They cannot choose position size or leverage, or reach a signing key.',
    caption: 'Scouts in the base crew propose ideas through three defined lenses.',
    number: '03', numberLabel: 'Three Scouts', image: 'scout-setup.png',
  },
  {
    role: 'The Skeptic', title: 'A second model is allowed to say no.',
    text: 'The Skeptic has a fixed fact sheet and a pass-or-kill choice. It cannot rewrite the trade card or choose a different size.',
    caption: 'A separate Skeptic reviews the same facts and can reject a proposal.',
    number: '01', numberLabel: 'One Skeptic', image: 'skeptic-review.png',
  },
  {
    role: 'The Executor', title: 'An entry carries an exit plan.',
    text: 'Deterministic code sizes the position. The sealed Executor places the entry and brackets, then records a signed slip.',
    caption: 'Exchange-side brackets accompany the entry: take-profit and stop.',
    number: '02', numberLabel: 'Two exit brackets', image: 'bracket-order.png',
  },
  {
    role: 'The Auditor', title: 'The fill must answer to the record.',
    text: 'The Auditor matches venue activity against signed evidence. Gaps, venue events and unaudited hours remain visible.',
    caption: 'Each fill must resolve to a valid signed slip in the public record.',
    number: '01', numberLabel: 'One signed slip', image: 'fill-reconciliation.png',
  },
];

export const controls = [
  {title: 'Weekly Risk Budget', text: 'Lower it immediately. An increase takes effect at the start of the following week.', icon: 'bolt'},
  {title: 'Stand Down', text: 'Pause new entries while the system keeps managing existing stops and exits.', icon: 'pause'},
  {title: 'Key Expiry', text: 'Agent approval lasts at most 180 days. The planned reminder arrives at day 170.', icon: 'clock'},
  {title: 'Public Record', text: 'Inspect fills, signed slips and gaps. Records are sorted by age, never by returns.', icon: 'edit'},
];

export const metrics = [
  {
    title: 'AI Signing Keys',
    text: 'No language model holds or reaches the trading key. Sizing, entry signing and exit management are handled by deterministic code behind a defined execution boundary.',
    value: '0', note: 'The agents propose. Code signs and manages the order.',
  },
  {
    title: 'Market Herd Cap',
    text: 'The specification limits aggregate HyperHive notional in a market to 1% of its open interest. Entries are reduced or rejected when this cap is reached.',
    value: '1%', note: 'A shared exposure limit across the active crews.',
  },
  {
    title: 'Approval Term',
    text: 'A named agent approval lasts at most 180 days. New entries stop on expiry. Existing exchange-side take-profit and stop orders remain at the venue.',
    value: '180 Days', note: 'A defined expiry. A renewal reminder at day 170.',
  },
];

export const tokenPacks = [
  {tokens: '10,000 Tokens', price: '10'},
  {tokens: '25,000 Tokens', price: '25'},
];

export const included = ['HyperHive AI included', 'Shared across your crews', 'Deterministic sizing and exits', 'Signed slips and public record'];

// Simple role marks shown in the "Five roles" tickers.
export const roleMarks = [
  ['Scouts', '<circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="24" cy="24" r="7"/>'],
  ['Skeptic', '<path d="M5 24 24 5l19 19-19 19zM14 24l10 10 10-10-10-10z" fill-rule="evenodd"/>'],
  ['Sizer', '<path d="M5 7h38v7H5zm0 14h26v7H5zm0 14h14v7H5z"/>'],
  ['Executor', '<path d="M7 12 24 3l17 9v24l-17 9L7 36zm6 4v16l11 6 11-6V16l-11-6z" fill-rule="evenodd"/><path d="M21 14h6v20h-6z"/>'],
  ['Auditor', '<path d="M24 3 42 12v12c0 9-9 18-18 21C15 42 6 33 6 24V12zm-9 20 7 8 13-16-5-4-8 11-3-4z" fill-rule="evenodd"/>'],
  ['Signed orders', '<path d="M8 4h23l10 10v30H8zm6 6v28h21V18H27v-8z" fill-rule="evenodd"/><path d="M18 22h13v4H18zm0 8h13v4H18z"/>'],
  ['Public record', '<circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="5"/><path d="M21 7h6v34h-6zM7 21h34v6H7z"/>'],
];
