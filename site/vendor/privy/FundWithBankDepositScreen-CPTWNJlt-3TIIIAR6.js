/*privy-bundle*/
import{a as z,b as V,c as Y}from"./chunk-2MUYURNY.js";import{a as $}from"./chunk-2CTIRGQQ.js";import"./chunk-BMAKZHTA.js";import{b as P}from"./chunk-UQINRMAW.js";import{a as g}from"./chunk-GQFZD2J7.js";import"./chunk-O7OSTT45.js";import{J as F,d as W,l as U,u as D}from"./chunk-WPBQN26L.js";import"./chunk-EMJV32HM.js";import"./chunk-NPUVHBVG.js";import{a as Z}from"./chunk-7DTXCCIV.js";import{c as I}from"./chunk-KA3QHR5F.js";import{a as L}from"./chunk-ABXKNEXP.js";import"./chunk-BFQP75CB.js";import"./chunk-G5ZETGJX.js";import"./chunk-73CBFCU5.js";import"./chunk-JPQ2YH5P.js";import"./chunk-5PBRHVUG.js";import"./chunk-76B3DWJN.js";import"./chunk-FWSLXBP2.js";import"./chunk-QPGPAA5V.js";import"./chunk-C23JMCTS.js";import{b as _}from"./chunk-XGBY2DL4.js";import{b}from"./chunk-6H727BMB.js";import{ra as B,yb as j}from"./chunk-WB6MAAQS.js";import"./chunk-RAMHAI5X.js";import"./chunk-4V423Z5T.js";import{a as J,b as Q}from"./chunk-WDIA52AP.js";import"./chunk-WYQAMW35.js";import"./chunk-RIZDSPQK.js";import"./chunk-36KV4IIR.js";import"./chunk-HIG42SMQ.js";import"./chunk-JTED25HN.js";import"./chunk-OISPUNON.js";import"./chunk-VOARPK66.js";import{e as S,i as T}from"./chunk-33MCIVAL.js";T();var t=S(Q(),1),m=S(J(),1);var M=S(Z(),1);var ee=e=>{try{return e.location.origin}catch{return}},te=({data:e,onClose:a})=>(0,t.jsx)(g,{showClose:!0,onClose:a,title:"Initiate bank transfer",subtitle:"Use the details below to complete a bank transfer from your bank.",primaryCta:{label:"Done",onClick:a},watermark:!1,footerText:"Exchange rates and fees are set when you authorize and determine the amount you receive. You'll see the applicable rates and fees for your transaction separately",children:(0,t.jsx)(re,{children:(I[e.deposit_instructions.asset]||[]).map((([l,y],h)=>{let f=e.deposit_instructions[l];if(!f||Array.isArray(f))return null;let d=l==="asset"?f.toUpperCase():f,n=d.length>100?`${d.slice(0,9)}...${d.slice(-9)}`:d;return(0,t.jsxs)(oe,{children:[(0,t.jsx)(se,{children:y}),(0,t.jsx)(P,{value:d,includeChildren:M.isMobile,children:(0,t.jsx)(ae,{children:n})})]},h)}))})}),re=b.ol`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;
  flex-direction: column;

  && {
    padding: 0 1rem;
  }
`,oe=b.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;

  &:not(:first-of-type) {
    border-top: 1px solid var(--privy-color-border-default);
  }

  & > {
    :nth-child(1) {
      flex-basis: 30%;
    }

    :nth-child(2) {
      flex-basis: 60%;
    }
  }
`,se=b.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-variant-numeric: lining-nums proportional-nums;
  font-feature-settings: 'calt' off;

  /* text-xs/font-regular */
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.125rem; /* 150% */

  text-align: left;
  flex-shrink: 0;
`,ae=b.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;

  /* text-sm/font-medium */
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem; /* 157.143% */

  text-align: right;
  word-break: break-all;
`,ie=({onClose:e})=>(0,t.jsx)(g,{showClose:!0,onClose:e,icon:U,iconVariant:"error",title:"Something went wrong",subtitle:"We couldn't complete account setup. This isn't caused by anything you did.",primaryCta:{label:"Close",onClick:e},watermark:!0}),ne=({onClose:e,reason:a})=>{let l=a?a.charAt(0).toLowerCase()+a.slice(1):void 0;return(0,t.jsx)(g,{showClose:!0,onClose:e,icon:U,iconVariant:"error",title:"Identity verification failed",subtitle:l?`We can't complete identity verification because ${l}. Please try again or contact support for assistance.`:"We couldn't verify your identity. Please try again or contact support for assistance.",primaryCta:{label:"Close",onClick:e},watermark:!0})},le=({onClose:e,email:a})=>(0,t.jsx)(g,{showClose:!0,onClose:e,icon:D,title:"Identity verification in progress",subtitle:"We're waiting for Persona to approve your identity verification. This usually takes a few minutes, but may take up to 24 hours.",primaryCta:{label:"Done",onClick:e},watermark:!0,children:(0,t.jsxs)($,{theme:"light",children:["You'll receive an email at ",a," once approved with instructions for completing your deposit."]})}),ce=({onClose:e,onAcceptTerms:a,isLoading:l})=>(0,t.jsx)(g,{showClose:!0,onClose:e,icon:F,title:"Verify your identity to continue",subtitle:"Finish verification with Persona \u2014 it takes just a few minutes and requires a government ID.",helpText:(0,t.jsxs)(t.Fragment,{children:[`This app uses Bridge to securely connect accounts and move funds. By clicking "Accept," you agree to Bridge's`," ",(0,t.jsx)("a",{href:"https://www.bridge.xyz/legal",target:"_blank",rel:"noopener noreferrer",children:"Terms of Service"})," ","and"," ",(0,t.jsx)("a",{href:"https://www.bridge.xyz/legal/row-privacy-policy/bridge-building-limited",target:"_blank",rel:"noopener noreferrer",children:"Privacy Policy"}),"."]}),primaryCta:{label:"Accept and continue",onClick:a,loading:l},watermark:!0}),ue=({onClose:e})=>(0,t.jsx)(g,{showClose:!0,onClose:e,icon:W,iconVariant:"success",title:"Identity verified successfully",subtitle:"We've successfully verified your identity. Now initiate a bank transfer to view instructions.",primaryCta:{label:"Initiate bank transfer",onClick:()=>{},loading:!0},watermark:!0}),de=({opts:e,onClose:a,onBack:l,onEditSourceAsset:y,onSelectAmount:h,isLoading:f})=>(0,t.jsxs)(g,{showClose:!0,onClose:a,showBack:!!l,onBack:l,headerTitle:`Buy ${e.destination.asset.toLocaleUpperCase()}`,primaryCta:{label:"Continue",onClick:h,loading:f},watermark:!0,children:[(0,t.jsx)(z,{currency:e.source.selectedAsset,inputMode:"decimal",autoFocus:!0}),(0,t.jsx)(V,{selectedAsset:e.source.selectedAsset,onEditSourceAsset:y})]}),me=({onClose:e,onBack:a,onAcceptTerms:l,onSelectAmount:y,onSelectSource:h,onEditSourceAsset:f,opts:d,state:n,email:v,isLoading:i})=>n.status==="select-amount"?(0,t.jsx)(de,{onClose:e,onBack:a,onSelectAmount:y,onEditSourceAsset:f,opts:d,isLoading:i}):n.status==="select-source-asset"?(0,t.jsx)(Y,{onSelectSource:h,opts:d,isLoading:i}):n.status==="kyc-prompt"?(0,t.jsx)(ce,{onClose:e,onAcceptTerms:l,opts:d,isLoading:i}):n.status==="kyc-incomplete"?(0,t.jsx)(le,{onClose:e,email:v}):n.status==="kyc-success"?(0,t.jsx)(ue,{onClose:e}):n.status==="kyc-error"?(0,t.jsx)(ne,{onClose:e,reason:n.reason}):n.status==="account-details"?(0,t.jsx)(te,{onClose:e,data:n.data}):n.status==="create-customer-error"||n.status==="get-customer-error"?(0,t.jsx)(ie,{onClose:e}):null,Ee={component:()=>{let{user:e}=j(),a=_().data;if(!a?.FundWithBankDepositScreen)throw Error("Missing data");let{onSuccess:l,onFailure:y,onBack:h,opts:f,createOrUpdateCustomer:d,getCustomer:n,getOrCreateVirtualAccount:v}=a.FundWithBankDepositScreen,[i,E]=(0,m.useState)(f),[k,r]=(0,m.useState)({status:"select-amount"}),[A,u]=(0,m.useState)(null),[R,s]=(0,m.useState)(!1),w=(0,m.useRef)(null),K=(0,m.useCallback)((async()=>{let o;s(!0),u(null);try{o=await n({kycRedirectUrl:window.location.origin})}catch(c){if(!c||typeof c!="object"||!("status"in c)||c.status!==404)return r({status:"get-customer-error"}),u(c),void s(!1)}if(!o)try{o=await d({hasAcceptedTerms:!1,kycRedirectUrl:window.location.origin})}catch(c){return r({status:"create-customer-error"}),u(c),void s(!1)}if(!o)return r({status:"create-customer-error"}),u(Error("Unable to create customer")),void s(!1);if(o.status==="not_started"&&o.kyc_url)return r({status:"kyc-prompt",kycUrl:o.kyc_url}),void s(!1);if(o.status==="not_started")return r({status:"get-customer-error"}),u(Error("Unexpected user state")),void s(!1);if(o.status==="rejected")return r({status:"kyc-error",reason:o.rejection_reasons?.[0]?.reason}),u(Error("User KYC rejected.")),void s(!1);if(o.status==="incomplete")return r({status:"kyc-incomplete"}),void s(!1);if(o.status!=="active")return r({status:"get-customer-error"}),u(Error("Unexpected user state")),void s(!1);o.status;try{let c=await v({destination:i.destination,provider:i.provider,source:{asset:i.source.selectedAsset}});r({status:"account-details",data:c})}catch(c){return r({status:"create-customer-error"}),u(c),void s(!1)}}),[i]),O=(0,m.useCallback)((async()=>{if(u(null),s(!0),k.status!=="kyc-prompt")return u(Error("Unexpected state")),void s(!1);let o=L({location:k.kycUrl});if(await d({hasAcceptedTerms:!0}),!o)return u(Error("Unable to begin kyc flow.")),s(!1),void r({status:"create-customer-error"});w.current=new AbortController;let c=await(async(p,N)=>{let x=await B({operation:async()=>({done:ee(p)===window.location.origin,closed:p.closed}),until:({done:X,closed:G})=>X||G,delay:0,interval:500,attempts:360,signal:N});return x.status==="aborted"?(p.close(),{status:"aborted"}):x.status==="max_attempts"?{status:"timeout"}:x.result.done?(p.close(),{status:"redirected"}):{status:"closed"}})(o,w.current.signal);if(c.status==="aborted")return;if(c.status==="closed")return void s(!1);c.status;let C=await B({operation:()=>n({}),until:p=>p.status==="active"||p.status==="rejected",delay:0,interval:2e3,attempts:60,signal:w.current.signal});if(C.status!=="aborted"){if(C.status==="max_attempts")return r({status:"kyc-incomplete"}),void s(!1);if(C.status,C.result.status==="rejected")return r({status:"kyc-error",reason:C.result.rejection_reasons?.[0]?.reason}),u(Error("User KYC rejected.")),void s(!1);if(C.result.status!=="active")return r({status:"kyc-incomplete"}),void s(!1);o.closed||o.close(),C.result.status;try{r({status:"kyc-success"});let p=await v({destination:i.destination,provider:i.provider,source:{asset:i.source.selectedAsset}});r({status:"account-details",data:p})}catch(p){r({status:"create-customer-error"}),u(p)}finally{s(!1)}}}),[r,u,s,d,v,k,i,w]),q=(0,m.useCallback)((o=>{r({status:"select-amount"}),E({...i,source:{...i.source,selectedAsset:o}})}),[r,E]),H=(0,m.useCallback)((()=>{r({status:"select-source-asset"})}),[r]);return(0,t.jsx)(me,{onClose:(0,m.useCallback)((async()=>{w.current?.abort(),!i.showBackButton||k.status!=="select-amount"&&k.status!=="select-source-asset"?A?y(A):await l():y(Error("User cancelled funding"))}),[A,w,y,l,i.showBackButton,k.status]),onBack:h,opts:i,state:k,isLoading:R,email:e.email.address,onAcceptTerms:O,onSelectAmount:K,onSelectSource:q,onEditSourceAsset:H})}};export{Ee as FundWithBankDepositScreen,Ee as default};
