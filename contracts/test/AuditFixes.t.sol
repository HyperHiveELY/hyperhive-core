// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;
import {HIVE,MeasurementRegistry,SlipRoot,AuditorStake,BuyBurn} from "../src/HyperHive.sol";
import {Clock,OperatorFixture,RouterFixture} from "./Accounting.t.sol";

contract AuditFixesTest {
    Clock private constant clock=Clock(address(uint160(uint256(keccak256("hevm cheat code")))));
    HIVE private bond;
    HIVE private reward;
    MeasurementRegistry private registry;
    SlipRoot private roots;
    AuditorStake private pool;
    OperatorFixture[3] private ops;
    bytes32 private constant SALT=bytes32(uint256(7));

    function setUp() public {
        clock.warp(1_000_000);
        bond=new HIVE(address(this),1e24);reward=new HIVE(address(this),1e24);
        registry=new MeasurementRegistry(address(this),address(this));
        roots=new SlipRoot(address(this),registry);
        pool=new AuditorStake(bond,roots,100,reward);
        roots.setAuditor(address(pool));
        bytes32 m=keccak256("measurement");
        registry.propose(m);clock.warp(block.timestamp+48 hours);registry.activate(m);registry.setPoster(address(this),m,m);
        for(uint256 i;i<3;i++){ops[i]=new OperatorFixture(bond,pool);bond.transfer(address(ops[i]),1000);ops[i].deposit(1000);}
    }

    function _post(uint64 hour,bytes32 root) private {roots.postSlipRoot(hour,root,0,roots.lastRoot());}

    /// Opens a round for the next hour with all three auditors and returns it.
    function _round(bytes32 root) private returns(uint64 hour){
        hour=uint64(block.timestamp/1 hours+1);
        clock.warp((uint256(hour)+1)*1 hours+10 minutes);
        uint64 last=roots.lastHour();
        for(uint64 h=last==0?hour:last+1;h<=hour;h++)_post(h,h==hour?root:bytes32(0));
        pool.openRound(hour);
    }
    function _vote(uint64 hour,uint256 who,bytes32 root) private {
        address op=address(ops[who]);
        ops[who].commit(hour,keccak256(abi.encode(root,uint32(0),uint32(0),SALT,op,hour,block.chainid)));
    }
    function _stake(uint256 who) private view returns(uint256 amount,uint8 strikes){(amount,,,,strikes,)=pool.auditors(address(ops[who]));}

    function testSkippedHourCannotBePosted() public {
        uint64 hour=uint64(block.timestamp/1 hours)-5;
        _post(hour,keccak256("a"));
        (bool skipped,)=address(roots).call(abi.encodeCall(SlipRoot.postSlipRoot,(hour+2,keccak256("c"),0,roots.lastRoot())));
        require(!skipped,"skipped hour accepted");
        _post(hour+1,bytes32(0));
        _post(hour+2,keccak256("c"));
        require(roots.lastHour()==hour+2,"chain");
    }

    function testNoConsensusSlashesNobody() public {
        bytes32 root=keccak256("root");
        uint64 hour=_round(root);
        // Two auditors disagree and one is absent: no tuple holds a majority.
        _vote(hour,0,root);_vote(hour,1,keccak256("other"));
        clock.warp(block.timestamp+5 minutes);
        ops[0].reveal(hour,root,SALT);ops[1].reveal(hour,keccak256("other"),SALT);
        clock.warp(block.timestamp+30 minutes+1 hours);
        pool.finalizeHour(hour);
        for(uint256 i;i<3;i++){(uint256 amount,uint8 strikes)=_stake(i);require(amount==1000&&strikes==0,"slashed without consensus");}
        require(roots.matches(hour)==bytes32(0),"no match root");
    }

    function testConsensusStillSlashesAbsentAndMinority() public {
        bytes32 root=keccak256("root");
        uint64 hour=_round(root);
        _vote(hour,0,root);_vote(hour,1,root);
        clock.warp(block.timestamp+5 minutes);
        ops[0].reveal(hour,root,SALT);ops[1].reveal(hour,root,SALT);
        clock.warp(block.timestamp+30 minutes);
        pool.finalizeHour(hour);
        (uint256 amount,uint8 strikes)=_stake(2);
        require(amount==900&&strikes==1,"absent auditor kept stake");
    }

    function testRoundPaysOnlyAFractionOfRewards() public {
        reward.transfer(address(pool),168_000);
        bytes32 root=keccak256("root");
        uint64 hour=_round(root);
        for(uint256 i;i<3;i++)_vote(hour,i,root);
        clock.warp(block.timestamp+5 minutes);
        for(uint256 i;i<3;i++)ops[i].reveal(hour,root,SALT);
        clock.warp(block.timestamp+30 minutes);
        pool.finalizeHour(hour);
        require(pool.rewardLiability()==999,"round paid more than 1/168");
        require(pool.earned(address(ops[0]))==333,"pro-rata share");
    }

    function testBuyBurnRejectsExecutionAfterDeadline() public {
        HIVE usd=new HIVE(address(this),1e24);
        BuyBurn burner=new BuyBurn(address(this),usd,bond);
        RouterFixture router=new RouterFixture(usd,bond);
        burner.setRouter(address(router),true);
        bond.transfer(address(router),1e6);usd.transfer(address(burner),1000);
        bytes memory trade=abi.encodeCall(router.trade,(500));
        uint256 deadline=block.timestamp+1 hours;
        clock.warp(deadline+1);
        (bool late,)=address(burner).call(abi.encodeCall(BuyBurn.execute,(address(router),500,500,deadline,trade)));
        require(!late,"stale execution accepted");
        burner.execute(address(router),500,500,block.timestamp,trade);
        require(bond.balanceOf(address(0xdead))==500,"burned");
    }
}
