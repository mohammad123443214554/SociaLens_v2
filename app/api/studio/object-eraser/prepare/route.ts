import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRoboflowConfiguration, OBJECT_ERASER_DEFAULT_PROMPTS, OBJECT_ERASER_MAX_IMAGE_BYTES, normalizeRoboflowDetections, prepareObjectEraserImage, requestRoboflow, RoboflowRequestError } from '@/lib/studio/object-eraser'

export const runtime = 'nodejs'
export const maxDuration = 60
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }
const jsonError = (message:string,status:number,code?:string,retryable=false) => NextResponse.json({ok:false,error:message,code,retryable},{status,headers:NO_STORE_HEADERS})

async function requireUser(){
 const supabase=await createClient()
 const {data:{user},error}=await supabase.auth.getUser()
 return error||!user?null:user
}
export async function GET(){
 const user=await requireUser()
 if(!user)return jsonError('Please sign in to use Object Eraser.',401,'unauthorized')
 return NextResponse.json({ok:true,provider:'roboflow',apiConfigured:getRoboflowConfiguration().configured,maxImageBytes:OBJECT_ERASER_MAX_IMAGE_BYTES,acceptedImageTypes:['image/jpeg','image/png','image/webp'],stage:'grounding-dino-detection'},{headers:NO_STORE_HEADERS})
}
export async function POST(request:NextRequest){
 const user=await requireUser()
 if(!user)return jsonError('Please sign in to use Object Eraser.',401,'unauthorized')
 if(!getRoboflowConfiguration().configured)return jsonError('AI detection is not configured yet. Add ROBOFLOW_API_KEY to Vercel Environment Variables.',503,'not_configured')
 const length=Number(request.headers.get('content-length')||0)
 if(length>OBJECT_ERASER_MAX_IMAGE_BYTES+256*1024)return jsonError('Image is too large. Please use an image up to 10 MB.',413,'image_too_large')
 let form:FormData
 try{form=await request.formData()}catch{return jsonError('Could not read the image upload. Please try again.',400,'invalid_upload')}
 const image=form.get('image')
 if(!(image instanceof File))return jsonError('Please attach an image using the image field.',400,'missing_image')
 const promptInput=String(form.get('prompts')||'').trim()
 const prompts=(promptInput?promptInput.split(/[,.\n]+/):[...OBJECT_ERASER_DEFAULT_PROMPTS])
  .map(item=>item.trim().toLowerCase()).filter(Boolean)
 const uniquePrompts=[...new Set(prompts)].slice(0,50)
 if(!uniquePrompts.length||uniquePrompts.some(item=>item.length>80))return jsonError('Enter between 1 and 50 object names. Each name must be 80 characters or fewer.',400,'invalid_prompt')
 try{
  const prepared=await prepareObjectEraserImage(image)
  const upstream=await requestRoboflow('/grounding_dino/infer',JSON.stringify({
   id: crypto.randomUUID(),
   image:{type:'base64',value:prepared.base64},
   text:uniquePrompts,
   box_threshold:0.28,
   text_threshold:0.22
  }),'application/json')
  let result:unknown
  try{result=await upstream.json()}catch{return jsonError('Roboflow returned unreadable detection data. Please try again.',502,'invalid_provider_response',true)}
  const payload=result as Record<string,unknown>
  const rawImageInfo=payload&&typeof payload==='object'?payload.image:undefined
  const imageInfo=Array.isArray(rawImageInfo)?(rawImageInfo[0] as Record<string,unknown>|undefined):(rawImageInfo as Record<string,unknown>|undefined)
  const width=Number(imageInfo?.width),height=Number(imageInfo?.height)
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return jsonError('Roboflow did not return valid image dimensions.',502,'invalid_provider_response',true)
  const detections=normalizeRoboflowDetections(result,width,height)
  return NextResponse.json({ok:true,provider:'roboflow',image:{mimeType:prepared.mimeType,size:prepared.size,sha256:prepared.sha256,width,height},detections,count:detections.length,promptCount:uniquePrompts.length,model:'Grounding DINO'},{headers:NO_STORE_HEADERS})
 }catch(error){
  if(error instanceof RoboflowRequestError)return jsonError(error.message,error.status,error.code,error.retryable)
  const message=error instanceof Error?error.message:'Image validation failed.'
  return jsonError(message,/too large/i.test(message)?413:400,/too large/i.test(message)?'image_too_large':'invalid_image')
 }
}
