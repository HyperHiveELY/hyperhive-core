// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;

import {HIVE,MeasurementRegistry,SlipRoot,AuditorStake,BuyBurn,FeeSplitter} from "../src/HyperHive.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface Clock {function warp(uint256 timestamp) external;}

contract OperatorFixture {
    AuditorStake immutable stake;
    constructor(HIVE token, AuditorStake pool) {stake=pool;token.approve(address(pool),type(uint256).max);}
    function deposit(uint256 amount) external {stake.stake(amount);}
    function request(uint256 amount) external {stake.requestUnstake(amount);}
    function withdraw() external {stake.withdrawUnstaked();}
    function claim() external {stake.claimRewards();}
    function commit(uint64 h, bytes32 value) external {stake.commit(h,value);}
    function reveal(uint64 h, bytes32 root, bytes32 salt) external {stake.reveal(h,root,0,0,salt);}
}

contract RouterFixture {
    IERC20 immutable input;
    IERC20 immutable output;
    constructor(IERC20 payment, IERC20 token){input=payment;output=token;}
    function trade(uint256 amount) external {require(input.transferFrom(msg.sender,address(this),amount));require(output.transfer(msg.sender,amount));}
}

contract AccountingHandler {
    Clock private constant clock=Clock(address(uint160(uint256(keccak256("hevm cheat code")))));
    HIVE public immutable bond;
    HIVE public immutable usd;
    AuditorStake public immutable pool;
    BuyBurn public immutable burner;
    FeeSplitter public immutable splitter;
    RouterFixture public immutable router;
    SlipRoot private immutable roots;
    OperatorFixture[3] public operators;
    address private constant workers=address(0x1234);
    address private constant treasury=address(0x5678);
    uint256 public constant SUPPLY=1e24;

    constructor(){
        bond=new HIVE(address(this),SUPPLY);
        usd=new HIVE(address(this),SUPPLY);
        MeasurementRegistry registry=new MeasurementRegistry(address(this),address(this));
        roots=new SlipRoot(address(this),registry);
        pool=new AuditorStake(bond,roots,100,usd);
        roots.setAuditor(address(pool));
        bytes32 measurement=keccak256("fixture");
        registry.propose(measurement);
        clock.warp(block.timestamp+48 hours);
        registry.activate(measurement);registry.setPoster(address(this),measurement,measurement);
        burner=new BuyBurn(address(this),usd,bond);
        router=new RouterFixture(usd,bond);burner.setRouter(address(router),true);bond.transfer(address(router),SUPPLY/2);
        splitter=new FeeSplitter(usd,workers,treasury,address(pool),address(burner));
        usd.approve(address(splitter),type(uint256).max);
        for(uint256 i;i<3;i++){
            operators[i]=new OperatorFixture(bond,pool);
            bond.transfer(address(operators[i]),1e15);
            operators[i].deposit(1000);
        }
    }

    function stakeOrExit(uint8 who,uint128 seed,uint8 action) external {
        OperatorFixture actor=operators[who%3];
        (uint256 staked,uint256 requested,uint256 unlock,,uint8 strikes,)=pool.auditors(address(actor));
        uint256 balance=bond.balanceOf(address(actor));
        if(action%3==0 && strikes<3 && balance>=100){
            actor.deposit(100+uint256(seed)%(balance-99));
        }else if(action%3==1 && staked!=0){
            actor.request(1+uint256(seed)%staked);
        }else if(requested!=0 && pool.pendingRounds(address(actor))==0){
            if(block.timestamp<unlock)clock.warp(unlock);
            actor.withdraw();
        }
    }

    function paymentAndBurn(uint8 plan,uint8 months_,uint64 key,uint64 seed) external {
        uint8 selected=1+plan%2;
        // Each plan has its own key so renewal always has the existing plan.
        bytes32 id=keccak256(abi.encode(key,selected));
        splitter.payPlan(id,selected,1+months_%12);
        uint256 budget=usd.balanceOf(address(burner));
        if(budget!=0){
            uint256 amount=1+uint256(seed)%budget;
            burner.execute(address(router),amount,amount,block.timestamp,abi.encodeCall(router.trade,(amount)));
        }
    }

    function round(uint8 participants) external {
        uint64 hour=uint64(block.timestamp / 1 hours+1);
        clock.warp((uint256(hour)+1)*1 hours+10 minutes);
        bytes32 root=keccak256(abi.encode(hour));
        // Hours are consecutive: post every hour since the last one, empty except the audited hour.
        uint64 last=roots.lastHour();
        for(uint64 h=last==0?hour:last+1;h<=hour;h++)roots.postSlipRoot(h,h==hour?root:bytes32(0),0,roots.lastRoot());
        uint256 eligible;
        for(uint256 i;i<3;i++){
            address op=address(operators[i]);
            (uint256 amount,uint256 req,,,uint8 strikes,)=pool.auditors(op);
            if(amount>=100 && req==0 && strikes<3)eligible++;
        }
        if(eligible<2)return;
        pool.openRound(hour);
        bytes32 salt=bytes32(uint256(123));
        for(uint256 i;i<3;i++){
            address op=address(operators[i]);
            if(pool.weight(hour,op)>0 && ((participants>>i)&1)==1){
                operators[i].commit(hour,keccak256(abi.encode(root,uint32(0),uint32(0),salt,op,hour,block.chainid)));
            }
        }
        clock.warp(block.timestamp+5 minutes);
        for(uint256 i;i<3;i++)if(pool.commitments(hour,address(operators[i]))!=0)operators[i].reveal(hour,root,salt);
        clock.warp(block.timestamp+91 minutes);
        pool.finalizeHour(hour);
    }
    function claim(uint8 who) external {
        OperatorFixture op=operators[who%3];
        if(pool.earned(address(op))!=0)op.claim();
    }

    function check() external view {
        uint256 stakes;uint256 earned;
        uint256 rewards=usd.balanceOf(address(pool));
        uint256 accountedBond=bond.balanceOf(address(this))+bond.balanceOf(address(router))+bond.balanceOf(address(0xdead));
        uint256 accountedUsd=usd.balanceOf(address(this))+usd.balanceOf(workers)+usd.balanceOf(treasury)+usd.balanceOf(address(router))+usd.balanceOf(address(burner))+rewards;
        for(uint256 i;i<3;i++){
            address op=address(operators[i]);(uint256 amount,,,,,)=pool.auditors(op);
            stakes+=amount;earned+=pool.earned(op);
            accountedBond+=bond.balanceOf(op);accountedUsd+=usd.balanceOf(op);
        }
        require(bond.balanceOf(address(pool))==stakes && stakes+accountedBond==SUPPLY,"bond conservation");
        require(earned==pool.rewardLiability() && earned<=rewards,"reward solvency");
        require(usd.balanceOf(address(splitter))==0 && accountedUsd==SUPPLY,"payment conservation");
        require(usd.allowance(address(burner),address(router))==0 && bond.balanceOf(address(burner))==0,"burn custody");
        require(usd.totalSupply()==SUPPLY && bond.totalSupply()==SUPPLY,"supply");
    }
}

contract AccountingInvariantTest {
    AccountingHandler private handler;
    function setUp() public {handler=new AccountingHandler();}
    function targetContracts() external view returns(address[] memory targets){targets=new address[](1);targets[0]=address(handler);}

    function invariant_accounting() external view {handler.check();}
}
