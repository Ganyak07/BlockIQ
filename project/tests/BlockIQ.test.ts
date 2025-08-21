import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("BlockIQ Prediction Market Tests", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.setEpoch("3.0");
  });

  describe("Market Creation", () => {
    it("should create a new market successfully", () => {
      const title = "Will Bitcoin reach $100k by end of 2024?";
      const description = "This market resolves to YES if Bitcoin (BTC) reaches or exceeds $100,000 USD by December 31, 2024.";
      const resolutionTime = 1735689600; // Future timestamp

      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8(title),
          Cl.stringUtf8(description),
          Cl.uint(resolutionTime)
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(1)); // First market should have ID 1
    });

    it("should increment market counter with each new market", () => {
      const title1 = "Market 1";
      const title2 = "Market 2";
      const description = "Test description";
      const resolutionTime = 1735689600;

      // Create first market
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [Cl.stringUtf8(title1), Cl.stringUtf8(description), Cl.uint(resolutionTime)],
        wallet1
      );

      // Create second market
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [Cl.stringUtf8(title2), Cl.stringUtf8(description), Cl.uint(resolutionTime)],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(2)); // Second market should have ID 2
    });

    it("should fail to create market with resolution time in past", () => {
      const title = "Past Market";
      const description = "This should fail";
      const pastTime = 1000000000; // Very old timestamp

      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8(title),
          Cl.stringUtf8(description),
          Cl.uint(pastTime)
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(105)); // ERR-INVALID-OUTCOME
    });
  });

  describe("Market Information Retrieval", () => {
    beforeEach(() => {
      // Create a test market
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Test Market"),
          Cl.stringUtf8("Test Description"),
          Cl.uint(1735689600)
        ],
        wallet1
      );
    });

    it("should retrieve market information correctly", () => {
      const { result } = simnet.callReadOnlyFn(
        "blockiq-core",
        "get-market",
        [Cl.uint(1)],
        wallet1
      );

      expect(result).toBeSome();
      const marketData = result.value.data;
      expect(marketData.id).toBeUint(1);
      expect(marketData.title).toBeStringUtf8("Test Market");
      expect(marketData.description).toBeStringUtf8("Test Description");
      expect(marketData.creator).toBePrincipal(wallet1);
      expect(marketData["total-stake-yes"]).toBeUint(0);
      expect(marketData["total-stake-no"]).toBeUint(0);
      expect(marketData.resolved).toBeBool(false);
    });

    it("should return none for non-existent market", () => {
      const { result } = simnet.callReadOnlyFn(
        "blockiq-core",
        "get-market",
        [Cl.uint(999)],
        wallet1
      );

      expect(result).toBeNone();
    });

    it("should check if market is active", () => {
      const { result } = simnet.callReadOnlyFn(
        "blockiq-core",
        "is-market-active",
        [Cl.uint(1)],
        wallet1
      );

      expect(result).toBeBool(true);
    });
  });

  describe("Staking on Markets", () => {
    beforeEach(() => {
      // Create a test market
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Stake Test Market"),
          Cl.stringUtf8("Testing stakes"),
          Cl.uint(1735689600)
        ],
        wallet1
      );
    });

    it("should allow staking YES on a market", () => {
      const stakeAmount = 1000000; // 1 STX in microstacks

      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(stakeAmount)],
        wallet2
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify market totals updated
      const marketInfo = simnet.callReadOnlyFn(
        "blockiq-core",
        "get-market",
        [Cl.uint(1)],
        wallet1
      );
      const marketData = marketInfo.result.value.data;
      expect(marketData["total-stake-yes"]).toBeUint(stakeAmount);
      expect(marketData["total-stake-no"]).toBeUint(0);
    });

    it("should allow staking NO on a market", () => {
      const stakeAmount = 500000; // 0.5 STX in microstacks

      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(false), Cl.uint(stakeAmount)],
        wallet3
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify market totals updated
      const marketInfo = simnet.callReadOnlyFn(
        "blockiq-core",
        "get-market",
        [Cl.uint(1)],
        wallet1
      );
      const marketData = marketInfo.result.value.data;
      expect(marketData["total-stake-yes"]).toBeUint(0);
      expect(marketData["total-stake-no"]).toBeUint(stakeAmount);
    });

    it("should track user stakes correctly", () => {
      const stakeAmount = 750000;

      // User stakes YES
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(stakeAmount)],
        wallet2
      );

      // Check user stake
      const { result } = simnet.callReadOnlyFn(
        "blockiq-core",
        "get-user-stake",
        [Cl.uint(1), Cl.principal(wallet2)],
        wallet1
      );

      expect(result).toBeSome();
      const stakeData = result.value.data;
      expect(stakeData["stake-yes"]).toBeUint(stakeAmount);
      expect(stakeData["stake-no"]).toBeUint(0);
      expect(stakeData.claimed).toBeBool(false);
    });

    it("should allow multiple stakes from same user", () => {
      const firstStake = 300000;
      const secondStake = 200000;

      // First stake
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(firstStake)],
        wallet2
      );

      // Second stake
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(secondStake)],
        wallet2
      );

      // Check total stake
      const { result } = simnet.callReadOnlyFn(
        "blockiq-core",
        "get-user-stake",
        [Cl.uint(1), Cl.principal(wallet2)],
        wallet1
      );

      const stakeData = result.value.data;
      expect(stakeData["stake-yes"]).toBeUint(firstStake + secondStake);
    });

    it("should fail to stake zero amount", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(0)],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(103)); // ERR-INSUFFICIENT-FUNDS
    });

    it("should fail to stake on non-existent market", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(999), Cl.bool(true), Cl.uint(1000000)],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR-MARKET-NOT-FOUND
    });
  });

  describe("Market Resolution", () => {
    beforeEach(() => {
      // Create and set up market for resolution tests
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Resolution Test"),
          Cl.stringUtf8("Testing resolution"),
          Cl.uint(1735689600)
        ],
        wallet1
      );

      // Add some stakes
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(600000)],
        wallet2
      );
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(false), Cl.uint(400000)],
        wallet3
      );

      // Fast forward time past resolution
      simnet.mineEmptyBlocks(1000);
    });

    it("should allow oracle to resolve market", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "resolve-market",
        [Cl.uint(1), Cl.bool(true)],
        deployer // Oracle is initially the deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Check market is resolved
      const marketInfo = simnet.callReadOnlyFn(
        "blockiq-core",
        "get-market",
        [Cl.uint(1)],
        wallet1
      );
      const marketData = marketInfo.result.value.data;
      expect(marketData.resolved).toBeBool(true);
      expect(marketData.outcome).toBeSome(Cl.bool(true));
    });

    it("should prevent non-oracle from resolving market", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "resolve-market",
        [Cl.uint(1), Cl.bool(true)],
        wallet1 // Not the oracle
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should prevent resolving already resolved market", () => {
      // First resolution
      simnet.callPublicFn(
        "blockiq-core",
        "resolve-market",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      // Attempt second resolution
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "resolve-market",
        [Cl.uint(1), Cl.bool(false)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(104)); // ERR-MARKET-RESOLVED
    });
  });

  describe("Claiming Winnings", () => {
    beforeEach(() => {
      // Create market
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Winnings Test"),
          Cl.stringUtf8("Testing winnings"),
          Cl.uint(1735689600)
        ],
        wallet1
      );

      // Add stakes: 600k YES, 400k NO (total 1M)
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(600000)],
        wallet2
      );
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(false), Cl.uint(400000)],
        wallet3
      );

      // Fast forward and resolve market as YES
      simnet.mineEmptyBlocks(1000);
      simnet.callPublicFn(
        "blockiq-core",
        "resolve-market",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );
    });

    it("should allow winner to claim winnings", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "claim-winnings",
        [Cl.uint(1)],
        wallet2 // Winner (staked YES)
      );

      // Winner should get the full pool since they were the only YES staker
      expect(result).toBeOk(Cl.uint(1000000)); // Total pool of 1M STX
    });

    it("should prevent loser from claiming winnings", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "claim-winnings",
        [Cl.uint(1)],
        wallet3 // Loser (staked NO, but market resolved YES)
      );

      expect(result).toBeErr(Cl.uint(103)); // ERR-INSUFFICIENT-FUNDS (no winning stake)
    });

    it("should prevent claiming from unresolved market", () => {
      // Create new unresolved market
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Unresolved"),
          Cl.stringUtf8("Not resolved"),
          Cl.uint(1735689600)
        ],
        wallet1
      );

      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(2), Cl.bool(true), Cl.uint(100000)],
        wallet2
      );

      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "claim-winnings",
        [Cl.uint(2)],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(106)); // ERR-MARKET-NOT-RESOLVED
    });

    it("should prevent double claiming", () => {
      // First claim
      simnet.callPublicFn(
        "blockiq-core",
        "claim-winnings",
        [Cl.uint(1)],
        wallet2
      );

      // Second claim attempt
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "claim-winnings",
        [Cl.uint(1)],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED (already claimed)
    });
  });

  describe("Payout Calculations", () => {
    beforeEach(() => {
      // Create market with multiple participants
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Payout Test"),
          Cl.stringUtf8("Testing payout calculations"),
          Cl.uint(1735689600)
        ],
        wallet1
      );
    });

    it("should calculate payout correctly for YES outcome", () => {
      // 300k YES, 700k NO (total 1M)
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(true), Cl.uint(300000)],
        wallet2
      );
      simnet.callPublicFn(
        "blockiq-core",
        "stake-on-outcome",
        [Cl.uint(1), Cl.bool(false), Cl.uint(700000)],
        wallet3
      );

      const { result } = simnet.callReadOnlyFn(
        "blockiq-core",
        "calculate-payout",
        [Cl.uint(1), Cl.bool(true), Cl.uint(300000)],
        wallet1
      );

      // Payout = (stake * total-pool) / total-yes-stakes
      // = (300k * 1M) / 300k = 1M (gets the entire pool)
      expect(result).toBeSome(Cl.uint(1000000));
    });

    it("should return none for zero total stakes", () => {
      const { result } = simnet.callReadOnlyFn(
        "blockiq-core",
        "calculate-payout",
        [Cl.uint(1), Cl.bool(true), Cl.uint(100000)],
        wallet1
      );

      expect(result).toBeNone(); // No stakes yet, so no payout calculation possible
    });
  });

  describe("Admin Functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Admin Test"),
          Cl.stringUtf8("Testing admin functions"),
          Cl.uint(1735689600)
        ],
        wallet1
      );
    });

    it("should allow owner to set new oracle", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "set-oracle",
        [Cl.principal(wallet1)],
        deployer // Contract owner
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should prevent non-owner from setting oracle", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "set-oracle",
        [Cl.principal(wallet1)],
        wallet2 // Not the owner
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });

    it("should allow owner to emergency close market", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "emergency-close-market",
        [Cl.uint(1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify market is no longer active
      const isActive = simnet.callReadOnlyFn(
        "blockiq-core",
        "is-market-active",
        [Cl.uint(1)],
        wallet1
      );
      expect(isActive.result).toBeBool(false);
    });

    it("should prevent non-owner from emergency closing market", () => {
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "emergency-close-market",
        [Cl.uint(1)],
        wallet1 // Not the owner
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
    });
  });

  describe("Edge Cases and Integration", () => {
    it("should handle market with no stakes during resolution", () => {
      // Create market with no stakes
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Empty Market"),
          Cl.stringUtf8("No stakes"),
          Cl.uint(1735689600)
        ],
        wallet1
      );

      // Fast forward and resolve
      simnet.mineEmptyBlocks(1000);
      const { result } = simnet.callPublicFn(
        "blockiq-core",
        "resolve-market",
        [Cl.uint(1), Cl.bool(true)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should handle complex multi-user scenario", () => {
      // Create market
      simnet.callPublicFn(
        "blockiq-core",
        "create-market",
        [
          Cl.stringUtf8("Complex Market"),
          Cl.stringUtf8("Multiple users"),
          Cl.uint(1735689600)
        ],
        wallet1
      );

      // Multiple users stake different amounts
      simnet.callPublicFn("blockiq-core", "stake-on-outcome", [Cl.uint(1), Cl.bool(true), Cl.uint(200000)], wallet1);
      simnet.callPublicFn("blockiq-core", "stake-on-outcome", [Cl.uint(1), Cl.bool(true), Cl.uint(300000)], wallet2);
      simnet.callPublicFn("blockiq-core", "stake-on-outcome", [Cl.uint(1), Cl.bool(false), Cl.uint(500000)], wallet3);

      // Resolve as YES
      simnet.mineEmptyBlocks(1000);
      simnet.callPublicFn("blockiq-core", "resolve-market", [Cl.uint(1), Cl.bool(true)], deployer);

      // Both YES stakers should be able to claim proportional winnings
      const claim1 = simnet.callPublicFn("blockiq-core", "claim-winnings", [Cl.uint(1)], wallet1);
      const claim2 = simnet.callPublicFn("blockiq-core", "claim-winnings", [Cl.uint(1)], wallet2);

      expect(claim1.result).toBeOk();
      expect(claim2.result).toBeOk();

      // NO staker should not be able to claim
      const claim3 = simnet.callPublicFn("blockiq-core", "claim-winnings", [Cl.uint(1)], wallet3);
      expect(claim3.result).toBeErr(Cl.uint(103));
    });
  });
});