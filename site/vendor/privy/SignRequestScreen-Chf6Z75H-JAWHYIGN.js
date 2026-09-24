/*privy-bundle*/
import{a as I,b as j}from"./chunk-IUGNDAUJ.js";import{a as z}from"./chunk-FD5ZUD5C.js";import{g as k}from"./chunk-FAUSR2QI.js";import{a as P}from"./chunk-GQFZD2J7.js";import"./chunk-O7OSTT45.js";import{F as O}from"./chunk-WPBQN26L.js";import"./chunk-EMJV32HM.js";import"./chunk-NPUVHBVG.js";import{d as x,e as C}from"./chunk-M5QYXKYT.js";import"./chunk-76B3DWJN.js";import"./chunk-FWSLXBP2.js";import"./chunk-QPGPAA5V.js";import"./chunk-C23JMCTS.js";import{b as N}from"./chunk-XGBY2DL4.js";import{b as m}from"./chunk-6H727BMB.js";import{Aa as U,Qa as A,S as f,mb as L,yb as M}from"./chunk-WB6MAAQS.js";import{b as D}from"./chunk-RAMHAI5X.js";import"./chunk-4V423Z5T.js";import{a as K,b as B}from"./chunk-WDIA52AP.js";import"./chunk-WYQAMW35.js";import"./chunk-RIZDSPQK.js";import{oa as v,v as _}from"./chunk-36KV4IIR.js";import"./chunk-HIG42SMQ.js";import"./chunk-JTED25HN.js";import"./chunk-OISPUNON.js";import"./chunk-VOARPK66.js";import{e as b,i as R}from"./chunk-33MCIVAL.js";R();var t=b(B(),1);var a=b(K(),1);var G=m.img`
  && {
    height: ${e=>e.size==="sm"?"65px":"140px"};
    width: ${e=>e.size==="sm"?"65px":"140px"};
    border-radius: 16px;
    margin-bottom: 12px;
  }
`,X=e=>{if(!_(e))return e;try{let i=v(e);return i.includes("\uFFFD")?e:i}catch{return e}},Y=e=>{try{let i=D.decode(e),o=new TextDecoder().decode(i);return o.includes("\uFFFD")?e:o}catch{return e}},Z=e=>{let{types:i,primaryType:o,...l}=e.typedData;return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(oe,{data:l}),(0,t.jsx)(z,{text:(n=e.typedData,JSON.stringify(n,null,2)),itemName:"full payload to clipboard"})," "]});var n},ee=({method:e,messageData:i,copy:o,iconUrl:l,isLoading:n,success:u,walletProxyIsLoading:g,errorMessage:h,isCancellable:c,onSign:p,onCancel:S,onClose:d})=>(0,t.jsx)(P,{title:o.title,subtitle:o.description,showClose:!0,onClose:d,icon:O,iconVariant:"subtle",helpText:h?(0,t.jsx)(ie,{children:h}):void 0,primaryCta:{label:o.buttonText,onClick:p,disabled:n||u||g,loading:n},secondaryCta:c?{label:"Not now",onClick:S,disabled:n||u||g}:void 0,watermark:!0,children:(0,t.jsxs)(k,{children:[l?(0,t.jsx)(G,{style:{alignSelf:"center"},size:"sm",src:l,alt:"app image"}):null,(0,t.jsxs)(te,{children:[e==="personal_sign"&&(0,t.jsx)(F,{children:X(i)}),e==="eth_signTypedData_v4"&&(0,t.jsx)(Z,{typedData:i}),e==="solana_signMessage"&&(0,t.jsx)(F,{children:Y(i)})]})]})}),Ee={component:()=>{let{authenticated:e}=M(),{initializeWalletProxy:i,closePrivyModal:o}=U(),{navigate:l,data:n,onUserCloseViaDialogOrKeybindRef:u}=N(),[g,h]=(0,a.useState)(!0),[c,p]=(0,a.useState)(""),[S,d]=(0,a.useState)(),[E,T]=(0,a.useState)(null),[q,w]=(0,a.useState)(!1);(0,a.useEffect)((()=>{e||l("LandingScreen")}),[e]),(0,a.useEffect)((()=>{i(L).then((r=>{h(!1),r||(p("An error has occurred, please try again."),d(new C(new x(c,f.E32603_DEFAULT_INTERNAL_ERROR.eipCode))))}))}),[]);let{method:V,data:J,confirmAndSign:Q,onSuccess:W,onFailure:$,uiOptions:s}=n.signMessage,H={title:s?.title||"Sign message",description:s?.description||"Signing this message will not cost you any fees.",buttonText:s?.buttonText||"Sign and continue"},y=r=>{r?W(r):$(S||new C(new x("The user rejected the request.",f.E4001_USER_REJECTED_REQUEST.eipCode))),o({shouldCallAuthOnSuccess:!1}),setTimeout((()=>{T(null),p(""),d(void 0)}),200)};return u.current=()=>{y(E)},(0,t.jsx)(ee,{method:V,messageData:J,copy:H,iconUrl:s?.iconUrl&&typeof s.iconUrl=="string"?s.iconUrl:void 0,isLoading:q,success:E!==null,walletProxyIsLoading:g,errorMessage:c,isCancellable:s?.isCancellable,onSign:async()=>{w(!0),p("");try{let r=await Q();T(r),w(!1),setTimeout((()=>{y(r)}),A)}catch(r){console.error(r),p("An error has occurred, please try again."),d(new C(new x(c,f.E32603_DEFAULT_INTERNAL_ERROR.eipCode))),w(!1)}},onCancel:()=>y(null),onClose:()=>y(E)})}},te=m.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
`,ie=m.p`
  && {
    margin: 0;
    width: 100%;
    text-align: center;
    color: var(--privy-color-error-dark);
    font-size: 14px;
    line-height: 22px;
  }
`,oe=m(j)`
  margin-top: 0;
`,F=m(I)`
  margin-top: 0;
`;export{Ee as SignRequestScreen,ee as SignRequestView,Ee as default};
