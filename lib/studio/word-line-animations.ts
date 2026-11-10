import type { TextAnimationDefinition } from './animation-engine'

export type WordAnimationEffect =
  | 'cascade' | 'rise' | 'drop' | 'fade' | 'slide-left' | 'slide-right'
  | 'zoom' | 'soft-zoom' | 'blur' | 'flip' | 'rotate' | 'wave'
  | 'stagger' | 'float' | 'sweep' | 'mask' | 'tracking' | 'focus'
  | 'pop' | 'drift' | 'fold' | 'glide' | 'spotlight' | 'line-reveal' | 'line-cascade'

export type WordMotionSample = {
  opacity: number
  x: number
  y: number
  scale: number
  rotate: number
  rotateX: number
  blur: number
  clip: number
  spacing: number
}

const clamp = (n:number,min:number,max:number) => Math.min(max,Math.max(min,n))
const smooth = (t:number) => { const p=clamp(t,0,1); return p*p*(3-2*p) }
const out = (t:number) => 1-Math.pow(1-clamp(t,0,1),3)
const hash = (n:number) => { const x=Math.sin((n+1)*127.1)*43758.5453; return x-Math.floor(x) }

/** Deterministic per-word sample. All words settle exactly to a neutral state. */
export function sampleWordMotion(input:{
 effect:WordAnimationEffect; progress:number; index:number; count:number; intensity?:number; lineIndex?:number; lineCount?:number
}):WordMotionSample {
 const {effect}=input
 const count=Math.max(1,input.count), index=Math.max(0,input.index), lineIndex=Math.max(0,input.lineIndex||0)
 const intensity=clamp(Number.isFinite(input.intensity)?input.intensity??1:1,0,2)
 const spread=Math.min(.72,Math.max(.12,.58/count))
 const delay=(effect==='line-reveal'||effect==='line-cascade')?lineIndex*spread*.8:index*spread
 const local=clamp((input.progress-delay)/(1-delay),0,1)
 const s=smooth(local), o=out(local), inv=1-o
 const seed=hash(index+lineIndex*97)
 const m:WordMotionSample={opacity:1,x:0,y:0,scale:1,rotate:0,rotateX:0,blur:0,clip:1,spacing:0}
 const travel=(v:number)=>v*intensity
 switch(effect){
  case 'cascade': m.opacity=o;m.y=travel(18*inv);m.scale=.985+.015*o;break
  case 'rise': m.opacity=o;m.y=travel(32*inv);break
  case 'drop': m.opacity=o;m.y=travel(-28*inv);break
  case 'fade': m.opacity=o;break
  case 'slide-left': m.opacity=o;m.x=travel(42*inv);break
  case 'slide-right': m.opacity=o;m.x=travel(-42*inv);break
  case 'zoom': m.opacity=o;m.scale=.72+.28*o;break
  case 'soft-zoom': m.opacity=o;m.scale=.94+.06*o;m.blur=3*inv;break
  case 'blur': m.opacity=.2+.8*o;m.blur=9*inv;break
  case 'flip': m.opacity=o;m.rotateX=-78*inv; m.scale=.96+.04*o;break
  case 'rotate': m.opacity=o;m.rotate=(seed>.5?1:-1)*18*inv; m.y=travel(8*inv);break
  case 'wave': {const wave=clamp((input.progress-index*.075)*1.9,0,1);m.y=travel(Math.sin(wave*Math.PI)*-12);m.opacity=.35+.65*out(wave);break}
  case 'stagger': m.opacity=o;m.y=travel((index%2?1:-1)*20*inv);break
  case 'float': m.opacity=o;m.y=travel(12*inv);m.scale=.98+.02*o;break
  case 'sweep': m.opacity=o;m.x=travel(24*inv);m.clip=o;break
  case 'mask': m.opacity=o;m.clip=o;break
  case 'tracking': m.opacity=o;m.spacing=travel(12*inv);break
  case 'focus': m.opacity=o;m.blur=12*inv;m.scale=.97+.03*o;break
  case 'pop': m.opacity=o;m.scale=.82+.18*out(local);break
  case 'drift': m.opacity=o;m.x=travel((seed-.5)*36*inv);m.y=travel((.5-seed)*18*inv);break
  case 'fold': m.opacity=o;m.rotateX=-48*inv;m.scale=.98+.02*o;break
  case 'glide': m.opacity=o;m.x=travel(28*inv);m.y=travel(7*inv);break
  case 'spotlight': m.opacity=.18+.82*o;m.blur=4*inv;m.scale=.99+.01*o;break
  case 'line-reveal': m.opacity=o;m.clip=o;break
  case 'line-cascade': m.opacity=o;m.y=travel(20*inv);m.scale=.99+.01*o;break
 }
 m.opacity=clamp(m.opacity,0,1);m.scale=clamp(m.scale,.2,2);m.blur=clamp(m.blur,0,24);m.clip=clamp(m.clip,0,1)
 // Normalize signed zero so strict consumers and CSS/canvas serializers receive a canonical neutral value.
 for (const key of Object.keys(m) as (keyof WordMotionSample)[]) {
  if (Object.is(m[key], -0)) m[key] = 0
 }
 return m
}

const effects: readonly {name:string;effect:WordAnimationEffect;duration:number;description:string}[]=[
 {name:'Word Cascade',effect:'cascade',duration:1050,description:'Words arrive in a refined editorial cascade with a soft baseline settle.'},
 {name:'Word Rise',effect:'rise',duration:950,description:'Each word rises smoothly into place with controlled spacing.'},
 {name:'Word Drop',effect:'drop',duration:950,description:'Words descend gently and settle into a clean headline.'},
 {name:'Word Fade',effect:'fade',duration:900,description:'A calm staggered opacity reveal for elegant titles.'},
 {name:'Word Slide Left',effect:'slide-left',duration:1000,description:'Words glide in from the right with consistent rhythm.'},
 {name:'Word Slide Right',effect:'slide-right',duration:1000,description:'Words glide in from the left with a soft finish.'},
 {name:'Word Zoom',effect:'zoom',duration:1000,description:'Each word scales up subtly without harsh overshoot.'},
 {name:'Word Soft Zoom',effect:'soft-zoom',duration:1050,description:'A restrained scale and focus transition for polished titles.'},
 {name:'Word Blur Reveal',effect:'blur',duration:1100,description:'Words resolve from soft defocus into crisp typography.'},
 {name:'Word Flip',effect:'flip',duration:1100,description:'A restrained 3D flip around the horizontal axis.'},
 {name:'Word Rotate',effect:'rotate',duration:1000,description:'Words rotate a few degrees into a stable baseline.'},
 {name:'Word Wave',effect:'wave',duration:1300,description:'A smooth travelling wave moves across the word sequence.'},
 {name:'Word Alternating Stagger',effect:'stagger',duration:1100,description:'Alternating words rise from opposite directions.'},
 {name:'Word Float',effect:'float',duration:1100,description:'Words float upward with a subtle, weightless settle.'},
 {name:'Word Sweep',effect:'sweep',duration:1100,description:'A directional sweep reveals each word as it glides in.'},
 {name:'Word Mask Reveal',effect:'mask',duration:1050,description:'Each word is uncovered through a precise clipped reveal.'},
 {name:'Word Tracking',effect:'tracking',duration:1100,description:'Expanded word spacing contracts into a balanced line.'},
 {name:'Word Focus',effect:'focus',duration:1150,description:'Words sharpen from soft focus while easing into position.'},
 {name:'Word Pop',effect:'pop',duration:950,description:'A small, controlled scale-in gives each word emphasis.'},
 {name:'Word Drift',effect:'drift',duration:1200,description:'Words drift from subtly varied positions into alignment.'},
 {name:'Word Fold',effect:'fold',duration:1100,description:'Words unfold from a gentle 3D tilt.'},
 {name:'Word Glide',effect:'glide',duration:1050,description:'A smooth diagonal glide lands each word on the baseline.'},
 {name:'Word Spotlight',effect:'spotlight',duration:1150,description:'A restrained focus spotlight brings each word forward.'},
 {name:'Line Reveal',effect:'line-reveal',duration:1250,description:'Complete lines reveal in sequence with a clean mask.'},
 {name:'Line Cascade',effect:'line-cascade',duration:1250,description:'Paragraph lines rise in an editorial cascade.'},
]

export const WORD_LINE_ANIMATIONS: readonly TextAnimationDefinition[] = effects.map((item,index)=>({
 id:'word-'+(126+index),name:item.name,category:'Word & Line',mode:'entrance',
 wordEffect:item.effect,defaultDurationMs:item.duration,defaultEasing:'premium-out',compositing:'replace',
 description:item.description,keyframes:[{at:0,opacity:1},{at:1,opacity:1}],
}))
