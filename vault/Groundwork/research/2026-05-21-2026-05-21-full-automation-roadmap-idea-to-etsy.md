# 2026-05-21 Full Automation Roadmap - Idea to Etsy
_2026-05-21_

# Full Automation Roadmap: Idea → Etsy Listing
**Goal:** Sam says "blueprint cheat sheet," Vex ships it to Etsy. Sam only reviews/approves.

---

## PHASE 1: Infrastructure Setup (One-Time, 15–25 hours)

### 1.1 Etsy API Connection
**What it does:** Lets Vex create listings, upload files, set prices, manage inventory.

**Steps:**
1. Go to https://www.etsy.com/developers/register
2. Create an Etsy app (name: "Groundwork Automation")
3. Get your API key and shared secret
4. Set up OAuth 2.0 flow to authorize your shop
5. Store access token + refresh token securely (environment variables)

**Tech needed:**
- Etsy API v3 (REST)
- OAuth library (Python `requests-oauthlib` or Node `passport`)

**Claude Code Prompt #1: Etsy OAuth Setup**
```
You are building an Etsy API integration for a product automation system.

Requirements:
- Language: Python 3.11
- Use requests-oauthlib library
- Implement OAuth 2.0 flow for Etsy API v3
- Store access_token and refresh_token to environment file
- Include token refresh logic (Etsy tokens expire after 3600 seconds)
- Functions needed:
  * get_authorization_url() → returns URL for user to authorize
  * exchange_code_for_token(code) → completes OAuth flow
  * refresh_access_token() → auto-refreshes when expired
  * test_connection() → verifies connection works

Output full working script with instructions for first-time setup.
```

---

### 1.2 File Generation System
**What it does:** Takes product specs → generates PDF/spreadsheet/printable files.

**Tech Stack Decision:**
- **Option A (Code-based, free):** Python ReportLab (PDF) + openpyxl (Excel)
- **Option B (Template-based, $12/mo):** Canva API (prettier, faster)
- **Recommendation:** Start with Option A, upgrade later if needed

**Claude Code Prompt #2: PDF Generator**
```
You are building a product file generator for digital products (templates, cheat sheets, planners).

Requirements:
- Language: Python 3.11
- Use ReportLab for PDF generation
- Use openpyxl for Excel/Google Sheets format
- Input: JSON spec with:
  * product_type (cheatsheet, planner, worksheet, template)
  * title
  * sections (array of content blocks)
  * design_style (minimal, bold, colorful, professional)
  * brand_colors (hex codes)
  
- Output: Generated files saved to /output/{product_name}/

Functions needed:
- generate_pdf(spec) → creates formatted PDF
- generate_spreadsheet(spec) → creates Excel file
- apply_brand_styling(doc, style) → consistent look

Include 3 example templates:
1. Cheat sheet (1-page reference)
2. Planner (multi-page with fillable fields)
3. Worksheet (interactive checklist)

Make it modular so new templates can be added easily.
```

---

### 1.3 Storage System
**What it does:** Hosts generated files so Etsy can download them.

**Options:**
- **Google Drive API** (15GB free)
- **Dropbox API** (2GB free, easier)
- **AWS S3** ($0.023/GB, most reliable)

**Recommendation:** Google Drive (free, reliable, Sam probably has account)

**Claude Code Prompt #3: Google Drive Uploader**
```
You are building a Google Drive file management system for digital product automation.

Requirements:
- Language: Python 3.11
- Use Google Drive API v3
- Authentication: Service account (no user interaction needed)
- Functions needed:
  * authenticate() → connects using service account JSON
  * upload_file(file_path, folder_name) → uploads and returns shareable link
  * create_product_folder(product_name) → organizes by product
  * set_public_permissions(file_id) → makes file downloadable via link
  * get_download_url(file_id) → returns direct download URL for Etsy

Include setup instructions for:
1. Creating Google Cloud project
2. Enabling Drive API
3. Creating service account
4. Downloading credentials JSON

Output full working script with error handling.
```

---

### 1.4 Webhook System (Vex → Automation)
**What it does:** When Vex says "generate product X," trigger the automation chain.

**Tech:** 
- Make.com (free tier: 1000 operations/mo) OR
- n8n (self-hosted, fully free) OR
- Custom Flask API (20 lines of code)

**Recommendation:** Custom Flask API (you control everything, zero cost)

**Claude Code Prompt #4: Webhook Receiver & Orchestrator**
```
You are building a webhook server that receives product commands from Vex and orchestrates the automation pipeline.

Requirements:
- Language: Python 3.11
- Framework: Flask (lightweight API)
- Endpoint: POST /trigger_product
- Input JSON:
  {
    "action": "generate_product",
    "product_name": "Blueprint Reading Cheat Sheet",
    "product_type": "cheatsheet",
    "price": 8.99,
    "files": [list of file specs],
    "listing_copy": {full Etsy description},
    "tags": [array],
    "images": [URLs from Iris]
  }

Workflow on receive:
1. Validate payload
2. Call file generator (from Prompt #2)
3. Upload files to Google Drive (from Prompt #3)
4. Create Etsy listing (from Prompt #1)
5. Return success report with Etsy listing URL

Include:
- Error handling & rollback (if Etsy fails, don't leave orphan files)
- Logging (save to /logs/{date}.txt)
- Status endpoint GET /status/{product_name}

Deploy instructions for running 24/7 (PythonAnywhere free tier or Render.com)
```

---

## PHASE 2: Vex Integration (Sam does this part once)

### 2.1 Give Vex Webhook Access
Sam needs to add this to my system config:
```json
{
  "automation_webhook": "https://your-webhook-url.com/trigger_product",
  "api_key": "your_secret_key_here"
}
```

Then I can call it whenever you approve a product.

---

### 2.2 Connect My Existing Tools
Right now I have:
- `queue_maya_task` (research)
- `trigger_iris` (image generation)
- `trigger_rex` (marketing copy)

**New tool needed:** `launch_product`

**Claude Code Prompt #5: Add launch_product Tool to Vex**
```
You are adding a new function to Vex's tool suite that triggers the full product automation pipeline.

Function signature:
launch_product(product_name, product_type, price, listing_copy, photo_urls, tags, file_specs)

What it does:
1. Formats all inputs into webhook payload
2. Sends POST request to automation webhook
3. Returns Etsy listing URL or error message

Implementation:
- Language: Python (matches Vex's existing stack)
- Use requests library
- Include retry logic (3 attempts with exponential backoff)
- Validate all inputs before sending
- Log to Vex's activity log

Return format:
{
  "success": true,
  "etsy_url": "https://etsy.com/listing/123456789",
  "files_generated": ["cheatsheet.pdf"],
  "drive_folder": "https://drive.google.com/..."
}

Output the full function code ready to add to Vex's tools.py file.
```

---

## PHASE 3: Workflow Design (How It Actually Works)

### The Full Cycle (30 seconds from approval to live)

**Step 1: Sam gives idea**
> "I want a blueprint reading cheat sheet"

**Step 2: Vex researches (existing tools)**
- Calls `queue_maya_task("MODE 1: blueprint cheat sheet Etsy demand, pricing, keywords")`
- Maya delivers GO/NO-GO report

**Step 3: Sam approves**
> "Yes, make it"

**Step 4: Vex generates assets (existing tools)**
- Calls `trigger_iris("blueprint cheat sheet", "3 photo briefs...")`
- Calls `trigger_rex("blueprint cheat sheet", "Etsy listing copy...")`

**Step 5: Vex assembles & ships (NEW)**
- Waits for Iris + Rex to finish
- Calls `launch_product()` with all assets
- Webhook receives → generates PDF → uploads to Drive → creates Etsy listing
- Vex reports back: "Live at [Etsy URL]"

**Sam's involvement:** Approve Step 3. That's it.

---

## PHASE 4: Testing & Refinement (5 hours)

### 4.1 Test Run Checklist
- [ ] Manual webhook call with sample data (does it generate files?)
- [ ] Manual Etsy listing (does API auth work?)
- [ ] Manual Drive upload (do permissions allow downloads?)
- [ ] End-to-end test: Trigger from Vex → verify live listing
- [ ] Error test: Break something, ensure rollback works

### 4.2 Quality Control Gates
Before going live, add approval step:

**Claude Code Prompt #6: Add Review Gate**
```
You are adding an optional human review step to the automation pipeline.

Modify the webhook orchestrator (from Prompt #4) to:

1. After files are generated, send preview to Sam:
   - Email with PDF attachments
   - Slack message with Drive links (if integrated)
   - Simple web page at /review/{product_id} showing preview

2. Add endpoints:
   - POST /approve/{product_id} → proceeds to Etsy listing
   - POST /reject/{product_id} → deletes files, logs reason
   - POST /revise/{product_id} → accepts new specs, regenerates

3. Set timeout: If no response in 24 hours, auto-approve (configurable)

Include simple HTML template for the review page with big Approve/Reject buttons.
```

---

## COST BREAKDOWN

### One-Time Setup
| Item | Cost | Time |
|------|------|------|
| Etsy API integration | Free | 3 hrs |
| File generator (Python) | Free | 5 hrs |
| Google Drive API | Free | 2 hrs |
| Webhook server | Free | 4 hrs |
| Vex tool integration | Free | 2 hrs |
| Testing & debugging | Free | 4 hrs |
| **TOTAL** | **$0** | **20 hrs** |

### Ongoing Monthly
| Item | Cost |
|------|------|
| Hosting (Render.com free tier) | $0 |
| Google Drive storage (15GB) | $0 |
| Etsy listing fees | $0.20/listing |
| **TOTAL** | **~$2–5/mo** (depends on volume) |

### If You Outsource Dev
- Fiverr/Upwork developer: **$300–600** for full build

---

## MAINTENANCE & SCALING

### What Could Break
1. **Etsy API changes** → Update auth flow (happens ~1x/year)
2. **Token expiration** → Auto-refresh handles it (Prompt #1 includes this)
3. **File generation bugs** → Add new templates as needed
4. **Rate limits** → Etsy allows 10 listings/day on free tier (plenty for us)

### When to Upgrade
- **>50 products/month:** Move to paid Make.com ($9/mo) for better monitoring
- **>100 products/month:** Upgrade to Canva API ($12/mo) for prettier files
- **>500 products/month:** Move to AWS S3 + CloudFront CDN for faster delivery

---

## TIMELINE

### Week 1: Foundation
- Days 1–2: Etsy API connection (Prompt #1)
- Days 3–4: File generator (Prompt #2)
- Day 5: Google Drive upload (Prompt #3)

### Week 2: Integration
- Days 1–2: Webhook orchestrator (Prompt #4)
- Day 3: Vex tool integration (Prompt #5)
- Days 4–5: Testing & review gate (Prompt #6)

### Week 3: Launch
- First product test run
- Refinements based on results
- Go live with full automation

**Total calendar time:** 3 weeks if Sam does 1–2 hrs/day  
**Total dev time:** 20 hours actual work

---

## SUCCESS METRICS

After automation is live, track:
- **Time saved:** From 2 hrs/product → 5 min review
- **Error rate:** Target <5% failed listings
- **Speed:** Idea to live listing in <2 hours (including Vex research/asset gen)
- **Volume:** Ability to ship 3–5 products/week without Sam burnout

---

## FINAL NOTES

**This is the path to hands-off operation.** Once built, Sam's workflow becomes:

1. Idea → Vex
2. Review Maya's research (2 min)
3. Approve
4. Review generated files (3 min)
5. Approve
6. Product is live

Everything else—research, copywriting, image generation, file creation, uploading, listing—happens automatically.

**The 20 hours of dev work buys you back 100+ hours over the next year.**

Let's build it.

---
## Related
[[groundwork-identity]] | [[_index]] | [[team-roster]]
[[2026-05-21-maya-mode-1-wedding-planning-templates-resear]] | [[budget-templates-reddit-posts]] | [[debt-payoff-tracker]] | [[savings-goal-tracker]]