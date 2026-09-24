/*privy-bundle*/
import{a as k,b as u,d as f}from"./chunk-KT6GCH3J.js";import{c as g}from"./chunk-GT23TQ2M.js";import{a as w}from"./chunk-QPBREQ75.js";import{f as v}from"./chunk-FAUSR2QI.js";import{b as n}from"./chunk-6H727BMB.js";import{kb as p,ub as b}from"./chunk-WB6MAAQS.js";import{a as A,b as F}from"./chunk-WDIA52AP.js";import{e as m,i as y}from"./chunk-33MCIVAL.js";y();var e=m(F(),1);var d=m(A(),1);var x=({label:i,children:r,valueStyles:t})=>(0,e.jsxs)(z,{children:[(0,e.jsx)("div",{children:i}),(0,e.jsx)(C,{style:{...t},children:r})]}),z=n.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  > :first-child {
    color: var(--privy-color-foreground-3);
    text-align: left;
  }

  > :last-child {
    color: var(--privy-color-foreground-2);
    text-align: right;
  }
`,C=n.div`
  font-size: 14px;
  line-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-2);
  padding: 4px 8px;
`,Q=({gas:i,tokenPrice:r,tokenSymbol:t})=>(0,e.jsxs)(v,{style:{paddingBottom:"12px"},children:[(0,e.jsxs)(P,{children:[(0,e.jsx)(I,{children:"Est. Fees"}),(0,e.jsx)("div",{children:(0,e.jsx)(u,{weiQuantities:[BigInt(i)],tokenPrice:r,tokenSymbol:t})})]}),r&&(0,e.jsx)(S,{children:`${g(BigInt(i),t)}`})]}),V=({value:i,gas:r,tokenPrice:t,tokenSymbol:o})=>{let l=BigInt(i??0)+BigInt(r);return(0,e.jsxs)(v,{children:[(0,e.jsxs)(P,{children:[(0,e.jsx)(I,{children:"Total (including fees)"}),(0,e.jsx)("div",{children:(0,e.jsx)(u,{weiQuantities:[BigInt(i||0),BigInt(r)],tokenPrice:t,tokenSymbol:o})})]}),t&&(0,e.jsx)(S,{children:g(l,o)})]})},P=n.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
`,S=n.div`
  display: flex;
  flex-direction: row;
  height: 12px;

  font-size: 12px;
  line-height: 12px;
  color: var(--privy-color-foreground-3);
  font-weight: 400;
`,I=n.div`
  font-size: 14px;
  line-height: 22.4px;
  font-weight: 400;
`,a=(0,d.createContext)(void 0),c=(0,d.createContext)(void 0),W=({defaultValue:i,children:r})=>{let[t,o]=(0,d.useState)(i||null);return(0,e.jsx)(a.Provider,{value:{activePanel:t,togglePanel:l=>{o(t===l?null:l)}},children:(0,e.jsx)(L,{children:r})})},$=({value:i,children:r})=>{let{activePanel:t,togglePanel:o}=(0,d.useContext)(a),l=t===i;return(0,e.jsx)(c.Provider,{value:{onToggle:()=>o(i),value:i},children:(0,e.jsx)(J,{isActive:l?"true":"false","data-open":String(l),children:r})})},D=({children:i})=>{let{activePanel:r}=(0,d.useContext)(a),{onToggle:t,value:o}=(0,d.useContext)(c),l=r===o;return(0,e.jsxs)(e.Fragment,{children:[(0,e.jsxs)(U,{onClick:t,"data-open":String(l),children:[(0,e.jsx)(G,{children:i}),(0,e.jsx)(M,{isactive:l?"true":"false",children:(0,e.jsx)(w,{height:"16px",width:"16px",strokeWidth:"2"})})]}),(0,e.jsx)(q,{})]})},E=({children:i})=>{let{activePanel:r}=(0,d.useContext)(a),{value:t}=(0,d.useContext)(c);return(0,e.jsx)(K,{"data-open":String(r===t),children:(0,e.jsx)(B,{children:i})})},H=({children:i})=>{let{activePanel:r}=(0,d.useContext)(a),{value:t}=(0,d.useContext)(c);return(0,e.jsx)(B,{children:typeof i=="function"?i({isActive:r===t}):i})},L=n.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 8px;
`,U=n.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  cursor: pointer;
  padding-bottom: 8px;
`,q=n.div`
  width: 100%;

  && {
    border-top: 1px solid;
    border-color: var(--privy-color-foreground-4);
  }
  padding-bottom: 12px;
`,G=n.div`
  font-size: 14px;
  font-weight: 500;
  line-height: 19.6px;
  width: 100%;
  padding-right: 8px;
`,J=n.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
  padding: 12px;

  && {
    border: 1px solid;
    border-color: var(--privy-color-foreground-4);
    border-radius: var(--privy-border-radius-md);
  }
`,K=n.div`
  position: relative;
  overflow: hidden;
  transition: max-height 25ms ease-out;

  &[data-open='true'] {
    max-height: 700px;
  }

  &[data-open='false'] {
    max-height: 0;
  }
`,B=n.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 1px;
`,M=n.div`
  transform: ${i=>i.isactive==="true"?"rotate(180deg)":"rotate(0deg)"};
`,re=({from:i,to:r,txn:t,transactionInfo:o,tokenPrice:l,gas:s,tokenSymbol:h})=>{let j=BigInt(t?.value||0);return(0,e.jsx)(W,{...b().render.standalone?{defaultValue:"details"}:{},children:(0,e.jsxs)($,{value:"details",children:[(0,e.jsx)(D,{children:(0,e.jsxs)(N,{children:[(0,e.jsx)("div",{children:o?.title||"Details"}),(0,e.jsx)(O,{children:(0,e.jsx)(k,{weiQuantities:[j],tokenPrice:l,tokenSymbol:h})})]})}),(0,e.jsxs)(E,{children:[(0,e.jsx)(x,{label:"From",children:(0,e.jsx)(f,{walletAddress:i,chainId:t.chainId||p,chainType:"ethereum"})}),(0,e.jsx)(x,{label:"To",children:(0,e.jsx)(f,{walletAddress:r,chainId:t.chainId||p,chainType:"ethereum"})}),o&&o.action&&(0,e.jsx)(x,{label:"Action",children:o.action}),s&&(0,e.jsx)(Q,{value:t.value,gas:s,tokenPrice:l,tokenSymbol:h})]}),(0,e.jsx)(H,{children:({isActive:T})=>(0,e.jsx)(V,{value:t.value,displayFee:T,gas:s||"0x0",tokenPrice:l,tokenSymbol:h})})]})})},N=n.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`,O=n.div`
  flex-shrink: 0;
  padding-left: 8px;
`;export{re as a};
