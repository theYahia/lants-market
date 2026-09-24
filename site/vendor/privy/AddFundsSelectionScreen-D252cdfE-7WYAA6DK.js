/*privy-bundle*/
import{a as w,b as T,c as Y}from"./chunk-6ZJTLA3Z.js";import{a as D,b as S}from"./chunk-QOL35FIM.js";import{a as g,e as a,g as n}from"./chunk-BHAT24XW.js";import{d as R}from"./chunk-CQETUWJK.js";import"./chunk-GQFZD2J7.js";import"./chunk-O7OSTT45.js";import{L as O,o as F,w as G}from"./chunk-WPBQN26L.js";import{a as _}from"./chunk-EMJV32HM.js";import"./chunk-NPUVHBVG.js";import{n as L,o as E}from"./chunk-KA3QHR5F.js";import"./chunk-ABXKNEXP.js";import"./chunk-BFQP75CB.js";import"./chunk-G5ZETGJX.js";import"./chunk-73CBFCU5.js";import"./chunk-JPQ2YH5P.js";import"./chunk-5PBRHVUG.js";import"./chunk-76B3DWJN.js";import"./chunk-FWSLXBP2.js";import"./chunk-QPGPAA5V.js";import"./chunk-C23JMCTS.js";import{b as x}from"./chunk-XGBY2DL4.js";import{b as l}from"./chunk-6H727BMB.js";import{ub as k}from"./chunk-WB6MAAQS.js";import"./chunk-RAMHAI5X.js";import"./chunk-4V423Z5T.js";import{a as B,b as K}from"./chunk-WDIA52AP.js";import"./chunk-WYQAMW35.js";import"./chunk-RIZDSPQK.js";import"./chunk-36KV4IIR.js";import"./chunk-HIG42SMQ.js";import"./chunk-JTED25HN.js";import"./chunk-OISPUNON.js";import"./chunk-VOARPK66.js";import{e as A,i as b}from"./chunk-33MCIVAL.js";b();var r=A(K(),1);var e=A(B(),1);var or={component:()=>{let t=L(),{onUserCloseViaDialogOrKeybindRef:p}=x(),j=k(),i=(0,e.useRef)(!1),d=w(T),P=w(Y),[I,z]=(0,e.useState)(!1),h=d?"APPLE_PAY":d===!1&&P?"GOOGLE_PAY":null,f=d===!0||d===!1&&P!==void 0,y=!t?.startFiat||f||I;(0,e.useEffect)((()=>{let C=window.setTimeout((()=>z(!0)),2e3);return()=>window.clearTimeout(C)}),[]),(0,e.useEffect)((()=>{t&&(i.current=!1)}),[t]);let v=(0,e.useRef)(null);(0,e.useEffect)((()=>{t&&!t.error&&y&&v.current!==t&&(v.current=t,t.recordRowsViewed?.({walletPay:t.startFiat?h:void 0,walletPayTimedOut:t.startFiat?!f:void 0}))}),[y,t,h,f]);let o=(0,e.useCallback)((async()=>{!i.current&&t&&(i.current=!0,E(),await t.onCancel())}),[t]);if((0,e.useEffect)((()=>(p.current=o,()=>{p.current===o&&(p.current=null)})),[o,p]),!t)return null;if(t.error)return(0,r.jsx)(g,{title:"Unable to add funds",subtitle:t.error,showClose:!0,onClose:o,primaryCta:{label:"Close",onClick:o}});let u=async C=>{i.current||(i.current=!0,await t.startFiat?.(C))};return(0,r.jsx)(g,{title:"Pay with",subtitle:"Debit cards typically have higher success rates than credit cards, even with Apple Pay or Google Pay.",showClose:!0,onClose:o,children:y?(0,r.jsxs)(R,{style:{marginTop:"1rem"},$colorScheme:j.appearance.palette.colorScheme,children:[t.startFiat&&(0,r.jsxs)(n,{onClick:()=>u("CREDIT_DEBIT_CARD"),children:[(0,r.jsx)(s,{children:(0,r.jsx)(F,{})}),(0,r.jsxs)(c,{children:[(0,r.jsx)(a,{children:"Debit or credit card"}),(0,r.jsx)(m,{children:"Less than 10 minutes"})]})]}),t.startFiat&&h==="APPLE_PAY"&&(0,r.jsxs)(n,{onClick:()=>u("APPLE_PAY"),children:[(0,r.jsx)(s,{children:(0,r.jsx)(D,{width:18,height:18})}),(0,r.jsxs)(c,{children:[(0,r.jsx)(a,{children:"Apple Pay"}),(0,r.jsx)(m,{children:"Less than 10 minutes"})]})]}),t.startFiat&&h==="GOOGLE_PAY"&&(0,r.jsxs)(n,{onClick:()=>u("GOOGLE_PAY"),children:[(0,r.jsx)(s,{children:(0,r.jsx)(S,{width:18,height:18})}),(0,r.jsxs)(c,{children:[(0,r.jsx)(a,{children:"Google Pay"}),(0,r.jsx)(m,{children:"Less than 10 minutes"})]})]}),t.startFiat&&(0,r.jsxs)(n,{onClick:()=>u("BANK"),children:[(0,r.jsx)(s,{children:(0,r.jsx)(G,{})}),(0,r.jsxs)(c,{children:[(0,r.jsx)(a,{children:"Bank account"}),(0,r.jsx)(m,{children:"1\u20132 days"})]})]}),t.startCrypto&&(0,r.jsxs)(n,{onClick:async()=>{i.current||(i.current=!0,await t.startCrypto?.())},children:[(0,r.jsx)(s,{children:(0,r.jsx)(O,{})}),(0,r.jsxs)(c,{children:[(0,r.jsx)(a,{children:"Crypto wallet or exchange"}),(0,r.jsx)(m,{children:"Instant"})]})]})]}):(0,r.jsx)(N,{children:(0,r.jsx)(_,{size:"50px"})})})}},N=l.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 1rem;
  min-height: 8rem;
`,s=l.span`
  width: 2rem;
  height: 2rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-2);
  color: var(--privy-color-icon-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`,c=l.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,m=l.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--privy-color-foreground-3);
`;export{or as AddFundsSelectionScreen,or as default};
