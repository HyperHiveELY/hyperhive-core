// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;
import {Governance, HIVE, MeasurementRegistry, SlipRoot, AuditorStake, FeeSplitter} from "../src/HyperHive.sol";
import {Clock} from "./Accounting.t.sol";

contract RegistryLifecycleTest {
    Clock private constant clock = Clock(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testRosterAndMembershipProofLifecycle() public {
        MeasurementRegistry registry = new MeasurementRegistry(address(this), address(this));
        SlipRoot roots = new SlipRoot(address(this), registry);
        bytes32 measurement = keccak256("measurement");
        bytes32 leaf = keccak256("entry");
        registry.propose(measurement);
        clock.warp(block.timestamp + 48 hours);
        registry.activate(measurement);
        registry.setPoster(address(this), measurement, leaf);
        roots.registerCrew(leaf,address(this));
        require(roots.crewCount()==1 && roots.crewAccount(leaf)==address(this));
        (bytes32 id,address account,uint64 since)=roots.crewRoster(0);
        require(id==leaf && account==address(this) && since==block.timestamp);
        uint64 hour=uint64(block.timestamp/3600)-1;
        bytes32[] memory proof=new bytes32[](0);
        require(!roots.verifySlip(hour,leaf,proof));
        roots.postSlipRoot(hour,leaf,1,bytes32(0));
        require(roots.verifySlip(hour,leaf,proof) && !roots.verifySlip(hour,measurement,proof));
        roots.setAuditor(address(this));
        roots.setMatchRoot(hour,leaf,0,0);
        require(roots.verifyMatch(hour,leaf,proof) && !roots.verifyMatch(hour,measurement,proof));
        registry.retire(measurement);
        require(!registry.approved(address(this)));
    }

    function testHaltedExitsAndPermissionlessDistribution() public {
        HIVE payment=new HIVE(address(this),1000);
        HIVE bond=new HIVE(address(this),1000);
        MeasurementRegistry registry=new MeasurementRegistry(address(this),address(this));
        SlipRoot roots=new SlipRoot(address(this),registry);
        AuditorStake pool=new AuditorStake(bond,roots,100,payment);
        bond.approve(address(pool),200);
        pool.stake(200);
        pool.requestUnstake(200);
        pool.haltRounds();
        clock.warp(block.timestamp+7 days);
        pool.withdrawUnstaked();
        require(pool.halted() && bond.balanceOf(address(this))==1000);
        pool.resumeRounds();
        require(!pool.halted());
        bond.burn(100);
        require(bond.totalSupply()==900);
        FeeSplitter split=new FeeSplitter(payment,address(1),address(2),address(3),address(4));
        payment.transfer(address(split),101);
        split.distribute();
        require(payment.balanceOf(address(1))==80 && payment.balanceOf(address(2))==11);
        require(payment.balanceOf(address(3))==5 && payment.balanceOf(address(4))==5);
        split.distribute();
        address[] memory proposers=new address[](1);proposers[0]=address(this);
        Governance gov=new Governance(proposers,proposers);
        require(gov.getMinDelay()==48 hours);
    }
}
