# Matsuri Hit / PT experiment backup

Snapshot date: 2026-11-20 (Asia/Shanghai).

This backup contains the independent Node.js experiment, not an integrated
Rust change, an authenticated GitHub repository, or a game save. No account
credentials, raw game packets, trained weights, or real calibration data are
included. GitHub authentication is only for writing to a remote repository;
the experiment is runnable offline.

## Run

Extract both files into one directory and run these commands with Node.js:

```sh
node matsuri-hint-pt-experiment.cjs --test
node matsuri-hint-pt-experiment.cjs --synthetic
node matsuri-hint-pt-experiment.cjs --help
```

The test checks 100 randomized small problems against exhaustive enumeration
plus fixed regressions. The seeded synthetic benchmark uses 540 snapshots from
6 generated decks, with 31-60 skill groups per snapshot. Each test fold holds
out one whole deck. With the included script, score MAE / hit-delta MAE are:

| Model | Score MAE | Hit-delta MAE |
| --- | ---: | ---: |
| Legacy PT conversion | 1081.09 | 17.70 |
| Fixed rate plus fitted H adjustment | 703.15 | 20.55 |
| PT-only curve | 727.73 | 14.49 |
| H/PT curve | 659.34 | 19.52 |

These are synthetic checks, not game calibration or an AI policy comparison.
The H/PT curve improved total-score fits but did not improve hit-delta MAE.

## Input and next experiment

Run `node matsuri-hint-pt-experiment.cjs snapshots.json` with a JSON array, one
terminal pre-purchase snapshot per unique `run`, at least two distinct `deck`
labels. Each row has `run`, `deck`, `H` (simulator `total_hints`), `P` (unspent
`skill_pt`), `cut` (`none`, `small`, or `full`), and `groups` (each group lists
mutually exclusive legal `[discounted_cost, incremental_score]` options; skip
is implicit). Optional `after: {H, P, groups}` is the paired result of a single
outcome from the same starting snapshot. The input does not support a cut-state
change between the two outcomes. Keep aggregate simulated H separate from the
per-skill hints used for computing true costs.

The current script solves independent groups. It cannot directly express a
shared evolution quota or conditions spanning groups. For a real calibration,
use a matching URA Host and SkillTipsResponseAnalyzer to replay full pre-buy
states and solve both sides of each pair with those constraints. Check the
scoring and costs against actual purchases and post-buy scores. The plugin's
existing result output is not a drop-in input for this script. Prefer a
separate, de-identified solver-label export and keep private replay data and
its manifest backed up off-device. Refit using held-out decks; evaluate hit
margins and action choices separately from total-score error.

## Source revisions

- `umaai-project/umaai-matsuri` at `a639a3c6f64e35e1dbdea490380c4a92839f755b`.
- `umaai-project/umaai-next` at `ae3cab19bd6b8f2cbf9f9a3a4c49ced7bea6be94`.
- `URA-Plugins/SkillTipsResponseAnalyzer` at `1012961f85fc98f0dcd96b2881d055b8b08c4571`.

## SHA-256

| File | SHA-256 |
| --- | --- |
| Original ZIP's `matsuri-hint-pt-experiment.cjs` | `e41abfee3a23391d020c9090a879f824d52f441aa2bb6e9c75d1a47e37aec1c8` |
| Published `matsuri-hint-pt-experiment.cjs` | `140f130e2754a1a4baba808833b2d917111d7a213fbc4b014962ee8ee80af81b` |
| Published `compare.cjs` | `27a6330e79fed669eb5ada0d14e8241d8bbce452f17621077eb8a180cc402b0c` |

The published original script differs from the ZIP only by the final line feed; its code and behavior are unchanged.