# Perry Tax Pro Firebase rules

The application uses Firebase project `sygepec-v4`, with data isolated in the
`taxUsers`, `taxReturns`, `taxDocuments`, `taxNotes`, and
`taxAppointments` collections and under the Storage prefix
`tax/perry-tax-pro/`.

The two `.snippet` files must be merged into the active SYGEPEC Firestore and
Storage rules, compiled, reviewed, and deployed with **rules-only** Firebase
targets. Do not replace the active SYGEPEC rules with these snippets and do not
deploy Hosting from this repository.

A preparer account must first exist in Firebase Authentication. Its matching
`taxUsers/{uid}` document must be provisioned by an authorized administrator
with `tenantId: "perry-tax-pro"` and `role: "PREPARER"`. Public
registration always creates a `CLIENT` and cannot self-promote.
