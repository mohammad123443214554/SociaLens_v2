import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeRoboflowSegmentations, OBJECT_ERASER_MAX_IMAGE_BYTES, prepareObjectEraserImage, requestRoboflow, RoboflowRequestError, type ObjectEraserDetection } from '@/lib/studio/object-eraser'

export const runtime='nodejs'
export const maxDuration=60
const NO_STORE_HEADERS={'Cache-Control':'no-store, max-age=0'}
const jsonError=(message:string,status:number,code?:string,retryable=false)=>NextResponse.json({ok:false,error:message,code,retryable},{status,headers:NO_STORE_HEADERS})
async function requireUser(){
 const supabase=await createClient()
 const {data:{user},error}=await supabase.auth.getUser()
 return error||!user?null:user
}
export async function POST(request:NextRequest){
 const user=await requireUser()
 if(!user)return jsonError('Please sign in to use Object Eraser.',401,'unauthorized')
 const length=Number(request.headers.get('content-length')||0)
 if(length>OBJECT_ERASER_MAX_IMAGE_BYTES+512*1024)return jsonError('Image upload is too large. Please use an image up to 4 MB.',413,'image_too_large')
 let form:FormData
 try{form=await request.formData()}catch{return jsonError('Could not read the segmentation upload. Please try again.',400,'invalid_upload')}
 const image=form.get('image')
 if(!(image instanceof File))return jsonError('Please attach the original image.',400,'missing_image')
 let detections:ObjectEraserDetection[]
 try{
  const parsed=JSON.parse(String(form.get('detections')||'[]'))
  if(!Array.isArray(parsed))return jsonError('Object detection data is invalid. Run detection again.',400,'invalid_detections')
  detections=parsed.slice(0,30).map((item,index)=>{
   if(!item||typeof item!=='object')throw new Error('Invalid object detection data.')
   const x=Number(item.x),y=Number(item.y),width=Number(item.width),height=Number(item.height),confidence=Number(item.confidence)
   const label=String(item.label||'').trim()
   if(!label||![x,y,width,height,confidence].every(Number.isFinite)||width<=0||height<=0)throw new Error('Invalid object detection data.')
   return {id:String(item.id||index+1),label,confidence,x,y,width,height}
  })
  if(!detections.length)return jsonError('No detected objects are available to isolate.',400,'no_detections')
 }catch(error){return jsonError(error instanceof Error?error.message:'Object detection data is invalid.',400,'invalid_detections')}
 try{
  const prepared=await prepareObjectEraserImage(image)
  const batches:Array<ObjectEraserDetection[]>=[]
  for(let index=0;index<detections.length;index+=5)batches.push(detections.slice(index,index+5))
  const settled=await Promise.allSettled(batches.map(async batch=>{
   const response=await requestRoboflow('/sam2/segment_image',JSON.stringify({
    id:crypto.randomUUID(),
    image:{type:'base64',value:prepared.base64},
    sam2_version_id:'hiera_large',
    format:'json',
    multimask_output:false,
    prompts:{prompts:batch.map(item=>({box:{x:item.x,y:item.y,width:item.width,height:item.height}}))}
   }),'application/json')
   let result:unknown
   try{result=await response.json()}catch{throw new RoboflowRequestError('SAM 2 returned unreadable mask data. Please retry segmentation.','provider_error',502,true)}
   return normalizeRoboflowSegmentations(result,batch)
  }))
  const segmentations=settled.flatMap(item=>item.status==='fulfilled'?item.value:[])
  const failedBatches=settled.filter(item=>item.status==='rejected').length
  if(!segmentations.length){
   const firstFailure=settled.find(item=>item.status==='rejected')
   const reason=firstFailure&&firstFailure.status==='rejected'?firstFailure.reason:null
   if(reason instanceof RoboflowRequestError)return jsonError(reason.message,reason.status,reason.code,reason.retryable)
   return jsonError('SAM 2 could not isolate these objects. Try detecting fewer objects or use manual selection.',502,'segmentation_failed',true)
  }
  return NextResponse.json({ok:true,provider:'roboflow',model:'SAM 2',image:{mimeType:prepared.mimeType,size:prepared.size,sha256:prepared.sha256},segmentations,count:segmentations.length,failedBatches,warning:failedBatches?'Some objects could not be isolated. The available cutouts are still shown.':undefined},{headers:NO_STORE_HEADERS})
 }catch(error){
  if(error instanceof RoboflowRequestError)return jsonError(error.message,error.status,error.code,error.retryable)
  const message=error instanceof Error?error.message:'Object segmentation failed.'
  return jsonError(message,400,'segmentation_failed')
 }
}
