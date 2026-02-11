window.AI_POWER_USER_NARRATIVE = {
  version: "neural_glass_v1",
  titleScreen: {
    title: "Neural Glass: Learn Neural Nets",
    subtitle: "Use data. See steps. Predict risk.",
    bullets: [
      "A net reads input numbers.",
      "Weights choose what matters most.",
      "It outputs one risk score."
    ],
    footerHint: "Enter: start • T: add text"
  },

  // Teach card per floor (1..9). Each card is a micro-lesson + micro-challenge.
  teachCards: [
    {
      floor: 1,
      title: "Step 1: What nets do",
      oneLiner: "A net turns many facts into one guess.",
      bullets: [
        "Inputs are the facts.",
        "Hidden ideas are learned.",
        "Output is one score."
      ],
      microChallenge: "Press 1 then 2. See score change.",
      visualMode: "fundamentals"
    },
    {
      floor: 2,
      title: "Step 2: Inputs",
      oneLiner: "Inputs are the numbers you feed in.",
      bullets: [
        "Logins show activity.",
        "Tickets show friction.",
        "Tenure and features add context."
      ],
      microChallenge: "Move one slider. Watch output move.",
      visualMode: "inputs"
    },
    {
      floor: 3,
      title: "Step 3: Weights",
      oneLiner: "Weights are volume knobs for each input.",
      bullets: [
        "Big weight means stronger effect.",
        "Small weight means weaker effect.",
        "Input × weight = weighted signal."
      ],
      microChallenge: "Raise tickets. See stronger impact.",
      visualMode: "weights"
    },
    {
      floor: 4,
      title: "Step 4: Concepts",
      oneLiner: "Hidden concepts combine weighted signals.",
      bullets: [
        "Concepts can be LOYAL or FRUSTRATED.",
        "Each concept has an activation level.",
        "Highest activation is dominant."
      ],
      microChallenge: "Try to make ENGAGED dominant.",
      visualMode: "hidden"
    },
    {
      floor: 5,
      title: "Step 5: Output score",
      oneLiner: "Dominant concepts push the final risk score.",
      bullets: [
        "Low score means likely stay.",
        "High score means likely leave.",
        "Small input changes can flip risk."
      ],
      microChallenge: "Push risk above 70%.",
      visualMode: "output"
    },
    {
      floor: 6,
      title: "Step 6: Full loop",
      oneLiner: "Say the full path from input to output.",
      bullets: [
        "Inputs become weighted signals.",
        "Signals activate concepts.",
        "Concepts produce one score."
      ],
      microChallenge: "Say the loop out loud once.",
      visualMode: "golden_thread"
    },
    {
      floor: 7,
      title: "Step 7: Learn from data",
      oneLiner: "The model learns from examples, not hard rules.",
      bullets: [
        "Data sets the weights.",
        "New data can change behavior.",
        "Bad data teaches bad patterns."
      ],
      microChallenge: "Compare happy and at-risk presets.",
      visualMode: "learners_not_thinkers"
    },
    {
      floor: 8,
      title: "Step 8: Explain results",
      oneLiner: "Explain why the score changed.",
      bullets: [
        "Check strongest inputs first.",
        "Check dominant concept next.",
        "State one clear reason."
      ],
      microChallenge: "Explain one result in one sentence.",
      visualMode: "interpretability"
    },
    {
      floor: 9,
      title: "Step 9: Transfer the loop",
      oneLiner: "Use the same loop in new problems.",
      bullets: [
        "Fraud, loans, and recommendations use it.",
        "Inputs change by domain.",
        "The loop stays the same."
      ],
      microChallenge: "Name inputs and one output for a new domain.",
      visualMode: "transfer"
    }
  ],

  // Small UI lines used elsewhere (upgrade screen, etc.)
  ui: {
    teachCardHint: "Enter: upgrades • 1: happy • 2: at-risk",
    teachCardTitlePrefix: "Teach Card",
    upgradePickTitle: "Pick one learning boost",
    upgradePickSubtitle: "Read. Choose. Learn one idea.",
    floorClearTitle: "Floor cleared",
    floorClearSubtitle: "Input -> weight -> concept -> output.",
    victoryTitle: "You can explain neural nets.",
    victorySubtitle: "You know the loop and the why.",
    gameOverTitle: "Run ended. Keep the lesson.",
    gameOverSubtitle: "Try again. Track the loop."
  },

  // Rename upgrades only (do not touch effects).
  upgradeRename: {
    comfy_soles: { name: "Faster practice", desc: "Move faster. Test more." },
    quick_trigger: { name: "Fast feedback", desc: "Shoot sooner. See results faster." },
    wide_shots: { name: "Wider decision line", desc: "Bigger hit area." },
    fast_rounds: { name: "More practice cycles", desc: "More shots each moment." },
    ghost_rounds: { name: "Skip path", desc: "One shot can pass through." },
    heart_container: { name: "Error room", desc: "More max health. Heal +1." },
    bubble_shield: { name: "Safety rule", desc: "Block one hit." },
    grace_frames: { name: "Reset window", desc: "More safe time after hit." },
    magnet_hands: { name: "Data pull", desc: "Pull pickups from farther." },
    slowmo_aura: { name: "Slow noise", desc: "Enemy bullets move slower." }
  },

  // Share copy helper (if share modal exists)
  share: {
    title: "Share what you learned",
    oneLiner: "Share your floor and the model loop.",
    buildPost: {
      line1: "I reached Floor {floor} of 9 in Neural Glass.",
      line2: "Neural net loop: input -> weight -> concept -> output.",
      line3: "Dominant concept drives the output.",
      line4: "{url}"
    }
  }
};
