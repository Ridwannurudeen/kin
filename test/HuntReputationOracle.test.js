import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import solc from 'solc';

const MOCK_HUNT_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockHunt {
    struct ClassRep {
        uint32 wins;
        uint32 submissions;
        uint256 totalEarnedWei;
        uint64 sumSeverityCalibration;
        uint64 sumPrecision;
        uint64 sumCoverage;
        uint64 sumExploitability;
    }

    uint256 public totalHunters;
    mapping(uint256 => mapping(bytes32 => ClassRep)) internal reps;

    function setTotalHunters(uint256 n) external {
        totalHunters = n;
    }

    function setClassRep(
        uint256 hunterId,
        bytes32 classBytes32,
        uint32 wins,
        uint32 submissions,
        uint256 totalEarnedWei,
        uint64 sumSeverityCalibration,
        uint64 sumPrecision,
        uint64 sumCoverage,
        uint64 sumExploitability
    ) external {
        reps[hunterId][classBytes32] = ClassRep({
            wins: wins,
            submissions: submissions,
            totalEarnedWei: totalEarnedWei,
            sumSeverityCalibration: sumSeverityCalibration,
            sumPrecision: sumPrecision,
            sumCoverage: sumCoverage,
            sumExploitability: sumExploitability
        });
    }

    function getClassRep(uint256 hunterId, bytes32 classBytes32) external view returns (ClassRep memory) {
        return reps[hunterId][classBytes32];
    }
}
`;

function id(ethers, name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}

function findEvent(contract, receipt, eventName) {
  const log = receipt.logs.find((entry) => {
    try {
      return contract.interface.parseLog(entry).name === eventName;
    } catch {
      return false;
    }
  });
  assert.ok(log, `${eventName} not emitted`);
  return contract.interface.parseLog(log);
}

async function deployMockHunt(ethers, signer) {
  const input = {
    language: 'Solidity',
    sources: { 'MockHunt.sol': { content: MOCK_HUNT_SOURCE } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors?.filter((e) => e.severity === 'error') ?? [];
  assert.deepEqual(errors, []);

  const { abi, evm } = output.contracts['MockHunt.sol'].MockHunt;
  const factory = new ethers.ContractFactory(
    abi,
    '0x' + evm.bytecode.object,
    signer,
  );
  const hunt = await factory.deploy();
  await hunt.waitForDeployment();
  return hunt;
}

async function fixture() {
  const { ethers } = await network.getOrCreate();
  const [admin, other, nextAdmin] = await ethers.getSigners();
  const hunt = await deployMockHunt(ethers, admin);
  const oracle = await ethers.deployContract('HuntReputationOracle', [
    await hunt.getAddress(),
  ]);
  await oracle.waitForDeployment();
  return { ethers, admin, other, nextAdmin, hunt, oracle };
}

describe('HuntReputationOracle', () => {
  it('registerDomain only callable by admin and emits event', async () => {
    const { ethers, other, oracle } = await fixture();
    const smartContracts = id(ethers, 'smart-contract-audit');

    await assert.rejects(
      oracle
        .connect(other)
        .registerDomain('smart-contract-audit'),
      /not admin/,
    );

    const tx = await oracle.registerDomain('smart-contract-audit');
    const event = findEvent(oracle, await tx.wait(), 'DomainRegistered');
    assert.equal(event.args.domain, smartContracts);
    assert.equal(event.args.name, 'smart-contract-audit');
    assert.equal(
      await oracle.domainName(smartContracts),
      'smart-contract-audit',
    );

    await oracle.registerDomain('smart-contract-audit');
    assert.deepEqual(Array.from(await oracle.getDomains()), [smartContracts]);
  });

  it('registerClass only callable on registered domain and deduplicates', async () => {
    const { ethers, other, oracle } = await fixture();
    const smartContracts = id(ethers, 'smart-contract-audit');
    const reentrancy = id(ethers, 'swc-107-reentrancy');

    await assert.rejects(
      oracle.registerClass('smart-contract-audit', 'swc-107-reentrancy'),
      /domain not registered/,
    );

    await oracle.registerDomain('smart-contract-audit');
    await assert.rejects(
      oracle
        .connect(other)
        .registerClass('smart-contract-audit', 'swc-107-reentrancy'),
      /not admin/,
    );

    await oracle.registerClass('smart-contract-audit', 'swc-107-reentrancy');
    await oracle.registerClass('smart-contract-audit', 'swc-107-reentrancy');

    const classes = Array.from(await oracle.getClasses(smartContracts));
    assert.deepEqual(classes, [reentrancy]);
    assert.equal(await oracle.className(reentrancy), 'swc-107-reentrancy');
  });

  it('getDomains and getClasses return registered values', async () => {
    const { ethers, oracle } = await fixture();
    const smartContracts = id(ethers, 'smart-contract-audit');
    const insurance = id(ethers, 'insurance-claim-denial-defense');
    const reentrancy = id(ethers, 'swc-107-reentrancy');
    const oracleManipulation = id(ethers, 'oracle-manipulation');

    await oracle.registerDomain('smart-contract-audit');
    await oracle.registerDomain('insurance-claim-denial-defense');
    await oracle.registerClass('smart-contract-audit', 'swc-107-reentrancy');
    await oracle.registerClass('smart-contract-audit', 'oracle-manipulation');

    assert.deepEqual(Array.from(await oracle.getDomains()), [
      smartContracts,
      insurance,
    ]);
    assert.deepEqual(Array.from(await oracle.getClasses(smartContracts)), [
      reentrancy,
      oracleManipulation,
    ]);
    assert.deepEqual(Array.from(await oracle.getClasses(insurance)), []);
  });

  it('getReputationByClass matches Hunt.getClassRep byte-for-byte', async () => {
    const { ethers, hunt, oracle } = await fixture();
    const reentrancy = id(ethers, 'swc-107-reentrancy');
    const earned = ethers.parseEther('0.25');

    await hunt.setClassRep(1, reentrancy, 2, 3, earned, 9, 8, 7, 6);

    const direct = await hunt.getClassRep(1, reentrancy);
    const throughOracle = await oracle.getReputationByClass(1, reentrancy);
    assert.deepEqual(throughOracle.toArray(), direct.toArray());
  });

  it('aggregateDomain correctly sums across hunters x classes', async () => {
    const { ethers, hunt, oracle } = await fixture();
    const smartContracts = id(ethers, 'smart-contract-audit');
    const reentrancy = id(ethers, 'swc-107-reentrancy');
    const oracleManipulation = id(ethers, 'oracle-manipulation');
    const ignored = id(ethers, 'access-control');

    await oracle.registerDomain('smart-contract-audit');
    await oracle.registerClass('smart-contract-audit', 'swc-107-reentrancy');
    await oracle.registerClass('smart-contract-audit', 'oracle-manipulation');

    await hunt.setTotalHunters(3);
    await hunt.setClassRep(0, reentrancy, 1, 2, 10, 3, 4, 5, 6);
    await hunt.setClassRep(0, oracleManipulation, 2, 3, 20, 4, 5, 6, 7);
    await hunt.setClassRep(1, reentrancy, 3, 4, 30, 5, 6, 7, 8);
    await hunt.setClassRep(1, ignored, 99, 99, 99, 99, 99, 99, 99);

    const total = await oracle.aggregateDomain(smartContracts);
    assert.equal(total.totalWins, 6n);
    assert.equal(total.totalSubmissions, 9n);
    assert.equal(total.totalEarnedWei, 60n);
    assert.equal(total.hunterCount, 2n);
  });

  it('transferAdmin rotates the admin and old admin loses access', async () => {
    const { admin, nextAdmin, oracle } = await fixture();

    await oracle.transferAdmin(nextAdmin.address);
    assert.equal(
      (await oracle.admin()).toLowerCase(),
      nextAdmin.address.toLowerCase(),
    );

    await assert.rejects(
      oracle.registerDomain('smart-contract-audit'),
      /not admin/,
    );
    await oracle
      .connect(nextAdmin)
      .registerDomain('smart-contract-audit');

    const smartContracts = id(
      (await network.getOrCreate()).ethers,
      'smart-contract-audit',
    );
    assert.deepEqual(Array.from(await oracle.getDomains()), [smartContracts]);
    assert.notEqual(
      (await oracle.admin()).toLowerCase(),
      admin.address.toLowerCase(),
    );
  });
});
