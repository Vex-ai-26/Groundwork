# Personal Finance Templates - Claude Build Prompts
_2026-05-21_

# Personal Finance Templates — Claude Build Prompts

**Created:** 2026-05-21  
**Purpose:** Ready-to-use Claude prompts for generating personal finance PDF templates

---

## TEMPLATE 1: Monthly Budget Planner

### Claude Prompt:
```
Create a comprehensive monthly budget planner PDF template with the following specifications:

HEADER SECTION:
- Title: "Monthly Budget Planner"
- Fields: Month, Year, Name (optional)
- Subtitle: "Track your income and expenses to reach your financial goals"

INCOME SECTION:
- Column headers: Income Source | Expected | Actual | Difference
- Pre-filled rows: Salary/Wages, Side Hustle, Investment Income, Other Income
- 3 blank rows for custom entries
- Row: TOTAL MONTHLY INCOME (bold, with formula sum)

FIXED EXPENSES SECTION:
- Column headers: Expense Category | Budgeted | Actual | Difference | Notes
- Pre-filled categories: Rent/Mortgage, Utilities (Electric, Gas, Water), Internet/Phone, Insurance (Health, Auto, Life), Loan Payments, Subscriptions
- 5 blank rows
- Row: TOTAL FIXED EXPENSES (bold, with formula sum)

VARIABLE EXPENSES SECTION:
- Same column structure as Fixed Expenses
- Pre-filled categories: Groceries, Dining Out, Transportation/Gas, Entertainment, Shopping, Personal Care, Healthcare, Pet Care
- 5 blank rows
- Row: TOTAL VARIABLE EXPENSES (bold, with formula sum)

SAVINGS & GOALS SECTION:
- Column headers: Savings Goal | Budgeted | Actual | Difference
- Pre-filled rows: Emergency Fund, Retirement, Short-term Savings, Debt Payoff Extra
- 3 blank rows
- Row: TOTAL SAVINGS (bold, with formula sum)

SUMMARY SECTION (highlighted box):
- Total Monthly Income: [auto-sum]
- Total Expenses: [auto-sum of fixed + variable]
- Total Savings: [auto-sum]
- REMAINING/SURPLUS: [Income - Expenses - Savings]
- Percentage to Savings: [calculation]

FORMATTING:
- Professional sans-serif font (Arial or Helvetica)
- Section headers in 14pt bold with light gray background
- Money fields formatted with $ symbol and two decimals
- Alternating row colors (white/light blue) for readability
- Grid borders in medium gray
- Page size: US Letter (8.5" x 11")
- Margins: 0.75" all sides

NOTES SECTION at bottom:
- Text box area titled "Monthly Notes & Reflections"
- 4-5 lines for written notes

Include a footer: "© 2026 Groundwork | groundwork-lovat.vercel.app"
```

**PRICING RECOMMENDATION:** $4.99

---

## TEMPLATE 2: Debt Payoff Tracker

### Claude Prompt:
```
Create a debt payoff tracker PDF template with the following specifications:

HEADER SECTION:
- Title: "Debt Payoff Tracker"
- Subtitle: "Your roadmap to financial freedom"
- Fields: Name, Start Date, Target Debt-Free Date

DEBT SUMMARY TABLE:
- Column headers: Creditor/Loan | Total Balance | Interest Rate | Minimum Payment | Payment Strategy | Payoff Date
- 10 rows for debt entries
- Bottom row: TOTAL DEBT (bold, auto-sum of balances)

PAYMENT STRATEGY KEY (sidebar):
- Avalanche Method: Highest interest rate first
- Snowball Method: Smallest balance first
- Hybrid: Mix of both
- Small checkbox next to strategy being used

MONTHLY PAYMENT TRACKER:
- Create a 12-month grid
- Columns for each debt listed above
- Rows: Month 1 through Month 12
- Small cells for recording payment amounts
- Right column: Total Paid This Month

PROGRESS VISUALIZATION:
- Thermometer-style progress bar
- Scale from $0 to [Total Debt amount]
- Milestone markers at 25%, 50%, 75%, 100%
- Space to color in or shade progress

DEBT PAYOFF CALENDAR:
- 12-month mini calendar grid
- Space to mark payoff dates with stars or highlights

MOTIVATIONAL SECTION:
- Box titled "Why I'm Paying Off Debt"
- 5 lines for personal motivation notes
- Box titled "When I'm Debt-Free, I Will..."
- 5 lines for goal-setting

MONTHLY SNAPSHOT TABLE:
- Columns: Month | Starting Balance | Payments Made | Interest Charged | Ending Balance | Progress %
- 12 rows (one per month)

FORMATTING:
- Bold, inspiring header fonts
- Use of color: deep blue for headers, green for progress elements
- Professional grid layout
- Clear cell borders
- Page size: US Letter, landscape orientation recommended
- Margins: 0.5" all sides

Include footer: "© 2026 Groundwork | groundwork-lovat.vercel.app | You've got this!"
```

**PRICING RECOMMENDATION:** $6.99

---

## TEMPLATE 3: Savings Goal Tracker

### Claude Prompt:
```
Create a savings goal tracker PDF template with the following specifications:

HEADER SECTION:
- Title: "Savings Goal Tracker"
- Subtitle: "Turn dreams into plans"
- Fields: Your Name, Year

GOALS OVERVIEW (top section):
- 6 individual goal boxes arranged in 2 rows of 3
- Each box contains:
  * Goal Name (blank line)
  * Target Amount: $______
  * Target Date: ______
  * Current Savings: $______
  * Small progress bar (empty, to fill manually)
  * Percentage Complete: ____%

DETAILED GOAL TRACKER TABLE:
- Column headers: Goal Name | Target Amount | Current Saved | Remaining | Monthly Contribution | Months to Goal | Target Date | Priority
- 8 rows for different goals
- Bottom row: TOTALS (sum of target amounts and current saved)

MONTHLY CONTRIBUTION TRACKER:
- 12-month grid (Jan-Dec)
- Rows for each savings goal (up to 8)
- Cells to record monthly deposits
- Right column: Total Saved Per Goal
- Bottom row: Total Saved Per Month

VISUAL PROGRESS SECTION:
- 4 large thermometer-style trackers
- Space to write goal name at top
- Graduated scale with dollar amounts
- Area to color/shade progress

SAVINGS MILESTONES:
- Table with columns: Date | Milestone Reached | Amount Saved | Celebration
- 12 rows for recording wins

STRATEGY SECTION:
- Checkboxes for savings strategies:
  □ Automatic transfers
  □ Round-up savings
  □ Cash envelope system
  □ Challenge (52-week, no-spend, etc.)
  □ Side hustle income
  □ Tax refund
  □ Bonus/gift money

NOTES SECTION:
- "My Savings Strategy" (5 lines)
- "Obstacles & Solutions" (5 lines)

FORMATTING:
- Optimistic, clean design
- Colors: Green/teal for growth theme
- Section headers: 14pt bold
- Table text: 10pt
- Adequate white space
- Clear borders and shading
- Page size: US Letter
- Margins: 0.75" all sides

Include footer: "© 2026 Groundwork | groundwork-lovat.vercel.app"
```

**PRICING RECOMMENDATION:** $5.99

---

## TEMPLATE 4: Bill Payment Tracker

### Claude Prompt:
```
Create a bill payment tracker PDF template with the following specifications:

HEADER SECTION:
- Title: "Bill Payment Tracker"
- Subtitle: "Never miss a payment"
- Fields: Month, Year

MONTHLY BILL CHECKLIST:
- Column headers: Bill/Creditor | Due Date | Amount Due | Autopay? | Date Paid | Confirmation # | Status
- Pre-filled common bills (15 rows):
  * Rent/Mortgage
  * Electric
  * Gas
  * Water/Sewer
  * Internet
  * Phone/Mobile
  * Cable/Streaming
  * Credit Card 1
  * Credit Card 2
  * Credit Card 3
  * Car Payment
  * Car Insurance
  * Health Insurance
  * Student Loan
  * Personal Loan
- 10 blank rows for additional bills
- Bottom summary: Total Bills This Month

STATUS KEY (sidebar):
- ✓ Paid on time
- ⚠ Paid late
- ○ Pending/Scheduled
- ✗ Missed

PAYMENT CALENDAR:
- Full month calendar grid
- Small cells to write bill abbreviations on due dates
- Color-coding suggestion boxes (can highlight manually)

AUTOPAY TRACKER (side panel):
- List format: Bill Name | Bank Account | Amount | Day of Month
- 10 rows

ANNUAL BILLS REMINDER:
- Table: Bill | Amount | Due Month | Status
- Pre-filled suggestions: Car Registration, Property Tax, HOA Annual, Insurance Annual Premium, Memberships, Subscriptions (annual)
- 8 rows total

LATE FEE TRACKER:
- Columns: Date | Bill | Late Fee Amount | Reason/Notes
- 6 rows
- Bottom: Total Late Fees This Year

BUDGET COMPARISON:
- Budgeted for Bills: $_______
- Actual Bills Paid: $_______
- Difference: $_______

NOTES SECTION:
- "Upcoming Changes" (3 lines)
- "Bills to Cancel/Review" (3 lines)

FORMATTING:
- Clean, organized layout
- Header colors: Navy blue or dark gray
- Alert colors: Red for overdue, yellow for due soon, green for paid
- Clear cell gridlines
- Checkboxes for Status column
- Page size: US Letter
- Margins: 0.5" all sides

Include footer: "© 2026 Groundwork | groundwork-lovat.vercel.app"
```

**PRICING RECOMMENDATION:** $4.99

---

## TEMPLATE 5: Net Worth Calculator

### Claude Prompt:
```
Create a net worth calculator PDF template with the following specifications:

HEADER SECTION:
- Title: "Net Worth Calculator"
- Subtitle: "Track your financial journey"
- Fields: Your Name, Date, Calculation Period (Monthly/Quarterly/Annual)

ASSETS SECTION:
Section header: "ASSETS (What You Own)"

LIQUID ASSETS:
- Column headers: Account Type | Institution | Current Value
- Pre-filled rows:
  * Checking Account 1
  * Checking Account 2
  * Savings Account
  * Emergency Fund
  * Money Market
  * Cash on Hand
- 3 blank rows
- Subtotal: TOTAL LIQUID ASSETS

INVESTMENTS:
- Same column structure
- Pre-filled rows:
  * 401(k)/403(b)
  * IRA/Roth IRA
  * Brokerage Account
  * Stocks
  * Bonds
  * Crypto
  * Other Investments
- 3 blank rows
- Subtotal: TOTAL INVESTMENTS

PROPERTY & VEHICLES:
- Pre-filled rows:
  * Primary Home (current market value)
  * Other Real Estate
  * Vehicle 1
  * Vehicle 2
  * Other Valuable Assets
- 3 blank rows
- Subtotal: TOTAL PROPERTY & VEHICLES

**TOTAL ASSETS** (bold, large font, highlighted): $________

---

LIABILITIES SECTION:
Section header: "LIABILITIES (What You Owe)"

DEBT:
- Column headers: Debt Type | Creditor | Current Balance
- Pre-filled rows:
  * Mortgage
  * Home Equity Loan/HELOC
  * Auto Loan 1
  * Auto Loan 2
  * Student Loans
  * Credit Card 1
  * Credit Card 2
  * Credit Card 3
  * Personal Loans
  * Medical Debt
  * Other Debt
- 4 blank rows
- **TOTAL LIABILITIES** (bold, large font, highlighted): $________

---

NET WORTH CALCULATION (prominent box):
- Total Assets: $________
- MINUS Total Liabilities: $________
- **NET WORTH: $________** (extra large, bold, highlighted in green or blue)

---

NET WORTH TRACKER (historical):
- Table with columns: Date | Total Assets | Total Liabilities | Net Worth | Change from Last Period
- 12 rows for tracking over time

PROGRESS CHART:
- Simple line graph template with:
  * Y-axis: Dollar amounts (blank scale)
  * X-axis: Time periods (12 divisions)
  * Grid for plotting net worth over time

GOALS SECTION:
- "My Net Worth Goal for This Year:" $_______
- "My 5-Year Net Worth Goal:" $_______
- "My 10-Year Net Worth Goal:" $_______

INSIGHTS & NOTES:
- "What increased my net worth this period:" (3 lines)
- "What decreased my net worth this period:" (3 lines)
- "Action steps for next period:" (4 lines)

RATIO CALCULATIONS (sidebar):
- Debt-to-Asset Ratio: ____% (Liabilities ÷ Assets × 100)
- Liquid Asset Emergency Coverage: ____ months

FORMATTING:
- Professional, sophisticated design
- Assets section: Green accents
- Liabilities section: Red/orange accents
- Net Worth box: Bold blue or green highlight
- Clear section separators
- 11pt font for data entry
- 14pt bold for section headers
- 18pt for main Net Worth result
- Page size: US Letter
- Margins: 0.75" all sides
- Consider 2-page layout if needed

Include footer: "© 2026 Groundwork | groundwork-lovat.vercel.app"
```

**PRICING RECOMMENDATION:** $7.99

---

## BUNDLE RECOMMENDATION

**Personal Finance Starter Pack**
- All 5 templates
- Bundle price: $24.99 (save $5)
- Add bonus: Financial Goals Worksheet (simple 1-page PDF)

---

## ETSY LISTING KEYWORDS (apply to all)
personal finance, budget planner, debt tracker, savings goal, financial planner, money management, budget template, finance printable, budget worksheet, financial planning, money tracker, personal budget

## FILE DELIVERY FORMAT
- PDF, letter size (8.5" x 11")
- High-resolution (300 DPI)
- Fillable PDF preferred, or print-and-write
- Black and white printer-friendly with optional color version


---
## Related
[[groundwork-identity]] | [[_index]] | [[team-roster]]
[[2026-05-21-maya-mode-2-budget-templates-non-construction]] | [[2026-05-21-maya-mode-2-budget-planner-spreadsheets]] | [[2026-05-21-maya-mode-1-blueprint-reading-course-research]] | [[2026-05-21-maya-mode-1-budget-planner-spreadsheet-resear]]