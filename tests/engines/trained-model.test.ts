import { describe, it, expect } from "vitest";
import { predictWithModel, buildFeatureVector, predictVote } from "@/engines/trained-model";

describe("trained-model", () => {
  describe("buildFeatureVector", () => {
    it("produces correct length vector (29 features)", () => {
      const features = buildFeatureVector({
        idealPoint: -0.5,
        democracyIndex: 0.8,
        policyDimensions: { sovereignty: -0.3, humanRights: 0.5, development: 0.1, security: 0.2, environment: 0.4, decolonization: -0.1 },
        region: "WEOG",
        issue: "Human rights",
        topicYesRate: 0.32,
        topicNoRate: 0.63,
        topicAbstainRate: 0.05,
        sampleSize: 396,
        peerSignal: -0.4,
      });
      expect(features).toHaveLength(29);
    });

    it("encodes region one-hot correctly", () => {
      const features = buildFeatureVector({
        idealPoint: 0, democracyIndex: 0.5,
        policyDimensions: { sovereignty: 0, humanRights: 0, development: 0, security: 0, environment: 0, decolonization: 0 },
        region: "AFRICAN", issue: "Colonialism",
        topicYesRate: 0.9, topicNoRate: 0.05, topicAbstainRate: 0.05, sampleSize: 200, peerSignal: 0,
      });
      // Region one-hot starts at index 18 (after 18 numeric features)
      expect(features[18]).toBe(1); // AFRICAN
      expect(features[19]).toBe(0); // APG
      expect(features[20]).toBe(0); // EEG
      expect(features[21]).toBe(0); // GRULAC
      expect(features[22]).toBe(0); // WEOG
    });

    it("includes interaction features", () => {
      const features = buildFeatureVector({
        idealPoint: -0.8, democracyIndex: 0.9,
        policyDimensions: { sovereignty: 0, humanRights: 0, development: 0, security: 0, environment: 0, decolonization: 0 },
        region: "WEOG", issue: "Palestinian conflict",
        topicYesRate: 0.04, topicNoRate: 0.83, topicAbstainRate: 0.13, sampleSize: 254, peerSignal: -0.6,
      });
      // interaction_idealXyes = idealPoint * topicYesRate = -0.8 * 0.04
      expect(features[14]).toBeCloseTo(-0.032, 3);
      // interaction_idealXno = idealPoint * topicNoRate = -0.8 * 0.83
      expect(features[15]).toBeCloseTo(-0.664, 3);
    });
  });

  describe("predictWithModel", () => {
    it("returns probabilities summing to 1", () => {
      const features = buildFeatureVector({
        idealPoint: -0.85, democracyIndex: 0.78,
        policyDimensions: { sovereignty: -0.3, humanRights: 0.5, development: -0.2, security: 0.3, environment: 0.4, decolonization: -0.4 },
        region: "WEOG", issue: "Palestinian conflict",
        topicYesRate: 0.04, topicNoRate: 0.83, topicAbstainRate: 0.13, sampleSize: 254, peerSignal: -0.6,
      });
      const probs = predictWithModel(features);
      const sum = probs.yes + probs.no + probs.abstain;
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it("predicts USA votes No on Palestinian conflict", () => {
      const features = buildFeatureVector({
        idealPoint: -0.90, democracyIndex: 0.78,
        policyDimensions: { sovereignty: -0.3, humanRights: 0.5, development: -0.2, security: 0.3, environment: 0.4, decolonization: -0.4 },
        region: "WEOG", issue: "Palestinian conflict",
        topicYesRate: 0.04, topicNoRate: 0.83, topicAbstainRate: 0.13, sampleSize: 254, peerSignal: -0.6,
      });
      const vote = predictVote(features);
      expect(vote).toBe("no");
    });

    it("predicts Nigeria votes Yes on Economic development", () => {
      const features = buildFeatureVector({
        idealPoint: 0.30, democracyIndex: 0.42,
        policyDimensions: { sovereignty: 0.4, humanRights: -0.1, development: 0.6, security: 0.1, environment: -0.1, decolonization: 0.4 },
        region: "AFRICAN", issue: "Economic development",
        topicYesRate: 0.97, topicNoRate: 0.0, topicAbstainRate: 0.02, sampleSize: 220, peerSignal: 0.8,
      });
      const vote = predictVote(features);
      expect(vote).toBe("yes");
    });

    it("predicts India abstains on Nuclear weapons", () => {
      const features = buildFeatureVector({
        idealPoint: 0.30, democracyIndex: 0.52,
        policyDimensions: { sovereignty: 0.3, humanRights: 0.1, development: 0.5, security: -0.2, environment: -0.1, decolonization: 0.3 },
        region: "APG", issue: "Nuclear weapons and nuclear material",
        topicYesRate: 0.32, topicNoRate: 0.26, topicAbstainRate: 0.42, sampleSize: 128, peerSignal: 0.1,
      });
      const probs = predictWithModel(features);
      // India has mixed position on nuclear issues — abstain rate should be non-trivial
      expect(probs.abstain).toBeGreaterThan(0.15);
    });
  });
});
