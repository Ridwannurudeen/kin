# Hunt Reputation Oracle

`HuntReputationOracle` is Layer 4 of the Hunt protocol infrastructure build: a
read-only contract that exposes Hunt's per-class hunter reputation through a
stable interface for dashboards, partner programs, bridges, and risk consumers.

It is separate from `contracts/Hunt.sol` on purpose. Hunt v1 handles escrow,
race timing, finding submission, settlement, and the canonical
`ClassRep[hunterId][class]` ledger. The Oracle does not mutate that state. It
wraps the deployed Hunt address, stores a domain/class registry, and exposes
read patterns that are safer for consumers than introspecting the full bounty
contract.

## Address

Deployment artifact: `deployments/HuntReputationOracle.json`

```text
HuntReputationOracle: 0xdf2f9587D5746cd1358d40804bE7885BDaaE45d2
Hunt: 0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C
Chain: 0G Aristotle, chainId 16661
```

Chainscan: https://chainscan.0g.ai/address/0xdf2f9587D5746cd1358d40804bE7885BDaaE45d2

## Interface

```solidity
function HUNT() external view returns (address);
function admin() external view returns (address);

function registerDomain(string memory name) external;
function registerClass(string memory domain, string memory classNameStr) external;

function getDomains() external view returns (bytes32[] memory);
function getClasses(bytes32 domain) external view returns (bytes32[] memory);
function getReputationByClass(uint256 hunterId, bytes32 classBytes32)
    external view returns (IHunt.ClassRep memory);
function aggregateDomain(bytes32 domain) external view returns (AggregateView memory);
function transferAdmin(address newAdmin) external;
```

`registerDomain` stores `keccak256(bytes(name))`. `registerClass` stores
`keccak256(bytes(classNameStr))` and dedupes repeated registration attempts.

`AggregateView` contains:

```solidity
struct AggregateView {
    uint256 totalWins;
    uint256 totalSubmissions;
    uint256 totalEarnedWei;
    uint256 hunterCount;
}
```

`hunterCount` counts hunters with at least one win in the queried domain.

## Solidity consumer

```solidity
interface IHuntReputationOracle {
    struct ClassRep {
        uint32 wins;
        uint32 submissions;
        uint256 totalEarnedWei;
        uint64 sumSeverityCalibration;
        uint64 sumPrecision;
        uint64 sumCoverage;
        uint64 sumExploitability;
    }

    struct AggregateView {
        uint256 totalWins;
        uint256 totalSubmissions;
        uint256 totalEarnedWei;
        uint256 hunterCount;
    }

    function getReputationByClass(uint256 hunterId, bytes32 classBytes32)
        external
        view
        returns (ClassRep memory);

    function aggregateDomain(bytes32 domain)
        external
        view
        returns (AggregateView memory);
}

bytes32 constant ORACLE_MANIPULATION = keccak256(bytes("oracle-manipulation"));
bytes32 constant SMART_CONTRACT_AUDIT = keccak256(bytes("smart-contract-audit"));

function readHunter(address oracle, uint256 hunterId)
    external
    view
    returns (IHuntReputationOracle.ClassRep memory)
{
    return IHuntReputationOracle(oracle).getReputationByClass(
        hunterId,
        ORACLE_MANIPULATION
    );
}
```

## ethers TypeScript

```ts
import { ethers } from "ethers";
import oracleJson from "./deployments/HuntReputationOracle.json" assert { type: "json" };

const provider = new ethers.JsonRpcProvider("https://evmrpc.0g.ai");
const oracle = new ethers.Contract(
  oracleJson.address,
  oracleJson.abi,
  provider,
);

const classId = ethers.keccak256(ethers.toUtf8Bytes("oracle-manipulation"));
const rep = await oracle.getReputationByClass(1n, classId);

const domain = ethers.keccak256(ethers.toUtf8Bytes("smart-contract-audit"));
const aggregate = await oracle.aggregateDomain(domain);
```

## web3.py

```python
from eth_utils import keccak
from web3 import Web3
import json

w3 = Web3(Web3.HTTPProvider("https://evmrpc.0g.ai"))
artifact = json.load(open("deployments/HuntReputationOracle.json"))
oracle = w3.eth.contract(address=artifact["address"], abi=artifact["abi"])

class_id = keccak(text="oracle-manipulation")
rep = oracle.functions.getReputationByClass(1, class_id).call()

domain = keccak(text="smart-contract-audit")
aggregate = oracle.functions.aggregateDomain(domain).call()
```

## Registering a new domain

In v1, domain registration is admin-only. The deploy script registers four
domains:

```text
smart-contract-audit
insurance-claim-denial-defense
benefits-defense
medical-records-reader
```

New domains are added by calling:

```solidity
registerDomain("new-domain-name");
registerClass("new-domain-name", "canonical-class-a");
registerClass("new-domain-name", "canonical-class-b");
```

v2 should move this registry to DAO or partner-governed administration once
multiple Hunt instances exist.

## Bridge pattern

A bridge does not need to know how bounty settlement works. It can read:

```text
getDomains()
getClasses(domainId)
getReputationByClass(hunterId, classId)
aggregateDomain(domainId)
```

Then it can publish a compact message to another chain:

```text
sourceChainId
oracleAddress
sourceBlockNumber
domainId
classId
hunterId or aggregate flag
ClassRep or AggregateView fields
```

Wormhole, LayerZero, Hyperlane, or a custom light-client bridge can all consume
the same source interface. The important constraint is that the message includes
the 0G source block so downstream consumers know which reputation snapshot they
are relying on.

## Roadmap

v2 federates reputation across multiple Hunt instances instead of a single Hunt
address. That matters for partner deployments where one program may run an
insurance-defense instance while another runs smart-contract guardian monitoring.

v3 adds staked-attestation challenges. If a hunter's finding is later falsified,
the Oracle should expose challenge-adjusted reputation so risk consumers do not
price stale or adversarially inflated scores.

For the 0G APAC submission, the Oracle makes the grand-prize thesis concrete:
Hunt is not only an app that uses 0G; it is becoming a protocol layer other 0G
applications can query.
