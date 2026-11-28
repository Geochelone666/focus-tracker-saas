# F2-A03 verification receipt — deterministic Focus data integration

Run: [GitHub Actions #41759868458](https://github.com/Geochelone666/focus-tracker-saas/actions/runs/41759868458)
Code head tested: `d186569a0099a5af0b8f76b8698df0af41f05d44`.
Synthetic-only regression, no production accounts, Supabase writes or AI APIs.

## Actual verification

- `ci`: Lint PASS, TypeScript Typecheck PASS, Vitest **42 files / 516 tests PASS**, production build PASS.
- `mobile`: TypeScript/dependency checks and export PASS.
- `e2e`: read run's final status separately; existing fixture-backed Next/Foc​us workflow
  does **not** exercise a live Smart Calendar confirm/undo REST API, because none is
  implemented in this algorithm PR.
- QA oracle: unmodified PR #72 `qa/scheduler-acceptance.ts` receives actual F2-A02
  engine output through `qa-bridge.ts`; synthetic 100/500/1000 fixtures returned
  `oracleIssues=0`. Engine's independent hard-constraint audit also returned 0.
- Backend sample: `docs/fixtures/smart-calendar-v01-sample.json` expected three
  exact UTC placements; `focus-adapter.test.ts` executes real `previewSmartCalendar`
  on this snapshot and compares actual returned positions, with exact microsecond
  task revisions.

## Scale benchmark (same CI run)

Platform: GitHub Actions Linux, Node **v22.23.4**. Five measured runs per size
after warm-up, 14 days, 12h/day availability, one fixed 1h event per day,
mixed priority, duration, deadlines and deferral counts. Full input/measurement
procedure: `lib/smart-scheduler/scale-benchmark.test.ts`.

| Input tasks | p50 ms | p95 ms | Heap after p50 MB | RSS after p50 MB | Optimized coverage | Baseline coverage | Optimized moves / baseline moves after extra event | Hard violations / QA issues |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 6.13 | 7.42 | 12.74 | 74.82 | 100/100 | 100/100 | 1 / 82 | 0 / 0 |
| 500 | 18.34 | 33.63 | 17.73 | 83.57 | 175/500 | 175/500 | 1 / 175 | 0 / 0 |
| 1000 | 30.48 | 32.42 | 16.81 | 86.43 | 173/1000 | 175/1000 | 1 / 173 | 0 / 0 |

**Interpretation:** large inputs exceed available capacity; lower coverage is
not necessarily a runtime defect. At 1000 tasks optimized coverage **loses two
tasks** relative to simple priority-first baseline; no claim that scoring
improves feasible coverage. Incremental preservation strongly reduces movement
in this specific accepted-plan perturbation; accepted plan is synthetic.

Memory represents **sampled process-wide heapUsed and RSS after invocations**,
not isolated algorithm allocations or true high-watermark/peak memory.
The median sampled heap delta was +1.33MB, -0.53MB and -1.47MB respectively;
negative values reflect garbage collection and MUST NOT be interpreted as
negative algorithm memory use. With only five trials, sample p95 is the largest
observed timing and is not a statistically stable production p95.

## Leakage-free estimation holdout

From `lib/smart-scheduler/estimate-evaluation.test.ts`: 30 chronological
synthetic completed tasks; 3 cold-start predictions, 27 history-supported,
0 filtered in this particular fixture. Mean absolute error **15.87 minutes**,
prior-only baseline MAE **30.00 minutes**, median absolute error 17 minutes,
mean signed error -15.87 minutes. Same-timestamp observations are held out
together and future observations never enter earlier predictions.
This does **not** establish real-world predictive improvement or causal
effectiveness; real-user evaluation is unrun.

## Security and release caveats

- The canonical snapshot must be read by an authenticated, user-scoped
  backend. The adapter rejects mixed-owner rows, but it cannot prove
  upstream RLS or snapshot completeness.
- Existing Backend PR #69 batch RPC lacks persistent version/undo receipts,
  and protects neither unselected concurrent writers nor all working/locked
  windows. Current algorithm output is **preview only**, NOT a safe confirm.
- Max 50 changed tasks and DST earlier-fold UTC starts cannot be silently
  encoded by the existing local-time batch RPC: `backend-wire.ts` fails closed.
- The independent QA adapter verifies real core outputs in CI, not a real
  hosted PostgreSQL two-connection race, native device or production app.
- CI green is not release acceptance. Keep the PR Draft until backend/QA
  reviews, hosted staging concurrency and UX integration are complete.

Related: [PR #73](https://github.com/Geochelone666/focus-tracker-saas/pull/73)
(algorithm base), [PR #72](https://github.com/Geochelone666/focus-tracker-saas/pull/72)
(independent oracle), [Issue #74](https://github.com/Geochelone666/focus-tracker-saas/issues/74)
(backend decision record).
