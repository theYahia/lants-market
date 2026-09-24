/*privy-bundle*/
import{a as u}from"./chunk-EMJV32HM.js";import{j as h,l as v}from"./chunk-NPUVHBVG.js";import{b as n,e as g}from"./chunk-6H727BMB.js";import{a as S,b as j}from"./chunk-WDIA52AP.js";import{e as s,i as p}from"./chunk-33MCIVAL.js";p();var r=s(j(),1),t=s(S(),1);var B=n.div`
  /* spacing tokens */
  --screen-space: 16px; /* base 1x = 16 */
  --screen-space-lg: calc(var(--screen-space) * 1.5); /* 24px */

  position: relative;
  overflow: hidden;
  margin: 0 calc(-1 * var(--screen-space)); /* extends over modal padding */
  height: 100%;
  border-radius: var(--privy-border-radius-lg);
`,C=n.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--screen-space) * 1.5);
  width: 100%;
  background: var(--privy-color-background);
  padding: 0 var(--screen-space-lg) var(--screen-space);
  height: 100%;
  border-radius: var(--privy-border-radius-lg);
`,I=n.div`
  position: relative;
  display: flex;
  flex-direction: column;
`,F=n(h)`
  margin: 0 -8px;
`,V=n.div`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;

  /* Enable scrolling */
  overflow-y: auto;

  /* Hide scrollbar but keep functionality when scrollable */
  /* Add padding for focus outline space, offset with negative margin */
  padding: 3px;
  margin: -3px;

  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-gutter: stable both-edges;
  scrollbar-width: none;
  -ms-overflow-style: none;

  /* Gradient effect for scroll indication */
  ${({$colorScheme:e})=>e==="light"?"background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0.06)) bottom;":e==="dark"?"background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.06)) bottom;":void 0}

  background-repeat: no-repeat;
  background-size:
    100% 32px,
    100% 16px;
  background-attachment: local, scroll;
`,H=n.div`
  display: flex;
  flex-direction: column;
  gap: var(--screen-space-lg);
  margin-top: 1.5rem;
`,R=n.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--screen-space);
`,T=n.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`,A=n.h3`
  && {
    font-size: 20px;
    line-height: 32px;
    font-weight: 500;
    color: var(--privy-color-foreground);
    margin: 0;
  }
`,M=n.p`
  && {
    margin: 0;
    font-size: 16px;
    font-weight: 300;
    line-height: 24px;
    color: var(--privy-color-foreground);
  }
`,f=n.div`
  background: ${({$variant:e})=>{switch(e){case"success":return"var(--privy-color-success-bg)";case"warning":return"var(--privy-color-warn)";case"error":return"var(--privy-color-error-bg)";case"loading":case"logo":return"transparent";default:return"var(--privy-color-background-2)"}}};

  border-radius: 50%;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
`,N=n.div`
  display: flex;
  align-items: center;
  justify-content: center;

  img,
  svg {
    max-height: 90px;
    max-width: 180px;
  }
`,W=n.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 82px;

  > div {
    position: relative;
  }

  > div > :first-child {
    position: relative;
  }

  > div > :last-child {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }
`,o=({children:e,...i})=>(0,r.jsx)(B,{children:(0,r.jsx)(C,{...i,children:e})}),G=n.div`
  position: absolute;
  top: 0;
  left: calc(-1 * var(--screen-space-lg));
  width: calc(100% + calc(var(--screen-space-lg) * 2));
  height: 4px;
  background: var(--privy-color-background-2);
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  overflow: hidden;
`,L=n(v)`
  padding: 0;
  && a {
    padding: 0;
    color: var(--privy-color-foreground-3);
  }
`,q=n.div`
  height: 100%;
  width: ${({pct:e})=>e}%;
  background: var(--privy-color-foreground-3);
  border-radius: 2px;
  transition: width 300ms ease-in-out;
`,D=({step:e})=>e?(0,r.jsx)(G,{children:(0,r.jsx)(q,{pct:Math.min(100,e.current/e.total*100)})}):null;o.Header=({title:e,subtitle:i,icon:a,iconVariant:l,iconLoadingStatus:m,showBack:x,onBack:b,showInfo:y,onInfo:w,showClose:c,onClose:k,step:d,headerTitle:E,eyebrow:$,...z})=>(0,r.jsxs)(I,{...z,children:[(0,r.jsx)(F,{backFn:x?b:void 0,infoFn:y?w:void 0,onClose:c?k:void 0,title:E,eyebrow:$,closeable:c}),(a||l||e||i)&&(0,r.jsxs)(R,{children:[a||l?(0,r.jsx)(o.Icon,{icon:a,variant:l,loadingStatus:m}):null,!(!e&&!i)&&(0,r.jsxs)(T,{children:[e&&(0,r.jsx)(A,{children:e}),i&&(0,r.jsx)(M,{children:i})]})]}),d&&(0,r.jsx)(D,{step:d})]}),(o.Body=t.default.forwardRef((({children:e,...i},a)=>(0,r.jsx)(V,{ref:a,...i,children:e})))).displayName="Screen.Body",o.Footer=({children:e,...i})=>(0,r.jsx)(H,{id:"privy-content-footer-container",...i,children:e}),o.Actions=({children:e,...i})=>(0,r.jsx)(J,{...i,children:e}),o.HelpText=({children:e,...i})=>(0,r.jsx)(K,{...i,children:e}),o.FooterText=({children:e,...i})=>(0,r.jsx)(O,{...i,children:e}),o.Watermark=()=>(0,r.jsx)(L,{}),o.Icon=({icon:e,variant:i="subtle",loadingStatus:a})=>i==="logo"&&e?(0,r.jsx)(N,typeof e=="string"?{children:(0,r.jsx)("img",{src:e,alt:""})}:t.default.isValidElement(e)?{children:e}:{children:t.default.createElement(e)}):i==="loading"?e?(0,r.jsx)(W,{children:(0,r.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"center"},children:[(0,r.jsx)(g,{success:a?.success,fail:a?.fail}),typeof e=="string"?(0,r.jsx)("span",{style:{background:`url('${e}') 0 0 / contain`,height:"38px",width:"38px",borderRadius:"6px",margin:"auto",backgroundSize:"contain"}}):t.default.isValidElement(e)?t.default.cloneElement(e,{style:{width:"38px",height:"38px"}}):t.default.createElement(e,{style:{width:"38px",height:"38px"}})]})}):(0,r.jsx)(f,{$variant:i,children:(0,r.jsx)(u,{size:"64px"})}):(0,r.jsx)(f,{$variant:i,children:e&&(typeof e=="string"?(0,r.jsx)("img",{src:e,alt:"",style:{width:"32px",height:"32px",borderRadius:"6px"}}):t.default.isValidElement(e)?e:t.default.createElement(e,{width:32,height:32,stroke:(()=>{switch(i){case"success":return"var(--privy-color-icon-success)";case"warning":return"var(--privy-color-icon-warning)";case"error":return"var(--privy-color-icon-error)";default:return"var(--privy-color-icon-muted)"}})(),strokeWidth:2}))});var J=n.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(var(--screen-space) / 2);
`,K=n.div`
  && {
    margin: 0;
    width: 100%;
    text-align: center;
    color: var(--privy-color-foreground-2);
    font-size: 13px;
    line-height: 20px;

    & a {
      text-decoration: underline;
    }
  }
`,O=n.div`
  && {
    margin-top: -1rem;
    width: 100%;
    text-align: center;
    color: var(--privy-color-foreground-2);
    font-size: 0.6875rem; /* 11px */
    line-height: 1rem; /* 16px */
  }
`;export{o as a};
