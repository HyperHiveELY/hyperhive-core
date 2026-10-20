// SPDX-License-Identifier: MIT
pragma solidity 0.8.39;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract Governance is TimelockController {
    constructor(address[] memory proposers,address[] memory executors) TimelockController(48 hours,proposers,executors,address(0)) {}
}

contract HHIV is ERC20 {
    constructor(address recipient,uint256 supply) ERC20("HyperHive","HHIV") {require(recipient!=address(0)&&supply>0);_mint(recipient,supply);}
    /// @notice Permanently reduce the caller’s HHIV balance and total supply.
    function burn(uint256 amount) external {_burn(msg.sender,amount);}
}
contract MeasurementRegistry is Ownable2Step {
    uint256 public constant DELAY=48 hours;
    mapping(bytes32=>uint256) public proposedAt;
    mapping(bytes32=>bool) public active;
    mapping(address=>bytes32) public posterMeasurement;
    mapping(address=>bytes32) public posterQuote;
    address public immutable guardian;
    event Proposed(bytes32 indexed measurement,uint256 activateAt);
    event Activated(bytes32 indexed measurement);
    event Retired(bytes32 indexed measurement);
    event PosterSet(address indexed poster,bytes32 indexed measurement,bytes32 quoteHash);
    constructor(address admin,address guardian_) Ownable(admin){require(guardian_!=address(0));guardian=guardian_;}
    /// @notice Start the measurement activation delay.
    function propose(bytes32 m) external onlyOwner {require(m!=bytes32(0));proposedAt[m]=block.timestamp+DELAY;emit Proposed(m,proposedAt[m]);}
    /// @notice Activate a proposed measurement after its delay.
    function activate(bytes32 m) external {require(proposedAt[m]!=0&&block.timestamp>=proposedAt[m]);delete proposedAt[m];active[m]=true;emit Activated(m);}
    /// @notice Disable the measurement and cancel any pending activation.
    function retire(bytes32 m) external {require(msg.sender==guardian||msg.sender==owner());active[m]=false;delete proposedAt[m];emit Retired(m);}
    // The admin must be an external 48-hour TimelockController. Quote verification is off-chain.
    /// @notice Bind a signer to its approved measurement and reviewed quote.
    function setPoster(address p,bytes32 m,bytes32 q) external onlyOwner {require(p!=address(0)&&active[m]&&q!=bytes32(0));posterMeasurement[p]=m;posterQuote[p]=q;emit PosterSet(p,m,q);}
    /// @notice Return whether a poster’s bound measurement is active.
    function approved(address p) external view returns(bool){return active[posterMeasurement[p]];}
}
contract SlipRoot is Ownable2Step {
    MeasurementRegistry public immutable registry;
    address public auditor;
    struct CrewRegistration {bytes32 id; address account; uint64 registeredAt;}
    CrewRegistration[] public crewRoster;
    mapping(bytes32 => address) public crewAccount;
    mapping(address => bool) private registeredAccount;
    event CrewRegistered(bytes32 indexed id, address indexed account, uint64 registeredAt);

    /// @notice Permanently enroll an account before its first managed entry.
    function registerCrew(bytes32 id, address account) external {
        require(registry.approved(msg.sender) && id != bytes32(0) && account != address(0));
        require(crewAccount[id] == address(0) && !registeredAccount[account]);
        crewAccount[id] = account;
        registeredAccount[account] = true;
        crewRoster.push(CrewRegistration(id, account, uint64(block.timestamp)));
        emit CrewRegistered(id, account, uint64(block.timestamp));
    }
    /// @notice Return the length of the permanent chronological account roster.
    function crewCount() external view returns (uint256) {return crewRoster.length;}
    struct Root {bytes32 digest;bytes32 previous;uint32 count;uint64 postedAt;address poster;}
    mapping(uint64=>Root) public slips;
    mapping(uint64=>bytes32) public matches;
    bytes32 public lastRoot;
    uint64 public lastHour;
    event SlipRootPosted(uint64 indexed hour,bytes32 root,uint32 count,bytes32 previous,address poster);
    event MatchRootFinalized(uint64 indexed hour,bytes32 root,uint32 broken,uint32 venue);
    constructor(address admin,MeasurementRegistry registry_) Ownable(admin){registry=registry_;}
    event AuditorSet(address indexed auditor);
    /// @notice Wire the one-time match-root finalization authority.
    function setAuditor(address a) external onlyOwner {require(auditor==address(0)&&a!=address(0));auditor=a;emit AuditorSet(a);}
    /// @notice Append a completed hour to the root chain.
    function postSlipRoot(uint64 hour,bytes32 root,uint32 count,bytes32 previous) external {
        require(registry.approved(msg.sender)&&hour>lastHour&&hour<block.timestamp/1 hours&&previous==lastRoot);
        require(slips[hour].postedAt==0);slips[hour]=Root(root,previous,count,uint64(block.timestamp),msg.sender);lastRoot=root;lastHour=hour;
        emit SlipRootPosted(hour,root,count,previous,msg.sender);
    }
    /// @notice Record the nonzero consensus root for an hour exactly once.
    function setMatchRoot(uint64 hour,bytes32 root,uint32 broken,uint32 venue) external {require(msg.sender==auditor&&matches[hour]==bytes32(0)&&root!=bytes32(0));matches[hour]=root;emit MatchRootFinalized(hour,root,broken,venue);}
    /// @notice Check membership in an anchored hourly slip tree.
    function verifySlip(uint64 hour,bytes32 leaf,bytes32[] calldata proof) external view returns(bool){return slips[hour].postedAt!=0&&MerkleProof.verifyCalldata(proof,slips[hour].digest,leaf);}
    /// @notice Check membership in a finalized hourly match tree.
    function verifyMatch(uint64 hour,bytes32 leaf,bytes32[] calldata proof) external view returns(bool){return matches[hour]!=bytes32(0)&&MerkleProof.verifyCalldata(proof,matches[hour],leaf);}
}
contract AuditorStake is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    IERC20 public immutable rewardToken;
    SlipRoot public immutable roots;
    uint256 public immutable minimum;
    struct Auditor {uint256 stake;uint256 requested;uint256 unlockAt;uint256 lockedUntil;uint8 strikes;bool listed;}
    mapping(address=>Auditor) public auditors;
    mapping(address=>uint256) public pendingRounds;
    mapping(address=>uint256) public eligibleSince;
    uint256 public constant OPEN_FROM = 10 minutes;
    uint256 public constant OPEN_UNTIL = 20 minutes;
    address[] public operators;
    struct Round {uint64 hour;uint64 commitEnd;uint64 revealEnd;uint256 total;bool finalized;}
    mapping(uint64=>Round) public rounds;
    mapping(uint64=>mapping(address=>uint256)) public weight;
    mapping(uint64=>mapping(address=>bytes32)) public commitments;
    mapping(uint64=>mapping(address=>bytes32)) public votes;
    mapping(uint64=>mapping(bytes32=>uint256)) public tally;
    mapping(uint64=>mapping(bytes32=>uint256)) public voters;
    struct Result {bytes32 root;uint32 broken;uint32 venue;}
    mapping(bytes32=>Result) public results;
    uint256 public rewardLiability;
    bool public halted;
    mapping(address=>uint256) public earned;
    event Staked(address indexed operator,uint256 amount);
    event Slashed(address indexed operator,uint256 amount);
    event Finalized(uint64 indexed hour,bytes32 root,bool consensus);
    event RewardClaimed(address indexed operator,uint256 amount);
    constructor(IERC20 token_,SlipRoot roots_,uint256 minimum_,IERC20 rewardToken_){require(minimum_>0&&address(token_)!=address(rewardToken_));token=token_;roots=roots_;minimum=minimum_;rewardToken=rewardToken_;}
    event RoundsHalted(bool halted);
    /// @notice Suspend new voting rounds and slashing during finalization.
    function haltRounds() external {MeasurementRegistry r=roots.registry();require(msg.sender==r.guardian()||msg.sender==r.owner());halted=true;emit RoundsHalted(true);}
    /// @notice Resume round creation and slashing by governance.
    function resumeRounds() external {require(msg.sender==roots.registry().owner());halted=false;emit RoundsHalted(false);}
    /// @notice Deposit HHIV as an auditor bond and list newly eligible operators.
    function stake(uint256 amount) external nonReentrant {require(amount>0);Auditor storage a=auditors[msg.sender];require(a.strikes<3);token.safeTransferFrom(msg.sender,address(this),amount);if(a.stake<minimum && a.stake+amount>=minimum)eligibleSince[msg.sender]=block.timestamp;a.stake+=amount;if(!a.listed){require(a.stake>=minimum);_listOperator(msg.sender);a.listed=true;}emit Staked(msg.sender,amount);}
    // Reuse inactive slots only after every snapshotted round has settled.
    // Balances and earned rewards remain withdrawable after delisting.
    function _listOperator(address operator) internal {
        for(uint256 i;i<operators.length;i++){
            address prior=operators[i];Auditor storage old=auditors[prior];
            if(pendingRounds[prior]==0&&(old.stake<minimum||old.strikes>=3)){
                old.listed=false;operators[i]=operator;return;
            }
        }
        require(operators.length<32);operators.push(operator);
    }
    /// @notice Start the seven-day withdrawal delay and suspend new round eligibility.
    function requestUnstake(uint256 amount) external {Auditor storage a=auditors[msg.sender];require(amount>0&&amount<=a.stake);a.requested=amount;a.unlockAt=block.timestamp+7 days;}
    /// @notice Withdraw matured available stake after pending rounds finalize.
    function withdrawUnstaked() external nonReentrant {Auditor storage a=auditors[msg.sender];require(a.requested>0&&block.timestamp>=a.unlockAt&&pendingRounds[msg.sender]==0);uint256 amount=a.requested>a.stake?a.stake:a.requested;a.requested=0;a.stake-=amount;eligibleSince[msg.sender]=block.timestamp;token.safeTransfer(msg.sender,amount);}
    /// @notice Snapshot eligible auditors in the ten-minute opening window.
    function openRound(uint64 hour) external {uint256 end=(uint256(hour)+1)*1 hours;require(!halted&&rounds[hour].commitEnd==0&&block.timestamp>=end+OPEN_FROM&&block.timestamp<end+OPEN_UNTIL);(,,,uint64 postedAt,)=roots.slips(hour);require(postedAt!=0);Round storage r=rounds[hour];r.hour=hour;r.commitEnd=uint64(block.timestamp+5 minutes);r.revealEnd=r.commitEnd+30 minutes;
        uint256 n;for(uint256 i;i<operators.length;i++){address p=operators[i];Auditor storage a=auditors[p];if(a.stake>=minimum&&eligibleSince[p]<=uint256(hour)*1 hours&&a.requested==0&&a.strikes<3){weight[hour][p]=a.stake;r.total+=a.stake;n++;pendingRounds[p]++;a.lockedUntil=r.revealEnd+1 days;}}require(n>=2);
    }
    /// @notice Submit one commitment during the commit phase.
    function commit(uint64 hour,bytes32 c) external {Round storage r=rounds[hour];require(block.timestamp<r.commitEnd&&weight[hour][msg.sender]>0&&commitments[hour][msg.sender]==bytes32(0)&&c!=bytes32(0));commitments[hour][msg.sender]=c;}
    /// @notice Reveal the operator-bound commitment during the reveal phase.
    function reveal(uint64 hour,bytes32 root,uint32 broken,uint32 venue,bytes32 salt) external {Round storage r=rounds[hour];require(block.timestamp>=r.commitEnd&&block.timestamp<r.revealEnd&&votes[hour][msg.sender]==bytes32(0)&&root!=bytes32(0));require(commitments[hour][msg.sender]==keccak256(abi.encode(root,broken,venue,salt,msg.sender,hour,block.chainid)));bytes32 vote=keccak256(abi.encode(root,broken,venue));results[vote]=Result(root,broken,venue);votes[hour][msg.sender]=vote;tally[hour][vote]+=weight[hour][msg.sender];voters[hour][vote]++;}
    /// @notice Find the winning tuple or finalize after the no-consensus grace period.
    function finalizeHour(uint64 hour) external {Round storage r=rounds[hour];for(uint256 i;i<operators.length;i++){bytes32 v=votes[hour][operators[i]];if(tally[hour][v]>r.total/2&&voters[hour][v]>=2){Result memory result=results[v];finalize(hour,result.root,result.broken,result.venue);return;}}finalize(hour,bytes32(0),0,0);}
    /// @notice Settle slashes and reward liabilities for one completed round.
    function finalize(uint64 hour,bytes32 root,uint32 broken,uint32 venue) public nonReentrant {Round storage r=rounds[hour];require(r.revealEnd!=0&&block.timestamp>=r.revealEnd&&!r.finalized);bytes32 winner=keccak256(abi.encode(root,broken,venue));bool consensus=tally[hour][winner]>r.total/2&&voters[hour][winner]>=2;
        // No-consensus finalization only after a grace period; cannot pre-empt a valid vote tuple.
        if(!consensus){require(block.timestamp>=r.revealEnd+1 hours);for(uint256 i;i<operators.length;i++){bytes32 v=votes[hour][operators[i]];require(v==bytes32(0)||tally[hour][v]<=r.total/2||voters[hour][v]<2);}}
        r.finalized=true;uint256 available=consensus?rewardToken.balanceOf(address(this))-rewardLiability:0;
        for(uint256 i;i<operators.length;i++){address p=operators[i];if(weight[hour][p]==0)continue;pendingRounds[p]--;bool absent=votes[hour][p]==bytes32(0);if(!halted&&(absent||(consensus&&votes[hour][p]!=winner))){Auditor storage a=auditors[p];uint256 slash=weight[hour][p]/10;if(slash>a.stake)slash=a.stake;a.stake-=slash;if(a.strikes<3)a.strikes++;token.safeTransfer(address(0xdead),slash);emit Slashed(p,slash);}
            if(consensus&&votes[hour][p]==winner){uint256 reward=available*weight[hour][p]/tally[hour][winner];earned[p]+=reward;rewardLiability+=reward;}}
        if(consensus)roots.setMatchRoot(hour,root,broken,venue);emit Finalized(hour,root,consensus);
    }
    /// @notice Withdraw the caller’s accrued reward tokens.
    function claimRewards() external nonReentrant {uint256 amount=earned[msg.sender];require(amount>0);earned[msg.sender]=0;rewardLiability-=amount;rewardToken.safeTransfer(msg.sender,amount);emit RewardClaimed(msg.sender,amount);}
}
contract FeeSplitter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable workers;
    address public immutable treasury;
    address public immutable auditors;
    address public immutable burnVault;
    mapping(uint8=>uint256) public prices;
    mapping(bytes32=>uint256) public expiresAt;
    mapping(bytes32=>uint8) public planOf;
    event PlanPaid(bytes32 indexed crewId,address indexed payer,uint8 plan,uint8 months,uint256 amount);
    event Distributed(uint256 workers,uint256 treasury,uint256 auditors,uint256 burn);
    constructor(IERC20 usdc,address workers_,address treasury_,address auditors_,address burnVault_){require(workers_!=address(0)&&treasury_!=address(0)&&auditors_!=address(0)&&burnVault_!=address(0));token=usdc;workers=workers_;treasury=treasury_;auditors=auditors_;burnVault=burnVault_;prices[1]=29e6;prices[2]=79e6;}
    /// @notice Pay the immutable legacy plan price and split receipts.
    function payPlan(bytes32 crewId,uint8 plan,uint8 months_) external nonReentrant {require(crewId!=bytes32(0)&&prices[plan]>0&&months_>0&&months_<=12);require(expiresAt[crewId]<block.timestamp||planOf[crewId]==plan);uint256 amount=prices[plan]*months_;token.safeTransferFrom(msg.sender,address(this),amount);expiresAt[crewId]=(expiresAt[crewId]>block.timestamp?expiresAt[crewId]:block.timestamp)+uint256(months_)*30 days;planOf[crewId]=plan;emit PlanPaid(crewId,msg.sender,plan,months_,amount);_distribute();}
    /// @notice Distribute the complete payment-token balance to the four recipients.
    function distribute() external nonReentrant {_distribute();}
    function _distribute() internal {uint256 amount=token.balanceOf(address(this));if(amount==0)return;uint256 w=amount*8000/10000;uint256 a=amount*500/10000;uint256 b=amount*500/10000;uint256 t=amount-w-a-b;token.safeTransfer(workers,w);token.safeTransfer(treasury,t);token.safeTransfer(auditors,a);token.safeTransfer(burnVault,b);emit Distributed(w,t,a,b);}
}
contract BuyBurn is Ownable2Step,ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable usdc;
    IERC20 public immutable hhiv;
    mapping(address=>bool) public routers;
    event Burned(uint256 spent,uint256 tokens,bytes32 routeHash);
    constructor(address admin,IERC20 usdc_,IERC20 hhiv_) Ownable(admin){usdc=usdc_;hhiv=hhiv_;}
    event RouterSet(address indexed router,bool enabled);
    /// @notice Set governance approval for a deployed routing contract.
    function setRouter(address router,bool enabled) external onlyOwner {require(router.code.length>0);routers[router]=enabled;emit RouterSet(router,enabled);}
    /// @notice Trade the authorized amount and send received HHIV to the burn address.
    // The balance delta is intentional: HHIV is the immutable fixed-supply ERC20.
    // Both the caller and router are governance-controlled. The sole swap entry
    // is nonReentrant; an allowance is scoped to one call and reset before payout.
    // slither-disable-next-line reentrancy-balance
    function execute(address router,uint256 amount,uint256 minimumOut,bytes calldata data) external onlyOwner nonReentrant {require(routers[router]&&amount>0&&minimumOut>0);uint256 before_=hhiv.balanceOf(address(this));usdc.forceApprove(router,amount);(bool ok,)=router.call(data);require(ok);usdc.forceApprove(router,0);uint256 received=hhiv.balanceOf(address(this))-before_;require(received>=minimumOut);hhiv.safeTransfer(address(0xdead),received);emit Burned(amount,received,keccak256(data));}
}
