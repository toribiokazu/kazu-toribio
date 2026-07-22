export type Work = {
  slug: string;
  title: string;
  tag: string;
  desc: string;
  problem: string;
  build: string;
  result: string;
  image?: string;
  url?: string;
};

export const works: Work[] = [
  {
    slug: "support-triage",
    title: "Support Triage",
    tag: "n8n · Groq AI · Airtable · Slack",
    desc: "An n8n automation that reads incoming email and SMS support requests, classifies them into six categories with a confidence score, drafts a reply for human review, and flags refunds or low-confidence messages in Slack immediately.",
    problem: "Customer support ran through one shared inbox where every message, billing question, login issue, or refund request, had to be read, sorted, and routed by hand. That works at low volume but breaks down as a business grows, leaving refunds unanswered and technical issues buried under general questions.",
    build: "Built an n8n workflow that normalizes email and SMS messages into one common format, checks for duplicates, classifies the request into one of six categories using Groq (Llama 3.3 70B) with a confidence score, validates that the AI output is actually usable before trusting it, drafts a reply for a human to review, logs everything to Airtable, and pings Slack immediately for refunds, low-confidence results, or anything that needs a second look.",
    result: "The AI assists but never decides, every draft is reviewed by a person before it reaches a customer, so the team gets a faster first response and a full record of every request, with the guarantee that a refund request never sits unanswered just because it landed in a busy inbox at the wrong time.",
    image: "/support-triage.webp",
    url: "https://github.com/toribiokazu/kazu-toribio/tree/main/support-triage",
  },
  {
    slug: "ai-lead-routing-workflow",
    title: "AI Lead Routing Workflow",
    tag: "n8n · GoHighLevel · Groq AI",
    desc: "Webhook-driven n8n workflow that qualifies inbound GHL leads with AI, tags them hot/warm/cold, creates opportunities and tasks, and pings Slack — cutting response time by 80%.",
    problem: "Inbound leads landing in GoHighLevel had no automatic qualification — every lead needed a person to read it, judge how hot it was, and manually create a follow-up task and opportunity, which slowed down response time and meant hot leads sat in the same queue as low-intent ones.",
    build: "Built a webhook-driven n8n workflow that receives new GHL leads, validates that a real email address came through before doing anything else, and uses Groq to score and tag each lead hot, warm, or cold. Hot leads get an opportunity and an urgent task created and are routed to an enterprise or SMB rep based on lead value; warm leads get tagged with a standard follow-up task; cold leads get tagged and auto-enrolled into a nurture workflow instead of going to a rep at all. Every outcome, including invalid leads that fail the email check, gets logged and posted to Slack so the sales team sees it in real time.",
    result: "Lead response time dropped by 80%, since hot leads are tagged, routed to the right rep, and flagged to the team automatically instead of waiting for manual triage — and nothing silently falls through the cracks, since even rejected leads are logged rather than dropped.",
    image: "/ai-lead-routing.webp",
    url: "https://github.com/toribiokazu/ai-lead-routing-ghl",
  },
  {
    slug: "xero-asana-transaction-export",
    title: "Xero → Asana Transaction Export",
    tag: "Make.com · Xero · Asana · Google Sheets",
    desc: "Make.com scenario that exports Xero account transactions to a CSV via Google Sheets and uploads it back to the originating Asana task as an attachment when marked complete.",
    problem: "Finance transactions from Xero needed to be manually exported and attached to the right Asana task whenever a task was marked complete — a repetitive, error-prone step in the bookkeeping workflow that ate into time better spent on actual reconciliation.",
    build: "Built a Make.com scenario that watches for a completed Asana task, calls the Xero API for the relevant account transactions, and routes the data down two paths: one iterates the transaction records into a temporary Google Sheets staging range, the other waits for that write to finish, pulls the completed range back out, aggregates it into CSV-ready text, and uploads it to the originating Asana task as an attachment. The staging range is cleared automatically at the end of every run so no leftover data carries into the next export.",
    result: "Removed the manual export-and-attach step entirely, so finished tasks always have a consistent, correctly formatted transaction record attached automatically — ready for accounting review and reconciliation without anyone touching Xero by hand.",
    image: "/xero-asana.webp",
    url: "https://github.com/toribiokazu/xero-asana-transaction-export-automation",
  },
  {
    slug: "email-nurture-system",
    title: "Email Nurture System",
    tag: "Mailchimp · Airtable",
    desc: "Built an automated email nurture system using n8n, Mailchimp, and Airtable to manage subscribers, organize campaigns, eliminate duplicate enrollments, and streamline marketing workflows.",
    problem: "Subscriber and campaign management was manual and prone to duplicate enrollments, making it hard to run consistent, organized nurture campaigns without contacts getting re-enrolled or dropped between systems.",
    build: "Built an n8n workflow that validates each incoming contact has a real email address, checks Airtable for an existing nurture record before doing anything else, and only then adds or updates the subscriber in Mailchimp and applies tags based on lead score and tier. Enrollment is logged to Airtable and posted to Slack for visibility, and the sequence itself is paced with built-in wait steps between touches instead of blasting every email at once.",
    result: "Marketing campaigns run on a streamlined, duplicate-free subscriber base with lead-tier-aware tagging and a full enrollment log, cutting down manual list cleanup and making it obvious in Slack who just entered a nurture sequence.",
    image: "/mailchimp-airtable.webp",
    url: "https://github.com/toribiokazu/email-nurture-system",
  },
  {
    slug: "wordpress-product-site",
    title: "WordPress Product Site",
    tag: "WordPress · SEO",
    desc: "Redesigned a WordPress website with optimized landing pages and automated GoHighLevel CRM integration for efficient lead capture and sales automation.",
    problem: "The existing WordPress site wasn't converting visitors into leads efficiently — page layouts weren't built around a clear conversion path, and there was no CRM automation connecting form submissions to sales follow-up, so leads that did come in still needed to be copied over and assigned by hand.",
    build: "Redesigned the site's landing pages around a conversion-focused structure and on-page SEO, then integrated GoHighLevel so every form submission is captured as a lead automatically, with no manual re-entry between the website and the CRM.",
    result: "Lead capture and sales follow-up became automated end-to-end, from the landing page to the CRM pipeline, so every submission is tracked and ready for follow-up the moment it comes in instead of sitting in an inbox waiting to be entered manually.",
    image: "/Wordpress-GHL.webp",
  },
  {
    slug: "crm-migration-cleanup",
    title: "CRM Migration & Cleanup",
    tag: "Zoho · GoHighLevel",
    desc: "Migrated 10,000+ contacts from Zoho to GoHighLevel, cleaned and standardized CRM data, restructured sales pipelines, and implemented improved workflows for a more efficient sales process.",
    problem: "The business needed to move off Zoho CRM to GoHighLevel, but the existing contact data was inconsistent — duplicate records, missing fields, and mismatched formatting built up over years — and the sales pipeline structure no longer matched how the team actually sold, so a straight lift-and-shift migration would have just carried the same problems into the new system.",
    build: "Migrated 10,000+ contacts from Zoho to GoHighLevel, cleaning, deduplicating, and standardizing fields during the move rather than after, then rebuilt the sales pipelines and stage structure from scratch to reflect the team's actual sales process instead of Zoho's legacy setup, and layered in workflows to automate the handoffs between stages.",
    result: "The team now runs on a single, clean CRM with pipelines and workflows built around how they actually sell — improving data quality and overall efficiency instead of just relocating the old mess into a new tool.",
    image: "/zoho-ghl.webp",
  },
  {
    slug: "ai-content-pipeline",
    title: "AI Content Pipeline",
    tag: "ChatGPT · Make",
    desc: "An AI-driven content pipeline built with ChatGPT, n8n, Airtable, Slack, and WordPress that automates content generation, review, approval, and publishing through a structured human-in-the-loop workflow.",
    problem: "Producing and publishing content consistently required manually generating drafts, chasing approvals, and publishing each piece by hand — slow, hard to scale, and easy to lose track of once more than one piece was in flight.",
    build: "Built an n8n pipeline that takes a content request (topic, audience, tone, keywords, CTA) through a webhook, validates a topic was actually provided, then uses ChatGPT to generate a structured content brief, draft the full piece, and run an AI quality check on its own output. The reviewable package lands in Airtable with a Pending Review status, a reviewer gets pinged in Slack, and the workflow waits and polls Airtable until the status changes. Only an explicit Approved status creates a WordPress draft post and fires a Slack confirmation; a Needs Revision status routes back to the reviewer instead of publishing.",
    result: "Content now moves through generation, an AI self-check, human review, and publishing as one connected workflow instead of a manual, ad hoc process — and nothing reaches WordPress without a person explicitly approving it in Airtable first.",
    image: "/ai-content-pipeline.webp",
    url: "https://github.com/toribiokazu/ai-content-pipeline",
  },
];
