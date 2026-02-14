window.AI_POWER_USER_NARRATIVE = {
  version: "nn_mvp_v2",
  titleScreen: {
    title: "Neural Nets: Learn the Loop",
    subtitle: "Numbers in. Guess out. Learn why.",
    bullets: ["Inputs are numbers.", "Weights set importance.", "A forward pass makes a guess."],
    footerHint: "Enter: start • R: restart"
  },

  teachCards: [
    { floor: 1, title: "1) A neural net, in plain words", oneLiner: "It turns many numbers into one guess.",
      bullets: ["It is math, not magic.", "It learns from examples."],
      tryThis: "Say: numbers in → guess out.", visualMode: "network_basic"
    },
    { floor: 2, title: "2) Inputs", oneLiner: "Inputs are the numbers you feed in.",
      bullets: ["Examples: pixels, clicks, sensor values.", "Bad inputs lead to bad guesses."],
      tryThis: "Name 3 inputs for any problem.", visualMode: "inputs_nodes"
    },
    { floor: 3, title: "3) Weights", oneLiner: "Weights are importance knobs on inputs.",
      bullets: ["Big weight = bigger influence.", "Learning is mostly moving weights."],
      tryThis: "Say: input × weight = signal.", visualMode: "weights_knobs"
    },
    { floor: 4, title: "4) A neuron", oneLiner: "A neuron adds signals, then adds a bias.",
      bullets: ["Sum: weighted signals combine.", "Bias: a baseline shift."],
      tryThis: "Say: sum + bias → pre-activation.", visualMode: "sum_bias"
    },
    { floor: 5, title: "5) Activation", oneLiner: "Activation is a gate: on, off, or in-between.",
      bullets: ["Without it, nets stay linear.", "With it, nets learn curves."],
      tryThis: "Say: gate adds non-linearity.", visualMode: "activation_gate"
    },
    { floor: 6, title: "6) Layers", oneLiner: "Layers stack simple gates into concepts.",
      bullets: ["Early layers learn simple patterns.", "Later layers combine them."],
      tryThis: "Say: layers build features.", visualMode: "layers_stack"
    },
    { floor: 7, title: "7) Loss", oneLiner: "Loss is one number: how wrong the guess was.",
      bullets: ["High loss means wrong guess.", "Training tries to lower loss."],
      tryThis: "Say: loss down is the goal.", visualMode: "loss_meter"
    },
    { floor: 8, title: "8) Learning", oneLiner: "Learning nudges weights to reduce loss.",
      bullets: ["Gradient: which direction helps.", "Step size matters (learning rate)."],
      tryThis: "Say: error back → weights move.", visualMode: "backprop_arrows"
    },
    { floor: 9, title: "9) Generalize + explain", oneLiner: "A good net works on new cases and can be explained.",
      bullets: ["Test on data it never saw.", "Explain by strongest inputs and activations."],
      tryThis: "Explain one guess in one sentence.", visualMode: "generalize_explain"
    },
    { floor: 10, title: "10) Regularization", oneLiner: "Regularization stops memorizing noise.",
      bullets: ["Penalize extreme weights.", "Prefer generalize over memorize."],
      tryThis: "Say: generalize > memorize.", visualMode: "generalize_explain"
    },
    { floor: 11, title: "11) Optimizers", oneLiner: "Optimizers decide how weights move.",
      bullets: ["Learning rate sets step size.", "Momentum smooths the path."],
      tryThis: "Ask: step size too big?", visualMode: "backprop_arrows"
    },
    { floor: 12, title: "12) Batches", oneLiner: "Batches trade speed and stability.",
      bullets: ["Big batch = smoother updates.", "Small batch = noisier updates."],
      tryThis: "Say: batch is a mini dataset.", visualMode: "inputs_nodes"
    },
    { floor: 13, title: "13) Attention", oneLiner: "Attention learns what to focus on.",
      bullets: ["It weights inputs by relevance.", "It is a learned lookup."],
      tryThis: "Say: learn what to look at.", visualMode: "layers_stack"
    },
    { floor: 14, title: "14) Gradient stability", oneLiner: "Unstable gradients break learning.",
      bullets: ["Clip or normalize to stay stable.", "Good init reduces chaos."],
      tryThis: "Say: stability first.", visualMode: "loss_meter"
    },
    { floor: 15, title: "15) Evaluate + ship", oneLiner: "You ship when results hold up.",
      bullets: ["Test on data it never saw.", "Track failures and iterate."],
      tryThis: "Explain the win in 1 sentence.", visualMode: "generalize_explain"
    }
  ],

  deathCards: {
    early: [
      { title: "Loss means “how wrong”", oneLiner: "Big loss = wrong guess.",
        bullets: ["Training lowers loss.", "Weights move to do that."],
        tryThis: "Say: loss down, weights move.", visualMode: "loss_meter"
      },
      { title: "Inputs are just numbers", oneLiner: "No numbers, no model.",
        bullets: ["Choose inputs on purpose.", "Garbage in breaks outputs."],
        tryThis: "Name one input you trust.", visualMode: "inputs_nodes"
      },
      { title: "Weights are importance knobs", oneLiner: "They control influence.",
        bullets: ["Big weight pushes harder.", "Small weight matters less."],
        tryThis: "Say: knobs, not rules.", visualMode: "weights_knobs"
      },
      { title: "A neuron adds, then gates", oneLiner: "Sum first. Gate second.",
        bullets: ["Sum: signals combine.", "Gate: non-linearity."],
        tryThis: "Say: sum then gate.", visualMode: "sum_bias"
      },
      { title: "Bias is a baseline shift", oneLiner: "It moves the threshold.",
        bullets: ["Bias changes default output.", "It helps fit real data."],
        tryThis: "Say: bias shifts baseline.", visualMode: "sum_bias"
      }
    ],
    mid: [
      { title: "Backprop sends error backward", oneLiner: "Error flows back to weights.",
        bullets: ["Each layer gets a signal.", "Weights update from that."],
        tryThis: "Say: error back, update forward.", visualMode: "backprop_arrows"
      },
      { title: "Learning rate is step size", oneLiner: "Too big overshoots. Too small stalls.",
        bullets: ["Big steps can diverge.", "Small steps learn slowly."],
        tryThis: "Say: step size matters.", visualMode: "loss_meter"
      },
      { title: "Overfitting is memorizing noise", oneLiner: "It fails on new cases.",
        bullets: ["Looks good on train data.", "Breaks on test data."],
        tryThis: "Say: train ≠ real world.", visualMode: "generalize_explain"
      },
      { title: "Good data beats clever math", oneLiner: "Data quality sets the ceiling.",
        bullets: ["Label errors teach wrong patterns.", "Missing cases distort learning."],
        tryThis: "Ask: what’s missing?", visualMode: "inputs_nodes"
      }
    ],
    late: [
      { title: "Explain by strongest signals", oneLiner: "Which inputs pushed the guess?",
        bullets: ["Check big weights.", "Check high activations."],
        tryThis: "Explain the guess in 10 words.", visualMode: "generalize_explain"
      },
      { title: "Generalization is the real test", oneLiner: "Works on new data.",
        bullets: ["Hold out test cases.", "Avoid leaking answers in inputs."],
        tryThis: "Say: test is truth.", visualMode: "generalize_explain"
      }
    ]
  },

  ui: {
    appShellAriaLabel: "Neural net learning game container",
    gameCanvasAriaLabel: "Neural net game canvas",
    appTitle: "Neural Nets: Learn the Loop",
    appSubtitle: "Move with WASD. Shoot with Arrow Keys. Learn one concept per floor.",
    appFooterGoal: "Survive each timer and learn the loop.",
    appFooterRestart: "Restart run: R",
    overlayRestartButton: "Restart lesson",
    textModalTitle: "Lesson source text",
    textModalNote: "Edit the source text used in lesson cards.",
    textModalInputLabel: "Lesson source text",
    textModalSaveButton: "Save text",
    textModalSampleButton: "Use sample",
    textModalCloseButton: "Close",
    shareTextLabel: "Suggested post copy",
    shareDontAskText: "Don't ask again",
    shareModalNote: "You can re-enable in settings.",
    shareCardPreviewAlt: "Neural net run card preview",
    shareTitleFallback: "Share what you learned",
    shareOneLinerFallback: "Post your floor and the neural net loop.",
    shareCopyButton: "Copy text",
    shareLinkedInButton: "Open LinkedIn",
    shareDownloadButton: "Download card",
    shareCloseButton: "Not now",
    shareNativeButton: "Share...",
    shareDefaultFloorLabel: "Floor 1",
    shareFloorLabel: "Floor {floor} of {maxFloors}",
    shareStatusCopied: "Copied",
    shareStatusCopyFailed: "Copy failed. Select the text and copy manually.",
    shareStatusLinkedIn: "Paste the copied text, then Post.",
    shareStatusCardUnavailable: "Card unavailable right now.",
    shareStatusCardDownloaded: "Card downloaded.",
    shareFallbackLine1: "I reached Floor {floor} of {maxFloors} in Neural Nets: Learn the Loop.",
    shareFallbackLine2: "Loop: inputs → weights → neuron gates → output.",
    shareDisclosureLine: "AI-assisted; reviewed by humans; results vary.",
    shareRunBuildLine: "Run build: {upgrades}.",
    shareCardTitleFallback: "Neural Nets: Learn the Loop",
    shareCardRunBuildTitle: "Run build",
    shareCardNoUpgrades: "No upgrades stacked this run.",
    shareCardTryItLine: "Try it: {url}",
    teachCardTitlePrefix: "Neural-net concept",
    upgradePickTitle: "Pick one concept boost",
    upgradePickSubtitle: "Upgrades change play. Cards teach neural nets.",
    upgradeFloorLesson: "Floor {floor}: {lesson}",
    upgradePanelFooter: "1-3 pick • Enter confirm • Esc disabled",
    upgradePanelNoticeChooseOne: "Choose one to continue.",
    bombBriefingCta: "Press Enter to accept ({step}/{total})",
    bombBriefingAcceptedCta: "Accepted. Loading floor...",
    bombBriefingAcceptedHint: "Use Space in PLAYING to clear screen.",
    bombBriefingPendingHint: "Then press Space in PLAYING",
    bombBriefingLessonTag: "Floor {floor} power lesson",
    bombBriefingKeyLabel: "SPACE",
    bombBriefingUseWindow: "Use during PLAYING",
    bombBriefingActionLine: "Clears all enemies + enemy bullets",
    bombBriefingChargeChip: "SPACE #{index}",
    bombBriefingChargeCount: "{count} CHARGES",
    bombBriefingStepFallback: "Step {step}",
    bombBriefingStepLine: "Enter {step}: {label}",
    upgradeCardSelected: "SELECTED",
    upgradeCardTags: "Tags: {tags}",
    upgradeCardInstantEffect: "Instant effect (no stacks)",
    upgradeCardStacks: "Stacks: {stack} -> {nextStack}",
    titleStartFloorHint: "Start floor: {floor} • R: reset to Floor 1",
    worldMotifWord: "AI",
    hudHpLabel: "HP",
    hudShieldLabel: "Shield {count}",
    hudSurviveLabel: "Survive",
    hudBombLabel: "Space: {ability} {remaining}/{total}",
    hudFloorLabel: "Floor {floor} / {maxFloors}",
    hudBurstLabel: "Burst: {label}",
    hudBurstAllDirections: "All directions active",
    hudBurstNext: "Next {nextLabel} in {seconds}s",
    hudUpgradesTitle: "Upgrades",
    introSkipFooter: "Press Enter or Space to skip intro",
    floorTransitioningFooter: "Transitioning...",
    runSummaryRestartFooter: "Press R to restart",
    runSummaryFloorsCleared: "Floors cleared: {count}",
    runSummaryUpgradesTaken: "Upgrades taken: {count}",
    runSummaryWhatLearned: "What you learned",
    runSummaryRunBuild: "Run build",
    runSummaryThreatGlossary: "Threat glossary",
    runSummaryNoUpgrades: "No upgrades collected.",
    runSummaryMore: "+{count} more",
    runSummaryThreatGlossaryUnavailable: "Threat glossary unavailable.",
    rearHintDualTitle: "Dual burst unlocked",
    rearHintDualBody: "2s hold: shots fire forward and backward.",
    rearHintOmniTitle: "Omni burst unlocked",
    rearHintOmniBody: "10s hold: shots fire in all 4 directions.",
    lessonSlideContinue: "Enter or Space: continue",
    deathLessonContinue: "Enter or Space: continue",
    burstUnlockFloor: "Unlocks on Floor {floor}",
    burstOmniUnlockFloor: "Omni unlocks on Floor {floor}",
    floorClearTitle: "Floor cleared",
    floorClearSubtitle: "Inputs → weights → neurons → layers → guess.",
    victoryTitle: "You can explain a neural net now.",
    victorySubtitle: "You learned the loop and the reason.",
    gameOverTitle: "Run ended. Lesson stays.",
    gameOverSubtitle: "Die, learn, retry."
  },

  upgradeRename: {
    comfy_soles: { name: "Faster iteration", desc: "Move faster. Learn faster." },
    quick_trigger: { name: "Tighter feedback", desc: "Shoot sooner. Shorten loops." },
    wide_shots: { name: "Wider boundary", desc: "Bigger hit area." },
    fast_rounds: { name: "More steps", desc: "More shots each moment." },
    ghost_rounds: { name: "Skip connection", desc: "Shots pass through once." },
    heart_container: { name: "Error budget", desc: "More max health. Heal +1." },
    bubble_shield: { name: "Guardrail", desc: "Block one hit." },
    grace_frames: { name: "Stability window", desc: "More safe time after hit." },
    magnet_hands: { name: "Better sampling", desc: "Pull pickups from farther." },
    slowmo_aura: { name: "Less noise", desc: "Enemy bullets move slower." }
  },

  share: {
    title: "Share what you learned",
    oneLiner: "Post your floor and the neural net loop.",
    buildPost: {
      line1: "I reached Floor {floor} of {maxFloors} in Neural Nets: Learn the Loop.",
      line2: "Loop: inputs → weights → neuron gates → output.",
      line3: "Training: lower loss by nudging weights.",
      line4: "{url}"
    }
  }
};
