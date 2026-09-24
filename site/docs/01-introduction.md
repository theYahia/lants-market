# Introduction

The lANTS marketplace is a contract for listing and selling lANTS positions
on Base (chainId 8453). Positions are ERC-721 tokens issued by the
AntseedSellerPools collection. Payment is settled in USDC.

This site documents the deployed contracts as they are, including their
current limits. It does not describe planned features as if they existed.

## Contracts

| Component | Address |
|---|---|
| Marketplace (`VexyMarketplace`) | `0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660` |
| Position collection (`AntseedSellerPools`) | `0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652` |
| USDC (6 decimals) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| ANTS token | `0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263` |
| Emissions (`emissionsGate`) | `0xE60a31E6CD2F8455503cA0B3f6545Dd3DDF543BD` |
| Operator / fee recipient | `0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B` |

ENS name: `lants.eth`.

## What you can do today

- List an lANTS position you own for a USDC price.
- Buy a listed position; the token transfers directly from seller to buyer.
- Cancel your own listings at any time, for free.

A 1% fee is taken from each sale and sent to the fee recipient.

## What does not exist yet

- **Offers.** There is no offer contract for this market. The storefront
  shows a "coming soon" label. Do not expect offer functionality.
- **Listings.** The market is empty at the time of writing
  (`listingsLength() = 0`). No position has been listed yet.

## How this site reads the chain

The storefront works from a snapshot taken at a fixed block, not from a
live read of the whole network. Every data table is labelled with its
snapshot block and epoch (for example: block 51613321, epoch 23). Values
you see reflect that block, not the current head.

## Origin

The marketplace contract is adapted from Vexy by @0xValde. The source is
marked `UNLICENSED`. The credit is stated here and in Privacy & Terms,
openly and without hiding it.

## Who runs this

The project is built by one person with help from AntSeed network models.
There is no company and no team page.