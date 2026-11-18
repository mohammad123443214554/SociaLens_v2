import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime='nodejs'
export const maxDuration=60
const MODEL='fal-ai/qwen-image-edit/inpaint'
const NO_STORE={'Cache-Control':'no-store, max-age=0'}
const fail=(message:string,status:number,code:string)=>NextResponse.json({ok:false,error:message,code},{status,headers:NO_STORE})

async function getUser(){
 const supabase=await createClient()
 const {data:{user},error}=await supabase.auth.getUser()
 return error||!user?null:user
}
function safeFalError(payload:unknown,fallback:string){
 if(payload&&typeof payload==='object'){
  const record=payload as Record<string,unknown>
  const detail=typeof record.detail==='string'?record.detail:typeof record.message==='string'?record.message:typeof record.error==='string'?record.error:''
  if(detail)return detail.replace(/https?:\/\/\S+/g,'[provider URL]').slice(0,400)
 }
 return fallback
}
export async function POST(request:NextRequest){
 const user=await getUser()
 if(!user)return fail('Please sign in to use AI object removal.',401,'unauthorized')
 const key=process.env.FAL_KEY?.trim()
 if(!key)return fail('AI object removal is not configured. Add FAL_KEY to Vercel Environment Variables.',503,'not_configured')
 const length=Number(request.headers.get('content-length')||0)
 if(length>3*1024*1024)return fail('The object mask is too large. Please run detection again.',413,'mask_too_large')
 let body:Record<string,unknown>
 try{body=await request.json()}catch{return fail('Invalid AI removal request.',400,'invalid_request')}
 const storagePath=typeof body.storagePath==='string'?body.storagePath:''
 const projectId=typeof body.projectId==='string'?body.projectId:''
 const label=typeof body.label==='string'?body.label.slice(0,60):'object'
 const maskDataUrl=typeof body.maskDataUrl==='string'?body.maskDataUrl:''
 if(!projectId||projectId.length>100||!storagePath.startsWith(user.id+'/'+projectId+'/'))return fail('The selected Studio image does not belong to this project.',403,'invalid_asset')
 if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(maskDataUrl)||maskDataUrl.length>2_500_000)return fail('The object mask is invalid or too large. Please detect the object again.',400,'invalid_mask')
 const supabase=await createClient()
 const {data:signed,error:signedError}=await supabase.storage.from('studio-projects').createSignedUrl(storagePath,60*60)
 if(signedError||!signed?.signedUrl)return fail('Could not securely prepare the selected image for AI editing.',400,'asset_unavailable')
 const prompt='Remove the '+label+' selected by the white mask. Reconstruct only the masked region so it blends seamlessly with the surrounding original photograph. Continue nearby textures, patterns, edges, lighting, shadows, perspective and depth naturally. Preserve every unmasked pixel and all other objects exactly. Do not add new objects, text, logos or decorations.'
 let response:Response
 try{
  response=await fetch('https://queue.fal.run/'+MODEL,{
   method:'POST',
   headers:{Authorization:'Key '+key,'Content-Type':'application/json','X-Fal-Store-IO':'0','X-Fal-Object-Lifecycle-Preference':JSON.stringify({expiration_duration_seconds:3600})},
   body:JSON.stringify({prompt,image_url:signed.signedUrl,mask_url:maskDataUrl,output_format:'png',num_images:1,strength:0.93,acceleration:'regular'})
  })
 }catch{return fail('Could not connect to the AI image editing service. Please try again.',503,'provider_unavailable')}
 let payload:unknown
 try{payload=await response.json()}catch{payload=null}
 if(!response.ok)return fail(safeFalError(payload,'AI image editing request failed.'),response.status>=500?503:response.status,'provider_error')
 const requestId=payload&&typeof payload==='object'?(payload as Record<string,unknown>).request_id:null
 if(typeof requestId!=='string'||! /^[0-9a-f-]{36}$/i.test(requestId))return fail('AI service returned an invalid request identifier.',502,'invalid_provider_response')
 return NextResponse.json({ok:true,requestId,model:MODEL},{headers:NO_STORE})
}
export async function GET(request:NextRequest){
 const user=await getUser()
 if(!user)return fail('Please sign in to check AI object removal.',401,'unauthorized')
 const key=process.env.FAL_KEY?.trim()
 if(!key)return fail('AI object removal is not configured. Add FAL_KEY to Vercel Environment Variables.',503,'not_configured')
 const requestId=request.nextUrl.searchParams.get('requestId')||''
 if(!/^[0-9a-f-]{36}$/i.test(requestId))return fail('Invalid AI removal request identifier.',400,'invalid_request')
 const base='https://queue.fal.run/fal-ai/qwen-image-edit/requests/'+requestId
 let statusResponse:Response
 try{statusResponse=await fetch(base+'/status',{headers:{Authorization:'Key '+key},cache:'no-store'})}
 catch{return fail('Could not check AI editing progress. Please retry.',503,'provider_unavailable')}
 let status:unknown
 try{status=await statusResponse.json()}catch{status=null}
 if(!statusResponse.ok)return fail(safeFalError(status,'Could not check AI editing progress.'),statusResponse.status>=500?503:statusResponse.status,'provider_error')
 const state=status&&typeof status==='object'?(status as Record<string,unknown>).status:null
 if(state!=='COMPLETED')return NextResponse.json({ok:true,status:state==='IN_PROGRESS'?'IN_PROGRESS':'IN_QUEUE'},{headers:NO_STORE})
 if(status&&typeof status==='object'&&(status as Record<string,unknown>).error)return fail(safeFalError(status,'AI image editing failed.'),502,'inference_failed')
 let resultResponse:Response
 try{resultResponse=await fetch(base,{headers:{Authorization:'Key '+key},cache:'no-store'})}
 catch{return fail('AI editing finished but its result could not be retrieved.',503,'result_unavailable')}
 let result:unknown
 try{result=await resultResponse.json()}catch{result=null}
 if(!resultResponse.ok)return fail(safeFalError(result,'Could not retrieve the edited image.'),502,'result_unavailable')
 const images=result&&typeof result==='object'?(result as Record<string,unknown>).images:null
 const first=Array.isArray(images)?images[0]:null
 const imageUrl=first&&typeof first==='object'?(first as Record<string,unknown>).url:null
 if(typeof imageUrl!=='string'||!imageUrl.startsWith('https://'))return fail('AI service did not return an edited image.',502,'invalid_provider_response')
 return NextResponse.json({ok:true,status:'COMPLETED',imageUrl},{headers:NO_STORE})
}
