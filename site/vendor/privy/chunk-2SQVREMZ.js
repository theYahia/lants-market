/*privy-bundle*/
import{b as i}from"./chunk-6H727BMB.js";import{b as p}from"./chunk-WDIA52AP.js";import{e as c,i as l}from"./chunk-33MCIVAL.js";l();var r=c(p(),1);var d=({title:n,description:t,children:e,...o})=>(0,r.jsx)(s,{...o,children:(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("h3",{children:n}),typeof t=="string"?(0,r.jsx)("p",{children:t}):t,e]})});i(d)`
  margin-bottom: 24px;
`;var f=({title:n,description:t,icon:e,children:o,...a})=>(0,r.jsxs)(g,{...a,children:[e||null,(0,r.jsx)("h3",{children:n}),t&&typeof t=="string"?(0,r.jsx)("p",{children:t}):t,o]}),s=i.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  text-align: left;
  gap: 8px;
  width: 100%;
  margin-bottom: 24px;

  && h3 {
    font-size: 17px;
    color: var(--privy-color-foreground);
  }

  /* Sugar assuming children are paragraphs. Otherwise, handling styling on your own */
  && p {
    color: var(--privy-color-foreground-2);
    font-size: 14px;
  }
`,g=i(s)`
  align-items: center;
  text-align: center;
  gap: 16px;

  h3 {
    margin-bottom: 24px;
  }
`;export{d as a,f as b};
