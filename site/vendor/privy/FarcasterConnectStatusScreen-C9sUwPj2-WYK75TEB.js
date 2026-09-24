/*privy-bundle*/
import{a as H}from"./chunk-U6NGNNSD.js";import{a as E}from"./chunk-BXSXYG4N.js";import{a as P}from"./chunk-EJU6UCBA.js";import{a as re,b as V}from"./chunk-C3OK5TEI.js";import{a as Q}from"./chunk-ZCNJUJYK.js";import{a as q}from"./chunk-GQFZD2J7.js";import"./chunk-O7OSTT45.js";import{d as W,n as j}from"./chunk-WPBQN26L.js";import"./chunk-EMJV32HM.js";import{f as B}from"./chunk-NPUVHBVG.js";import"./chunk-ESKH2YGZ.js";import"./chunk-OX2NRATT.js";import"./chunk-UKOPVZYU.js";import"./chunk-5WCCN7MY.js";import"./chunk-EQTVCQNI.js";import"./chunk-TMJHXMEF.js";import"./chunk-FWVGY3FT.js";import"./chunk-MZOTTP67.js";import"./chunk-CBRJ357I.js";import{a as ee}from"./chunk-7DTXCCIV.js";import"./chunk-M5QYXKYT.js";import"./chunk-THQEFREN.js";import"./chunk-GUKFN3WB.js";import"./chunk-FYSSWXOT.js";import"./chunk-KA3QHR5F.js";import"./chunk-ABXKNEXP.js";import"./chunk-BFQP75CB.js";import"./chunk-G5ZETGJX.js";import"./chunk-73CBFCU5.js";import"./chunk-JPQ2YH5P.js";import"./chunk-5PBRHVUG.js";import"./chunk-76B3DWJN.js";import{h as l,l as D}from"./chunk-FWSLXBP2.js";import"./chunk-QPGPAA5V.js";import"./chunk-C23JMCTS.js";import{b as M}from"./chunk-XGBY2DL4.js";import{b as a,f as z}from"./chunk-6H727BMB.js";import{Aa as N,Qa as x,ub as U,yb as $}from"./chunk-WB6MAAQS.js";import"./chunk-RAMHAI5X.js";import"./chunk-4V423Z5T.js";import{a as G,b as Z}from"./chunk-WDIA52AP.js";import"./chunk-P7MRDD3S.js";import"./chunk-WYQAMW35.js";import"./chunk-RIZDSPQK.js";import"./chunk-36KV4IIR.js";import"./chunk-HIG42SMQ.js";import"./chunk-JTED25HN.js";import"./chunk-OISPUNON.js";import"./chunk-VOARPK66.js";import{e as C,i as I}from"./chunk-33MCIVAL.js";I();var e=C(Z(),1),s=C(G(),1),y=C(ee(),1);var Re=C(re(),1);var te=a.div`
  width: 100%;
`,ie=a.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  height: 56px;
  background: ${r=>r.$disabled?"var(--privy-color-background-2)":"var(--privy-color-background)"};
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-md);

  &:hover {
    border-color: ${r=>r.$disabled?"var(--privy-color-foreground-4)":"var(--privy-color-foreground-3)"};
  }
`,oe=a.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
`,J=a.span`
  display: block;
  font-size: 16px;
  line-height: 24px;
  color: ${r=>r.$disabled?"var(--privy-color-foreground-2)":"var(--privy-color-foreground)"};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Single-line truncation: as a flex item this would otherwise be floored at its
     min-content width, so min-width: 0 lets it shrink and the ellipsis land at the
     container edge. */
  min-width: 0;

  @media (min-width: 441px) {
    font-size: 14px;
    line-height: 20px;
  }
`,ae=a(J)`
  color: var(--privy-color-foreground-3);
  font-style: italic;
`,ne=a(P)`
  margin-bottom: 0.5rem;
`,se=a(B)`
  && {
    gap: 0.375rem;
    font-size: 14px;
    flex-shrink: 0;
  }
`,le=({value:r,title:m,placeholder:c,className:t,showCopyButton:d=!0,truncate:n,maxLength:p=40,disabled:u=!1})=>{let[h,w]=(0,s.useState)(!1),T=n&&r?((i,k,f)=>{if((i=i.startsWith("https://")?i.slice(8):i).length<=f)return i;if(k==="middle"){let b=Math.ceil(f/2)-2,A=Math.floor(f/2)-1;return`${i.slice(0,b)}...${i.slice(-A)}`}return`${i.slice(0,f-3)}...`})(r,n,p):r;return(0,s.useEffect)((()=>{if(h){let i=setTimeout((()=>w(!1)),3e3);return()=>clearTimeout(i)}}),[h]),(0,e.jsxs)(te,{className:t,children:[m&&(0,e.jsx)(ne,{children:m}),(0,e.jsxs)(ie,{$disabled:u,children:[(0,e.jsx)(oe,{children:r?(0,e.jsx)(J,{$disabled:u,title:r,children:T}):(0,e.jsx)(ae,{$disabled:u,children:c||"No value"})}),d&&r&&(0,e.jsx)(se,{onClick:function(i){i.stopPropagation(),navigator.clipboard.writeText(r).then((()=>w(!0))).catch(console.error)},size:"sm",children:(0,e.jsxs)(e.Fragment,h?{children:["Copied",(0,e.jsx)(W,{size:14})]}:{children:["Copy",(0,e.jsx)(j,{size:14})]})})]})]})},ce=({connectUri:r,loading:m,success:c,errorMessage:t,onBack:d,onClose:n,onOpenFarcaster:p})=>(0,e.jsx)(q,y.isMobile||m?y.isIOS?{title:t?t.message:"Sign in with Farcaster",subtitle:t?t.detail:"To sign in with Farcaster, please open the Farcaster app.",icon:E,iconVariant:"loading",iconLoadingStatus:{success:c,fail:!!t},primaryCta:r&&p?{label:"Open Farcaster app",onClick:p}:void 0,onBack:d,onClose:n,watermark:!0}:{title:t?t.message:"Signing in with Farcaster",subtitle:t?t.detail:"This should only take a moment",icon:E,iconVariant:"loading",iconLoadingStatus:{success:c,fail:!!t},onBack:d,onClose:n,watermark:!0,children:r&&y.isMobile&&(0,e.jsx)(de,{children:(0,e.jsx)(H,{text:"Take me to Farcaster",url:r,color:"#8a63d2"})})}:{title:"Sign in with Farcaster",subtitle:"Scan with your phone's camera to continue.",onBack:d,onClose:n,watermark:!0,children:(0,e.jsxs)(me,{children:[(0,e.jsx)(pe,{children:r?(0,e.jsx)(V,{url:r,size:275,squareLogoElement:E}):(0,e.jsx)(fe,{children:(0,e.jsx)(z,{})})}),(0,e.jsxs)(ue,{children:[(0,e.jsx)(he,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),r&&(0,e.jsx)(le,{value:r,truncate:"end",maxLength:30,showCopyButton:!0,disabled:!0})]})]})}),$e={component:()=>{let{authenticated:r,logout:m,ready:c,user:t}=$(),{lastScreen:d,navigate:n,navigateBack:p,setModalData:u}=M(),h=U(),{getAuthFlow:w,loginWithFarcaster:T,closePrivyModal:i,createAnalyticsEvent:k}=N(),[f,b]=(0,s.useState)(void 0),[A,K]=(0,s.useState)(!1),[S,X]=(0,s.useState)(!1),F=(0,s.useRef)([]),R=w(),O=R?.meta.connectUri;return(0,s.useEffect)((()=>{let g=Date.now(),_=setInterval((async()=>{let L=await R.pollForReady.execute(),Y=Date.now()-g;if(L){clearInterval(_),K(!0);try{await T(),X(!0)}catch(o){let v={retryable:!1,message:"Authentication failed"};if(o?.privyErrorCode===l.ALLOWLIST_REJECTED)return void n("AllowlistRejectionScreen");if(o?.privyErrorCode===l.USER_LIMIT_REACHED)return console.error(new D(o).toString()),void n("UserLimitReachedScreen");if(o?.privyErrorCode===l.USER_DOES_NOT_EXIST)return void n("AccountNotFoundScreen");if(o?.privyErrorCode===l.LINKED_TO_ANOTHER_USER)v.detail=o.message??"This account has already been linked to another user.";else{if(o?.privyErrorCode===l.ACCOUNT_TRANSFER_REQUIRED&&o.data?.data?.nonce)return u({accountTransfer:{nonce:o.data?.data?.nonce,account:o.data?.data?.subject,displayName:o.data?.data?.account?.displayName,linkMethod:"farcaster",embeddedWalletAddress:o.data?.data?.otherUser?.embeddedWalletAddress,farcasterEmbeddedAddress:o.data?.data?.otherUser?.farcasterEmbeddedAddress}}),void n("LinkConflictScreen");o?.privyErrorCode===l.INVALID_CREDENTIALS?(v.retryable=!0,v.detail="Something went wrong. Try again."):o?.privyErrorCode===l.TOO_MANY_REQUESTS&&(v.detail="Too many requests. Please wait before trying again.")}b(v)}}else Y>12e4&&(clearInterval(_),b({retryable:!0,message:"Authentication failed",detail:"The request timed out. Try again."}))}),2e3);return()=>{clearInterval(_),F.current.forEach((L=>clearTimeout(L)))}}),[]),(0,s.useEffect)((()=>{if(c&&r&&S&&t){if(h?.legal.requireUsersAcceptTerms&&!t.hasAcceptedTerms){let g=setTimeout((()=>{n("AffirmativeConsentScreen")}),x);return()=>clearTimeout(g)}S&&(Q(t,h.embeddedWallets)?F.current.push(setTimeout((()=>{u({createWallet:{onSuccess:()=>{},onFailure:g=>{console.error(g),k({eventName:"embedded_wallet_creation_failure_logout",payload:{error:g,screen:"FarcasterConnectStatusScreen"}}),m()},callAuthOnSuccessOnClose:!0}}),n("EmbeddedWalletOnAccountCreateScreen")}),x)):F.current.push(setTimeout((()=>i({shouldCallAuthOnSuccess:!0,isSuccess:!0})),x)))}}),[S,c,r,t]),(0,e.jsx)(ce,{connectUri:O,loading:A,success:S,errorMessage:f,onBack:d?p:void 0,onClose:i,onOpenFarcaster:()=>{O&&(window.location.href=O)}})}},de=a.div`
  margin-top: 24px;
`,me=a.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,pe=a.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,ue=a.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,he=a.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,fe=a.div`
  position: relative;
  width: 82px;
  height: 82px;
`;export{$e as FarcasterConnectStatusScreen,ce as FarcasterConnectStatusView,$e as default};
