/**
 * Registers `@testing-library/jest-dom`'s matchers with TypeScript.
 *
 * The matchers are added at runtime by `vitest.setup.ts`, but `tsc` has no way
 * to know that, so `toHaveAttribute` and friends would be type errors in every
 * jsdom suite without this reference.
 */
/// <reference types="@testing-library/jest-dom/vitest" />

export {};
