// Content for /docs and /whitepaper. Numbers here mirror packages/core/risk.ts, packages/core/proof.ts and
// contracts/src/HyperHive.sol; update both together.
import {milestones} from './content';

/** Block shapes: ['p',text] ['h3',text] ['list',items] ['steps',items] ['defs',[[term,text]]]
 *  ['table',head,rows] ['formula',lines,caption?] ['note',text] */

const sizingFormula = [
  'risk     = min(0.20 × weekly budget, weekly budget − realised losses − open risk)',
  'd        = max(|mark − invalidation|, 1.2 × ATR(1h))',
  'leverage = clamp(floor(0.60 ÷ σ), 1, cap)      cap = 5 for BTC and ETH, 3 otherwise',
  'size     = risk ÷ (d + 2 × mark × (taker fee + builder fee))',
  'stop     = mark ∓ d          take-profit = mark ± 3d',
];
const sizingLimits = [
  'Leverage steps down until mark × (1 ÷ leverage − 0.10) ≥ 2.5 × d, so liquidation sits well beyond the stop.',
  'Size never uses more than 80% of free margin at the chosen leverage.',
  'All HyperHive crews together hold at most 1% of a market’s open interest.',
  'Orders under $10 of notional are not sent.',
];
const exitRules = [
  'Time stop: the position closes when the card’s horizon ends (4 to 72 hours).',
  'Funding stop: the position closes once funding paid exceeds 25% of the trade’s planned risk.',
  'After a 3% move in the crew’s favour, the stop moves to at least entry plus 0.2% (break-even after fees) and trails 1.5 × ATR behind the best price.',
  'After a move of twice the planned risk, the stop locks in at least 60% of the best move.',
  'A stop is only moved when the change is at least 0.25 × ATR, and at most once every 30 seconds.',
];
const recordStates = [
  ['Matched', 'A public fill links to a signed slip by its order ID.'],
  ['Venue event', 'Liquidation, auto-deleveraging and similar exchange actions. Shown separately, not counted as a break.'],
  ['Broken', 'A fill with no slip, such as a manual trade. The record shows it as broken from that hour onward.'],
  ['Unaudited', 'The hour has no Auditor majority yet. It stays visible as unaudited rather than being skipped.'],
];
const authority = [
  ['Crew account key', 'Your browser', 'Withdraw, transfer, approve or revoke the trading key, sign the policy'],
  ['Trading key', 'The Executor (hosted enclave or your own computer)', 'Orders, changes, cancels, TWAPs and isolated leverage only'],
  ['HyperHive operator', 'The studio', 'Runs the AI, the database and the Auditors at launch. Holds no key that can move your funds'],
];

export const docsPage = {
  eyebrow: 'Documentation',
  title: 'HyperHive docs',
  intro: 'How to set up a crew, what it does with your account, and how to check its record yourself.',
  groups: [
    {name: 'Start here', sections: [
      {id: 'overview', title: 'Overview', blocks: [
        ['p', 'HyperHive runs AI trading crews on Hyperliquid perps. Each crew trades from a fresh Hyperliquid account that you own. AI models suggest trades. Plain code sizes them. A separate signer holds the only key that can trade, and every public fill is checked against a slip that signer issued.'],
        ['p', 'HyperHive shows how an account was traded. It does not promise what an account will make. Trading perps can lose everything in the crew account.'],
      ]},
      {id: 'quick-start', title: 'Quick start', blocks: [
        ['steps', [
          'Open the workspace and create your owner wallet. It is encrypted in your browser and never sent to HyperHive.',
          'Buy Tokens with USDC. Tokens pay for the AI your crews use.',
          'Build a crew: choose three or five scouts, your markets and a weekly risk budget.',
          'Practise first if you like. A paper crew runs the same process with paper money.',
          'To trade live, accept the trading terms in Settings → Access, fund the crew account with USDC on Hyperliquid, approve its trading key and builder fee cap, then sign Start.',
        ]],
        ['note', 'Fund a crew account only with what you want that crew to trade.'],
      ]},
      {id: 'glossary', title: 'Glossary', blocks: [
        ['defs', [
          ['Crew', 'One trading setup: its scouts, markets, weekly risk budget and Hyperliquid account.'],
          ['Scout', 'An AI that watches one angle (trend, crowding or price levels) and writes trade cards.'],
          ['Skeptic', 'An AI from a different model family that tries to reject each card. It can block a trade, never write one.'],
          ['Sizer', 'Plain code that turns your budget and the market’s volatility into a size, leverage, stop and take-profit.'],
          ['Executor', 'The signer that holds the trading key, places orders and runs every exit.'],
          ['Auditor', 'A staked checker that matches public fills to slips each hour.'],
          ['Trade card', 'The structured idea a scout writes: market, side, invalidation price, horizon and reason.'],
          ['Slip', 'A signed record of one order, tied to its card, policy and the code that placed it.'],
          ['Weekly risk budget', 'The most the crew may put at risk in a week. The only sizing input you control.'],
          ['Tokens', 'Prepaid credit for AI usage. 1 USDC buys 1,000 Tokens.'],
          ['$HIVE', 'The HyperHive token, used for a fee tier and Auditor bonds.'],
        ]],
      ]},
    ]},
    {name: 'Your crew', sections: [
      {id: 'crew-sizes', title: 'Crew sizes', blocks: [
        ['table', ['', '3-scout crew', '5-scout crew'], [
          ['Markets', 'Up to 10', 'All 30'],
          ['Open positions at once', '3', '5'],
          ['Crews per wallet', '—', 'Up to three'],
        ]],
        ['p', 'The first release covers the 30 most-traded crypto perps on Hyperliquid.'],
      ]},
      {id: 'trade-cards', title: 'Trade cards', blocks: [
        ['p', 'A scout’s output is data, not a message. Each card is checked against a fixed schema before anything else sees it.'],
        ['table', ['Field', 'Meaning'], [
          ['market', 'One of the crew’s signed markets'],
          ['side', 'Long or short'],
          ['invalidation price', 'The price that proves the idea wrong. It must sit on the losing side of the current price.'],
          ['horizon', '4 to 72 hours'],
          ['reason', 'Up to 400 characters'],
        ]],
        ['p', 'The Skeptic then reviews the card from the same fixed fields. A card it rejects goes no further. News, chat and other text are treated as data and can never place an order.'],
      ]},
      {id: 'sizing', title: 'How a trade is sized', blocks: [
        ['p', 'Sizing is deterministic. There is no leverage slider. Volatile markets get smaller positions automatically.'],
        ['formula', sizingFormula, 'σ is the market’s annualised realised volatility. Fees are counted twice, for entry and exit.'],
        ['list', sizingLimits],
      ]},
      {id: 'exits', title: 'Exits', blocks: [
        ['p', 'Every entry goes to Hyperliquid together with its stop and take-profit, so both rest on the exchange from the start. The Executor then manages the exit without any AI involved.'],
        ['list', exitRules],
      ]},
      {id: 'controls', title: 'Pause, close and expiry', blocks: [
        ['defs', [
          ['Pause', 'Stops new entries. Stops, take-profits and exit management keep running.'],
          ['Close', 'Asks the Executor to flatten the crew’s positions.'],
          ['Direct control', 'You can always close positions, revoke the trading key or withdraw on Hyperliquid yourself.'],
          ['Key expiry', 'A trading key lasts up to 180 days. Renewing creates a new key. If it expires, new entries stop and the orders already at the exchange stay in place.'],
        ]],
      ]},
    ]},
    {name: 'Money', sections: [
      {id: 'tokens', title: 'Tokens and AI usage', blocks: [
        ['p', '1 USDC buys 1,000 Tokens. Tokens are shared across your crews and charged at current model rates plus the service markup shown in your dashboard. There is no monthly plan.'],
        ['p', 'Tokens are bought with USDC on Elysium from your built-in wallet. You can also bridge from Robinhood Chain in the workspace, then confirm the purchase separately. Tokens are separate from your trading funds and from $HIVE.'],
        ['p', 'Hold at least 100,000 $HIVE to claim 5,000 free Tokens each week in Workspace → Tokens. Connect the wallet holding $HIVE and click Claim. Your live balance is checked, and each wallet can claim once per week. Drops reset Monday at 00:00 UTC, with 500,000 Tokens available across all wallets each week. Holders also pay a 0.02% HyperHive fee instead of 0.03% on every fill. Current amounts and availability appear in Tokens.'],
        ['p', 'If a crew runs out of Tokens it stops looking for new trades. Exits never need the AI and keep running.'],
      ]},
      {id: 'fees', title: 'Fees', blocks: [
        ['table', ['Fee', 'Amount', 'When'], [
          ['AI usage', 'Tokens, at model rates plus markup', 'As your crews use AI'],
          ['Builder fee', '0.03% of order size, or 0.02% with an eligible $HIVE tier', 'Charged by Hyperliquid on each fill, within a 0.05% cap you approve once'],
          ['Hyperliquid fees and funding', 'Set by Hyperliquid', 'On each fill and funding interval'],
        ]],
        ['p', 'HyperHive charges no performance, deposit or withdrawal fee. Each record shows fee drag next to profit and loss.'],
      ]},
      {id: 'custody', title: 'Who can move your funds', blocks: [
        ['table', ['Key', 'Held by', 'Can do'], authority],
        ['p', 'The trading key’s signer refuses withdrawals, transfers, vault moves and approvals. Withdrawing from Hyperliquid needs the crew account’s own signature, which only your browser holds.'],
      ]},
    ]},
    {name: 'Records', sections: [
      {id: 'slips', title: 'Signed slips', blocks: [
        ['p', 'Before any order is sent, the Executor signs a slip. The slip binds the crew, its sequence number, the previous slip, the policy hash, the card hash, the code measurement of the signer and the order itself.'],
        ['p', 'The order’s client ID on Hyperliquid is the first 16 bytes of the slip’s hash, so a public fill points straight back to its slip. Slips form a chain: each one names the slip before it.'],
      ]},
      {id: 'record-states', title: 'Record states', blocks: [['defs', recordStates]]},
      {id: 'auditors', title: 'Hourly roots and Auditors', blocks: [
        ['p', 'Every hour the signer posts a root committing to the slips it issued. Auditors then match that hour’s public fills to slips and vote on the result with a commit, then a reveal. The agreed match root is written on-chain.'],
        ['p', 'Auditors stake $HIVE. Missing a vote or voting with the minority costs 10% of that round’s stake, which is burned. Three strikes remove an Auditor. At launch the studio runs every Auditor.'],
      ]},
      {id: 'verify', title: 'Check a record yourself', blocks: [
        ['steps', [
          'Download the crew’s slips and its public fills from Hyperliquid.',
          'Check each slip’s signature and that its client ID is the first 16 bytes of its hash.',
          'Rebuild the hourly roots with the open-source verifier in the public repository.',
          'Compare them with the roots posted on-chain.',
          'For hosted crews, check the signer’s attestation against the published code measurement.',
        ]],
      ]},
    ]},
    {name: 'Reference', sections: [
      {id: 'signers', title: 'Hosted and local signers', blocks: [
        ['p', 'The hosted signer runs inside a Phala confidential VM on Intel TDX. Its trading key is released only to registered code measurements, and anyone can check the attestation.'],
        ['p', 'You can also run the signer on your own computer. Its slips are signed but not hardware-attested, and the computer must stay on while your crews trade.'],
      ]},
      {id: 'availability', title: 'Availability', blocks: [
        ['p', 'HyperHive is not offered in the United States, Ontario or sanctioned regions. You confirm your eligibility before a crew can trade.'],
        ['p', 'HyperHive is independent software built on Hyperliquid’s public API. It is not affiliated with or endorsed by Hyperliquid.'],
      ]},
      {id: 'security', title: 'Report a security issue', blocks: [
        ['p', 'Use GitHub private vulnerability reporting on the public HyperHive repository. Never include wallet backups, credentials or private keys in a report.'],
        ['link', 'Report privately on GitHub', 'https://github.com/HyperHiveELY/hyperhive-core/security/advisories/new'],
      ]},
    ]},
  ],
};

export const whitepaper = {
  eyebrow: 'Whitepaper',
  title: 'HyperHive: accountable AI trading crews for Hyperliquid',
  meta: 'Version 1.0 · November 2026',
  abstract: 'HyperHive separates an automated trading account into five roles with fixed boundaries. AI models propose and challenge trade ideas but never reach the order path. Deterministic code sizes every position from a user-set weekly risk budget and current volatility. A single signer, running attested code, holds the only key that can trade and places every entry with an exchange-side stop and take-profit. Each order carries an identifier derived from a signed slip, and staked Auditors match every public fill to those slips each hour, writing the result on-chain. The result is an account whose process anyone can check. It makes no claim about returns.',
  sections: [
    {id: 'problem', title: 'The problem', blocks: [
      ['p', 'Automated trading tools tend to fail in the same places. The market call gets the attention, while losses come from position size, leverage and exits. Keys that can trade are often keys that can withdraw. And the results shown to users are usually screenshots or dashboards that nobody outside the operator can check.'],
      ['p', 'Large language models make this worse when they are put in charge of execution. They can be confidently wrong, they can be steered by text in their inputs, and their output varies from run to run. None of these properties belong near a signing key.'],
    ]},
    {id: 'principles', title: 'Design principles', blocks: [
      ['list', [
        'AI proposes, code decides. Model output is schema-checked data. It never sets size or leverage and never signs.',
        'One key, one job. The trading key can only trade. Withdrawals stay with the account owner.',
        'Exits never depend on AI. Stops and take-profits rest on the exchange and are managed by code.',
        'Every fill is accounted for. A fill without a slip is visible to anyone.',
        'Records are not ranked. They are listed by age, so luck is not promoted as skill.',
      ]],
    ]},
    {id: 'roles', title: 'System overview', blocks: [
      ['table', ['Role', 'What it is', 'Can', 'Cannot'], [
        ['Scouts', 'Three or five AI models, one angle each', 'Write a trade card', 'Set size, leverage or place an order'],
        ['Skeptic', 'AI from a different model family', 'Reject or pass a card', 'Create or rewrite a card'],
        ['Sizer', 'Deterministic code', 'Compute size, leverage, stop and take-profit', 'Exceed the signed budget or market limits'],
        ['Executor', 'Signer running measured code', 'Place, change and cancel orders; run exits', 'Withdraw, transfer, move to vaults or approve'],
        ['Auditor', 'Staked, independent checker', 'Match fills to slips and vote on the hour', 'Change orders or records'],
      ]],
      ['p', 'Using different model families for Scouts and the Skeptic keeps them from sharing the same blind spots.'],
    ]},
    {id: 'card', title: 'The trade card', blocks: [
      ['p', 'A card names a market from the crew’s signed policy, a side, an invalidation price on the losing side of the current price, a horizon between 4 and 72 hours, and a reason of up to 400 characters. Cards that fail the schema are discarded. The Skeptic sees only these fields and the same fixed market facts, never free text from the outside world.'],
    ]},
    {id: 'sizing', title: 'Deterministic sizing', blocks: [
      ['p', 'The weekly risk budget is the only sizing input the user controls. Each trade may use at most a fifth of it, and never more than what remains for the week after realised losses and open risk.'],
      ['formula', sizingFormula, 'd is the stop distance and σ the annualised realised volatility. The 1.2 × ATR floor keeps stops outside normal one-hour noise.'],
      ['list', sizingLimits],
      ['p', 'Because leverage falls as volatility rises, the same budget produces smaller positions in wilder markets. The 1% open-interest cap stops many crews from crowding into one trade.'],
    ]},
    {id: 'execution', title: 'Execution and exits', blocks: [
      ['p', 'The Executor sends each entry in the same batch as its stop and take-profit, so protection is on the exchange before the position can drift. Market data older than ten seconds is refused. Exit management then follows fixed rules:'],
      ['list', exitRules],
      ['p', 'Pausing a crew, running out of Tokens or losing the AI service stops new entries only. Exits continue.'],
    ]},
    {id: 'custody', title: 'Custody and authority', blocks: [
      ['p', 'Each crew trades from a fresh Hyperliquid account created in the user’s browser. Its key never leaves the browser. The user approves the Executor’s trading key once, as a named agent, for at most 180 days, together with a builder fee cap of 0.05%.'],
      ['table', ['Key', 'Held by', 'Can do'], authority],
      ['p', 'The signer’s allowlist accepts orders, changes, cancels, TWAPs and isolated leverage, and refuses withdrawals, transfers, vault moves and approvals. If a trading key were ever stolen, the exposure is limited to the crew account balance, which is why the funding screen asks users to fund only what they want traded.'],
    ]},
    {id: 'slips', title: 'Signed slips', blocks: [
      ['p', 'Every order is preceded by a slip, an EIP-712 typed record signed by the Executor. It binds:'],
      ['list', [
        'the crew, a sequence number and the hash of the previous slip, forming a chain;',
        'the hash of the signed policy and of the trade card;',
        'the code measurement of the signer and the agent address;',
        'the order itself, with creation and expiry times.',
      ]],
      ['p', 'The order’s client ID is the first 16 bytes of the slip digest. Anyone holding a public fill can therefore find its slip, check the signature and see which code placed it. If a fill type does not carry the client ID, matching falls back to the signer’s logged exchange acknowledgment, which is weaker and labelled as such.'],
    ]},
    {id: 'audit', title: 'Hourly audit', blocks: [
      ['p', 'Each hour the signer posts a root committing to that hour’s slips. Auditors with sufficient stake build the hour’s match result independently and commit to it, then reveal it inside a fixed window. A round needs at least two eligible Auditors. Stake is locked until a day after the reveal ends.'],
      ['defs', recordStates],
      ['p', 'An Auditor that does not vote, or votes against the majority result, loses 10% of its stake for that round, which is burned. Three strikes remove it from the roster. An Auditor cannot join a round for an hour that began before it became eligible.'],
    ]},
    {id: 'contracts', title: 'Contracts and governance', blocks: [
      ['p', 'The contracts deploy to Kinetiq Elysium, chain ID 99901.'],
      ['table', ['Contract', 'Purpose'], [
        ['HIVE', 'The $HIVE ERC-20 token'],
        ['MeasurementRegistry', 'Approved signer code measurements and the posters bound to them'],
        ['SlipRoot', 'Crew account bindings and hourly slip and match roots'],
        ['AuditorStake', 'Stakes, commit–reveal rounds, strikes and rewards'],
        ['FeeSplitter', 'Fixed split of incoming fees'],
        ['BuyBurn', 'Buys $HIVE with its share of fees and burns it'],
        ['Governance', 'A two-day timelock that owns the registry, roots and buy-and-burn'],
      ]],
      ['p', 'Changes to approved measurements, posters and routes pass through the 48-hour timelock. A separate emergency role can retire a measurement or halt Auditor rounds; only governance can resume them. User withdrawals and reward claims stay callable throughout.'],
    ]},
    {id: 'economics', title: 'Economics and $HIVE', blocks: [
      ['p', 'Users prepay AI usage with Tokens (1 USDC buys 1,000 Tokens). Each filled order pays a builder fee of 0.03% of order size, or 0.02% for eligible $HIVE holders. There is no performance, deposit or withdrawal fee.'],
      ['p', 'Wallets holding at least 100,000 $HIVE can claim 5,000 free AI Tokens once per UTC week through Workspace → Tokens. The weekly pool is 500,000 Tokens across all wallets and resets Monday at 00:00 UTC. Claims check the current on-chain balance; the workspace shows current amounts and availability.'],
      ['table', ['Fee share', 'Destination'], [
        ['80%', 'Worker operators, who run the crews (the studio at launch)'],
        ['10%', 'Treasury'],
        ['5%', 'Staked Auditors, as pay for checking'],
        ['5%', 'Buy and burn of $HIVE'],
      ]],
      ['p', '$HIVE holders get a lower builder fee and weekly free AI Tokens. Auditor bonds are a later step for taking part in checking trade records. It is not a claim on revenue.'],
      ['ca'],
    ]},
    {id: 'limits', title: 'Limits and risks', blocks: [
      ['list', [
        'Trading perps can lose everything in the crew account. Stops do not prevent slippage, halts, liquidation or auto-deleveraging.',
        'No trading edge is claimed. Discipline reduces avoidable losses; it does not create profit.',
        'A slip proves which code placed a trade, not that the code is good.',
        'Attestation relies on Intel TDX and Phala’s key service. A local signer is not hardware-attested.',
        'Manual trades in a crew account break its record. Use a separate account for your own trades.',
        'At launch the studio runs every worker and Auditor. Separate keys and processes are not separate organisations.',
      ]],
    ]},
    {id: 'roadmap', title: 'Roadmap', blocks: [
      ['table', ['Stage', 'Milestone', 'Scope'], milestones.map(m => [m.stage, m.name, m.desc])],
    ]},
  ],
  disclaimer: 'HyperHive is independent software built on Hyperliquid’s public API and is not affiliated with or endorsed by Hyperliquid. This paper describes the system as built and is not financial advice. HyperHive is not offered in the United States, Ontario or sanctioned regions.',
};
