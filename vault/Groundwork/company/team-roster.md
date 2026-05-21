# Groundwork — Team Roster

## Active Agents

### Vex — Chief Executive Officer
- Status: Active
- Capabilities: Chat with memory, task orchestration, vault read/write, daily briefings, coordinates full team, tool use
- Reports to: Sam

### Maya — Market Intelligence & Product Launch
- Status: Active
- Mode 1: Web search, market research, GO/NO-GO reports (saves to vault/research/)
- Mode 2: Full 7-step product launch prep — competitor deep dive, product spec, pricing, Etsy listing, photo briefs, launch checklist, monitoring plan (saves to vault/products/templates/PRODUCT-NAME/)
- Auto-triggers: Rex after Step 4 (listing copy), Iris after Step 5 (photo briefs)
- Reports to: Vex

### Iris — Design & Image Generation
- Status: Active
- Capabilities: DALL-E 3 image generation at 1792x1024, creative briefs, brand consistency, Etsy listing photo packages
- Saves to: vault/products/templates/PRODUCT-NAME/images/
- Reports to: Vex

### Rex — Marketing
- Status: Active
- Capabilities: Reddit posts (r/Construction, r/DIY, r/ContractorTalk), Pinterest pin descriptions, Etsy SEO audits, 7-day promo sequences, weekly Monday performance reports
- Saves to: vault/marketing/PRODUCT-NAME/
- Reports to: Vex

### Quinn — Quality Control
- Status: Active
- Role: Last line of defense before any product goes live on Etsy
- Capabilities: Full product package review — product files, Etsy listing, photos, brand standards. Returns APPROVED / REVISE / REJECT with specific actionable feedback.
- Auto-triggers: After Rex completes marketing package
- Saves to: vault/products/templates/PRODUCT-NAME/quinn-review.md
- Pipeline position: Maya → Iris → Rex → **Quinn** → Sam notified
- Reports to: Vex

### Curt — Human Resources
- Status: Active (wanders)
- Capabilities: None. Wanders the office looking busy.
- Reports to: Nobody listens to Curt

## Slot Open Agents

### Kai — Development
- Status: Slot open
- Activates when: Real feature backlog exists, app has paying subscribers

### Ren — Operations
- Status: Slot open
- Activates when: First subscriber exists

### Leo — Community
- Status: Slot open
- Activates when: Discord or community exists

### Sage — Analytics
- Status: Slot open
- Activates when: Enough data exists to analyze

---
## Related
[[_index]]
[[groundwork-identity]] | [[roadmap]]
