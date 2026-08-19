---
name: business-metrics
description: Reduce a business to seven dials and state its profit ceiling at SOM.
---

# Business Metrics

Every business is a money machine: ad spend in, profit out. What it returns, how fast it compounds, and where it stops.

## Per 1,000 clicks

| Dial | Value |
|---|---|
| Ad spend | $600 |
| Cost per click | $0.60 |
| Click-to-paid | 1.76% |
| Price | $25/mo |
| Churn | 10%/mo |
| Running costs | 28.6% of revenue |
| Profit | $2,542 |

```
Ad spend  = Clicks × Cost per click
Customers = Clicks × Click-to-paid
Tenure    = 1 ÷ Churn
Profit    = Customers × Price × Tenure × (1 − Running costs) − Ad spend
```

Running costs are every cost the business carries — payment fees, app-store cut, tax, hosting, delivery, salaries, rent, tools — as a percent of revenue.

Values are an example. Fill every row from what you are given, asking for all gaps in one question.

## Running costs

| Cost | % of revenue |
|---|---|
| App-store cut | 15.0% |
| Salaries | 5.0% |
| Payment fees | 3.0% |
| Hosting | 2.0% |
| Tax | 2.0% |
| Tools | 1.6% |
| **Total** | **28.6%** |

## Growth rate

| Input | Value |
|---|---|
| Payback period | 1.9 months |
| LTV:CAC | 5.2 |
| → Self-funded growth | 4.2×/yr |
| → Time to SOM | 2.3 years |

```
CAC                = Cost per click ÷ Click-to-paid
LTV                = Price × Tenure × (1 − Running costs)
LTV:CAC            = LTV ÷ CAC
Payback period     = CAC ÷ (Price × (1 − Running costs))
Self-funded growth = Profit ÷ Ad spend
Time to SOM        = ln(SOM ÷ Customers) ÷ ln(Self-funded growth)
```

From a $10,000 seed, every dollar of profit becomes next year's ad spend:

| Year | Ad spend | Profit | Customers | Growth rate |
|---|---|---|---|---|
| 0 | $10,000 seed | $42,000 | 293 | — |
| 1 | $42,000 | $179,000 | 1,242 | 4.2× |
| 2 | $179,000 | $760,000 | 5,263 | 4.2× |
| 3 | $760,000 | $3,220,000 | 22,296 | 4.2× |

## TAM, SAM, SOM

| Market | Customers | Who they are | Where | What the number is |
|---|---|---|---|---|
| TAM | 2,000,000 | Everyone who has the problem, at any price | Worldwide | The whole market if it were all ours |
| SAM | 170,000 | Those the product actually serves and can be sold to today | United States | The slice we can reach with this product, language, and payment rails |
| SOM | 8,500 | Those we can win against incumbents with our ad spend | United States | 5% of SAM — the realistic ceiling the machine drives toward |

Cite the source and year for each figure. SOM is 1–10% of SAM.

## At SOM — 8,500 customers, 483,000 clicks

| Dial | Value |
|---|---|
| Ad spend | $289,800 |
| Cost per click | $0.60 |
| Click-to-paid | 1.76% |
| Price | $25/mo |
| Churn | 10%/mo |
| Running costs | 28.6% of revenue |
| Profit | $1,227,000 |

> **$1 in, $4.23 out.**
