# Starting a new Claude chat about Zodito

Copy one of the prompts below depending on what you need. Replace `[your request]`.

---

## For quick fixes / small changes (fastest, cheapest in tokens)

```
I'm working on Zodito Rentals — a bike rental platform deployed at
https://www.zoditorentals.com. Code: https://github.com/tarunratan/zodito-rental

Read PROJECT_BRIEF.md from that repo for full context. Key facts:
- Next.js 14 + Supabase + Clerk + Razorpay on Vercel
- Single branch (KPHB), 3 user roles (customer/vendor/admin)
- Master pricing with 5 tiers per bike model
- Mock mode auto-enables without env vars

What I need: [your request]

Relevant file: [paste the file content if it's under ~300 lines, otherwise
paste the URL: https://raw.githubusercontent.com/tarunratan/zodito-rental/main/src/...]
```

---

## For bigger features / architectural questions

```
I'm working on Zodito Rentals. Before helping, please:

1. Fetch https://raw.githubusercontent.com/tarunratan/zodito-rental/main/PROJECT_BRIEF.md
2. Fetch https://raw.githubusercontent.com/tarunratan/zodito-rental/main/CHANGES_LOG.md

Then help me with: [your request]

Don't ask me to re-explain the architecture, pricing model, or roles —
everything's in those files.
```

---

## For bug reports / deployment issues

```
Zodito Rentals (https://www.zoditorentals.com) has a bug:
- Expected: [what should happen]
- Actual: [what's happening]
- Reproduction: [step by step]
- Error message (if any): [paste it]

Context: https://github.com/tarunratan/zodito-rental — read PROJECT_BRIEF.md
for stack + architecture. Relevant file I suspect: [path]

Please diagnose and suggest a fix.
```

---

## Token-saving tips

1. **Don't paste the whole codebase.** Paste only the file(s) you want changed. Claude can fetch the repo if it needs more.

2. **Be specific about the role.** "As a customer booking a bike" / "As an admin approving a vendor" — this frames the problem instantly.

3. **Reference files by path.** "`src/lib/pricing.ts` line 80-120" is 15 tokens. Pasting the whole file is 2000 tokens.

4. **Split big asks.** Instead of "redesign the admin panel", ask "improve the Vendors tab in AdminTabs.tsx". Smaller context = cheaper + better answers.

5. **Update CHANGES_LOG.md after each change.** Then the next chat inherits your history without you explaining it.

---

## When to start a new chat vs continue existing

**Start new chat:**
- Different feature area (moving from customer UX to admin logic)
- Previous chat is > 50 messages deep
- Previous chat's context is stale (you made changes outside the chat)
- You're hitting rate limits

**Continue existing chat:**
- Iterating on the same file
- Quick follow-up tweak to the last answer
- Debugging the same problem

---

## The golden workflow

1. Make changes in code (via AI or by hand)
2. Test
3. Commit to GitHub — your PROJECT_BRIEF.md + CHANGES_LOG.md + code all stay in sync
4. Next chat: paste the starter prompt above + your request. Done.

You've basically turned your repo into the context window.