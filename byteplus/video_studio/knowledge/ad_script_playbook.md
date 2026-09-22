# Short-Form Video Ad Script Playbook

A reference knowledge base for generating varied, high-converting TikTok / Reels / Shorts style
UGC ad scripts. Built for feeding an LLM system prompt that cuts stock-library clips to mimic a
competitor reference video. Use this file to break repetitive, formulaic output by rotating
**framework × hook × angle × pacing × CTA** instead of reusing the same template every time.

---

## 0. How to Use This Playbook (for the prompt-writer)

A non-repetitive script is the product of combining four independent axes, not just "writing a
new hook line":

1. **Framework** (Section 1) — the underlying persuasion skeleton (AIDA, PAS, BAB, PASTOR, FAB,
   4Ps, Star-Story-Solution, Hook-Retain-Reward).
2. **Hook type** (Section 2) — the specific opening device used in the first 1-3 seconds.
3. **Marketing angle** (Section 3) — the narrative lens/scenario the whole script is told through.
4. **Delivery variation** (Section 4) — pacing, tone, shot rhythm, CTA phrasing.

To generate N distinct scripts for the same product, vary at least 2 of these 4 axes per script
(e.g., same angle, different hook + different framework; or same hook type, different angle +
different pacing). Never hold all four constant across multiple outputs — that is what produces
the repetitive, low-variation scripts this file exists to fix.

Text-overlay and voiceover rules (Section 5) apply uniformly regardless of which combination is
chosen.

---

## 1. Copywriting / Ad-Script Frameworks

Each framework is a different skeleton for organizing the same beats: attention → problem →
proof → offer → action. Pick the framework based on audience awareness (does the viewer already
know they have the problem?) and format length.

### 1.1 AIDA — Attention, Interest, Desire, Action
- **Structure:** Grab attention → build interest by explaining what's different → create desire
  (make them want it) → prompt action (tell them what to do).
- **When to use:** Cold / problem-unaware audiences who don't yet recognize they have the
  problem. Good general-purpose default for top-of-funnel short video ads.
- **Short-form example:**
  - Attention (0-2s): "This is the last kitchen gadget I bought this year."
  - Interest (2-6s): quick demo of the pain it solves (uneven chopping, wasted time).
  - Desire (6-12s): show the satisfying result / lifestyle payoff (fast, clean, effortless).
  - Action (12-15s): "Link in bio, 20% off today."

### 1.2 PAS — Problem, Agitate, Solve
- **Structure:** Name the problem → agitate it (make the pain vivid/emotional, show cost of
  inaction) → present the product as the solve.
- **When to use:** Pain-aware audiences; best for short formats under ~30 seconds because it
  skips exposition and goes straight for the nerve.
- **Short-form example:**
  - Problem: "Your skin still breaks out even though you 'do everything right.'"
  - Agitate: "You've tried five products, wasted money, and nothing changed — it's not you,
    it's the ingredients."
  - Solve: "This serum targets the actual cause. Here's what changed in 2 weeks." (show B-roll)

### 1.3 BAB — Before, After, Bridge
- **Structure:** Show life before the product (pain/limitation) → show life after (the desired
  state) → the product is the bridge that connects the two.
- **When to use:** Transformation-focused products (fitness, beauty, home organization,
  productivity tools) where the contrast itself is the persuasive engine.
- **Short-form example:**
  - Before: cluttered desk, stressed creator typing frantically.
  - After: clean desk, calm creator finishing early.
  - Bridge: "This planner app is what changed it." + 3-second UI demo.

### 1.4 PASTOR — Problem, Amplify, Story/Solution, Transformation, Offer, Response
- **Structure:** Problem → Amplify (raise the stakes/cost of not solving it) → Solution (often
  told as a story) → Transformation (what changes for the customer) → Offer (the concrete deal)
  → Response (explicit call to action).
- **When to use:** Slightly longer short-form (30-60s) or when you need to justify a
  higher-consideration purchase; works well for founder-story or testimonial-driven ads because
  it has a dedicated "Story" beat.
- **Short-form example:** Founder opens on the problem they personally had, amplifies why
  nothing else worked, tells the story of building the fix, shows the transformation in their
  own life, states the offer/discount, and closes with an explicit "tap the link."

### 1.5 FAB — Features, Advantages, Benefits
- **Structure:** State the Feature (what it has) → the Advantage (what that lets you do) → the
  Benefit (the emotional/practical payoff for the customer).
- **When to use:** Feature-heavy or technical/spec-driven products (electronics, appliances,
  software) where the audience needs to understand *why* a spec matters, not just *that* it
  exists.
- **Short-form example:** "This blender has a 1200W motor (feature) — that means it crushes ice
  in one pass, no chunks (advantage) — so your smoothie is actually smooth, every time
  (benefit)."

### 1.6 4Ps — Picture, Promise, Proof, Push
- **Structure:** Paint a picture of the desired outcome → make a promise the product delivers it
  → back the promise with proof (demo, stat, testimonial) → push the viewer to act now.
- **When to use:** Aspirational / lifestyle products where visual imagery does a lot of the
  persuading before any hard claim is made.
- **Short-form example:** Picture: golden-hour shot of someone relaxing after a workout. Promise:
  "Recovery in half the time." Proof: on-screen stat or before/after soreness comparison. Push:
  "Try it risk-free — link below."

### 1.7 Star-Story-Solution
- **Structure:** Introduce a relatable "Star" (the viewer-as-hero, or a creator standing in for
  them) → tell their Story (the struggle) → reveal the Solution that changed the outcome.
- **When to use:** UGC/testimonial-style ads where a single creator carries the whole narrative
  arc — this is effectively the narrative engine most creator testimonials already use, made
  explicit as a structure.
- **Short-form example:** "I used to spend 2 hours a week meal prepping and still ate out (Star +
  Story)... until I found this delivery service that actually tastes homemade (Solution)."

### 1.8 Hook-Retain-Reward
- **Structure:** **Hook** (0-3s: stop the thumb — visual disruption, bold claim, or open loop) →
  **Retain** (middle: pay off the hook in small beats, stack curiosity, keep forward motion so
  nobody bails) → **Reward** (ending: a satisfying payoff — the transformation, the punchline,
  the proof — the viewer must feel rewarded for staying, not tricked).
- **When to use:** This is less a persuasion skeleton and more the retention engine that should
  underlie *every* script regardless of which framework above is chosen — pair it with AIDA/PAS/
  BAB/etc. Most ads that "nail the hook and then sag" are failing at the Retain stage: they don't
  plan the middle, only the opening.
- **Short-form example:** Hook: "Stop! Look at this." Retain: 3 quick beats showing progressively
  more surprising proof (close-up, side-by-side, reaction shot). Reward: the final reveal/result
  with a CTA riding the high point, not after it.

### Framework Quick-Reference Table

| Framework | Best for | Funnel stage | Length |
|---|---|---|---|
| AIDA | Cold/unaware audience, general purpose | TOF | 15-30s |
| PAS | Pain-aware audience, direct response | TOF/MOF | 10-20s |
| BAB | Transformation products | TOF/MOF | 15-30s |
| PASTOR | Higher-consideration, founder/testimonial | MOF/BOF | 30-60s |
| FAB | Technical/spec-driven products | MOF | 15-25s |
| 4Ps | Aspirational/lifestyle | TOF | 15-30s |
| Star-Story-Solution | UGC/creator testimonial | TOF/MOF | 20-45s |
| Hook-Retain-Reward | Retention layer over any of the above | All | All |

**A/B tip:** When two frameworks both plausibly fit, write one script in each and let performance
decide — e.g., one PAS cut and one BAB cut of the same product, same budget, compare 3-day
results, rather than guessing.

---

## 2. Hook Taxonomy (First 1-3 Seconds)

A hook must work even with sound off — if the viewer can't grasp the category, problem, or
promise from the visual + text overlay alone, it's too slow. TikTok's own guidance: introduce the
content proposition within the first 3 seconds; losing more than ~35% of viewers in that window
means the hook is too weak. General rule: **lead with the payoff, not the setup** — the first
line should be the single most compelling line in the whole script, and any curiosity it opens
should be resolved by the second beat (don't stretch the tease past 1-2 more cuts, or it reads as
clickbait/tricked-you rather than rewarded).

Below is a working taxonomy. Treat each as a distinct, swappable opener for the same underlying
script — this is the primary lever for making otherwise-similar scripts feel different.

| # | Hook type | What it is | When it works best | Deploy in 1-3s as... | Example line |
|---|---|---|---|---|---|
| 1 | **Problem / Pain hook** | States a recognizable frustration directly, no sales language | Pain-aware audiences | On-screen text + flat delivery of the exact frustration | "Your landing page isn't the problem. The first offer is." |
| 2 | **Shocking statistic / surprising fact** | Leads with a counterintuitive fact tied to the product category | Curiosity-driven, educational feel | Bold on-screen stat + deadpan voiceover | "Your keyboard is dirtier than a toilet seat. Here's the fastest way to clean it." |
| 3 | **Bold claim** | A superlative or strong promise stated up front | Confident brands, demo-able products | Direct claim, then immediately cut to proof | "The fastest way to fold a shirt — even kids can do it." |
| 4 | **Negative / warning (alert) hook** | Urgent warning about a problem the viewer may not know they have | High-stakes or safety-adjacent products | Urgent tone, "if X, do Y now" | "If your fridge sounds like this, unplug it. Now." |
| 5 | **Curiosity gap** | Hints at an outcome/answer without revealing it yet | Any category, use sparingly (must close the loop fast) | Open a specific, resolvable question | "The habit keeping you awake isn't caffeine." |
| 6 | **Direct question hook** | Asks the viewer a targeted question that invites mental participation | Relatable daily-life products | Second-person question to camera or as text | "Still using three apps to plan your week?" |
| 7 | **POV / relatable hook** | "POV:" framing that drops viewer into a recognizable scenario | Lifestyle, humor, Gen-Z audiences | "POV: ___" text overlay + scene reenactment | "POV: your closet has clothes, but no outfits." |
| 8 | **Before/after reveal** | Opens mid-transformation or teases the after-state first | Visual transformation products | Split-screen or fast-cut reveal | "$200 vacuum vs. $59 vacuum — I was shocked by the result." |
| 9 | **"Stop scrolling" / pattern interrupt** | Unexpected visual, edit, sound, or direct address that breaks the scroll rhythm | Any category; best as a reset when other hooks feel flat | Whip-pan, zoom-snap, or verbal "Stop! Look at this." | "Stop! Look at this." |
| 10 | **Social proof hook** | Leads with a specific number + specific outcome | Retargeting / trust-building | Stat card + confident voiceover | "Helped 3,200 ecommerce brands cut cost-per-purchase by 30%." |
| 11 | **Contrarian / myth-vs-fact hook** | Challenges a widely-held belief in the niche | Educated or skeptical audiences | "Everyone says X. Here's why that's wrong." | "Everyone says this $15 blender is amazing. Here's my honest test." |
| 12 | **Demonstration / demo-first hook** | Opens with the product actively performing, mid-action | Visually satisfying / fast-result products | Extreme close-up of the result happening | "Watch this stain lift in 8 seconds." |
| 13 | **Story cold-open** | Drops into the middle of a narrative with no setup | Testimonial/founder stories, longer formats | In-media-res line, ominous or intriguing tone | "My skincare routine kept failing... until I tried this." |
| 14 | **Mistake hook** | Exposes a common error the audience doesn't know they're making | Educational/how-to niches | "If you do X before Y, you're doing it backward." | "If you exfoliate before cleansing... you're doing it backward." |
| 15 | **Price-shock / value hook** | Leads with a dramatic price or value contrast | Budget/value angle, sales/promos | Price overlay with strikethrough | "This was $120 last year... now it's $29." |
| 16 | **Scarcity hook** | Leads with limited availability or urgency | Launches, restocks, limited drops | Text overlay: "Back in stock" / countdown | "They restocked today. These sell out in hours." |
| 17 | **Discovery / "I found this" hook** | Frames the product as a personal find, not an ad | UGC, low-pressure trust-building | Casual, first-person camera address | "I found the easiest way to clean this corner." |
| 18 | **Comment-reply hook** | Formatted as a reply to a real/implied buyer question | Native-feeling platform content (TikTok/Reels) | "Replying to @user..." UI overlay | "Replying to the person who said this looked too small." |
| 19 | **Numbered breakdown hook** | Promises a structured list, often teasing the best item | List-style educational content | "3 ways to do X, and #2 is instant." | "3 ways to make your room look bigger — and #2 is instant." |

**Anti-clickbait rule:** whichever hook type is used, the loop it opens must close by the second
beat with real proof (product UI, demonstration, or concrete result) — stretching curiosity
without payoff reads as manipulative and tanks trust/completion rate.

---

## 3. Marketing Angles (Deployment Scenarios)

The **angle** is the narrative premise — *why the viewer should care* — and it reshapes the whole
script, not just the hook. The same product can run under any of these; rotating angles across
generated scripts is the single highest-leverage way to avoid formulaic output, because it changes
setting, characters, pacing, and proof style, not just wording.

| Angle | Core idea | How it changes the script | Typical hook pairing |
|---|---|---|---|
| **Problem-Solution** | Name a common frustration, offer the product as instant relief | Cold open on the pain, short middle, fast resolution | Problem/Pain, Alert, Direct Question |
| **Transformation (Before/After)** | Sell the end-state the viewer dreams of | Structure is literally before → after → bridge; visual contrast carries the persuasion | Before/After Reveal, Bold Claim |
| **Comparison** | Pit the product against a competitor, a DIY method, or "the expensive version" | Split-screen or side-by-side structure throughout, not just the hook | Contrarian, Price-Shock |
| **Myth-Busting** | Open with a common misconception, then correct it | "Myth vs. fact" framing sustained through the whole body, not just the opener | Mistake hook, Contrarian |
| **Day-in-the-Life** | Embed the product inside an ordinary routine/vlog | Loose, observational pacing; product appears as a natural beat, not a pitch | POV, Discovery |
| **Unboxing** | Center the reveal-and-first-use moment | Real-time or fast-motion unbox, tactile close-ups, genuine reaction shots | Discovery, Demonstration |
| **Tutorial / How-To** | Teach a skill or process the product enables | Numbered steps, clear before/after within each step | Numbered Breakdown, Demonstration |
| **Testimonial** | A real (or creator-as-real) user tells their story | Star-Story-Solution framework fits naturally; leads with trust, not spectacle | Discovery, Story Cold-Open |
| **Trend-Jacking** | Piggyback a current audio/format/meme trend | Script is written *to* the trend's existing structure/rhythm, product inserted into it | Pattern Interrupt, Stop-Scrolling |
| **FOMO / Scarcity** | Urgency drives immediate action | Compressed pacing, countdown/stock language throughout, CTA moved earlier | Scarcity, Price-Shock |
| **Luxury / Aspirational** | Sell status, craft, and the full-service experience, not just the object | Slower pacing, cinematic shots, journey framing (unboxing → daily use → care/repair) rather than hard-sell | Bold Claim, Before/After |
| **Budget / Value** | Win on price-to-performance, "smart shopper" framing | Explicit price comparisons, no-frills tone, receipts/numbers on screen | Price-Shock, Comparison |

**Angle-testing tip:** testing one angle at a time is slow; production teams typically generate
10-20 angle variations and let data find winners rather than debating internally which angle is
"best" for a given product.

---

## 4. Variation & Anti-Repetition Techniques

The goal is to make every generated script feel like it came from a different creator, not a
template with swapped nouns. Vary along these independent dimensions:

### 4.1 What to Vary Simultaneously
- **Hook approach:** rotate among problem-first, product-demo, bold-claim, social-proof-opening,
  and curiosity-driven-question even when the CTA, product, and script body stay similar — this
  alone can be tested with everything else held constant to isolate hook performance.
  - Example structure for parallel testing: same avatar, same script body, same CTA, 5 different
    openings.
- **Emotional appeal / tone:** casual vs. professional, urgent vs. calm, funny vs. sincere.
  Explore several distinct emotional appeals per product rather than one default tone.
- **Length:** short punchy cuts vs. longer narrative cuts of the same core message.
- **Benefit-led vs. problem-led:** lead with the payoff in one version, lead with the pain in
  another.
- **Formal vs. conversational language register.**

### 4.2 Pacing & Shot-Rhythm Patterns
- A single script can be delivered as a **slow-build take** or a **high-energy take** — the pace
  difference is set in the edit (cut frequency) or in delivery speed, not necessarily in the
  words themselves. Generate both edits from one script when possible.
- Fast cuts and forward motion sustain the "Retain" phase (Section 1.8) — avoid long static shots
  in the middle third, where most ads lose viewers even after a strong hook.
- Reserve one slower, held shot for the "Reward" beat so the payoff has room to land — don't cut
  away from the result too quickly.

### 4.3 CTA Variety
Do not reuse the same CTA line across every script. Rotate:
- Action verb: "Shop Now" / "Learn More" / "Try It Free" / "Get Yours" / "Sign Up" / "Tap the
  Link" / "See the Results".
- Urgency framing: "today only" / "while stock lasts" / "link in bio" / no urgency at all (soft
  CTA for trust-building testimonial angles).
- Placement: CTA can ride the emotional peak immediately after the Reward beat (recommended
  default), or — for FOMO/scarcity angles — be pulled earlier and repeated.

### 4.4 Generating Multiple Distinct Scripts from One Input
When asked for N scripts from the same product/reference video, ensure no two scripts share more
than one of: {framework, hook type, angle, tone}. A practical matrix approach:
1. Pick 3-5 angles (Section 3) appropriate to the product.
2. For each angle, pick a framework (Section 1) that fits its funnel stage.
3. For each angle+framework pair, pick a hook type (Section 2) not yet used in this batch.
4. Assign a distinct pacing/tone and CTA phrasing per script.
This mirrors real ad-testing practice: teams need roughly 8-15 *meaningfully* different variants
per set (not just wording tweaks) — different angle, different visual approach, different emotional
register — to actually diversify performance and avoid creative fatigue.

### 4.5 Creative Fatigue Signals to Design Against
- Mixing lifestyle shots and product-only shots across a batch avoids visual sameness even when
  scripts share a framework.
- Alternate bold/high-contrast visual treatment with minimal/clean treatment across scripts in
  the same batch.
- If every script in a batch resolves its hook the same way (e.g., always cutting to a product
  shot at second 3), viewers who see multiple ads from the same brand will pattern-match and
  disengage faster — stagger where the reveal lands.

---

## 5. Text Overlay + Voiceover Best Practices

### 5.1 Sync
- Captions/text overlays must be synchronized precisely with spoken audio — lagging or rushed
  captions disrupt viewing flow and read as low-quality production.
- Match on-screen text wording to the voiceover wording where possible (redundancy between text
  and audio improves retention; mismatched text and audio measurably hurts it).

### 5.2 Word Count & Card Timing
- **5-8 words per overlay card** is the sweet spot; cap at **2 lines visible at once**.
- Typical range across sources: 6-12 words per caption card, held on screen for roughly
  **1.5-2.5 seconds** (up to 3s max).
- Card budget by video length: a 15-second ad comfortably fits **4-6 text cards**; a 30-second ad
  fits **8-12**.

### 5.3 Style & Readability
- Use high-contrast text (readable on small screens, in bright environments, for viewers with
  visual impairments).
- Edit out filler words ("uh," "um") from captions for smoother reading.
- Include sound-effect cues, music cues, and speaker identifiers in captions when relevant to
  comprehension.

### 5.4 Design for Sound-Off Viewing
- The hook specifically must work with sound off: if the category/problem/promise isn't clear
  from visual + on-screen text alone within 1-3 seconds, the hook is failing regardless of how
  good the voiceover is.
- That said, sound should not be treated as optional for the full video: adding sound (music,
  voiceover, or both) to short-form ads has been associated with a 20%+ lift in conversions, so
  scripts should be written to work well both muted (via captions) and with audio.

### 5.5 Voiceover Delivery
- Match delivery pace to the chosen pacing pattern (Section 4.2): high-energy edits pair with
  faster, punchier line reads; slow-build/luxury edits pair with more deliberate, lower-energy
  delivery.
- Keep sentences short and speakable in single breaths — this is what naturally produces
  caption-friendly 5-8 word chunks rather than requiring the captions to be artificially split.

---

## 6. Quick Combination Cheat-Sheet

Use this as a fast lookup when assembling a new script: pick one row from each column, avoiding
combinations already used earlier in the same batch.

| Framework | Hook type | Angle | Pacing | CTA style |
|---|---|---|---|---|
| AIDA | Bold claim | Transformation | High-energy fast-cut | "Shop Now — today only" |
| PAS | Problem/Pain | Problem-Solution | Medium, steady | "Tap the link to fix it" |
| BAB | Before/After Reveal | Transformation | Slow-build then snap-cut | "See your before/after" |
| PASTOR | Story Cold-Open | Testimonial | Narrative, medium pace | "Read my full story — link in bio" |
| FAB | Demonstration | Tutorial / How-To | Steady, step-by-step | "Learn More" |
| 4Ps | Social Proof | Luxury/Aspirational | Slow, cinematic | "Discover the collection" |
| Star-Story-Solution | Discovery ("I found this") | Day-in-the-Life | Loose, observational | "Try it free" |
| Hook-Retain-Reward (overlay any) | Pattern Interrupt / Stop-Scrolling | Trend-Jacking | Fast, native-feeling | "Follow for more" / "Shop Now" |
| PAS | Scarcity | FOMO/Scarcity | Compressed, urgent | "While stock lasts" |
| Comparison-driven (any) | Contrarian / Myth-vs-Fact | Myth-Busting or Budget/Value | Medium, confident | "See the real results" |

---

## Sources

- [Writing a Hook for Short-Form Video Ads — Captions Help Center](https://captions.ai/help/guides/marketing/hook-writing)
- [TikTok Hook Formulas That Drive 3-Second Holds — OpusClip Blog](https://www.opus.pro/blog/tiktok-hook-formulas)
- [How to Write Viral Hooks for Short-Form Video (2026) — Kineclip](https://kineclip.com/blog/how-to-write-viral-hooks-short-form-2026/)
- [TikTok ad hooks: 35 native openers for 2026 — Zeely AI](https://zeely.ai/blog/hooks-for-tiktok-video-ads/)
- [8 Powerful Advertisement Scripts Examples to Drive Conversions in 2026 — Proom](https://proom.ai/blog/advertisement-scripts-examples)
- [Content hooks, storytelling, pacing, CTA for short viral videos — Automateed](https://www.automateed.com/content-hooks-for-short-form-videos)
- [TikTok Ad Creative Best Practices: 3-Second Hook Rule (2026) — MBA Digital](https://www.mbadv.agency/tiktok-ads/creative-best-practices)
- [TikTok Video Hooks Guide (2026) — Selfstorming](https://www.selfstorming.com/guides/social-media-hooks/tiktok-video-hooks)
- [7 TikTok Ad Scripts Formulas That Convert in 2026 — TikAdSuite](https://tikadsuite.com/blog/tiktok-ad-scripts-formulas/)
- [AI Ad Copy Frameworks: PAS, AIDA, BAB, FAB, and 4U Prompts — Medium](https://belovroman.medium.com/ai-ad-copy-frameworks-pas-aida-bab-fab-and-4u-prompts-6241e3d93500)
- [3 UGC Ad Script Structures That Work — InReels](https://www.inreels.ai/blog/ugc-ad-frameworks-for-tiktok-and-meta)
- [AIDA, PAS, and Beyond: Classic Copywriting Models — LeadEnforce](https://leadenforce.com/blog/aida-pas-and-beyond-classic-copywriting-models-in-the-age-of-digital-ads)
- [The UGC Ad Script Structure: Hook, Body, CTA — SparkUGC](https://www.sparkugc.com/resources/ugc-ad-script-structure-template)
- [TikTok Ads: Complete Guide To High-Performing Campaigns 2026 — Creatify](https://creatify.ai/blog/tiktok-ads-complete-guide-to-creating-high-performing-creatives-in-2026)
- [TikTok Ads Best Practices and Ad Examples — Demand Curve](https://www.demandcurve.com/playbooks/tiktok-ads-best-practices)
- [TikTok UGC Ads 2026: Master Hooks, Angles & Matrix — MyUGC Studio](https://myugc.studio/blog/ugc-video-ads-tiktok-hooks-angles-creative-matrix.html)
- [15 Testimonial Advertising Examples — Vidlo](https://vidlo.video/blog/inspiring-testimonial-advertising-examples/)
- [What is an Ad Angle in Advertising — AdHeart](https://adheart.me/en/blog/what-is-an-ad-angle/)
- [25 Best Video Ad Hook Examples That Stop the Scroll — Segwise](https://segwise.ai/blog/video-ad-hooks-drive-conversions)
- [10 Best Performing Ad Hooks — Trendtrack Blog](https://www.trendtrack.io/blog-post/best-performing-ad-hooks)
- [8 High-Converting Video Ad Hook Examples for 2026 — Sovran](https://sovran.ai/blog/video-ad-hook-examples)
- [Scroll Stopping Hooks: 5 Triggers — Quadcubes](https://quadcubes.com/scroll-stopping-hooks-psychology-2026/)
- [Video Ad Hooks That Convert: Formulas and Examples — ORCA](https://www.goorca.ai/blog/video_ad_hooks_guide)
- [Text Overlays on Video (2026): Best Practices + Examples — Project Aeon](https://project-aeon.com/blogs/text-overlay-on-video-master-engaging-techniques)
- [YouTube Shorts ads: Asset specs and best practices — Google Ads Help](https://support.google.com/google-ads/answer/16041697?hl=en)
- [How to use text overlays effectively in video ads (2026) — RocketShip HQ](https://www.rocketshiphq.com/text-overlays-video-ads-mobile/)
- [Best Practices for Text Overlays in Short Videos — DriveEditor](https://driveeditor.com/blog/text-overlays-in-short-videos)
- [100+ Video Captions & Caption Strategy (2026) — OpusClip](https://www.opus.pro/research/best-caption-strategy-short-form)
- [35 Copywriting Frameworks That Sell — GoGoChimp](https://www.gogochimp.com/blog/copywriting-frameworks)
- [Best Copywriting Frameworks (With the Exact AI Prompt for Each) — Asset Academy](https://assetacademy.io/conversions/frameworks-hacks/best-copywriting-frameworks/)
- [How To Use The PASTOR Framework To Write Copy For Ecommerce Brands — growthzacks](https://www.growthzacks.com/blog/pastor-framework-ecommerce/)
- [What is the PASTOR framework in copywriting? — Credible Content Blog](https://credible-content.com/blog/what-is-the-pastor-framework-in-copywriting/)
- [The PASTOR Copywriting Formula Explained With Example — Instacopy](https://instacopy.ai/blog/pastor-copywriting-formula/)
- [Free AI Ad Angle Generator — Playcut.ai](https://playcut.ai/tools/ai-ad-angle-generator/)
- [10 Ad Copy Examples and Ad Scripts for Meta & TikTok Ads (2026) — Sovran](https://sovran.ai/blog/ad-copy-examples)
- [25 most creative luxury goods ads you can copy in 2026 — Zeely AI](https://zeely.ai/blog/25-most-creative-luxury-goods-ads/)
- [How to Set Up Multiple Ad Variations on Facebook — Pixis](https://pixis.ai/blog/how-to-set-up-multiple-ad-variations-on-facebook/)
- [How to Use AI for Ad Creative Variation at Scale — MindStudio](https://www.mindstudio.ai/blog/ai-ad-creative-variation-marketing-sub-agent-pattern)
- [Ad Variations: Definition & Examples — AdSights](https://www.adsights.ai/resources/glossary/creative/ad-variations)
- [Creative diversity: Meta's algorithm buckets look-alike UGC — Billo](https://billo.app/blog/creative-diversity/)
- [Short-Form Video Hooks: 7 Formulas for 70%+ Retention — Terra Market Group](https://www.terramarketgroup.com/digital-marketing-2/short-form-video-hooks-7-formulas-for-70-retention/)
- [Hook-Retain-Reward: the Short-Form Video Structure — Selfstorming](https://www.selfstorming.com/tools/libraries/frameworks/hook-retain-reward)
- [Short-Form Video Structure: Hook, Body, Payoff — Socialync](https://www.socialync.io/blog/short-form-video-structure-guide-2026)
- [What Makes a YouTube Hook? Definition, 8 Types, and 30+ Examples — Prepublish](https://prepublish.ai/blog/what-is-a-youtube-hook)
- [Crafting High-Performing Video Hooks: The Ultimate Guide — Chaplin Foundation](https://chaplinai.pro/en/foundation/hooks)
- [64+ Viral TikTok Hooks That Actually Work in 2026 — Socialync](https://www.socialync.io/viral-hooks-library)
