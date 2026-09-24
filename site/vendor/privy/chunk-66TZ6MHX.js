/*privy-bundle*/
import{d as e}from"./chunk-KZPO2JJF.js";import{h as r}from"./chunk-NPUVHBVG.js";import{b as t,d as i}from"./chunk-6H727BMB.js";import{i as o}from"./chunk-33MCIVAL.js";o();var x=t.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 24px;
  padding-bottom: 24px;
`,f=t.div`
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;

  svg {
    border-radius: var(--privy-border-radius-sm);
  }
`,m=t.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 8px;
`,g=t.div`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0 16px;
  border-width: 1px !important;
  border-radius: 12px;
  cursor: text;

  &:focus-within {
    border-color: var(--privy-color-accent);
  }
`;t.div`
  font-size: 42px !important;
`;var n=t.input`
  background-color: var(--privy-color-background);
  width: 100%;

  &:focus {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }

  && {
    font-size: 26px;
  }
`,u=t(n)`
  && {
    font-size: 42px;
  }
`;t.button`
  cursor: pointer;
  padding-left: 4px;
`;var v=t.div`
  font-size: 18px;
`,y=t.div`
  font-size: 12px;
  color: var(--privy-color-foreground-3);
  /* we need this container to maintain a static height if there's no content */
  height: 20px;
`;t.div`
  display: flex;
  flex-direction: row;
  line-height: 22px;
  font-size: 16px;
  text-align: center;
  svg {
    margin: auto;
  }
`,t(e)`
  margin-top: 16px;
`;var a=i`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;t(r)`
  border-radius: var(--privy-border-radius-md) !important;
  animation: ${a} 0.3s ease-in-out;
`;var h=t.a`
  && {
    color: var(--privy-color-accent);
  }

  cursor: pointer;
`;export{x as a,f as b,m as c,g as d,n as e,u as f,v as g,y as h,h as i};
