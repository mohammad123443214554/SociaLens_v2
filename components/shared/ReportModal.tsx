'use client'

import { useState } from 'react'
import { X, Flag, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTrackEvent } from '@/lib/hooks/useTrackEvent'

export type ReportTargetType = 'post' | 'story' | 'comment' | 'story_comment' | 'message' | 'user'

interface ReportModalProps {
  reporterId: string
  reportedUserId: string
  targetType: ReportTargetType
  targetId?: string
  onClose: () => void
}

const REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'fake_account', label: 'Fake account' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'other', label: 'Other' },
]

// One modal, reused everywhere something can be reported - which table
// Column the target id goes into is decided from `targetType`.
export function ReportModal({ reporterId, reportedUserId, targetType, targetId, onClose }: ReportModalProps) {
  const supabase = createClient()
  const track = useTrackEvent()
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!reason) return
    if (reason === 'other' && !details.trim()) {
      setError('Please describe what the issue is.')
      return
    }
    setSubmitting(true)
    setError('')

    const row: Record<string, any> = {
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      target_type: targetType,
      reason,
      details: details.trim() || null,
    }
    if (targetType === 'post') row.post_id = targetId
    if (targetType === 'story') row.story_id = targetId
    if (targetType === 'comment') row.comment_id = targetId
    if (targetType === 'story_comment') row.story_comment_id = targetId
    if (targetType === 'message') row.message_id = targetId

    const { error: insertError } = await supabase.from('reports').insert(row)
    setSubmitting(false)
    if (insertError) {
      setError('Could not submit your report. Please try again.')
      return
    }
    setSubmitted(true)

    // Feeds into the ranking pipeline's spam/quality signal - only posts
    // and stories are ranked content, so a report on a comment/message/
    // user account (still fully recorded in `reports` above) doesn't have
    // a ranking target to attach to.
    if (targetType === 'post' && targetId) {
      track({ target_type: 'post', target_id: targetId, creator_id: reportedUserId, event_type: 'report' })
    } else if (targetType === 'story' && targetId) {
      track({ target_type: 'story', target_id: targetId, creator_id: reportedUserId, event_type: 'report' })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-red-500" />
            <p className="font-semibold text-sm">Report</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
            <div className="h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="font-semibold">Report submitted</p>
            <p className="text-sm text-muted-foreground">Thanks for letting us know - our team will take a look.</p>
            <button onClick={onClose} className="mt-2 px-5 py-2 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto p-4 space-y-1">
              <p className="text-xs text-muted-foreground mb-2">Why are you reporting this?</p>
              {REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm text-left transition-colors ${
                    reason === r.value ? 'bg-pink-500/10 text-pink-500 font-medium' : 'hover:bg-accent'
                  }`}
                >
                  {r.label}
                  {reason === r.value && <Check className="h-4 w-4" />}
                </button>
              ))}

              {reason === 'other' && (
                <textarea
                  autoFocus
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={3}
                  className="w-full mt-2 bg-muted rounded-xl px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500 resize-none"
                />
              )}

              {reason && reason !== 'other' && (
                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Add any extra detail (optional)"
                  rows={2}
                  className="w-full mt-2 bg-muted rounded-xl px-3 py-2 text-sm outline-none border border-transparent focus:border-pink-500 resize-none"
                />
              )}

              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            <div className="p-4 border-t shrink-0">
              <button
                onClick={handleSubmit}
                disabled={!reason || submitting}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
