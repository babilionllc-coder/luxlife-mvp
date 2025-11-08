# Stripe Integration Guide

## Overview
Payments are credit-based. Each video generation consumes one credit.

## Credit Packs
| Pack | Price | Credits |
|------|--------|----------|
| Starter | $9.99 | 1 |
| Creator | $24.99 | 3 |
| Influencer | $74.99 | 10 |

## Flow
1. User purchases via Stripe Checkout.
2. Stripe webhook confirms payment.
3. Cloud Function updates Firestore credits.
4. UI updates user credits in dashboard.

## Setup
- Use Stripe test mode initially.
- Store API keys in Firebase Functions environment.
- Webhook endpoint: `/api/stripeWebhook`.
- Verify signatures server-side.
