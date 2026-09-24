/*privy-bundle*/
import{a as v}from"./chunk-EJU6UCBA.js";import{b as u}from"./chunk-QNZK3H3F.js";import{a as g}from"./chunk-UZNPLHXG.js";import{a as x}from"./chunk-FQRH7EQ7.js";import{d as p,n as f}from"./chunk-WPBQN26L.js";import{f as h}from"./chunk-NPUVHBVG.js";import{b as r}from"./chunk-6H727BMB.js";import{a as w,b}from"./chunk-WDIA52AP.js";import{e as c,i as d}from"./chunk-33MCIVAL.js";d();var e=c(b(),1);var o=c(w(),1);var z=r(u)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,j=r.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,T=r.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,k=r.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,B=r(v)`
  text-align: left;
  margin-bottom: 0.5rem;
`,E=r(g)`
  margin-top: 0.25rem;
`,N=r(h)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`,q=({errMsg:i,balance:a,address:n,className:y,title:l,showCopyButton:C=!1})=>{let[t,m]=(0,o.useState)(!1);return(0,o.useEffect)((()=>{if(t){let s=setTimeout((()=>m(!1)),3e3);return()=>clearTimeout(s)}}),[t]),(0,e.jsxs)("div",{children:[l&&(0,e.jsx)(B,{children:l}),(0,e.jsx)(z,{className:y,$state:i?"error":void 0,children:(0,e.jsxs)(j,{children:[(0,e.jsxs)(T,{children:[(0,e.jsx)(x,{address:n,showCopyIcon:!1}),a!==void 0&&(0,e.jsx)(k,{children:a})]}),C&&(0,e.jsx)(N,{onClick:function(s){s.stopPropagation(),navigator.clipboard.writeText(n).then((()=>m(!0))).catch(console.error)},size:"sm",children:(0,e.jsxs)(e.Fragment,t?{children:["Copied",(0,e.jsx)(p,{size:14})]}:{children:["Copy",(0,e.jsx)(f,{size:14})]})})]})}),i&&(0,e.jsx)(E,{children:i})]})};export{q as a};
