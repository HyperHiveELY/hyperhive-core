# HyperHive security

## Reporting and incident ownership

HyperHive’s designated public disclosure channel is GitHub Private Vulnerability Reporting. On the official public HyperHive repository, open **Security and quality** and select **Report a vulnerability**. Send the affected version or commit, the impact and the minimum information maintainers need to investigate. Keep wallet backups, credentials and private keys out of the report. [GitHub reporting instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately)

If the reporting form is unavailable, ask the maintainers for a private contact through a GitHub issue. Share vulnerability details only through the private channel.

| Authority | Holder and powers | Incident action |
| --- | --- | --- |
| Crew account | Browser-held key signs policy, approves/revokes the named agent, transfers or withdraws | Use the crew backup and direct recovery tool or the venue. Preserve protective orders until flat. |
| Owner account | Signs authenticated session, Pause, Close and Start for its own crew | Pause entries. Request Close when appropriate. Check the venue before considering a queue acknowledgement complete. |
| Trading agent | Local seed or measured Phala process, per crew and policy generation | Revoke the agent at HyperCore on suspected compromise. On-chain retirement prevents a compliant signer from opening new exposure. |
| Slip poster | Measured signer funded with Elysium gas | Registers an immutable crew/account binding before its first hosted entry. Posts hourly roots. Stop posting and retire the measurement on compromise. |
| Governance | Two-day TimelockController, with configured proposer/canceller and open execution of matured actions | Controls registry proposals/posters, one-time auditor wiring, router allowlist and buy/burn amounts. Review current roles and delay on-chain. |
| Guardian | Address specified in deployment inputs | Can retire measurements and halt auditor rounds. Governance alone resumes rounds. User withdrawals and reward claims stay callable. |
| Bonded auditors | Independent operator wallets and their vote backups | Check the public roster, archive and venue, commit, reveal, finalize and claim. Preserve vote backups through restart. |
| Operator and recipients | Host operator controls database, AI credentials, checkout receiver and eligibility settings. Worker, treasury and burn destinations are constructor-bound | Isolate affected hosts, suspend new admissions, reconcile invoice and order journals, rotate exposed service credentials. |

The timelock administers its own role grants and revocations and can change its delay only through a scheduled call to itself. Proposers schedule operations, cancellers cancel pending operations, and anyone can execute a matured operation when the executor role is open. The deployer receives no separate permanent administrator role. The timelock owns MeasurementRegistry, SlipRoot and BuyBurn. Their inherited ownership controls include proposing an ownership transfer, acceptance by the named successor and renunciation. The token recipient holds the initial supply. Each holder can transfer or burn its own tokens or authorize a spender.

Registry governance proposes measurements and binds posters to measurements and quotes. Activation after the delay is permissionless. A bound active poster can register accounts and post roots. The auditor contract alone writes match roots after settlement. BuyBurn governance sets routers and supplies the exact per-call input amount, minimum output and route. FeeSplitter recipients and plan prices are fixed. The guardian can halt new rounds and stop slashing at finalization. Resumption requires governance.

## Trust and invariants

Trust boundaries include the delivered browser code, local filesystem or enclave KMS, approved measurements, chain finality, exchange data availability, database availability and independent auditor participation. Censorship by an archive or chain outage can prevent a vote. Local signer filesystem permissions provide no hardware isolation. Price gaps, slippage and venue availability can change actual losses. Paid AI outcomes are never an authority to sign withdrawals or bypass signed sizing and market limits.

| Property | Verification |
| --- | --- |
| Bonds cover auditor stakes, reward balances cover liabilities, payouts conserve supply, the router retains zero allowance after a successful burn | contracts/test/Accounting.t.sol, tests/contracts.test.ts |
| A historical hour cannot enroll or penalize a late-joining auditor | tests/contracts.test.ts |
| Quiet-hour accounts come from the chain roster, and omissions stop verification | tests/independent-audit.test.ts |
| Admission requires a signed current policy and controls, with Pause and paper conversion serialized against the final send | tests/mainnet-flow.test.ts, tests/paper.test.ts, tests/postgres.test.ts |
| Recovery requires continuity from flat and confirmed terminal cancellation state | tests/recovery-continuity.test.ts, tests/mainnet-flow.test.ts |
| AI reservations, token settlement and recovery remain idempotent | tests/tokens.test.ts, tests/postgres.test.ts |
| Entry sizing respects weekly risk and available margin | tests/risk.test.ts, tests/risk-properties.test.ts |
| Browser key encryption and backup restoration bind account identity | tests/wallet.test.ts, tests/owner-wallet-replacement.test.ts |
| Receipt and runtime verification use an independent build and expected roles | packages/core/deployment-verification.ts, tests/elysium.test.ts, tests/deployment-rehearsal.test.ts |
| Fee split and strict-majority mathematical obligations | scripts/prove-accounting.py |

## Monitoring and incident response

Run `npm run monitor -- FIRST_UNPROCESSED_BLOCK` under an operator-owned scheduler with independent Elysium RPC, verified settings, database connection, monitored signer address, minimum gas in HYPE and USDC outflow threshold in token base units. The environment keys are `MONITORED_SIGNER`, `SIGNER_GAS_FLOOR_HYPE` and `USDC_OUTFLOW_ALERT_UNITS`. Persist the reported next block after delivering the alerts. Exit 2 reports alerts. A read failure requires retry from the previous cursor. Monitor stale roots, role and poster changes, round halts, signer gas, large USDC transfers and application readiness. Configure the external receiver and rehearse its delivery before activation.

Before applying saved stops or automated closes, the signer checks that the venue position still descends from its signed entry. A gap in venue history or an independent reopen suspends automation for that crew. The owner can still use direct recovery to inspect and flatten the account.

During an incident, pause new admissions and retain the signer’s protective exit capability. Retire a suspect measurement or halt rounds using the designated authority. Check exposure and revoke compromised agents directly at the venue. Reconcile chain receipts, fills and terminal cancellations before restarting. Require independent review of a new measurement and a new owner-signed Start where the policy changed.

## Accepted risks and release gates

No open audit finding has been accepted on behalf of the owner. Local signing, historical frontend assets and third-party notices have the scope documented in README and third-party/NOTICES.md. The deployment is immutable. Regenerate all seven deployment transactions after contract changes and recheck runtime hashes. Keep previous unsigned plans and published evidence labeled by build. Mainnet activation requires verified deployments and signer attestation, funded acceptance, operational contacts and owner approval.

### Static analysis disposition

Slither flags a balance-before/balance-after pattern at the governed buy-and-burn swap. The received-token delta enforces the minimum output. The immutable output token is the deployed HHIV ERC20, the swap entry is non-reentrant, and the router has a single-call allowance. The narrowly scoped detector annotation documents this reviewed pattern. The accounting invariant independently checks allowances, balances, rewards and supply after successful handler calls.

### Alert delivery and acknowledgement

Run `npm run monitor -- --deliver FIRST_UNPROCESSED_BLOCK` on a schedule against the initialized application database with `MONITOR_WEBHOOK_URL` set to an operator-controlled HTTPS receiver. The first block seeds a new cursor. A PostgreSQL advisory lock serializes scans for that chain, root and destination. Each alert request includes its confirmed block range and an idempotency key. The receiver should retain that key across retries and acknowledge only after accepting the alert. The monitor saves the exact payload before transmission. A failed or ambiguous delivery retries that payload with the same key, including when the chain head or health checks change. Successful delivery or a clean range advances the cursor. Exit 2 means alerts were observed, even after successful delivery. A scheduler may invoke the same command again. Configure an on-call recipient and verify the actual endpoint before funded operation.
