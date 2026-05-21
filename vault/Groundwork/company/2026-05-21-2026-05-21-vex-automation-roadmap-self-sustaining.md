# 2026-05-21-vex-automation-roadmap-self-sustaining
_2026-05-21_

# Vex Automation Roadmap — Self-Sustaining Operations

**Goal:** Make Vex fully automated from product research → creation → Etsy listing → revenue generation without manual intervention.

**Current Gap:** Vex can research and write, but cannot create deliverable files (PDFs, spreadsheets) or post to Etsy.

---

## Phase 1: File Generation (PDF & Spreadsheet Creation)

### What We Need
- Ability to generate PDFs (cheat sheets, guides, checklists, planners)
- Ability to generate Excel/Google Sheets (budget templates, trackers, calculators)
- Ability to generate editable formats (Word docs, Canva templates)

### Solution Options

**Option A: Canva API Integration (Recommended)**
- **Cost:** Free tier (limited), Pro starts at $13/month
- **Pros:** Template-based, professional design output, PDF/PNG export built-in
- **Cons:** Requires design templates upfront
- **Implementation:** 
  - Create Canva templates for each product type
  - Use Canva API to populate data fields
  - Export as PDF automatically
- **Dev Time:** 8–12 hours

**Option B: Python PDF Generation (Code-Based)**
- **Cost:** Free (hosting only, ~$5/month)
- **Tools:** ReportLab, Pillow, FPDF, Jinja2 templates
- **Pros:** Total control, no monthly fees, unlimited generation
- **Cons:** Requires design work in code, learning curve
- **Implementation:**
  - Build PDF templates in Python
  - Feed content from Vex → generate formatted PDF
  - Store to cloud storage
- **Dev Time:** 15–20 hours

**Option C: Google Docs/Sheets API**
- **Cost:** Free
- **Tools:** Google Workspace API
- **Pros:** Native spreadsheet support, shareable links, easy collaboration
- **Cons:** Less design control for PDFs, branding limitations
- **Implementation:**
  - Create template Google Docs/Sheets
  - Clone and populate via API
  - Export as PDF or share as editable file
- **Dev Time:** 10–15 hours

### Recommendation
**Start with Option C (Google API) for spreadsheets, add Option B (Python) for designed PDFs within 30 days.** Free, flexible, covers both use cases.

---

## Phase 2: Cloud Storage & File Hosting

### What We Need
- Store generated files (PDFs, spreadsheets)
- Generate download links for Etsy customers
- Organize by product/order

### Solution Options

**Option A: Google Drive API**
- **Cost:** Free (15GB), $2/month (100GB)
- **Pros:** Integrates with Google Docs/Sheets API, shareable links, reliable
- **Implementation:** Auto-upload files, generate public/private links
- **Dev Time:** 4–6 hours

**Option B: Dropbox API**
- **Cost:** Free (2GB), $12/month (2TB)
- **Pros:** Simple API, good for digital downloads
- **Implementation:** Same as Google Drive
- **Dev Time:** 4–6 hours

**Option C: AWS S3**
- **Cost:** ~$0.50–2/month (pay per storage/bandwidth)
- **Pros:** Scalable, professional, direct download links
- **Cons:** Slightly more complex setup
- **Dev Time:** 6–8 hours

### Recommendation
**Google Drive API.** Free tier is enough for 6+ months, integrates directly with document generation, simple link sharing.

---

## Phase 3: Etsy API Integration (Auto-Listing)

### What We Need
- Auto-create Etsy listings from Vex-generated content
- Upload product images (from Iris/DALL-E 3)
- Set pricing, tags, categories
- Handle digital file delivery

### Solution
**Etsy API v3**
- **Cost:** Free API access (Etsy takes 6.5% transaction fee + $0.20/listing)
- **Requirements:**
  - Etsy Developer Account (free)
  - OAuth 2.0 authentication setup
  - Listing creation endpoint integration
- **Implementation:**
  - Vex triggers listing creation after Maya MODE 2 + Iris images + Rex copy
  - Auto-populate title, description, tags, price, category
  - Upload images (up to 10 per listing)
  - Link digital download file from Google Drive
- **Dev Time:** 12–18 hours (OAuth setup is tricky first time)

### Key Endpoints
- `POST /v3/application/shops/{shop_id}/listings` — Create listing
- `POST /v3/application/shops/{shop_id}/listings/{listing_id}/images` — Upload images
- `POST /v3/application/shops/{shop_id}/listings/{listing_id}/files` — Attach digital file

### Recommendation
**Priority 1 automation.** This unlocks revenue without Sam's manual work.

---

## Phase 4: Payment & Order Fulfillment Automation

### What We Need
- Detect new Etsy orders
- Auto-send digital file to customer
- Track revenue

### Solution
**Etsy Webhooks + Order API**
- **Cost:** Free
- **Implementation:**
  - Subscribe to `listing.updated` and `receipt.created` webhooks
  - When order placed, retrieve customer email
  - Auto-send Google Drive download link via email (SendGrid free tier: 100/day)
- **Dev Time:** 6–10 hours

### Recommendation
**Phase 4 only needed if Etsy's built-in digital delivery isn't sufficient.** Test native delivery first—it's automatic and free.

---

## Total Cost Estimate

| Component | Cost | Frequency |
|-----------|------|-----------|
| **Vex (Claude API)** | $50 | per month |
| **Google Drive (100GB)** | $2 | per month |
| **Canva Pro (optional)** | $13 | per month |
| **Etsy per listing** | $0.20 | per listing |
| **Etsy transaction fee** | 6.5% | per sale |
| **SendGrid (email, optional)** | $0 | free tier |
| **Hosting (Python script)** | $5 | per month |

**Minimum Monthly:** $57 (Vex + Google Drive + hosting)  
**Optimal Monthly:** $70 (add Canva Pro)

**One-Time Dev Cost (if outsourced):** $300–600  
**One-Time Dev Time (if Sam codes):** 40–60 hours

---

## Development Sequence (Priority Order)

1. **Google Sheets API** — Generate spreadsheet templates (budget planners, trackers)
2. **Python PDF Generation** — Create designed PDFs (cheat sheets, guides)
3. **Google Drive API** — Store and share files
4. **Etsy API Listing Creation** — Auto-post products
5. **Etsy Webhooks (optional)** — Auto-fulfill orders if needed

---

## Claude Code Prompts for Implementation

### Prompt 1: Google Sheets Template Generator
```
I need a Python function that:
1. Connects to Google Sheets API using a service account
2. Clones a template Google Sheet by ID
3. Populates specific cells with variables I pass in (e.g., product name, line items, formulas)
4. Saves the new sheet with a unique name
5. Returns a shareable link (view-only and editable versions)

Provide full code with authentication setup, error handling, and example usage.
```

### Prompt 2: Python PDF Generator (ReportLab)
```
I need a Python script that:
1. Takes structured input (title, sections, bullet lists, tables)
2. Generates a professionally formatted PDF using ReportLab
3. Supports:
   - Custom fonts and colors (brand: #2C3E50 dark blue, #E67E22 orange)
   - Logo image at top
   - Multi-column layouts
   - Tables with headers
   - Page numbers and footers
4. Saves PDF to local directory
5. Returns file path

Provide modular code with a sample template for a "Blueprint Reading Cheat Sheet" product.
```

### Prompt 3: Google Drive Upload & Link Generator
```
I need a Python function that:
1. Connects to Google Drive API using a service account
2. Uploads a file (PDF or Google Sheet) to a specific folder
3. Sets permissions to "anyone with the link can view"
4. Returns the shareable download link
5. Includes error handling and retry logic

Provide full code with authentication and example usage.
```

### Prompt 4: Etsy API Listing Creator
```
I need a Python script that:
1. Authenticates with Etsy API v3 using OAuth 2.0
2. Creates a new digital product listing with:
   - Title, description, price, quantity (999)
   - Tags (up to 13)
   - Category and taxonomy ID
   - Shop section ID
3. Uploads up to 10 images from local file paths
4. Attaches a digital download file (from Google Drive link or local file)
5. Returns the listing URL

Provide full code including OAuth setup, error handling, and example usage. Assume I have client_id, client_secret, and shop_id.
```

### Prompt 5: Etsy Order Webhook Listener
```
I need a Python Flask webhook listener that:
1. Listens for Etsy webhook events (receipt.created)
2. Verifies webhook signature for security
3. Extracts order details (buyer email, product purchased)
4. Sends an email with a Google Drive download link using SendGrid API
5. Logs the transaction

Provide full code with Flask setup, webhook verification, and email sending logic.
```

### Prompt 6: End-to-End Automation Orchestrator
```
I need a Python orchestration script that:
1. Accepts product input (name, type, content data)
2. Generates the file (calls PDF or Sheets generator)
3. Uploads to Google Drive (gets shareable link)
4. Creates Etsy listing (calls Etsy API with title, description, tags, images, file)
5. Returns listing URL and file link
6. Logs all steps for debugging

Provide modular code that ties together the previous functions into one automated pipeline.
```

---

## Success Metrics (Self-Sustaining Threshold)

**Vex pays for itself when:**
- Monthly revenue > $57 (minimum ops cost)
- Monthly revenue > $120 (break-even + 2x cost buffer)

**At current Etsy pricing ($5–15/product avg $10):**
- Need 6 sales/month to break even
- Need 12 sales/month for sustainability

**Path to $500/month (10x cost):**
- 50 sales/month at $10 avg
- OR 25 products × 2 sales each
- OR 10 products × 5 sales each

---

## Next Steps

1. **Sam decides:** Code it yourself (40–60 hrs) or hire dev ($300–600)?
2. **Start with Phase 1 & 2** (file generation + storage) — test product creation pipeline
3. **Add Phase 3** (Etsy listing) once file gen works
4. **Launch 5 products in 7 days** and measure sales velocity
5. **Hit 12 sales/month by June 30** or revisit the model

---

**Bottom line:** For $57/month recurring + 40 hours of dev, Vex becomes a fully automated product studio. If we can't hit 12 sales/month after that, the problem isn't automation—it's product-market fit.

---
## Related
[[groundwork-identity]] | [[_index]]
[[2026-05-21-maya-mode-1-wedding-planning-templates-resear]] | [[budget-templates-reddit-posts]] | [[debt-payoff-tracker]] | [[savings-goal-tracker]]