/*privy-bundle*/
import{d as a,n as l}from"./chunk-WPBQN26L.js";import{f as c}from"./chunk-NPUVHBVG.js";import{g as n}from"./chunk-76B3DWJN.js";import{b as i}from"./chunk-6H727BMB.js";import{a as y,b as g}from"./chunk-WDIA52AP.js";import{e as u,i as x}from"./chunk-33MCIVAL.js";x();var e=u(g(),1);var t=u(y(),1);var j=({address:r,showCopyIcon:p,url:m,className:d})=>{let[o,f]=(0,t.useState)(!1);function h(s){s.stopPropagation(),navigator.clipboard.writeText(r).then((()=>f(!0))).catch(console.error)}return(0,t.useEffect)((()=>{if(o){let s=setTimeout((()=>f(!1)),3e3);return()=>clearTimeout(s)}}),[o]),(0,e.jsxs)(z,m?{children:[(0,e.jsx)(v,{title:r,className:d,href:`${m}/address/${r}`,target:"_blank",children:n(r)}),p&&(0,e.jsx)(c,{onClick:h,size:"sm",style:{gap:"0.375rem"},children:(0,e.jsxs)(e.Fragment,o?{children:["Copied",(0,e.jsx)(a,{size:16})]}:{children:["Copy",(0,e.jsx)(l,{size:16})]})})]}:{children:[(0,e.jsx)(C,{title:r,className:d,children:n(r)}),p&&(0,e.jsx)(c,{onClick:h,size:"sm",style:{gap:"0.375rem",fontSize:"14px"},children:(0,e.jsxs)(e.Fragment,o?{children:["Copied",(0,e.jsx)(a,{size:14})]}:{children:["Copy",(0,e.jsx)(l,{size:14})]})})]})},z=i.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,C=i.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,v=i.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;export{j as a};
