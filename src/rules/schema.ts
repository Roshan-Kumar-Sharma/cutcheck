import { z } from 'zod';
import { MEASURE_KEYS, TARGETS, type RuleDef } from '../types.js';

/** Validates the YAML rule shape at load time so a domain expert's typo is a clear error, not a silent skip. */
export const RuleSourceSchema = z.object({
  citation: z.string().min(1),
  url: z.string().url().optional(),
  measured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'measured_on must be an ISO date (YYYY-MM-DD)'),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const RuleDefSchema = z.object({
  id: z.string().regex(/^CB-[A-Z]{2,5}-\d{3}$/, 'id must look like CB-AUD-001'),
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'name must be snake_case'),
  severity: z.enum(['S1', 'S2']),
  applies_to: z.array(z.enum(TARGETS)).min(1),
  requires: z.array(z.enum(MEASURE_KEYS)).default([]),
  threshold: z.record(z.string(), z.unknown()),
  source: RuleSourceSchema,
  rationale: z.string().min(1),
});

export const RulePackSchema = z.object({
  pack: z.string().min(1),
  version: z.number().int().positive(),
  rules: z.array(RuleDefSchema).min(1),
});

export type RulePack = { pack: string; version: number; rules: RuleDef[] };
