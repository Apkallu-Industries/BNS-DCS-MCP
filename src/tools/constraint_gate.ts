import type { MizSession } from '../miz/MizSession.js';
import { EraAssetValidator } from './era_validator.js';

type AssetCategory = 'aircraft' | 'helicopter' | 'vehicle' | 'ship' | 'static';

export function enforceHistoricalConstraint(
  session: MizSession,
  dcsType: string,
  category: AssetCategory
): void {
  const constraints = session.historicalConstraints;
  if (!constraints || !constraints.enabled) return;

  const result = EraAssetValidator.validate(dcsType, constraints.year, category);
  if (!result.allowed) {
    const sugLine = result.suggestions?.length
      ? ` Era-appropriate alternatives: ${result.suggestions.join(', ')}.`
      : '';
    throw new Error(result.reason + sugLine);
  }
}
