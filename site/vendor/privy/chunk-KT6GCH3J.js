/*privy-bundle*/
import{a as x}from"./chunk-CVYBCCWH.js";import{h as u}from"./chunk-UR5MEJIV.js";import{b as l,c,e as d,f as g}from"./chunk-GT23TQ2M.js";import{g as f}from"./chunk-76B3DWJN.js";import{b as s}from"./chunk-6H727BMB.js";import{b as w}from"./chunk-WDIA52AP.js";import{Eb as h}from"./chunk-WYQAMW35.js";import{e as b,i as p}from"./chunk-33MCIVAL.js";p();var e=b(w(),1);var F=({weiQuantities:r,tokenPrice:n,tokenSymbol:o})=>{let i=d(r),t=n?l(i,n):void 0,a=c(i,o);return(0,e.jsx)(m,{children:t||a})},H=({weiQuantities:r,tokenPrice:n,tokenSymbol:o})=>{let i=d(r),t=n?l(i,n):void 0,a=c(i,o);return(0,e.jsx)(m,{children:t?(0,e.jsxs)(e.Fragment,{children:[(0,e.jsx)(P,{children:"USD"}),t==="<$0.01"?(0,e.jsxs)(y,{children:[(0,e.jsx)(k,{children:"<"}),"$0.01"]}):t]}):a})},T=({quantities:r,tokenPrice:n,tokenSymbol:o="SOL",tokenDecimals:i=9})=>{let t=r.reduce((($,v)=>$+v),0n),a=n&&o==="SOL"&&i===9?u(t,n):void 0,S=o==="SOL"&&i===9?x(t):`${h(t,i)} ${o}`;return(0,e.jsx)(m,{children:a?(0,e.jsx)(e.Fragment,{children:a==="<$0.01"?(0,e.jsxs)(y,{children:[(0,e.jsx)(k,{children:"<"}),"$0.01"]}):a}):S})},m=s.span`
  font-size: 14px;
  line-height: 140%;
  display: flex;
  gap: 4px;
  align-items: center;
`,P=s.span`
  font-size: 12px;
  line-height: 12px;
  color: var(--privy-color-foreground-3);
`,k=s.span`
  font-size: 10px;
`,y=s.span`
  display: flex;
  align-items: center;
`;function z(r,n){return`https://explorer.solana.com/account/${r}?chain=${n}`}var W=r=>(0,e.jsx)(A,{href:r.chainType==="ethereum"?g(r.chainId,r.walletAddress):z(r.walletAddress,r.chainId),target:"_blank",children:f(r.walletAddress)}),A=s.a`
  &:hover {
    text-decoration: underline;
  }
`;export{F as a,H as b,T as c,W as d};
