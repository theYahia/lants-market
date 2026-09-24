/*privy-bundle*/
import{b as t}from"./chunk-6H727BMB.js";import{a as p,b as s}from"./chunk-WDIA52AP.js";import{e,i as n}from"./chunk-33MCIVAL.js";n();var a=e(s(),1),i=e(p(),1);var g=o=>{let[l,r]=(0,i.useState)(!1);return(0,a.jsx)(c,{color:o.color,href:o.url,target:"_blank",rel:"noreferrer noopener",onClick:()=>{r(!0),setTimeout((()=>r(!1)),1500)},justOpened:l,children:o.text})},c=t.a`
  display: flex;
  align-items: center;
  gap: 6px;

  && {
    margin: 8px 2px;
    font-size: 14px;
    color: ${o=>o.justOpened?"var(--privy-color-foreground)":o.color||"var(--privy-color-foreground-3)"};
    font-weight: ${o=>o.justOpened?500:"normal"};
    transition: color 350ms ease;

    :focus,
    :active {
      background-color: transparent;
      border: none;
      outline: none;
      box-shadow: none;
    }

    :hover {
      color: ${o=>o.justOpened?"var(--privy-color-foreground)":"var(--privy-color-foreground-2)"};
    }

    :active {
      color: var(--privy-color-foreground);
      font-weight: 500;
    }

    @media (max-width: 440px) {
      margin: 12px 2px;
    }
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;export{g as a};
