import { describe, expect, it } from 'vitest';
import { computeWeightedAverageCost } from '../stock/quantity-stock.service';

describe('computeWeightedAverageCost', () => {
  it('computes classic WAC across two purchases', () => {
    const afterFirst = computeWeightedAverageCost({
      oldQty: 0,
      oldAverageCost: null,
      purchaseQty: 10,
      purchaseValue: 45_000,
    });
    expect(afterFirst).toBe(4500);

    const afterSecond = computeWeightedAverageCost({
      oldQty: 10,
      oldAverageCost: afterFirst,
      purchaseQty: 5,
      purchaseValue: 30_000,
    });
    // (10*4500 + 30000) / 15 = 75000/15 = 5000
    expect(afterSecond).toBe(5000);
  });

  it('includes mazduri in purchase value', () => {
    const avg = computeWeightedAverageCost({
      oldQty: 0,
      oldAverageCost: null,
      purchaseQty: 2,
      purchaseValue: 1000 + 50,
    });
    expect(avg).toBe(525);
  });
});
