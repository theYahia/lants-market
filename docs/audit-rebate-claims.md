# Audit: `RebateClaims` (deep internal review, 09.10.2026)

Scope: `contracts/src/RebateClaims.sol` at commit `2507628` (CEI fix in the follow-up commit;
`claim` core unchanged since). Tools: Slither 0.11.4, forge 1.8.5 (solc 0.8.17, `via_ir`), an
invariant suite, and a byte-level diff against the canonical Uniswap `merkle-distributor`.
Status: **no High/Medium finding open**. Campaign cap stays **≤ $20 until an external audit**
(D18).

## 1. Claim core vs Uniswap `merkle-distributor`

Canonical core (`MerkleDistributor.claim`) and ours, in order:

| Step | Uniswap | RebateClaims | Verdict |
|---|---|---|---|
| double-claim guard | `if (isClaimed(index)) revert AlreadyClaimed()` | `if (isClaimed(id, index)) revert AlreadyClaimed()` | same (per-campaign bitmap) |
| window | `WithDeadline`: `if (block.timestamp > endTime) revert ClaimWindowFinished()` **before** the base call | `if (block.timestamp >= c.sweepAfter) revert ClaimWindowFinished()` after the double-claim guard | **deviation 1** (strict `>=` instead of `>`; error order differs) |
| leaf | `keccak256(abi.encodePacked(index, account, amount))` | identical | same |
| proof | `MerkleProof.verify(merkleProof, merkleRoot, node)` | `MerkleProof.verify(merkleProof, c.root, node)` | same |
| funding guard | none | `if (c.claimed + amount > c.funded) revert NoFunds()` | **deviation 2** |
| state | `_setClaimed(index)` | `_setClaimed(id, index)` | same |
| accounting | none | `c.claimed += amount` | addition (guarded by deviation 2) |
| transfer | `IERC20(token).safeTransfer(account, amount)` | `USDC.safeTransfer(account, amount)` (immutable USDC) | same |
| event | `emit Claimed(index, account, amount)` | `emit Claimed(id, index, account, amount)` | same + campaign id |

Why the deviations:

1. **Strict window.** `sweepAfter` comes from `setMerkleRoot`: `finalizeTime + claimWindow`.
   With `>=`, the last claimable timestamp is `sweepAfter - 1`, so `claim` and `sweep` can never
   both succeed in the block at `sweepAfter` — the one-block claim/sweep overlap the inclusive
   canonical `>` allows. Unit test: `test_ClaimAndSweepDoNotOverlapAtBoundary`.
2. **`NoFunds`.** The canonical distributor has one campaign per contract, fully funded at
   deploy, so it needs no per-campaign funding check. In a shared contract the check keeps
   `claimed <= funded` for every campaign, which is what makes the platform invariant
   `Σ(funded - claimed) == USDC.balanceOf(this)` exact.

Nothing else in the core differs: no reordering of `_setClaimed` / `safeTransfer` / `emit`, same
sorted-pair `MerkleProof`, same leaf encoding. `RebateClaimsCross.t.sol` rebuilds the tree with an
independent Python keccak and claims every leaf on-chain.

## 2. Slither

`slither src/RebateClaims.sol` (definitions in `src/`, vendored OZ separate):

- **High: 0. Medium: 0** after the CEI fix below.
- Fixed: `reentrancy-no-eth` on `createCampaignAndFund` and `fund` — `c.funded` was written after
  `safeTransferFrom`. Both now write `funded` before the external call (revert rolls the state
  back; no behavior change, and it removes the only Mediums).
- Low (accepted): `reentrancy-events` ×5 (events emitted after `safeTransfer`, the canonical
  Uniswap order); `timestamp` ×5 (all time comparisons are the campaign lifecycle itself).
- Informational (accepted): `pragma`/`solc-version` (0.8.17 pinned to match the canonical core and
  the isolated GPL article); `naming-convention` (`USDC`).
- Vendor findings (`assembly`, low-level calls in OZ `Address`/`MerkleProof`) are upstream code,
  vendored unmodified (~4.8).

## 3. Invariant test

`contracts/test/RebateClaimsInvariant.t.sol`: a handler fuzzes `create / fund / finalize / claim /
cancel / sweep / warp` (64 runs × depth 128, sender pinned via `targetSender` so it also runs
under `--fork-url`); a deterministic `test_paths_are_reachable` pins path coverage.

- `invariant_balance_matches_campaign_accounting`:
  `Σ(funded - claimed) over campaigns == USDC.balanceOf(contract)`.
- `invariant_claimed_never_over_funded`: `claimed <= funded`, and `total <= funded` while a
  finalized campaign still holds funds.

Both pass; the suite also passes with `--fork-url https://mainnet.base.org` (29 forge tests green
including the Base-USDC fork lifecycle and two pre-existing market tests).

## 4. Manual review checklist

- **Reentrancy.** The only token is immutable Base USDC (no transfer hooks); no ETH path, no
  `receive`/`fallback`; all state writes precede external calls; the token cannot be swapped.
- **Per-campaign accounting.** `funded/claimed` never cross campaigns; `sweep` pays
  `funded - claimed` and zeroes both; `cancel` refunds `funded` and zeroes it; `setMerkleRoot`
  requires `funded >= total`; a second root/finalize is impossible.
- **Time boundaries.** `cancel: now < cancelDeadline`; `setMerkleRoot: now <= finalizeDeadline`;
  `claim: now < sweepAfter`; finalized `sweep: now >= sweepAfter`; unfinalized `sweep:
  now >= finalizeDeadline`. Sanity at create: `cancelDeadline > now`, `finalizeDeadline` in
  `(cancelDeadline, cancelDeadline + 30d]`, `claimWindow >= 7d`, non-empty pool, amount > 0.
- **2-step owner.** `transferCampaignOwnership` sets `pendingOwner`; only `pendingOwner` can
  `acceptOwnership`, which clears it; the old owner keeps rights until accept. Covered by
  `test_TransferOwnership2Step`.
- **Fee-on-transfer / blacklist.** Base USDC is neither; exact-amount accounting assumes
  `balance delta == argument`. A blacklisted sender/recipient makes `safeTransfer*` revert and the
  whole call roll back (no partial state). USDC address is fixed at construction.
- **Griefing.** Claim is permissionless but pays exactly the leaf amount to the leaf account, so
  anyone may push a buyer's claim without redirecting a cent; nobody can cancel, sweep, finalize
  or fund another owner's campaign; an unfinalized campaign can only be swept by its owner after
  the finalize deadline; the operator (deployer) has no function at all.
- **Residual trust.** The seller is the campaign owner: they can choose to publish a wrong root —
  that burns only their own funded money (buyers claim by proof; the site verifies root vs the
  published tree and hides claims on mismatch). The operator cannot move funds anywhere.

## 5. Independent review (separate session, 09.10)

A reviewer session with no author context (fresh session, no shared history) read the contract and
tests, then reported two alleged Highs and one Medium. All three were checked against the code and
refuted:

- *"claim transfers before state updates"* — false: `_setClaimed(id, index)` and
  `c.claimed += amount` both execute **before** `USDC.safeTransfer` (src/RebateClaims.sol:259-261),
  and USDC has no transfer hook.
- *"sweep can underflow `funded - claimed`"* — false: `claim` enforces
  `claimed + amount <= funded` (the deviation-2 guard), so `claimed <= funded` always holds; the
  invariant suite checks it over the full lifecycle.
- *"claim and sweep can both succeed at exactly `sweepAfter`"* — false: `claim` reverts when
  `block.timestamp >= c.sweepAfter` and `sweep` requires exactly that; the unit test
  `test_ClaimAndSweepDoNotOverlapAtBoundary` pins it. The reviewer itself noted the test documents
  the intent.

No code change resulted from the independent review.

## 6. Verdict

Suitable for the capped launch: first-party canary and third-party campaigns up to **$20 cap per
campaign** under D18. An external audit is required before any cap increase. Reproduce:

```bash
cd contracts
forge test --fork-url https://mainnet.base.org          # 29 tests
slither src/RebateClaims.sol                            # 0 High / 0 Medium
```
