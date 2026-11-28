<div align="center">

<img src="apps/web/public/art/hyperhive-wordmark.svg" alt="HyperHive" width="320" />

### AI trading crews for Hyperliquid perps

AI suggests the trade. Plain code sizes it. A sealed signer places it.<br/>
Every public fill is matched to a signed slip you can check yourself.

[![Website](https://img.shields.io/badge/website-hyperhive.tech-0b684e?style=for-the-badge)](https://hyperhive.tech)
[![Docs](https://img.shields.io/badge/docs-read-111111?style=for-the-badge)](https://hyperhive.tech/docs)
[![Whitepaper](https://img.shields.io/badge/whitepaper-read-111111?style=for-the-badge)](https://hyperhive.tech/whitepaper)
[![Demo](https://img.shields.io/badge/demo-1%20minute-97fce3?style=for-the-badge&labelColor=03211c)](https://hyperhive.tech/demo)

[![$HIVE](https://img.shields.io/badge/%24HIVE-0xeb53...5834-97fce3?labelColor=03211c)](#hive-contract-address)
[![Verify](https://github.com/HyperHiveELY/hyperhive-core/actions/workflows/verify.yml/badge.svg)](https://github.com/HyperHiveELY/hyperhive-core/actions/workflows/verify.yml)
[![Built on Hyperliquid](https://img.shields.io/badge/built%20on-Hyperliquid-97fce3?labelColor=03211c)](https://hyperliquid.xyz)
[![Elysium](https://img.shields.io/badge/contracts-Elysium%20·%2099901-0b684e)](#contracts)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.39-363636?logo=solidity&logoColor=white)](contracts/src/HyperHive.sol)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.12-339933?logo=node.js&logoColor=white)](package.json)
[![Security](https://img.shields.io/badge/security-report%20privately-b60205)](SECURITY.md)

</div>

---

## $HIVE contract address

```
0xeb53b31d32efeded72d72711f8c318dbcb415834
```

The same address is shown, ready to copy, at the top of [hyperhive.tech](https://hyperhive.tech) and inside the workspace.

## What HyperHive does

HyperHive runs a crew of five agents that trades Hyperliquid perps from a fresh account **you own**. The AI can only fill in a trade card. Deterministic code decides the size. A sealed signer holds the only key that can trade, places a stop and take-profit with every entry and runs every exit. An Auditor then matches each public fill to a slip that signer issued, so anyone can see how the account was traded.

HyperHive shows *how* an account was traded, not what it will make. **Trading perps can lose everything in the crew account.**

## How a crew works

| | Role | What it is | Can | Cannot |
|---|---|---|---|---|
| 1 | **Scouts** | 3 or 5 AI models, one angle each | Write a trade card | Set size or leverage, place an order |
| 2 | **Skeptic** | AI from a different model family | Reject or pass a card | Create or rewrite a card |
| 3 | **Sizer** | Plain code | Turn your weekly risk budget and volatility into size, leverage, stop and take-profit | Exceed the signed budget or market limits |
| 4 | **Executor** | Signer running measured code | Place, change and cancel orders; run exits | Withdraw, transfer, move to vaults or approve |
| 5 | **Auditor** | Staked, independent checker | Match fills to slips and vote on each hour | Change orders or records |

```text
risk     = min(0.20 × weekly budget, remaining weekly budget)
d        = max(|mark − invalidation|, 1.2 × ATR(1h))
leverage = clamp(floor(0.60 ÷ σ), 1, cap)        cap = 5 for BTC and ETH, 3 otherwise
size     = risk ÷ (d + 2 × mark × fees)
stop     = mark ∓ d          take-profit = mark ± 3d
```

Full details: [docs](https://hyperhive.tech/docs) · [whitepaper](https://hyperhive.tech/whitepaper)

## Who can move your funds

- **You.** Each crew account is created in your browser and its key never leaves it. Withdrawals need that key.
- **The trading key** can only trade. Its signer refuses withdrawals, transfers, vault moves and approvals, and it expires after at most 180 days.
- **Stand down** stops new entries only. Stops, take-profits and exits keep running, and you can always close or withdraw on Hyperliquid yourself.

## Repository

| Path | What's inside |
|---|---|
| [`apps/web`](apps/web) | Website, workspace dashboard and guided walkthrough |
| [`apps/api`](apps/api) | API, sessions, Tokens checkout and record pages |
| [`apps/signer`](apps/signer) | Executor: signs slips and orders, runs exits |
| [`apps/worker`](apps/worker) | Crew loop: scouts, Skeptic and Sizer |
| [`apps/auditor`](apps/auditor) | Independent Auditor and hourly match roots |
| [`apps/paper`](apps/paper) | Paper trading engine |
| [`packages/core`](packages/core) | Sizing, exits, slips, matching and verification |
| [`packages/ai`](packages/ai) | Model calls behind the Scouts and Skeptic |
| [`contracts`](contracts) | `HIVE`, `MeasurementRegistry`, `SlipRoot`, `AuditorStake`, `FeeSplitter`, `BuyBurn`, `Governance` |
| [`tests`](tests) | Regression, property and contract suites |

## Quick start

```bash
npm install
cp .env.example .env
npm run local
```

Live trading is off by default (`LIVE_TRADING_ENABLED=false`), so a local run uses paper trading.

```bash
npm run typecheck     # TypeScript
npm test              # contracts build + test suite
npm run verify        # check a record's slips and roots
```

## Contracts

Contracts deploy to **Kinetiq Elysium, chain ID 99901**, behind a two-day governance timelock. Fees route through a fixed on-chain split: 80% to worker operators, 10% treasury, 5% staked Auditors and 5% to buy and burn $HIVE. See [SECURITY.md](SECURITY.md) for the authority model and invariants.

## Security

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/HyperHiveELY/hyperhive-core/security/advisories/new). Never include wallet backups, credentials or private keys. Details in [SECURITY.md](SECURITY.md).

## License

The first-party code is available for inspection under the [HyperHive rights notice](LICENSE). Separately licensed files keep their own terms; see [third-party notices](third-party/NOTICES.md).

---

<sub>HyperHive is independent software built on Hyperliquid’s public API. It is not affiliated with or endorsed by Hyperliquid. Not financial advice. Not offered in the United States, Ontario or sanctioned regions.</sub>
