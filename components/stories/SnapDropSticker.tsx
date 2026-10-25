'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ImagePlus, Upload, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { StorySnapDropOverlay } from '@/lib/types/database.types'

type Contribution = { id:string; user_id:string; storage_path:string; message:string; created_at:string; profiles?:{username:string;avatar_url:string|null}|null; imageUrl?:string }
export function SnapDropSticker({ snapdrop, storyId, userId, isOwner = false, onModalOpenChange }: { snapdrop:StorySnapDropOverlay; storyId:string; userId?:string; isOwner?:boolean; onModalOpenChange?: (open:boolean)=>void }) {
  const supabase = createClient()
  const [rows,setRows] = useState<Contribution[]>([])
  const [loading,setLoading] = useState(true)
  const [open,setOpen] = useState(false)
  const [gallery,setGallery] = useState(false)
  const [photo,setPhoto] = useState<File|null>(null)
  const [photoPreviewUrl,setPhotoPreviewUrl] = useState('')
  const [message,setMessage] = useState('')
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [dragging,setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selected,setSelected] = useState<Contribution|null>(null)
  useEffect(() => {
    if (!photo) { setPhotoPreviewUrl(''); return }
    const url = URL.createObjectURL(photo)
    setPhotoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const refresh = async () => {
    setLoading(true)
    let {data:prompt,error:promptError} = await (supabase as any).from('story_snapdrops').select('id').eq('story_id',storyId).eq('sticker_id',snapdrop.id).maybeSingle()
    // Older Stories may contain the sticker in their saved scene JSON but predate
    // the prompt row. Let the owner repair that missing row when viewing their Story.
    if (!prompt && !promptError && isOwner && userId) {
      const {data:createdPrompt,error:createPromptError} = await (supabase as any).from('story_snapdrops').insert({
        story_id:storyId, owner_id:userId, sticker_id:snapdrop.id, prompt:snapdrop.prompt,
      }).select('id').single()
      if (!createPromptError && createdPrompt) prompt = createdPrompt
      else promptError = createPromptError
    }
    if(promptError || !prompt){setRows([]);setLoading(false);return}
    const {data,error:readError} = await (supabase as any).from('story_snapdrop_contributions').select('id,user_id,storage_path,message,created_at').eq('snapdrop_id',prompt.id).order('created_at',{ascending:false}).limit(100)
    if(readError || !data){setRows([]);setLoading(false);return}
    const ids = Array.from(new Set(data.map((row:Contribution)=>row.user_id)))
    const {data:profiles} = await supabase.from('profiles').select('id,username,avatar_url').in('id',ids)
    const profileMap = new Map((profiles||[]).map(profile=>[profile.id,profile]))
    const hydrated = await Promise.all(data.map(async (row:Contribution) => {
      const {data:signed} = await supabase.storage.from('story-snapdrop').createSignedUrl(row.storage_path,120)
      return {...row,profiles:profileMap.get(row.user_id)||null,imageUrl:signed?.signedUrl || ''}
    }))
    setRows(hydrated.filter(row=>!!row.imageUrl));setLoading(false)
  }
  useEffect(()=>{void refresh()},[storyId,snapdrop.id])
  const myRow = rows.find(row=>row.user_id===userId)
  const submit = async () => {
    if(!userId || !photo || saving) return
    setSaving(true);setError('')
    try {
      if(!['image/jpeg','image/png','image/webp','image/gif'].includes(photo.type) || photo.size>10*1024*1024) throw new Error('Choose a JPG, PNG, WebP, or GIF image up to 10 MB.')
      const bitmap = await createImageBitmap(photo); bitmap.close()
      const {data:prompt,error:promptError} = await (supabase as any).from('story_snapdrops').select('id,owner_id').eq('story_id',storyId).eq('sticker_id',snapdrop.id).single()
      if(promptError || !prompt) throw new Error('This SnapDrop is unavailable or the Story has expired.')
      const path = userId+'/'+prompt.id+'/'+crypto.randomUUID()+'.'+(photo.type==='image/png'?'png':photo.type==='image/webp'?'webp':photo.type==='image/gif'?'gif':'jpg')
      const {error:uploadError} = await supabase.storage.from('story-snapdrop').upload(path,photo,{contentType:photo.type,upsert:false})
      if(uploadError) throw new Error('Photo upload failed. Please try again.')
      const payload={snapdrop_id:prompt.id,user_id:userId,storage_path:path,message:message.trim()}
      const {error:saveError} = myRow
        ? await (supabase as any).from('story_snapdrop_contributions').update({storage_path:path,message:message.trim(),updated_at:new Date().toISOString()}).eq('id',myRow.id).eq('user_id',userId)
        : await (supabase as any).from('story_snapdrop_contributions').insert(payload)
      if(saveError){await supabase.storage.from('story-snapdrop').remove([path]);throw new Error(saveError.code==='23505'?'You already contributed to this prompt. Refresh and edit your photo.':'Could not submit your photo. The Story may have expired or your access changed.')}
      if(myRow && myRow.storage_path!==path) await supabase.storage.from('story-snapdrop').remove([myRow.storage_path])
      setOpen(false);onModalOpenChange?.(false);setPhoto(null);setMessage('');await refresh()
    } catch(e) { setError(e instanceof Error?e.message:'Something went wrong. Please try again.') }
    finally {setSaving(false)}
  }
  const choose = async (file:File|null) => {setError('');if(!file)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){setError('Please choose a JPG, PNG, WebP, or GIF photo.');return}if(file.size>10*1024*1024){setError('Your photo must be 10 MB or smaller.');return}setPhoto(file);setMessage(myRow?.message||'')}
  const closeEditor = () => {if(saving)return;setOpen(false);onModalOpenChange?.(false);setPhoto(null);setError('')}
  const openEditor = () => {setPhoto(null);setError('');setMessage(myRow?.message||'');setOpen(true);onModalOpenChange?.(true)}
  const count = rows.length
  const displayed = rows.slice(0,3)
  return <>
    <div className="absolute z-[60] w-[min(250px,76vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-3 text-white shadow-xl" style={{left:snapdrop.x+'%',top:snapdrop.y+'%',backgroundColor:snapdrop.color||'#7c3aed',transform:'translate(-50%,-50%) rotate('+(snapdrop.rotation||0)+'deg) scale('+(snapdrop.scale||1)+')'}}>
      <p className="break-words text-center text-sm font-bold leading-snug">{snapdrop.prompt}</p>
      <div className="mt-2 flex items-center justify-center">
        {displayed.map((row,i)=><button key={row.id} type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setSelected(row)}} aria-label={'View photo from '+(row.profiles?.username||'participant')} className={'relative h-8 w-8 overflow-hidden rounded-full border-2 border-white bg-white/20 '+(i?' -ml-2':'')}><img src={row.imageUrl} alt="" className="h-full w-full object-cover"/></button>)}
        {count>3&&<button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setGallery(true)}} className="-ml-1 rounded-full border-2 border-white bg-black/30 px-2 py-1 text-[10px] font-bold">{count-3>99?'99+':'+'+(count-3)}</button>}
      </div>
      {userId && <button type="button" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();openEditor()}} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/70 bg-white px-3 py-2.5 text-xs font-extrabold text-violet-800 shadow-sm transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ImagePlus className="h-4 w-4"/>{myRow?'Change your photo':'Add your photo'}</button>}
      {!userId && <p className="mt-2 text-center text-[11px] font-semibold text-white">Sign in to add a photo</p>}
      <p className="mt-2 text-center text-[10px] text-white/80">{count} {count===1?'photo':'photos'} contributed</p>
    </div>
    {(open||gallery||selected)&&<div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={open?'Add SnapDrop photo':gallery?'SnapDrop gallery':'SnapDrop photo detail'} onClick={()=>{closeEditor();setGallery(false);setSelected(null);setError('')}}>
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-5 text-foreground shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold tracking-tight">{open?(myRow?'Edit your photo':'Add a photo'):gallery?'SnapDrop photos':snapdrop.prompt}</h2>{open&&<p className="mt-0.5 text-xs text-muted-foreground">Your contribution to this Story</p>}</div><button type="button" onClick={()=>{if(open){if(saving)return;closeEditor();return}setGallery(false);setSelected(null);setError('')}} aria-label="Close" className="rounded-full p-2 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-5 w-5"/></button></div>
        {open&&<><div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ImagePlus className="h-5 w-5"/></div><div><p className="text-sm font-semibold">{myRow?'Update your contribution':'Add your photo'}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Choose a photo to share with this Story. JPG, PNG, WebP or GIF · up to 10 MB.</p></div></div>{myRow?.imageUrl&&!photo&&<div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current photo</p><img src={myRow.imageUrl} alt="Your current contribution" className="max-h-56 w-full rounded-xl border border-border bg-muted object-contain"/></div>}<input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={e=>void choose(e.target.files?.[0]||null)}/><button type="button" onClick={()=>fileInputRef.current?.click()} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void choose(e.dataTransfer.files?.[0]||null)}} className={'mt-4 flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition '+(dragging?'border-primary bg-primary/10':'border-border bg-background hover:border-primary/60 hover:bg-muted/40')}><span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="h-5 w-5"/></span><span className="mt-3 text-sm font-bold">{photo?'Choose a different photo':'Choose a photo'}</span><span className="mt-1 text-xs text-muted-foreground">Click to browse or drag and drop here</span></button>{photo&&<div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4"/>Photo ready to upload</div><img src={photoPreviewUrl} alt="Selected photo preview" className="max-h-56 w-full rounded-xl object-contain"/><button type="button" onClick={()=>{setPhoto(null);if(fileInputRef.current)fileInputRef.current.value=''}} className="mt-2 text-xs font-semibold text-muted-foreground underline underline-offset-4">Remove selected photo</button></div>}<label htmlFor="snapdrop-message" className="mt-4 block text-sm font-semibold">Message <span className="font-normal text-muted-foreground">(optional)</span></label><textarea id="snapdrop-message" maxLength={300} value={message} onChange={e=>setMessage(e.target.value)} rows={3} placeholder="Write a short message…" className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"/><p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/300</p>{error&&<p role="alert" className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}<div className="mt-4 flex gap-2"><button type="button" disabled={saving} onClick={closeEditor} className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-semibold transition hover:bg-muted disabled:opacity-50">Cancel</button><button type="button" disabled={!photo||saving} onClick={()=>void submit()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}{saving?'Uploading photo…':'Upload photo'}</button></div></>}
        {gallery&&<div className="mt-4 grid grid-cols-3 gap-2">{rows.map(row=><button key={row.id} type="button" onClick={()=>{setGallery(false);setSelected(row)}} className="aspect-square overflow-hidden rounded-lg"><img src={row.imageUrl} alt={'Photo from '+(row.profiles?.username||'participant')} loading="lazy" className="h-full w-full object-cover"/></button>)}{!rows.length&&!loading&&<p className="col-span-3 py-8 text-center text-sm text-muted-foreground">No photos yet.</p>}{loading&&<div className="col-span-3 flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin"/></div>}</div>}
        {selected&&<div className="mt-4"><img src={selected.imageUrl} alt={'SnapDrop photo from '+(selected.profiles?.username||'participant')} className="max-h-[55dvh] w-full rounded-xl object-contain"/><p className="mt-3 text-sm font-semibold">@{selected.profiles?.username||'participant'}</p>{selected.message&&<p className="mt-1 whitespace-pre-wrap break-words text-sm">{selected.message}</p>}{selected.user_id===userId&&<button type="button" onClick={async()=>{const {error:delError}=await (supabase as any).from('story_snapdrop_contributions').delete().eq('id',selected.id).eq('user_id',userId);if(!delError){await supabase.storage.from('story-snapdrop').remove([selected.storage_path]);setSelected(null);await refresh()}}} className="mt-3 rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-500">Delete your photo</button>}</div>}
      </div>
    </div>}
  </>
}
