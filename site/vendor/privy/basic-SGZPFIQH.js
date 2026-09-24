/*privy-bundle*/
import{a as di}from"./chunk-ESKH2YGZ.js";import{c as bo,h as yo,i as Qe,j as fe}from"./chunk-REYCQF2U.js";import{a as d,b as g,c as S,d as Co,e as Ut,f as vo}from"./chunk-5MD7EKDW.js";import{A as W,B as F,C as ee,D as f,l as pt,o as u,p as ge,s as Mt,t as xo,u as w,w as E}from"./chunk-J6P7EIVQ.js";import{A as G,B,C as R,D as b,E as Ge,F as q,K as $,P as ae,Q as dt,a as Ne,e as at,p as ct,q as wo,r as x,t as M,u as me,x as ut,z as Dt}from"./chunk-P7O7AZHP.js";import"./chunk-P7MRDD3S.js";import"./chunk-WYQAMW35.js";import"./chunk-RIZDSPQK.js";import"./chunk-36KV4IIR.js";import"./chunk-HIG42SMQ.js";import"./chunk-JTED25HN.js";import"./chunk-OISPUNON.js";import"./chunk-VOARPK66.js";import{b as I,e as ui,i as a}from"./chunk-33MCIVAL.js";var No=I((Sa,Po)=>{a();Po.exports=function(){return typeof Promise=="function"&&Promise.prototype&&Promise.prototype.then}});var we=I(Te=>{a();var jt,bi=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];Te.getSymbolSize=function(e){if(!e)throw new Error('"version" cannot be null or undefined');if(e<1||e>40)throw new Error('"version" should be in range from 1 to 40');return e*4+17};Te.getSymbolTotalCodewords=function(e){return bi[e]};Te.getBCHDigit=function(t){let e=0;for(;t!==0;)e++,t>>>=1;return e};Te.setToSJISFunction=function(e){if(typeof e!="function")throw new Error('"toSJISFunc" is not a valid function.');jt=e};Te.isKanjiModeEnabled=function(){return typeof jt<"u"};Te.toSJIS=function(e){return jt(e)}});var wt=I(Q=>{a();Q.L={bit:1};Q.M={bit:0};Q.Q={bit:3};Q.H={bit:2};function yi(t){if(typeof t!="string")throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return Q.L;case"m":case"medium":return Q.M;case"q":case"quartile":return Q.Q;case"h":case"high":return Q.H;default:throw new Error("Unknown EC Level: "+t)}}Q.isValid=function(e){return e&&typeof e.bit<"u"&&e.bit>=0&&e.bit<4};Q.from=function(e,o){if(Q.isValid(e))return e;try{return yi(e)}catch{return o}}});var Mo=I((La,Do)=>{a();function Oo(){this.buffer=[],this.length=0}Oo.prototype={get:function(t){let e=Math.floor(t/8);return(this.buffer[e]>>>7-t%8&1)===1},put:function(t,e){for(let o=0;o<e;o++)this.putBit((t>>>e-o-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(t){let e=Math.floor(this.length/8);this.buffer.length<=e&&this.buffer.push(0),t&&(this.buffer[e]|=128>>>this.length%8),this.length++}};Do.exports=Oo});var zo=I((Ba,Uo)=>{a();function Xe(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}Xe.prototype.set=function(t,e,o,i){let n=t*this.size+e;this.data[n]=o,i&&(this.reservedBit[n]=!0)};Xe.prototype.get=function(t,e){return this.data[t*this.size+e]};Xe.prototype.xor=function(t,e,o){this.data[t*this.size+e]^=o};Xe.prototype.isReserved=function(t,e){return this.reservedBit[t*this.size+e]};Uo.exports=Xe});var jo=I(bt=>{a();var xi=we().getSymbolSize;bt.getRowColCoords=function(e){if(e===1)return[];let o=Math.floor(e/7)+2,i=xi(e),n=i===145?26:Math.ceil((i-13)/(2*o-2))*2,r=[i-7];for(let s=1;s<o-1;s++)r[s]=r[s-1]-n;return r.push(6),r.reverse()};bt.getPositions=function(e){let o=[],i=bt.getRowColCoords(e),n=i.length;for(let r=0;r<n;r++)for(let s=0;s<n;s++)r===0&&s===0||r===0&&s===n-1||r===n-1&&s===0||o.push([i[r],i[s]]);return o}});var Vo=I(Fo=>{a();var Ci=we().getSymbolSize,qo=7;Fo.getPositions=function(e){let o=Ci(e);return[[0,0],[o-qo,0],[0,o-qo]]}});var Ho=I(L=>{a();L.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var Ae={N1:3,N2:3,N3:40,N4:10};L.isValid=function(e){return e!=null&&e!==""&&!isNaN(e)&&e>=0&&e<=7};L.from=function(e){return L.isValid(e)?parseInt(e,10):void 0};L.getPenaltyN1=function(e){let o=e.size,i=0,n=0,r=0,s=null,l=null;for(let c=0;c<o;c++){n=r=0,s=l=null;for(let m=0;m<o;m++){let C=e.get(c,m);C===s?n++:(n>=5&&(i+=Ae.N1+(n-5)),s=C,n=1),C=e.get(m,c),C===l?r++:(r>=5&&(i+=Ae.N1+(r-5)),l=C,r=1)}n>=5&&(i+=Ae.N1+(n-5)),r>=5&&(i+=Ae.N1+(r-5))}return i};L.getPenaltyN2=function(e){let o=e.size,i=0;for(let n=0;n<o-1;n++)for(let r=0;r<o-1;r++){let s=e.get(n,r)+e.get(n,r+1)+e.get(n+1,r)+e.get(n+1,r+1);(s===4||s===0)&&i++}return i*Ae.N2};L.getPenaltyN3=function(e){let o=e.size,i=0,n=0,r=0;for(let s=0;s<o;s++){n=r=0;for(let l=0;l<o;l++)n=n<<1&2047|e.get(s,l),l>=10&&(n===1488||n===93)&&i++,r=r<<1&2047|e.get(l,s),l>=10&&(r===1488||r===93)&&i++}return i*Ae.N3};L.getPenaltyN4=function(e){let o=0,i=e.data.length;for(let r=0;r<i;r++)o+=e.data[r];return Math.abs(Math.ceil(o*100/i/5)-10)*Ae.N4};function vi(t,e,o){switch(t){case L.Patterns.PATTERN000:return(e+o)%2===0;case L.Patterns.PATTERN001:return e%2===0;case L.Patterns.PATTERN010:return o%3===0;case L.Patterns.PATTERN011:return(e+o)%3===0;case L.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(o/3))%2===0;case L.Patterns.PATTERN101:return e*o%2+e*o%3===0;case L.Patterns.PATTERN110:return(e*o%2+e*o%3)%2===0;case L.Patterns.PATTERN111:return(e*o%3+(e+o)%2)%2===0;default:throw new Error("bad maskPattern:"+t)}}L.applyMask=function(e,o){let i=o.size;for(let n=0;n<i;n++)for(let r=0;r<i;r++)o.isReserved(r,n)||o.xor(r,n,vi(e,r,n))};L.getBestMask=function(e,o){let i=Object.keys(L.Patterns).length,n=0,r=1/0;for(let s=0;s<i;s++){o(s),L.applyMask(s,e);let l=L.getPenaltyN1(e)+L.getPenaltyN2(e)+L.getPenaltyN3(e)+L.getPenaltyN4(e);L.applyMask(s,e),l<r&&(r=l,n=s)}return n}});var Ft=I(qt=>{a();var be=wt(),yt=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],xt=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];qt.getBlocksCount=function(e,o){switch(o){case be.L:return yt[(e-1)*4+0];case be.M:return yt[(e-1)*4+1];case be.Q:return yt[(e-1)*4+2];case be.H:return yt[(e-1)*4+3];default:return}};qt.getTotalCodewordsCount=function(e,o){switch(o){case be.L:return xt[(e-1)*4+0];case be.M:return xt[(e-1)*4+1];case be.Q:return xt[(e-1)*4+2];case be.H:return xt[(e-1)*4+3];default:return}}});var Ko=I(vt=>{a();var Ze=new Uint8Array(512),Ct=new Uint8Array(256);(function(){let e=1;for(let o=0;o<255;o++)Ze[o]=e,Ct[e]=o,e<<=1,e&256&&(e^=285);for(let o=255;o<512;o++)Ze[o]=Ze[o-255]})();vt.log=function(e){if(e<1)throw new Error("log("+e+")");return Ct[e]};vt.exp=function(e){return Ze[e]};vt.mul=function(e,o){return e===0||o===0?0:Ze[Ct[e]+Ct[o]]}});var Go=I(et=>{a();var Vt=Ko();et.mul=function(e,o){let i=new Uint8Array(e.length+o.length-1);for(let n=0;n<e.length;n++)for(let r=0;r<o.length;r++)i[n+r]^=Vt.mul(e[n],o[r]);return i};et.mod=function(e,o){let i=new Uint8Array(e);for(;i.length-o.length>=0;){let n=i[0];for(let s=0;s<o.length;s++)i[s]^=Vt.mul(o[s],n);let r=0;for(;r<i.length&&i[r]===0;)r++;i=i.slice(r)}return i};et.generateECPolynomial=function(e){let o=new Uint8Array([1]);for(let i=0;i<e;i++)o=et.mul(o,new Uint8Array([1,Vt.exp(i)]));return o}});var Jo=I((Ga,Yo)=>{a();var Qo=Go();function Ht(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}Ht.prototype.initialize=function(e){this.degree=e,this.genPoly=Qo.generateECPolynomial(this.degree)};Ht.prototype.encode=function(e){if(!this.genPoly)throw new Error("Encoder not initialized");let o=new Uint8Array(e.length+this.degree);o.set(e);let i=Qo.mod(o,this.genPoly),n=this.degree-i.length;if(n>0){let r=new Uint8Array(this.degree);return r.set(i,n),r}return i};Yo.exports=Ht});var Kt=I(Xo=>{a();Xo.isValid=function(e){return!isNaN(e)&&e>=1&&e<=40}});var Gt=I(de=>{a();var Zo="[0-9]+",$i="[A-Z $%*+\\-./:]+",tt="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";tt=tt.replace(/u/g,"\\u");var Ei="(?:(?![A-Z0-9 $%*+\\-./:]|"+tt+`)(?:.|[\r
]))+`;de.KANJI=new RegExp(tt,"g");de.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g");de.BYTE=new RegExp(Ei,"g");de.NUMERIC=new RegExp(Zo,"g");de.ALPHANUMERIC=new RegExp($i,"g");var Ri=new RegExp("^"+tt+"$"),Si=new RegExp("^"+Zo+"$"),_i=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");de.testKanji=function(e){return Ri.test(e)};de.testNumeric=function(e){return Si.test(e)};de.testAlphanumeric=function(e){return _i.test(e)}});var ye=I(z=>{a();var Ti=Kt(),Qt=Gt();z.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]};z.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]};z.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]};z.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]};z.MIXED={bit:-1};z.getCharCountIndicator=function(e,o){if(!e.ccBits)throw new Error("Invalid mode: "+e);if(!Ti.isValid(o))throw new Error("Invalid version: "+o);return o>=1&&o<10?e.ccBits[0]:o<27?e.ccBits[1]:e.ccBits[2]};z.getBestModeForData=function(e){return Qt.testNumeric(e)?z.NUMERIC:Qt.testAlphanumeric(e)?z.ALPHANUMERIC:Qt.testKanji(e)?z.KANJI:z.BYTE};z.toString=function(e){if(e&&e.id)return e.id;throw new Error("Invalid mode")};z.isValid=function(e){return e&&e.bit&&e.ccBits};function Ai(t){if(typeof t!="string")throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return z.NUMERIC;case"alphanumeric":return z.ALPHANUMERIC;case"kanji":return z.KANJI;case"byte":return z.BYTE;default:throw new Error("Unknown mode: "+t)}}z.from=function(e,o){if(z.isValid(e))return e;try{return Ai(e)}catch{return o}}});var ir=I(Ie=>{a();var $t=we(),Ii=Ft(),er=wt(),xe=ye(),Yt=Kt(),or=7973,tr=$t.getBCHDigit(or);function Wi(t,e,o){for(let i=1;i<=40;i++)if(e<=Ie.getCapacity(i,o,t))return i}function rr(t,e){return xe.getCharCountIndicator(t,e)+4}function Li(t,e){let o=0;return t.forEach(function(i){let n=rr(i.mode,e);o+=n+i.getBitsLength()}),o}function ki(t,e){for(let o=1;o<=40;o++)if(Li(t,o)<=Ie.getCapacity(o,e,xe.MIXED))return o}Ie.from=function(e,o){return Yt.isValid(e)?parseInt(e,10):o};Ie.getCapacity=function(e,o,i){if(!Yt.isValid(e))throw new Error("Invalid QR Code version");typeof i>"u"&&(i=xe.BYTE);let n=$t.getSymbolTotalCodewords(e),r=Ii.getTotalCodewordsCount(e,o),s=(n-r)*8;if(i===xe.MIXED)return s;let l=s-rr(i,e);switch(i){case xe.NUMERIC:return Math.floor(l/10*3);case xe.ALPHANUMERIC:return Math.floor(l/11*2);case xe.KANJI:return Math.floor(l/13);case xe.BYTE:default:return Math.floor(l/8)}};Ie.getBestVersionForData=function(e,o){let i,n=er.from(o,er.M);if(Array.isArray(e)){if(e.length>1)return ki(e,n);if(e.length===0)return 1;i=e[0]}else i=e;return Wi(i.mode,i.getLength(),n)};Ie.getEncodedBits=function(e){if(!Yt.isValid(e)||e<7)throw new Error("Invalid QR Code version");let o=e<<12;for(;$t.getBCHDigit(o)-tr>=0;)o^=or<<$t.getBCHDigit(o)-tr;return e<<12|o}});var ar=I(lr=>{a();var Jt=we(),sr=1335,Bi=21522,nr=Jt.getBCHDigit(sr);lr.getEncodedBits=function(e,o){let i=e.bit<<3|o,n=i<<10;for(;Jt.getBCHDigit(n)-nr>=0;)n^=sr<<Jt.getBCHDigit(n)-nr;return(i<<10|n)^Bi}});var ur=I((sc,cr)=>{a();var Pi=ye();function Ue(t){this.mode=Pi.NUMERIC,this.data=t.toString()}Ue.getBitsLength=function(e){return 10*Math.floor(e/3)+(e%3?e%3*3+1:0)};Ue.prototype.getLength=function(){return this.data.length};Ue.prototype.getBitsLength=function(){return Ue.getBitsLength(this.data.length)};Ue.prototype.write=function(e){let o,i,n;for(o=0;o+3<=this.data.length;o+=3)i=this.data.substr(o,3),n=parseInt(i,10),e.put(n,10);let r=this.data.length-o;r>0&&(i=this.data.substr(o),n=parseInt(i,10),e.put(n,r*3+1))};cr.exports=Ue});var pr=I((ac,dr)=>{a();var Ni=ye(),Xt=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function ze(t){this.mode=Ni.ALPHANUMERIC,this.data=t}ze.getBitsLength=function(e){return 11*Math.floor(e/2)+6*(e%2)};ze.prototype.getLength=function(){return this.data.length};ze.prototype.getBitsLength=function(){return ze.getBitsLength(this.data.length)};ze.prototype.write=function(e){let o;for(o=0;o+2<=this.data.length;o+=2){let i=Xt.indexOf(this.data[o])*45;i+=Xt.indexOf(this.data[o+1]),e.put(i,11)}this.data.length%2&&e.put(Xt.indexOf(this.data[o]),6)};dr.exports=ze});var mr=I((uc,hr)=>{"use strict";a();hr.exports=function(e){for(var o=[],i=e.length,n=0;n<i;n++){var r=e.charCodeAt(n);if(r>=55296&&r<=56319&&i>n+1){var s=e.charCodeAt(n+1);s>=56320&&s<=57343&&(r=(r-55296)*1024+s-56320+65536,n+=1)}if(r<128){o.push(r);continue}if(r<2048){o.push(r>>6|192),o.push(r&63|128);continue}if(r<55296||r>=57344&&r<65536){o.push(r>>12|224),o.push(r>>6&63|128),o.push(r&63|128);continue}if(r>=65536&&r<=1114111){o.push(r>>18|240),o.push(r>>12&63|128),o.push(r>>6&63|128),o.push(r&63|128);continue}o.push(239,191,189)}return new Uint8Array(o).buffer}});var gr=I((pc,fr)=>{a();var Oi=mr(),Di=ye();function je(t){this.mode=Di.BYTE,typeof t=="string"&&(t=Oi(t)),this.data=new Uint8Array(t)}je.getBitsLength=function(e){return e*8};je.prototype.getLength=function(){return this.data.length};je.prototype.getBitsLength=function(){return je.getBitsLength(this.data.length)};je.prototype.write=function(t){for(let e=0,o=this.data.length;e<o;e++)t.put(this.data[e],8)};fr.exports=je});var br=I((mc,wr)=>{a();var Mi=ye(),Ui=we();function qe(t){this.mode=Mi.KANJI,this.data=t}qe.getBitsLength=function(e){return e*13};qe.prototype.getLength=function(){return this.data.length};qe.prototype.getBitsLength=function(){return qe.getBitsLength(this.data.length)};qe.prototype.write=function(t){let e;for(e=0;e<this.data.length;e++){let o=Ui.toSJIS(this.data[e]);if(o>=33088&&o<=40956)o-=33088;else if(o>=57408&&o<=60351)o-=49472;else throw new Error("Invalid SJIS character: "+this.data[e]+`
Make sure your charset is UTF-8`);o=(o>>>8&255)*192+(o&255),t.put(o,13)}};wr.exports=qe});var Sr=I(Fe=>{a();var _=ye(),Cr=ur(),vr=pr(),$r=gr(),Er=br(),ot=Gt(),Et=we(),zi=di();function yr(t){return unescape(encodeURIComponent(t)).length}function rt(t,e,o){let i=[],n;for(;(n=t.exec(o))!==null;)i.push({data:n[0],index:n.index,mode:e,length:n[0].length});return i}function Rr(t){let e=rt(ot.NUMERIC,_.NUMERIC,t),o=rt(ot.ALPHANUMERIC,_.ALPHANUMERIC,t),i,n;return Et.isKanjiModeEnabled()?(i=rt(ot.BYTE,_.BYTE,t),n=rt(ot.KANJI,_.KANJI,t)):(i=rt(ot.BYTE_KANJI,_.BYTE,t),n=[]),e.concat(o,i,n).sort(function(s,l){return s.index-l.index}).map(function(s){return{data:s.data,mode:s.mode,length:s.length}})}function Zt(t,e){switch(e){case _.NUMERIC:return Cr.getBitsLength(t);case _.ALPHANUMERIC:return vr.getBitsLength(t);case _.KANJI:return Er.getBitsLength(t);case _.BYTE:return $r.getBitsLength(t)}}function ji(t){return t.reduce(function(e,o){let i=e.length-1>=0?e[e.length-1]:null;return i&&i.mode===o.mode?(e[e.length-1].data+=o.data,e):(e.push(o),e)},[])}function qi(t){let e=[];for(let o=0;o<t.length;o++){let i=t[o];switch(i.mode){case _.NUMERIC:e.push([i,{data:i.data,mode:_.ALPHANUMERIC,length:i.length},{data:i.data,mode:_.BYTE,length:i.length}]);break;case _.ALPHANUMERIC:e.push([i,{data:i.data,mode:_.BYTE,length:i.length}]);break;case _.KANJI:e.push([i,{data:i.data,mode:_.BYTE,length:yr(i.data)}]);break;case _.BYTE:e.push([{data:i.data,mode:_.BYTE,length:yr(i.data)}])}}return e}function Fi(t,e){let o={},i={start:{}},n=["start"];for(let r=0;r<t.length;r++){let s=t[r],l=[];for(let c=0;c<s.length;c++){let m=s[c],C=""+r+c;l.push(C),o[C]={node:m,lastCount:0},i[C]={};for(let O=0;O<n.length;O++){let T=n[O];o[T]&&o[T].node.mode===m.mode?(i[T][C]=Zt(o[T].lastCount+m.length,m.mode)-Zt(o[T].lastCount,m.mode),o[T].lastCount+=m.length):(o[T]&&(o[T].lastCount=m.length),i[T][C]=Zt(m.length,m.mode)+4+_.getCharCountIndicator(m.mode,e))}}n=l}for(let r=0;r<n.length;r++)i[n[r]].end=0;return{map:i,table:o}}function xr(t,e){let o,i=_.getBestModeForData(t);if(o=_.from(e,i),o!==_.BYTE&&o.bit<i.bit)throw new Error('"'+t+'" cannot be encoded with mode '+_.toString(o)+`.
 Suggested mode is: `+_.toString(i));switch(o===_.KANJI&&!Et.isKanjiModeEnabled()&&(o=_.BYTE),o){case _.NUMERIC:return new Cr(t);case _.ALPHANUMERIC:return new vr(t);case _.KANJI:return new Er(t);case _.BYTE:return new $r(t)}}Fe.fromArray=function(e){return e.reduce(function(o,i){return typeof i=="string"?o.push(xr(i,null)):i.data&&o.push(xr(i.data,i.mode)),o},[])};Fe.fromString=function(e,o){let i=Rr(e,Et.isKanjiModeEnabled()),n=qi(i),r=Fi(n,o),s=zi.find_path(r.map,"start","end"),l=[];for(let c=1;c<s.length-1;c++)l.push(r.table[s[c]].node);return Fe.fromArray(ji(l))};Fe.rawSplit=function(e){return Fe.fromArray(Rr(e,Et.isKanjiModeEnabled()))}});var Tr=I(_r=>{a();var St=we(),eo=wt(),Vi=Mo(),Hi=zo(),Ki=jo(),Gi=Vo(),ro=Ho(),io=Ft(),Qi=Jo(),Rt=ir(),Yi=ar(),Ji=ye(),to=Sr();function Xi(t,e){let o=t.size,i=Gi.getPositions(e);for(let n=0;n<i.length;n++){let r=i[n][0],s=i[n][1];for(let l=-1;l<=7;l++)if(!(r+l<=-1||o<=r+l))for(let c=-1;c<=7;c++)s+c<=-1||o<=s+c||(l>=0&&l<=6&&(c===0||c===6)||c>=0&&c<=6&&(l===0||l===6)||l>=2&&l<=4&&c>=2&&c<=4?t.set(r+l,s+c,!0,!0):t.set(r+l,s+c,!1,!0))}}function Zi(t){let e=t.size;for(let o=8;o<e-8;o++){let i=o%2===0;t.set(o,6,i,!0),t.set(6,o,i,!0)}}function en(t,e){let o=Ki.getPositions(e);for(let i=0;i<o.length;i++){let n=o[i][0],r=o[i][1];for(let s=-2;s<=2;s++)for(let l=-2;l<=2;l++)s===-2||s===2||l===-2||l===2||s===0&&l===0?t.set(n+s,r+l,!0,!0):t.set(n+s,r+l,!1,!0)}}function tn(t,e){let o=t.size,i=Rt.getEncodedBits(e),n,r,s;for(let l=0;l<18;l++)n=Math.floor(l/3),r=l%3+o-8-3,s=(i>>l&1)===1,t.set(n,r,s,!0),t.set(r,n,s,!0)}function oo(t,e,o){let i=t.size,n=Yi.getEncodedBits(e,o),r,s;for(r=0;r<15;r++)s=(n>>r&1)===1,r<6?t.set(r,8,s,!0):r<8?t.set(r+1,8,s,!0):t.set(i-15+r,8,s,!0),r<8?t.set(8,i-r-1,s,!0):r<9?t.set(8,15-r-1+1,s,!0):t.set(8,15-r-1,s,!0);t.set(i-8,8,1,!0)}function on(t,e){let o=t.size,i=-1,n=o-1,r=7,s=0;for(let l=o-1;l>0;l-=2)for(l===6&&l--;;){for(let c=0;c<2;c++)if(!t.isReserved(n,l-c)){let m=!1;s<e.length&&(m=(e[s]>>>r&1)===1),t.set(n,l-c,m),r--,r===-1&&(s++,r=7)}if(n+=i,n<0||o<=n){n-=i,i=-i;break}}}function rn(t,e,o){let i=new Vi;o.forEach(function(c){i.put(c.mode.bit,4),i.put(c.getLength(),Ji.getCharCountIndicator(c.mode,t)),c.write(i)});let n=St.getSymbolTotalCodewords(t),r=io.getTotalCodewordsCount(t,e),s=(n-r)*8;for(i.getLengthInBits()+4<=s&&i.put(0,4);i.getLengthInBits()%8!==0;)i.putBit(0);let l=(s-i.getLengthInBits())/8;for(let c=0;c<l;c++)i.put(c%2?17:236,8);return nn(i,t,e)}function nn(t,e,o){let i=St.getSymbolTotalCodewords(e),n=io.getTotalCodewordsCount(e,o),r=i-n,s=io.getBlocksCount(e,o),l=i%s,c=s-l,m=Math.floor(i/s),C=Math.floor(r/s),O=C+1,T=m-C,V=new Qi(T),P=0,v=new Array(s),y=new Array(s),k=0,A=new Uint8Array(t.buffer);for(let Pe=0;Pe<s;Pe++){let Ot=Pe<c?C:O;v[Pe]=A.slice(P,P+Ot),y[Pe]=V.encode(v[Pe]),P+=Ot,k=Math.max(k,Ot)}let j=new Uint8Array(i),D=0,U,le;for(U=0;U<k;U++)for(le=0;le<s;le++)U<v[le].length&&(j[D++]=v[le][U]);for(U=0;U<T;U++)for(le=0;le<s;le++)j[D++]=y[le][U];return j}function sn(t,e,o,i){let n;if(Array.isArray(t))n=to.fromArray(t);else if(typeof t=="string"){let m=e;if(!m){let C=to.rawSplit(t);m=Rt.getBestVersionForData(C,o)}n=to.fromString(t,m||40)}else throw new Error("Invalid data");let r=Rt.getBestVersionForData(n,o);if(!r)throw new Error("The amount of data is too big to be stored in a QR Code");if(!e)e=r;else if(e<r)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+r+`.
`);let s=rn(e,o,n),l=St.getSymbolSize(e),c=new Hi(l);return Xi(c,e),Zi(c),en(c,e),oo(c,o,0),e>=7&&tn(c,e),on(c,s),isNaN(i)&&(i=ro.getBestMask(c,oo.bind(null,c,o))),ro.applyMask(i,c),oo(c,o,i),{modules:c,version:e,errorCorrectionLevel:o,maskPattern:i,segments:n}}_r.create=function(e,o){if(typeof e>"u"||e==="")throw new Error("No input text");let i=eo.M,n,r;return typeof o<"u"&&(i=eo.from(o.errorCorrectionLevel,eo.M),n=Rt.from(o.version),r=ro.from(o.maskPattern),o.toSJISFunc&&St.setToSJISFunction(o.toSJISFunc)),sn(e,n,i,r)}});var no=I(We=>{a();function Ar(t){if(typeof t=="number"&&(t=t.toString()),typeof t!="string")throw new Error("Color should be defined as hex string");let e=t.slice().replace("#","").split("");if(e.length<3||e.length===5||e.length>8)throw new Error("Invalid hex color: "+t);(e.length===3||e.length===4)&&(e=Array.prototype.concat.apply([],e.map(function(i){return[i,i]}))),e.length===6&&e.push("F","F");let o=parseInt(e.join(""),16);return{r:o>>24&255,g:o>>16&255,b:o>>8&255,a:o&255,hex:"#"+e.slice(0,6).join("")}}We.getOptions=function(e){e||(e={}),e.color||(e.color={});let o=typeof e.margin>"u"||e.margin===null||e.margin<0?4:e.margin,i=e.width&&e.width>=21?e.width:void 0,n=e.scale||4;return{width:i,scale:i?4:n,margin:o,color:{dark:Ar(e.color.dark||"#000000ff"),light:Ar(e.color.light||"#ffffffff")},type:e.type,rendererOpts:e.rendererOpts||{}}};We.getScale=function(e,o){return o.width&&o.width>=e+o.margin*2?o.width/(e+o.margin*2):o.scale};We.getImageWidth=function(e,o){let i=We.getScale(e,o);return Math.floor((e+o.margin*2)*i)};We.qrToImageData=function(e,o,i){let n=o.modules.size,r=o.modules.data,s=We.getScale(n,i),l=Math.floor((n+i.margin*2)*s),c=i.margin*s,m=[i.color.light,i.color.dark];for(let C=0;C<l;C++)for(let O=0;O<l;O++){let T=(C*l+O)*4,V=i.color.light;if(C>=c&&O>=c&&C<l-c&&O<l-c){let P=Math.floor((C-c)/s),v=Math.floor((O-c)/s);V=m[r[P*n+v]?1:0]}e[T++]=V.r,e[T++]=V.g,e[T++]=V.b,e[T]=V.a}}});var Ir=I(_t=>{a();var so=no();function ln(t,e,o){t.clearRect(0,0,e.width,e.height),e.style||(e.style={}),e.height=o,e.width=o,e.style.height=o+"px",e.style.width=o+"px"}function an(){try{return document.createElement("canvas")}catch{throw new Error("You need to specify a canvas element")}}_t.render=function(e,o,i){let n=i,r=o;typeof n>"u"&&(!o||!o.getContext)&&(n=o,o=void 0),o||(r=an()),n=so.getOptions(n);let s=so.getImageWidth(e.modules.size,n),l=r.getContext("2d"),c=l.createImageData(s,s);return so.qrToImageData(c.data,e,n),ln(l,r,s),l.putImageData(c,0,0),r};_t.renderToDataURL=function(e,o,i){let n=i;typeof n>"u"&&(!o||!o.getContext)&&(n=o,o=void 0),n||(n={});let r=_t.render(e,o,n),s=n.type||"image/png",l=n.rendererOpts||{};return r.toDataURL(s,l.quality)}});var kr=I(Lr=>{a();var cn=no();function Wr(t,e){let o=t.a/255,i=e+'="'+t.hex+'"';return o<1?i+" "+e+'-opacity="'+o.toFixed(2).slice(1)+'"':i}function lo(t,e,o){let i=t+e;return typeof o<"u"&&(i+=" "+o),i}function un(t,e,o){let i="",n=0,r=!1,s=0;for(let l=0;l<t.length;l++){let c=Math.floor(l%e),m=Math.floor(l/e);!c&&!r&&(r=!0),t[l]?(s++,l>0&&c>0&&t[l-1]||(i+=r?lo("M",c+o,.5+m+o):lo("m",n,0),n=0,r=!1),c+1<e&&t[l+1]||(i+=lo("h",s),s=0)):n++}return i}Lr.render=function(e,o,i){let n=cn.getOptions(o),r=e.modules.size,s=e.modules.data,l=r+n.margin*2,c=n.color.light.a?"<path "+Wr(n.color.light,"fill")+' d="M0 0h'+l+"v"+l+'H0z"/>':"",m="<path "+Wr(n.color.dark,"stroke")+' d="'+un(s,r,n.margin)+'"/>',C='viewBox="0 0 '+l+" "+l+'"',T='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+C+' shape-rendering="crispEdges">'+c+m+`</svg>
`;return typeof i=="function"&&i(null,T),T}});var Pr=I(it=>{a();var dn=No(),ao=Tr(),Br=Ir(),pn=kr();function co(t,e,o,i,n){let r=[].slice.call(arguments,1),s=r.length,l=typeof r[s-1]=="function";if(!l&&!dn())throw new Error("Callback required as last argument");if(l){if(s<2)throw new Error("Too few arguments provided");s===2?(n=o,o=e,e=i=void 0):s===3&&(e.getContext&&typeof n>"u"?(n=i,i=void 0):(n=i,i=o,o=e,e=void 0))}else{if(s<1)throw new Error("Too few arguments provided");return s===1?(o=e,e=i=void 0):s===2&&!e.getContext&&(i=o,o=e,e=void 0),new Promise(function(c,m){try{let C=ao.create(o,i);c(t(C,e,i))}catch(C){m(C)}})}try{let c=ao.create(o,i);n(null,t(c,e,i))}catch(c){n(c)}}it.create=ao.create;it.toCanvas=co.bind(null,Br.render);it.toDataURL=co.bind(null,Br.renderToDataURL);it.toString=co.bind(null,function(t,e,o){return pn.render(t,o)})});a();a();a();var Oe=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},$e=class extends w{constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=q.state.connectors,this.count=R.state.count,this.filteredCount=R.state.filteredWallets.length,this.isFetchingRecommendedWallets=R.state.isFetchingRecommendedWallets,this.unsubscribe.push(q.subscribeKey("connectors",e=>this.connectors=e),R.subscribeKey("count",e=>this.count=e),R.subscribeKey("filteredWallets",e=>this.filteredCount=e.length),R.subscribeKey("isFetchingRecommendedWallets",e=>this.isFetchingRecommendedWallets=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){let e=this.connectors.find(m=>m.id==="walletConnect"),{allWallets:o}=M.state;if(!e||o==="HIDE"||o==="ONLY_MOBILE"&&!x.isMobile())return null;let i=R.state.featured.length,n=this.count+i,r=n<10?n:Math.floor(n/10)*10,s=this.filteredCount>0?this.filteredCount:r,l=`${s}`;this.filteredCount>0?l=`${this.filteredCount}`:s<n&&(l=`${s}+`);let c=$.hasAnyConnection(Ne.CONNECTOR_ID.WALLET_CONNECT);return u`
      <wui-list-wallet
        name="Search Wallet"
        walletIcon="search"
        showAllWallets
        @click=${this.onAllWallets.bind(this)}
        tagLabel=${l}
        tagVariant="info"
        data-testid="all-wallets"
        tabIdx=${S(this.tabIdx)}
        .loading=${this.isFetchingRecommendedWallets}
        ?disabled=${c}
        size="sm"
      ></wui-list-wallet>
    `}onAllWallets(){B.sendEvent({type:"track",event:"CLICK_ALL_WALLETS"}),b.push("AllWallets",{redirectView:b.state.data?.redirectView})}};Oe([d()],$e.prototype,"tabIdx",void 0);Oe([g()],$e.prototype,"connectors",void 0);Oe([g()],$e.prototype,"count",void 0);Oe([g()],$e.prototype,"filteredCount",void 0);Oe([g()],$e.prototype,"isFetchingRecommendedWallets",void 0);$e=Oe([f("w3m-all-wallets-widget")],$e);a();a();var $o=E`
  :host {
    margin-top: ${({spacing:t})=>t[1]};
  }
  wui-separator {
    margin: ${({spacing:t})=>t[3]} calc(${({spacing:t})=>t[3]} * -1)
      ${({spacing:t})=>t[2]} calc(${({spacing:t})=>t[3]} * -1);
    width: calc(100% + ${({spacing:t})=>t[3]} * 2);
  }
`;var ce=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},te=class extends w{constructor(){super(),this.unsubscribe=[],this.connectors=q.state.connectors,this.recommended=R.state.recommended,this.featured=R.state.featured,this.explorerWallets=R.state.explorerWallets,this.connections=$.state.connections,this.connectorImages=Dt.state.connectorImages,this.loadingTelegram=!1,this.unsubscribe.push(q.subscribeKey("connectors",e=>this.connectors=e),$.subscribeKey("connections",e=>this.connections=e),Dt.subscribeKey("connectorImages",e=>this.connectorImages=e),R.subscribeKey("recommended",e=>this.recommended=e),R.subscribeKey("featured",e=>this.featured=e),R.subscribeKey("explorerFilteredWallets",e=>{this.explorerWallets=e?.length?e:R.state.explorerWallets}),R.subscribeKey("explorerWallets",e=>{this.explorerWallets?.length||(this.explorerWallets=e)})),x.isTelegram()&&x.isIos()&&(this.loadingTelegram=!$.state.wcUri,this.unsubscribe.push($.subscribeKey("wcUri",e=>this.loadingTelegram=!e)))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return u`
      <wui-flex flexDirection="column" gap="2"> ${this.connectorListTemplate()} </wui-flex>
    `}mapConnectorsToExplorerWallets(e,o){return e.map(i=>{if(i.type==="MULTI_CHAIN"&&i.connectors){let r=i.connectors.map(m=>m.id),s=i.connectors.map(m=>m.name),l=i.connectors.map(m=>m.info?.rdns),c=o?.find(m=>r.includes(m.id)||s.includes(m.name)||m.rdns&&(l.includes(m.rdns)||r.includes(m.rdns)));return i.explorerWallet=c??i.explorerWallet,i}let n=o?.find(r=>r.id===i.id||r.rdns===i.info?.rdns||r.name===i.name);return i.explorerWallet=n??i.explorerWallet,i})}processConnectorsByType(e,o=!0){let i=fe.sortConnectorsByExplorerWallet([...e]);return o?i.filter(fe.showConnector):i}connectorListTemplate(){let e=this.mapConnectorsToExplorerWallets(this.connectors,this.explorerWallets??[]),o=fe.getConnectorsByType(e,this.recommended,this.featured),i=this.processConnectorsByType(o.announced.filter(v=>v.id!=="walletConnect")),n=this.processConnectorsByType(o.injected),r=this.processConnectorsByType(o.multiChain.filter(v=>v.name!=="WalletConnect"),!1),s=o.custom,l=o.recent,c=this.processConnectorsByType(o.external.filter(v=>v.id!==Ne.CONNECTOR_ID.COINBASE_SDK)),m=o.recommended,C=o.featured,O=fe.getConnectorTypeOrder({custom:s,recent:l,announced:i,injected:n,multiChain:r,recommended:m,featured:C,external:c}),T=this.connectors.find(v=>v.id==="walletConnect"),V=x.isMobile(),P=[];for(let v of O)switch(v){case"walletConnect":{!V&&T&&P.push({kind:"connector",subtype:"walletConnect",connector:T});break}case"recent":{fe.getFilteredRecentWallets().forEach(k=>P.push({kind:"wallet",subtype:"recent",wallet:k}));break}case"injected":{r.forEach(y=>P.push({kind:"connector",subtype:"multiChain",connector:y})),i.forEach(y=>P.push({kind:"connector",subtype:"announced",connector:y})),n.forEach(y=>P.push({kind:"connector",subtype:"injected",connector:y}));break}case"featured":{C.forEach(y=>P.push({kind:"wallet",subtype:"featured",wallet:y}));break}case"custom":{fe.getFilteredCustomWallets(s??[]).forEach(k=>P.push({kind:"wallet",subtype:"custom",wallet:k}));break}case"external":{c.forEach(y=>P.push({kind:"connector",subtype:"external",connector:y}));break}case"recommended":{fe.getCappedRecommendedWallets(m).forEach(k=>P.push({kind:"wallet",subtype:"recommended",wallet:k}));break}default:console.warn(`Unknown connector type: ${v}`)}return P.map((v,y)=>v.kind==="connector"?this.renderConnector(v,y):this.renderWallet(v,y))}renderConnector(e,o){let i=e.connector,n=G.getConnectorImage(i)||this.connectorImages[i?.imageId??""],s=(this.connections.get(i.chain)??[]).some(O=>bo.isLowerCaseMatch(O.connectorId,i.id)),l,c;e.subtype==="multiChain"?(l="multichain",c="info"):e.subtype==="walletConnect"?(l="qr code",c="accent"):e.subtype==="injected"||e.subtype==="announced"?(l=s?"connected":"installed",c=s?"info":"success"):(l=void 0,c=void 0);let m=$.hasAnyConnection(Ne.CONNECTOR_ID.WALLET_CONNECT),C=e.subtype==="walletConnect"||e.subtype==="external"?m:!1;return u`
      <w3m-list-wallet
        displayIndex=${o}
        imageSrc=${S(n)}
        .installed=${!0}
        name=${i.name??"Unknown"}
        .tagVariant=${c}
        tagLabel=${S(l)}
        data-testid=${`wallet-selector-${i.id.toLowerCase()}`}
        size="sm"
        @click=${()=>this.onClickConnector(e)}
        tabIdx=${S(this.tabIdx)}
        ?disabled=${C}
        rdnsId=${S(i.explorerWallet?.rdns||void 0)}
        walletRank=${S(i.explorerWallet?.order)}
      >
      </w3m-list-wallet>
    `}onClickConnector(e){let o=b.state.data?.redirectView;if(e.subtype==="walletConnect"){q.setActiveConnector(e.connector),x.isMobile()?b.push("AllWallets"):b.push("ConnectingWalletConnect",{redirectView:o});return}if(e.subtype==="multiChain"){q.setActiveConnector(e.connector),b.push("ConnectingMultiChain",{redirectView:o});return}if(e.subtype==="injected"){q.setActiveConnector(e.connector),b.push("ConnectingExternal",{connector:e.connector,redirectView:o,wallet:e.connector.explorerWallet});return}if(e.subtype==="announced"){if(e.connector.id==="walletConnect"){x.isMobile()?b.push("AllWallets"):b.push("ConnectingWalletConnect",{redirectView:o});return}b.push("ConnectingExternal",{connector:e.connector,redirectView:o,wallet:e.connector.explorerWallet});return}b.push("ConnectingExternal",{connector:e.connector,redirectView:o})}renderWallet(e,o){let i=e.wallet,n=G.getWalletImage(i),s=$.hasAnyConnection(Ne.CONNECTOR_ID.WALLET_CONNECT),l=this.loadingTelegram,c=e.subtype==="recent"?"recent":void 0,m=e.subtype==="recent"?"info":void 0;return u`
      <w3m-list-wallet
        displayIndex=${o}
        imageSrc=${S(n)}
        name=${i.name??"Unknown"}
        @click=${()=>this.onClickWallet(e)}
        size="sm"
        data-testid=${`wallet-selector-${i.id}`}
        tabIdx=${S(this.tabIdx)}
        ?loading=${l}
        ?disabled=${s}
        rdnsId=${S(i.rdns||void 0)}
        walletRank=${S(i.order)}
        tagLabel=${S(c)}
        .tagVariant=${m}
      >
      </w3m-list-wallet>
    `}onClickWallet(e){let o=b.state.data?.redirectView;if(e.subtype==="featured"){q.selectWalletConnector(e.wallet);return}if(e.subtype==="recent"){if(this.loadingTelegram)return;q.selectWalletConnector(e.wallet);return}if(e.subtype==="custom"){if(this.loadingTelegram)return;b.push("ConnectingWalletConnect",{wallet:e.wallet,redirectView:o});return}if(this.loadingTelegram)return;let i=q.getConnector({id:e.wallet.id,rdns:e.wallet.rdns});i?b.push("ConnectingExternal",{connector:i,redirectView:o}):b.push("ConnectingWalletConnect",{wallet:e.wallet,redirectView:o})}};te.styles=$o;ce([d({type:Number})],te.prototype,"tabIdx",void 0);ce([g()],te.prototype,"connectors",void 0);ce([g()],te.prototype,"recommended",void 0);ce([g()],te.prototype,"featured",void 0);ce([g()],te.prototype,"explorerWallets",void 0);ce([g()],te.prototype,"connections",void 0);ce([g()],te.prototype,"connectorImages",void 0);ce([g()],te.prototype,"loadingTelegram",void 0);te=ce([f("w3m-connector-list")],te);a();a();a();a();a();a();var Eo=E`
  :host {
    flex: 1;
    height: 100%;
  }

  button {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: ${({spacing:t})=>t[1]} ${({spacing:t})=>t[2]};
    column-gap: ${({spacing:t})=>t[1]};
    color: ${({tokens:t})=>t.theme.textSecondary};
    border-radius: ${({borderRadius:t})=>t[20]};
    background-color: transparent;
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color;
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  button[data-active='true'] {
    color: ${({tokens:t})=>t.theme.textPrimary};
    background-color: ${({tokens:t})=>t.theme.foregroundTertiary};
  }

  button:hover:enabled:not([data-active='true']),
  button:active:enabled:not([data-active='true']) {
    wui-text,
    wui-icon {
      color: ${({tokens:t})=>t.theme.textPrimary};
    }
  }
`;var Ye=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},pi={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},hi={lg:"md",md:"sm",sm:"sm"},Ee=class extends w{constructor(){super(...arguments),this.icon="mobile",this.size="md",this.label="",this.active=!1}render(){return u`
      <button data-active=${this.active}>
        ${this.icon?u`<wui-icon size=${hi[this.size]} name=${this.icon}></wui-icon>`:""}
        <wui-text variant=${pi[this.size]}> ${this.label} </wui-text>
      </button>
    `}};Ee.styles=[W,F,Eo];Ye([d()],Ee.prototype,"icon",void 0);Ye([d()],Ee.prototype,"size",void 0);Ye([d()],Ee.prototype,"label",void 0);Ye([d({type:Boolean})],Ee.prototype,"active",void 0);Ee=Ye([f("wui-tab-item")],Ee);a();var Ro=E`
  :host {
    display: inline-flex;
    align-items: center;
    background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    border-radius: ${({borderRadius:t})=>t[32]};
    padding: ${({spacing:t})=>t["01"]};
    box-sizing: border-box;
  }

  :host([data-size='sm']) {
    height: 26px;
  }

  :host([data-size='md']) {
    height: 36px;
  }
`;var Je=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Re=class extends w{constructor(){super(...arguments),this.tabs=[],this.onTabChange=()=>null,this.size="md",this.activeTab=0}render(){return this.dataset.size=this.size,this.tabs.map((e,o)=>{let i=o===this.activeTab;return u`
        <wui-tab-item
          @click=${()=>this.onTabClick(o)}
          icon=${e.icon}
          size=${this.size}
          label=${e.label}
          ?active=${i}
          data-active=${i}
          data-testid="tab-${e.label?.toLowerCase()}"
        ></wui-tab-item>
      `})}onTabClick(e){this.activeTab=e,this.onTabChange(e)}};Re.styles=[W,F,Ro];Je([d({type:Array})],Re.prototype,"tabs",void 0);Je([d()],Re.prototype,"onTabChange",void 0);Je([d()],Re.prototype,"size",void 0);Je([g()],Re.prototype,"activeTab",void 0);Re=Je([f("wui-tabs")],Re);var zt=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},ht=class extends w{constructor(){super(...arguments),this.platformTabs=[],this.unsubscribe=[],this.platforms=[],this.onSelectPlatfrom=void 0}disconnectCallback(){this.unsubscribe.forEach(e=>e())}render(){let e=this.generateTabs();return u`
      <wui-flex justifyContent="center" .padding=${["0","0","4","0"]}>
        <wui-tabs .tabs=${e} .onTabChange=${this.onTabChange.bind(this)}></wui-tabs>
      </wui-flex>
    `}generateTabs(){let e=this.platforms.map(o=>o==="browser"?{label:"Browser",icon:"extension",platform:"browser"}:o==="mobile"?{label:"Mobile",icon:"mobile",platform:"mobile"}:o==="qrcode"?{label:"Mobile",icon:"mobile",platform:"qrcode"}:o==="web"?{label:"Webapp",icon:"browser",platform:"web"}:o==="desktop"?{label:"Desktop",icon:"desktop",platform:"desktop"}:{label:"Browser",icon:"extension",platform:"unsupported"});return this.platformTabs=e.map(({platform:o})=>o),e}onTabChange(e){let o=this.platformTabs[e];o&&this.onSelectPlatfrom?.(o)}};zt([d({type:Array})],ht.prototype,"platforms",void 0);zt([d()],ht.prototype,"onSelectPlatfrom",void 0);ht=zt([f("w3m-connecting-header")],ht);a();a();a();a();a();var So=E`
  :host {
    width: var(--local-width);
  }

  button {
    width: var(--local-width);
    white-space: nowrap;
    column-gap: ${({spacing:t})=>t[2]};
    transition:
      scale ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-1"]},
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      border-radius ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-1"]};
    will-change: scale, background-color, border-radius;
    cursor: pointer;
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='sm'] {
    border-radius: ${({borderRadius:t})=>t[2]};
    padding: 0 ${({spacing:t})=>t[2]};
    height: 28px;
  }

  button[data-size='md'] {
    border-radius: ${({borderRadius:t})=>t[3]};
    padding: 0 ${({spacing:t})=>t[4]};
    height: 38px;
  }

  button[data-size='lg'] {
    border-radius: ${({borderRadius:t})=>t[4]};
    padding: 0 ${({spacing:t})=>t[5]};
    height: 48px;
  }

  /* -- Variants --------------------------------------------------------- */
  button[data-variant='accent-primary'] {
    background-color: ${({tokens:t})=>t.core.backgroundAccentPrimary};
    color: ${({tokens:t})=>t.theme.textInvert};
  }

  button[data-variant='accent-secondary'] {
    background-color: ${({tokens:t})=>t.core.foregroundAccent010};
    color: ${({tokens:t})=>t.core.textAccentPrimary};
  }

  button[data-variant='neutral-primary'] {
    background-color: ${({tokens:t})=>t.theme.backgroundInvert};
    color: ${({tokens:t})=>t.theme.textInvert};
  }

  button[data-variant='neutral-secondary'] {
    background-color: transparent;
    border: 1px solid ${({tokens:t})=>t.theme.borderSecondary};
    color: ${({tokens:t})=>t.theme.textPrimary};
  }

  button[data-variant='neutral-tertiary'] {
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    color: ${({tokens:t})=>t.theme.textPrimary};
  }

  button[data-variant='error-primary'] {
    background-color: ${({tokens:t})=>t.core.textError};
    color: ${({tokens:t})=>t.theme.textInvert};
  }

  button[data-variant='error-secondary'] {
    background-color: ${({tokens:t})=>t.core.backgroundError};
    color: ${({tokens:t})=>t.core.textError};
  }

  button[data-variant='shade'] {
    background: var(--wui-color-gray-glass-002);
    color: var(--wui-color-fg-200);
    border: none;
    box-shadow: inset 0 0 0 1px var(--wui-color-gray-glass-005);
  }

  /* -- Focus states --------------------------------------------------- */
  button[data-size='sm']:focus-visible:enabled {
    border-radius: 28px;
  }

  button[data-size='md']:focus-visible:enabled {
    border-radius: 38px;
  }

  button[data-size='lg']:focus-visible:enabled {
    border-radius: 48px;
  }
  button[data-variant='shade']:focus-visible:enabled {
    background: var(--wui-color-gray-glass-005);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-gray-glass-010),
      0 0 0 4px var(--wui-color-gray-glass-002);
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) {
    button[data-size='sm']:hover:enabled {
      border-radius: 28px;
    }

    button[data-size='md']:hover:enabled {
      border-radius: 38px;
    }

    button[data-size='lg']:hover:enabled {
      border-radius: 48px;
    }

    button[data-variant='shade']:hover:enabled {
      background: var(--wui-color-gray-glass-002);
    }

    button[data-variant='shade']:active:enabled {
      background: var(--wui-color-gray-glass-005);
    }
  }

  button[data-size='sm']:active:enabled {
    border-radius: 28px;
  }

  button[data-size='md']:active:enabled {
    border-radius: 38px;
  }

  button[data-size='lg']:active:enabled {
    border-radius: 48px;
  }

  /* -- Disabled states --------------------------------------------------- */
  button:disabled {
    opacity: 0.3;
  }
`;var Se=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},mi={lg:"lg-regular-mono",md:"md-regular-mono",sm:"sm-regular-mono"},fi={lg:"md",md:"md",sm:"sm"},ue=class extends w{constructor(){super(...arguments),this.size="lg",this.disabled=!1,this.fullWidth=!1,this.loading=!1,this.variant="accent-primary"}render(){this.style.cssText=`
    --local-width: ${this.fullWidth?"100%":"auto"};
     `;let e=this.textVariant??mi[this.size];return u`
      <button data-variant=${this.variant} data-size=${this.size} ?disabled=${this.disabled}>
        ${this.loadingTemplate()}
        <slot name="iconLeft"></slot>
        <wui-text variant=${e} color="inherit">
          <slot></slot>
        </wui-text>
        <slot name="iconRight"></slot>
      </button>
    `}loadingTemplate(){if(this.loading){let e=fi[this.size],o=this.variant==="neutral-primary"||this.variant==="accent-primary"?"invert":"primary";return u`<wui-loading-spinner color=${o} size=${e}></wui-loading-spinner>`}return null}};ue.styles=[W,F,So];Se([d()],ue.prototype,"size",void 0);Se([d({type:Boolean})],ue.prototype,"disabled",void 0);Se([d({type:Boolean})],ue.prototype,"fullWidth",void 0);Se([d({type:Boolean})],ue.prototype,"loading",void 0);Se([d()],ue.prototype,"variant",void 0);Se([d()],ue.prototype,"textVariant",void 0);ue=Se([f("wui-button")],ue);a();a();a();a();var _o=E`
  :host {
    display: block;
    width: 100px;
    height: 100px;
  }

  svg {
    width: 100px;
    height: 100px;
  }

  rect {
    fill: none;
    stroke: ${t=>t.colors.accent100};
    stroke-width: 3px;
    stroke-linecap: round;
    animation: dash 1s linear infinite;
  }

  @keyframes dash {
    to {
      stroke-dashoffset: 0px;
    }
  }
`;var To=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},mt=class extends w{constructor(){super(...arguments),this.radius=36}render(){return this.svgLoaderTemplate()}svgLoaderTemplate(){let e=this.radius>50?50:this.radius,i=36-e,n=116+i,r=245+i,s=360+i*1.75;return u`
      <svg viewBox="0 0 110 110" width="110" height="110">
        <rect
          x="2"
          y="2"
          width="106"
          height="106"
          rx=${e}
          stroke-dasharray="${n} ${r}"
          stroke-dashoffset=${s}
        />
      </svg>
    `}};mt.styles=[W,_o];To([d({type:Number})],mt.prototype,"radius",void 0);mt=To([f("wui-loading-thumbnail")],mt);a();a();a();a();a();var Ao=E`
  wui-flex {
    width: 100%;
    height: 52px;
    box-sizing: border-box;
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[5]};
    padding-left: ${({spacing:t})=>t[3]};
    padding-right: ${({spacing:t})=>t[3]};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${({spacing:t})=>t[6]};
  }

  wui-text {
    color: ${({tokens:t})=>t.theme.textSecondary};
  }

  wui-icon {
    width: 12px;
    height: 12px;
  }
`;var ft=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},De=class extends w{constructor(){super(...arguments),this.disabled=!1,this.label="",this.buttonLabel=""}render(){return u`
      <wui-flex justifyContent="space-between" alignItems="center">
        <wui-text variant="lg-regular" color="inherit">${this.label}</wui-text>
        <wui-button variant="accent-secondary" size="sm">
          ${this.buttonLabel}
          <wui-icon name="chevronRight" color="inherit" size="inherit" slot="iconRight"></wui-icon>
        </wui-button>
      </wui-flex>
    `}};De.styles=[W,F,Ao];ft([d({type:Boolean})],De.prototype,"disabled",void 0);ft([d()],De.prototype,"label",void 0);ft([d()],De.prototype,"buttonLabel",void 0);De=ft([f("wui-cta-button")],De);a();var Io=E`
  :host {
    display: block;
    padding: 0 ${({spacing:t})=>t[5]} ${({spacing:t})=>t[5]};
  }
`;var Wo=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},gt=class extends w{constructor(){super(...arguments),this.wallet=void 0}render(){if(!this.wallet)return this.style.display="none",null;let{name:e,app_store:o,play_store:i,chrome_store:n,homepage:r}=this.wallet,s=x.isMobile(),l=x.isIos(),c=x.isAndroid(),m=[o,i,r,n].filter(Boolean).length>1,C=ee.getTruncateString({string:e,charsStart:12,charsEnd:0,truncate:"end"});return m&&!s?u`
        <wui-cta-button
          label=${`Don't have ${C}?`}
          buttonLabel="Get"
          @click=${()=>b.push("Downloads",{wallet:this.wallet})}
        ></wui-cta-button>
      `:!m&&r?u`
        <wui-cta-button
          label=${`Don't have ${C}?`}
          buttonLabel="Get"
          @click=${this.onHomePage.bind(this)}
        ></wui-cta-button>
      `:o&&l?u`
        <wui-cta-button
          label=${`Don't have ${C}?`}
          buttonLabel="Get"
          @click=${this.onAppStore.bind(this)}
        ></wui-cta-button>
      `:i&&c?u`
        <wui-cta-button
          label=${`Don't have ${C}?`}
          buttonLabel="Get"
          @click=${this.onPlayStore.bind(this)}
        ></wui-cta-button>
      `:(this.style.display="none",null)}onAppStore(){this.wallet?.app_store&&x.openHref(this.wallet.app_store,"_blank")}onPlayStore(){this.wallet?.play_store&&x.openHref(this.wallet.play_store,"_blank")}onHomePage(){this.wallet?.homepage&&x.openHref(this.wallet.homepage,"_blank")}};gt.styles=[Io];Wo([d({type:Object})],gt.prototype,"wallet",void 0);gt=Wo([f("w3m-mobile-download-links")],gt);a();var Lo=E`
  @keyframes shake {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
    100% {
      transform: translateX(0);
    }
  }

  wui-flex:first-child:not(:only-child) {
    position: relative;
  }

  wui-wallet-image {
    width: 56px;
    height: 56px;
  }

  wui-loading-thumbnail {
    position: absolute;
  }

  wui-icon-box {
    position: absolute;
    right: calc(${({spacing:t})=>t[1]} * -1);
    bottom: calc(${({spacing:t})=>t[1]} * -1);
    opacity: 0;
    transform: scale(0.5);
    transition-property: opacity, transform;
    transition-duration: ${({durations:t})=>t.lg};
    transition-timing-function: ${({easings:t})=>t["ease-out-power-2"]};
    will-change: opacity, transform;
  }

  wui-text[align='center'] {
    width: 100%;
    padding: 0px ${({spacing:t})=>t[4]};
  }

  [data-error='true'] wui-icon-box {
    opacity: 1;
    transform: scale(1);
  }

  [data-error='true'] > wui-flex:first-child {
    animation: shake 250ms ${({easings:t})=>t["ease-out-power-2"]} both;
  }

  [data-retry='false'] wui-link {
    display: none;
  }

  [data-retry='true'] wui-link {
    display: block;
    opacity: 1;
  }

  w3m-mobile-download-links {
    padding: 0px;
    width: 100%;
  }
`;var oe=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},N=class extends w{constructor(){super(),this.wallet=b.state.data?.wallet,this.connector=b.state.data?.connector,this.timeout=void 0,this.secondaryBtnIcon="refresh",this.onConnect=void 0,this.onRender=void 0,this.onAutoConnect=void 0,this.isWalletConnect=!0,this.unsubscribe=[],this.imageSrc=G.getConnectorImage(this.connector)??G.getWalletImage(this.wallet),this.name=this.wallet?.name??this.connector?.name??"Wallet",this.isRetrying=!1,this.uri=$.state.wcUri,this.error=$.state.wcError,this.ready=!1,this.showRetry=!1,this.label=void 0,this.secondaryBtnLabel="Try again",this.secondaryLabel="Accept connection request in the wallet",this.isLoading=!1,this.isMobile=!1,this.onRetry=void 0,this.unsubscribe.push($.subscribeKey("wcUri",e=>{this.uri=e,this.isRetrying&&this.onRetry&&(this.isRetrying=!1,this.onConnect?.())}),$.subscribeKey("wcError",e=>this.error=e)),(x.isTelegram()||x.isSafari())&&x.isIos()&&$.state.wcUri&&this.onConnect?.()}firstUpdated(){this.onAutoConnect?.(),this.showRetry=!this.onAutoConnect}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),$.setWcError(!1),clearTimeout(this.timeout)}render(){this.onRender?.(),this.onShowRetry();let e=this.error?"Connection can be declined if a previous request is still active":this.secondaryLabel,o="";return this.label?o=this.label:(o=`Continue in ${this.name}`,this.error&&(o="Connection declined")),u`
      <wui-flex
        data-error=${S(this.error)}
        data-retry=${this.showRetry}
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="6"
      >
        <wui-flex gap="2" justifyContent="center" alignItems="center">
          <wui-wallet-image size="lg" imageSrc=${S(this.imageSrc)}></wui-wallet-image>

          ${this.error?null:this.loaderTemplate()}

          <wui-icon-box
            color="error"
            icon="close"
            size="sm"
            border
            borderColor="wui-color-bg-125"
          ></wui-icon-box>
        </wui-flex>

        <wui-flex flexDirection="column" alignItems="center" gap="6"> <wui-flex
          flexDirection="column"
          alignItems="center"
          gap="2"
          .padding=${["2","0","0","0"]}
        >
          <wui-text align="center" variant="lg-medium" color=${this.error?"error":"primary"}>
            ${o}
          </wui-text>
          <wui-text align="center" variant="lg-regular" color="secondary">${e}</wui-text>
        </wui-flex>

        ${this.secondaryBtnLabel?u`
                <wui-button
                  variant="neutral-secondary"
                  size="md"
                  ?disabled=${this.isRetrying||this.isLoading}
                  @click=${this.onTryAgain.bind(this)}
                  data-testid="w3m-connecting-widget-secondary-button"
                >
                  <wui-icon
                    color="inherit"
                    slot="iconLeft"
                    name=${this.secondaryBtnIcon}
                  ></wui-icon>
                  ${this.secondaryBtnLabel}
                </wui-button>
              `:null}
      </wui-flex>

      ${this.isWalletConnect?u`
              <wui-flex .padding=${["0","5","5","5"]} justifyContent="center">
                <wui-link
                  @click=${this.onCopyUri}
                  variant="secondary"
                  icon="copy"
                  data-testid="wui-link-copy"
                >
                  Copy link
                </wui-link>
              </wui-flex>
            `:null}

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links></wui-flex>
      </wui-flex>
    `}onShowRetry(){this.error&&!this.showRetry&&(this.showRetry=!0,this.shadowRoot?.querySelector("wui-button")?.animate([{opacity:0},{opacity:1}],{fill:"forwards",easing:"ease"}))}onTryAgain(){$.setWcError(!1),this.onRetry?(this.isRetrying=!0,this.onRetry?.()):this.onConnect?.()}loaderTemplate(){let e=Ge.state.themeVariables["--w3m-border-radius-master"],o=e?parseInt(e.replace("px",""),10):4;return u`<wui-loading-thumbnail radius=${o*9}></wui-loading-thumbnail>`}onCopyUri(){try{this.uri&&(x.copyToClopboard(this.uri),me.showSuccess("Link copied"))}catch{me.showError("Failed to copy")}}};N.styles=Lo;oe([g()],N.prototype,"isRetrying",void 0);oe([g()],N.prototype,"uri",void 0);oe([g()],N.prototype,"error",void 0);oe([g()],N.prototype,"ready",void 0);oe([g()],N.prototype,"showRetry",void 0);oe([g()],N.prototype,"label",void 0);oe([g()],N.prototype,"secondaryBtnLabel",void 0);oe([g()],N.prototype,"secondaryLabel",void 0);oe([g()],N.prototype,"isLoading",void 0);oe([d({type:Boolean})],N.prototype,"isMobile",void 0);oe([d()],N.prototype,"onRetry",void 0);var gi=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},ko=class extends N{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-browser: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onAutoConnect=this.onConnectProxy.bind(this),B.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:b.state.view}})}async onConnectProxy(){try{this.error=!1;let{connectors:e}=q.state,o=e.find(i=>i.type==="ANNOUNCED"&&i.info?.rdns===this.wallet?.rdns||i.type==="INJECTED"||i.name===this.wallet?.name);if(o)await $.connectExternal(o,o.chain);else throw new Error("w3m-connecting-wc-browser: No connector found");dt.close(),B.sendEvent({type:"track",event:"CONNECT_SUCCESS",properties:{method:"browser",name:this.wallet?.name||"Unknown",view:b.state.view,walletRank:this.wallet?.order}})}catch(e){e instanceof ut&&e.originalName===at.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?B.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:e.message}}):B.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:e?.message??"Unknown"}}),this.error=!0}}};ko=gi([f("w3m-connecting-wc-browser")],ko);a();var wi=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Bo=class extends N{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-desktop: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onRender=this.onRenderProxy.bind(this),B.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"desktop",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:b.state.view}})}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onConnectProxy(){if(this.wallet?.desktop_link&&this.uri)try{this.error=!1;let{desktop_link:e,name:o}=this.wallet,{redirect:i,href:n}=x.formatNativeUrl(e,this.uri);$.setWcLinking({name:o,href:n}),$.setRecentWallet(this.wallet),x.openHref(i,"_blank")}catch{this.error=!0}}};Bo=wi([f("w3m-connecting-wc-desktop")],Bo);a();var Me=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},_e=class extends N{constructor(){if(super(),this.btnLabelTimeout=void 0,this.redirectDeeplink=void 0,this.redirectUniversalLink=void 0,this.target=void 0,this.preferUniversalLinks=M.state.experimental_preferUniversalLinks,this.isLoading=!0,this.onConnect=()=>{if(this.wallet?.mobile_link&&this.uri)try{this.error=!1;let{mobile_link:e,link_mode:o,name:i}=this.wallet,{redirect:n,redirectUniversalLink:r,href:s}=x.formatNativeUrl(e,this.uri,o);this.redirectDeeplink=n,this.redirectUniversalLink=r,this.target=x.isIframe()?"_top":"_self",$.setWcLinking({name:i,href:s}),$.setRecentWallet(this.wallet),this.preferUniversalLinks&&this.redirectUniversalLink?x.openHref(this.redirectUniversalLink,this.target):x.openHref(this.redirectDeeplink,this.target)}catch(e){B.sendEvent({type:"track",event:"CONNECT_PROXY_ERROR",properties:{message:e instanceof Error?e.message:"Error parsing the deeplink",uri:this.uri,mobile_link:this.wallet.mobile_link,name:this.wallet.name}}),this.error=!0}},!this.wallet)throw new Error("w3m-connecting-wc-mobile: No wallet provided");this.secondaryBtnLabel="Open",this.secondaryLabel=ct.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.onHandleURI(),this.unsubscribe.push($.subscribeKey("wcUri",()=>{this.onHandleURI()})),B.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"mobile",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:b.state.view}})}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.btnLabelTimeout)}onHandleURI(){this.isLoading=!this.uri,!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onTryAgain(){$.setWcError(!1),this.onConnect?.()}};Me([g()],_e.prototype,"redirectDeeplink",void 0);Me([g()],_e.prototype,"redirectUniversalLink",void 0);Me([g()],_e.prototype,"target",void 0);Me([g()],_e.prototype,"preferUniversalLinks",void 0);Me([g()],_e.prototype,"isLoading",void 0);_e=Me([f("w3m-connecting-wc-mobile")],_e);a();a();a();a();var Or=ui(Pr(),1);var hn=.1,Nr=2.5,pe=7;function uo(t,e,o){return t===e?!1:(t-e<0?e-t:t-e)<=o+hn}function mn(t,e){let o=Array.prototype.slice.call(Or.default.create(t,{errorCorrectionLevel:e}).modules.data,0),i=Math.sqrt(o.length);return o.reduce((n,r,s)=>(s%i===0?n.push([r]):n[n.length-1].push(r))&&n,[])}var Dr={generate({uri:t,size:e,logoSize:o,padding:i=8,dotColor:n="var(--apkt-colors-black)"}){let s=[],l=mn(t,"Q"),c=(e-2*i)/l.length,m=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];m.forEach(({x:v,y})=>{let k=(l.length-pe)*c*v+i,A=(l.length-pe)*c*y+i,j=.45;for(let D=0;D<m.length;D+=1){let U=c*(pe-D*2);s.push(ge`
            <rect
              fill=${D===2?"var(--apkt-colors-black)":"var(--apkt-colors-white)"}
              width=${D===0?U-10:U}
              rx= ${D===0?(U-10)*j:U*j}
              ry= ${D===0?(U-10)*j:U*j}
              stroke=${n}
              stroke-width=${D===0?10:0}
              height=${D===0?U-10:U}
              x= ${D===0?A+c*D+10/2:A+c*D}
              y= ${D===0?k+c*D+10/2:k+c*D}
            />
          `)}});let C=Math.floor((o+25)/c),O=l.length/2-C/2,T=l.length/2+C/2-1,V=[];l.forEach((v,y)=>{v.forEach((k,A)=>{if(l[y][A]&&!(y<pe&&A<pe||y>l.length-(pe+1)&&A<pe||y<pe&&A>l.length-(pe+1))&&!(y>O&&y<T&&A>O&&A<T)){let j=y*c+c/2+i,D=A*c+c/2+i;V.push([j,D])}})});let P={};return V.forEach(([v,y])=>{P[v]?P[v]?.push(y):P[v]=[y]}),Object.entries(P).map(([v,y])=>{let k=y.filter(A=>y.every(j=>!uo(A,j,c)));return[Number(v),k]}).forEach(([v,y])=>{y.forEach(k=>{s.push(ge`<circle cx=${v} cy=${k} fill=${n} r=${c/Nr} />`)})}),Object.entries(P).filter(([v,y])=>y.length>1).map(([v,y])=>{let k=y.filter(A=>y.some(j=>uo(A,j,c)));return[Number(v),k]}).map(([v,y])=>{y.sort((A,j)=>A<j?-1:1);let k=[];for(let A of y){let j=k.find(D=>D.some(U=>uo(A,U,c)));j?j.push(A):k.push([A])}return[v,k.map(A=>[A[0],A[A.length-1]])]}).forEach(([v,y])=>{y.forEach(([k,A])=>{s.push(ge`
              <line
                x1=${v}
                x2=${v}
                y1=${k}
                y2=${A}
                stroke=${n}
                stroke-width=${c/(Nr/2)}
                stroke-linecap="round"
              />
            `)})}),s}};a();var Mr=E`
  :host {
    position: relative;
    user-select: none;
    display: block;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    width: 100%;
    height: 100%;
    background-color: ${({colors:t})=>t.white};
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
  }

  :host {
    border-radius: ${({borderRadius:t})=>t[4]};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :host([data-clear='true']) > wui-icon {
    display: none;
  }

  svg:first-child,
  wui-image,
  wui-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translateY(-50%) translateX(-50%);
    background-color: ${({tokens:t})=>t.theme.backgroundPrimary};
    box-shadow: inset 0 0 0 4px ${({tokens:t})=>t.theme.backgroundPrimary};
    border-radius: ${({borderRadius:t})=>t[6]};
  }

  wui-image {
    width: 25%;
    height: 25%;
    border-radius: ${({borderRadius:t})=>t[2]};
  }

  wui-icon {
    width: 100%;
    height: 100%;
    color: #3396ff !important;
    transform: translateY(-50%) translateX(-50%) scale(0.25);
  }

  wui-icon > svg {
    width: inherit;
    height: inherit;
  }
`;var Ce=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},re=class extends w{constructor(){super(...arguments),this.uri="",this.size=0,this.theme="dark",this.imageSrc=void 0,this.alt=void 0,this.arenaClear=void 0,this.farcaster=void 0}render(){return this.dataset.theme=this.theme,this.dataset.clear=String(this.arenaClear),this.style.cssText=`--local-size: ${this.size}px`,u`<wui-flex
      alignItems="center"
      justifyContent="center"
      class="wui-qr-code"
      direction="column"
      gap="4"
      width="100%"
      style="height: 100%"
    >
      ${this.templateVisual()} ${this.templateSvg()}
    </wui-flex>`}templateSvg(){return ge`
      <svg height=${this.size} width=${this.size}>
        ${Dr.generate({uri:this.uri,size:this.size,logoSize:this.arenaClear?0:this.size/4})}
      </svg>
    `}templateVisual(){return this.imageSrc?u`<wui-image src=${this.imageSrc} alt=${this.alt??"logo"}></wui-image>`:this.farcaster?u`<wui-icon
        class="farcaster"
        size="inherit"
        color="inherit"
        name="farcaster"
      ></wui-icon>`:u`<wui-icon size="inherit" color="inherit" name="walletConnect"></wui-icon>`}};re.styles=[W,Mr];Ce([d()],re.prototype,"uri",void 0);Ce([d({type:Number})],re.prototype,"size",void 0);Ce([d()],re.prototype,"theme",void 0);Ce([d()],re.prototype,"imageSrc",void 0);Ce([d()],re.prototype,"alt",void 0);Ce([d({type:Boolean})],re.prototype,"arenaClear",void 0);Ce([d({type:Boolean})],re.prototype,"farcaster",void 0);re=Ce([f("wui-qr-code")],re);a();a();a();var Ur=E`
  :host {
    display: block;
    background: linear-gradient(
      90deg,
      ${({tokens:t})=>t.theme.foregroundSecondary} 0%,
      ${({tokens:t})=>t.theme.foregroundTertiary} 50%,
      ${({tokens:t})=>t.theme.foregroundSecondary} 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1s ease-in-out infinite;
    border-radius: ${({borderRadius:t})=>t[2]};
  }

  :host([data-rounded='true']) {
    border-radius: ${({borderRadius:t})=>t[16]};
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;var nt=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Le=class extends w{constructor(){super(...arguments),this.width="",this.height="",this.variant="default",this.rounded=!1}render(){return this.style.cssText=`
      width: ${this.width};
      height: ${this.height};
    `,this.dataset.rounded=this.rounded?"true":"false",u`<slot></slot>`}};Le.styles=[Ur];nt([d()],Le.prototype,"width",void 0);nt([d()],Le.prototype,"height",void 0);nt([d()],Le.prototype,"variant",void 0);nt([d({type:Boolean})],Le.prototype,"rounded",void 0);Le=nt([f("wui-shimmer")],Le);a();var zr=E`
  wui-shimmer {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: ${({borderRadius:t})=>t[4]};
  }

  wui-qr-code {
    opacity: 0;
    animation-duration: ${({durations:t})=>t.xl};
    animation-timing-function: ${({easings:t})=>t["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var jr=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Tt=class extends N{constructor(){super(),this.basic=!1,this.forceUpdate=()=>{this.requestUpdate()},window.addEventListener("resize",this.forceUpdate)}firstUpdated(){this.basic||B.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet?.name??"WalletConnect",platform:"qrcode",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:b.state.view}})}disconnectedCallback(){super.disconnectedCallback(),this.unsubscribe?.forEach(e=>e()),window.removeEventListener("resize",this.forceUpdate)}render(){return this.onRenderProxy(),u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["0","5","5","5"]}
        gap="5"
      >
        <wui-shimmer width="100%"> ${this.qrCodeTemplate()} </wui-shimmer>
        <wui-text variant="lg-medium" color="primary"> Scan this QR Code with your phone </wui-text>
        ${this.copyTemplate()}
      </wui-flex>
      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}onRenderProxy(){!this.ready&&this.uri&&(this.timeout=setTimeout(()=>{this.ready=!0},200))}qrCodeTemplate(){if(!this.uri||!this.ready)return null;let e=this.getBoundingClientRect().width-40,o=this.wallet?this.wallet.name:void 0;$.setWcLinking(void 0),$.setRecentWallet(this.wallet);let i=this.uri;if(this.wallet?.mobile_link){let{redirect:n}=x.formatNativeUrl(this.wallet?.mobile_link,this.uri,null);i=n}return u` <wui-qr-code
      size=${e}
      theme=${Ge.state.themeMode}
      uri=${i}
      imageSrc=${S(G.getWalletImage(this.wallet))}
      color=${S(Ge.state.themeVariables["--w3m-qr-color"])}
      alt=${S(o)}
      data-testid="wui-qr-code"
    ></wui-qr-code>`}copyTemplate(){let e=!this.uri||!this.ready;return u`<wui-button
      .disabled=${e}
      @click=${this.onCopyUri}
      variant="neutral-secondary"
      size="sm"
      data-testid="copy-wc2-uri"
    >
      Copy link
      <wui-icon size="sm" color="inherit" name="copy" slot="iconRight"></wui-icon>
    </wui-button>`}};Tt.styles=zr;jr([d({type:Boolean})],Tt.prototype,"basic",void 0);Tt=jr([f("w3m-connecting-wc-qrcode")],Tt);a();var fn=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},qr=class extends w{constructor(){if(super(),this.wallet=b.state.data?.wallet,!this.wallet)throw new Error("w3m-connecting-wc-unsupported: No wallet provided");B.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:b.state.view}})}render(){return u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="5"
      >
        <wui-wallet-image
          size="lg"
          imageSrc=${S(G.getWalletImage(this.wallet))}
        ></wui-wallet-image>

        <wui-text variant="md-regular" color="primary">Not Detected</wui-text>
      </wui-flex>

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}};qr=fn([f("w3m-connecting-wc-unsupported")],qr);a();var Fr=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},po=class extends N{constructor(){if(super(),this.isLoading=!0,!this.wallet)throw new Error("w3m-connecting-wc-web: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.secondaryBtnLabel="Open",this.secondaryLabel=ct.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.updateLoadingState(),this.unsubscribe.push($.subscribeKey("wcUri",()=>{this.updateLoadingState()})),B.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"web",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:b.state.view}})}updateLoadingState(){this.isLoading=!this.uri}onConnectProxy(){if(this.wallet?.webapp_link&&this.uri)try{this.error=!1;let{webapp_link:e,name:o}=this.wallet,{redirect:i,href:n}=x.formatUniversalUrl(e,this.uri);$.setWcLinking({name:o,href:n}),$.setRecentWallet(this.wallet),x.openHref(i,"_blank")}catch{this.error=!0}}};Fr([g()],po.prototype,"isLoading",void 0);po=Fr([f("w3m-connecting-wc-web")],po);a();var Vr=E`
  :host([data-mobile-fullscreen='true']) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :host([data-mobile-fullscreen='true']) wui-ux-by-reown {
    margin-top: auto;
  }
`;var ke=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},he=class extends w{constructor(){super(),this.wallet=b.state.data?.wallet,this.unsubscribe=[],this.platform=void 0,this.platforms=[],this.isSiwxEnabled=!!M.state.siwx,this.remoteFeatures=M.state.remoteFeatures,this.displayBranding=!0,this.basic=!1,this.determinePlatforms(),this.initializeConnection(),this.unsubscribe.push(M.subscribeKey("remoteFeatures",e=>this.remoteFeatures=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return M.state.enableMobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      ${this.headerTemplate()}
      <div class="platform-container">${this.platformTemplate()}</div>
      ${this.reownBrandingTemplate()}
    `}reownBrandingTemplate(){return!this.remoteFeatures?.reownBranding||!this.displayBranding?null:u`<wui-ux-by-reown></wui-ux-by-reown>`}async initializeConnection(e=!1){if(!(this.platform==="browser"||M.state.manualWCControl&&!e))try{let{wcPairingExpiry:o,status:i}=$.state,{redirectView:n}=b.state.data??{};if(e||M.state.enableEmbedded||x.isPairingExpired(o)||i==="connecting"){let r=$.getConnections(ae.state.activeChain),s=this.remoteFeatures?.multiWallet,l=r.length>0;await $.connectWalletConnect({cache:"never"}),this.isSiwxEnabled||(l&&s?(b.replace("ProfileWallets"),me.showSuccess("New Wallet Added")):n?b.replace(n):dt.close())}}catch(o){if(o instanceof Error&&o.message.includes("An error occurred when attempting to switch chain")&&!M.state.enableNetworkSwitch&&ae.state.activeChain){ae.setActiveCaipNetwork(yo.getUnsupportedNetwork(`${ae.state.activeChain}:${ae.state.activeCaipNetwork?.id}`)),ae.showUnsupportedChainUI();return}o instanceof ut&&o.originalName===at.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?B.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:o.message}}):B.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:o?.message??"Unknown"}}),$.setWcError(!0),me.showError(o.message??"Connection error"),$.resetWcConnection(),b.goBack()}}determinePlatforms(){if(!this.wallet){this.platforms.push("qrcode"),this.platform="qrcode";return}if(this.platform)return;let{mobile_link:e,desktop_link:o,webapp_link:i,injected:n,rdns:r}=this.wallet,s=n?.map(({injected_id:P})=>P).filter(Boolean),l=[...r?[r]:s??[]],c=M.state.isUniversalProvider?!1:l.length,m=e,C=i,O=$.checkInstalled(l),T=c&&O,V=o&&!x.isMobile();T&&!ae.state.noAdapters&&this.platforms.push("browser"),m&&this.platforms.push(x.isMobile()?"mobile":"qrcode"),C&&this.platforms.push("web"),V&&this.platforms.push("desktop"),!T&&c&&!ae.state.noAdapters&&this.platforms.push("unsupported"),this.platform=this.platforms[0]}platformTemplate(){switch(this.platform){case"browser":return u`<w3m-connecting-wc-browser></w3m-connecting-wc-browser>`;case"web":return u`<w3m-connecting-wc-web></w3m-connecting-wc-web>`;case"desktop":return u`
          <w3m-connecting-wc-desktop .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-desktop>
        `;case"mobile":return u`
          <w3m-connecting-wc-mobile isMobile .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-mobile>
        `;case"qrcode":return u`<w3m-connecting-wc-qrcode ?basic=${this.basic}></w3m-connecting-wc-qrcode>`;default:return u`<w3m-connecting-wc-unsupported></w3m-connecting-wc-unsupported>`}}headerTemplate(){return this.platforms.length>1?u`
      <w3m-connecting-header
        .platforms=${this.platforms}
        .onSelectPlatfrom=${this.onSelectPlatform.bind(this)}
      >
      </w3m-connecting-header>
    `:null}async onSelectPlatform(e){let o=this.shadowRoot?.querySelector("div");o&&(await o.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.platform=e,o.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}};he.styles=Vr;ke([g()],he.prototype,"platform",void 0);ke([g()],he.prototype,"platforms",void 0);ke([g()],he.prototype,"isSiwxEnabled",void 0);ke([g()],he.prototype,"remoteFeatures",void 0);ke([d({type:Boolean})],he.prototype,"displayBranding",void 0);ke([d({type:Boolean})],he.prototype,"basic",void 0);he=ke([f("w3m-connecting-wc-view")],he);var ho=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},At=class extends w{constructor(){super(),this.unsubscribe=[],this.isMobile=x.isMobile(),this.remoteFeatures=M.state.remoteFeatures,this.unsubscribe.push(M.subscribeKey("remoteFeatures",e=>this.remoteFeatures=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){if(this.isMobile){let{featured:e,recommended:o}=R.state,{customWallets:i}=M.state,n=wo.getRecentWallets(),r=e.length||o.length||i?.length||n.length;return u`<wui-flex flexDirection="column" gap="2" .margin=${["1","3","3","3"]}>
        ${r?u`<w3m-connector-list></w3m-connector-list>`:null}
        <w3m-all-wallets-widget></w3m-all-wallets-widget>
      </wui-flex>`}return u`<wui-flex flexDirection="column" .padding=${["0","0","4","0"]}>
        <w3m-connecting-wc-view ?basic=${!0} .displayBranding=${!1}></w3m-connecting-wc-view>
        <wui-flex flexDirection="column" .padding=${["0","3","0","3"]}>
          <w3m-all-wallets-widget></w3m-all-wallets-widget>
        </wui-flex>
      </wui-flex>
      ${this.reownBrandingTemplate()} `}reownBrandingTemplate(){return this.remoteFeatures?.reownBranding?u` <wui-flex flexDirection="column" .padding=${["1","0","1","0"]}>
      <wui-ux-by-reown></wui-ux-by-reown>
    </wui-flex>`:null}};ho([g()],At.prototype,"isMobile",void 0);ho([g()],At.prototype,"remoteFeatures",void 0);At=ho([f("w3m-connecting-wc-basic-view")],At);a();a();a();a();a();a();a();a();var{I:Rd}=xo;var Hr=t=>t.strings===void 0;var st=(t,e)=>{let o=t._$AN;if(o===void 0)return!1;for(let i of o)i._$AO?.(e,!1),st(i,e);return!0},It=t=>{let e,o;do{if((e=t._$AM)===void 0)break;o=e._$AN,o.delete(t),t=e}while(o?.size===0)},Kr=t=>{for(let e;e=t._$AM;t=e){let o=e._$AN;if(o===void 0)e._$AN=o=new Set;else if(o.has(t))break;o.add(t),bn(e)}};function gn(t){this._$AN!==void 0?(It(this),this._$AM=t,Kr(this)):this._$AM=t}function wn(t,e=!1,o=0){let i=this._$AH,n=this._$AN;if(n!==void 0&&n.size!==0)if(e)if(Array.isArray(i))for(let r=o;r<i.length;r++)st(i[r],!1),It(i[r]);else i!=null&&(st(i,!1),It(i));else st(this,t)}var bn=t=>{t.type==Co.CHILD&&(t._$AP??=wn,t._$AQ??=gn)},Wt=class extends vo{constructor(){super(...arguments),this._$AN=void 0}_$AT(e,o,i){super._$AT(e,o,i),Kr(this),this.isConnected=e._$AU}_$AO(e,o=!0){e!==this.isConnected&&(this.isConnected=e,e?this.reconnected?.():this.disconnected?.()),o&&(st(this,e),It(this))}setValue(e){if(Hr(this._$Ct))this._$Ct._$AI(e,this);else{let o=[...this._$Ct._$AH];o[this._$Ci]=e,this._$Ct._$AI(o,this,0)}}disconnected(){}reconnected(){}};var Ve=()=>new fo,fo=class{},mo=new WeakMap,He=Ut(class extends Wt{render(t){return Mt}update(t,[e]){let o=e!==this.G;return o&&this.rt(void 0),(o||this.lt!==this.ct)&&(this.G=e,this.ht=t.options?.host,this.rt(this.ct=t.element)),Mt}rt(t){if(this.G!==void 0)if(this.isConnected||(t=void 0),typeof this.G=="function"){let e=this.ht??globalThis,o=mo.get(e);o===void 0&&(o=new WeakMap,mo.set(e,o)),o.get(this.G)!==void 0&&this.G.call(this.ht,void 0),o.set(this.G,t),t!==void 0&&this.G.call(this.ht,t)}else this.G.value=t}get lt(){return typeof this.G=="function"?mo.get(this.ht??globalThis)?.get(this.G):this.G?.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}});a();var Gr=E`
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  label {
    position: relative;
    display: inline-block;
    user-select: none;
    transition:
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      border ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      box-shadow ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      width ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      height ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      transform ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      opacity ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  input {
    width: 0;
    height: 0;
    opacity: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${({colors:t})=>t.neutrals300};
    border-radius: ${({borderRadius:t})=>t.round};
    border: 1px solid transparent;
    will-change: border;
    transition:
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      border ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      box-shadow ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      width ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      height ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      transform ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      opacity ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  span:before {
    content: '';
    position: absolute;
    background-color: ${({colors:t})=>t.white};
    border-radius: 50%;
  }

  /* -- Sizes --------------------------------------------------------- */
  label[data-size='lg'] {
    width: 48px;
    height: 32px;
  }

  label[data-size='md'] {
    width: 40px;
    height: 28px;
  }

  label[data-size='sm'] {
    width: 32px;
    height: 22px;
  }

  label[data-size='lg'] > span:before {
    height: 24px;
    width: 24px;
    left: 4px;
    top: 3px;
  }

  label[data-size='md'] > span:before {
    height: 20px;
    width: 20px;
    left: 4px;
    top: 3px;
  }

  label[data-size='sm'] > span:before {
    height: 16px;
    width: 16px;
    left: 3px;
    top: 2px;
  }

  /* -- Focus states --------------------------------------------------- */
  input:focus-visible:not(:checked) + span,
  input:focus:not(:checked) + span {
    border: 1px solid ${({tokens:t})=>t.core.iconAccentPrimary};
    background-color: ${({tokens:t})=>t.theme.textTertiary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  input:focus-visible:checked + span,
  input:focus:checked + span {
    border: 1px solid ${({tokens:t})=>t.core.iconAccentPrimary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  /* -- Checked states --------------------------------------------------- */
  input:checked + span {
    background-color: ${({tokens:t})=>t.core.iconAccentPrimary};
  }

  label[data-size='lg'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='md'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='sm'] > input:checked + span:before {
    transform: translateX(calc(100% - 7px));
  }

  /* -- Hover states ------------------------------------------------------- */
  label:hover > input:not(:checked):not(:disabled) + span {
    background-color: ${({colors:t})=>t.neutrals400};
  }

  label:hover > input:checked:not(:disabled) + span {
    background-color: ${({colors:t})=>t.accent080};
  }

  /* -- Disabled state --------------------------------------------------- */
  label:has(input:disabled) {
    pointer-events: none;
    user-select: none;
  }

  input:not(:checked):disabled + span {
    background-color: ${({colors:t})=>t.neutrals700};
  }

  input:checked:disabled + span {
    background-color: ${({colors:t})=>t.neutrals700};
  }

  input:not(:checked):disabled + span::before {
    background-color: ${({colors:t})=>t.neutrals400};
  }

  input:checked:disabled + span::before {
    background-color: ${({tokens:t})=>t.theme.textTertiary};
  }
`;var Lt=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Ke=class extends w{constructor(){super(...arguments),this.inputElementRef=Ve(),this.checked=!1,this.disabled=!1,this.size="md"}render(){return u`
      <label data-size=${this.size}>
        <input
          ${He(this.inputElementRef)}
          type="checkbox"
          ?checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.dispatchChangeEvent.bind(this)}
        />
        <span></span>
      </label>
    `}dispatchChangeEvent(){this.dispatchEvent(new CustomEvent("switchChange",{detail:this.inputElementRef.value?.checked,bubbles:!0,composed:!0}))}};Ke.styles=[W,F,Gr];Lt([d({type:Boolean})],Ke.prototype,"checked",void 0);Lt([d({type:Boolean})],Ke.prototype,"disabled",void 0);Lt([d()],Ke.prototype,"size",void 0);Ke=Lt([f("wui-toggle")],Ke);a();var Qr=E`
  :host {
    height: auto;
  }

  :host > wui-flex {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    column-gap: ${({spacing:t})=>t[2]};
    padding: ${({spacing:t})=>t[2]} ${({spacing:t})=>t[3]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[4]};
    box-shadow: inset 0 0 0 1px ${({tokens:t})=>t.theme.foregroundPrimary};
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color;
    cursor: pointer;
  }

  wui-switch {
    pointer-events: none;
  }
`;var Yr=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},kt=class extends w{constructor(){super(...arguments),this.checked=!1}render(){return u`
      <wui-flex>
        <wui-icon size="xl" name="walletConnectBrown"></wui-icon>
        <wui-toggle
          ?checked=${this.checked}
          size="sm"
          @switchChange=${this.handleToggleChange.bind(this)}
        ></wui-toggle>
      </wui-flex>
    `}handleToggleChange(e){e.stopPropagation(),this.checked=e.detail,this.dispatchSwitchEvent()}dispatchSwitchEvent(){this.dispatchEvent(new CustomEvent("certifiedSwitchChange",{detail:this.checked,bubbles:!0,composed:!0}))}};kt.styles=[W,F,Qr];Yr([d({type:Boolean})],kt.prototype,"checked",void 0);kt=Yr([f("wui-certified-switch")],kt);a();a();a();a();var Jr=E`
  :host {
    position: relative;
    width: 100%;
    display: inline-flex;
    flex-direction: column;
    gap: ${({spacing:t})=>t[3]};
    color: ${({tokens:t})=>t.theme.textPrimary};
    caret-color: ${({tokens:t})=>t.core.textAccentPrimary};
  }

  .wui-input-text-container {
    position: relative;
    display: flex;
  }

  input {
    width: 100%;
    border-radius: ${({borderRadius:t})=>t[4]};
    color: inherit;
    background: transparent;
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
    caret-color: ${({tokens:t})=>t.core.textAccentPrimary};
    padding: ${({spacing:t})=>t[3]} ${({spacing:t})=>t[3]}
      ${({spacing:t})=>t[3]} ${({spacing:t})=>t[10]};
    font-size: ${({textSize:t})=>t.large};
    line-height: ${({typography:t})=>t["lg-regular"].lineHeight};
    letter-spacing: ${({typography:t})=>t["lg-regular"].letterSpacing};
    font-weight: ${({fontWeight:t})=>t.regular};
    font-family: ${({fontFamily:t})=>t.regular};
  }

  input[data-size='lg'] {
    padding: ${({spacing:t})=>t[4]} ${({spacing:t})=>t[3]}
      ${({spacing:t})=>t[4]} ${({spacing:t})=>t[10]};
  }

  @media (hover: hover) and (pointer: fine) {
    input:hover:enabled {
      border: 1px solid ${({tokens:t})=>t.theme.borderSecondary};
    }
  }

  input:disabled {
    cursor: unset;
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
  }

  input::placeholder {
    color: ${({tokens:t})=>t.theme.textSecondary};
  }

  input:focus:enabled {
    border: 1px solid ${({tokens:t})=>t.theme.borderSecondary};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    -webkit-box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
    -moz-box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
    box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
  }

  div.wui-input-text-container:has(input:disabled) {
    opacity: 0.5;
  }

  wui-icon.wui-input-text-left-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    left: ${({spacing:t})=>t[4]};
    color: ${({tokens:t})=>t.theme.iconDefault};
  }

  button.wui-input-text-submit-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:t})=>t[3]};
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: ${({borderRadius:t})=>t[2]};
    color: ${({tokens:t})=>t.core.textAccentPrimary};
  }

  button.wui-input-text-submit-button:disabled {
    opacity: 1;
  }

  button.wui-input-text-submit-button.loading wui-icon {
    animation: spin 1s linear infinite;
  }

  button.wui-input-text-submit-button:hover {
    background: ${({tokens:t})=>t.core.foregroundAccent010};
  }

  input:has(+ .wui-input-text-submit-button) {
    padding-right: ${({spacing:t})=>t[12]};
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }

  input[type='search']::-webkit-search-decoration,
  input[type='search']::-webkit-search-cancel-button,
  input[type='search']::-webkit-search-results-button,
  input[type='search']::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  /* -- Keyframes --------------------------------------------------- */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;var Y=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},H=class extends w{constructor(){super(...arguments),this.inputElementRef=Ve(),this.disabled=!1,this.loading=!1,this.placeholder="",this.type="text",this.value="",this.size="md"}render(){return u` <div class="wui-input-text-container">
        ${this.templateLeftIcon()}
        <input
          data-size=${this.size}
          ${He(this.inputElementRef)}
          data-testid="wui-input-text"
          type=${this.type}
          enterkeyhint=${S(this.enterKeyHint)}
          ?disabled=${this.disabled}
          placeholder=${this.placeholder}
          @input=${this.dispatchInputChangeEvent.bind(this)}
          @keydown=${this.onKeyDown}
          .value=${this.value||""}
        />
        ${this.templateSubmitButton()}
        <slot class="wui-input-text-slot"></slot>
      </div>
      ${this.templateError()} ${this.templateWarning()}`}templateLeftIcon(){return this.icon?u`<wui-icon
        class="wui-input-text-left-icon"
        size="md"
        data-size=${this.size}
        color="inherit"
        name=${this.icon}
      ></wui-icon>`:null}templateSubmitButton(){return this.onSubmit?u`<button
        class="wui-input-text-submit-button ${this.loading?"loading":""}"
        @click=${this.onSubmit?.bind(this)}
        ?disabled=${this.disabled||this.loading}
      >
        ${this.loading?u`<wui-icon name="spinner" size="md"></wui-icon>`:u`<wui-icon name="chevronRight" size="md"></wui-icon>`}
      </button>`:null}templateError(){return this.errorText?u`<wui-text variant="sm-regular" color="error">${this.errorText}</wui-text>`:null}templateWarning(){return this.warningText?u`<wui-text variant="sm-regular" color="warning">${this.warningText}</wui-text>`:null}dispatchInputChangeEvent(){this.dispatchEvent(new CustomEvent("inputChange",{detail:this.inputElementRef.value?.value,bubbles:!0,composed:!0}))}};H.styles=[W,F,Jr];Y([d()],H.prototype,"icon",void 0);Y([d({type:Boolean})],H.prototype,"disabled",void 0);Y([d({type:Boolean})],H.prototype,"loading",void 0);Y([d()],H.prototype,"placeholder",void 0);Y([d()],H.prototype,"type",void 0);Y([d()],H.prototype,"value",void 0);Y([d()],H.prototype,"errorText",void 0);Y([d()],H.prototype,"warningText",void 0);Y([d()],H.prototype,"onSubmit",void 0);Y([d()],H.prototype,"size",void 0);Y([d({attribute:!1})],H.prototype,"onKeyDown",void 0);H=Y([f("wui-input-text")],H);a();var Xr=E`
  :host {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  wui-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:t})=>t[3]};
    color: ${({tokens:t})=>t.theme.iconDefault};
    cursor: pointer;
    padding: ${({spacing:t})=>t[2]};
    background-color: transparent;
    border-radius: ${({borderRadius:t})=>t[4]};
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
  }

  @media (hover: hover) {
    wui-icon:hover {
      background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    }
  }
`;var Zr=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Bt=class extends w{constructor(){super(...arguments),this.inputComponentRef=Ve(),this.inputValue=""}render(){return u`
      <wui-input-text
        ${He(this.inputComponentRef)}
        placeholder="Search wallet"
        icon="search"
        type="search"
        enterKeyHint="search"
        size="sm"
        @inputChange=${this.onInputChange}
      >
        ${this.inputValue?u`<wui-icon
              @click=${this.clearValue}
              color="inherit"
              size="sm"
              name="close"
            ></wui-icon>`:null}
      </wui-input-text>
    `}onInputChange(e){this.inputValue=e.detail||""}clearValue(){let o=this.inputComponentRef.value?.inputElementRef.value;o&&(o.value="",this.inputValue="",o.focus(),o.dispatchEvent(new Event("input")))}};Bt.styles=[W,Xr];Zr([d()],Bt.prototype,"inputValue",void 0);Bt=Zr([f("wui-search-bar")],Bt);a();a();a();a();var ei=ge`<svg  viewBox="0 0 48 54" fill="none">
  <path
    d="M43.4605 10.7248L28.0485 1.61089C25.5438 0.129705 22.4562 0.129705 19.9515 1.61088L4.53951 10.7248C2.03626 12.2051 0.5 14.9365 0.5 17.886V36.1139C0.5 39.0635 2.03626 41.7949 4.53951 43.2752L19.9515 52.3891C22.4562 53.8703 25.5438 53.8703 28.0485 52.3891L43.4605 43.2752C45.9637 41.7949 47.5 39.0635 47.5 36.114V17.8861C47.5 14.9365 45.9637 12.2051 43.4605 10.7248Z"
  />
</svg>`;a();var ti=E`
  :host {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 104px;
    width: 104px;
    row-gap: ${({spacing:t})=>t[2]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[5]};
    position: relative;
  }

  wui-shimmer[data-type='network'] {
    border: none;
    -webkit-clip-path: var(--apkt-path-network);
    clip-path: var(--apkt-path-network);
  }

  svg {
    position: absolute;
    width: 48px;
    height: 54px;
    z-index: 1;
  }

  svg > path {
    stroke: ${({tokens:t})=>t.theme.foregroundSecondary};
    stroke-width: 1px;
  }

  @media (max-width: 350px) {
    :host {
      width: 100%;
    }
  }
`;var oi=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Pt=class extends w{constructor(){super(...arguments),this.type="wallet"}render(){return u`
      ${this.shimmerTemplate()}
      <wui-shimmer width="80px" height="20px"></wui-shimmer>
    `}shimmerTemplate(){return this.type==="network"?u` <wui-shimmer data-type=${this.type} width="48px" height="54px"></wui-shimmer>
        ${ei}`:u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}};Pt.styles=[W,F,ti];oi([d()],Pt.prototype,"type",void 0);Pt=oi([f("wui-card-select-loader")],Pt);a();a();a();var ri=pt`
  :host {
    display: grid;
    width: inherit;
    height: inherit;
  }
`;var J=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},K=class extends w{render(){return this.style.cssText=`
      grid-template-rows: ${this.gridTemplateRows};
      grid-template-columns: ${this.gridTemplateColumns};
      justify-items: ${this.justifyItems};
      align-items: ${this.alignItems};
      justify-content: ${this.justifyContent};
      align-content: ${this.alignContent};
      column-gap: ${this.columnGap&&`var(--apkt-spacing-${this.columnGap})`};
      row-gap: ${this.rowGap&&`var(--apkt-spacing-${this.rowGap})`};
      gap: ${this.gap&&`var(--apkt-spacing-${this.gap})`};
      padding-top: ${this.padding&&ee.getSpacingStyles(this.padding,0)};
      padding-right: ${this.padding&&ee.getSpacingStyles(this.padding,1)};
      padding-bottom: ${this.padding&&ee.getSpacingStyles(this.padding,2)};
      padding-left: ${this.padding&&ee.getSpacingStyles(this.padding,3)};
      margin-top: ${this.margin&&ee.getSpacingStyles(this.margin,0)};
      margin-right: ${this.margin&&ee.getSpacingStyles(this.margin,1)};
      margin-bottom: ${this.margin&&ee.getSpacingStyles(this.margin,2)};
      margin-left: ${this.margin&&ee.getSpacingStyles(this.margin,3)};
    `,u`<slot></slot>`}};K.styles=[W,ri];J([d()],K.prototype,"gridTemplateRows",void 0);J([d()],K.prototype,"gridTemplateColumns",void 0);J([d()],K.prototype,"justifyItems",void 0);J([d()],K.prototype,"alignItems",void 0);J([d()],K.prototype,"justifyContent",void 0);J([d()],K.prototype,"alignContent",void 0);J([d()],K.prototype,"columnGap",void 0);J([d()],K.prototype,"rowGap",void 0);J([d()],K.prototype,"gap",void 0);J([d()],K.prototype,"padding",void 0);J([d()],K.prototype,"margin",void 0);K=J([f("wui-grid")],K);a();a();var ii=E`
  button {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    width: 104px;
    row-gap: ${({spacing:t})=>t[2]};
    padding: ${({spacing:t})=>t[3]} ${({spacing:t})=>t[0]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: clamp(0px, ${({borderRadius:t})=>t[4]}, 20px);
    transition:
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-1"]},
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-1"]},
      border-radius ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-1"]};
    will-change: background-color, color, border-radius;
    outline: none;
    border: none;
  }

  button > wui-flex > wui-text {
    color: ${({tokens:t})=>t.theme.textPrimary};
    max-width: 86px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    justify-content: center;
  }

  button > wui-flex > wui-text.certified {
    max-width: 66px;
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled {
      background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    }
  }

  button:disabled > wui-flex > wui-text {
    color: ${({tokens:t})=>t.core.glass010};
  }

  [data-selected='true'] {
    background-color: ${({colors:t})=>t.accent020};
  }

  @media (hover: hover) and (pointer: fine) {
    [data-selected='true']:hover:enabled {
      background-color: ${({colors:t})=>t.accent010};
    }
  }

  [data-selected='true']:active:enabled {
    background-color: ${({colors:t})=>t.accent010};
  }

  @media (max-width: 350px) {
    button {
      width: 100%;
    }
  }
`;var ie=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},X=class extends w{constructor(){super(),this.observer=new IntersectionObserver(()=>{}),this.visible=!1,this.imageSrc=void 0,this.imageLoading=!1,this.isImpressed=!1,this.explorerId="",this.walletQuery="",this.certified=!1,this.displayIndex=0,this.wallet=void 0,this.observer=new IntersectionObserver(e=>{e.forEach(o=>{o.isIntersecting?(this.visible=!0,this.fetchImageSrc(),this.sendImpressionEvent()):this.visible=!1})},{threshold:.01})}firstUpdated(){this.observer.observe(this)}disconnectedCallback(){this.observer.disconnect()}render(){let e=this.wallet?.badge_type==="certified";return u`
      <button>
        ${this.imageTemplate()}
        <wui-flex flexDirection="row" alignItems="center" justifyContent="center" gap="1">
          <wui-text
            variant="md-regular"
            color="inherit"
            class=${S(e?"certified":void 0)}
            >${this.wallet?.name}</wui-text
          >
          ${e?u`<wui-icon size="sm" name="walletConnectBrown"></wui-icon>`:null}
        </wui-flex>
      </button>
    `}imageTemplate(){return!this.visible&&!this.imageSrc||this.imageLoading?this.shimmerTemplate():u`
      <wui-wallet-image
        size="lg"
        imageSrc=${S(this.imageSrc)}
        name=${S(this.wallet?.name)}
        .installed=${this.wallet?.installed??!1}
        badgeSize="sm"
      >
      </wui-wallet-image>
    `}shimmerTemplate(){return u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}async fetchImageSrc(){this.wallet&&(this.imageSrc=G.getWalletImage(this.wallet),!this.imageSrc&&(this.imageLoading=!0,this.imageSrc=await G.fetchWalletImage(this.wallet.image_id),this.imageLoading=!1))}sendImpressionEvent(){!this.wallet||this.isImpressed||(this.isImpressed=!0,B.sendWalletImpressionEvent({name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.explorerId,view:b.state.view,query:this.walletQuery,certified:this.certified,displayIndex:this.displayIndex}))}};X.styles=ii;ie([g()],X.prototype,"visible",void 0);ie([g()],X.prototype,"imageSrc",void 0);ie([g()],X.prototype,"imageLoading",void 0);ie([g()],X.prototype,"isImpressed",void 0);ie([d()],X.prototype,"explorerId",void 0);ie([d()],X.prototype,"walletQuery",void 0);ie([d()],X.prototype,"certified",void 0);ie([d()],X.prototype,"displayIndex",void 0);ie([d({type:Object})],X.prototype,"wallet",void 0);X=ie([f("w3m-all-wallets-list-item")],X);a();var ni=E`
  wui-grid {
    max-height: clamp(360px, 400px, 80vh);
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  w3m-all-wallets-list-item {
    opacity: 0;
    animation-duration: ${({durations:t})=>t.xl};
    animation-timing-function: ${({easings:t})=>t["ease-inout-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  wui-loading-spinner {
    padding-top: ${({spacing:t})=>t[4]};
    padding-bottom: ${({spacing:t})=>t[4]};
    justify-content: center;
    grid-column: 1 / span 4;
  }
`;var ve=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},si="local-paginator",ne=class extends w{constructor(){super(),this.unsubscribe=[],this.paginationObserver=void 0,this.loading=!R.state.wallets.length,this.wallets=R.state.wallets,this.recommended=R.state.recommended,this.featured=R.state.featured,this.filteredWallets=R.state.filteredWallets,this.mobileFullScreen=M.state.enableMobileFullScreen,this.unsubscribe.push(R.subscribeKey("wallets",e=>this.wallets=e),R.subscribeKey("recommended",e=>this.recommended=e),R.subscribeKey("featured",e=>this.featured=e),R.subscribeKey("filteredWallets",e=>this.filteredWallets=e))}firstUpdated(){this.initialFetch(),this.createPaginationObserver()}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),this.paginationObserver?.disconnect()}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      <wui-grid
        data-scroll=${!this.loading}
        .padding=${["0","3","3","3"]}
        gap="2"
        justifyContent="space-between"
      >
        ${this.loading?this.shimmerTemplate(16):this.walletsTemplate()}
        ${this.paginationLoaderTemplate()}
      </wui-grid>
    `}async initialFetch(){this.loading=!0;let e=this.shadowRoot?.querySelector("wui-grid");e&&(await R.fetchWalletsByPage({page:1}),await e.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.loading=!1,e.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}shimmerTemplate(e,o){return[...Array(e)].map(()=>u`
        <wui-card-select-loader type="wallet" id=${S(o)}></wui-card-select-loader>
      `)}getWallets(){let e=[...this.featured,...this.recommended];this.filteredWallets?.length>0?e.push(...this.filteredWallets):e.push(...this.wallets);let o=x.uniqueBy(e,"id"),i=Qe.markWalletsAsInstalled(o);return Qe.markWalletsWithDisplayIndex(i)}walletsTemplate(){return this.getWallets().map((o,i)=>u`
        <w3m-all-wallets-list-item
          data-testid="wallet-search-item-${o.id}"
          @click=${()=>this.onConnectWallet(o)}
          .wallet=${o}
          explorerId=${o.id}
          certified=${this.badge==="certified"}
          displayIndex=${i}
        ></w3m-all-wallets-list-item>
      `)}paginationLoaderTemplate(){let{wallets:e,recommended:o,featured:i,count:n,mobileFilteredOutWalletsLength:r}=R.state,s=window.innerWidth<352?3:4,l=e.length+o.length,m=Math.ceil(l/s)*s-l+s;return m-=e.length?i.length%s:0,n===0&&i.length>0?null:n===0||[...i,...e,...o].length<n-(r??0)?this.shimmerTemplate(m,si):null}createPaginationObserver(){let e=this.shadowRoot?.querySelector(`#${si}`);e&&(this.paginationObserver=new IntersectionObserver(([o])=>{if(o?.isIntersecting&&!this.loading){let{page:i,count:n,wallets:r}=R.state;r.length<n&&R.fetchWalletsByPage({page:i+1})}}),this.paginationObserver.observe(e))}onConnectWallet(e){q.selectWalletConnector(e)}};ne.styles=ni;ve([g()],ne.prototype,"loading",void 0);ve([g()],ne.prototype,"wallets",void 0);ve([g()],ne.prototype,"recommended",void 0);ve([g()],ne.prototype,"featured",void 0);ve([g()],ne.prototype,"filteredWallets",void 0);ve([g()],ne.prototype,"badge",void 0);ve([g()],ne.prototype,"mobileFullScreen",void 0);ne=ve([f("w3m-all-wallets-list")],ne);a();a();a();var li=pt`
  wui-grid,
  wui-loading-spinner,
  wui-flex {
    height: 360px;
  }

  wui-grid {
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
    height: auto;
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  wui-loading-spinner {
    justify-content: center;
    align-items: center;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;var lt=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Be=class extends w{constructor(){super(...arguments),this.prevQuery="",this.prevBadge=void 0,this.loading=!0,this.mobileFullScreen=M.state.enableMobileFullScreen,this.query=""}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.onSearch(),this.loading?u`<wui-loading-spinner color="accent-primary"></wui-loading-spinner>`:this.walletsTemplate()}async onSearch(){(this.query.trim()!==this.prevQuery.trim()||this.badge!==this.prevBadge)&&(this.prevQuery=this.query,this.prevBadge=this.badge,this.loading=!0,await R.searchWallet({search:this.query,badge:this.badge}),this.loading=!1)}walletsTemplate(){let{search:e}=R.state,o=Qe.markWalletsAsInstalled(e);return e.length?u`
      <wui-grid
        data-testid="wallet-list"
        .padding=${["0","3","3","3"]}
        rowGap="4"
        columngap="2"
        justifyContent="space-between"
      >
        ${o.map((i,n)=>u`
            <w3m-all-wallets-list-item
              @click=${()=>this.onConnectWallet(i)}
              .wallet=${i}
              data-testid="wallet-search-item-${i.id}"
              explorerId=${i.id}
              certified=${this.badge==="certified"}
              walletQuery=${this.query}
              displayIndex=${n}
            ></w3m-all-wallets-list-item>
          `)}
      </wui-grid>
    `:u`
        <wui-flex
          data-testid="no-wallet-found"
          justifyContent="center"
          alignItems="center"
          gap="3"
          flexDirection="column"
        >
          <wui-icon-box size="lg" color="default" icon="wallet"></wui-icon-box>
          <wui-text data-testid="no-wallet-found-text" color="secondary" variant="md-medium">
            No Wallet found
          </wui-text>
        </wui-flex>
      `}onConnectWallet(e){q.selectWalletConnector(e)}};Be.styles=li;lt([g()],Be.prototype,"loading",void 0);lt([g()],Be.prototype,"mobileFullScreen",void 0);lt([d()],Be.prototype,"query",void 0);lt([d()],Be.prototype,"badge",void 0);Be=lt([f("w3m-all-wallets-search")],Be);var go=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Nt=class extends w{constructor(){super(...arguments),this.search="",this.badge=void 0,this.onDebouncedSearch=x.debounce(e=>{this.search=e})}render(){let e=this.search.length>=2;return u`
      <wui-flex .padding=${["1","3","3","3"]} gap="2" alignItems="center">
        <wui-search-bar @inputChange=${this.onInputChange.bind(this)}></wui-search-bar>
        <wui-certified-switch
          ?checked=${this.badge==="certified"}
          @certifiedSwitchChange=${this.onCertifiedSwitchChange.bind(this)}
          data-testid="wui-certified-switch"
        ></wui-certified-switch>
        ${this.qrButtonTemplate()}
      </wui-flex>
      ${e||this.badge?u`<w3m-all-wallets-search
            query=${this.search}
            .badge=${this.badge}
          ></w3m-all-wallets-search>`:u`<w3m-all-wallets-list .badge=${this.badge}></w3m-all-wallets-list>`}
    `}onInputChange(e){this.onDebouncedSearch(e.detail)}onCertifiedSwitchChange(e){e.detail?(this.badge="certified",me.showSvg("Only WalletConnect certified",{icon:"walletConnectBrown",iconColor:"accent-100"})):this.badge=void 0}qrButtonTemplate(){return x.isMobile()?u`
        <wui-icon-box
          size="xl"
          iconSize="xl"
          color="accent-primary"
          icon="qrCode"
          border
          borderColor="wui-accent-glass-010"
          @click=${this.onWalletConnectQr.bind(this)}
        ></wui-icon-box>
      `:null}onWalletConnectQr(){b.push("ConnectingWalletConnect")}};go([g()],Nt.prototype,"search",void 0);go([g()],Nt.prototype,"badge",void 0);Nt=go([f("w3m-all-wallets-view")],Nt);a();a();a();a();var ai=E`
  :host {
    width: 100%;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${({spacing:t})=>t[3]};
    width: 100%;
    background-color: ${({tokens:t})=>t.theme.backgroundPrimary};
    border-radius: ${({borderRadius:t})=>t[4]};
    transition:
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      scale ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color, scale;
  }

  wui-text {
    text-transform: capitalize;
  }

  wui-image {
    color: ${({tokens:t})=>t.theme.textPrimary};
  }

  @media (hover: hover) {
    button:hover:enabled {
      background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    }
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;var se=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},Z=class extends w{constructor(){super(...arguments),this.imageSrc="google",this.loading=!1,this.disabled=!1,this.rightIcon=!0,this.rounded=!1,this.fullSize=!1}render(){return this.dataset.rounded=this.rounded?"true":"false",u`
      <button
        ?disabled=${this.loading?!0:!!this.disabled}
        data-loading=${this.loading}
        tabindex=${S(this.tabIdx)}
      >
        <wui-flex gap="2" alignItems="center">
          ${this.templateLeftIcon()}
          <wui-flex gap="1">
            <slot></slot>
          </wui-flex>
        </wui-flex>
        ${this.templateRightIcon()}
      </button>
    `}templateLeftIcon(){return this.icon?u`<wui-image
        icon=${this.icon}
        iconColor=${S(this.iconColor)}
        ?boxed=${!0}
        ?rounded=${this.rounded}
      ></wui-image>`:u`<wui-image
      ?boxed=${!0}
      ?rounded=${this.rounded}
      ?fullSize=${this.fullSize}
      src=${this.imageSrc}
    ></wui-image>`}templateRightIcon(){return this.rightIcon?this.loading?u`<wui-loading-spinner size="md" color="accent-primary"></wui-loading-spinner>`:u`<wui-icon name="chevronRight" size="lg" color="default"></wui-icon>`:null}};Z.styles=[W,F,ai];se([d()],Z.prototype,"imageSrc",void 0);se([d()],Z.prototype,"icon",void 0);se([d()],Z.prototype,"iconColor",void 0);se([d({type:Boolean})],Z.prototype,"loading",void 0);se([d()],Z.prototype,"tabIdx",void 0);se([d({type:Boolean})],Z.prototype,"disabled",void 0);se([d({type:Boolean})],Z.prototype,"rightIcon",void 0);se([d({type:Boolean})],Z.prototype,"rounded",void 0);se([d({type:Boolean})],Z.prototype,"fullSize",void 0);Z=se([f("wui-list-item")],Z);var yn=function(t,e,o,i){var n=arguments.length,r=n<3?e:i===null?i=Object.getOwnPropertyDescriptor(e,o):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")r=Reflect.decorate(t,e,o,i);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(r=(n<3?s(r):n>3?s(e,o,r):s(e,o))||r);return n>3&&r&&Object.defineProperty(e,o,r),r},ci=class extends w{constructor(){super(...arguments),this.wallet=b.state.data?.wallet}render(){if(!this.wallet)throw new Error("w3m-downloads-view");return u`
      <wui-flex gap="2" flexDirection="column" .padding=${["3","3","4","3"]}>
        ${this.chromeTemplate()} ${this.iosTemplate()} ${this.androidTemplate()}
        ${this.homepageTemplate()}
      </wui-flex>
    `}chromeTemplate(){return this.wallet?.chrome_store?u`<wui-list-item
      variant="icon"
      icon="chromeStore"
      iconVariant="square"
      @click=${this.onChromeStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Chrome Extension</wui-text>
    </wui-list-item>`:null}iosTemplate(){return this.wallet?.app_store?u`<wui-list-item
      variant="icon"
      icon="appStore"
      iconVariant="square"
      @click=${this.onAppStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">iOS App</wui-text>
    </wui-list-item>`:null}androidTemplate(){return this.wallet?.play_store?u`<wui-list-item
      variant="icon"
      icon="playStore"
      iconVariant="square"
      @click=${this.onPlayStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Android App</wui-text>
    </wui-list-item>`:null}homepageTemplate(){return this.wallet?.homepage?u`
      <wui-list-item
        variant="icon"
        icon="browser"
        iconVariant="square-blue"
        @click=${this.onHomePage.bind(this)}
        chevron
      >
        <wui-text variant="md-medium" color="primary">Website</wui-text>
      </wui-list-item>
    `:null}openStore(e){e.href&&this.wallet&&(B.sendEvent({type:"track",event:"GET_WALLET",properties:{name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.wallet.id,type:e.type}}),x.openHref(e.href,"_blank"))}onChromeStore(){this.wallet?.chrome_store&&this.openStore({href:this.wallet.chrome_store,type:"chrome_store"})}onAppStore(){this.wallet?.app_store&&this.openStore({href:this.wallet.app_store,type:"app_store"})}onPlayStore(){this.wallet?.play_store&&this.openStore({href:this.wallet.play_store,type:"play_store"})}onHomePage(){this.wallet?.homepage&&this.openStore({href:this.wallet.homepage,type:"homepage"})}};ci=yn([f("w3m-downloads-view")],ci);export{Nt as W3mAllWalletsView,At as W3mConnectingWcBasicView,ci as W3mDownloadsView};
/*! Bundled license information:

lit-html/directive-helpers.js:
lit-html/directives/ref.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/async-directive.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
