import type { MaskRevealEffect, TextAnimationDefinition } from './animation-engine'

export type { MaskRevealEffect } from './animation-engine'

export type MaskRevealSample = {
  progress: number
  clipPath: string
  maskImage?: string
  effect: MaskRevealEffect
}

const clamp = (value:number,min=0,max=1) => Math.min(max,Math.max(min,value))
const smooth = (value:number) => { const t=clamp(value); return t*t*(3-2*t) }
const polygon = (points:number[][]) => 'polygon('+points.map(([x,y])=>`${x.toFixed(3)}% ${y.toFixed(3)}%`).join(',')+')'

/** Pure frame sampler shared by the live editor and canvas exporter. */
export function sampleMaskReveal(input:{effect:MaskRevealEffect;progress:number;intensity?:number}):MaskRevealSample {
  const p=smooth(input.progress)
  const amount=clamp(p*Math.max(.25,Math.min(1.5,input.intensity??1)))
  const inv=1-amount
  let clipPath='inset(0 100% 0 0)'
  let maskImage:string|undefined
  switch(input.effect){
    case 'wipe-left': clipPath=`inset(0 ${(inv*100).toFixed(3)}% 0 0)`; break
    case 'wipe-right': clipPath=`inset(0 0 0 ${(inv*100).toFixed(3)}%)`; break
    case 'wipe-up': clipPath=`inset(0 0 ${(inv*100).toFixed(3)}% 0)`; break
    case 'wipe-down': clipPath=`inset(${(inv*100).toFixed(3)}% 0 0 0)`; break
    case 'diagonal-down': clipPath=polygon([[0,0],[amount*100,0],[100,amount*100],[100,100],[100-amount*100,100],[0,100-amount*100]]); break
    case 'diagonal-up': clipPath=polygon([[0,100],[0,100-amount*100],[100-amount*100,0],[100,0],[100,amount*100],[amount*100,100]]); break
    case 'center-open': clipPath=`inset(0 ${(inv*50).toFixed(3)}% 0 ${(inv*50).toFixed(3)}%)`; break
    case 'center-close': clipPath=`inset(${(inv*50).toFixed(3)}% ${(inv*50).toFixed(3)}% ${(inv*50).toFixed(3)}% ${(inv*50).toFixed(3)}%)`; break
    case 'iris-circle': clipPath=`circle(${(amount*75).toFixed(3)}% at 50% 50%)`; break
    case 'iris-ellipse': clipPath=`ellipse(${(amount*75).toFixed(3)}% ${(amount*65).toFixed(3)}% at 50% 50%)`; break
    case 'diamond': clipPath=polygon([[50,50-amount*71],[50+amount*71,50],[50,50+amount*71],[50-amount*71,50]]); break
    case 'radial-sweep': maskImage=`conic-gradient(from -90deg, #000 0deg ${(amount*360).toFixed(2)}deg, transparent ${(amount*360).toFixed(2)}deg 360deg)`; break
    case 'clock-wipe': clipPath=polygon([[50,50],...Array.from({length:49},(_,i)=>{const a=(-90+360*amount*i/48)*Math.PI/180;return [50+71*Math.cos(a),50+71*Math.sin(a)]})]); break
    case 'venetian': maskImage=`repeating-linear-gradient(to bottom, #000 0 ${(amount*100/8).toFixed(3)}%, transparent ${(amount*100/8).toFixed(3)}% ${(100/8).toFixed(3)}%)`; break
    case 'checkerboard': maskImage=`repeating-conic-gradient(#000 0 25%, transparent 0 50%) 0 0 / ${Math.max(4,100* (1-amount)*.25).toFixed(2)}% ${Math.max(4,100*(1-amount)*.25).toFixed(2)}%`; break
    case 'box-reveal': clipPath=`inset(${(inv*50).toFixed(3)}% ${(inv*50).toFixed(3)}% ${(inv*50).toFixed(3)}% ${(inv*50).toFixed(3)}% round ${(inv*18).toFixed(2)}%)`; break
    case 'corner-sweep': clipPath=polygon([[0,0],[amount*100,0],[0,amount*100]]); break
    case 'curtain': clipPath=polygon([[0,0],[50,0],[50+amount*50,50],[50,100],[0,100],[amount*50,50]]); break
    case 'shutter': maskImage=`repeating-linear-gradient(90deg, #000 0 ${(amount*100/6).toFixed(3)}%, transparent ${(amount*100/6).toFixed(3)}% ${(100/6).toFixed(3)}%)`; break
    case 'scanline': maskImage=`linear-gradient(to bottom, #000 0%, #000 ${(amount*100).toFixed(3)}%, transparent ${(amount*100).toFixed(3)}%, transparent 100%)`; break
    case 'pixel-grid': maskImage=`repeating-linear-gradient(0deg, #000 0 ${(amount*100).toFixed(3)}%, transparent ${(amount*100).toFixed(3)}% 12.5%), repeating-linear-gradient(90deg, #000 0 ${(amount*100).toFixed(3)}%, transparent ${(amount*100).toFixed(3)}% 12.5%)`; break
    case 'feathered-wipe': maskImage=`linear-gradient(90deg, #000 0%, #000 ${Math.max(0,amount*100-8).toFixed(3)}%, transparent ${(amount*100).toFixed(3)}%)`; break
    case 'starburst': clipPath=polygon(Array.from({length:32},(_,i)=>{const a=-Math.PI/2+i*Math.PI/16;const r=(i%2===0?71:25)*amount;return [50+Math.cos(a)*r,50+Math.sin(a)*r]})); break
    case 'spiral': clipPath=polygon(Array.from({length:49},(_,i)=>{const t=i/48, a=t*Math.PI*4-Math.PI/2, r=amount*71*t;return [50+Math.cos(a)*r,50+Math.sin(a)*r]})); break
    case 'cross-reveal': clipPath=polygon([[50-amount*50,0],[50+amount*50,0],[50+amount*50,50-amount*50],[100,50-amount*50],[100,50+amount*50],[50+amount*50,50+amount*50],[50+amount*50,100],[50-amount*50,100],[50-amount*50,50+amount*50],[0,50+amount*50],[0,50-amount*50],[50-amount*50,50-amount*50]]); break
  }
  return {progress:amount,clipPath,maskImage,effect:input.effect}
}

/** Canvas approximation of the same reveal geometry, kept frame deterministic. */
export function clipCanvasForMask(ctx:CanvasRenderingContext2D,sample:MaskRevealSample,width:number,height:number) {
  const p=sample.progress, w=width, h=height, inset=(1-p)
  ctx.beginPath()
  switch(sample.effect){
    case 'wipe-left': ctx.rect(0,0,w*p,h); break
    case 'wipe-right': ctx.rect(w*(1-p),0,w*p,h); break
    case 'wipe-up': ctx.rect(0,h*(1-p),w,h*p); break
    case 'wipe-down': ctx.rect(0,0,w,h*p); break
    case 'center-open': ctx.rect(w*inset/2,0,w*p,h); break
    case 'center-close': ctx.rect(w*inset/2,h*inset/2,w*p,h*p); break
    case 'iris-circle': ctx.arc(w/2,h/2,Math.hypot(w,h)*.55*p,0,Math.PI*2); break
    case 'iris-ellipse': ctx.ellipse(w/2,h/2,w*.75*p,h*.65*p,0,0,Math.PI*2); break
    case 'diamond': ctx.moveTo(w/2,h*(.5-.71*p));ctx.lineTo(w*(.5+.71*p),h/2);ctx.lineTo(w/2,h*(.5+.71*p));ctx.lineTo(w*(.5-.71*p),h/2);ctx.closePath();break
    case 'clock-wipe': ctx.moveTo(w/2,h/2);for(let i=0;i<=48*p;i++){const a=(-90+i/48*360*p)*Math.PI/180;ctx.lineTo(w/2+Math.cos(a)*w, h/2+Math.sin(a)*h)}ctx.closePath();break
    case 'box-reveal': ctx.rect(w*inset/2,h*inset/2,w*p,h*p);break
    case 'corner-sweep': ctx.moveTo(0,0);ctx.lineTo(w*p,0);ctx.lineTo(0,h*p);ctx.closePath();break
    case 'curtain': ctx.moveTo(0,0);ctx.lineTo(w/2,h/2);ctx.lineTo(0,h);ctx.lineTo(w*p,h);ctx.lineTo(w*p,0);ctx.closePath();break
    case 'venetian': case 'shutter': case 'checkerboard': case 'pixel-grid': {
      const cols=sample.effect==='venetian'?1:sample.effect==='shutter'?6:8, rows=sample.effect==='venetian'?8:sample.effect==='pixel-grid'?8:sample.effect==='checkerboard'?8:1
      const total=cols*rows, visible=Math.ceil(total*p)
      for(let i=0;i<visible;i++){const col=i%cols,row=Math.floor(i/cols);ctx.rect(col*w/cols,row*h/rows,w/cols+.5,h/rows+.5)}
      break
    }
    case 'scanline': ctx.rect(0,0,w,h*p);break
    case 'feathered-wipe': ctx.rect(0,0,w*p,h);break
    case 'starburst': case 'spiral': case 'diagonal-down': case 'diagonal-up': case 'radial-sweep': case 'cross-reveal': {
      const points=sample.effect==='starburst'?32:48
      ctx.moveTo(w/2,h/2)
      for(let i=0;i<=points;i++){const a=(-90+i/points*360)*Math.PI/180;const r=(sample.effect==='starburst'&&i%2?0.35:1)*p;ctx.lineTo(w/2+Math.cos(a)*w*.72*r,h/2+Math.sin(a)*h*.72*r)}
      ctx.closePath();break
    }
  }
  ctx.clip()
}

const effects:readonly {name:string;effect:MaskRevealEffect;duration:number;description:string}[]=[
 {name:'Wipe Left',effect:'wipe-left',duration:850,description:'A crisp left-to-right reveal with a controlled, even edge.'},
 {name:'Wipe Right',effect:'wipe-right',duration:850,description:'A clean right-to-left reveal that preserves the text layout.'},
 {name:'Wipe Up',effect:'wipe-up',duration:900,description:'Text is uncovered upward from the lower edge.'},
 {name:'Wipe Down',effect:'wipe-down',duration:900,description:'A vertical reveal travels smoothly from the top edge.'},
 {name:'Diagonal Wipe Down',effect:'diagonal-down',duration:1050,description:'A diagonal edge sweeps across the complete text block.'},
 {name:'Diagonal Wipe Up',effect:'diagonal-up',duration:1050,description:'A rising diagonal reveal with balanced corner timing.'},
 {name:'Center Split Reveal',effect:'center-open',duration:950,description:'Two halves open outward from the center line.'},
 {name:'Center Collapse Reveal',effect:'center-close',duration:950,description:'A compact center reveal expands evenly in both axes.'},
 {name:'Circle Iris',effect:'iris-circle',duration:1100,description:'A circular aperture expands from the center of the text.'},
 {name:'Ellipse Iris',effect:'iris-ellipse',duration:1100,description:'An elliptical aperture opens with a cinematic aspect.'},
 {name:'Diamond Reveal',effect:'diamond',duration:1050,description:'A diamond-shaped window expands to reveal the text.'},
 {name:'Radial Sweep',effect:'radial-sweep',duration:1200,description:'A radial sweep advances around the center point.'},
 {name:'Clock Wipe',effect:'clock-wipe',duration:1200,description:'A clock-hand sweep progressively uncovers the layer.'},
 {name:'Venetian Blinds',effect:'venetian',duration:1100,description:'Horizontal slats reveal in a measured sequence.'},
 {name:'Checkerboard Reveal',effect:'checkerboard',duration:1150,description:'A checkerboard grid reveals in a deterministic scan.'},
 {name:'Expanding Box',effect:'box-reveal',duration:1000,description:'A centered rectangular window expands into the full text area.'},
 {name:'Corner Sweep',effect:'corner-sweep',duration:1000,description:'A triangular reveal grows from the upper-left corner.'},
 {name:'Curtain Reveal',effect:'curtain',duration:1050,description:'A pair of curtain-like panels part from the center.'},
 {name:'Shutter Reveal',effect:'shutter',duration:1100,description:'Vertical shutter bands open in a synchronized rhythm.'},
 {name:'Scanline Reveal',effect:'scanline',duration:1000,description:'A precise scan edge travels down the text block.'},
 {name:'Pixel Grid Reveal',effect:'pixel-grid',duration:1150,description:'A structured pixel grid fills in without random flicker.'},
 {name:'Feathered Wipe',effect:'feathered-wipe',duration:1100,description:'A soft gradient edge blends into the text reveal.'},
 {name:'Starburst Reveal',effect:'starburst',duration:1100,description:'A restrained starburst aperture opens from the center.'},
 {name:'Spiral Reveal',effect:'spiral',duration:1250,description:'A spiral aperture unwinds into the complete text layer.'},
 {name:'Cross Reveal',effect:'cross-reveal',duration:1050,description:'Four arms extend from the center to reveal the text.'},
]

export const WIPE_MASK_REVEAL_ANIMATIONS:readonly TextAnimationDefinition[]=effects.map((item,index)=>({
 id:'mask-'+(151+index),name:item.name,description:item.description,category:'Wipe, Mask & Reveal',
 mode:'entrance',maskEffect:item.effect,defaultDurationMs:item.duration,defaultEasing:'premium-out',
 compositing:'replace',keyframes:[{at:0,opacity:1},{at:1,opacity:1}],
}))
