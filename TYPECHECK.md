# Typechecking this project

Run `npm run typecheck`.

**Not `npx tsc --noEmit`.** The root `tsconfig.json` is a solution file: it carries
`"files": []` and defers to project references, so a bare `tsc --noEmit` resolves to
**zero files** and exits 0 no matter what is broken. It reported nothing while
`src/pages/Expenses.tsx` referenced an undeclared `isoDate` and
`src/components/pharma/PharmaDetailSheet.tsx` passed a prop that did not exist.

`npm run typecheck` checks the app and the node config explicitly, which is what
`npm run build` compiles.
