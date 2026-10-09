'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

const SECTIONS = [
  {
    title: `Introduction & Scope`,
    body: `This Privacy Policy explains how SociaLens ("we", "us", the "Platform"), operated by Mohammad Khan, collects, uses, stores, shares, and protects information when you create an account, use the app, or otherwise interact with SociaLens. By creating an account or using SociaLens, you acknowledge that you have read and understood this Privacy Policy and consent to the practices described in it, as also confirmed by your acceptance of our Terms & Conditions at signup.

If you do not agree with this Privacy Policy, you must not use SociaLens.`,
  },
  {
    title: `Information You Provide to Us`,
    body: `Account information: your username, email address, and password (stored in hashed/encrypted form by our authentication provider), or your Google account profile information if you sign up/log in with Google OAuth.

Profile information: your display name, bio, avatar photo, and cover photo.

Content you create: posts (photos, videos, text), Reels, Stories (including any music, stickers, text, or filters added to them), comments and comment reactions, direct messages, voice messages, and any files or media you upload or share, including into Archive (password-protected) chats.

Communications & support information: anything you send us directly, such as a report, a Contact Support message (your name, your message, and an optional photo or video attachment), an appeal, or a grievance, including — specifically for an account suspension appeal — a photograph of your face and a written letter, which we collect solely to verify and review your appeal.

Calls: when you make an audio/video call, connection metadata (such as who called whom, and call duration) is processed to connect and log the call through our real-time communication infrastructure providers; SociaLens does not itself record the audio or video content of your calls.

AI assistant conversations: messages you send to the Aperonix AI assistant, and any voice input you provide to it.`,
  },
  {
    title: `Information Collected Automatically`,
    body: `Device & usage data: IP address, device type, browser/app version, operating system, general log data (such as login times, crash reports, and feature usage) collected to operate, secure, and improve SociaLens.

Cookies & similar technologies: used for authentication/session management, remembering your preferences (like dark mode), and enabling core functionality; some third-party services we use (such as our bot-check/captcha provider and advertising networks) may also set their own cookies or similar identifiers subject to their own policies.

Push notification data: if you enable notifications, we store a device push subscription token (and related keys) needed to deliver notifications to your device; this does not include the content of your messages.

On-device face check: when you upload a photo for an account-suspension appeal, or in certain photo-editing tools, a face-detection check may run using an on-device library to confirm a clear, single face is present. This check runs in your browser and does not create, store, or transmit any biometric "face template" or facial-recognition profile to us or any third party — only the confirmation result (and the photo itself, where you submit it as part of an appeal) is used.`,
  },
  {
    title: `How We Use Your Information`,
    body: `We use the information described above to: create and manage your account; operate core features such as your feed, Stories, Reels, follow system, messaging, and calling; personalize your experience (e.g. your feed and suggestions) within the privacy settings you've chosen; power the Aperonix AI assistant and AI-assisted caption/hashtag suggestions; send you notifications you've opted into; detect, investigate, and prevent fraud, abuse, spam, and violations of our Terms & Conditions; review reports, restrictions, suspensions, and appeals; respond to your support requests and legal/grievance obligations; display advertisements; and comply with applicable law, legal process, or governmental requests.

We do not sell your personal information to third parties.`,
  },
  {
    title: `AI Processing (Aperonix & Content Generation)`,
    body: `Messages you send to Aperonix, and the media/instructions you provide for AI-assisted caption, title, or hashtag generation, are sent to third-party AI-model providers for processing in order to generate a response or suggestion. This data may be retained by us or our AI providers for a limited period for abuse prevention, safety review, debugging, and service improvement, subject to those providers' own data-handling practices. Do not share sensitive personal information (such as financial account details, government ID numbers, or health information) with Aperonix that you would not want processed this way.`,
  },
  {
    title: `How We Share Your Information`,
    body: `We share information only in the following circumstances: (a) with service providers who help us operate SociaLens, such as our database/authentication host, real-time call infrastructure providers, AI-model providers, push-notification delivery services, and bot-check/captcha providers — each bound to use the information only to provide their service to us; (b) with other users, to the extent you choose to share content and based on the privacy/audience settings you configure (e.g. who can see your posts, Stories, or profile); (c) publicly, when you or someone with permission to view your content uses the "Share outside SociaLens" option, which creates a link that anyone can open and view without an account, regardless of that content's normal audience setting — anyone with that link can view what it points to for as long as the link is active; (d) with advertising networks, who may use their own tracking technologies subject to their own privacy policies, to serve advertisements within SociaLens; (e) if required by law, regulation, legal process, or a valid governmental/law-enforcement request, including under the Information Technology Act, 2000 and its rules; (f) to protect the rights, property, or safety of SociaLens, our users, or the public, including enforcing our Terms & Conditions, investigating a report, or responding to a suspected violation of law (such as content involving harm to a minor, which we will proactively report to appropriate authorities); or (g) in connection with a merger, acquisition, or sale of assets, subject to this Privacy Policy (or its successor) continuing to apply.`,
  },
  {
    title: `Behavioral Data & Personalization`,
    body: `To rank and personalize what you see in your feed, Reels, Stories, and suggested accounts, SociaLens records interaction events such as views, watch time, completions, rewatches, likes, comments, saves, shares, follows, profile visits, skips, "Not Interested" marks, and reports. These raw events are kept only briefly (currently up to 30 days) and are then automatically deleted; before deletion, they are folded into longer-lived aggregate signals (such as an overall engagement/quality score on a post, or a running sense of which creators and topics you tend to engage with) that do not require keeping the underlying raw event log.

These aggregate signals are used only to operate SociaLens's personalization and safety systems (including detecting spam or inauthentic engagement) and are not sold or shared with third parties. You can influence them at any time by how you use SociaLens, including by marking content "Not Interested."`,
  },
  {
    title: `Your Privacy Controls`,
    body: `You control who sees your content and how you're found on SociaLens from Settings → Privacy Settings → Account Privacy, including separate controls for who can see your posts, who can message you, who can see your Story, who can call you, who can see your Active/Online status, and who can find you in search or suggestions (Everyone, Followers, Following, Selected People, or No One), plus a master "Private Account" toggle that requires your approval for new followers. You also control notification preferences from Settings → Privacy Settings → Notifications, can block or hide your content from specific people, and can report content or accounts you believe violate our Terms.`,
  },
  {
    title: `Data Retention`,
    body: `We retain your information for as long as your account remains active, and for a reasonable period afterward as needed to comply with legal obligations, resolve disputes, enforce our agreements, and maintain backups. Content you delete (a post, a story after it expires, a message) is generally removed from active display promptly, but backup copies may persist for a limited period before being purged. Suspension-appeal materials (your submitted photo and letter) are retained only as long as reasonably necessary to process the appeal and to maintain a moderation record, and are handled as sensitive information.`,
  },
  {
    title: `Data Deletion`,
    body: `You may permanently delete your account at any time from Settings → General Settings → Delete Account. Doing so triggers an irreversible process that removes your profile, posts, stories, comments, likes, follows, messages, and other associated data from our active systems, along with the associated media files in storage, and finally removes your login credentials entirely. An account that is suspended and not successfully appealed within the 24-hour appeal window is deleted the same permanent way, automatically, by our systems. Because this deletion is immediate and irreversible, we cannot restore your account or its data once this process has completed.`,
  },
  {
    title: `Data Security`,
    body: `We use reasonable administrative, technical, and physical safeguards designed to protect your information, including encrypted transmission (HTTPS/TLS), access controls on our database (row-level security), and hashed storage of passwords/archive PINs by our authentication provider. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security. You are responsible for keeping your own login credentials and Archive password confidential.`,
  },
  {
    title: `International Data Transfers`,
    body: `Our service providers (including cloud hosting, AI, and communication infrastructure providers) may store or process data in countries other than your own. Where this occurs, we take reasonable steps to ensure your information continues to receive an appropriate level of protection consistent with this Privacy Policy and applicable law.`,
  },
  {
    title: `Third-Party Services`,
    body: `SociaLens integrates third-party services including, without limitation, cloud database/authentication and storage hosting, Google OAuth sign-in, real-time audio/video call infrastructure providers, AI-model providers powering Aperonix and content generation, web-push notification delivery, bot-check/captcha verification, and third-party advertising networks. Each of these providers processes data under its own privacy policy and terms, which we encourage you to review; SociaLens is not responsible for the independent privacy practices of these third parties.`,
  },
  {
    title: `Advertising`,
    body: `SociaLens may display advertisements served by third-party advertising networks in certain areas of the app, such as within the Reels feed. These networks may use cookies, device identifiers, or similar technology to serve and measure ads, subject to their own privacy policies. We do not share your private messages, calls, or Archive contents with advertisers.`,
  },
  {
    title: `Children's Privacy`,
    body: `SociaLens is not directed at, and is not intended for use by, children under 13 years of age (or the higher minimum age required by your local law). We do not knowingly collect personal information from children below that age. If we become aware that we have collected personal information from a child below the applicable minimum age, we will take steps to delete that information and, where appropriate, terminate the associated account.`,
  },
  {
    title: `Your Rights`,
    body: `Subject to applicable law, you may have rights to access, correct, or request deletion of your personal information, to object to or restrict certain processing, and to withdraw consent where processing is based on consent (noting that withdrawing consent may mean you can no longer use SociaLens, since consent to this Policy is required to use the Platform). Most of these rights can be exercised directly within the app (Edit Profile, Privacy Settings, Delete Account); for anything else, you may contact us using the details in the Contact section below. We may need to verify your identity before acting on a request.`,
  },
  {
    title: `Grievance Officer & Regulatory Contact (India)`,
    body: `In accordance with the Information Technology Act, 2000 and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, privacy-related grievances may be directed to our designated Grievance Officer, Mohammad Khan, using the contact details below. We will acknowledge a valid grievance within twenty-four (24) hours and endeavor to resolve it within fifteen (15) days, or such other timeline as required by applicable law.`,
  },
  {
    title: `Changes to This Policy`,
    body: `We may update this Privacy Policy from time to time to reflect changes in our practices, features, or legal requirements. If we make material changes, we will make reasonable efforts to notify you, such as through an in-app notice. Your continued use of SociaLens after a change becomes effective constitutes your acceptance of the revised Privacy Policy.`,
  },
  {
    title: `Contact`,
    body: `For questions, requests, or grievances about this Privacy Policy or how your information is handled, please reach us via the SociaLens support/contact channel linked in the app, or by writing to the Grievance Officer named above. See also our Terms & Conditions for the legal terms governing your use of SociaLens.`,
  },
]

export default function PrivacyPolicyPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold">Privacy Policy</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Privacy Policy</h1>
            <p className="text-xs text-muted-foreground">Last updated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-6 mb-8 leading-relaxed">
          This Privacy Policy explains what information SociaLens collects, how it's used, and the controls you have over your own data.
        </p>

        <div className="space-y-3">
          {SECTIONS.map((section, i) => (
            <div key={section.title} className="rounded-2xl border p-5">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-xs font-semibold text-pink-500">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="font-semibold text-sm">{section.title}</h2>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
                {section.body.split('\n\n').map((para, pi) => (
                  <p key={pi}>{para}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-8 pt-6 border-t leading-relaxed">
          This is a general template, not a substitute for legal advice. Consider having it reviewed by a qualified lawyer for your specific jurisdiction and use case. See also our{' '}
          <Link href="/terms" className="text-pink-500 hover:underline">Terms &amp; Conditions</Link>.
        </p>
      </main>
    </div>
  )
}
