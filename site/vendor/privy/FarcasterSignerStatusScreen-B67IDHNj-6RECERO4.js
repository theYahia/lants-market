/*privy-bundle*/
import{a as q}from"./chunk-FD5ZUD5C.js";import{a as j}from"./chunk-U6NGNNSD.js";import{a as g}from"./chunk-BXSXYG4N.js";import{a as R,b as O}from"./chunk-C3OK5TEI.js";import{a as I}from"./chunk-GQFZD2J7.js";import"./chunk-O7OSTT45.js";import"./chunk-EMJV32HM.js";import"./chunk-NPUVHBVG.js";import"./chunk-ESKH2YGZ.js";import{a as P}from"./chunk-7DTXCCIV.js";import"./chunk-76B3DWJN.js";import"./chunk-FWSLXBP2.js";import"./chunk-QPGPAA5V.js";import"./chunk-C23JMCTS.js";import{b as F}from"./chunk-XGBY2DL4.js";import{b as i,f as T}from"./chunk-6H727BMB.js";import{Aa as b,Qa as w,ub as C}from"./chunk-WB6MAAQS.js";import"./chunk-RAMHAI5X.js";import"./chunk-4V423Z5T.js";import{a as E,b as N}from"./chunk-WDIA52AP.js";import"./chunk-WYQAMW35.js";import"./chunk-RIZDSPQK.js";import"./chunk-36KV4IIR.js";import"./chunk-HIG42SMQ.js";import"./chunk-JTED25HN.js";import"./chunk-OISPUNON.js";import"./chunk-VOARPK66.js";import{e as f,i as S}from"./chunk-33MCIVAL.js";S();var e=f(N(),1),a=f(E(),1),m=f(P(),1);var ie=f(R(),1);var B="#8a63d2",V=({appName:p,loading:h,success:d,errorMessage:t,connectUri:r,onBack:o,onClose:n,onOpenFarcaster:s})=>(0,e.jsx)(I,m.isMobile||h?m.isIOS?{title:t?t.message:"Add a signer to Farcaster",subtitle:t?t.detail:`This will allow ${p} to add casts, likes, follows, and more on your behalf.`,icon:g,iconVariant:"loading",iconLoadingStatus:{success:d,fail:!!t},primaryCta:r&&s?{label:"Open Farcaster app",onClick:s}:void 0,onBack:o,onClose:n,watermark:!0}:{title:t?t.message:"Requesting signer from Farcaster",subtitle:t?t.detail:"This should only take a moment",icon:g,iconVariant:"loading",iconLoadingStatus:{success:d,fail:!!t},onBack:o,onClose:n,watermark:!0,children:r&&m.isMobile&&(0,e.jsx)(z,{children:(0,e.jsx)(j,{text:"Take me to Farcaster",url:r,color:B})})}:{title:"Add a signer to Farcaster",subtitle:`This will allow ${p} to add casts, likes, follows, and more on your behalf.`,onBack:o,onClose:n,watermark:!0,children:(0,e.jsxs)(D,{children:[(0,e.jsx)(Q,{children:r?(0,e.jsx)(O,{url:r,size:275,squareLogoElement:g}):(0,e.jsx)(G,{children:(0,e.jsx)(T,{})})}),(0,e.jsxs)(U,{children:[(0,e.jsx)($,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),r&&(0,e.jsx)(q,{text:r,itemName:"link",color:B})]})]})}),z=i.div`
  margin-top: 24px;
`,D=i.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,Q=i.div`
  padding: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,U=i.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,$=i.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,G=i.div`
  position: relative;
  width: 82px;
  height: 82px;
`,le={component:()=>{let{lastScreen:p,navigateBack:h,data:d}=F(),t=C(),{requestFarcasterSignerStatus:r,closePrivyModal:o}=b(),[n,s]=(0,a.useState)(void 0),[_,k]=(0,a.useState)(!1),[A,x]=(0,a.useState)(!1),v=(0,a.useRef)([]),c=d?.farcasterSigner;(0,a.useEffect)((()=>{let L=Date.now(),l=setInterval((async()=>{if(!c?.public_key)return clearInterval(l),void s({retryable:!0,message:"Connect failed",detail:"Something went wrong. Please try again."});c.status==="approved"&&(clearInterval(l),k(!1),x(!0),v.current.push(setTimeout((()=>o({shouldCallAuthOnSuccess:!1,isSuccess:!0})),w)));let u=await r(c?.public_key),M=Date.now()-L;u.status==="approved"?(clearInterval(l),k(!1),x(!0),v.current.push(setTimeout((()=>o({shouldCallAuthOnSuccess:!1,isSuccess:!0})),w))):M>3e5?(clearInterval(l),s({retryable:!0,message:"Connect failed",detail:"The request timed out. Try again."})):u.status==="revoked"&&(clearInterval(l),s({retryable:!0,message:"Request rejected",detail:"The request was rejected. Please try again."}))}),2e3);return()=>{clearInterval(l),v.current.forEach((u=>clearTimeout(u)))}}),[]);let y=c?.status==="pending_approval"?c.signer_approval_url:void 0;return(0,e.jsx)(V,{appName:t.name,loading:_,success:A,errorMessage:n,connectUri:y,onBack:p?h:void 0,onClose:o,onOpenFarcaster:()=>{y&&(window.location.href=y)}})}};export{le as FarcasterSignerStatusScreen,V as FarcasterSignerStatusView,le as default};
