// Everything that changes depending on what the idea is FOR.
// Used by both the API route (prompts) and the page (card labels),
// so keep this file free of server-only code.

export type Purpose = "startup" | "hackathon" | "research";

// Where we look for things that already exist.
export type SearchSource = "web" | "github" | "devpost" | "arxiv";

export const SOURCE_LABELS: Record<SearchSource, string> = {
  web: "Web",
  github: "GitHub",
  devpost: "Devpost",
  arxiv: "arXiv",
};

// One extra field shown on each card, besides title + pitch.
type Field = { key: string; label: string; hint: string };

type PurposeConfig = {
  label: string;
  tagline: string; // short description under the selector button
  guidance: string; // added to every prompt so outputs fit the purpose
  fields: Field[]; // card fields the model must return
  directions: { label: string; prompt: string }[]; // ways to push the idea
  sources: SearchSource[]; // which searches to run for this purpose
  searchHint: string; // tells the query writer what kind of existing work to look for
};

export const PURPOSES: Record<Purpose, PurposeConfig> = {
  startup: {
    label: "Startup",
    tagline: "Customers, money, competition",
    guidance:
      "The user wants to build this as a STARTUP. Be concrete about who pays, how the business makes money, and who it competes with.",
    sources: ["web"],
    searchHint: "existing startups, companies, apps and products that already do this",
    fields: [
      { key: "targetCustomer", label: "Target customer", hint: "who exactly uses and pays for it" },
      { key: "revenueModel", label: "How it makes money", hint: "the business model" },
      { key: "competition", label: "Competition", hint: "existing alternatives and how this differs" },
    ],
    directions: [
      { label: "Different customer", prompt: "Rebuild this idea for a completely different target customer than the obvious one." },
      { label: "Opposite market", prompt: "Take this idea to the opposite market from where it would naturally start (e.g. rich vs poor countries, young vs old, urban vs rural)." },
      { label: "B2B", prompt: "Turn this idea into a business-to-business product sold to companies." },
      { label: "Consumer", prompt: "Turn this idea into a consumer product that individuals buy or use directly." },
      { label: "Physical", prompt: "Make this idea a physical product or in-person service, not software." },
      { label: "Digital-only", prompt: "Make this idea purely digital: an app, website, or online service." },
      { label: "Cheap", prompt: "Make this the cheapest possible version, aimed at a mass market with a very low price." },
      { label: "Premium", prompt: "Make this an expensive, premium, luxury version for a small high-paying audience." },
      { label: "Inverted assumption", prompt: "Identify the core assumption behind this idea, flip it to its opposite, and build the product around the flipped assumption." },
    ],
  },

  hackathon: {
    label: "Hackathon",
    tagline: "Buildable in 48h, wows judges",
    guidance:
      "The user wants to build this at a HACKATHON. It must be buildable by a small team in 24-48 hours, have a clear live demo moment, and impress judges.",
    sources: ["web", "github", "devpost"],
    searchHint: "existing hackathon projects (e.g. on Devpost), open-source repos and apps that already do this",
    fields: [
      { key: "buildPlan", label: "What to build in 48h", hint: "the minimal scope and rough tech stack" },
      { key: "demoMoment", label: "The demo moment", hint: "the one thing you show judges live" },
      { key: "judgeAppeal", label: "Why judges will love it", hint: "what makes it stand out from other teams" },
    ],
    directions: [
      { label: "Hardware hack", prompt: "Make this a hardware or IoT hack using cheap parts (Arduino, Raspberry Pi, sensors, phone sensors)." },
      { label: "AI-powered", prompt: "Put an AI model at the core of this idea in a way that feels surprising, not just a chatbot wrapper." },
      { label: "Social good", prompt: "Point this idea at a social good problem: accessibility, climate, health, or education." },
      { label: "Real-time", prompt: "Make this idea real-time and multiplayer: many people interacting live at once." },
      { label: "Visual wow", prompt: "Make this idea extremely visual: a striking interface, visualization, or AR experience." },
      { label: "Dev tool", prompt: "Turn this idea into a tool for developers that other hackers at the event could use." },
      { label: "Data mashup", prompt: "Build this idea by combining two or more free public APIs or open datasets in an unexpected way." },
      { label: "Tiny & polished", prompt: "Shrink this idea to the smallest possible thing that can be made fully polished in one day." },
      { label: "Inverted assumption", prompt: "Identify the core assumption behind this idea, flip it to its opposite, and build the hack around the flipped assumption." },
    ],
  },

  research: {
    label: "Research",
    tagline: "Novel question, method, data",
    guidance:
      "The user wants to turn this into a RESEARCH project. Frame it as a novel research question with a plausible method, real or realistic datasets, and the gap in existing work it fills.",
    sources: ["web", "arxiv"],
    searchHint: "prior papers, studies and existing research on this question",
    fields: [
      { key: "researchQuestion", label: "Research question", hint: "one precise, testable question" },
      { key: "method", label: "Method", hint: "how you would answer it" },
      { key: "datasets", label: "Datasets", hint: "named existing datasets, or how to collect data" },
      { key: "gap", label: "Gap it fills", hint: "what existing work misses" },
    ],
    directions: [
      { label: "Different population", prompt: "Study this idea in a different population or setting than the obvious one." },
      { label: "Opposite context", prompt: "Move this idea to the opposite context (low-resource vs high-resource, developing vs developed regions, children vs elderly)." },
      { label: "Quantitative", prompt: "Frame this as a quantitative study with measurable variables and a statistical or ML method." },
      { label: "Qualitative", prompt: "Frame this as a qualitative or human-centered study (interviews, ethnography, user studies)." },
      { label: "Benchmark", prompt: "Turn this into a new benchmark or dataset contribution that others could evaluate against." },
      { label: "Cross-disciplinary", prompt: "Combine this idea with a field it is not usually connected to and borrow that field's methods." },
      { label: "Low-cost method", prompt: "Design the cheapest possible study: existing public data only, no special equipment." },
      { label: "Negative result", prompt: "Frame the study to test whether a popular belief related to this idea is actually false." },
      { label: "Inverted assumption", prompt: "Identify the core assumption behind this idea, flip it to its opposite, and build the research question around the flipped assumption." },
    ],
  },
};

export const PURPOSE_KEYS = Object.keys(PURPOSES) as Purpose[];

export function isPurpose(value: unknown): value is Purpose {
  return typeof value === "string" && value in PURPOSES;
}
