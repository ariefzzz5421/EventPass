# Security assumptions and remaining risks

## Implemented controls

- OpenZeppelin ERC-721, AccessControl, SafeERC20, Pausable, and ReentrancyGuard; six-decimal token validation and exact-received payment check.
- Nontransferable tickets, pre-start cancellation, one-time original-buyer refunds, and post-end settlement from escrow.
- SIWE with expiring one-use nonce, chain/domain checks, server-side sessions, origin checks, protected APIs, Zod input validation, and database-backed rate limits.
- Staff permission checks and 45-second HMAC QR credentials. Atomic transaction and unique `CheckIn.ticketId` prevent duplicate admissions; a credential nonce can be used once.
- Banner upload checks file size, MIME type, and file signature; published banners use random names.
- Eight-confirmation indexing, unique chain log identifiers, reorg rollback, and onchain financial reconciliation.

## Before a public launch

1. Obtain independent smart contract and app security review. Run a full funded Base Sepolia rehearsal with at least one organizer, buyer, staff member, cancellation, refund, and settlement.
2. Verify the exact USDC address against [Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses), contract bytecode on BaseScan, RPC chain ID, treasury address, admin signer, and deployed source. Base Mainnet uses a separate approved rollout; the shipped app is pinned to Sepolia.
3. Use dedicated managed RPC, database backups, secret rotation, monitoring, RPC fallback, and an always-on indexer. Monitor checkpoint lag, 503s, accounting mismatches, refund liabilities, and failed check-ins.
4. Define legal terms, chargeback/support process, event cancellation governance, and organizer identity requirements. Crypto settlement does not prove a physical event occurred.

## Known limits

- Backend check-in depends on RPC and database availability. Network outages fail admission closed. Staff should have a documented manual exception process outside the app if an event requires one.
- A compromised QR screenshot is usable within its 45-second lifetime if the original holder has not checked in. Consider live wallet challenge or physical identity checks for high-value events.
- Browser requests use same-origin checking for mutations, but sessions and the site should run only on HTTPS in staging and production.
- Rate limits are database buckets and need routine expiry cleanup. They are not a replacement for edge abuse protection.
- The current reorg recovery window is 128 blocks. A deeper fork requires incident review and controlled reindexing. Reorgs after physical admission cannot undo entrance; audit logs flag orphaned check-ins.
- Public event metadata is mutable after publication, while immutable chain price, supply, and schedule remain fixed. Organizers could make misleading copy changes; moderation and change history should be expanded before mainnet.
- Contract admin can approve organizers and pause sales; safeguard the admin wallet with multisig/hardware controls before mainnet. Pausing does not disable cancellation or refunds, preserving customer recovery.
- No external audit, funded testnet end-to-end transaction, or real deployment has been claimed.
- The 2026-10-11 `npm audit --omit=dev` run reported 5 high and 20 moderate package advisories, including transitive Prisma, PostCSS, and wallet WebSocket dependencies. Compatible automatic fixes were applied, but clearing the remaining reports requires a tested major-version migration or upstream fixes. Review exploitability and clear these before a public mainnet launch.
