# Anti-rug launchpad on NEAR

Rust + `near-sdk` contract scaffold and React + TypeScript + Vite frontend, following `hackathon-plans/antirug-launchpad-plan.md`. Testnet-only. This is an unimplemented scaffold, not a deployed or audited launchpad. No claim that every rug vector is prevented.

## Setup

Requirements: Rust toolchain with `wasm32-unknown-unknown`, `cargo-near`, Node.js 20+, npm, and `near-cli-rs`. Contract SDK dependencies are declared in `contract/Cargo.toml`.

```sh
cd frontend
npm install
npm run dev
```

```sh
cd contract
cargo test
cargo near build
```

The current Rust module and test files are deliberate stubs; `todo!()` contract entry points panic until implemented. Frontend wallet signing, contract views, and transactions are also not wired. Do not treat a successful shell render as working token mechanics.

## Local sandbox and testnet (after implementation)

1. Implement invariants and tests first. Use NEAR sandbox through `near-workspaces` or the current `cargo-near` sandbox workflow, then run `cargo test` and adversarial tests.
2. Configure local frontend `.env.local` with `VITE_CONTRACT_ID` only after deploying to an isolated local sandbox. Do not commit environment files or keys.
3. For testnet, configure `testnet` accounts with `near-cli-rs`, build the WASM, deploy to a dedicated testnet account, and record the account ID and transaction links. Verify deployment immutability and the selected FT integration before making any claims.
4. Start the frontend with `npm run dev`; connect a wallet and show live view data only after implementing and verifying those flows.

Never use mainnet funds or deploy without explicit authorization. No contract IDs, token factory behavior, transactions, or security guarantees are supplied by this scaffold.

## File map

- `frontend/src/App.tsx`, `style.css`: editorial React shell and create, token-view, and rug-attempt views
- `frontend/src/near.ts`: testnet and contract-ID configuration placeholder
- `contract/src/lib.rs`: launchpad state shell and unimplemented API entry points
- `contract/src/token_factory.rs`: fixed-supply/no-mint design module stub
- `contract/src/liquidity_lock.rs`: one-way pool custody module stub, no unlock method scaffolded
- `contract/src/dev_vesting.rs`: vesting module stub
- `contract/src/bonding_curve.rs`: buy/sell module stub
- `contract/src/holder_fees.rs`: pull-claim accounting module stub
- `contract/tests/*.rs`: one empty test placeholder per contract module
- `frontend/src/near.test.ts`: frontend test placeholder

## Planned invariants and limitations

The intended design is full capped supply minted at token initialization, with no callable later mint method, and no creator/admin liquidity withdrawal or rescue path. Vesting must be contract-enforced and permissionless to claim when vested. Bonding-curve trades need integer arithmetic and minimum-output checks. Fee distribution is intended as pull-based claims, not an all-holder loop. These are design targets only and are not yet implemented or verified. Pool liquidity may still trade under the curve and is not a promise of value or market liquidity.

Track and submission details: see the source plan. Hackathon-period implementation begins Nov 1, 2026. This scaffold was created before the event window; do not represent it as hackathon-built functionality. Add dependency/AI disclosure and a license before submission.
