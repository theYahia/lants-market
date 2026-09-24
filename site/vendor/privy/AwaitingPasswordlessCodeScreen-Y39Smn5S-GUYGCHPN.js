/*privy-bundle*/
import{a as Q}from"./chunk-QQYRIR5K.js";import{a as Y}from"./chunk-LMGG3BFY.js";import{a as Z}from"./chunk-AUAHOAG4.js";import{c as G}from"./chunk-FAUSR2QI.js";import{a as X}from"./chunk-ZCNJUJYK.js";import{a as H}from"./chunk-GQFZD2J7.js";import"./chunk-O7OSTT45.js";import"./chunk-EMJV32HM.js";import"./chunk-NPUVHBVG.js";import"./chunk-OX2NRATT.js";import"./chunk-UKOPVZYU.js";import"./chunk-5WCCN7MY.js";import"./chunk-EQTVCQNI.js";import"./chunk-TMJHXMEF.js";import"./chunk-FWVGY3FT.js";import"./chunk-MZOTTP67.js";import"./chunk-CBRJ357I.js";import{a as ae}from"./chunk-7DTXCCIV.js";import"./chunk-M5QYXKYT.js";import"./chunk-THQEFREN.js";import"./chunk-GUKFN3WB.js";import"./chunk-FYSSWXOT.js";import"./chunk-KA3QHR5F.js";import"./chunk-ABXKNEXP.js";import"./chunk-BFQP75CB.js";import"./chunk-G5ZETGJX.js";import"./chunk-73CBFCU5.js";import"./chunk-JPQ2YH5P.js";import"./chunk-5PBRHVUG.js";import"./chunk-76B3DWJN.js";import{b as f,h as v,l as K}from"./chunk-FWSLXBP2.js";import"./chunk-QPGPAA5V.js";import"./chunk-C23JMCTS.js";import{b as z}from"./chunk-XGBY2DL4.js";import{b as g}from"./chunk-6H727BMB.js";import{Aa as q,Qa as P,ub as j,yb as V}from"./chunk-WB6MAAQS.js";import"./chunk-RAMHAI5X.js";import"./chunk-4V423Z5T.js";import{a as B,b as ie}from"./chunk-WDIA52AP.js";import"./chunk-P7MRDD3S.js";import"./chunk-WYQAMW35.js";import"./chunk-RIZDSPQK.js";import"./chunk-36KV4IIR.js";import"./chunk-HIG42SMQ.js";import"./chunk-JTED25HN.js";import"./chunk-OISPUNON.js";import"./chunk-VOARPK66.js";import{e as k,i as I}from"./chunk-33MCIVAL.js";I();var r=k(ie(),1);I();var w=k(B(),1);function le({title:o,titleId:d,...C},p){return w.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 20 20",fill:"currentColor","aria-hidden":"true","data-slot":"icon",ref:p,"aria-labelledby":d},C),o?w.createElement("title",{id:d},o):null,w.createElement("path",{fillRule:"evenodd",d:"M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z",clipRule:"evenodd"}))}var ce=w.forwardRef(le),J=ce;var s=k(B(),1),te=k(ae(),1);var de=({contactMethod:o,authFlow:d,emailDomain:C,appName:p="Privy",whatsAppEnabled:M=!1,onBack:E,onCodeSubmit:L,onResend:D,errorMessage:m,success:h=!1,resendCountdown:O=0,onInvalidInput:U,onClearError:N})=>{let[c,S]=(0,s.useState)(re);(0,s.useEffect)((()=>{m||S(re)}),[m]);let x=async y=>{y.preventDefault();let t=y.currentTarget.value.replace(" ","");if(t==="")return;if(isNaN(Number(t)))return void U?.("Code should be numeric");N?.();let u=Number(y.currentTarget.name?.charAt(5)),a=[...t||[""]].slice(0,ee-u),n=[...c.slice(0,u),...a,...c.slice(u+a.length)];S(n);let b=Math.min(Math.max(u+a.length,0),ee-1);isNaN(Number(y.currentTarget.value))||document.querySelector(`input[name=code-${b}]`)?.focus(),n.every((l=>l&&!isNaN(+l)))&&(document.querySelector(`input[name=code-${b}]`)?.blur(),await L?.(n.join("")))};return(0,r.jsx)(H,{title:"Enter confirmation code",subtitle:(0,r.jsxs)("span",d==="email"?{children:["Please check ",(0,r.jsx)(oe,{children:o})," for an email from"," ",C??"privy.io"," and enter your code below."]}:{children:["Please check ",(0,r.jsx)(oe,{children:o})," for a",M?" WhatsApp":""," message from ",p," and enter your code below."]}),icon:d==="email"?Y:Q,onBack:E,showBack:!0,helpText:(0,r.jsxs)(he,{children:[(0,r.jsxs)("span",{children:["Didn't get ",d==="email"?"an email":"a message","?"]}),O?(0,r.jsxs)(ye,{children:[(0,r.jsx)(J,{color:"var(--privy-color-foreground)",strokeWidth:1.33,height:"12px",width:"12px"}),(0,r.jsx)("span",{children:"Code sent"})]}):(0,r.jsx)(Z,{as:"button",size:"sm",onClick:D,children:"Resend code"})]}),children:(0,r.jsx)(ue,{children:(0,r.jsx)(G,{children:(0,r.jsxs)(fe,{children:[(0,r.jsx)("div",{children:c.map(((y,t)=>(0,r.jsx)("input",{name:`code-${t}`,type:"text",value:c[t],onChange:x,onKeyUp:u=>{u.key==="Backspace"&&(a=>{N?.(),S([...c.slice(0,a),"",...c.slice(a+1)]),a>0&&document.querySelector(`input[name=code-${a-1}]`)?.focus()})(t)},inputMode:"numeric",autoFocus:t===0,pattern:"[0-9]",className:`${h?"success":""} ${m?"fail":""}`,autoComplete:te.isMobile?"one-time-code":"off"},t)))}),(0,r.jsx)(ve,{$fail:!!m,$success:h,children:(0,r.jsx)("span",{children:m==="Invalid or expired verification code"?"Incorrect code":m||(h?"Success!":"")})})]})})})})},ee=6,re=Array(6).fill(""),A,T,pe=((A=pe||{})[A.RESET_AFTER_DELAY=0]="RESET_AFTER_DELAY",A[A.CLEAR_ON_NEXT_VALID_INPUT=1]="CLEAR_ON_NEXT_VALID_INPUT",A),me=((T=me||{})[T.EMAIL=0]="EMAIL",T[T.SMS=1]="SMS",T),Oe={component:()=>{let{navigate:o,lastScreen:d,navigateBack:C,setModalData:p,onUserCloseViaDialogOrKeybindRef:M}=z(),E=j(),{closePrivyModal:L,resendEmailCode:D,resendSmsCode:m,getAuthMeta:h,loginWithCode:O,updateWallets:U,createAnalyticsEvent:N}=q(),{authenticated:c,logout:S,user:x}=V(),{whatsAppEnabled:y}=j(),[t,u]=(0,s.useState)(!1),[a,n]=(0,s.useState)(null),[b,l]=(0,s.useState)(null),[_,F]=(0,s.useState)(0);M.current=()=>null;let R=h()?.email?0:1,W=R===0?h()?.email||"":h()?.phoneNumber||"",$=P-500;return(0,s.useEffect)((()=>{if(_){let i=setTimeout((()=>{F(_-1)}),1e3);return()=>clearTimeout(i)}}),[_]),(0,s.useEffect)((()=>{if(c&&t&&x){if(E?.legal.requireUsersAcceptTerms&&!x.hasAcceptedTerms){let i=setTimeout((()=>{o("AffirmativeConsentScreen")}),$);return()=>clearTimeout(i)}if(X(x,E.embeddedWallets)){let i=setTimeout((()=>{p({createWallet:{onSuccess:()=>{},onFailure:e=>{console.error(e),N({eventName:"embedded_wallet_creation_failure_logout",payload:{error:e,screen:"AwaitingPasswordlessCodeScreen"}}),S()},callAuthOnSuccessOnClose:!0}}),o("EmbeddedWalletOnAccountCreateScreen")}),$);return()=>clearTimeout(i)}{U();let i=setTimeout((()=>L({shouldCallAuthOnSuccess:!0,isSuccess:!0})),P);return()=>clearTimeout(i)}}}),[c,t,x]),(0,s.useEffect)((()=>{if(a&&b===0){let i=setTimeout((()=>{n(null),l(null),document.querySelector("input[name=code-0]")?.focus()}),1400);return()=>clearTimeout(i)}}),[a,b]),(0,r.jsx)(de,{contactMethod:W,authFlow:R===0?"email":"sms",emailDomain:E?.appearance.emailDomain,appName:E?.name,whatsAppEnabled:y,onBack:()=>C(),onCodeSubmit:async i=>{try{await O(i),u(!0)}catch(e){if(e instanceof f&&e.privyErrorCode===v.INVALID_CREDENTIALS)n("Invalid or expired verification code"),l(0);else if(e instanceof f&&e.privyErrorCode===v.CANNOT_LINK_MORE_OF_TYPE)n(e.message);else{if(e instanceof f&&e.privyErrorCode===v.USER_LIMIT_REACHED)return console.error(new K(e).toString()),void o("UserLimitReachedScreen");if(e instanceof f&&e.privyErrorCode===v.USER_DOES_NOT_EXIST)return void o("AccountNotFoundScreen");if(e instanceof f&&e.privyErrorCode===v.LINKED_TO_ANOTHER_USER)return p({errorModalData:{error:e,previousScreen:d??"AwaitingPasswordlessCodeScreen"}}),void o("ErrorScreen",!1);if(e instanceof f&&e.privyErrorCode===v.DISALLOWED_PLUS_EMAIL)return p({inlineError:{error:e}}),void o("ConnectOrCreateScreen",!1);if(e instanceof f&&e.privyErrorCode===v.ACCOUNT_TRANSFER_REQUIRED&&e.data?.data?.nonce)return p({accountTransfer:{nonce:e.data?.data?.nonce,account:W,displayName:e.data?.data?.account?.displayName,linkMethod:R===0?"email":"sms",embeddedWalletAddress:e.data?.data?.otherUser?.embeddedWalletAddress}}),void o("LinkConflictScreen");n("Issue verifying code"),l(0)}}},onResend:async()=>{F(30),R===0?await D():await m()},errorMessage:a||void 0,success:t,resendCountdown:_,onInvalidInput:i=>{n(i),l(1)},onClearError:()=>{b===1&&(n(null),l(null))}})}},ue=g.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: auto;
  gap: 16px;
  flex-grow: 1;
  width: 100%;
`,fe=g.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;

  > div:first-child {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    border-radius: var(--privy-border-radius-sm);

    > input {
      border: 1px solid var(--privy-color-foreground-4);
      background: var(--privy-color-background);
      border-radius: var(--privy-border-radius-sm);
      padding: 8px 10px;
      height: 48px;
      width: 40px;
      text-align: center;
      font-size: 18px;
      font-weight: 600;
      color: var(--privy-color-foreground);
      transition: all 0.2s ease;
    }

    > input:focus {
      border: 1px solid var(--privy-color-foreground);
      box-shadow: 0 0 0 1px var(--privy-color-foreground);
    }

    > input:invalid {
      border: 1px solid var(--privy-color-error);
    }

    > input.success {
      border: 1px solid var(--privy-color-border-success);
      background: var(--privy-color-success-bg);
    }

    > input.fail {
      border: 1px solid var(--privy-color-border-error);
      background: var(--privy-color-error-bg);
      animation: shake 180ms;
      animation-iteration-count: 2;
    }
  }

  @keyframes shake {
    0% {
      transform: translate(1px, 0);
    }
    33% {
      transform: translate(-1px, 0);
    }
    67% {
      transform: translate(-1px, 0);
    }
    100% {
      transform: translate(1px, 0);
    }
  }
`,ve=g.div`
  line-height: 20px;
  min-height: 20px;
  font-size: 14px;
  font-weight: 400;
  color: ${o=>o.$success?"var(--privy-color-success-dark)":o.$fail?"var(--privy-color-error-dark)":"transparent"};
  display: flex;
  justify-content: center;
  width: 100%;
  text-align: center;
`,he=g.div`
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--privy-color-foreground-2);
`,ye=g.div`
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--privy-border-radius-sm);
  padding: 2px 8px;
  gap: 4px;
  background: var(--privy-color-background-2);
  color: var(--privy-color-foreground-2);
`,oe=g.span`
  font-weight: 500;
  word-break: break-all;
  color: var(--privy-color-foreground);
`;export{Oe as AwaitingPasswordlessCodeScreen,de as AwaitingPasswordlessCodeScreenView,Oe as default};
