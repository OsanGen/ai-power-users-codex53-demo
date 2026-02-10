window.AI_POWER_USER_NARRATIVE = {
  version: "neural_glass_v1",
  titleScreen: {
    title: "Neural Glass: Neural Nets",
    subtitle: "Drag inputs. Watch concepts. Predict churn.",
    bullets: [
      "Neural nets learn signal vs noise.",
      "They learn weights from data.",
      "They output one prediction."
    ],
    footerHint: "Enter: start • Esc: none"
  },

  // Teach card per floor (1..9). Each card is a micro-lesson + micro-challenge.
  teachCards: [
    {
      floor: 1,
      title: "Neural net = smart filter",
      oneLiner: "It turns messy data into one prediction.",
      bullets: [
        "Inputs are raw data.",
        "Hidden layer learns concepts.",
        "Output is churn risk."
      ],
      microChallenge: "Press 1 then 2. Watch risk flip.",
      visualMode: "fundamentals"
    },
    {
      floor: 2,
      title: "Inputs are raw data",
      oneLiner: "The net starts with no meaning.",
      bullets: [
        "Logins: last 30 days.",
        "Tickets: support pain.",
        "Tenure and features matter."
      ],
      microChallenge: "Move one slider. See concept change.",
      visualMode: "inputs"
    },
    {
      floor: 3,
      title: "Weights turn volume knobs",
      oneLiner: "Weights say what matters most.",
      bullets: [
        "High weight: strong signal.",
        "Low weight: mostly noise.",
        "Weighted = input × weight."
      ],
      microChallenge: "Make tickets dominate the flow.",
      visualMode: "weights"
    },
    {
      floor: 4,
      title: "Hidden layer learns concepts",
      oneLiner: "Concepts compress raw signals.",
      bullets: [
        "LOYAL, FRUSTRATED, ENGAGED.",
        "Activation is 0–100%.",
        "Top activation is dominant."
      ],
      microChallenge: "Make ENGAGED dominant.",
      visualMode: "hidden"
    },
    {
      floor: 5,
      title: "Output = churn risk",
      oneLiner: "Dominant concept drives the prediction.",
      bullets: [
        "0% stay. 100% leave.",
        "Dominant concept pushes risk.",
        "Small changes swing output."
      ],
      microChallenge: "Get risk above 70%.",
      visualMode: "output"
    },
    {
      floor: 6,
      title: "Golden thread",
      oneLiner: "Say the full loop in one breath.",
      bullets: [
        "Raw data → weighted signals.",
        "Weighted signals → concepts.",
        "Concepts → prediction."
      ],
      microChallenge: "Match one input to one concept.",
      visualMode: "golden_thread"
    },
    {
      floor: 7,
      title: "Learner, not thinker",
      oneLiner: "No rules are hard-coded.",
      bullets: [
        "Weights come from data.",
        "Different data learns different weights.",
        "Bad data teaches bad patterns."
      ],
      microChallenge: "Ask: what changed between 1 and 2?",
      visualMode: "learners_not_thinkers"
    },
    {
      floor: 8,
      title: "Interpret the prediction",
      oneLiner: "Explain the why, not just the %.",
      bullets: [
        "Check dominant concept.",
        "Check strongest signals.",
        "Explain in one sentence."
      ],
      microChallenge: "Explain At-Risk in one line.",
      visualMode: "interpretability"
    },
    {
      floor: 9,
      title: "Apply it anywhere",
      oneLiner: "Same loop. New domain.",
      bullets: [
        "Fraud, loans, recommendations.",
        "Inputs change the output.",
        "You can explain the loop."
      ],
      microChallenge: "Name inputs and output for a domain.",
      visualMode: "transfer"
    }
  ],

  // Small UI lines used elsewhere (upgrade screen, etc.)
  ui: {
    teachCardHint: "Enter: upgrades • 1: happy • 2: at-risk",
    teachCardTitlePrefix: "Teach Card",
    upgradePickTitle: "Pick an upgrade",
    upgradePickSubtitle: "Stack small power. Keep control.",
    floorClearTitle: "Floor cleared",
    floorClearSubtitle: "Raw data → weights → concepts → prediction.",
    victoryTitle: "You can explain a neural net.",
    victorySubtitle: "You learned the loop, not magic.",
    gameOverTitle: "Run ended. Lesson stays.",
    gameOverSubtitle: "Try again. Watch the dominant concept."
  },

  // Rename upgrades only (do not touch effects).
  upgradeRename: {
    comfy_soles:   { name: "Faster iteration", desc: "Move faster. Run more tests." },
    quick_trigger: { name: "Lower latency", desc: "Shorter delay. More output." },
    wide_shots:    { name: "Wider coverage", desc: "Bigger hit window." },
    fast_rounds:   { name: "Higher throughput", desc: "Faster shots. More tries." },
    ghost_rounds:  { name: "Residual pass", desc: "One shot hits again." },
    heart_container:{ name: "Error budget", desc: "More max health. Heal +1." },
    bubble_shield: { name: "Guardrails", desc: "Block a mistake." },
    grace_frames:  { name: "Stability window", desc: "More time after a hit." },
    magnet_hands:  { name: "Data magnet", desc: "Pull pickups in." },
    slowmo_aura:   { name: "Time dilation", desc: "Slow incoming bullets." }
  },

  // Share copy helper (if share modal exists)
  share: {
    title: "Share what you learned",
    oneLiner: "Post the floor you reached and the loop.",
    buildPost: {
      line1: "I reached Floor {floor} of 9 in Neural Glass.",
      line2: "Neural nets: inputs → weights → concepts → prediction.",
      line3: "Dominant concept drives the output.",
      line4: "{url}"
    }
  }
};
