/*privy-bundle*/
import{a as n,b as s,c as l}from"./chunk-5PKDVDWL.js";import{c as t,d as a}from"./chunk-NPUVHBVG.js";import{a as o,b as r}from"./chunk-6H727BMB.js";import{i}from"./chunk-33MCIVAL.js";i();var v=o`
  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px;
  letter-spacing: -0.008px;
  text-align: left;
  transition: color 0.1s ease-in;
`,b=r.span`
  ${v}
  transition: color 0.1s ease-in;
  color: ${({error:e})=>e?"var(--privy-color-error)":"var(--privy-color-foreground-3)"};
  text-transform: ${({error:e})=>e?"":"capitalize"};

  &[aria-hidden='true'] {
    visibility: hidden;
  }
`,w=r.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex-grow: 1;
`,k=r(a)`
  ${({$hideAnimations:e})=>e&&o`
      && {
        transition: none;
      }
    `}
`,d=o`
  && {
    width: 100%;
    border-width: 1px;
    border-radius: var(--privy-border-radius-md);
    border-color: var(--privy-color-foreground-3);
    background: var(--privy-color-background);
    color: var(--privy-color-foreground);

    padding: 12px;
    font-size: 16px;
    font-style: normal;
    font-weight: 300;
    line-height: 22px; /* 137.5% */
  }
`,$=r.input`
  ${d}

  &::placeholder {
    color: var(--privy-color-foreground-3);
    font-style: italic;
    font-size: 14px;
  }

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`,z=r.div`
  ${d}
`,j=r.div`
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: ${({centered:e})=>e?"center":"space-between"};
`,N=r.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 32px 0;
  gap: 4px;

  & h3 {
    font-size: 18px;
    font-style: normal;
    font-weight: 600;
    line-height: 24px;
  }

  & p {
    max-width: 300px;
    font-size: 14px;
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }
`,P=r.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 1rem;
`,S=r.div`
  display: flex;
  text-align: left;
  align-items: center;

  gap: 8px;
  max-width: 300px;

  font-size: 14px;
  font-style: normal;
  font-weight: 400;
  line-height: 20px;
  letter-spacing: -0.008px;

  margin: 0 8px;
  color: var(--privy-color-foreground-2);

  > :first-child {
    min-width: 24px;
  }
`;r.div`
  height: var(--privy-height-modal-full);

  @media (max-width: 440px) {
    height: var(--privy-height-modal-compact);
  }
`;var A=r(t)`
  display: flex;
  flex: 1;
  gap: 4px;
  justify-content: center;

  && {
    background: var(--privy-color-background);
    border-radius: var(--privy-border-radius-md);
    border-color: var(--privy-color-foreground-3);
    border-width: 1px;
  }
`,B=r.div`
  position: absolute;
  right: 0.5rem;

  display: flex;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
`,D=r(n)`
  height: 1.25rem;
  width: 1.25rem;
  stroke: var(--privy-color-accent);
  cursor: pointer;

  :active {
    stroke: var(--privy-color-accent-light);
  }
`,E=r(s)`
  height: 1.25rem;
  width: 1.25rem;
  stroke: var(--privy-color-accent);
  cursor: pointer;

  :active {
    stroke: var(--privy-color-accent-light);
  }
`,F=r(l)`
  height: 1.25rem;
  width: 1.25rem;
  stroke: var(--privy-color-accent);
  cursor: pointer;

  :active {
    stroke: var(--privy-color-accent-light);
  }
`,p=o`
  border-radius: 8px;
  background: var(--privy-color-foreground-4);
`,c=o`
  border-radius: 8px;
  transition: all 0.1s ease-out;
  background: ${({$label:e})=>(e==="Strong"?"var(--privy-color-icon-success)":e==="Medium"&&"var(--privy-color-icon-warning)")||"var(--privy-color-icon-error)"};
`,H=r.progress`
  height: 4px;
  width: 100%;
  margin: 8px 0;

  /* Neither engine exposes its pseudo-elements until the native widget is opted out of. */
  appearance: none;

  /* Firefox's track, and a fallback under the WebKit bar. */
  ${p}

  &::-webkit-progress-bar {
    ${p}
  }

  &::-webkit-progress-value {
    ${c}
  }

  &::-moz-progress-bar {
    ${c}
  }
`;export{b as a,w as b,k as c,$ as d,z as e,j as f,N as g,P as h,S as i,A as j,B as k,D as l,E as m,F as n,H as o};
