/*privy-bundle*/
import{a as c}from"./chunk-WH6K6C5W.js";import{a as s,b as l,d as n}from"./chunk-6H727BMB.js";import{b as $}from"./chunk-WDIA52AP.js";import{e as g,i as a}from"./chunk-33MCIVAL.js";a();var t=g($(),1);var f=({children:o,color:i,isLoading:r,isPulsing:e,...d})=>(0,t.jsx)(p,{$color:i,$isLoading:r,$isPulsing:e,...d,children:o}),p=l.span`
  padding: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem; /* 150% */
  border-radius: var(--privy-border-radius-xs);
  display: flex;
  align-items: center;
  ${o=>{let i,r;o.$color==="green"&&(i="var(--privy-color-success-dark)",r="var(--privy-color-success-light)"),o.$color==="red"&&(i="var(--privy-color-error)",r="var(--privy-color-error-light)"),o.$color==="gray"&&(i="var(--privy-color-foreground-2)",r="var(--privy-color-background-2)");let e=n`
      from, to {
        background-color: ${r};
      }

      50% {
        background-color: rgba(${r}, 0.8);
      }
    `;return s`
      color: ${i};
      background-color: ${r};
      ${o.$isPulsing&&s`
        animation: ${e} 3s linear infinite;
      `};
    `}}

  ${c}
`;export{f as a};
