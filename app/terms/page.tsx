'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ScrollText } from 'lucide-react'

const SECTIONS = [
  {
    title: `Acceptance of Terms`,
    body: `These Terms & Conditions ("Terms") are a legally binding agreement between you and SociaLens (the "Platform", "we", "us"), operated by Mohammad Khan ("Owner"). By creating an account, checking the "I agree to the Terms & Conditions and Privacy Policy" box at signup, or otherwise accessing or using SociaLens in any way, you affirmatively accept and agree to be legally bound by these Terms and by our Privacy Policy, in full and without modification.

Your acceptance is recorded against your account (including a timestamp) at the moment you sign up, and is treated as a valid electronic acceptance of a binding contract under applicable electronic contract and information technology law. If you do not agree to any part of these Terms, you must not create an account or use SociaLens in any way, and your only remedy is to stop using the Platform.`,
  },
  {
    title: `Eligibility & Age Requirement`,
    body: `You must be at least 13 years old, or the minimum age required in your country to consent to use of online services without parental approval, whichever is higher, to create an account or use SociaLens. By using SociaLens you represent and warrant that you meet this requirement and that all registration information you provide is truthful, accurate, and current.

If we discover or reasonably believe that an account belongs to someone below the required age, or that any registration information is false, misleading, or impersonates another person, we may suspend or terminate that account immediately without prior notice, and you will have no claim against us arising from that action.`,
  },
  {
    title: `Your Account & Security`,
    body: `You are solely responsible for maintaining the confidentiality of your login credentials (including any Archive/chat-lock password you set) and for all activity that occurs under your account, whether or not authorized by you. You must notify us promptly of any unauthorized access or security breach you become aware of.

SociaLens allows linking and switching between multiple accounts on one device for convenience; this does not change your individual responsibility for each account you control. We are not liable for any loss or damage arising from your failure to keep your credentials secure, including a forgotten Archive password, which we cannot recover or reset on your behalf.`,
  },
  {
    title: `Verification Badges`,
    body: `A verification badge (blue or yellow tick) indicates only that SociaLens has, in its sole discretion, made a determination about an account's identity or authenticity. It is not, and must not be represented as, an endorsement, certification, partnership, or approval of the account holder, their content, or their conduct by SociaLens. Badges may be granted, withheld, or removed by us at any time without explanation.`,
  },
  {
    title: `Acceptable Use Policy`,
    body: `You agree that you will NOT use SociaLens to: (a) post, share, or transmit content that is illegal, obscene, defamatory, threatening, hateful, or that constitutes harassment, bullying, or hate speech against any individual or group; (b) post or share any content depicting or sexualizing minors in any way — such content will be removed immediately upon discovery and reported to the appropriate law enforcement and child-safety authorities, and the responsible account will be permanently terminated without any appeal; (c) impersonate any person or entity, or misrepresent your affiliation with any person or entity; (d) spam, run bots, scrape data, or use any automated means to access, collect data from, or interact with SociaLens without our prior written consent; (e) upload viruses, malware, or any code intended to disrupt, damage, or gain unauthorized access to SociaLens or any user's device; (f) circumvent, disable, or interfere with security features, including the signup/login bot-check, content moderation, or account restriction/suspension mechanisms; (g) misuse the reporting system by filing knowingly false or malicious reports against other users; (h) use the Aperonix AI assistant, or the AI-assisted caption/hashtag generation feature, to create content that would itself violate any part of these Terms or applicable law; (i) misuse calling, messaging, or the Archive feature to harass, defraud, stalk, or record another person without their consent where such consent is legally required; (j) infringe any patent, trademark, trade secret, copyright, or other intellectual property or proprietary right of any party; or (k) engage in any activity that is unlawful in your jurisdiction or that of SociaLens.

This list is illustrative, not exhaustive. A violation of this Acceptable Use Policy is a material breach of these Terms and may result in content removal, temporary restriction of specific features, account suspension, permanent termination, and/or a report to law enforcement, at our sole discretion and without any obligation to give advance notice.`,
  },
  {
    title: `Content You Post`,
    body: `You retain all ownership rights you already have in the photos, videos, text, comments, voice messages, and other content you post or send on SociaLens ("User Content"). By posting or sending User Content, you grant SociaLens a worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to host, store, cache, reproduce, distribute, display, and adapt (e.g. compress or reformat) that User Content, solely to operate, provide, promote, and improve the Platform and to deliver it to the audience selected by your own privacy settings, for as long as it remains on SociaLens plus a reasonable period thereafter for backups and legal compliance.

You represent and warrant that you own or have all necessary rights, licenses, and consents (including from any other identifiable person shown) to post your User Content and to grant the license above, and that your User Content does not infringe or violate any third party's rights or any law. You are solely and fully responsible for your own User Content and the consequences of posting it.`,
  },
  {
    title: `AI Features (Aperonix)`,
    body: `SociaLens includes an AI assistant ("Aperonix") and AI-assisted content suggestions (e.g. auto-generated post titles, captions, and hashtags), powered by third-party AI technology. AI-generated output is provided for assistance and convenience only, may be inaccurate, incomplete, or inappropriate, and does not constitute professional, medical, legal, financial, or safety advice of any kind. You are solely responsible for reviewing and editing any AI-generated content before you rely on it or post it, and for the consequences of doing so.

Conversations with Aperonix may be processed by third-party AI providers and may be reviewed by us for safety, abuse-prevention, and service-improvement purposes, subject to our Privacy Policy. Using Aperonix to generate content that would violate our Acceptable Use Policy is itself a violation of these Terms.`,
  },
  {
    title: `Content Moderation & Our Rights`,
    body: `SociaLens has the absolute right, but not the obligation, to review, monitor, screen, remove, or refuse to display any User Content, at any time, with or without notice, for any reason or no reason, including but not limited to a suspected violation of these Terms, a user report, or a legal requirement. We are not obligated to review every piece of content and are not responsible for content we have not reviewed.

Nothing in these Terms obligates SociaLens to act as a publisher of User Content, and we act only as an intermediary/host for content posted by users, to the fullest extent recognized under applicable intermediary/safe-harbor law.`,
  },
  {
    title: `Reporting System`,
    body: `SociaLens provides tools to report posts, stories, comments, messages, and user accounts for review by our moderation team. Reports are reviewed at our discretion and within a reasonable time; we are not obligated to disclose the outcome of any report, the identity of a reporter, or our internal reasoning to any party. Deliberately filing false or malicious reports is itself a violation of these Terms and may result in restriction or suspension of the reporting account.`,
  },
  {
    title: `Restrictions, Suspension, Termination & Appeals`,
    body: `SociaLens reserves the sole and absolute right to: (a) temporarily restrict specific features of your account (such as posting, commenting, messaging, or posting stories) for a period of time we determine; (b) suspend your account entirely; or (c) permanently terminate and delete your account and all associated content and data — in each case, at any time, with or without prior notice, and without any liability to you, if we determine, in our sole discretion, that you have violated these Terms, our Privacy Policy, applicable law, or that your conduct poses a risk to SociaLens, other users, or any third party. You expressly acknowledge and agree that this discretion is a fundamental part of the bargain you accept by using SociaLens.

Where an account is suspended, SociaLens may, purely as a discretionary courtesy and not as an obligation, offer a one-time appeal window of twenty-four (24) hours from the time of suspension, during which the account holder may submit a password re-confirmation, a clear photograph, and a written explanation for review. SociaLens's admin team's decision to approve or reject an appeal is final and made at our sole discretion. If no appeal is submitted, or an appeal is submitted but not approved, before the appeal window closes, the account and all of its data will be permanently and irreversibly deleted by our automated systems; this is not a decision you may seek to reverse after the fact.

YOU AGREE THAT ANY RESTRICTION, SUSPENSION, TERMINATION, CONTENT REMOVAL, OR ACCOUNT DELETION CARRIED OUT BY SOCIALENS IN GOOD FAITH AND IN ACCORDANCE WITH THESE TERMS SHALL NOT GIVE RISE TO ANY CLAIM, CAUSE OF ACTION, LAWSUIT, OR DEMAND FOR COMPENSATION AGAINST SOCIALENS, ITS OWNER, EMPLOYEES, OR AFFILIATES, AND YOU IRREVOCABLY WAIVE, TO THE MAXIMUM EXTENT PERMITTED BY LAW, ANY SUCH CLAIM ARISING FROM OR RELATING TO A MODERATION ACTION TAKEN UNDER THIS SECTION. You acknowledge that continuing to use SociaLens after reading this section constitutes your informed and voluntary agreement to it.

You may delete your own account at any time from Settings, which is also permanent and immediate. Sections of these Terms that by their nature should survive termination (including Content License to already-distributed content, Indemnification, Disclaimers, Limitation of Liability, and Dispute Resolution) will survive any termination or deletion of your account.`,
  },
  {
    title: `Direct Messaging, Calls & Real-Time Features`,
    body: `SociaLens's chat and audio/video calling features are powered in part by third-party real-time communication infrastructure providers. SociaLens does not itself record or store the audio/video content of your calls, but we cannot control or guarantee that another participant in a call or chat will not record, screenshot, or otherwise capture it, and you use these features at your own risk in that respect. You are solely responsible for ensuring you have any consent required by law before recording or sharing a communication involving another person.

We do not guarantee uninterrupted, error-free, or lag-free call or messaging quality, as this depends on your device, network, and third-party infrastructure outside our control.`,
  },
  {
    title: `Stories & Ephemeral Content`,
    body: `Stories are designed to become inaccessible through the normal app interface after 24 hours. This is a display behavior, not a guarantee of permanent deletion or that other users have not viewed, screenshotted, or otherwise captured the content before it disappeared. SociaLens is not responsible for any further distribution of content that occurs after another user has viewed it.`,
  },
  {
    title: `Intellectual Property of SociaLens`,
    body: `The SociaLens name, logo, "Aperonix" branding, user interface, design, source code, and underlying software are the exclusive property of the Owner and/or SociaLens's licensors and are protected by applicable intellectual property laws. Except for the limited right to use SociaLens as intended through the app, nothing in these Terms grants you any right, title, or interest in SociaLens's intellectual property. You must not copy, modify, reverse-engineer, decompile, scrape, or create derivative works from SociaLens's software, design, or branding.`,
  },
  {
    title: `Copyright/Infringement Complaints`,
    body: `If you believe content on SociaLens infringes your copyright or other intellectual property rights, you may notify us through the contact details in this document, providing sufficient detail to identify the content and your rights. We will review and act on valid, good-faith complaints, which may include removing the content and/or restricting or terminating the account of a user found to be a repeat infringer.`,
  },
  {
    title: `Third-Party Services & Advertisements`,
    body: `SociaLens relies on third-party service providers to operate — including, without limitation, cloud database/authentication hosting, real-time call infrastructure, AI language-model providers, push-notification delivery, and advertising networks. These providers have their own terms and privacy practices, which we do not control. SociaLens may display advertisements from third-party advertising networks; we do not control the specific content of every advertisement shown, and any interaction you have with an advertisement or advertiser is solely between you and that advertiser. Attempting to artificially generate ad views/clicks (including on your own account) is prohibited and may result in suspension.`,
  },
  {
    title: `Personalization, Automated Ranking & Recommendations`,
    body: `The order in which posts, Reels, Stories, and suggested accounts are shown to you is determined by an automated system that takes into account signals such as your past activity (what you view, watch, like, comment on, save, share, or mark "Not Interested"), how recently content was posted, and general engagement and quality signals — it is not a simple chronological list. You acknowledge and agree that this is how SociaLens operates and that we may change, tune, or replace this system at any time without notice.

This system is designed to give newer or lesser-seen content a fair opportunity to be shown, in addition to already-popular content; we do not guarantee any particular level of reach, visibility, or engagement for any post, Reel, Story, or account, regardless of past performance.

To operate this system, SociaLens records and aggregates behavioral signals about how you interact with content (see our Privacy Policy for what is collected and how it is retained). By using SociaLens, you consent to this processing as a core part of how the Platform functions.`,
  },
  {
    title: `Public & External Sharing`,
    body: `SociaLens allows a post, a Reel, or an Aperonix reply to be shared outside the Platform entirely (via the "Share outside SociaLens" option), which generates a public link that anyone can open and view without creating an account or signing in, regardless of that content's in-app privacy/audience setting at the time it was shared. Once you share something this way, or once someone else with permission to view your content shares it this way, you acknowledge that the content behind that specific link may be viewed by anyone who has or discovers the link, for as long as that link remains active, and that SociaLens is not responsible for further redistribution of a link once it exists.

SociaLens also displays a status indicator (an "Active" or "Online" marker) on accounts, visible to others subject to your Status Privacy setting in Settings. You are responsible for configuring this setting according to your own preference; SociaLens is not liable for any inference someone else draws from your visible status.`,
  },
  {
    title: `Fees & Changes to the Service`,
    body: `SociaLens is currently provided free of charge. We may introduce paid features, subscriptions, or other charges in the future, with reasonable prior notice, and any such charges will be governed by additional terms presented to you at that time. We reserve the right to add, modify, suspend, or discontinue any feature or the Platform as a whole, at any time, with or without notice, and without any liability to you for doing so.`,
  },
  {
    title: `Disclaimer of Warranties`,
    body: `SOCIALENS IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, OR FREE OF HARMFUL CONTENT POSTED BY OTHER USERS, TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW. WE DO NOT ENDORSE AND ARE NOT RESPONSIBLE FOR ANY USER CONTENT, AND ANY RELIANCE YOU PLACE ON SUCH CONTENT, OR ON AI-GENERATED CONTENT, IS AT YOUR OWN RISK.`,
  },
  {
    title: `Limitation of Liability`,
    body: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, SOCIALENS, ITS OWNER, EMPLOYEES, AND AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, GOODWILL, FOLLOWERS, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO YOUR USE OF (OR INABILITY TO USE) SOCIALENS, INCLUDING ANY CONTENT REMOVAL, ACCOUNT RESTRICTION, SUSPENSION, OR TERMINATION, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR YOUR USE OF SOCIALENS SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNT, IF ANY, YOU PAID TO SOCIALENS IN THE TWELVE (12) MONTHS BEFORE THE CLAIM AROSE, OR (B) A NOMINAL SUM OF INR 1,000 (OR THE EQUIVALENT IN YOUR LOCAL CURRENCY), REFLECTING THAT SOCIALENS IS PROVIDED FREE OF CHARGE.`,
  },
  {
    title: `Indemnification`,
    body: `You agree to defend, indemnify, and hold harmless SociaLens, its Owner, employees, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising out of or related to: (a) your User Content; (b) your violation of these Terms or any applicable law; (c) your violation of any right of another person or entity; or (d) any dispute you have with another user, including any dispute arising from a call, chat, or in-person interaction facilitated through SociaLens.`,
  },
  {
    title: `Dispute Resolution, Arbitration & Class Action Waiver`,
    body: `Before initiating any formal proceeding, you agree to first contact us in writing with a description of the dispute and allow at least thirty (30) days for us to attempt to resolve it in good faith.

If a dispute is not resolved informally, you and SociaLens agree that it shall be referred to and finally resolved by binding arbitration under the Arbitration and Conciliation Act, 1996 (as amended), conducted by a sole arbitrator mutually appointed (or appointed per the Act if the parties cannot agree), seated in Indore, Madhya Pradesh, India, in the English language. The arbitrator's award shall be final and binding on both parties, subject only to the limited grounds for challenge available under applicable law. Nothing in this clause prevents either party from seeking urgent interim/injunctive relief from a competent court in respect of intellectual property infringement or unauthorized access to systems.

YOU AND SOCIALENS EACH AGREE THAT ANY PROCEEDING WILL BE CONDUCTED ONLY ON AN INDIVIDUAL BASIS AND NOT AS A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION, AND YOU EXPRESSLY WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS ACTION OR CLASS-WIDE ARBITRATION AGAINST SOCIALENS, TO THE MAXIMUM EXTENT PERMITTED BY LAW.`,
  },
  {
    title: `Governing Law & Jurisdiction`,
    body: `These Terms, and any dispute arising out of or in connection with them or your use of SociaLens, shall be governed by and construed in accordance with the laws of India, without regard to conflict-of-law principles. Subject to the Dispute Resolution clause above, the courts located in Indore, Madhya Pradesh, India shall have exclusive jurisdiction over any matter not required to be arbitrated.`,
  },
  {
    title: `Grievance Redressal (India)`,
    body: `In accordance with the Information Technology Act, 2000 and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, SociaLens has designated a Grievance Officer to address complaints regarding content on the Platform and violations of these Terms.

Grievance Officer: Mohammad Khan. You may reach the Grievance Officer using the contact details in the Contact section below. We will acknowledge a valid grievance within twenty-four (24) hours of receipt and endeavor to resolve it within fifteen (15) days, or such other timeline as required by applicable law.`,
  },
  {
    title: `Termination Effects & Survival`,
    body: `Upon termination of your account for any reason, your right to access and use SociaLens ends immediately. Provisions of these Terms which by their nature should survive termination — including but not limited to Content License (for content already lawfully distributed to others before deletion), Indemnification, Disclaimer of Warranties, Limitation of Liability, Dispute Resolution/Arbitration, and Governing Law — shall survive.`,
  },
  {
    title: `Changes to These Terms`,
    body: `We may revise these Terms from time to time. If we make material changes, we will make reasonable efforts to notify you (such as an in-app notice). Your continued use of SociaLens after any change to these Terms becomes effective constitutes your acceptance of the revised Terms. If you do not agree to the revised Terms, you must stop using SociaLens and may delete your account.`,
  },
  {
    title: `Severability & Entire Agreement`,
    body: `If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court or arbitrator of competent jurisdiction, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions will continue in full force and effect. These Terms, together with our Privacy Policy, constitute the entire agreement between you and SociaLens regarding your use of the Platform, and supersede any prior agreements.`,
  },
  {
    title: `Contact`,
    body: `For questions about these Terms, to file a grievance, or to report a violation, you can reach us via the SociaLens support/contact channel linked in the app, or by writing to the Grievance Officer named above.`,
  },
]

export default function TermsPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="font-semibold">Terms &amp; Conditions</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 flex items-center justify-center shrink-0">
            <ScrollText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Terms &amp; Conditions</h1>
            <p className="text-xs text-muted-foreground">Last updated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-6 mb-8 leading-relaxed">
          These Terms & Conditions govern your use of SociaLens. Please read them carefully.
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
          <Link href="/privacy-policy" className="text-pink-500 hover:underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  )
}
