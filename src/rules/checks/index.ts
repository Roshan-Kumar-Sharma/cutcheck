import type { RuleCheck } from '../../types.js';
import { check as CB_AUD_001 } from './CB-AUD-001.js';
import { check as CB_AUD_002 } from './CB-AUD-002.js';
import { check as CB_VID_001 } from './CB-VID-001.js';

/**
 * Rule id → check function. YAML holds the thresholds and citations (a domain expert edits those);
 * this map holds the logic (an engineer edits this). A rule in YAML with no entry here is a load-time error.
 */
export const CHECKS: Readonly<Record<string, RuleCheck>> = {
  'CB-AUD-001': CB_AUD_001,
  'CB-AUD-002': CB_AUD_002,
  'CB-VID-001': CB_VID_001,
};
