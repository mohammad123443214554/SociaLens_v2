export const OBJECT_ERASER_MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const ROBOFLOW_REQUEST_TIMEOUT_MS = 45_000
export const OBJECT_ERASER_DEFAULT_PROMPTS = [
  'person','face','animal','bird','cat','dog','car','bicycle','motorcycle','bus','truck',
  'phone','laptop','computer','camera','cup','mug','bottle','glass','plate','bowl','book',
  'bag','backpack','handbag','chair','table','sofa','plant','flower','tree','lamp',
  'shoe','hat','watch','jewelry','food','fruit','box','toy','remote control','keyboard',
  'mouse','screen','logo','sign','pen','pencil'
] as const

export type ObjectEraserImageType = 'image/jpeg' | 'image/png' | 'image/webp'
export type PreparedObjectEraserImage = { mimeType: ObjectEraserImageType; size: number; sha256: string; base64: string }
export type ObjectEraserDetection = { id: string; label: string; confidence: number; x: number; y: number; width: number; height: number }
export type RoboflowFailureCode = 'not_configured' | 'unauthorized' | 'quota_exceeded' | 'image_too_large' | 'model_not_found' | 'provider_unavailable' | 'request_timeout' | 'provider_error'
export class RoboflowRequestError extends Error {
  constructor(message: string, public readonly code: RoboflowFailureCode, public readonly status: number, public readonly retryable = false) { super(message); this.name = 'RoboflowRequestError' }
}
const SIGNATURES: Array<{mimeType:ObjectEraserImageType;matches:(b:Uint8Array)=>boolean}> = [
 {mimeType:'image/jpeg',matches:b=>b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255},
 {mimeType:'image/png',matches:b=>b.length>=8&&b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10},
 {mimeType:'image/webp',matches:b=>b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'}
]
export function detectObjectEraserImageType(bytes:Uint8Array):ObjectEraserImageType|null{return SIGNATURES.find(s=>s.matches(bytes))?.mimeType??null}
export async function prepareObjectEraserImage(file:File):Promise<PreparedObjectEraserImage>{
 if(!file||file.size<=0)throw new Error('Please choose a non-empty image.')
 if(file.size>OBJECT_ERASER_MAX_IMAGE_BYTES)throw new Error('Image is too large. Please use an image up to 4 MB.')
 const bytes=new Uint8Array(await file.arrayBuffer());const mimeType=detectObjectEraserImageType(bytes)
 if(!mimeType)throw new Error('Unsupported or invalid image. Use a JPEG, PNG, or WebP image.')
 if(file.type&&file.type!==mimeType)throw new Error('The image file type does not match its contents.')
 const digest=await crypto.subtle.digest('SHA-256',bytes)
 const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
 let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000))
 return {mimeType,size:bytes.byteLength,sha256,base64:btoa(binary)}
}
export function getRoboflowConfiguration(){return {configured:Boolean(process.env.ROBOFLOW_API_KEY?.trim()),provider:'roboflow' as const}}
export function getRoboflowRequestError(status:number):RoboflowRequestError{
 if(status===401||status===403)return new RoboflowRequestError('Roboflow rejected the API key. Check the Vercel environment variable.','unauthorized',status)
 if(status===402||status===429)return new RoboflowRequestError('Roboflow usage limit or quota has been reached. Check your workspace usage before retrying.','quota_exceeded',status)
 if(status===413)return new RoboflowRequestError('Roboflow rejected the image because it is too large.','image_too_large',status)
 if(status===404)return new RoboflowRequestError('The configured Roboflow model or endpoint was not found.','model_not_found',status)
 if(status>=500)return new RoboflowRequestError('Roboflow is temporarily unavailable. Please try again later.','provider_unavailable',status,true)
 return new RoboflowRequestError('Roboflow could not process this request.','provider_error',status,status===408)
}
export async function requestRoboflow(path:string,body:BodyInit,contentType:string){
 const apiKey=process.env.ROBOFLOW_API_KEY?.trim()
 if(!apiKey)throw new RoboflowRequestError('Roboflow is not configured yet.','not_configured',503)
 if(path!=='/grounding_dino/infer'&&path!=='/sam2/segment_image')throw new RoboflowRequestError('Invalid Roboflow endpoint configuration.','provider_error',500)
 const url=new URL(path,'https://serverless.roboflow.com');url.searchParams.set('api_key',apiKey)
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),ROBOFLOW_REQUEST_TIMEOUT_MS)
 try{
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':contentType},body,signal:controller.signal,cache:'no-store'})
  if(!response.ok){
   const mapped=getRoboflowRequestError(response.status)
   let providerDetail=''
   try{
    const raw=await response.text()
    if(raw){
     try{
      const parsed=JSON.parse(raw) as unknown
      if(typeof parsed==='object'&&parsed!==null){
       const record=parsed as Record<string,unknown>
       if(typeof record.message==='string')providerDetail=record.message
       else if(typeof record.detail==='string')providerDetail=record.detail
       else if(Array.isArray(record.detail))providerDetail=record.detail.map(item=>typeof item==='object'&&item!==null&&'msg' in item?String((item as {msg:unknown}).msg):'').filter(Boolean).join('; ')
       else providerDetail=raw
      }else providerDetail=raw
     }catch{providerDetail=raw}
    }
   }catch{}
   const safeDetail=providerDetail.replace(/https?:\/\/\S+/g,'[provider URL]').replace(/api_key=[^&\s]+/gi,'api_key=[redacted]').slice(0,500)
   throw new RoboflowRequestError(safeDetail?mapped.message+' Provider detail: '+safeDetail:mapped.message,mapped.code,mapped.status,mapped.retryable)
  }
  return response
 }catch(error){
  if(error instanceof RoboflowRequestError)throw error
  if(error instanceof Error&&error.name==='AbortError')throw new RoboflowRequestError('Roboflow took too long to respond. Please try again.','request_timeout',504,true)
  throw new RoboflowRequestError('Could not connect to Roboflow. Please try again later.','provider_unavailable',503,true)
 }finally{clearTimeout(timeout)}
}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null}
export function normalizeRoboflowDetections(payload:unknown,imageWidth:number,imageHeight:number):ObjectEraserDetection[]{
 if(!isRecord(payload))throw new RoboflowRequestError('Roboflow returned an invalid detection response.','provider_error',502)
 const raw=payload.predictions
 if(!Array.isArray(raw))throw new RoboflowRequestError('Roboflow response did not contain object predictions.','provider_error',502)
 const results:ObjectEraserDetection[]=[]
 for(const item of raw){
  if(!isRecord(item))continue
  const x=Number(item.x),y=Number(item.y),w=Number(item.width),h=Number(item.height)
  const confidence=Number(item.confidence??item.score)
  const label=String(item.class??item.label??'').trim()
  if(!label||![x,y,w,h,confidence].every(Number.isFinite)||w<=0||h<=0||confidence<0||confidence>1)continue
  const left=Math.max(0,Math.min(imageWidth,x-w/2)),top=Math.max(0,Math.min(imageHeight,y-h/2))
  const right=Math.max(left,Math.min(imageWidth,x+w/2)),bottom=Math.max(top,Math.min(imageHeight,y+h/2))
  if(right-left<1||bottom-top<1)continue
  results.push({id:String(results.length+1),label,confidence,x:left,y:top,width:right-left,height:bottom-top})
 }
 return results.sort((a,b)=>b.confidence-a.confidence).slice(0,100)
}


export type ObjectEraserSegmentation = { id:string; confidence:number; polygons:number[][][] }
function readMaskPoint(value:unknown):[number,number]|null{
 if(Array.isArray(value)&&value.length>=2){
  const x=Number(value[0]),y=Number(value[1])
  return Number.isFinite(x)&&Number.isFinite(y)?[x,y]:null
 }
 if(isRecord(value)){
  const x=Number(value.x??value.X??value.column??value.col)
  const y=Number(value.y??value.Y??value.row)
  return Number.isFinite(x)&&Number.isFinite(y)?[x,y]:null
 }
 return null
}
function collectMaskPolygons(value:unknown):number[][][]{
 const groups:number[][][]=[]
 const visited=new Set<unknown>()
 const visit=(node:unknown,depth=0):void=>{
  if(depth>12||node===null||node===undefined||visited.has(node))return
  if(typeof node==='object')visited.add(node)
  if(Array.isArray(node)){
   if(node.length>=3){
    const points=node.map(readMaskPoint)
    if(points.every((point):point is [number,number]=>point!==null)){
     groups.push(points.slice(0,30000));return
    }
   }
   for(const child of node)visit(child,depth+1)
   return
  }
  if(isRecord(node)){
   // Provider response wrappers have appeared as masks, mask, polygons,
   // coordinates, data, and segmentation depending on serialization format.
   for(const key of ['polygons','polygon','mask','masks','coordinates','contours','segmentation','data','points','xy']){
    if(key in node)visit(node[key],depth+1)
   }
  }
 }
 visit(value)
 return groups
}
export function normalizeRoboflowSegmentations(payload:unknown,detections:ObjectEraserDetection[]):ObjectEraserSegmentation[]{
 if(!isRecord(payload))throw new RoboflowRequestError('SAM 2 returned an invalid segmentation response.','provider_error',502)
 const rawPredictions=payload.predictions??payload.segmentations??payload.results
 if(!Array.isArray(rawPredictions))throw new RoboflowRequestError('SAM 2 response did not contain predictions.','provider_error',502)
 if(!rawPredictions.length)throw new RoboflowRequestError('SAM 2 returned no masks for the detected objects.','provider_error',502,true)
 const results:ObjectEraserSegmentation[]=[]
 const add=(entry:unknown,detection:ObjectEraserDetection,index:number)=>{
  if(!isRecord(entry))return
  const candidates=[entry.masks,entry.mask,entry.polygons,entry.segmentation,entry.contours,entry.coordinates,entry]
  let polygons:number[][][]=[]
  for(const candidate of candidates){
   polygons=collectMaskPolygons(candidate)
   if(polygons.length)break
  }
  if(!polygons.length)return
  const confidence=Number(entry.confidence??entry.score??1)
  results.push({id:detection.id,confidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):1,polygons})
 }
 // Roboflow's serverless SAM2 JSON response returns predictions with polygon
 // masks. Some deployments wrap all prompt masks into one prediction object;
 // others return one prediction per prompt.
 if(rawPredictions.length===detections.length){
  rawPredictions.forEach((entry,index)=>add(entry,detections[index],index))
 }else if(rawPredictions.length===1&&detections.length>1&&isRecord(rawPredictions[0])){
  const entry=rawPredictions[0]
  const masks=entry.masks??entry.mask
  if(Array.isArray(masks)&&masks.length===detections.length){
   masks.forEach((mask,index)=>add({masks:mask,confidence:entry.confidence},detections[index],index))
  }else add(entry,detections[0],0)
 }else{
  rawPredictions.slice(0,detections.length).forEach((entry,index)=>add(entry,detections[index],index))
 }
 if(!results.length)throw new RoboflowRequestError('SAM 2 returned mask data in an unsupported format. The provider response did not contain readable polygon coordinates.','provider_error',502,true)
 return results
}
