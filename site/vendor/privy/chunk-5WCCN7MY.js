/*privy-bundle*/
import{i as o}from"./chunk-33MCIVAL.js";o();var p=({origin:r,path:h,query:i={},hash:c={}})=>{let f=r.endsWith("/")?r:`${r}/`,a=new URL(h,f);for(let[e,t]of Object.entries(i))t!==void 0&&a.searchParams.set(e,t);let n=Object.entries(c);if(n.length>0){let e=new URLSearchParams;for(let[t,s]of n)s!==void 0&&e.append(t,s);a.hash=e.toString()}return a.href};export{p as a};
