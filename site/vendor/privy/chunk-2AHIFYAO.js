/*privy-bundle*/
import{a as E}from"./chunk-FAZLRPDR.js";import{d as z,i as U}from"./chunk-NPUVHBVG.js";import{n as V}from"./chunk-TMJHXMEF.js";import{b as s}from"./chunk-6H727BMB.js";import{$ as d,P as k,ba as u,da as N,ea as P,fa as $,ga as S,ub as T}from"./chunk-WB6MAAQS.js";import{a as A,b as K}from"./chunk-WDIA52AP.js";import{e as w,i as C}from"./chunk-33MCIVAL.js";C();var r=w(K(),1),n=w(A(),1);var G=({value:e,onChange:p})=>(0,r.jsx)("select",{value:e,onChange:p,children:P.map((l=>(0,r.jsxs)("option",{value:l.code,children:[l.code," +",l.callCode]},l.code)))}),ee=(0,n.forwardRef)(((e,p)=>{let l=T(),[L,q]=(0,n.useState)(!1),{accountType:R}=V(),[a,g]=(0,n.useState)(""),[t,j]=(0,n.useState)(e.defaultCountry??l?.intl.defaultCountry??"US"),B=d(a,t),m=N(t),D=$(t),F=k(t),b=!B,[f,x]=(0,n.useState)(!1),I=F.length,v=o=>{let i=o.target.value;j(i),g(""),e.onChange&&e.onChange({rawPhoneNumber:a,qualifiedPhoneNumber:u(a,i),countryCode:i,isValid:d(a,t)})},y=(o,i)=>{try{let c=o.replace(/\D/g,"")===a.replace(/\D/g,"")?o:m.input(o);g(c),e.onChange&&e.onChange({rawPhoneNumber:c,qualifiedPhoneNumber:u(o,i),countryCode:i,isValid:d(o,i)})}catch(c){console.error("Error processing phone number:",c)}},h=()=>{x(!0);let o=u(a,t);e.onSubmit({rawPhoneNumber:a,qualifiedPhoneNumber:o,countryCode:t,isValid:d(a,t)}).finally((()=>x(!1)))};return(0,n.useEffect)((()=>{if(e.defaultValue){let o=S(e.defaultValue);m.reset(),v({target:{value:o.countryCode}}),y(o.phone,o.countryCode)}}),[e.defaultValue]),(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(H,{children:(0,r.jsxs)(J,{$callingCodeLength:I,$stacked:e.stacked,children:[(0,r.jsx)(G,{value:t,onChange:v}),(0,r.jsx)("input",{ref:p,id:"phone-number-input",className:"login-method-button",type:"tel",placeholder:D,onFocus:()=>q(!0),onChange:o=>{y(o.target.value,t)},onKeyUp:o=>{o.key==="Enter"&&h()},value:a,autoComplete:"tel"}),R!=="phone"||L||e.hideRecent?e.stacked||e.noIncludeSubmitButton?(0,r.jsx)("span",{}):(0,r.jsx)(U,{isSubmitting:f,onClick:h,disabled:b,children:"Submit"}):(0,r.jsx)(E,{color:"gray",children:"Recent"})]})}),e.stacked&&!e.noIncludeSubmitButton?(0,r.jsx)(z,{loading:f,loadingText:null,onClick:h,disabled:b,children:"Submit"}):null]})})),H=s.div`
  width: 100%;
`,J=s.label`
  --country-code-dropdown-width: calc(54px + calc(12 * ${e=>e.$callingCodeLength}px));
  --phone-input-extra-padding-left: calc(12px + calc(3 * ${e=>e.$callingCodeLength}px));
  display: block;
  position: relative;
  width: 100%;

  /* Tablet and Up */
  @media (min-width: 441px) {
    --country-code-dropdown-width: calc(52px + calc(10 * ${e=>e.$callingCodeLength}px));
  }

  && > select {
    font-size: 16px;
    height: 24px;
    position: absolute;
    margin: 13px calc(var(--country-code-dropdown-width) / 4);
    line-height: 24px;
    width: var(--country-code-dropdown-width);
    background-color: var(--privy-color-background);
    background-size: auto;
    background-position-x: right;
    cursor: pointer;

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
      width: var(--country-code-dropdown-width);
    }

    :focus {
      outline: none;
      box-shadow: none;
    }
  }

  && > input {
    font-size: 16px;
    line-height: 24px;
    color: var(--privy-color-foreground);

    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    padding: 12px 88px 12px
      calc(var(--country-code-dropdown-width) + var(--phone-input-extra-padding-left));
    padding-right: ${e=>e.$stacked?"16px":"88px"};
    flex-grow: 1;
    background: var(--privy-color-background);
    border: 1px solid var(--privy-color-foreground-4);
    border-radius: var(--privy-border-radius-md);
    width: 100%;

    :focus {
      outline: none;
      border-color: var(--privy-color-accent);
    }

    :autofill,
    :-webkit-autofill {
      background: var(--privy-color-background);
    }

    /* Tablet and Up */
    @media (min-width: 441px) {
      font-size: 14px;
      padding-right: 78px;
    }
  }

  && > :last-child {
    right: 16px;
    position: absolute;
    top: 50%;
    transform: translate(0, -50%);
  }

  && > button:last-child {
    right: 0;
    line-height: 24px;
    padding: 13px 17px;

    :focus {
      outline: none;
      border-color: var(--privy-color-accent);
    }
  }

  && > input::placeholder {
    color: var(--privy-color-foreground-3);
  }
`;export{ee as a};
