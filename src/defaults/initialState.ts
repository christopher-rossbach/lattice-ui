/**
 * Bundled default state for first-time visitors.
 *
 * To update: click "Export as defaults" in the app, then paste
 * the clipboard content into initialState.json (same directory).
 *
 * Set any key to `null` to fall back to the app's built-in empty default.
 */

import type { LatticeStateShape } from '../model/lattice';
import data from './initialState.json';

export type DefaultSaves = Array<{ name: string; state: LatticeStateShape }>;

export type DefaultChecks = {
  checks: Array<{
    id: string;
    name: string;
    code: string;
    expanded: boolean;
  }>;
  autoRun: boolean;
  functions: Array<{
    id: string;
    name: string;
    code: string;
    expanded: boolean;
  }>;
  customCodes: string[];
};

export type BundledDefaults = {
  primaryGraph: LatticeStateShape | null;
  secondaryGraph: LatticeStateShape | null;
  savedLattices: DefaultSaves | null;
  checksAndHelpers: DefaultChecks | null;
};

const bundledDefaults = data as unknown as BundledDefaults;

export default bundledDefaults;
