/*privy-bundle*/
import{a as z}from"./chunk-GQFZD2J7.js";import{e as C}from"./chunk-WPBQN26L.js";import{b as p}from"./chunk-KA3QHR5F.js";import{b as r}from"./chunk-6H727BMB.js";import{a as E,b as B}from"./chunk-WDIA52AP.js";import{e as x,i as k}from"./chunk-33MCIVAL.js";k();var e=x(B(),1);var i=x(E(),1);var _=({currency:o="usd",value:s,onChange:l,inputMode:a="decimal",autoFocus:u})=>{let[f,A]=(0,i.useState)("0"),[m,S]=(0,i.useState)(null),g=(0,i.useRef)(null),v=(0,i.useRef)(null),d=s??f,y=p[o]?.symbol??"$",c=d.length>9?"small":d.length>6?"compact":"default";(0,i.useLayoutEffect)((()=>{let t=v.current?.offsetWidth;S(t?Math.ceil(t)+2:null)}),[c,d]);let L=(0,i.useCallback)((t=>{let n=t.target.value,h=(n=n.replace(/[^\d.]/g,"")).split(".");h.length>2&&(n=h[0]+"."+h.slice(1).join(""));let[D="",b]=n.split("."),w=D.replace(/^0+(?=\d)/,"");((n=b!==void 0?`${w||"0"}.${b}`:w||"0")===""||n===".")&&(n="0"),l?l(n):A(n)}),[l]),j=(0,i.useCallback)((t=>{!(["Delete","Backspace","Tab","Escape","Enter",".","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(t.key)||(t.ctrlKey||t.metaKey)&&["a","c","v","x"].includes(t.key.toLowerCase()))&&(t.key>="0"&&t.key<="9"||t.preventDefault())}),[]);return(0,e.jsxs)(K,{$size:c,onClick:()=>g.current?.focus(),children:[(0,e.jsx)($,{$size:c,children:y}),(0,e.jsx)(M,{ref:g,type:"text",inputMode:a,value:d,onChange:L,onKeyDown:j,autoFocus:u,placeholder:"0","aria-label":"Amount",style:m?{width:`${m}px`}:void 0}),(0,e.jsx)(U,{ref:v,"aria-hidden":"true",children:d}),(0,e.jsx)($,{$size:c,style:{opacity:0},children:y})]})},ee=({selectedAsset:o,onEditSourceAsset:s})=>{let{icon:l}=p[o];return(0,e.jsxs)(F,{onClick:s,children:[(0,e.jsx)(R,{children:l}),(0,e.jsx)(H,{children:o.toLocaleUpperCase()}),(0,e.jsx)(T,{children:(0,e.jsx)(C,{})})]})},K=r.span`
  position: relative;
  background-color: var(--privy-color-background);
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  font-kerning: none;
  font-feature-settings: 'calt' off;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  cursor: pointer;

  && {
    color: var(--privy-color-foreground);
    font-size: ${({$size:o})=>o==="small"?"2.25rem":o==="compact"?"3rem":"3.75rem"};
    font-style: normal;
    font-weight: 600;
    line-height: 5.375rem;
  }
`,M=r.input`
  appearance: none;
  align-self: flex-start;
  min-width: 1ch;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  text-align: left;
  caret-color: currentcolor;

  &:focus {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }
`,U=r.span`
  position: absolute;
  visibility: hidden;
  white-space: pre;
  pointer-events: none;
`,$=r.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: ${({$size:o})=>o==="small"?"0.75rem":o==="compact"?"0.875rem":"1rem"};
  font-style: normal;
  font-weight: 600;
  line-height: 1.5rem;
  margin-top: 0.75rem;
`,F=r.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: auto;
  gap: 0.5rem;
  border: 1px solid var(--privy-color-border-default);
  border-radius: var(--privy-border-radius-full);

  && {
    margin: auto;
    padding: 0.5rem 1rem;
  }
`,R=r.div`
  svg {
    width: 1rem;
    height: 1rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
    border: solid 0.1px var(--privy-color-border-default);
  }
`,H=r.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem;
`,T=r.div`
  color: var(--privy-color-foreground);

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`,re=({opts:o,isLoading:s,onSelectSource:l})=>(0,e.jsx)(z,{showClose:!1,showBack:!0,onBack:()=>l(o.source.selectedAsset),title:"Select currency",children:(0,e.jsx)(W,{children:o.source.assets.map((a=>{let{icon:u,name:f}=p[a];return(0,e.jsx)(q,{onClick:()=>l(a),disabled:s,children:(0,e.jsxs)(G,{children:[(0,e.jsx)(I,{children:u}),(0,e.jsxs)(J,{children:[(0,e.jsx)(N,{children:f}),(0,e.jsx)(O,{children:a.toLocaleUpperCase()})]})]})},a)}))})}),W=r.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  max-height: 20.875rem;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`,q=r.button`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;

  && {
    padding: 0.75rem 1rem;
  }
`,G=r.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`,I=r.div`
  svg {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
    border: solid 0.1px var(--privy-color-border-default);
  }
`,J=r.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
`,N=r.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
`,O=r.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.125rem;
`;export{_ as a,ee as b,re as c};
