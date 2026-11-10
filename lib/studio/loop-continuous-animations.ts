import type { TextAnimationDefinition } from './animation-engine'

type LoopPreset = {
  name:string
  description:string
  duration:number
  frames:readonly {at:number;translateX?:number;translateY?:number;scaleX?:number;scaleY?:number;rotate?:number;rotateX?:number;rotateY?:number;skewX?:number;skewY?:number;opacity?:number;blur?:number;letterSpacing?:number}[]
}

const presets:readonly LoopPreset[]=[
 {name:'Gentle Pulse',description:'A soft breathing scale cycle with a seamless neutral handoff.',duration:2200,frames:[{at:0,scaleX:1,scaleY:1},{at:.5,scaleX:1.055,scaleY:1.055},{at:1,scaleX:1,scaleY:1}]},
 {name:'Soft Float',description:'A calm vertical drift that rises and returns without a visible jump.',duration:3000,frames:[{at:0,translateY:0},{at:.5,translateY:-9},{at:1,translateY:0}]},
 {name:'Side-to-Side Sway',description:'A balanced horizontal sway around the original anchor point.',duration:2600,frames:[{at:0,rotate:0},{at:.25,rotate:2.4},{at:.5,rotate:0},{at:.75,rotate:-2.4},{at:1,rotate:0}]},
 {name:'Slow Rock',description:'A relaxed rocking rhythm with gentle easing at each turnaround.',duration:3200,frames:[{at:0,rotate:0},{at:.5,rotate:3.2},{at:1,rotate:0}]},
 {name:'Heartbeat',description:'Two restrained scale accents followed by a longer resting beat.',duration:1800,frames:[{at:0,scaleX:1,scaleY:1},{at:.12,scaleX:1.09,scaleY:1.09},{at:.24,scaleX:1,scaleY:1},{at:.36,scaleX:1.06,scaleY:1.06},{at:.52,scaleX:1,scaleY:1},{at:1,scaleX:1,scaleY:1}]},
 {name:'Hover Lift',description:'A subtle lift and return that feels like a floating title card.',duration:2400,frames:[{at:0,translateY:0},{at:.45,translateY:-6},{at:1,translateY:0}]},
 {name:'Bobbing',description:'A smooth two-bob rhythm with a clean reset at the cycle boundary.',duration:2000,frames:[{at:0,translateY:0},{at:.25,translateY:-7},{at:.5,translateY:0},{at:.75,translateY:-4},{at:1,translateY:0}]},
 {name:'Orbit Tilt',description:'A tiny rotational orbit using balanced horizontal and vertical tilt.',duration:3600,frames:[{at:0,rotateX:0,rotateY:0},{at:.25,rotateX:3,rotateY:4},{at:.5,rotateX:0,rotateY:0},{at:.75,rotateX:-3,rotateY:-4},{at:1,rotateX:0,rotateY:0}]},
 {name:'Micro Wiggle',description:'A restrained quick wiggle designed to stay readable at small sizes.',duration:1100,frames:[{at:0,rotate:0},{at:.125,rotate:1.8},{at:.25,rotate:-1.8},{at:.375,rotate:1.5},{at:.5,rotate:-1.5},{at:.625,rotate:.8},{at:.75,rotate:-.8},{at:1,rotate:0}]},
 {name:'Pendulum',description:'A pendulum-like swing that eases through the center on every pass.',duration:2800,frames:[{at:0,rotate:0},{at:.5,rotate:5},{at:1,rotate:0}]},
 {name:'Slow Spin',description:'A continuous full rotation with a consistent angular velocity.',duration:5000,frames:[{at:0,rotate:0},{at:1,rotate:360}]},
 {name:'Counter Spin',description:'A continuous reverse rotation for a distinctive circular motion.',duration:5000,frames:[{at:0,rotate:0},{at:1,rotate:-360}]},
 {name:'Rocking Chair',description:'A gentle alternating tilt that returns to center between each side.',duration:2200,frames:[{at:0,rotate:0},{at:.25,rotate:2.2},{at:.5,rotate:0},{at:.75,rotate:-2.2},{at:1,rotate:0}]},
 {name:'Elastic Breath',description:'A slow inhale and exhale scale rhythm with no abrupt endpoint.',duration:3400,frames:[{at:0,scaleX:1,scaleY:1},{at:.5,scaleX:1.035,scaleY:1.035},{at:1,scaleX:1,scaleY:1}]},
 {name:'Glow Throb',description:'A subtle opacity pulse that never disappears or flashes.',duration:2100,frames:[{at:0,opacity:1},{at:.5,opacity:.78},{at:1,opacity:1}]},
 {name:'Focus Breathe',description:'A soft focus cycle using restrained blur and scale changes.',duration:2800,frames:[{at:0,blur:0,scaleX:1,scaleY:1},{at:.5,blur:.65,scaleX:1.015,scaleY:1.015},{at:1,blur:0,scaleX:1,scaleY:1}]},
 {name:'Tracking Drift',description:'Letter spacing gently opens and closes around the original typography.',duration:3000,frames:[{at:0,letterSpacing:0},{at:.5,letterSpacing:1.8},{at:1,letterSpacing:0}]},
 {name:'Perspective Rock',description:'A shallow 3D tilt that alternates depth without changing layout size.',duration:3000,frames:[{at:0,rotateX:0,rotateY:0},{at:.5,rotateX:4,rotateY:-4},{at:1,rotateX:0,rotateY:0}]},
 {name:'Skew Wave',description:'A small alternating skew that ripples through the title as one unit.',duration:2400,frames:[{at:0,skewX:0,skewY:0},{at:.5,skewX:3,skewY:-1.5},{at:1,skewX:0,skewY:0}]},
 {name:'Slide Loop',description:'A short horizontal glide that returns smoothly to its anchor position.',duration:2600,frames:[{at:0,translateX:0},{at:.5,translateX:8},{at:1,translateX:0}]},
 {name:'Vertical Drift',description:'A slow vertical travel cycle with a soft midpoint and no hard reset.',duration:3800,frames:[{at:0,translateY:0},{at:.5,translateY:7},{at:1,translateY:0}]},
 {name:'Zoom Breathing',description:'A barely-there zoom rhythm for emphasis without distracting from copy.',duration:3200,frames:[{at:0,scaleX:1,scaleY:1},{at:.5,scaleX:1.025,scaleY:1.025},{at:1,scaleX:1,scaleY:1}]},
 {name:'Diagonal Float',description:'A diagonal float that drifts away and returns to its exact anchor.',duration:3000,frames:[{at:0,translateX:0,translateY:0},{at:.5,translateX:5,translateY:-5},{at:1,translateX:0,translateY:0}]},
 {name:'Swinging Sign',description:'A sign-like pendulum with a smooth, controlled angular range.',duration:3600,frames:[{at:0,rotate:0},{at:.5,rotate:4.5},{at:1,rotate:0}]},
 {name:'Shimmer Pulse',description:'A restrained opacity and tracking shimmer that loops without flashing.',duration:2600,frames:[{at:0,opacity:1,letterSpacing:0},{at:.5,opacity:.88,letterSpacing:.8},{at:1,opacity:1,letterSpacing:0}]},
]

export const LOOP_CONTINUOUS_ANIMATIONS:readonly TextAnimationDefinition[]=presets.map((preset,index)=>({
 id:'loop-'+(176+index),name:preset.name,description:preset.description,category:'Loop & Continuous',
 mode:'loop',defaultDurationMs:preset.duration,defaultEasing:'linear',compositing:'replace',
 keyframes:preset.frames,
}))
