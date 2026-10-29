// Shared createListing wallet flow for the Portfolio form and the + Sell modal:
// owner check, marketplace approval, then the createListing transaction.
// Callers own input validation, status display and the post-success refresh.
import {
  MARKET,
  SEL,
  encUint,
  encAddr,
  decodeWords,
  wordToBigInt,
  wordToAddr,
  encCreateListing,
  encSetApprovalForAll,
} from './market-config.mjs';
import { ethCallTo } from './own-listings.mjs';

export async function createListingFlow({
  request,
  ensureChain,
  waitReceipt,
  nftId,
  priceWei,
  durationSecs,
  onStatus = () => {},
}) {
  const accounts = await request({ method: 'eth_requestAccounts' });
  const from = accounts && accounts[0];
  if (!from) throw new Error('No account');
  if (!(await ensureChain())) throw new Error('Wrong network');

  onStatus('Checking ownership...');
  const owner = wordToAddr(decodeWords(await ethCallTo(MARKET.nft, SEL.ownerOf + encUint(nftId)))[0]);
  if (String(owner).toLowerCase() !== String(from).toLowerCase()) {
    throw new Error('You do not own this NFT');
  }

  onStatus('Checking marketplace approval...');
  const approvedRaw = await ethCallTo(MARKET.nft, SEL.isApprovedForAll + encAddr(from) + encAddr(MARKET.market));
  if (wordToBigInt(decodeWords(approvedRaw)[0]) === 0n) {
    onStatus('Approving the marketplace...');
    const approveTx = await request({
      method: 'eth_sendTransaction',
      params: [{ from, to: MARKET.nft, data: encSetApprovalForAll(MARKET.market, true) }],
    });
    onStatus('Approval sent, waiting for confirmation...');
    const approveRcpt = await waitReceipt(approveTx);
    if (!approveRcpt || approveRcpt.status !== '0x1') throw new Error('Approval failed');
  }

  onStatus('Creating the listing...');
  const data = encCreateListing({
    nftCollection: MARKET.nft,
    nftId,
    currency: MARKET.usdc,
    price: priceWei,
    slopeMax: 0n,
    slopeDuration: 0n,
    fixedDuration: BigInt(durationSecs),
  });
  const tx = await request({
    method: 'eth_sendTransaction',
    params: [{ from, to: MARKET.market, data }],
  });
  onStatus('Sent: ' + tx + ' - waiting for confirmation...');
  const rcpt = await waitReceipt(tx);
  if (!rcpt || rcpt.status !== '0x1') throw new Error('Listing failed');
  return rcpt;
}
