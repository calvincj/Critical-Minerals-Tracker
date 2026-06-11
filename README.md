# Critical Minerals Tracker

A real-time dashboard tracking the global critical minerals landscape — policies, trade deals, mining facilities, and price movements — built by the [Power Transformation Lab](https://powertransformationlab.org).

## What it tracks

**Policies & Deals**
Trade controls, export restrictions, investment agreements, subsidies, and bilateral deals involving critical minerals. Covers actions by governments, multilateral bodies, and major industry players.

**Mines & Refineries**
An interactive map of global critical mineral facilities — active mines, refineries, and processing plants — filterable by commodity and project type.

**Price Movements**
Historical price charts for 14 critical and industrial minerals, standardized to USD/kg with consistent annual data from 2018 onward.

## Data Sources

| Source | What it provides |
|--------|-----------------|
| [Global Trade Alert (GTA)](https://www.globaltradealert.org) | Trade policy interventions — export restrictions, subsidies, import tariffs |
| [IEA](https://www.iea.org) | Energy-related critical mineral policy and investment data |
| [Strategic Metals Invest](https://strategicmetalsinvest.com) | Annual reference prices (Jan snapshot) for 9 strategic & rare earth metals: Gallium, Germanium, Hafnium, Indium, Rhenium, Dysprosium, Neodymium, Praseodymium, Terbium |
| [FRED / IMF Primary Commodity Prices](https://fred.stlouisfed.org) | Monthly exchange prices (averaged annually) for 5 industrial metals: Copper, Nickel, Aluminum, Lead, Zinc |
| [Groq](https://groq.com) | Fast inference for news summarization |

## Stack

- Vanilla JS + Chart.js — no framework
- Vercel serverless functions for API proxying and caching
- Leaflet for the facilities map
