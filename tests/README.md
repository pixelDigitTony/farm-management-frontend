# Frontend verification

Use Node 24 and install dependencies with `npm ci`. Keep the backend checkout adjacent as `../farm-management-backend` for browser and Lighthouse tests. Docker must be running; the test server always starts a new MongoDB replica-set Testcontainer and uses console email.

| Command | Evidence |
| --- | --- |
| `npm run check` | Formatting, lint, application types |
| `npm run typecheck:tests` | Test and runner types |
| `npm test` | HTTP refresh races, session cache isolation, query invalidation, discount boundaries/countdowns and keyboard retry |
| `npm run test:coverage` | Source coverage, including uncovered modules |
| `npm run test:architecture` | Actual dependency discovery, cycles and cross-layer rules; an empty graph fails |
| `npm run test:e2e` | Production-build journeys in Chromium, Firefox, WebKit and Pixel emulation, plus axe checks |
| `npm run test:lighthouse` | Fresh isolated API and production preview, five runs per route in mobile and desktop profiles |
| `npm run test:bundle` | Unique initial route dependencies with byte counts, compression estimates and SHA-256 hashes |

Lighthouse targets are strict median scores of 100 in performance, accessibility, best practices and SEO. A nonzero exit means the target was not met, not necessarily a broken journey. Reports remain under `artifacts/lighthouse-mobile` and `artifacts/lighthouse-desktop`. Archive these directories before a subsequent run. Do not hide failing categories or lower targets to obtain a green run.

Measure the same fixture, build mode, browser, machine, network profile and cache policy before and after changes. Avoid concurrent load tests while collecting Lighthouse. Report ranges as well as medians; scores fluctuate. The current fixture has 24 catalog products without external media, so it does not establish media-heavy customer-page or production performance. Navigation Lighthouse does not prove real-user INP or authenticated workspace performance.

The manual `paired-quality.yml` workflow records both repository revisions. A private backend repository requires a read-only `CROSS_REPO_READ_TOKEN` secret with access to that repository. Prefer a backend commit SHA for reproducible comparisons. Workflow files have not been run remotely by this task.

Remaining coverage includes full checkout submission and owner workflows, authenticated Lighthouse journeys, visual snapshots, slow/offline recovery, realistic media, manual keyboard/screen-reader review, comprehensive contract tests and calibrated regression budgets. Page-level pagination, SSR, embed behavior, motion policy, private SEO exclusions and production telemetry still require product review before changes.
