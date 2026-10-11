# Deployment and operations

No deployment is performed by these instructions. Review the addresses and obtain explicit approval before broadcasting transactions or connecting a live Vercel project.

## Base Sepolia staging contract

1. Confirm your RPC reports chain ID `84532` and verify your test USDC address against [Circle's contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses). `EventTicket` rejects non-contract and non-six-decimal token addresses. Use the `MockUSDC` contract only for local or isolated testnet experiments; it is not Circle USDC.
2. Run `npm ci` at repository root and `forge test -vv` in `contracts`. Fund a dedicated deployment signer with Base Sepolia test ETH. Keep its key in a hardware wallet or local Foundry keystore, never in this repository or a command pasted into chat.
3. Set `USDC_ADDRESS`, `ADMIN_ADDRESS`, and `FEE_RECIPIENT_ADDRESS` in the **local shell**. The admin and treasury are distinct operational choices, even if they initially point to the same controlled organization. Then preview the deployment:

```powershell
cd contracts
$env:USDC_ADDRESS = '<verified Base Sepolia test USDC address>'
$env:ADMIN_ADDRESS = '<admin wallet address>'
$env:FEE_RECIPIENT_ADDRESS = '<treasury wallet address>'
$env:BASE_SEPOLIA_RPC_URL = '<dedicated Base Sepolia RPC URL>'
forge script script/Deploy.s.sol:Deploy --rpc-url $env:BASE_SEPOLIA_RPC_URL --account eventpass-deployer
```

4. After approval, add `--broadcast` to the same command, or use `--ledger` for a hardware wallet. Foundry prompts for keystore signing. Record the contract address and deployment block from the receipt. Do **not** put a private key in `.env.example`, Git, screenshots, or CLI history.
5. Verify source on BaseScan with a locally configured explorer API key (do not commit it). Example after deployment, using the same compiler settings from `contracts/foundry.toml`:

```powershell
$env:ETHERSCAN_API_KEY = '<local explorer API key>'
$constructor = cast abi-encode 'constructor(address,address,address)' $env:USDC_ADDRESS $env:ADMIN_ADDRESS $env:FEE_RECIPIENT_ADDRESS
forge verify-contract --chain-id 84532 --watch --verifier etherscan --constructor-args $constructor '<deployed contract address>' src/EventTicket.sol:EventTicket
```

6. Read back `usdc()`, `feeRecipient()`, `DEFAULT_ADMIN_ROLE`, and deployment bytecode. Put the contract address in `NEXT_PUBLIC_EVENT_TICKET_ADDRESS` and the block in `INDEXER_START_BLOCK`. Verify a signed admin can grant `ORGANIZER_ROLE`; the app's approval screen completes this for an applicant.

[Foundry's deployment and verification guide](https://getfoundry.sh/forge/deploying/) describes broadcast and explorer verification. Contract calls, funded gas, and test USDC are external actions requiring approval.

## Database and Vercel staging

1. Provision managed PostgreSQL with backups and a connection URL supported by Prisma. Apply the committed migration to **staging** using `cd apps/web; npx prisma migrate deploy`. Keep the DB private and use a pooled URL for the serverless app if the provider requires one.
2. Import the Git repository into Vercel as a Next.js project. Set **Root Directory** to `apps/web` and enable **Include source files outside Root Directory** for the shared workspace. Use `npm run build` (the script generates Prisma Client first); verify the installer finds the root lockfile. [Vercel's monorepo guide](https://vercel.com/docs/monorepos) covers this setting.
3. Set staging environment variables from `.env.example`: `DATABASE_URL`, `SESSION_SECRET`, `QR_SIGNING_SECRET`, `NEXT_PUBLIC_APP_URL` (exact HTTPS origin), `BASE_SEPOLIA_RPC_URL`, `NEXT_PUBLIC_EVENT_TICKET_ADDRESS`, `NEXT_PUBLIC_USDC_ADDRESS`, `INDEXER_START_BLOCK`, `CRON_SECRET`, and `PLATFORM_ADMIN_WALLETS`. Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for WalletConnect. Add `BLOB_READ_WRITE_TOKEN` if banner uploads are required. Use distinct secrets for staging and production.
4. Deploy staging only after permission. Check `/`, `/explore`, SIWE login, organizer approval, event creation, USDC allowance/purchase, indexed My Tickets, QR redemption, canceled-event refund, and post-event settlement with real confirmed Sepolia transactions. Confirm a second scan fails.
5. Operate `npm run index:poll` as an external worker with `INDEXER_URL=https://<staging-host>/api/index` and the same server-side `CRON_SECRET`. The worker calls a single bounded batch every 15 seconds by default, logs failures, and resumes from the persisted checkpoint. Use a process manager that restarts it and alerts on lag. Vercel Cron can also call the route; [Vercel's cron guidance](https://vercel.com/docs/cron-jobs/manage-cron-jobs) notes Hobby schedules are limited to once per day, which is too slow for ticket issuance and check-in, and failed invocations are not retried. Do not rely on a daily cron for active events.

## Rollback and incident response

- **Web defect:** stop the poller if indexing is implicated; redeploy the last known good web build after checking Prisma migration compatibility. Do not roll back a migration by deleting live records. Restore a database snapshot only after reconciling all confirmed chain logs since the snapshot.
- **Indexer mismatch or deep reorg:** stop the worker, save logs/checkpoint and relevant block hashes, verify the contract onchain, then repair affected indexed rows from the canonical chain. Resume only after ticket counts, gross, fees, refunds, and check-in anomalies are reviewed. Physical admissions already made need a separate audit record.
- **Credential exposure:** rotate `SESSION_SECRET`, `QR_SIGNING_SECRET`, `CRON_SECRET`, RPC and storage tokens; revoke or rotate compromised chain roles with the admin wallet. Rotating the session secret invalidates sessions. Never log the bearer secret or QR payload.
- **Contract incident:** the authorized `PAUSER_ROLE` can stop purchases and event creation. Refunds and cancellations remain available by design. Communicate verified status and preserve transaction evidence.
- **Database outage:** admission and account actions fail closed. Restore from backups, replay confirmed chain events from a checked checkpoint, and verify offchain staff/check-in state before reopening scanner access.

## Base Mainnet gate

The client and indexer are pinned to Base Sepolia; simply changing an address does not activate Mainnet. Mainnet requires explicit separate approval, a new verified deployment, official Circle USDC address confirmation, audited contract and app, production wallet/multisig operations, new chain configuration and explorer URLs, managed RPC/DB, monitoring, incident owner, legal review, and a full staging rehearsal. Never reuse staging secrets or assume test token behavior matches production.
