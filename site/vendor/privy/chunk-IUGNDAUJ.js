/*privy-bundle*/
import{b as a}from"./chunk-6H727BMB.js";import{b as d}from"./chunk-WDIA52AP.js";import{e as s,i as n}from"./chunk-33MCIVAL.js";n();var r=s(d(),1);var c=({data:t})=>{let e=o=>typeof o=="object"&&o!==null?(0,r.jsx)(h,{children:Object.entries(o).map((([i,l])=>(0,r.jsxs)("li",{children:[(0,r.jsxs)("strong",{children:[i,":"]})," ",e(l)]},i)))}):(0,r.jsx)("span",{children:String(o)});return(0,r.jsx)("div",{children:e(t)})},p=a.div`
  margin-top: 1.5rem;
  background-color: var(--privy-color-background-2);
  border-radius: var(--privy-border-radius-md);
  padding: 12px;
  text-align: left;
  max-height: 310px;
  overflow: scroll;
  white-space: pre-wrap;
  width: 100%;
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--privy-color-foreground);
  line-height: 1.5;

  /* hide the scrollbars */
  -ms-overflow-style: none; /* Internet Explorer 10+ */
  scrollbar-width: none; /* Firefox */

  &::-webkit-scrollbar {
    display: none; /* Safari and Chrome */
  }
`,h=a.ul`
  margin-left: 12px !important;
  white-space: nowrap;

  &:first-child {
    margin-left: 0 !important;
  }

  strong {
    font-weight: 500 !important;
  }
`,w=({data:t,className:e})=>(0,r.jsx)(p,{className:e,children:(0,r.jsx)(c,{data:t})});export{p as a,w as b};
