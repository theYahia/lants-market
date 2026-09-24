/*privy-bundle*/
import{i as o}from"./chunk-33MCIVAL.js";o();var i=({address:n,nonce:a})=>`${window.location.host} wants you to sign in with your Solana account:
${n}

${`You are proving you own ${n}.`}

URI: ${window.location.origin}
Version: 1
Chain ID: mainnet
Nonce: ${a}
Issued At: ${new Date().toISOString()}
Resources:
- https://privy.io`;var r=Symbol("solana-funding-plugin"),t=Symbol("solana-ledger-plugin");export{i as a,r as b,t as c};
