---
name: business-metrics
description: Reduce any subscription, e-commerce, or paid-acquisition business to seven numbers, then state a profit goal — either the one the person gives, or the ceiling implied by its SOM. Use this whenever someone asks about unit economics, CAC, LTV, ROAS, ad budgets, market sizing, or "will this business make money." Also use it when someone shares a pile of marketing numbers and wants them simplified, or asks what ad spend is needed to hit a revenue or profit target. Trigger even if the person never says "unit economics" — questions like "how much should I spend on ads," "what should I charge," or "how many customers do I need" are all this skill.
---

# Business Metrics

Every business reduces to seven numbers. Show the table, then state one goal. Nothing else.

## The seven numbers

| Metric | Value |
|---|---|
| Ad spend per 1,000 clicks | |
| Price | |
| Cost per click | |
| Click-to-paid | |
| Churn | |
| Running Costs (% of revenue) | |
| Profit per 1,000 clicks | |

Running Costs = variable cost only (payment fees, app-store cut, tax, delivery/hosting) as a percent of revenue. Never include fixed overhead (salaries, rent, tools).

Fill every row from what the person gives you. Compute the last one:

```
Tenure (months)      = 1 ÷ Churn
Customers per 1,000  = 1,000 × Click-to-paid
Gross revenue        = Customers × Price × Tenure
Profit per 1,000     = Gross revenue × (1 − Running Costs %) − Ad spend
```

## The goal

Profit is always the end goal — never clicks or ad spend for their own sake. Ask which one applies:

**A. They gave you a profit goal.** Work backward from it:

```
Profit per click    = Profit per 1,000 clicks ÷ 1,000
Clicks required     = Profit goal ÷ Profit per click
Customers required  = Clicks required × Click-to-paid
Ad spend required   = Clicks required × Cost per click
```

Then check `Customers required` against SOM — the realistic number of customers they can capture, usually 1–10% of the addressable market (ask for it, or estimate from TAM/SAM/SOM). If `Customers required` exceeds SOM, the goal is not reachable: say so, and fall back to case B for the actual ceiling.

> To hit **$G** in profit, you need **X** clicks (**N** customers) and **$Y** in ad spend.

**B. No profit goal given.** Estimate the ceiling from SOM instead:

```
Profit per click = Profit per 1,000 clicks ÷ 1,000
Clicks required   = SOM ÷ Click-to-paid
Ad spend          = Clicks required × Cost per click
Profit ceiling    = Clicks required × Profit per click
```

> At a SOM of **N** customers, the profit ceiling is **$P**, needing **X** clicks and **$Y** in ad spend.

## Output format

Table, then the goal line. That's the whole answer — do not add LTV, CAC, ROAS, payback, sensitivity analysis, or caveats unless the person explicitly asks for them.

## Worked example

| Metric | Value |
|---|---|
| Ad spend per 1,000 clicks | $600 |
| Price | $25/mo |
| Cost per click | $0.60 |
| Click-to-paid | 1.76% |
| Churn | 10%/mo |
| Running Costs | 28.6% of revenue |
| Profit per 1,000 clicks | $2,542 |

No profit goal was given, so estimate the ceiling from SOM (8,500 customers):

> At a SOM of **8,500 customers**, the profit ceiling is **$1,227,800**, needing **483,000 clicks** and **$289,800** in ad spend.
