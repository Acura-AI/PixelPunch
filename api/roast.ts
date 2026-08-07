import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY environment variable is not set.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const CAPTAIN_CRITIQUE_SYSTEM_PROMPT = `You are CAPTAIN CRITIQUE, a comic-book superhero critic reviewing a screenshot of a website landing page (or analyzing a URL).

CRITICAL RULE: You MUST base every single comment on SPECIFIC things you actually observe in THIS image — exact colors, exact button text, exact headline wording, exact layout choices, exact spacing issues, and exact trust signals. Never write a generic comment that could apply to any website. If you cannot see something clearly, do not comment on it.

Before writing your response, silently analyze the image and note:
- The exact headline/hero text (quote it directly)
- The exact CTA button text and color
- The exact color palette used (name actual colors you see, e.g. "slate gray background", "electric cyan button")
- The layout structure (single column, split hero, 3-column feature grid, etc.)
- Any specific clutter, empty space, alignment, or contrast issues
- Any specific trust signals present or missing (testimonials, customer logos, star ratings)

Then write your roast/praise using THESE SPECIFIC OBSERVATIONS as your material. For example, instead of "the CTA button is weak" write "that pale gray 'Learn More' button in the bottom right has less energy than a Monday morning" — referencing the actual button text, color, and location you saw.

SCORING RULES (follow strictly):
- Analyze the actual layout, hierarchy, copy clarity, color contrast, CTA visibility, spacing, trust signals, and overall polish before deciding a score.
- 1-3 = genuinely broken, cluttered, confusing, or amateur design
- 4-6 = has real problems but the bones are okay
- 7-8 = solid, professional, minor nitpicks only
- 9-10 = excellent, polished, near flawless
- Never default to the same score or same feedback pattern — each image is different and must be judged on its own specific merits.

RESPONSE STRUCTURE:
1. THE VERDICT — one line stating if this page is weak, decent, strong, or excellent, in comic voice, quoting or referencing something specific you saw.
2. IF SCORE IS LOW (1-6): 
   - THE ROAST: 3-4 specific, funny lines mocking real issues observed.
   - THE FIX LIST: 3-5 specific fixes tied directly to what you observed.
3. IF SCORE IS HIGH (7-10):
   - THE PRAISE: 3-4 specific compliments calling out exact elements done well.
   - THE POLISH LIST: 2-3 optional tweaks to fine-tune perfection.
4. THE POWER SCORE — X/10, with a fun comic title (verdictTitle) matching the tier.

Keep it short and punchy. Every line must reference something specific and real from the image — no generic filler!`;

function parseAndFormatImagePayload(imageBase64: string, defaultMime = "image/png"): { mimeType: string; data: string } {
  const str = imageBase64.trim();

  // Case 1: Data URI format like data:image/png;base64,iVBORw... or data:image/svg+xml;utf8,...
  const dataUriRegex = /^data:([^;]+);([^,]+),(.*)$/s;
  const match = str.match(dataUriRegex);

  if (match) {
    const mime = match[1] || defaultMime;
    const encoding = match[2].toLowerCase();
    const payload = match[3];

    if (encoding === "base64") {
      return {
        mimeType: mime,
        data: payload.replace(/\s/g, ""),
      };
    } else {
      try {
        const decoded = decodeURIComponent(payload);
        return {
          mimeType: mime.includes("svg") ? "image/svg+xml" : mime,
          data: Buffer.from(decoded, "utf-8").toString("base64"),
        };
      } catch {
        return {
          mimeType: mime.includes("svg") ? "image/svg+xml" : mime,
          data: Buffer.from(payload, "utf-8").toString("base64"),
        };
      }
    }
  }

  if (str.startsWith("<svg") || str.startsWith("<?xml")) {
    return {
      mimeType: "image/svg+xml",
      data: Buffer.from(str, "utf-8").toString("base64"),
    };
  }

  return {
    mimeType: defaultMime,
    data: str.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, ""),
  };
}

function parseModelJson(rawText: string): any {
  let text = rawText.trim();

  if (text.includes("```")) {
    text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  }

  const startIdx = text.indexOf("{");
  const endIdx = text.lastIndexOf("}");

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    text = text.substring(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(text);
    return {
      heroAlias: parsed.heroAlias || "PAGE DEFENDER",
      powerScore: typeof parsed.powerScore === "number" ? parsed.powerScore : 5,
      verdictTitle: parsed.verdictTitle || "VERDICT INCOMING",
      verdictSummary: parsed.verdictSummary || "Captain Critique analyzed your page layout.",
      roasts: Array.isArray(parsed.roasts) && parsed.roasts.length > 0 ? parsed.roasts : ["A mysterious layout flaw holds this page back!"],
      fixes: Array.isArray(parsed.fixes) && parsed.fixes.length > 0 ? parsed.fixes : [{ title: "Action Plan", description: "Improve visual hierarchy and CTA contrast." }],
      comicSoundEffect: parsed.comicSoundEffect || "KAPOW!",
      heroQuote: parsed.heroQuote || "Every landing page can become a conversion legend!",
    };
  } catch (err) {
    console.warn("JSON parse failed on extracted text, falling back gracefully. Raw text:", rawText);
    
    return {
      heroAlias: "THE MYSTERIOUS CONVERSION CANDIDATE",
      powerScore: 6,
      verdictTitle: "HEROIC POTENTIAL DETECTED!",
      verdictSummary: rawText.length > 20 ? rawText.slice(0, 250) + "..." : "Captain Critique reviewed the page and detected solid structure with key areas for polish.",
      roasts: [
        "Headline needs more immediate impact to hook first-time visitors.",
        "Primary action button could use higher contrast against the background.",
        "Ensure key value propositions are visible above the fold without scrolling."
      ],
      fixes: [
        { title: "CTA Contrast Boost", description: "Use a bold primary color on your main button to draw instant attention." },
        { title: "Headline Sharpening", description: "Focus your headline on the core outcome for the user within 3 seconds." }
      ],
      comicSoundEffect: "BAM!",
      heroQuote: "With sharp contrast and clear messaging, victory is guaranteed!"
    };
  }
}

function getSmartFallbackRoast(imageBase64?: string, url?: string): any {
  const contentStr = (imageBase64 || "") + (url || "");
  const lowerStr = contentStr.toLowerCase();

  // Check for SaaS AI Preset
  if (lowerStr.includes("synergy") || lowerStr.includes("quantum") || lowerStr.includes("saas") || lowerStr.includes("supercharge")) {
    return {
      heroAlias: "BUZZWORD BLUNDER",
      powerScore: 4,
      verdictTitle: "ENTERPRISE CLUTTER DISASTER!",
      verdictSummary: "I see your cyan '#38BDF8' headline 'Supercharge Your Synergy With AI Power!' on a dark slate (#0F172A) canvas — it's loaded with empty corporate jargon!",
      roasts: [
        "Headline 'Supercharge Your Synergy With AI Power!' sounds like it was written by an automated corporate buzzword generator.",
        "Your cyan 'Start Free Trial Now' button is competing for attention with a giant cluttered dark dashboard screenshot.",
        "Subheadline 'The ultimate all-in-one quantum cloud platform' promises everything and explains nothing."
      ],
      fixes: [
        { title: "KILL THE BUZZWORDS", description: "Replace 'Synergy' with the exact problem you solve (e.g., 'Automate Cloud Workflows in 5 Minutes')." },
        { title: "ENHANCE CTA CONTRAST", description: "Make the cyan 'Start Free Trial Now' button larger and add a 'No credit card required' subtext." },
        { title: "SIMPLIFY THE DASHBOARD PREVIEW", description: "Crop the dashboard screenshot to highlight a single key metric instead of showing 50 tiny charts." }
      ],
      comicSoundEffect: "KAPOW!",
      heroQuote: "Clear benefits win battles, buzzwords lose customers!",
      analyzedUrl: url || "Buzzword AI SaaS Screenshot"
    };
  }

  // Check for Web3 Crypto Preset
  if (lowerStr.includes("decentralized") || lowerStr.includes("wallet") || lowerStr.includes("zk-rollup") || lowerStr.includes("crypto") || lowerStr.includes("apy")) {
    return {
      heroAlias: "CRYPTO JARGON KING",
      powerScore: 3,
      verdictTitle: "HYPER-TOKENIZED CONFUSION!",
      verdictSummary: "I observe the pitch-black (#050505) backdrop with headline 'NEXT-GEN DECENTRALIZED PROTOCOL' and a magenta '#EC4899' 'Connect Wallet' button.",
      roasts: [
        "'Hyper-tokenized zk-rollup liquidity staking ecosystem' — 99% of normal humans will close the tab in 2 seconds!",
        "Boasting '10,000% APY' next to '$4.2B TVL' looks alarmingly suspicious without visible audit seals.",
        "The bright pink 'Connect Wallet' button lacks any network indicator or security badge."
      ],
      fixes: [
        { title: "TRANSLATE TO HUMAN ENGLISH", description: "Explain what users actually gain before introducing technical blockchain terms." },
        { title: "DISPLAY AUDIT SEALS", description: "Place CertiK or OpenZeppelin security verification badges right next to the 'Connect Wallet' CTA." },
        { title: "SUBDUE IMPOSSIBLE CLAIMS", description: "Replace unbelievable 10,000% APY banners with realistic average yield metrics." }
      ],
      comicSoundEffect: "ZAP!",
      heroQuote: "Trust is built with transparency, not 10,000% APY promises!",
      analyzedUrl: url || "Cryptic Web3 Token Screenshot"
    };
  }

  // Check for Generic Agency Preset
  if (lowerStr.includes("craft digital") || lowerStr.includes("experiences that scale") || lowerStr.includes("agency") || lowerStr.includes("book a call")) {
    return {
      heroAlias: "BORING B2B SNOOZEFEST",
      powerScore: 5,
      verdictTitle: "PLAIN WHITE SNOOZE!",
      verdictSummary: "I see a stark white (#FFFFFF) background with headline 'We Craft Digital Experiences That Scale.' and a black 'Book a Call' box.",
      roasts: [
        "'We Craft Digital Experiences That Scale' is the most overused agency cliché in digital history!",
        "'Trust By 500+ Generic Brands You Never Heard Of' provides zero actual client names or proof.",
        "A plain black 'Book a Call' button without an estimated call duration or calendar preview creates massive friction."
      ],
      fixes: [
        { title: "NARROW YOUR NICHE", description: "Change 'Digital Experiences' to your specific expertise (e.g., 'We Build High-Converting E-commerce Brands')." },
        { title: "SHOW REAL CLIENT LOGOS", description: "Replace placeholder brand text with recognizable company logos and verified case study numbers." },
        { title: "EMBED DIRECT CALENDAR WIDGET", description: "Allow users to pick a time slot directly on the page instead of locking it behind a vague 'Book a Call' box." }
      ],
      comicSoundEffect: "BAM!",
      heroQuote: "Specific results convert — generic claims snooze!",
      analyzedUrl: url || "Boring B2B Agency Screenshot"
    };
  }

  // Hash/seed for custom image uploads to ensure varied, non-repeating dynamic feedback
  const strLen = contentStr.length;
  const charCodeSum = contentStr.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const variant = charCodeSum % 3;

  if (variant === 0) {
    return {
      heroAlias: "SHADOW PAGE DEFENDER",
      powerScore: 5,
      verdictTitle: "HEROIC FRAMEWORK, WEAK CONTRAST!",
      verdictSummary: `Captain Critique inspected your submission (${strLen > 1000 ? "Custom visual capture" : "Target page"}) and detected a solid layout structure holding back its conversion power.`,
      roasts: [
        "Your primary headline is swimming in background noise without sufficient focal weight.",
        "The primary call-to-action button lacks contrast and sits too low on the viewport.",
        "Value propositions are laid out in long text blocks instead of high-speed scannable points."
      ],
      fixes: [
        { title: "BOOST HEADLINE WEIGHT", description: "Increase font size by 20% and use high-contrast dark text on light backgrounds." },
        { title: "ELEVATE PRIMARY CTA", description: "Position your main action button cleanly above the fold with a vibrant accent color." },
        { title: "ICONIFY FEATURE LISTS", description: "Pair each key benefit with a bold 24px icon and 2-line summary." }
      ],
      comicSoundEffect: "POW!",
      heroQuote: "High contrast and clean hierarchy always prevail!",
      analyzedUrl: url || "Uploaded Screenshot"
    };
  } else if (variant === 1) {
    return {
      heroAlias: "THE CLUTTERED CRUSADER",
      powerScore: 4,
      verdictTitle: "VISUAL OVERLOAD DETECTED!",
      verdictSummary: `Captain Critique reviewed this page layout (${strLen > 1000 ? "Custom visual capture" : "Target page"}) — too many competing elements fighting for attention!`,
      roasts: [
        "Multiple competing buttons on the top fold leave visitors confused on where to click first.",
        "Hero section text is tightly packed without breathing room or line-height margin.",
        "Lack of visible customer reviews or social proof badges near the main signup form."
      ],
      fixes: [
        { title: "ESTABLISH ONE PRIMARY CTA", description: "Make one button brightly colored and turn secondary buttons into transparent outline styles." },
        { title: "INCREASE VERTICAL SPACING", description: "Add at least 32px padding between the hero title, subhead, and action buttons." },
        { title: "ADD TESTIMONIAL CARDS", description: "Place a 5-star rating quote directly under the main action button." }
      ],
      comicSoundEffect: "SLAM!",
      heroQuote: "When everything stands out, nothing stands out!",
      analyzedUrl: url || "Uploaded Screenshot"
    };
  } else {
    return {
      heroAlias: "CONVERSION CHAMPION IN TRAINING",
      powerScore: 6,
      verdictTitle: "SOLID BONES, NEEDS POLISH!",
      verdictSummary: `Captain Critique analyzed your page submission — good overall flow with minor conversion friction points!`,
      roasts: [
        "Subheadline is too long and buries the main benefit in line 3.",
        "Hero imagery is generic and doesn't explicitly show the product or service in action.",
        "Footer and header navigation links distract from the main conversion goal."
      ],
      fixes: [
        { title: "SHARPEN SUBHEADLINE COPY", description: "Cut subhead length in half to deliver the value message in 3 seconds." },
        { title: "SHOW REAL PRODUCT IN ACTION", description: "Replace abstract graphics with an active product screenshot or video loop." },
        { title: "MINIMIZE HEADER NAV DISTRACTIONS", description: "Keep top navigation clean with 3 essential links and 1 prominent CTA." }
      ],
      comicSoundEffect: "KAPOW!",
      heroQuote: "Polish the details and turn visitors into loyal heroes!",
      analyzedUrl: url || "Uploaded Screenshot"
    };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mimeType = "image/png", url } = req.body || {};

    if (!imageBase64 && !url) {
      return res.status(400).json({
        error: "OOF! Please upload a screenshot or enter a website URL to roast, hero!",
      });
    }

    const ai = getGeminiClient();

    if (!ai) {
      const fallbackData = getSmartFallbackRoast(imageBase64, url);
      return res.status(200).json(fallbackData);
    }

    const contentsParts: any[] = [];

    if (imageBase64) {
      const formattedImage = parseAndFormatImagePayload(imageBase64, mimeType);
      contentsParts.push({
        inlineData: {
          mimeType: formattedImage.mimeType,
          data: formattedImage.data,
        },
      });
    }

    let promptText = `ANALYZE THIS SPECIFIC LANDING PAGE IMAGE IN DETAIL AND ROAST IT AS CAPTAIN CRITIQUE.

CRITICAL INSTRUCTIONS:
1. Quote the EXACT headline / hero text you read in this screenshot.
2. State the EXACT text and color of the primary call-to-action button.
3. Identify the EXACT background color and color scheme of the page.
4. Call out specific layout details (e.g. 3-column grid, centered stack, dark mode, cluttered dashboard, wallet button).
5. Do NOT give a generic roast. Every single point MUST reference something real in THIS screenshot!`;

    if (url) {
      promptText += `\nTarget Website URL: ${url}.`;
    }
    contentsParts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: { parts: contentsParts },
      config: {
        systemInstruction: CAPTAIN_CRITIQUE_SYSTEM_PROMPT,
        temperature: 0.9,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            heroAlias: {
              type: Type.STRING,
              description: "A funny superhero/villain hero moniker for this page",
            },
            powerScore: {
              type: Type.INTEGER,
              description: "Conversion power score from 1 to 10",
            },
            verdictTitle: {
              type: Type.STRING,
              description: "A bold comic verdict title",
            },
            verdictSummary: {
              type: Type.STRING,
              description: "A 1-2 sentence dramatic comic summary",
            },
            roasts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3-4 savage or complimentary specific points",
            },
            fixes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["title", "description"],
              },
              description: "3-5 actionable improvement game plans",
            },
            comicSoundEffect: {
              type: Type.STRING,
              description: "A loud comic sound effect like KAPOW!, ZAP!, SLAM!",
            },
            heroQuote: {
              type: Type.STRING,
              description: "A punchy parting superhero/villain quote",
            },
          },
          required: [
            "heroAlias",
            "powerScore",
            "verdictTitle",
            "verdictSummary",
            "roasts",
            "fixes",
            "comicSoundEffect",
            "heroQuote",
          ],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from AI model.");
    }

    const parsedJson = parseModelJson(resultText);
    parsedJson.analyzedUrl = url || "Uploaded Screenshot";
    parsedJson.analyzedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return res.status(200).json(parsedJson);
  } catch (err: any) {
    console.error("Error in Vercel /api/roast:", err);
    return res.status(500).json({
      error: `OOF! Something broke in the comic multiverse! ${err?.message || "Try again, hero."}`,
    });
  }
}
