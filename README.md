# EventPass

EventPass is a Base Sepolia NFT ticketing MVP. Approved organizers create events, customers pay six-decimal USDC to mint nontransferable ERC-721 tickets, and authorized staff redeem short-lived QR credentials once. Payments stay in contract escrow until the event ends or a canceled event's original buyers claim refunds. The platform fee is 2% of ticket price, rounded down to the smallest USDC unit.

**Current status:** source, local build, contract tests, database integration tests, and CI configuration are included. No EventTicket deployment, funded testnet purchase, production deployment, or public security audit has been performed. A real Sepolia end-to-end run requires a funded administrator wallet, test USDC, RPC, database, and explicit deployment authorization.

## Repository

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js site, API routes, Prisma, wallet checkout, scanner |
| `contracts` | Foundry Solidity contract, mock USDC, tests, deployment script |
| `packages/shared` | Integer USDC formatting and shared constants |
| `scripts/poll-index.mjs` | Optional continuously running indexer caller |
| `docs` | Architecture, security, deployment, incident guidance |

## Local setup (PowerShell)

Prerequisites: Node.js 24, npm, PostgreSQL 16+, and Foundry `forge` on `PATH`. Install Foundry using the [official guide](https://getfoundry.sh/getting-started/installation); Windows users can use a compatible shell or the official release binary.

```powershell
git clone https://github.com/ariefzzz5421/EventPass.git
cd EventPass
npm.cmd ci
Copy-Item .env.example apps/web/.env.local
```

Edit `apps/web/.env.local`: set a local PostgreSQL `DATABASE_URL`, distinct random `SESSION_SECRET` and `QR_SIGNING_SECRET`, and `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Leave contract address empty until deployed. The public pages and organizer application work without the contract; minting and check-in require it. To start PostgreSQL with Docker:

```powershell
docker run --name eventpass-postgres -e POSTGRES_USER=eventpass -e POSTGRES_PASSWORD=eventpass -e POSTGRES_DB=eventpass -p 5432:5432 -d postgres:16
npm.cmd run db:generate
Push-Location apps/web
npx.cmd prisma migrate deploy
Pop-Location
npm.cmd run dev
```

Open `http://localhost:3000`. If port 5432 is occupied, choose a different Docker host port and update the URL. Local development still needs a real Base Sepolia EventTicket deployment for the complete purchase flow. For a purely local chain, use Foundry Anvil and adapt the chain configuration; the shipped wallet and API target Base Sepolia only.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
Push-Location contracts
forge test -vv
Pop-Location
```

Database integration tests run when `DATABASE_URL` is set; otherwise they skip. CI supplies PostgreSQL and runs them. The Foundry tests include price, supply, sale window, role, pause, transfer, refund, settlement, and fuzz coverage.

## User flow

1. A wallet signs a SIWE message; the server checks a one-use nonce and creates an HTTP-only session.
2. The user applies as an organizer. A platform admin with both an app role and the contract admin role grants the onchain organizer role, then approves the profile in the database.
3. The organizer saves event metadata, sends `createEvent`, and submits its transaction hash after eight confirmations. The server verifies the matching event log and immutable terms.
4. The buyer checks six-decimal USDC balance, approves the precise price if needed, and purchases. `TicketPurchased` is indexed after eight confirmations.
5. My Tickets checks `ownerOf` and `ticketEvent` onchain. It issues signed QR data that expires after 45 seconds.
6. Staff sign in and use camera or manual entry. The server verifies the credential, staff permission, event, onchain ownership, and atomic check-in uniqueness.
7. Before event start, an organizer may cancel. Original buyers claim full refunds and their NFTs burn. For completed uncanceled events, proceeds and platform fees become withdrawable after event end.

The app does not request seed phrases or private keys. Contract deployment can use a hardware wallet or a local Foundry keystore. See [architecture](docs/ARCHITECTURE.md), [security assumptions](docs/SECURITY.md), and [deployment guide](docs/DEPLOYMENT.md).

## Configuration

All variables are documented in [`.env.example`](.env.example). `NEXT_PUBLIC_*` values are browser-visible addresses/settings. Keep `DATABASE_URL`, signing secrets, Blob token, and `CRON_SECRET` server-side. Circle's [contract address list](https://developers.circle.com/stablecoins/usdc-contract-addresses) is the source for USDC address verification; recheck it at deployment time. The code enforces a six-decimal token and checks that the configured contract points at that token. Base Sepolia is chain ID 84532 per [Base documentation](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId).

## Limits

Testnet deployment and real wallet purchase have not been verified. The application has no automated recovery for reorgs deeper than 128 indexed blocks and halts for manual review. QR codes need live server and RPC access for admission. This MVP should receive an independent contract review and full staging rehearsal before handling real funds.
