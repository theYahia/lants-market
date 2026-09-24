/*privy-bundle*/
import{a as v}from"./chunk-M5QYXKYT.js";import{c as s}from"./chunk-G5ZETGJX.js";import{a as c}from"./chunk-5PBRHVUG.js";import{o as x,v as i}from"./chunk-76B3DWJN.js";import{a as w,b as l}from"./chunk-6H727BMB.js";import{Aa as m,ub as y,xb as d}from"./chunk-WB6MAAQS.js";import{a as z,b as I}from"./chunk-WDIA52AP.js";import{pa as h}from"./chunk-36KV4IIR.js";import{e as f,i as g}from"./chunk-33MCIVAL.js";g();var r=f(z(),1);var k=f(I(),1);var L=e=>{let[t,o]=(0,r.useState)("auto");return(0,r.useEffect)((()=>{let n=new ResizeObserver((a=>{o(a[0]?.contentRect.height??"auto")}));return e.current&&n.observe(e.current),()=>{e.current&&n.unobserve(e.current)}}),[e.current]),t},q=l.div`
  text-align: left;
  flex-grow: 1;
`,B=l.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  flex-grow: 1;
`,W=l.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  /* for Internet Explorer, Edge */
  -ms-overflow-style: none;

  /* for Firefox */
  scrollbar-width: none;

  /* for Chrome, Safari, and Opera */
  &::-webkit-scrollbar {
    display: none;
  }
`,J=l(W)`
  ${e=>e.$colorScheme==="light"?"background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0.06)) bottom;":e.$colorScheme==="dark"?"background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.06)) bottom;":void 0}

  background-repeat: no-repeat;
  background-size:
    100% 32px,
    100% 16px;
  background-attachment: local, scroll;
  max-height: 400px;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 3px;
`,$=w`
  && {
    width: 100%;
    font-size: 16px;
    line-height: 24px;
    min-height: 56px;

    /* Tablet and Up */
    @media (min-width: 440px) {
      font-size: 14px;
    }

    display: flex;
    gap: 12px;
    align-items: center;
    color: var(--privy-color-foreground);

    padding: 10px 12px;
    border: 1px solid var(--privy-color-foreground-4) !important;
    border-radius: var(--privy-border-radius-md);
    transition: background-color 200ms ease;

    cursor: pointer;

    &:hover {
      background-color: var(--privy-color-background-2);
    }

    &:disabled {
      cursor: pointer;
      background-color: var(--privy-color-background-2);
    }
  }
`,K=l.div`
  text-align: center;
  font-size: 14px;
  margin-bottom: 24px;
`,Q=l.button.attrs({className:"login-method-button"})`
  ${$}
`;l.a`
  ${$}
`;var V=l.div`
  width: 32px;
  height: 32px;
  border-radius: ${e=>e.$fullSize?"0":"4px"};
  background: ${e=>e.$fullSize?"transparent":"var(--privy-color-background-2)"};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: ${e=>e.$fullSize?"32px":"18px"};
    height: ${e=>e.$fullSize?"32px":"18px"};
    color: ${e=>e.$fullSize?"inherit":"var(--privy-color-icon-muted)"};
  }
`,X=l.div`
  width: 100%;
  height: 100%;
  min-height: inherit;
  display: flex;
  flex-direction: column;
  ${e=>e.$if?"display: none;":""}
`,Y=l.div`
  width: 100%;
  height: 100%;
  padding: ${e=>e.$withPadding?"64px 0px":"0px"};
`,Z=l.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  gap: 12px;
  & h3 {
    font-size: 18px;
    font-style: normal;
    font-weight: 600;
    line-height: 24px;
  }
  & p {
    max-width: 300px;
    font-size: 14px;
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }
`;async function ee(e,t,o){if(!t.shouldEnforceDefaultChainOnConnect)return;let n=Number(e.chainId.replace("eip155:",""));if(!t.chains.find((a=>a.id===n))&&(e.connectorType!=="wallet_connect_v2"||e.walletClientType!=="metamask")){o?.();try{await e.switchChain(t.defaultChain.id),e.chainId=x(h(t.defaultChain.id))}catch{v.warn("Unable to switch to default chain after connect",{chainId:t.defaultChain.id})}}}var S=(0,r.createContext)({}),te=({children:e})=>{let t=y(),[o,n]=(0,r.useState)({});return s("login",{onComplete:({loginAccount:a})=>{a&&a.type!=="passkey"&&a.type!=="cross_app"&&(a.type!=="wallet"||a.walletClientType!=="privy")&&(i.put(b(t.id),a.type),a.type==="wallet"?(i.put(p(t.id),a.walletClientType),i.put(u(t.id),a.chainType),n({accountType:a.type,walletClientType:a.walletClientType,chainType:a.chainType})):(i.del(p(t.id)),i.del(u(t.id)),n({accountType:a.type})))}}),(0,r.useEffect)((()=>{if(!t.id)return;let a=i.get(b(t.id)),C=i.get(p(t.id)),T=i.get(u(t.id));a&&n(a==="wallet"?{accountType:a,walletClientType:C,chainType:T}:{accountType:a})}),[t.id]),(0,k.jsx)(S.Provider,{value:o,children:e})},b=e=>`privy:${e}:recent-login-method`,p=e=>`privy:${e}:recent-login-wallet-client`,u=e=>`privy:${e}:recent-login-chain-type`,ae=()=>(0,r.useContext)(S),re=e=>{s("fundWallet",e);let{fundWallet:t}=m();return{fundWallet:({address:o,options:n})=>t(o,n)}};function ne(e){let{logout:t}=(0,r.useContext)(d);return s("logout",e),{logout:t}}function le(e){let{connectWallet:t}=(0,r.useContext)(d);return s("connectWallet",e),{connectWallet:t}}var j=c((()=>({isModalOpen:!1,resolvers:null}))),oe=c((()=>({})));var ie=({address:e,client:t,appId:o})=>{let n=`${t}:${e}`;o&&i.put(O(o),n),j.setState({wallet:n})};var O=e=>`privy:${e}:active-wallet-connection`;export{L as a,q as b,B as c,W as d,J as e,K as f,Q as g,V as h,X as i,Y as j,Z as k,ee as l,te as m,ae as n,re as o,ne as p,le as q,ie as r};
