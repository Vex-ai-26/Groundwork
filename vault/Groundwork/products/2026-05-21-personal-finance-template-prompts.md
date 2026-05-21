# Personal Finance Template Prompts
_2026-05-21_

# Personal Finance Template Build Prompts

## 1. Monthly Budget Planner
**Product Type:** Excel/Google Sheets monthly budget template
**Price Point:** $4.99

### Claude Prompt:
Create a comprehensive monthly budget planner spreadsheet with the following specifications:

**INCOME SECTION:**
- Row headers: Salary (Net), Freelance/Side Income, Investment Income, Other Income, TOTAL INCOME
- Columns: Budgeted Amount, Actual Amount, Difference
- Formula: =SUM(B2:B5) for total income
- Color: Light green header (#E8F5E9)

**EXPENSES SECTION - FIXED:**
- Category: Housing (Rent/Mortgage, Insurance, HOA, Property Tax)
- Category: Transportation (Car Payment, Insurance, Gas/Transit, Maintenance)
- Category: Utilities (Electric, Water, Gas, Internet, Phone)
- Category: Insurance (Health, Life, Disability)
- Subtotal row with formula: =SUM(fixed_range)
- Color: Light blue header (#E3F2FD)

**EXPENSES SECTION - VARIABLE:**
- Category: Food (Groceries, Dining Out, Coffee/Snacks)
- Category: Personal (Clothing, Haircuts, Gym, Entertainment)
- Category: Health (Medical Co-pays, Prescriptions, Therapy)
- Category: Debt Payments (Credit Cards, Student Loans, Personal Loans)
- Category: Miscellaneous
- Subtotal row with formula: =SUM(variable_range)
- Color: Light orange header (#FFF3E0)

**SAVINGS & GOALS:**
- Emergency Fund
- Retirement (401k, IRA)
- Specific Savings Goals
- Subtotal row
- Color: Light purple header (#F3E5F5)

**SUMMARY SECTION:**
- Total Income (linked)
- Total Expenses (=fixed+variable+savings)
- Net Income (=income-expenses)
- Conditional formatting: Green if positive, Red if negative
- Percentage of income saved: =savings/income*100

**FORMATTING:**
- Currency format for all dollar amounts
- Bold headers
- Gridlines on
- Print-friendly (fits on 2 pages)
- Instructions tab with how to use

---

## 2. Debt Payoff Tracker (Snowball/Avalanche)
**Product Type:** Excel/Google Sheets debt payoff calculator
**Price Point:** $5.99

### Claude Prompt:
Create a debt payoff tracker with snowball and avalanche method comparison:

**DEBT INPUT TABLE:**
- Columns: Debt Name, Total Balance, Interest Rate (%), Minimum Payment, Current Balance
- Rows: 10 debt entry rows
- Color: Light red header (#FFEBEE)

**SNOWBALL METHOD TAB:**
- Auto-sort debts by balance (smallest to largest)
- Payment allocation table showing month-by-month payoff
- Columns: Month, Debt Name, Payment Amount, Remaining Balance, Total Paid
- Extra payment input cell (applies to smallest balance first)
- Progress bar visualization showing % debt-free
- Total interest paid calculation
- Payoff timeline (months to debt-free)

**AVALANCHE METHOD TAB:**
- Auto-sort debts by interest rate (highest to lowest)
- Same payment allocation structure as snowball
- Extra payment input cell (applies to highest rate first)
- Progress bar visualization
- Total interest paid calculation
- Payoff timeline

**COMPARISON DASHBOARD:**
- Side-by-side comparison table:
  - Method name
  - Total interest paid
  - Months to debt-free
  - Total amount paid
  - Money saved vs. other method
- Visual chart comparing both methods
- Recommendation based on math (which saves more)

**MONTHLY TRACKER TAB:**
- Log actual payments made
- Update current balances
- Track progress against plan
- Motivational milestones (25%, 50%, 75%, 100% paid off)

**FORMATTING:**
- Conditional formatting: debts turn green when paid off
- Data validation for percentage inputs
- Protected formulas
- Print-friendly

---

## 3. Savings Goal Tracker
**Product Type:** Excel/Google Sheets savings tracker
**Price Point:** $3.99

### Claude Prompt:
Create a visual savings goal tracker with multiple goals:

**GOALS SETUP TABLE:**
- Columns: Goal Name, Target Amount, Target Date, Current Savings, Monthly Contribution
- Rows: 8 goal slots
- Examples: Emergency Fund, Vacation, New Car, Home Down Payment, Wedding
- Color: Light teal header (#E0F2F1)

**AUTO-CALCULATIONS:**
- Months until target date: =DATEDIF(TODAY(), target_date, "M")
- Amount still needed: =target-current
- Required monthly savings: =amount_needed/months_remaining
- On track indicator: IF(monthly_contribution >= required, "✓ On Track", "⚠ Need $X more/month")

**PROGRESS SECTION:**
For each goal:
- Progress bar (visual thermometer style)
- Percentage complete: =current/target*100
- Projected completion date based on current contribution rate
- Color-coded status: Red (<25%), Yellow (25-75%), Green (>75%)

**MONTHLY CONTRIBUTION TRACKER:**
- Month/date column
- Goal name dropdown
- Amount contributed
- Running total per goal
- Visual chart showing contribution history

**DASHBOARD VIEW:**
- Total saved across all goals
- Total target amount
- Overall completion percentage
- Goal priority ranking (by target date)
- Upcoming milestones

**SAVINGS CHALLENGE TAB:**
- 52-week savings challenge tracker
- Bi-weekly savings challenge
- Round-up savings calculator (rounds purchases to nearest $5/$10)

**FORMATTING:**
- Color-coded progress bars
- Celebration graphics when goals hit 100%
- Mobile-friendly layout option
- Instructions page

---

## 4. Bill Payment Tracker
**Product Type:** Excel/Google Sheets bill organizer
**Price Point:** $3.99

### Claude Prompt:
Create a comprehensive bill payment tracker and reminder system:

**BILL MASTER LIST:**
- Columns: Bill Name, Due Date, Amount, Payment Method, Auto-Pay (Y/N), Category, Confirmation #
- Rows: 25 bill entries
- Categories: Housing, Utilities, Insurance, Subscriptions, Debt, Other
- Color: Light yellow header (#FFFDE7)

**MONTHLY CALENDAR VIEW:**
- Each day shows bills due
- Color-coded by category
- Checkboxes for "Paid" status
- Late payment warnings (conditional formatting for overdue)
- Formula: =IF(due_date<TODAY() AND paid="No", "OVERDUE", "")

**ANNUAL OVERVIEW TAB:**
- 12-month grid (rows = bills, columns = months)
- Each cell shows: amount + paid status
- Annual total per bill
- Monthly total across all bills
- Identifies seasonal variations
- Average monthly bill total

**SUBSCRIPTION TRACKER:**
- Subscription name
- Monthly/annual cost
- Renewal date
- Auto-renew status
- Last price increase date
- Notes (consider canceling?)
- Total annual subscription cost

**PAYMENT CONFIRMATIONS LOG:**
- Date paid
- Bill name
- Amount
- Confirmation/reference number
- Payment method
- Notes

**DASHBOARD:**
- Bills due this week
- Bills due this month
- Total monthly obligations
- Average monthly bills
- Highest bill (sorted view)
- Bills by category (pie chart)
- Payment method breakdown

**BUDGET INTEGRATION:**
- Compare actual bills to budgeted amounts
- Variance tracking
- Alert if 10%+ over budget

**FORMATTING:**
- Conditional formatting: green when paid, red when overdue, yellow when due within 3 days
- Data validation dropdowns for payment methods and categories
- Print monthly view for posting on fridge
- Instructions tab

---

## 5. Net Worth Calculator & Tracker
**Product Type:** Excel/Google Sheets financial snapshot tool
**Price Point:** $4.99

### Claude Prompt:
Create a comprehensive net worth calculator with historical tracking:

**ASSETS SECTION:**
- **Liquid Assets:**
  - Checking accounts (multiple entries)
  - Savings accounts
  - Money market accounts
  - Cash on hand
  - Subtotal formula
  - Color: Light green (#E8F5E9)

- **Investments:**
  - 401(k)/403(b)
  - IRA/Roth IRA
  - Brokerage accounts
  - HSA
  - 529 plans
  - Crypto
  - Subtotal formula
  - Color: Light blue (#E3F2FD)

- **Property:**
  - Primary residence (current market value)
  - Rental properties
  - Vehicles (current value)
  - Other real estate
  - Subtotal formula
  - Color: Light brown (#EFEBE9)

- **Personal Property:**
  - Jewelry
  - Collectibles
  - Business equity
  - Other valuable items
  - Subtotal formula

**TOTAL ASSETS:** =SUM(all asset subtotals)

**LIABILITIES SECTION:**
- **Home Debt:**
  - Mortgage balance(s)
  - HELOC
  - Color: Light red (#FFEBEE)

- **Consumer Debt:**
  - Credit card balances
  - Personal loans
  - Student loans
  - Medical debt

- **Vehicle Debt:**
  - Auto loans/leases

- **Other Debt:**
  - Business loans
  - Loans from family/friends
  - Tax debt

**TOTAL LIABILITIES:** =SUM(all liability categories)

**NET WORTH CALCULATION:**
- Total Assets (linked)
- Total Liabilities (linked)
- **NET WORTH** = Assets - Liabilities
- Large, bold, color-coded (green if positive, red if negative)

**HISTORICAL TRACKER TAB:**
- Columns: Date, Total Assets, Total Liabilities, Net Worth, Change from Last, % Change
- Monthly entry rows (24 months)
- Line chart showing net worth trend over time
- Asset vs. liability trend lines
- Milestone markers ($0, $100k, $250k, $500k, $1M)

**DASHBOARD TAB:**
- Current net worth (large display)
- Net worth change this year
- Net worth change vs. 1 year ago
- Asset allocation pie chart
- Debt-to-asset ratio: =liabilities/assets*100
- Liquid asset percentage: =liquid/total_assets*100
- Investment percentage of net worth

**GOALS SECTION:**
- Target net worth
- Target date
- Current net worth
- Required monthly increase
- On track indicator
- Projected net worth at target date

**NOTES/CONTEXT:**
- Date of valuation
- How property values were determined
- Investment account values as of date
- Notes about upcoming changes

**FORMATTING:**
- Currency formatting throughout
- Professional color scheme
- Conditional formatting for growth (green) vs. decline (red)
- Print-friendly single-page snapshot
- Instructions tab with "how to determine values" guidance
- Privacy note: "Keep this document secure"

---

## PRICING STRATEGY
- Monthly Budget: $4.99 (most popular)
- Debt Payoff: $5.99 (highest value/complexity)
- Savings Tracker: $3.99 (entry point)
- Bill Tracker: $3.99 (entry point)
- Net Worth: $4.99 (premium positioning)
- **Bundle all 5:** $19.99 (save $5)

## LISTING KEYWORDS
Personal budget, budget planner, debt payoff, savings tracker, financial planning, money management, bill tracker, net worth calculator, budget template, financial spreadsheet, excel budget, google sheets budget

## DELIVERY
All templates delivered as both .xlsx (Excel) and Google Sheets link. Include PDF instruction guide with each.

---
## Related
[[groundwork-identity]] | [[_index]] | [[team-roster]]
[[2026-05-21-maya-mode-2-budget-templates-non-construction]] | [[2026-05-21-maya-mode-2-budget-planner-spreadsheets]] | [[2026-05-21-maya-mode-1-blueprint-reading-course-research]] | [[2026-05-21-maya-mode-1-budget-planner-spreadsheet-resear]]