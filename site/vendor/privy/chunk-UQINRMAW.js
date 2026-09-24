/*privy-bundle*/
import{d as u,n as f}from"./chunk-WPBQN26L.js";import{b as i}from"./chunk-6H727BMB.js";import{a as x,b as k}from"./chunk-WDIA52AP.js";import{e as p,i as m}from"./chunk-33MCIVAL.js";m();var e=p(k(),1);var d=p(x(),1);var a=i.button`
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 0.5rem;

  && {
    color: var(--privy-color-foreground);
    font-weight: 500;
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`,g=i.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--privy-color-foreground-2);
`,v=i(u)`
  color: var(--privy-color-icon-success);
  flex-shrink: 0;
`,y=i(f)`
  color: var(--privy-color-icon-muted);
  flex-shrink: 0;
`;function j({children:r,iconOnly:l,value:n,hideCopyIcon:t,onCopy:s,iconSize:o=14,...c}){let[C,h]=(0,d.useState)(!1);return(0,e.jsxs)(a,{...c,onClick:()=>{navigator.clipboard.writeText(n||(typeof r=="string"?r:"")).then((()=>s?.())).catch(console.error),h(!0),setTimeout((()=>h(!1)),1500)},children:[r," ",C?(0,e.jsxs)(g,{children:[(0,e.jsx)(v,{size:o})," ",!l&&"Copied"]}):!t&&(0,e.jsx)(y,{size:o})]})}var S=({value:r,includeChildren:l,children:n,...t})=>{let[s,o]=(0,d.useState)(!1),c=()=>{navigator.clipboard.writeText(r).catch(console.error),o(!0),setTimeout((()=>o(!1)),1500)};return(0,e.jsxs)(e.Fragment,{children:[l?(0,e.jsx)(a,{...t,onClick:c,children:n}):(0,e.jsx)(e.Fragment,{children:n}),(0,e.jsx)(a,{...t,onClick:c,children:s?(0,e.jsx)(g,{children:(0,e.jsx)(v,{})}):(0,e.jsx)(y,{})})]})};export{j as a,S as b};
