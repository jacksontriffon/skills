---
name: business-metrics
description: Reduce any subscription, e-commerce, or paid-acquisition business to seven numbers, then state the marketing goal implied by its SOM. Use this whenever someone asks about unit economics, CAC, LTV, ROAS, ad budgets, market sizing, or "will this business make money." Also use it when someone shares a pile of marketing numbers and wants them simplified, or asks what ad spend is needed to hit a revenue or profit target. Trigger even if the person never says "unit economics" — questions like "how much should I spend on ads," "what should I charge," or "how many customers do I need" are all this skill.
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

Ask for (or estimate) a SOM — the realistic number of customers they can capture, usually 1–10% of the addressable market.

```
Clicks required = SOM ÷ Click-to-paid
Marketing goal   = Clicks required × Cost per click
```

State it as one line:

> To reach a SOM of **N** customers, you need **X** clicks and **$Y** in ad spend.

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

> To reach a SOM of **8,500 customers**, you need **483,000 clicks** and **$304,000** in ad spend.
